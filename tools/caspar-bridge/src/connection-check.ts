import { execFile } from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import {
  AMCP_TRUST_WINDOW_MS,
  BRIDGE_NEEDS_ADMIN_LINE,
  CONNECTION_CHECK_CONNECT_MS,
  CONNECTION_CHECK_LINE_MS,
  cgNotLicensedReason,
  connectionCheckSubject,
  isServerReachable,
  orderCheckLines,
  type BridgeSessionState,
  type ConnectionCheckId,
  type ConnectionCheckLine,
  type ConnectionCheckRequest,
  type ConnectionCheckResult,
  type PlayoutLicense,
  type ServerHealth,
} from '@cg/shared-ipc';
import { playoutEndpointsFor } from './playout-config.js';
import { pinnedIPv4, plainAgentFor } from './playout-http.js';
import { playoutVersionOf, playoutVersionUrl } from './playout-version.js';

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
 * `DELTA-MULTI-CHANNEL-01-A` A2 — the ONE constant now lives in `@cg/shared-ipc`, because the
 * console's wait for a check that holds its AMCP line is derived from it.
 */
export { AMCP_TRUST_WINDOW_MS };

/**
 * `DELTA-MULTI-CHANNEL-01-A` A2 — while a check HOLDS its AMCP line (`awaitLetIn`), how long the
 * bridge waits between one AMCP probe and the next. The Playout lets the first machine in within
 * seconds, so a second is fine-grained enough, and each probe is bounded by its own connect bound.
 */
export const AMCP_LET_IN_RETRY_MS = 1000;

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

/** A running process: its image name, and its PID when the listing gave one. */
export interface RunningProcess {
  readonly name: string;
  readonly pid: number | null;
}

export interface CheckProbes {
  /** Running processes (Windows `tasklist`); empty where not read. */
  processes(): Promise<readonly RunningProcess[]>;
  /** The system proxy when one is ON, with its bypass list; `null` when off or not read. */
  systemProxy(): Promise<{ server: string; bypass: readonly string[] } | null>;
  /** `B-318` — the names of this machine's network adapters that are up (they hold an address). */
  adapters(): readonly string[];
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
}

/** How long one line took, and what it came to — `DESKTOP-APPS-01-C` C1's instrument. */
export interface LineTiming {
  readonly id: ConnectionCheckId;
  readonly ms: number;
  readonly status: ConnectionCheckLine['status'] | 'bound';
}

export interface CheckOptions {
  readonly amcpTimeoutMs?: number;
  /**
   * `DESKTOP-APPS-01-B`/`-C` — when a `station-admin` last signed in to this bridge (epoch ms), or
   * `null`/absent: none yet. Until one has, a Playout 2.8.54 refuses AMCP to this machine by design,
   * so a refused or dropped AMCP line WAITS — while the Playout's API can sign someone in
   * (`CHECK-RERUN-01` B); for {@link AMCP_TRUST_WINDOW_MS} after, it still waits (the Playout lets
   * this machine in, or records it pending); after that it names the approval.
   */
  readonly amcpSignInAt?: number | null;
  /** TEST-ONLY — {@link AMCP_TRUST_WINDOW_MS} by default. */
  readonly amcpTrustWindowMs?: number;
  /** TEST-ONLY — {@link AMCP_LET_IN_RETRY_MS} by default. */
  readonly letInRetryMs?: number;
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

/** Windows' own IPv6 transition pseudo-interfaces: "Tunneling" in the name, and no VPN behind it. */
const PSEUDO_IFACE = /teredo|isatap|6to4|pseudo-interface/i;

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^\[|\]$/g, '');
}

/**
 * `B-318` — the host and port a Windows proxy setting points at: `127.0.0.1:10808`, the first entry of
 * `http=127.0.0.1:10808;https=…`, or a PAC URL's own host. `null` when it names no host.
 */
export function proxyEndpoint(server: string): { host: string; port: number | null } | null {
  const first = (server.split(';')[0] ?? '').trim().replace(/^[a-z]+=/i, '');
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(\[[^\]]+\]|[^:/\s]+)(?::(\d{1,5}))?/i.exec(first);
  const host = m?.[1];
  if (m === null || host === undefined) return null;
  return { host: host.replace(/^\[|\]$/g, ''), port: m[2] === undefined ? null : Number(m[2]) };
}

