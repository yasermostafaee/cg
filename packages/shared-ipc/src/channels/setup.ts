import { z } from 'zod';
import { ChannelOutputSchema, ChannelPlaylistSchema } from './stationChannels.js';
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

/**
 * `DESKTOP-APPS-01-B` — how long after a `station-admin` signs in the AMCP line still WAITS for the
 * Playout to let this machine in, before it names the approval; the bridge's link retries promptly
 * for this long. Here, not in the bridge, because the console's wait for the one re-run that holds
 * the AMCP line ({@link SETUP_CHECK_LET_IN_WAIT_MS}) is derived from it.
 */
export const AMCP_TRUST_WINDOW_MS = 30_000;

/**
 * `DELTA-MULTI-CHANNEL-01-A` A2 — how long the console waits for a check that asked the bridge to
 * hold its AMCP line ({@link ConnectionCheckRequest}'s `awaitLetIn`): the whole trust window, then a
 * check's own wait on top — derived, so the wait can never be shorter than the hold.
 */
export const SETUP_CHECK_LET_IN_WAIT_MS = AMCP_TRUST_WINDOW_MS + SETUP_CHECK_WAIT_MS;

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

/** `CENTRAL-BRIDGE-01` (D8) — the one refusal of a Playout address a console cannot find CG Bridge from. */
export const NOT_A_PLAYOUT_ADDRESS = 'That is not a Playout address.';

/** `CENTRAL-BRIDGE-01` (D8) — the one refusal of a CG Bridge address that is not `host` or `host:port`. */
export const NOT_A_BRIDGE_ADDRESS = 'That is not a CG Bridge address.';

/**
 * `host` or `host:port` — an IPv6 host in brackets — as its parts, or `null` for anything else (a
 * scheme, a path, a query, credentials, a space, a port out of range). The port is read from the
 * TEXT: the URL parser drops a scheme's default port (`ws://host:80` reads back with none).
 */
