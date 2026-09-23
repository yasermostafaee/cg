import { execFile } from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import {
  CONNECTION_CHECK_CONNECT_MS,
  CONNECTION_CHECK_LINE_MS,
  type ConnectionCheckId,
  type ConnectionCheckLine,
  type ConnectionCheckRequest,
  type ConnectionCheckResult,
} from '@cg/shared-ipc';
import { playoutEndpointsFor } from './playout-config.js';
import { pinnedIPv4, plainAgentFor } from './playout-http.js';

/**
 * 🔴 `DESKTOP-APPS-01` §2F — **THE CONNECTION CHECK: one line per link, pass or fail, and on a
 * failure what is wrong and what to do.**
 *
 * Written for the day it cost on 2026-09-21: a VPN client intercepting traffic with its TUN off,
 * an AMCP port silently dropped by the Playout server's firewall, and a CORS list missing the
 * console's origin — three faults that each looked like the others from the console. Each link is
 * probed on ITS OWN axis (golden rule 8): the AMCP line sends an AMCP command, the API line reads
 * the Playout's API, and neither speaks for the other.
 *
 * The probes are injected so every failure shape is testable; {@link realProbes} is what a
 * station runs. Nothing here writes anything.
 */

/**
 * How long the AMCP probe waits for a connection and for `VERSION`'s answer — the check's one
 * connect bound (`DESKTOP-APPS-01-C` C2), so the AMCP line always finishes inside its line bound.
 */
export const AMCP_PROBE_TIMEOUT_MS = CONNECTION_CHECK_CONNECT_MS;
const AMCP_PORT = 5250;

/**
 * `DESKTOP-APPS-01-B` — how long AMCP is given, after a `station-admin` signs in, to be let in by
 * the Playout: the bridge's own link retries promptly for this long, and until it has passed the
 * check's AMCP line says it is still waiting (`-01-C` C7) rather than naming the approval.
 */
export const AMCP_TRUST_WINDOW_MS = 30_000;

/**
 * The Playout page where its administrator approves this machine, in the Playout's own words —
 * wrapped in an RTL isolate (`RLI`…`PDI`), because it sits inside an English sentence and the
 * arrow between its Persian steps is a neutral the bidi algorithm would otherwise place for us.
 */
const PLAYOUT_CG_SETTINGS = '\u2067تنظیمات ← اتصال به CG Control\u2069';

/** What one AMCP probe saw — the three shapes the check tells apart, and the two edges. */
export type AmcpOutcome =
  | { kind: 'answered'; version: string }
  | { kind: 'refused' }
  | { kind: 'timeout' }
  | { kind: 'silent' }
  | { kind: 'unreachable'; code: string };

