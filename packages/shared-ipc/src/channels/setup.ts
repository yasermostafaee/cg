import { z } from 'zod';
import { defineChannel } from '../channel.js';

/**
 * 🔴 `DESKTOP-APPS-01` — **SETTING A STATION UP: the first-run phase, the connection check, and
 * the Playout's channel list as first-run needs it.**
 *
 * An installed CG Control (ADR 0011) starts knowing nothing about its plant. First-run asks for
 * ONE thing — the Playout's address — and learns the rest: the Playout's issuer from the first
 * `station-admin` sign-in (`DESKTOP-APPS-01-A` A2), and the CasparCG host from the Playout's own
 * channel list.
 *
 * ⚠ **None of these channels writes auth configuration.** The Playout address is written by the
 * desktop app itself, never over the control socket (ADR 0011); the channel and the CasparCG host
 * go through the existing `station-admin` doors (`fixedLayers.set-config`,
 * `connections.set-config`).
 */

/**
 * Where a station is in first-run, advertised on `bridge.capabilities` (an unauthenticated socket
 * must be able to ask). ABSENT once the station is set up, and always for a bridge not started as
 * an installed station.
 *
 *   - `target`  — no Playout is configured: first-run asks for its address;
 *   - `channel` — the Playout is configured and the station has declared no channel yet: a
 *                 `station-admin` signs in and picks one.
 */
export const SetupPhaseSchema = z.enum(['target', 'channel']);
export type SetupPhase = z.infer<typeof SetupPhaseSchema>;

/**
 * 🔴 `DESKTOP-APPS-01-C` C2 — **THE CHECK'S BOUNDS, AND THE CONSOLE'S WAIT, FROM ONE CONSTANT.**
 *
 * Measured on the owner's machine (2026-09-23): the check ran its probes ONE AFTER ANOTHER, with a
 * black-hole Playout taking AMCP 3.0 s + the key set 5.0 s + CORS 5.0 s = 13.7 s — and the console
 * gave every request 8 s, so the operator got `Bridge request timed out: setup.check` and no line
 * at all. Now every probe connects within {@link CONNECTION_CHECK_CONNECT_MS}, every LINE is
 * finished within {@link CONNECTION_CHECK_LINE_MS} (a line that is not says so in its own words),
 * the lines run in parallel, and the console waits {@link SETUP_CHECK_WAIT_MS} — derived here, so
 * the wait can never again be shorter than the work.
 */
export const CONNECTION_CHECK_CONNECT_MS = 3000;
export const CONNECTION_CHECK_LINE_MS = 5000;
/** How long the console waits for `setup.check`: the slowest line's bound, twice over. */
export const SETUP_CHECK_WAIT_MS = CONNECTION_CHECK_LINE_MS * 2;

/** `DESKTOP-APPS-01-C` C3 — the contract's API port: an `http://` Playout address with no port has it. */
export const PLAYOUT_API_PORT = 8080;

/**
 * 🔴 `DESKTOP-APPS-01-C` C3 — **THE ONE NORMALISATION OF A TYPED PLAYOUT ADDRESS**, used by the
 * console (and shown back in the field) and by the bridge (`playoutEndpointsFor`), so the address
 * checked, the address written and the address read can never differ.
 *
 *   - no scheme → `http://` is assumed;
 *   - `http://` with no port → the contract's API port, {@link PLAYOUT_API_PORT};
 *   - an explicit port is kept byte for byte (`:80` included — the URL parser would drop it);
 *   - trailing slashes go; anything that is not an `http(s)` address with a host is `null`.
 *
 * Measured: the owner typed `http://192.168.21.111` and the check probed port 80, where nothing
 * answers — the address he meant was `:8080`.
 */
/**
 * The WHATWG `URL`, present in every runtime this package runs in (browser and Node) but not in
 * its type library — reached through a narrow local type, as `sources.ts` reaches `crypto`.
 */
const WhatwgUrl = (
  globalThis as unknown as { URL: new (input: string) => { protocol: string; hostname: string } }
).URL;

