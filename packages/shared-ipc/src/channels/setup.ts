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
 */
export const ConnectionCheckLineSchema = z.object({
  id: ConnectionCheckIdSchema,
  status: z.enum(['pass', 'fail', 'warn']),
  text: z.string(),
  command: z.string().optional(),
});
export type ConnectionCheckLine = z.infer<typeof ConnectionCheckLineSchema>;

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