export interface HttpAnswer {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

export interface ProbeRoute {
  /** This machine's address on the route to the host. */
  readonly address: string;
  /** The interface that address belongs to, as Windows names it. */
  readonly iface: string;
}

/** A port and who holds it: this process, nobody, or another program by name. */
export type PortHolder =
  | { kind: 'self' }
  | { kind: 'free' }
  | { kind: 'other'; name: string; pid: number | null };

/** How long an HTTP probe may take to connect, and in all. */
export interface RequestBounds {
  readonly connectMs: number;
  readonly totalMs: number;
}

/**
 * Why an HTTP probe got no answer, so its line can say so in its own words (`-01-C` C2).
 * `CONNECT_TIMEOUT` — nothing answered the connection; `ECONNREFUSED` — the host answered and
 * nothing listens on the port; `TIMEOUT` — connected, and no reply in time.
 */
export class ProbeError extends Error {
  override readonly name = 'ProbeError';
  constructor(readonly code: 'CONNECT_TIMEOUT' | 'ECONNREFUSED' | 'TIMEOUT' | 'FAILED') {
    super(code);
  }
}

export interface CheckProbes {
  /** Image names of running processes (Windows `tasklist`); empty where not read. */
  processes(): Promise<readonly string[]>;
  /** The system proxy when one is ON, with its bypass list; `null` when off or not read. */
  systemProxy(): Promise<{ server: string; bypass: readonly string[] } | null>;
  route(host: string): Promise<ProbeRoute | null>;
  /** `DESKTOP-APPS-01-C` C6 — the host's one IPv4 address, or `null` when it has none. */
  ipv4(host: string): Promise<string | null>;
  amcp(host: string, port: number, timeoutMs: number): Promise<AmcpOutcome>;
  /** Rejects with a {@link ProbeError} when there is no answer to word. */
  request(
    method: 'GET' | 'OPTIONS',
    url: string,
    headers: Record<string, string>,
    bounds: RequestBounds,
  ): Promise<HttpAnswer>;
  portHolder(proto: 'tcp' | 'udp', port: number): Promise<PortHolder>;
  /** Every address this machine answers on, loopback included. */
  localAddresses(): readonly string[];
  resolve(host: string): Promise<readonly string[]>;
}

/** The station's own ports, as this process bound them. */
export interface StationPorts {
  readonly console: number | null;
  readonly control: number;
  readonly templates: number;
  readonly osc: number;
}

/** How long one line took, and what it came to — `DESKTOP-APPS-01-C` C1's instrument. */
export interface LineTiming {
  readonly id: ConnectionCheckId;
  readonly ms: number;
  readonly status: ConnectionCheckLine['status'] | 'bound';
}

export interface CheckOptions {
  readonly ports: StationPorts;
  readonly amcpTimeoutMs?: number;
  /**
   * `DESKTOP-APPS-01-B`/`-C` — when a `station-admin` last signed in to this bridge (epoch ms), or
   * `null`/absent: none yet. Until one has, a Playout 2.8.54 refuses AMCP to this machine by design,
   * so a refused or dropped AMCP line WAITS; for {@link AMCP_TRUST_WINDOW_MS} after, it still waits
   * (the Playout lets this machine in, or records it pending); after that it names the approval.
   */
  readonly amcpSignInAt?: number | null;
  /** TEST-ONLY — {@link AMCP_TRUST_WINDOW_MS} by default. */
  readonly amcpTrustWindowMs?: number;
  /** TEST-ONLY — the per-line bound, {@link CONNECTION_CHECK_LINE_MS} by default. */
  readonly lineMs?: number;
  /** TEST-ONLY — the connect bound, {@link CONNECTION_CHECK_CONNECT_MS} by default. */
  readonly connectMs?: number;
  /** TEST-ONLY — `Date.now` by default. */
  readonly now?: () => number;
  /** C1 — told, once the check is done, how long each line took and how long it took in all. */
  readonly onTimed?: (timings: readonly LineTiming[], totalMs: number) => void;
}

/** VPN and proxy clients recognisable by their process name, with the name an operator knows. */
const KNOWN_INTERCEPTORS: readonly { match: RegExp; name: string }[] = [
  { match: /^v2rayn/i, name: 'v2rayN' },
  { match: /^(v2ray|xray)(\.exe)?$/i, name: 'the v2ray/xray core' },
  { match: /^sing-box/i, name: 'sing-box' },
  { match: /^(clash|mihomo)/i, name: 'Clash' },
  { match: /^nekoray|^nekobox/i, name: 'NekoRay' },
  { match: /^hiddify/i, name: 'Hiddify' },
  { match: /^openvpn/i, name: 'OpenVPN' },
  { match: /^wireguard/i, name: 'WireGuard' },
  { match: /^psiphon/i, name: 'Psiphon' },
  { match: /^outline/i, name: 'Outline' },
  { match: /^tun2socks/i, name: 'tun2socks' },
  { match: /^(protonvpn|nordvpn|expressvpn|windscribe)/i, name: 'a VPN client' },
];

/** An interface name that belongs to a tunnel rather than a LAN card. */
const TUNNEL_IFACE =
  /tun|tap|wintun|wireguard|\bwg\d|v2ray|xray|sing-?box|clash|mihomo|neko|hiddify|openvpn|vpn|zerotier|tailscale|\bppp/i;

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^\[|\]$/g, '');
}