/** A host that can only be this machine. */
function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '::1' || /^127\./.test(h);
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
 * And (`CHECK-RERUN-01` B) one fault is said once: the lines that need a sign-in are settled on
 * the API line by {@link byTheApiLine}, after every line is in.
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

  const apiPort = portOf(endpoints.jwksUrl);
  // C1 — when each line finished, and whether its bound did it; its outcome is read once worded.
  const finished = new Map<ConnectionCheckId, { ms: number; bound: boolean }>();
  const line = <T>(
    id: ConnectionCheckId,
    work: () => Promise<T>,
    onBound: () => T,
    boundMs = lineMs,
  ): Promise<T> => {
    let bound = false;
    return within(work(), boundMs, () => {
      bound = true;
      return onBound();
    }).then((result) => {
      finished.set(id, { ms: now() - started, bound });
      return result;
    });
  };

  /*
    🔴 `DELTA-MULTI-CHANNEL-01-A` A2 — **THE HOLD.** Asked for (`awaitLetIn`) within the trust
    window after a `station-admin`'s sign-in, the AMCP line asks CasparCG again, itself, until it
    answers or the window ends — on the axis it judges (golden rule 8): the bridge's own link
    targets the station's configured server, which on a first run is still the loopback default,
    so it cannot say when the Playout let this machine in. Only this line waits; its bound covers
    what is left of the window.
  */
  const signInAt = options.amcpSignInAt ?? null;
  const windowMs = options.amcpTrustWindowMs ?? AMCP_TRUST_WINDOW_MS;
  const holdUntil =
    req.awaitLetIn === true && signInAt !== null && started - signInAt < windowMs
      ? signInAt + windowMs
      : null;
  const amcpProbe = (ip: string): Promise<AmcpOutcome> =>
    probes
      .amcp(ip, AMCP_PORT, options.amcpTimeoutMs ?? AMCP_PROBE_TIMEOUT_MS)
      .catch((): AmcpOutcome => ({ kind: 'unreachable', code: 'error' }));

  const [proxy, route, amcp, api, cors, playoutVersion] = await Promise.all([
    // 1 — a VPN or proxy on CG Bridge's machine (`B-318`): red only for a route through its tunnel.
    line(
      'proxy',
      async () =>
        checkInterceptors(probes, [
          { host: playoutHost, route: await playoutRoute },
          ...(casparHost === playoutHost ? [] : [{ host: casparHost, route: await casparRoute }]),
        ]),
      (): ConnectionCheckLine => ({
        id: 'proxy',
        status: 'warn',
        text: 'The VPN and proxy check did not finish in time.',
      }),
    ),
    // 2 — the route to the Playout host leaves through a LAN interface — over IPv4.
    line(
      'route',
      async () => routeLine(playoutHost, await playoutIp, await playoutRoute),
      (): ConnectionCheckLine => ({
        id: 'route',
        status: 'fail',
        text: `No route to ${playoutHost} was found in time.`,
      }),
    ),
    // 3 — AMCP: send VERSION on the ONE IPv4. Worded below, in its phase (C7), once the API line
    // is known (`CHECK-RERUN-01` B); `null` — the CasparCG host has no IPv4 address.
    line(
      'amcp',
      async (): Promise<AmcpReading | null> => {
        const ip = await casparIp;
        if (ip === null) return null;
        let outcome = await amcpProbe(ip);
        // A2 — the hold: again, a beat apart, while it is refused or dropped and the window runs.
        while (holdUntil !== null && isUntrusted(outcome) && now() < holdUntil) {
          await new Promise((resolve) =>
            setTimeout(resolve, options.letInRetryMs ?? AMCP_LET_IN_RETRY_MS),
          );
          outcome = await amcpProbe(ip);
        }
        return { outcome, localAddress: (await casparRoute)?.address ?? null, at: now() };
      },
      (): AmcpReading => ({ outcome: { kind: 'timeout' }, localAddress: null, at: now() }),
      holdUntil === null ? lineMs : Math.max(0, holdUntil - started) + lineMs,
    ),
    // 4 — the Playout API publishes its signing keys — and so can sign someone in, or cannot.
    line(
      'api',
      async (): Promise<ApiReading> => {
        const ip = await playoutIp;
        if (ip === null) return { line: noIpv4Line('api', playoutHost), noSignIn: PLAYOUT_SILENT };
        return checkJwks(probes, endpoints.jwksUrl, ip, bounds);
      },
      (): ApiReading => ({
        line: {
          id: 'api',
          status: 'fail',
          text: `No answer from ${playoutHost} on port ${apiPort}.`,
        },
        noSignIn: PLAYOUT_SILENT,
      }),
    ),
    // 5 — CORS: the token endpoint accepts this console's origin. `CENTRAL-BRIDGE-01` rule 8: a
    // console that signs in directly (CG Control, no `Origin`) meets no CORS list at all — said as a
    // fact, never probed with an origin its sign-in does not send.
    line(
      'cors',
      async () => {
        if (req.signIn === 'native') return NATIVE_SIGN_IN_LINE;
        const ip = await playoutIp;
        if (ip === null) return noIpv4Line('cors', playoutHost);
        return checkCors(probes, endpoints.tokenUrl, req.origin, ip, bounds);
      },
      (): ConnectionCheckLine => ({
        id: 'cors',
        status: 'fail',
        text: `No answer from ${playoutHost} on port ${portOf(endpoints.tokenUrl)}.`,
      }),
    ),
    /*
      🔴 `R-090` — NO `ports` AND NO `topology` LINE. They judged the machine CG Bridge runs on — its
      ports, and whether the Playout and CasparCG run there — from the era when CG Control carried its
      own bridge, and read on a console as verdicts about the console's machine. A console may run
      anywhere; CG Bridge's ports are its own, said by its `/health` (`port-held`). The ids stay in the
      wire enum only so an older CG Bridge's answer still parses; the console drops them.
    */
    // 6 — `R-084`: the Playout's own version, asked with no token. Not served is a fact, never a
    // refusal: no other line reads it, and nothing waits on it.
    line(
      'playout-version',
      async () => {
        const ip = await playoutIp;
        if (ip === null) return PLAYOUT_VERSION_NOT_SERVED;
        return checkPlayoutVersion(probes, playoutVersionUrl(endpoints.address), ip, bounds);
      },
      (): ConnectionCheckLine => PLAYOUT_VERSION_NOT_SERVED,
    ),
  ]);

  // `CHECK-RERUN-01` B — the lines that need a sign-in, settled on the API line in ONE place.
  const needing = byTheApiLine(api, cors, amcp, {
    subject: (id) => connectionCheckSubject(id, id === 'amcp' ? casparHost : playoutHost, apiPort),
    casparHost,
    options,
  });
  const all = [proxy, route, needing.amcp, api.line, needing.cors, playoutVersion];
  // C1 — every line's time and its outcome as worded, in the order the lines finished.
  const timings = all
    .map((l): LineTiming => {
      const done = finished.get(l.id);
      return { id: l.id, ms: done?.ms ?? 0, status: done?.bound === true ? 'bound' : l.status };
    })
    .sort((a, b) => a.ms - b.ms);
  options.onTimed?.(timings, now() - started);
  // C6 — a host with no IPv4 address is ONE line (the route's); the address-bound lines go.
  const noIpv4 = (await playoutIp) === null;
  const lines = all.filter(
    (l) =>
      !(
        noIpv4 &&
        (l.id === 'amcp' || l.id === 'api' || l.id === 'cors' || l.id === 'playout-version')
      ),
  );
  // `R-081` — in the order things happen (`CONNECTION_CHECK_GROUPS`), never the order probed.
  return { lines: orderCheckLines(lines), localAddress: (await casparRoute)?.address ?? null };
}