export function normalisePlayoutAddress(typed: string): string | null {
  const trimmed = typed.trim();
  if (trimmed === '') return null;
  const schemed = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  // Trailing slashes go from what follows `//` only — `http://` must not collapse to `http:`.
  const slashes = schemed.indexOf('//') + 2;
  const withScheme = schemed.slice(0, slashes) + schemed.slice(slashes).replace(/\/+$/, '');
  let url: { protocol: string; hostname: string };
  try {
    url = new WhatwgUrl(withScheme);
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname === '') return null;
  const start = withScheme.indexOf('//') + 2;
  const authority = withScheme.slice(start).split(/[/?#]/, 1)[0] ?? '';
  const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1);
  // What follows the host: `:8080`, or nothing. An IPv6 host keeps its own colons in brackets.
  const afterHost = hostAndPort.startsWith('[')
    ? hostAndPort.slice(hostAndPort.indexOf(']') + 1)
    : hostAndPort.slice(hostAndPort.includes(':') ? hostAndPort.indexOf(':') : hostAndPort.length);
  if (/^:\d+$/.test(afterHost) || url.protocol !== 'http:') return withScheme;
  // `http://host` or `http://host:` — the API port goes in right after the host.
  const hostEnd = start + authority.length - (afterHost === ':' ? 1 : 0);
  return `${withScheme.slice(0, hostEnd)}:${String(PLAYOUT_API_PORT)}${withScheme.slice(start + authority.length)}`;
}

/** The seven links the connection check reads, in the order it reads them. */
export const CONNECTION_CHECK_IDS = [
  'proxy',
  'route',
  'amcp',
  'api',
  'cors',
  'ports',
  'topology',
] as const;
export const ConnectionCheckIdSchema = z.enum(CONNECTION_CHECK_IDS);
export type ConnectionCheckId = z.infer<typeof ConnectionCheckIdSchema>;

/**
 * One line of the connection check: pass, fail, or — for the topology, which is advice rather
 * than a blocker — warn. `text` is the operator's sentence: on a failure, what is wrong and what
 * to do. `command` is the ONE line somebody else must run or add (the AMCP allow rule, the CORS
 * origin), carried apart from the sentence so the console can show it to copy.
 *
 * `wait` (`DESKTOP-APPS-01-B` B2) is NEUTRAL: a link that is not judged yet because something
 * else must happen first — AMCP before any `station-admin` has signed in, since a Playout 2.8.54
 * opens AMCP to this machine only then. Never a failure.
 *
 * `skip` (`CHECK-RERUN-01` B) is NEUTRAL too: a link NOT CHECKED because a link it needs failed —
 * CORS while the Playout's API cannot sign anyone in. The failure is said once, on the line that
 * failed; this line names only the reason, after its {@link connectionCheckSubject}.
 */
export const ConnectionCheckLineSchema = z.object({
  id: ConnectionCheckIdSchema,
  status: z.enum(['pass', 'fail', 'warn', 'wait', 'skip']),
  text: z.string(),
  command: z.string().optional(),
});
export type ConnectionCheckLine = z.infer<typeof ConnectionCheckLineSchema>;

/**
 * 🔴 `CHECK-RERUN-01` — **EACH LINE'S SUBJECT: what it checks, with no verdict.** The console shows
 * it beside the pending mark while a check runs, and a line that is not checked opens with it — one
 * spelling for both, so the line the operator watched is the line that fills in. `host` is the host
 * the line probes (CasparCG's for `amcp`, the Playout's otherwise); `port` is the Playout API's.
 */
export function connectionCheckSubject(id: ConnectionCheckId, host: string, port: string): string {
  switch (id) {
    case 'proxy':
      return 'VPN or proxy';
    case 'route':
      return `Route to ${host}`;
    case 'amcp':
      return `CasparCG on ${host}`;
    case 'api':
      return `The Playout on port ${port}`;
    case 'cors':
      return 'Sign-in from this console';
    case 'ports':
      return "This station's ports";
    case 'topology':
      return 'Where the Playout and CasparCG run';
  }
}

export const ConnectionCheckRequestSchema = z.object({
  /** The Playout's address as typed (`http://host:port`) — a CANDIDATE, not configuration. */
  playoutAddress: z.string().min(1),
  /** The CasparCG host to probe; the Playout's host when absent (the engine runs beside it). */
  casparHost: z.string().min(1).optional(),
  /** The console's own origin, which the Playout's CORS list must carry. */
  origin: z.string().min(1),
});
export type ConnectionCheckRequest = z.infer<typeof ConnectionCheckRequestSchema>;

export const ConnectionCheckResultSchema = z.object({
  lines: z.array(ConnectionCheckLineSchema),
  /** This machine's address on the route to the CasparCG host — the serve-host default. */
  localAddress: z.string().nullable(),
});
export type ConnectionCheckResult = z.infer<typeof ConnectionCheckResultSchema>;

/**
 * `DESKTOP-APPS-01` §2F — the connection check. A read: it probes and reports and changes
 * nothing. Reachable with auth off (first-run's `target` phase) and to any signed-in principal
 * (Station setup) — never to an unauthenticated socket on a station that authenticates.
 */
export const SetupCheckChannel = defineChannel(
  'setup.check',
  ConnectionCheckRequestSchema,
  ConnectionCheckResultSchema,
);

/**
 * §2E — this machine's address on the route to a host: the template serve host CasparCG fetches
 * from, AUTO-DETECTED rather than typed, and shown so it can be edited. `null` when no route.
 */
export const SetupRouteAddressChannel = defineChannel(
  'setup.route-address',
  z.object({ host: z.string().min(1) }),
  z.object({ address: z.string().nullable() }),
);

/**
 * 🔴 `DESKTOP-APPS-01-D` d — **IS THIS CHANNEL ALREADY ON AIR WITH SOMEBODY ELSE'S CONTENT?**
 *
 * Asked by first-run (and Station setup's Change channel…) after the connection is written and
 * BEFORE the channel is declared, so the admin is warned once — never blocked: at a client, CG
 * graphics do belong on the programme channel, above the Playout's layers. A read of the primary's
 * occupancy tap; `unknown` (the tap never heard) warns of nothing.
 *
 * `casparChannel`, not a top-level `channel`: the station fence refuses a route naming a channel
 * the station does not declare, and asking about a channel before declaring it is this read's job.
 */
export const SetupChannelOccupancyChannel = defineChannel(
  'setup.channel-occupancy',
  z.object({ casparChannel: z.number().int().positive() }),
  z.object({
    state: z.enum(['occupied', 'empty', 'unknown']),
    layers: z.array(z.object({ layer: z.number().int().positive(), producer: z.string() })),
  }),
);
export type ChannelOccupancy = z.infer<typeof SetupChannelOccupancyChannel.response>;

/** One row of the Playout's channel list as first-run shows it: UNJOINED, host and all. */
export const CatalogueChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  /**
   * The CasparCG host this channel plays on — the choice that DEFINES this station's server.
   * A loopback value from the Playout has already been resolved to the Playout's own host by the
   * bridge's one D4 reader (`DESKTOP-APPS-01-A` A4).
   */
  casparHost: z.string(),
  casparChannel: z.number().int().positive(),
});
export type CatalogueChannel = z.infer<typeof CatalogueChannelSchema>;

/**
 * 🔴 §2E step 3 — **THE PLAYOUT'S CHANNELS, UNJOINED, IN THIS PRINCIPAL'S GRANT.**
 *
 * `channels.list` joins a row to this station only when its `casparHost` is one the bridge
 * already drives — so on a fresh station, whose only server is the default `127.0.0.1`, it names
 * nothing, and first-run could never pick. This answers the raw rows, read through the SAME
 * guarded D4 reader (`usableBearer`, 30 s, `ETag`), filtered by `grantsChannel` for the asking
 * principal against each row's own host.
 *
 * `station-admin` only. It writes nothing: the choice goes through the declaration door
 * (`fixedLayers.set-config`), and the station fence reads the bank alone. `rows: null` means the
 * Playout's list is ABSENT (unreachable, or no bearer) — first-run then falls back to two fields.
 */
export const ChannelsCatalogueChannel = defineChannel(
  'channels.catalogue',
  z.void(),
  z.object({ rows: z.array(CatalogueChannelSchema).nullable() }),
);