export function splitHostPort(value: string): { host: string; port: number | null } | null {
  const trimmed = value.trim();
  if (trimmed === '' || /[\s/?#@]/.test(trimmed)) return null;
  const m = /^(\[[0-9a-fA-F:.]+\]|[^:[\]]+)(?::(\d{1,5}))?$/.exec(trimmed);
  const host = m?.[1];
  if (m === null || host === undefined) return null;
  const port = m[2] === undefined ? null : Number(m[2]);
  if (port !== null && (port < 1 || port > 65535)) return null;
  try {
    if (new WhatwgUrl(`http://${host}`).hostname === '') return null;
  } catch {
    return null;
  }
  return { host, port };
}

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D8) — **A TYPED CG BRIDGE ADDRESS**, for a console whose CG Bridge is NOT on
 * the Playout's host (a separate server): `host` or `host:port` as typed, `''` for nothing typed (CG
 * Bridge is on the Playout's host, at its port), `null` for anything else.
 */
export function normaliseBridgeAddress(typed: string): string | null {
  if (typed.trim() === '') return '';
  const parts = splitHostPort(typed);
  if (parts === null) return null;
  return parts.port === null ? parts.host : `${parts.host}:${String(parts.port)}`;
}

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

/**
 * The lines CG Bridge answers the connection check with. Most probe a link; four (`R-081`,
 * `CONSOLE-POLISH-01` §6) READ CG Bridge's own state — its Playout session, CasparCG's OSC, the CG
 * license and the channels the asker's sign-in holds — and are answered only for this station's own
 * Playout. Their ORDER on screen is {@link CONNECTION_CHECK_GROUPS}'s, not this list's.
 *
 * 🔴 `R-090` — `ports` and `topology` are RETIRED: CG Bridge no longer writes them (they judged the
 * machine it runs on), and the console drops them ({@link RETIRED_CHECK_IDS}). They stay in this enum
 * only so an older CG Bridge's answer still parses.
 */
export const CONNECTION_CHECK_IDS = [
  'proxy',
  'route',
  'amcp',
  'api',
  'cors',
  'ports',
  'topology',
  'bridge-session',
  'osc',
  'license',
  'channels',
  // `R-084` (`RELEASE-0111-01-A` A1) — the Playout's own version, `GET /api/v1/system/version`.
  'playout-version',
] as const;
export const ConnectionCheckIdSchema = z.enum(CONNECTION_CHECK_IDS);
export type ConnectionCheckId = z.infer<typeof ConnectionCheckIdSchema>;

/** `R-090` — the ids an older CG Bridge may still send and no console shows. */
export const RETIRED_CHECK_IDS: readonly ConnectionCheckId[] = ['ports', 'topology'];

/**
 * `R-081` — the lines a CONSOLE adds to the check from what only it knows, never on the wire: where it
 * found CG Bridge (the address it dialled), CG Bridge's release against its own, and its own sign-in.
 */
export const CONSOLE_CHECK_IDS = [
  'bridge',
  // `R-090` — a port CG Bridge cannot open, read off its `/health`, naming CG Bridge's host.
  'bridge-ports',
  'bridge-version',
  'signin',
  // `RELEASE-0112-01` (`R-085`) — CG Bridge's own session on the BACKUP engine (from `bridgeSession.engines`).
  'bridge-session-backup',
] as const;
export type ConsoleCheckId = (typeof CONSOLE_CHECK_IDS)[number];
/** Any line of the check as a console shows it. */
export type CheckLineId = ConnectionCheckId | ConsoleCheckId;

/**
 * 🔴 `R-081` (`CONSOLE-POLISH-01` §6) — **THE CHECK READS IN THE ORDER THINGS HAPPEN**, in four
 * visible groups, so the sign-in reads as the GATE between what needs nothing and what needs a
 * signed-in session — not as a middle item (the owner's first-run, 2026-09-30: the "waiting for
 * sign-in" line sat third, between two that need nothing).
 *
 *   1. **Reachable** — nothing needed: the path (VPN or proxy, the route), the Playout's API, CG Bridge
 *      where the check found it, and a port CG Bridge cannot open (`R-090`);
 *   2. **Versions** — CG Bridge's release against this console's, and the Playout's own version
 *      (`R-084`: `GET /api/v1/system/version`, read by CG Bridge; `not served` is never a refusal);
 *   3. **Sign-in** — whether this console CAN sign in, this console's own sign-in, then CG Bridge's
 *      own Playout session;
 *   4. **After sign-in** — what needs a signed-in session: CasparCG through CG Bridge, OSC, the CG
 *      license, the channels.
 *
 * ONE constant: the bridge orders its answer by it and the console groups by it (golden rule 6). The
 * retired `ports` and `topology` (`R-090`) are in no group.
 */
export const CONNECTION_CHECK_GROUPS = [
  { id: 'reach', title: 'Reachable', lines: ['proxy', 'route', 'api', 'bridge', 'bridge-ports'] },
  { id: 'versions', title: 'Versions', lines: ['bridge-version', 'playout-version'] },
  {
    id: 'sign-in',
    title: 'Sign-in',
    lines: ['cors', 'signin', 'bridge-session', 'bridge-session-backup'],
  },
  {
    id: 'session',
    title: 'After sign-in',
    lines: ['amcp', 'osc', 'license', 'channels'],
  },
] as const satisfies readonly {
  readonly id: string;
  readonly title: string;
  readonly lines: readonly CheckLineId[];
}[];

const CHECK_ORDER: readonly CheckLineId[] = CONNECTION_CHECK_GROUPS.flatMap((g) => g.lines);

/** Lines in {@link CONNECTION_CHECK_GROUPS}' order; a line it does not name keeps its place at the end. */
export function orderCheckLines<T extends { readonly id: string }>(lines: readonly T[]): T[] {
  const rank = (id: string): number => {
    const at = CHECK_ORDER.indexOf(id as CheckLineId);
    return at === -1 ? CHECK_ORDER.length : at;
  };
  return [...lines].sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * One line of the connection check: pass, fail, or — for a finding that is advice rather than a
 * blocker (a VPN or proxy that intercepts nothing of ours, `B-318`) — warn. `text` is the operator's sentence: on a failure, what is wrong and what
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
    // `R-090` — retired: never shown; named only so the switch stays total.
    case 'ports':
      return "CG Bridge's ports";
    case 'topology':
      return 'Topology';
    case 'bridge-session':
      return "CG Bridge's own sign-in";
    case 'osc':
      return 'OSC from CasparCG';
    case 'license':
      return 'CG license';
    case 'channels':
      return "The Playout's channels";
    case 'playout-version':
      return "The Playout's version";
  }
}