/**
 * 🔴 `R-081` (`CONSOLE-POLISH-01` §6) — **WHAT CG BRIDGE ITSELF KNOWS, AS CHECK LINES.** The probes
 * above judge LINKS; these four read STATE CG Bridge already holds, so a station admin sees, in the
 * check's one list, what needs a signed-in session: CG Bridge's own Playout session, CasparCG's OSC,
 * the CG license and the channels the asker's sign-in holds.
 *
 * Each line WAITS — neutral, never a failure — while what it needs has not happened, and says what it
 * waits for. The OSC line reads its OWN axis (golden rule 8): silence there means "no confirmation",
 * a warning, and never speaks for AMCP, whose own line judges it.
 *
 * Pure: the route gathers the state and this words it.
 */
export interface StationState {
  /** CG Bridge has a Playout (auth on). Without one there is no session, license or channel list. */
  readonly playout: boolean;
  /** CG Bridge's own Playout session (`bridgeSession.state`). */
  readonly session: BridgeSessionState;
  /** The primary server's health as last read. */
  readonly primary: Pick<ServerHealth, 'state' | 'oscFreshAt'> | null;
  /** The OSC port this station's primary sends to. */
  readonly oscPort: number;
  /** The CG license as CG Bridge last read it; `null` — none read. */
  readonly license: PlayoutLicense | null;
  /**
   * How many of the Playout's channels the ASKING console's sign-in holds: a count; `null` — the
   * Playout's list has not been read; `'no-sign-in'` — the asker has not signed in.
   */
  readonly channels: number | null | 'no-sign-in';
}