/** Windows proxy bypass: `;`-separated globs, and `<local>` for names with no dot. */
function bypassed(host: string, bypass: readonly string[]): boolean {
  return bypass.some((entry) => {
    const e = entry.trim().toLowerCase();
    if (e === '') return false;
    if (e === '<local>') return !host.includes('.');
    const re = new RegExp(`^${e.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return re.test(host.toLowerCase());
  });
}

/**
 * Resolve `work` within `ms`, or `fallback()` — the work goes on unobserved, and a late rejection is
 * swallowed rather than surfacing as an unhandled one.
 */
function within<T>(work: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), ms);
  });
  return Promise.race([work.catch((): T => fallback()), late]).finally(() => clearTimeout(timer));
}

/** `http://host:port/path` → the same URL on an IPv4 literal, with the typed host kept for `Host`. */
function onAddress(url: string, ip: string): { url: string; host: string; port: string } {
  const u = new URL(url);
  const port = u.port === '' ? (u.protocol === 'https:' ? '443' : '80') : u.port;
  const host = u.host;
  u.hostname = ip;
  return { url: u.href, host, port };
}

/** An HTTP probe that got no answer, in the check's words (`-01-C` C2). */
function noAnswer(err: unknown, host: string, port: string, url: string): string {
  const code = err instanceof ProbeError ? err.code : undefined;
  if (code === 'CONNECT_TIMEOUT') return `No answer from ${host} on port ${port}.`;
  if (code === 'ECONNREFUSED') return `${host} answers, but nothing listens on port ${port}.`;
  if (code === 'TIMEOUT')
    return `${host} accepted the connection on port ${port} but did not reply in time.`;
  return `The Playout did not answer at ${url}.`;
}

/**
 * 🔴 `DESKTOP-APPS-01` §2F + `-01-C` C2 — **RUN THE SEVEN CHECKS AND ALWAYS RETURN THEIR LINES.**
 *
 * Measured on the owner's machine (2026-09-23), before this: the probes ran ONE AFTER ANOTHER —
 * against a black-hole address AMCP took 3.0 s, the key set 5.0 s and CORS 5.0 s, 13.7 s in all —
 * and the console gave up at 8 s, so the operator saw `Bridge request timed out: setup.check` and no
 * line at all. Now:
 *
 *   - the lines run IN PARALLEL;
 *   - every probe connects within `connectMs`, and every LINE is done within `lineMs` — a line that
 *     is not comes back as its OWN line, in the check's words ("No answer from … on port …"),
 *     never as a timeout of the whole check;
 *   - `SETUP_CHECK_WAIT_MS` (the console's wait) is derived from the same constant.
 *
 * And (`-01-C` C6) the Playout host is resolved ONCE to an IPv4 literal, and every network probe
 * uses it — as the bridge's own reads and AMCP session do. A host with no IPv4 address is ONE
 * line, and the three probes that need an address are not run.
 *
 * Never throws: a probe that fails is a line that fails.
 */
export async function runConnectionCheck(
  req: ConnectionCheckRequest,
  probes: CheckProbes,
  options: CheckOptions,
): Promise<ConnectionCheckResult> {
  let endpoints: ReturnType<typeof playoutEndpointsFor>;
  try {
    endpoints = playoutEndpointsFor(req.playoutAddress);
  } catch {
    return {
      lines: [
        {
          id: 'api',
          status: 'fail',
          text: `${req.playoutAddress} is not a Playout address. Type it as http://host:port.`,
        },
      ],
      localAddress: null,
    };
  }
  const now = options.now ?? ((): number => Date.now());
  const started = now();
  const lineMs = options.lineMs ?? CONNECTION_CHECK_LINE_MS;
  const connectMs = options.connectMs ?? CONNECTION_CHECK_CONNECT_MS;
  const bounds: RequestBounds = { connectMs, totalMs: lineMs };
  const playoutHost = hostOf(endpoints.address);
  const casparHost = req.casparHost ?? playoutHost;

  // C6 — ONE IPv4 per host, asked once and shared by every line that needs an address.
  const playoutIp = within(probes.ipv4(playoutHost), connectMs, () => null);
  const casparIp =
    casparHost === playoutHost ? playoutIp : within(probes.ipv4(casparHost), connectMs, () => null);
  const routeTo = (ip: Promise<string | null>): Promise<ProbeRoute | null> =>
    ip.then((address) => (address === null ? null : probes.route(address).catch(() => null)));
  const playoutRoute = routeTo(playoutIp);
  const casparRoute = casparHost === playoutHost ? playoutRoute : routeTo(casparIp);

  const timings: LineTiming[] = [];
  const line = (
    id: ConnectionCheckId,
    work: () => Promise<ConnectionCheckLine>,
    onBound: () => ConnectionCheckLine,
  ): Promise<ConnectionCheckLine> => {
    let bound = false;
    return within(work(), lineMs, () => {
      bound = true;
      return onBound();
    }).then((result) => {
      timings.push({ id, ms: now() - started, status: bound ? 'bound' : result.status });
      return result;
    });
  };

  const [proxy, route, amcp, api, cors, ports, topology] = await Promise.all([
    // 1 — a VPN or proxy between this machine and the plant.
    line(
      'proxy',
      () => checkInterceptors(probes, playoutHost),
      () => ({
        id: 'proxy',
        status: 'warn',
        text: 'The VPN and proxy check did not finish in time.',
      }),
    ),
    // 2 — the route to the Playout host leaves through a LAN interface — over IPv4.
    line(
      'route',
      async () => routeLine(playoutHost, await playoutIp, await playoutRoute),
      () => ({
        id: 'route',
        status: 'fail',
        text: `No route to ${playoutHost} was found in time.`,
      }),
    ),
    // 3 — AMCP: send VERSION on the ONE IPv4, and word what came back in its phase (C7).
    line(
      'amcp',
      async () => {
        const ip = await casparIp;
        if (ip === null) return noIpv4Line('amcp', casparHost);
        const outcome = await probes
          .amcp(ip, AMCP_PORT, options.amcpTimeoutMs ?? AMCP_PROBE_TIMEOUT_MS)
          .catch((): AmcpOutcome => ({ kind: 'unreachable', code: 'error' }));
        return amcpLineFor(
          casparHost,
          outcome,
          (await casparRoute)?.address ?? null,
          options,
          now(),
        );
      },
      () => amcpLineFor(casparHost, { kind: 'timeout' }, null, options, now()),
    ),
    // 4 — the Playout API publishes its signing keys.
    line(
      'api',
      async () => {
        const ip = await playoutIp;
        if (ip === null) return noIpv4Line('api', playoutHost);
        return checkJwks(probes, endpoints.jwksUrl, ip, bounds);
      },
      () => ({
        id: 'api',
        status: 'fail',
        text: `No answer from ${playoutHost} on port ${portOf(endpoints.jwksUrl)}.`,
      }),
    ),
    // 5 — CORS: the token endpoint accepts this console's origin.
    line(
      'cors',
      async () => {
        const ip = await playoutIp;
        if (ip === null) return noIpv4Line('cors', playoutHost);
        return checkCors(probes, endpoints.tokenUrl, req.origin, ip, bounds);
      },
      () => ({
        id: 'cors',
        status: 'fail',
        text: `No answer from ${playoutHost} on port ${portOf(endpoints.tokenUrl)}.`,
      }),
    ),
    // 6 — our ports: this station's, or free, or held by somebody we can name.
    line(
      'ports',
      () => checkPorts(probes, options.ports),
      () => ({ id: 'ports', status: 'warn', text: 'The port check did not finish in time.' }),
    ),
    // 7 — topology: the Playout or CasparCG on THIS machine.
    line(
      'topology',
      () => checkTopology(probes, playoutHost, casparHost),
      () => ({ id: 'topology', status: 'warn', text: 'The machine check did not finish in time.' }),
    ),
  ]);

  options.onTimed?.(timings, now() - started);
  // C6 — a host with no IPv4 address is ONE line (the route's); the address-bound lines go.
  const noIpv4 = (await playoutIp) === null;
  const lines = [proxy, route, amcp, api, cors, ports, topology].filter(
    (l) => !(noIpv4 && (l.id === 'amcp' || l.id === 'api' || l.id === 'cors')),
  );
  return { lines, localAddress: (await casparRoute)?.address ?? null };
}

function portOf(url: string): string {
  const u = new URL(url);
  return u.port === '' ? (u.protocol === 'https:' ? '443' : '80') : u.port;
}

function noIpv4Line(id: ConnectionCheckId, host: string): ConnectionCheckLine {
  return { id, status: 'fail', text: `${host} has no IPv4 address.` };
}

function routeLine(host: string, ip: string | null, route: ProbeRoute | null): ConnectionCheckLine {
  if (ip === null) {
    return {
      id: 'route',
      status: 'fail',
      text: `${host} has no IPv4 address. CG Control reaches the Playout over IPv4 — type its IPv4 address.`,
    };
  }
  if (route === null) {
    return {
      id: 'route',
      status: 'fail',
      text: `There is no route to ${host}. Check this machine's network cable and address.`,
    };
  }
  if (TUNNEL_IFACE.test(route.iface)) {
    return {
      id: 'route',
      status: 'fail',
      text: `The route to ${host} goes through ${route.iface}, a tunnel. Turn it off, then check again.`,
    };
  }
  return {
    id: 'route',
    status: 'pass',
    text: `The route to ${host} leaves through ${route.iface} (${route.address}).`,
  };
}

async function checkInterceptors(
  probes: CheckProbes,
  playoutHost: string,
): Promise<ConnectionCheckLine> {
  // Three independent readings, read together: the line's bound covers the slowest, not the sum.
  const [running, proxy, outward] = await Promise.all([
    probes.processes().catch((): readonly string[] => []),
    probes.systemProxy().catch(() => null),
    probes.route('8.8.8.8').catch(() => null),
  ]);
  const found = KNOWN_INTERCEPTORS.find(({ match }) =>
    running.some((p) => match.test(p.replace(/\.exe$/i, ''))),
  );
  if (found !== undefined) {
    return {
      id: 'proxy',
      status: 'fail',
      text: `${found.name} is running and can intercept this machine's traffic, even with its TUN off. Quit it, then check again.`,
    };
  }
  if (proxy !== null && !bypassed(playoutHost, proxy.bypass)) {
    return {
      id: 'proxy',
      status: 'fail',
      text: `Windows sends web traffic through a proxy (${proxy.server}). Turn it off, or add ${playoutHost} to its exceptions, then check again.`,
    };
  }
  if (outward !== null && TUNNEL_IFACE.test(outward.iface)) {
    return {
      id: 'proxy',
      status: 'fail',
      text: `A tunnel (${outward.iface}) carries this machine's traffic. Turn it off, then check again.`,
    };
  }
  return { id: 'proxy', status: 'pass', text: 'No VPN or proxy in the way.' };
}

/** A refusal or a drop: how a Playout 2.8.54 answers a machine it has not let in. */
type UntrustedOutcome = Extract<AmcpOutcome, { kind: 'refused' } | { kind: 'timeout' }>;
function isUntrusted(outcome: AmcpOutcome): outcome is UntrustedOutcome {
  return outcome.kind === 'refused' || outcome.kind === 'timeout';
}

/**
 * 🔴 `DESKTOP-APPS-01-B` B2 + `-01-C` C7 — **THE AMCP LINE, IN THE ORDER A 2.8.54 PLAYOUT ALLOWS.**
 *
 * An answer is an answer, whenever it comes. A refusal or a drop is:
 *
 *   - before any `station-admin` has signed in — WAITING for the sign-in (the Playout lets a
 *     machine in only on a `station-admin`'s server-side D9 read);
 *   - for {@link AMCP_TRUST_WINDOW_MS} after one — still WAITING, for the Playout (the first
 *     machine is let in within seconds; the console asks again while it waits);
 *   - after that — this machine, by its IPv4 address, waiting for APPROVAL in the Playout's own
 *     app, and what it means if it is not listed there. Nothing the client does happens outside an
 *     app: no script is named here, ever (`-01-C` C7).
 */
function amcpLineFor(
  host: string,
  outcome: AmcpOutcome,
  localAddress: string | null,
  options: CheckOptions,
  at: number,
): ConnectionCheckLine {
  if (!isUntrusted(outcome)) return amcpLine(host, outcome);
  const signedInAt = options.amcpSignInAt ?? null;
  if (signedInAt === null) {
    return { id: 'amcp', status: 'wait', text: `CasparCG on ${host}: waiting for sign-in.` };
  }
  if (at - signedInAt < (options.amcpTrustWindowMs ?? AMCP_TRUST_WINDOW_MS)) {
    return {
      id: 'amcp',
      status: 'wait',
      text: `CasparCG on ${host}: waiting for the Playout to let this machine in.`,
    };
  }
  const machine = localAddress === null ? 'This machine' : `This machine, ${localAddress},`;
  return {
    id: 'amcp',
    status: 'fail',
    text:
      `${machine} is waiting for approval in the Playout, at ${PLAYOUT_CG_SETTINGS}, where the ` +
      "Playout's administrator approves it. If it is not listed there, this machine reaches the " +
      'Playout through NAT, a proxy or a VPN.',
  };
}

function amcpLine(
  host: string,
  outcome: Exclude<AmcpOutcome, UntrustedOutcome>,
): ConnectionCheckLine {
  switch (outcome.kind) {
    case 'answered':
      return {
        id: 'amcp',
        status: 'pass',
        text: `CasparCG on ${host} answered VERSION: ${outcome.version}.`,
      };
    case 'silent':
      return {
        id: 'amcp',
        status: 'fail',
        text: `${host} accepted the connection on port ${String(AMCP_PORT)} but did not answer VERSION. It is not CasparCG, or CasparCG is stuck.`,
      };
    case 'unreachable':
      return {
        id: 'amcp',
        status: 'fail',
        text: `${host} cannot be reached on port ${String(AMCP_PORT)} (${outcome.code}).`,
      };
  }
}

async function checkJwks(
  probes: CheckProbes,
  url: string,
  ip: string,
  bounds: RequestBounds,
): Promise<ConnectionCheckLine> {
  const target = onAddress(url, ip);
  let answer: HttpAnswer;
  try {
    answer = await probes.request(
      'GET',
      target.url,
      { accept: 'application/json', host: target.host },
      bounds,
    );
  } catch (err) {
    return { id: 'api', status: 'fail', text: noAnswer(err, hostOf(url), target.port, url) };
  }
  if (answer.status !== 200) {
    return {
      id: 'api',
      status: 'fail',
      text: `The Playout answered ${String(answer.status)} at ${url}.`,
    };
  }
  let keys = 0;
  try {
    const body = JSON.parse(answer.body) as { keys?: unknown };
    keys = Array.isArray(body.keys) ? body.keys.length : 0;
  } catch {
    return { id: 'api', status: 'fail', text: `The Playout's answer at ${url} is not a key set.` };
  }
  if (keys === 0) {
    return {
      id: 'api',
      status: 'fail',
      text: "The Playout answers but publishes no signing keys, so no sign-in can be verified. Its administrator checks the Playout's signing setup.",
    };
  }
  return {
    id: 'api',
    status: 'pass',
    text: `The Playout answers and publishes ${String(keys)} signing key${keys === 1 ? '' : 's'}.`,
  };
}

async function checkCors(
  probes: CheckProbes,
  tokenUrl: string,
  origin: string,
  ip: string,
  bounds: RequestBounds,
): Promise<ConnectionCheckLine> {
  const refused: ConnectionCheckLine = {
    id: 'cors',
    status: 'fail',
    text: "The Playout does not accept sign-in from this console. Its administrator adds this line to the Playout's CORS list:",
    command: origin,
  };
  const target = onAddress(tokenUrl, ip);
  let answer: HttpAnswer;
  try {
    answer = await probes.request(
      'OPTIONS',
      target.url,
      {
        origin,
        host: target.host,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
      bounds,
    );
  } catch (err) {
    return {
      id: 'cors',
      status: 'fail',
      text: noAnswer(err, hostOf(tokenUrl), target.port, tokenUrl),
    };
  }
  const allowed = answer.headers['access-control-allow-origin'];
  const value = Array.isArray(allowed) ? allowed[0] : allowed;
  return value === origin || value === '*'
    ? { id: 'cors', status: 'pass', text: 'The Playout accepts sign-in from this console.' }
    : refused;
}

async function checkPorts(probes: CheckProbes, ports: StationPorts): Promise<ConnectionCheckLine> {
  const wanted: { proto: 'tcp' | 'udp'; port: number }[] = [
    ...(ports.console !== null ? [{ proto: 'tcp' as const, port: ports.console }] : []),
    { proto: 'tcp', port: ports.control },
    { proto: 'tcp', port: ports.templates },
    { proto: 'udp', port: ports.osc },
  ];
  const label = (p: { proto: 'tcp' | 'udp'; port: number }): string =>
    p.proto === 'udp' ? `${String(p.port)}/udp` : String(p.port);
  const taken: string[] = [];
  for (const p of wanted) {
    const holder = await probes
      .portHolder(p.proto, p.port)
      .catch((): PortHolder => ({ kind: 'free' }));
    if (holder.kind === 'other') {
      taken.push(
        `${label(p)} is held by ${holder.name}${holder.pid !== null ? ` (PID ${String(holder.pid)})` : ''}`,
      );
    }
  }
  if (taken.length > 0) {
    return {
      id: 'ports',
      status: 'fail',
      text: `${taken.join('; ')}. Stop that program, or run CG Control on another machine.`,
    };
  }
  const list = wanted.map(label);
  return {
    id: 'ports',
    status: 'pass',
    text: `Ports ${list.slice(0, -1).join(', ')} and ${list[list.length - 1] ?? ''} are free for this station.`,
  };
}

async function checkTopology(
  probes: CheckProbes,
  playoutHost: string,
  casparHost: string,
): Promise<ConnectionCheckLine> {
  const mine = new Set(probes.localAddresses());
  const isHere = async (host: string): Promise<boolean> => {
    const addresses = await probes.resolve(host).catch(() => [host]);
    return addresses.some((a) => mine.has(a) || a.startsWith('127.') || a === '::1');
  };
  const playoutHere = await isHere(playoutHost);
  const casparHere = casparHost === playoutHost ? playoutHere : await isHere(casparHost);
  if (playoutHere || casparHere) {
    const which =
      playoutHere && casparHere
        ? 'The Playout and CasparCG run'
        : playoutHere
          ? 'The Playout runs'
          : 'CasparCG runs';
    return {
      id: 'topology',
      status: 'warn',
      text: `${which} on this machine. UDP 6250 belongs to the engine here, so CG Control belongs on a separate machine.`,
    };
  }
  return {
    id: 'topology',
    status: 'pass',
    text: 'The Playout and CasparCG run on other machines.',
  };
}

// ── The probes a station runs ────────────────────────────────────────────────

function run(file: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 5000, encoding: 'utf8' }, (err, stdout) => {
      if (err !== null) reject(err);
      else resolve(stdout);
    });
  });
}

/** One AMCP `VERSION`, on a raw socket — never a client API whose retries would blur a reset into a timeout. */
export function probeAmcp(host: string, port: number, timeoutMs: number): Promise<AmcpOutcome> {
  return new Promise((resolve) => {
    let connected = false;
    let settled = false;
    let buffer = '';
    const socket = net.connect({ host, port });
    const done = (outcome: AmcpOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      done(connected ? { kind: 'silent' } : { kind: 'timeout' });
    }, timeoutMs);
    socket.on('connect', () => {
      connected = true;
      socket.write('VERSION\r\n');
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n');
      const head = lines[0] ?? '';
      if (/^20\d VERSION/i.test(head) && lines.length >= 3) {
        done({ kind: 'answered', version: (lines[1] ?? '').trim() });
      } else if (/^[45]\d\d/.test(head) && lines.length >= 2) {
        done({ kind: 'answered', version: head.trim() });
      }
    });
    socket.on('error', (err: NodeJS.ErrnoException) => {
      const code = err.code ?? 'error';
      if (code === 'ECONNREFUSED' || code === 'ECONNRESET') done({ kind: 'refused' });
      else if (code === 'ETIMEDOUT') done({ kind: 'timeout' });
      else done({ kind: 'unreachable', code });
    });
    socket.on('close', () => {
      if (connected) done({ kind: 'refused' });
    });
  });
}

