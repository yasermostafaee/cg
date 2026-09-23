import { execFile } from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import type {
  ConnectionCheckLine,
  ConnectionCheckRequest,
  ConnectionCheckResult,
} from '@cg/shared-ipc';
import { playoutEndpointsFor } from './playout-config.js';

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

/** How long the AMCP probe waits for a connection and for `VERSION`'s answer. */
export const AMCP_PROBE_TIMEOUT_MS = 3000;
const HTTP_TIMEOUT_MS = 5000;
const AMCP_PORT = 5250;

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

export interface CheckProbes {
  /** Image names of running processes (Windows `tasklist`); empty where not read. */
  processes(): Promise<readonly string[]>;
  /** The system proxy when one is ON, with its bypass list; `null` when off or not read. */
  systemProxy(): Promise<{ server: string; bypass: readonly string[] } | null>;
  route(host: string): Promise<ProbeRoute | null>;
  amcp(host: string, port: number, timeoutMs: number): Promise<AmcpOutcome>;
  request(
    method: 'GET' | 'OPTIONS',
    url: string,
    headers: Record<string, string>,
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

export interface CheckOptions {
  readonly ports: StationPorts;
  readonly amcpTimeoutMs?: number;
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

/** Run the seven checks, in order. Never throws: a probe that fails is a line that fails. */
export async function runConnectionCheck(
  req: ConnectionCheckRequest,
  probes: CheckProbes,
  options: CheckOptions,
): Promise<ConnectionCheckResult> {
  const lines: ConnectionCheckLine[] = [];
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
  const playoutHost = hostOf(endpoints.address);
  const casparHost = req.casparHost ?? playoutHost;

  // 1 — a VPN or proxy between this machine and the plant.
  lines.push(await checkInterceptors(probes, playoutHost));

  // 2 — the route to the Playout host leaves through a LAN interface.
  const route = await probes.route(playoutHost).catch(() => null);
  if (route === null) {
    lines.push({
      id: 'route',
      status: 'fail',
      text: `There is no route to ${playoutHost}. Check this machine's network cable and address.`,
    });
  } else if (TUNNEL_IFACE.test(route.iface)) {
    lines.push({
      id: 'route',
      status: 'fail',
      text: `The route to ${playoutHost} goes through ${route.iface}, a tunnel. Turn it off, then check again.`,
    });
  } else {
    lines.push({
      id: 'route',
      status: 'pass',
      text: `The route to ${playoutHost} leaves through ${route.iface} (${route.address}).`,
    });
  }

  // 3 — AMCP: send VERSION, and tell a reset from a drop from an answer.
  const casparRoute =
    casparHost === playoutHost ? route : await probes.route(casparHost).catch(() => null);
  const localAddress = casparRoute?.address ?? null;
  lines.push(
    amcpLine(
      casparHost,
      await probes
        .amcp(casparHost, AMCP_PORT, options.amcpTimeoutMs ?? AMCP_PROBE_TIMEOUT_MS)
        .catch((): AmcpOutcome => ({ kind: 'unreachable', code: 'error' })),
      localAddress,
    ),
  );

  // 4 — the Playout API publishes its signing keys.
  lines.push(await checkJwks(probes, endpoints.jwksUrl));

  // 5 — CORS: the token endpoint accepts this console's origin.
  lines.push(await checkCors(probes, endpoints.tokenUrl, req.origin));

  // 6 — our ports: this station's, or free, or held by somebody we can name.
  lines.push(await checkPorts(probes, options.ports));

  // 7 — topology: the Playout or CasparCG on THIS machine.
  lines.push(await checkTopology(probes, playoutHost, casparHost));

  return { lines, localAddress };
}

async function checkInterceptors(
  probes: CheckProbes,
  playoutHost: string,
): Promise<ConnectionCheckLine> {
  const running = await probes.processes().catch(() => []);
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
  const proxy = await probes.systemProxy().catch(() => null);
  if (proxy !== null && !bypassed(playoutHost, proxy.bypass)) {
    return {
      id: 'proxy',
      status: 'fail',
      text: `Windows sends web traffic through a proxy (${proxy.server}). Turn it off, or add ${playoutHost} to its exceptions, then check again.`,
    };
  }
  const outward = await probes.route('8.8.8.8').catch(() => null);
  if (outward !== null && TUNNEL_IFACE.test(outward.iface)) {
    return {
      id: 'proxy',
      status: 'fail',
      text: `A tunnel (${outward.iface}) carries this machine's traffic. Turn it off, then check again.`,
    };
  }
  return { id: 'proxy', status: 'pass', text: 'No VPN or proxy in the way.' };
}

function amcpLine(
  host: string,
  outcome: AmcpOutcome,
  localAddress: string | null,
): ConnectionCheckLine {
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
        text: `${host} refused the connection on port ${String(AMCP_PORT)}. CasparCG is not running there, or the port is closed.`,
      };
    case 'timeout':
      return {
        id: 'amcp',
        status: 'fail',
        text: `No answer from ${host} on port ${String(AMCP_PORT)}: its firewall drops this machine. The Playout's administrator runs this on the Playout server:`,
        command: `.\\secure-ports.ps1 -AllowAmcpFrom ${localAddress ?? '<this machine>'}`,
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

async function checkJwks(probes: CheckProbes, url: string): Promise<ConnectionCheckLine> {
  let answer: HttpAnswer;
  try {
    answer = await probes.request('GET', url, { accept: 'application/json' });
  } catch {
    return { id: 'api', status: 'fail', text: `The Playout did not answer at ${url}.` };
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
): Promise<ConnectionCheckLine> {
  const refused: ConnectionCheckLine = {
    id: 'cors',
    status: 'fail',
    text: "The Playout does not accept sign-in from this console. Its administrator adds this line to the Playout's CORS list:",
    command: origin,
  };
  let answer: HttpAnswer;
  try {
    answer = await probes.request('OPTIONS', tokenUrl, {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    });
  } catch {
    return { id: 'cors', status: 'fail', text: `The Playout did not answer at ${tokenUrl}.` };
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

function probeRequest(
  method: 'GET' | 'OPTIONS',
  url: string,
  headers: Record<string, string>,
): Promise<HttpAnswer> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const req = lib.request(target, { method, headers, timeout: HTTP_TIMEOUT_MS }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        if (body.length < 256 * 1024) body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
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