/** A Playout's own words inside an English line: a first-strong isolate, so a Persian sentence keeps its order. */
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const isolated = (text: string): string => `${FSI}${text}${PDI}`;

export function stationStateLines(s: StationState): ConnectionCheckLine[] {
  const lines: ConnectionCheckLine[] = [];
  const subject = (id: ConnectionCheckId): string => connectionCheckSubject(id, '', '');
  const sessionUp = s.session.state === 'signed-in';

  if (s.playout) {
    // CG Bridge's own Playout session (`CENTRAL-BRIDGE-01` D7).
    switch (s.session.state) {
      case 'signed-in':
        lines.push({
          id: 'bridge-session',
          status: 'pass',
          text:
            s.session.name !== undefined
              ? `CG Bridge is signed in to the Playout as ${isolated(s.session.name)}.`
              : 'CG Bridge is signed in to the Playout.',
        });
        break;
      case 'waiting':
        lines.push({
          id: 'bridge-session',
          status: 'wait',
          text: `${subject('bridge-session')}: waiting for the Playout to answer.`,
        });
        break;
      case 'needs-admin':
        lines.push({ id: 'bridge-session', status: 'wait', text: `${BRIDGE_NEEDS_ADMIN_LINE}.` });
        break;
      case 'refused':
        lines.push({
          id: 'bridge-session',
          status: 'fail',
          text: `CG Bridge: ${isolated(s.session.message ?? 'the Playout refused its sign-in')}`,
        });
        break;
      case 'off':
        break;
    }
  }

  // OSC — its own axis. AMCP not up: nothing to hear yet. Up and silent: no confirmation, a warning.
  if (s.primary === null || !isServerReachable(s.primary.state)) {
    lines.push({ id: 'osc', status: 'wait', text: `${subject('osc')}: waiting for CasparCG.` });
  } else if (s.primary.state === 'healthy' && s.primary.oscFreshAt !== undefined) {
    lines.push({
      id: 'osc',
      status: 'pass',
      text: `CasparCG's OSC arrives on port ${String(s.oscPort)}.`,
    });
  } else {
    lines.push({
      id: 'osc',
      status: 'warn',
      text: `No OSC from CasparCG on port ${String(s.oscPort)}: what is on air cannot be confirmed.`,
    });
  }

  if (s.playout) {
    // The CG license (`PLAYOUT-FEATURES-01` D). Nothing unread is ever a reason to refuse.
    const license = s.license;
    if (license === null) {
      lines.push(
        sessionUp
          ? {
              id: 'license',
              status: 'skip',
              text: `${subject('license')}: this Playout publishes none.`,
            }
          : s.session.state === 'off'
            ? // A bridge with no session of its own reads with a console's: nothing to wait FOR by name.
              { id: 'license', status: 'wait', text: `${subject('license')}: not read yet.` }
            : {
                id: 'license',
                status: 'wait',
                text: `${subject('license')}: waiting for CG Bridge's sign-in.`,
              },
      );
    } else if (!license.licensed) {
      const message = license.message ?? null;
      lines.push({
        id: 'license',
        status: 'fail',
        text: message !== null ? isolated(message) : cgNotLicensedReason(),
      });
    } else {
      const max = license.maxChannels ?? null;
      const cap = max !== null ? ` for ${String(max)} channel${max === 1 ? '' : 's'}` : '';
      const expires = license.expiresAt ?? null;
      const until = expires !== null ? `, until ${expires}` : '';
      const grace = license.graceUntil ?? null;
      lines.push(
        license.playoutState === 'grace'
          ? {
              id: 'license',
              status: 'warn',
              text:
                `CG Control is licensed${cap}; the Playout's own license is in grace` +
                (grace !== null ? ` until ${grace}.` : '.'),
            }
          : { id: 'license', status: 'pass', text: `CG Control is licensed${cap}${until}.` },
      );
    }

    // The channels this sign-in holds.
    if (s.channels === 'no-sign-in') {
      lines.push({
        id: 'channels',
        status: 'wait',
        text: `${subject('channels')}: waiting for sign-in.`,
      });
    } else if (s.channels === null) {
      lines.push({ id: 'channels', status: 'wait', text: `${subject('channels')}: not read yet.` });
    } else if (s.channels === 0) {
      lines.push({
        id: 'channels',
        status: 'fail',
        text: 'The Playout lists no channel for this sign-in.',
      });
    } else {
      lines.push({
        id: 'channels',
        status: 'pass',
        text: `The Playout lists ${String(s.channels)} channel${s.channels === 1 ? '' : 's'} for this sign-in.`,
      });
    }
  }
  return lines;
}