/** This machine's address on the route to `host` — a UDP `connect` sends nothing, it only routes. */
export async function probeRoute(host: string): Promise<ProbeRoute | null> {
  const { address: ip, family } = await dns.promises.lookup(host);
  const socket = dgram.createSocket(family === 6 ? 'udp6' : 'udp4');
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.connect(9, ip, () => resolve());
    });
    const local = socket.address().address;
    const iface =
      Object.entries(os.networkInterfaces()).find(([, infos]) =>
        (infos ?? []).some((i) => i.address === local),
      )?.[0] ?? 'an unnamed interface';
    return { address: local, iface };
  } catch {
    return null;
  } finally {
    socket.close();
  }
}

/**
 * One HTTP request, BOUNDED twice (`DESKTOP-APPS-01-C` C2): the connection must open within
 * `connectMs` (`CONNECT_TIMEOUT`), and the whole exchange end within `totalMs` (`TIMEOUT`). The
 * bridge's own path to the Playout (`playout-http.ts`): never a proxy the environment names. It
 * carries whatever headers it is given — the CORS probe's `Origin` included, which is the point of
 * that probe and introduces nothing (it carries no token).
 */
function probeRequest(
  method: 'GET' | 'OPTIONS',
  url: string,
  headers: Record<string, string>,
  bounds: RequestBounds,
): Promise<HttpAnswer> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const agent = plainAgentFor(target);
    const req = lib.request(target, { method, headers, agent }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        if (body.length < 256 * 1024) body += chunk;
      });
      res.on('end', () => {
        clearTimeout(whole);
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
    });
    const whole = setTimeout(() => req.destroy(new ProbeError('TIMEOUT')), bounds.totalMs);
    req.on('socket', (socket) => {
      if (!socket.connecting) return;
      const opening = setTimeout(
        () => req.destroy(new ProbeError('CONNECT_TIMEOUT')),
        bounds.connectMs,
      );
      socket.once('connect', () => clearTimeout(opening));
      socket.once('close', () => clearTimeout(opening));
    });
    req.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(whole);
      if (err instanceof ProbeError) reject(err);
      else if (err.code === 'ECONNREFUSED') reject(new ProbeError('ECONNREFUSED'));
      else if (err.code === 'ETIMEDOUT') reject(new ProbeError('CONNECT_TIMEOUT'));
      else reject(new ProbeError('FAILED'));
    });
    req.end();
  });
}