export const ConnectionCheckRequestSchema = z.object({
  /** The Playout's address as typed (`http://host:port`) — a CANDIDATE, not configuration. */
  playoutAddress: z.string().min(1),
  /** The CasparCG host to probe; the Playout's host when absent (the engine runs beside it). */
  casparHost: z.string().min(1).optional(),
  /** The console's own origin, which the Playout's CORS list must carry. */
  origin: z.string().min(1),
  /**
   * 🔴 `CENTRAL-BRIDGE-01` rule 8 — **THIS CONSOLE SIGNS IN DIRECTLY.** CG Control posts D1 from its
   * own process, with no `Origin`, so no browser asks the Playout's CORS list and the CORS line has
   * nothing to judge: probing it with CG Control's page origin (`http://tauri.localhost`, which no
   * Playout lists) would disable a sign-in that works, and send a Playout admin to add an entry
   * nobody needs. Absent: a browser console, whose origin the list must carry.
   */
  signIn: z.literal('native').optional(),
  /**
   * 🔴 `DELTA-MULTI-CHANNEL-01-A` A2 — **HOLD THE AMCP LINE UNTIL THIS MACHINE IS LET IN.** Sent only
   * by the console's ONE automatic re-run, after a `station-admin` has signed in, while the AMCP line
   * waits. Within {@link AMCP_TRUST_WINDOW_MS} of that sign-in, the bridge asks CasparCG again ITSELF
   * until it answers or the window ends, and only then answers — so the console asks once and waits
   * ({@link SETUP_CHECK_LET_IN_WAIT_MS}) instead of re-running the whole check every two seconds,
   * which is the loop the owner watched. The other lines run as in any check.
   */
  awaitLetIn: z.literal(true).optional(),
});
export type ConnectionCheckRequest = z.infer<typeof ConnectionCheckRequestSchema>;

/**
 * `DELTA-MULTI-CHANNEL-01-B` B1 — the check before a sign-in asked about another address. The
 * check is open before a sign-in so a console can learn whether a sign-in can work; a check of any
 * other address would make the station probe the network for a caller nobody has vouched for. One
 * sentence, sent by the bridge and shown as it comes (`R-017`), naming only what is involved.
 */
export const CHECK_BEFORE_SIGN_IN_REFUSAL =
  "Before a sign-in, only this station's Playout can be checked.";

export const ConnectionCheckResultSchema = z.object({
  lines: z.array(ConnectionCheckLineSchema),
  /** This machine's address on the route to the CasparCG host — the serve-host default. */
  localAddress: z.string().nullable(),
  /**
   * 🔴 `R-090` — what CG Bridge cannot do about its OWN ports (`/health`'s `port-refused` and
   * `reserved-port`), in its words, carried in the check's answer: a console page cannot read `/health`
   * itself (CG Control's webview does not reach loopback HTTP). Absent from an older CG Bridge.
   */
  bridgeProblems: z.array(z.object({ code: z.string(), message: z.string() })).optional(),
});
export type ConnectionCheckResult = z.infer<typeof ConnectionCheckResultSchema>;

/**
 * `DESKTOP-APPS-01` §2F — the connection check. A read: it probes and reports and changes
 * nothing. Reachable with auth off (first-run's `target` phase), to any signed-in principal
 * (Station setup), and — `DELTA-MULTI-CHANNEL-01-B` B1 — BEFORE ANY SIGN-IN, because it is how a
 * console learns whether a sign-in can work at all. Before a sign-in it checks this station's own
 * Playout and nothing else ({@link CHECK_BEFORE_SIGN_IN_REFUSAL}).
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
  /** `UI-POLISH-01` G — the row's `output`, when the Playout sent one we know (`stationChannels.ts`). */
  output: ChannelOutputSchema.optional(),
  /** `UI-POLISH-01` G — the row's `playlist`, in the Playout's word. Information only. */
  playlist: ChannelPlaylistSchema.optional(),
  /** `PLAYOUT-SOURCES-01` / v1.3 — the running core's video mode; `null` = not there yet. */
  videoMode: z.string().nullable().optional(),
  /** `PLAYOUT-SOURCES-01` / v1.3 — settings differ from the running core. */
  pendingRestart: z.boolean().optional(),
});
export type CatalogueChannel = z.infer<typeof CatalogueChannelSchema>;

/**
 * 🔴 §2E step 3 — **THE PLAYOUT'S CHANNELS, UNJOINED, IN THIS PRINCIPAL'S GRANT.**
 *
 * `channels.list` joins a row to this station only when its `casparHost` is one the bridge
 * already drives — so on a fresh station, whose only server is the default `127.0.0.1`, it names
 * nothing, and first-run could never pick. This answers the raw rows, read through the SAME
 * guarded D4 reader (`usableBearer`, the 5 s floor, `ETag`), filtered by `grantsChannel` for the asking
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