/** `R-081` — a check's answer with CG Bridge's own lines merged in, in the one order. */
export function withStationLines(
  result: ConnectionCheckResult,
  state: StationState,
): ConnectionCheckResult {
  return { ...result, lines: orderCheckLines([...result.lines, ...stationStateLines(state)]) };
}

/**
 * 🔴 `CHECK-RERUN-01` B — what the Playout's API line read, as the lines that NEED it read it:
 * `noSignIn` is `null` when a sign-in can work here (the key set answered, with a key), else why
 * not, in a few words. Carried beside the line's sentence and never read back out of it.
 */
interface ApiReading {
  readonly line: ConnectionCheckLine;
  readonly noSignIn: string | null;
}

const PLAYOUT_SILENT = 'the Playout does not answer';
const PLAYOUT_KEYLESS = 'the Playout publishes no signing keys';

/** What the AMCP probe read, before it is worded. */
interface AmcpReading {
  readonly outcome: AmcpOutcome;
  /** This machine's address on the route to the CasparCG host, for the approval sentence. */
  readonly localAddress: string | null;
  /** When the probe finished: the trust window is measured to here. */
  readonly at: number;
}

/**
 * 🔴 `CHECK-RERUN-01` B — **A VERDICT ABOUT SIGN-IN NEEDS A PLAYOUT THAT CAN SIGN SOMEONE IN.** The
 * check's one dependency rule, in one place. Whether a sign-in can work is exactly what the API
 * line reads, so while it cannot:
 *
 *   - the CORS line — sign-in from this console — is NOT CHECKED, and names the reason. Its probe
 *     goes to the same server, on the same port, and could only say the API line's failure again:
 *     the owner's dialog, 2026-09-24, read "No answer from 192.168.21.111 on port 8080." twice;
 *   - the AMCP line does not wait for a sign-in that cannot happen. It takes its own result — an
 *     answer, a refusal, no answer — and says a failure plainly, rather than asking the operator
 *     for a sign-in the dialog above it shows cannot work.
 *
 * Applied once every line has settled, never inside a line: a line's bound firing cannot bring the
 * repeat back. It reads the API line's `noSignIn`, never the words of any line.
 */
function byTheApiLine(
  api: ApiReading,
  cors: ConnectionCheckLine,
  amcp: AmcpReading | null,
  ctx: {
    readonly subject: (id: ConnectionCheckId) => string;
    readonly casparHost: string;
    readonly options: CheckOptions;
  },
): { cors: ConnectionCheckLine; amcp: ConnectionCheckLine } {
  const why = api.noSignIn;
  return {
    cors:
      why === null
        ? cors
        : { id: 'cors', status: 'skip', text: `${ctx.subject('cors')}: not checked — ${why}.` },
    amcp:
      amcp === null
        ? noIpv4Line('amcp', ctx.casparHost)
        : amcpLineFor(ctx.casparHost, ctx.subject('amcp'), amcp, ctx.options, why === null),
  };
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
  // `R-090` — the route is CG Bridge's: said as CG Bridge's, never "this machine's".
  if (route === null) {
    return {
      id: 'route',
      status: 'fail',
      text: `CG Bridge's machine has no route to ${host}.`,
    };
  }
  if (TUNNEL_IFACE.test(route.iface)) {
    return {
      id: 'route',
      status: 'fail',
      text: `CG Bridge's route to ${host} goes through ${route.iface}, a tunnel. Turn it off, then check again.`,
    };
  }
  return {
    id: 'route',
    status: 'pass',
    text: `CG Bridge's route to ${host} leaves through ${route.iface} (${route.address}).`,
  };
}