async function windowsProcesses(): Promise<readonly string[]> {
  if (process.platform !== 'win32') return [];
  const out = await run('tasklist', ['/FO', 'CSV', '/NH']);
  return out
    .split(/\r?\n/)
    .map((line) => line.split(',')[0]?.replace(/"/g, '').trim() ?? '')
    .filter((name) => name !== '');
}

async function windowsProxy(): Promise<{ server: string; bypass: readonly string[] } | null> {
  if (process.platform !== 'win32') return null;
  const out = await run('reg', [
    'query',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
  ]);
  const value = (name: string): string | undefined =>
    new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.*)$`, 'mi').exec(out)?.[1]?.trim();
  const enabled = value('ProxyEnable');
  const autoConfig = value('AutoConfigURL');
  if (enabled !== undefined && /0x0*1$/i.test(enabled)) {
    return {
      server: value('ProxyServer') ?? 'a proxy',
      bypass: (value('ProxyOverride') ?? '').split(';'),
    };
  }
  if (autoConfig !== undefined && autoConfig !== '') return { server: autoConfig, bypass: [] };
  return null;
}

async function windowsPortHolder(proto: 'tcp' | 'udp', port: number): Promise<PortHolder> {
  const out = await run('netstat', ['-ano', '-p', proto]);
  for (const line of out.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4 || cols[0]?.toLowerCase() !== proto) continue;
    if (!(cols[1] ?? '').endsWith(`:${String(port)}`)) continue;
    // A TCP listener's foreign address ends ":0" — locale-independent, unlike "LISTENING".
    if (proto === 'tcp' && !(cols[2] ?? '').endsWith(':0')) continue;
    const pid = Number(cols[cols.length - 1]);
    if (pid === process.pid) return { kind: 'self' };
    const listing = await run('tasklist', [
      '/FI',
      `PID eq ${String(pid)}`,
      '/FO',
      'CSV',
      '/NH',
    ]).catch(() => '');
    const name = listing.split(',')[0]?.replace(/"/g, '').trim();
    return {
      kind: 'other',
      name: name !== undefined && /\.exe$/i.test(name) ? name : 'another program',
      pid,
    };
  }
  return { kind: 'free' };
}

/** Elsewhere: bind for an instant. A port this process holds is reported as this station's. */
async function bindPortHolder(proto: 'tcp' | 'udp', port: number): Promise<PortHolder> {
  return new Promise((resolve) => {
    if (proto === 'tcp') {
      const server = net.createServer();
      server.once('error', () => resolve({ kind: 'other', name: 'another program', pid: null }));
      server.listen(port, '0.0.0.0', () => server.close(() => resolve({ kind: 'free' })));
    } else {
      const socket = dgram.createSocket('udp4');
      socket.once('error', () => resolve({ kind: 'other', name: 'another program', pid: null }));
      socket.bind(port, '0.0.0.0', () => socket.close(() => resolve({ kind: 'free' })));
    }
  });
}

/** The probes a station runs. `ownPorts` are reported as this station's without being probed. */
export function realProbes(
  ownPorts: readonly { proto: 'tcp' | 'udp'; port: number }[] = [],
): CheckProbes {
  return {
    processes: windowsProcesses,
    systemProxy: windowsProxy,
    route: probeRoute,
    // C6 — the same one-per-host IPv4 the bridge's own reads and AMCP session use.
    ipv4: pinnedIPv4,
    amcp: probeAmcp,
    request: probeRequest,
    portHolder: async (proto, port) => {
      if (process.platform === 'win32') return windowsPortHolder(proto, port);
      if (ownPorts.some((p) => p.proto === proto && p.port === port)) return { kind: 'self' };
      return bindPortHolder(proto, port);
    },
    localAddresses: () =>
      Object.values(os.networkInterfaces())
        .flatMap((infos) => infos ?? [])
        .map((i) => i.address),
    resolve: async (host) => (await dns.promises.lookup(host, { all: true })).map((a) => a.address),
  };
}