/** `name (PID n)`, or the name alone when the listing gave no PID. */
function withPid(name: string, pid: number | null): string {
  return pid === null ? name : `${name} (PID ${String(pid)})`;
}

/** `a`, `a and b`, `a, b and c`. */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

/**
 * 🔴 `B-318` — **A VPN OR PROXY, EXACT OR NOT AT ALL.** The line used to FAIL whenever a process named
 * like v2rayN ran — "even with its TUN off" — before it looked at anything that intercepts. It runs on
 * CG Bridge's machine, so the owner quit v2rayN on his own PC and the line stayed: it was another
 * machine's process. Now a line appears only while something ACTUALLY intercepts there:
 *
 *   - a system proxy that is on AND has a listener on its address (a setting left behind with
 *     nothing listening is no proxy at all); a proxy on another host is taken as live;
 *   - a tunnel adapter that is up (Windows' Teredo/ISATAP/6to4 pseudo-interfaces are not tunnels);
 *   - a route to the Playout's or CasparCG's host that leaves through a tunnel.
 *
 * It names what it found — the proxy and the process holding it, the adapter, any known client with
 * its PID — and is a WARNING: CG Bridge's own requests never use the system proxy (`playout-http.ts`)
 * and a tunnel up beside a LAN route takes nothing of ours. It is a FAILURE only when the route to the
 * Playout or CasparCG goes through the tunnel — the one case that is proved to intercept our traffic.
 */
async function checkInterceptors(
  probes: CheckProbes,
  targets: readonly { readonly host: string; readonly route: ProbeRoute | null }[],
): Promise<ConnectionCheckLine> {
  // Independent readings, read together: the line's bound covers the slowest, not the sum.
  const [running, proxy] = await Promise.all([
    probes.processes().catch((): readonly RunningProcess[] => []),
    probes.systemProxy().catch(() => null),
  ]);
  const clients: string[] = [];
  for (const p of running) {
    const known = KNOWN_INTERCEPTORS.find(({ match }) => match.test(p.name.replace(/\.exe$/i, '')));
    if (known !== undefined) clients.push(withPid(known.name, p.pid));
  }

  const findings: string[] = [];
  if (proxy !== null) {
    const at = proxyEndpoint(proxy.server);
    if (at === null || !isLoopbackHost(at.host)) {
      findings.push(`the Windows proxy ${proxy.server} is on`);
    } else if (at.port !== null) {
      const holder = await probes
        .portHolder('tcp', at.port)
        .catch((): PortHolder => ({ kind: 'free' }));
      // Nothing listening there: a setting left behind, which intercepts nothing.
      if (holder.kind === 'other') {
        findings.push(
          `the Windows proxy ${proxy.server} is on, held by ${withPid(holder.name, holder.pid)}`,
        );
      }
    }
  }
  for (const name of probes.adapters()) {
    if (TUNNEL_IFACE.test(name) && !PSEUDO_IFACE.test(name))
      findings.push(`the tunnel ${name} is up`);
  }
  const through = targets.filter(
    (t): t is { host: string; route: ProbeRoute } =>
      t.route !== null && TUNNEL_IFACE.test(t.route.iface) && !PSEUDO_IFACE.test(t.route.iface),
  );
  if (findings.length === 0 && through.length === 0) {
    return { id: 'proxy', status: 'pass', text: 'No VPN or proxy in the way.' };
  }
  const alongside = clients.length === 0 ? '' : `; running: ${listed(clients)}`;
  if (through.length > 0) {
    const iface = through[0]?.route.iface ?? '';
    return {
      id: 'proxy',
      status: 'fail',
      text:
        `CG Bridge's traffic to ${listed(through.map((t) => t.host))} goes through the tunnel ` +
        `${iface}${alongside}. Turn it off, then check again.`,
    };
  }
  return {
    id: 'proxy',
    status: 'warn',
    text: `On CG Bridge's machine, ${listed(findings)}${alongside}.`,
  };
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
 *     machine in only on a `station-admin`'s server-side D9 read) — but only while a sign-in CAN
 *     happen (`CHECK-RERUN-01` B, {@link byTheApiLine}); otherwise it is only what it is, a
 *     refusal or no answer, said plainly;
 *   - for {@link AMCP_TRUST_WINDOW_MS} after one — still WAITING, for the Playout (the first
 *     machine is let in within seconds; the console asks again while it waits);
 *   - after that — this machine, by its IPv4 address, waiting for APPROVAL in the Playout's own
 *     app, and what it means if it is not listed there. Nothing the client does happens outside an
 *     app: no script is named here, ever (`-01-C` C7).
 */
function amcpLineFor(
  host: string,
  subject: string,
  { outcome, localAddress, at }: AmcpReading,
  options: CheckOptions,
  signInCanHappen: boolean,
): ConnectionCheckLine {
  if (!isUntrusted(outcome)) return amcpLine(host, outcome);
  const signedInAt = options.amcpSignInAt ?? null;
  if (signedInAt === null) {
    return signInCanHappen
      ? { id: 'amcp', status: 'wait', text: `${subject}: waiting for sign-in.` }
      : amcpLine(host, outcome);
  }
  if (at - signedInAt < (options.amcpTrustWindowMs ?? AMCP_TRUST_WINDOW_MS)) {
    return {
      id: 'amcp',
      status: 'wait',
      text: `${subject}: waiting for the Playout to let CG Bridge's machine in.`,
    };
  }
  // `R-090` — the machine the Playout approves is CG Bridge's, wherever the console that reads this runs.
  const machine =
    localAddress === null ? "CG Bridge's machine" : `CG Bridge's machine, ${localAddress},`;
  return {
    id: 'amcp',
    status: 'fail',
    text:
      `${machine} is waiting for approval in the Playout, at ${PLAYOUT_CG_SETTINGS}, where the ` +
      "Playout's administrator approves it. If it is not listed there, CG Bridge's machine reaches " +
      'the Playout through NAT, a proxy or a VPN.',
  };
}

/** What AMCP did, said plainly — an answer passes, and anything else is a failure in its words. */
function amcpLine(host: string, outcome: AmcpOutcome): ConnectionCheckLine {
  const port = String(AMCP_PORT);
  switch (outcome.kind) {
    case 'answered':
      return {
        id: 'amcp',
        status: 'pass',
        text: `CasparCG on ${host} answered VERSION: ${outcome.version}.`,
      };
    case 'refused':
      return {
        id: 'amcp',
        status: 'fail',
        text: `${host} refused the connection on port ${port}.`,
      };
    case 'timeout':
      return { id: 'amcp', status: 'fail', text: `No answer from ${host} on port ${port}.` };
    case 'silent':
      return {
        id: 'amcp',
        status: 'fail',
        text: `${host} accepted the connection on port ${port} but did not answer VERSION. It is not CasparCG, or CasparCG is stuck.`,
      };
    case 'unreachable':
      return {
        id: 'amcp',
        status: 'fail',
        text: `${host} cannot be reached on port ${port} (${outcome.code}).`,
      };
  }
}

/** `R-084` — the version line when the Playout does not answer it (unreachable, `404`, no version). */
const PLAYOUT_VERSION_NOT_SERVED: ConnectionCheckLine = {
  id: 'playout-version',
  status: 'skip',
  text: "The Playout's version: not served.",
};

/**
 * `R-084` (`RELEASE-0111-01-A` A1) — `GET /api/v1/system/version` on the ONE IPv4, with no token and
 * no `Origin` (the probe sends neither): its `version`, and nothing else of the answer.
 */
async function checkPlayoutVersion(
  probes: CheckProbes,
  url: string,
  ip: string,
  bounds: RequestBounds,
): Promise<ConnectionCheckLine> {
  const target = onAddress(url, ip);
  try {
    const answer = await probes.request(
      'GET',
      target.url,
      { accept: 'application/json', host: target.host },
      bounds,
    );
    if (answer.status !== 200) return PLAYOUT_VERSION_NOT_SERVED;
    const version = playoutVersionOf(JSON.parse(answer.body));
    return version === null
      ? PLAYOUT_VERSION_NOT_SERVED
      : { id: 'playout-version', status: 'pass', text: `Playout ${version}.` };
  } catch {
    return PLAYOUT_VERSION_NOT_SERVED;
  }
}

async function checkJwks(
  probes: CheckProbes,
  url: string,
  ip: string,
  bounds: RequestBounds,
): Promise<ApiReading> {
  const target = onAddress(url, ip);
  const failed = (text: string, noSignIn: string): ApiReading => ({
    line: { id: 'api', status: 'fail', text },
    noSignIn,
  });
  let answer: HttpAnswer;
  try {
    answer = await probes.request(
      'GET',
      target.url,
      { accept: 'application/json', host: target.host },
      bounds,
    );
  } catch (err) {
    return failed(noAnswer(err, hostOf(url), target.port, url), PLAYOUT_SILENT);
  }
  if (answer.status !== 200) {
    return failed(`The Playout answered ${String(answer.status)} at ${url}.`, PLAYOUT_KEYLESS);
  }
  let keys = 0;
  try {
    const body = JSON.parse(answer.body) as { keys?: unknown };
    keys = Array.isArray(body.keys) ? body.keys.length : 0;
  } catch {
    return failed(`The Playout's answer at ${url} is not a key set.`, PLAYOUT_KEYLESS);
  }
  if (keys === 0) {
    return failed(
      "The Playout answers but publishes no signing keys, so no sign-in can be verified. Its administrator checks the Playout's signing setup.",
      PLAYOUT_KEYLESS,
    );
  }
  return {
    line: {
      id: 'api',
      status: 'pass',
      text: `The Playout answers and publishes ${String(keys)} signing key${keys === 1 ? '' : 's'}.`,
    },
    noSignIn: null,
  };
}

/**
 * `CENTRAL-BRIDGE-01` rule 8 — the CORS line for a console that signs in directly: CG Control posts
 * D1 from its own process with no `Origin`, so there is no CORS list in the way of its sign-in.
 */
export const NATIVE_SIGN_IN_LINE: ConnectionCheckLine = {
  id: 'cors',
  status: 'pass',
  text: 'Sign-in from this console: direct, with no browser origin — no CORS entry is needed.',
};

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

/** `tasklist /FO CSV /NH`: `"name","pid",…` per process — the name and the PID. */
export function parseTasklist(out: string): RunningProcess[] {
  return out
    .split(/\r?\n/)
    .map((line) => {
      const cols = line.split(',').map((c) => c.replace(/"/g, '').trim());
      const pid = Number(cols[1]);
      return { name: cols[0] ?? '', pid: Number.isInteger(pid) && pid > 0 ? pid : null };
    })
    .filter((p) => p.name !== '');
}

async function windowsProcesses(): Promise<readonly RunningProcess[]> {
  if (process.platform !== 'win32') return [];
  return parseTasklist(await run('tasklist', ['/FO', 'CSV', '/NH']));
}

/** `B-318` — the adapters that are up: every interface holding a non-internal address. */
function upAdapters(): readonly string[] {
  return Object.entries(os.networkInterfaces())
    .filter(([, infos]) => (infos ?? []).some((i) => !i.internal))
    .map(([name]) => name);
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

/**
 * Who holds a port on this machine: on Windows by `netstat` (the holder's name and PID), elsewhere by
 * binding it for an instant. `ownPorts` are reported as this process's without being probed. Also
 * what `/health`'s `port-held` problem names (`R-090`).
 */
export function portHolderOf(
  proto: 'tcp' | 'udp',
  port: number,
  ownPorts: readonly { proto: 'tcp' | 'udp'; port: number }[] = [],
): Promise<PortHolder> {
  if (process.platform === 'win32') return windowsPortHolder(proto, port);
  if (ownPorts.some((p) => p.proto === proto && p.port === port)) {
    return Promise.resolve({ kind: 'self' });
  }
  return bindPortHolder(proto, port);
}

/** The probes a station runs. `ownPorts` are reported as this station's without being probed. */
export function realProbes(
  ownPorts: readonly { proto: 'tcp' | 'udp'; port: number }[] = [],
): CheckProbes {
  return {
    processes: windowsProcesses,
    systemProxy: windowsProxy,
    adapters: upAdapters,
    route: probeRoute,
    // C6 — the same one-per-host IPv4 the bridge's own reads and AMCP session use.
    ipv4: pinnedIPv4,
    amcp: probeAmcp,
    request: probeRequest,
    portHolder: (proto, port) => portHolderOf(proto, port, ownPorts),
  };
}
