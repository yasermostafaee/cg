import type { AuditEntry, StackItemState } from '@cg/shared-schema';
import {
  AuditRecentChannel,
  EmptiedAirNoticeChangedChannel,
  EmptiedAirNoticeChannel,
  FixedLayersStateChangedChannel,
  FixedLayersStateChannel,
  LayersClearedOutsideChangedChannel,
  LayersClearedOutsideChannel,
  LayersOrphansChangedChannel,
  LayersOrphansChannel,
  LayersOwnedOccupancyChangedChannel,
  LayersOwnedOccupancyChannel,
  LiveLayersMediaStateChangedChannel,
  LiveLayersMediaStateChannel,
  LiveLayersStateChangedChannel,
  LiveLayersStateChannel,
  LivePlateReleasedChannel,
  PgmReturnStatusChangedChannel,
  PgmReturnStatusChannel,
  PlayoutLayersStateChangedChannel,
  PlayoutLayersStateChannel,
  RehearseStateChangedChannel,
  RehearseStateChannel,
  StackRestoreReportChangedChannel,
  StackRestoreReportChannel,
  StackSnapshotChannel,
  StackStateChangedChannel,
  StationStraysChangedChannel,
  StationStraysChannel,
  type EmptiedAirNotice,
  type LivePlateReleaseState,
  type StackRestoreReport,
  type StationStray,
} from '@cg/shared-ipc';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D4, `R-068`) — **WHAT EACH CONSOLE IS TOLD: ONLY THE CHANNELS ITS SIGN-IN
 * HOLDS.**
 *
 * One CG Bridge now serves every console on the station, so a push or an answer is no longer one
 * console's own business. The prompt's rule, verbatim: _"a token without channel 2 → no command on
 * channel 2, and none of its state."_ The command half has been the request gate's since `C-038`;
 * this is the state half, and it lives in ONE table so that no channel can be forgotten:
 *
 *   - **scoped** — the payload says what is ON a channel (the stack, the per-slot state, the ledger,
 *     the media clock, the playout layers, orphans, layers cleared outside, owned occupancy, the
 *     restart notice, the restore report, strays, rehearse, the PGM return, the audit rows). Its
 *     projection drops every entry on a channel the socket does not hold. An entry that names NO
 *     channel (a stack row with no slot, a notice row with no layer) is on none, and is told to
 *     every console, as every console has always shown it.
 *   - **station-wide** — CONFIGURATION or the station's own health: the banks, channel settings,
 *     the template library, the source catalogue and assignments, delimiters, the server list and
 *     its health, the lock, the pending update. A console needs the whole of it to draw its own
 *     channel correctly (the bank set decides a verb's channel scope; a whole-set write is built
 *     from the whole set), and none of it is what is on another channel's air.
 *   - **per-socket** — already computed for this socket's principal by its handler
 *     (`auth.state`, `channels.list`, the catalogue).
 *   - **intent** — a command. Its answer is the verdict on the principal's OWN press, which the
 *     request gate has already judged (and PANIC is unscoped by rule, so its verdict is too).
 *
 * ⚠ **The table is exhaustive, and a test holds it so** (`channel-scope.test.ts`): every route the
 * bridge builds and every publish channel the runtime can push is classified, and nothing
 * classified is stale. A channel added without a line here fails that test — and until it is
 * classified, a scoped socket is told NOTHING on it ({@link scopePayload} fails closed).
 *
 * ⚠ Auth OFF, and a `*` grant, are not scoped at all: the payload goes out as it always did, byte
 * for byte (`null` scope).
 */

/** The channels a socket holds. `null` — every channel. */
export type Holds = (channel: number) => boolean;

/** What a projection may ask the runtime: an item's channels, for a payload that names only an item. */
export interface ScopeContext {
  readonly channelsForItem: (itemId: string) => readonly number[];
}

/** Returned for a payload a socket is told nothing of at all (it is then not sent). */
export const TELL_NOTHING: unique symbol = Symbol('tell nothing');

type Projection = (payload: unknown, holds: Holds, ctx: ScopeContext) => unknown;

export type ScopeEntry =
  | { readonly kind: 'scoped'; readonly project: Projection }
  | { readonly kind: 'station-wide' }
  | { readonly kind: 'per-socket' }
  | { readonly kind: 'intent' };

/** An entry naming no channel is on none, and is told; one naming a channel is told if it is held. */
function told(holds: Holds, channel: number | undefined): boolean {
  return channel === undefined || holds(channel);
}

function scoped<T>(
  project: (payload: T, holds: Holds, ctx: ScopeContext) => T | typeof TELL_NOTHING,
): ScopeEntry {
  // Sound because the table pairs each name with the projection written for its payload, and the
  // payload has already been parsed against that channel's own schema when it gets here.
  return { kind: 'scoped', project: project as Projection };
}

// ── the projections ─────────────────────────────────────────────────────────────────────────

/** The stack: a row by its slot's channel; a row with no slot is on no channel. */
export function stackFor(items: readonly StackItemState[], holds: Holds): StackItemState[] {
  return items.filter((i) => told(holds, i.slot?.channel));
}

/** Every list whose rows carry their own `channel` — the per-slot state, the ledger, and the rest. */
export function rowsFor<T extends { readonly channel: number }>(
  rows: readonly T[],
  holds: Holds,
): T[] {
  return rows.filter((r) => holds(r.channel));
}

/**
 * The restore report: a skip by its retained slot, a migration by EITHER end (the row it came from
 * and the row it came back on — a console holding either sees the row). `null` when nothing is
 * left, as the bridge answers when there is nothing to say.
 */
export function restoreReportFor(
  report: StackRestoreReport | null,
  holds: Holds,
): StackRestoreReport | null {
  if (report === null) return null;
  const skipped = report.skipped.filter((s) => told(holds, s.slot?.channel));
  const migrated = report.migrated.filter((m) => holds(m.from.channel) || holds(m.to.channel));
  return skipped.length === 0 && migrated.length === 0 ? null : { ...report, skipped, migrated };
}

/**
 * The restart notice: its rows by their layer's channel, and its seats recounted from their
 * channels. `null` when no row is left — the schema requires at least one, and "no notice" is
 * the honest answer for a console none of whose rows were emptied.
 */
export function emptiedAirFor(
  notice: EmptiedAirNotice | null,
  holds: Holds,
): EmptiedAirNotice | null {
  if (notice === null) return null;
  const rows = notice.rows.filter((r) => told(holds, r.slot?.channel));
  if (rows.length === 0) return null;
  const seatChannels = notice.seatChannels?.filter(holds);
  return {
    ...notice,
    rows,
    ...(seatChannels !== undefined ? { seatChannels, seatsDropped: seatChannels.length } : {}),
  };
}

/** Strays sit on channels the station does not declare; each is told to whoever holds its channel. */
export function straysFor(strays: readonly StationStray[], holds: Holds): StationStray[] {
  return strays.filter((s) => holds(s.casparChannel));
}

/**
 * The audit rows: a row about a layer by its slot, a refusal by the channel it was refused ON.
 * Rows about neither (an import, a sign-in) are the station's, and every console reads them.
 */
export function auditFor(rows: readonly AuditEntry[], holds: Holds): AuditEntry[] {
  return rows.filter((e) => told(holds, e.slot?.channel) && told(holds, e.refused?.casparChannel));
}

/**
 * A plate's release names its ROW and no channel: told to a console that holds a channel the row is
 * on. A row the bridge can no longer place is told to nobody scoped — an unscoped console (auth
 * OFF, a `*` grant) still hears it.
 */
export function plateReleaseFor(
  release: LivePlateReleaseState,
  holds: Holds,
  ctx: ScopeContext,
): LivePlateReleaseState | typeof TELL_NOTHING {
  return ctx.channelsForItem(release.itemId).some(holds) ? release : TELL_NOTHING;
}

const STACK = scoped<readonly StackItemState[]>(stackFor);
const ROWS = scoped<readonly { readonly channel: number }[]>(rowsFor);
const RESTORE_REPORT = scoped<StackRestoreReport | null>(restoreReportFor);
const EMPTIED_AIR = scoped<EmptiedAirNotice | null>(emptiedAirFor);
const STRAYS = scoped<readonly StationStray[]>(straysFor);
const AUDIT = scoped<readonly AuditEntry[]>(auditFor);
const PLATE_RELEASED = scoped<LivePlateReleaseState>(plateReleaseFor);
/**
 * `PLAYOUT-FEATURES-01` E — the meter readings on channels the socket holds, and NOTHING — not an empty list,
 * which the schema refuses — when none is left: a console on channel 1 hears no message at channel 2's rate.
 */
export function readingsFor<T extends { readonly channel: number }>(
  readings: readonly T[],
  holds: Holds,
): T[] | typeof TELL_NOTHING {
  const kept = rowsFor(readings, holds);
  return kept.length === 0 ? TELL_NOTHING : kept;
}
const READINGS = scoped<readonly { readonly channel: number }[]>(readingsFor);
const STATION_WIDE: ScopeEntry = { kind: 'station-wide' };
const PER_SOCKET: ScopeEntry = { kind: 'per-socket' };
const INTENT: ScopeEntry = { kind: 'intent' };

// ── the table ───────────────────────────────────────────────────────────────────────────────

/** Every channel the bridge PUSHES, by name. */
export const PUBLISH_SCOPE: Readonly<Record<string, ScopeEntry>> = {
  // What is on a channel.
  [StackStateChangedChannel.name]: STACK,
  [StackRestoreReportChangedChannel.name]: RESTORE_REPORT,
  [EmptiedAirNoticeChangedChannel.name]: EMPTIED_AIR,
  [FixedLayersStateChangedChannel.name]: ROWS,
  [PlayoutLayersStateChangedChannel.name]: ROWS,
  [LiveLayersStateChangedChannel.name]: ROWS,
  [LiveLayersMediaStateChangedChannel.name]: ROWS,
  [LivePlateReleasedChannel.name]: PLATE_RELEASED,
  [LayersOrphansChangedChannel.name]: ROWS,
  [LayersClearedOutsideChangedChannel.name]: ROWS,
  [LayersOwnedOccupancyChangedChannel.name]: ROWS,
  [RehearseStateChangedChannel.name]: ROWS,
  [PgmReturnStatusChangedChannel.name]: ROWS,
  // `PLAYOUT-FEATURES-01` E — the Playout's meters, per reading, by its channel.
  'meters.changed': READINGS,
  [StationStraysChangedChannel.name]: STRAYS,
  // Computed for this socket's principal already.
  'auth.state-changed': PER_SOCKET,
  'channels.changed': PER_SOCKET,
  // Configuration and the station's own health.
  'connections.health-changed': STATION_WIDE,
  'connections.config-changed': STATION_WIDE,
  'lock.state-changed': STATION_WIDE,
  'update.state-changed': STATION_WIDE,
  'fixedLayers.config-changed': STATION_WIDE,
  'fixedLayers.banks-changed': STATION_WIDE,
  'templates.changed': STATION_WIDE,
  // `CONSOLE-POLISH-01` (`B-300`) — who changed it: as wide as the catalogue it names.
  'templates.acted': STATION_WIDE,
  'delimiters.changed': STATION_WIDE,
  'channelSettings.changed': STATION_WIDE,
  'sources.config-changed': STATION_WIDE,
  'sources.assignments-changed': STATION_WIDE,
  // `CENTRAL-BRIDGE-01` (D7) — the bridge's own Playout session: one per bridge.
  'bridgeSession.state-changed': STATION_WIDE,
  // `PLAYOUT-FEATURES-01` D — one Playout, one CG license.
  'license.state-changed': STATION_WIDE,
};

/** Every route the bridge ANSWERS, by name. */
export const ROUTE_SCOPE: Readonly<Record<string, ScopeEntry>> = {
  // ── reads of what is on a channel ──
  [StackSnapshotChannel.name]: STACK,
  [StackRestoreReportChannel.name]: RESTORE_REPORT,
  [EmptiedAirNoticeChannel.name]: EMPTIED_AIR,
  [FixedLayersStateChannel.name]: ROWS,
  [PlayoutLayersStateChannel.name]: ROWS,
  [LiveLayersStateChannel.name]: ROWS,
  [LiveLayersMediaStateChannel.name]: ROWS,
  [LayersOrphansChannel.name]: ROWS,
  [LayersClearedOutsideChannel.name]: ROWS,
  [LayersOwnedOccupancyChannel.name]: ROWS,
  [RehearseStateChannel.name]: ROWS,
  [PgmReturnStatusChannel.name]: ROWS,
  [StationStraysChannel.name]: STRAYS,
  [AuditRecentChannel.name]: AUDIT,
  // ── reads computed for this socket already ──
  'auth.state': PER_SOCKET,
  'channels.list': PER_SOCKET,
  'channels.catalogue': PER_SOCKET,
  // `CENTRAL-BRIDGE-01` (D9) — issued only for a channel this socket's sign-in holds (the handler).
  'pgmReturn.ticket': PER_SOCKET,
  // ── reads of configuration, health and the library ──
  'app.info': STATION_WIDE,
  'audit.health': STATION_WIDE,
  'auth.sign-in-failure': STATION_WIDE,
  'bridge.capabilities': STATION_WIDE,
  'channelSettings.get': STATION_WIDE,
  'connections.config': STATION_WIDE,
  'connections.health': STATION_WIDE,
  'connections.template-serve': STATION_WIDE,
  'delimiters.list': STATION_WIDE,
  'fixedLayers.banks': STATION_WIDE,
  'fixedLayers.config': STATION_WIDE,
  'lock.state': STATION_WIDE,
  'setup.channel-occupancy': STATION_WIDE,
  'setup.check': STATION_WIDE,
  'setup.route-address': STATION_WIDE,
  'sources.assignments': STATION_WIDE,
  'sources.config': STATION_WIDE,
  'sources.media-search': STATION_WIDE,
  'sources.refresh': STATION_WIDE,
  'templates.get': STATION_WIDE,
  'templates.list': STATION_WIDE,
  'templates.page': STATION_WIDE,
  'update.state': STATION_WIDE,
  'bridgeSession.state': STATION_WIDE,
  'license.state': STATION_WIDE,
  // `CENTRAL-BRIDGE-01` §1 A — the logs are no channel's; a `station-admin` asks for them.
  'bridge.logs-ticket': STATION_WIDE,
  // ── intents: the answer is the verdict on the principal's own press ──
  'air.dismiss-emptied': INTENT,
  'air.restore-emptied': INTENT,
  'auth.sign-out': INTENT,
  'channelSettings.set': INTENT,
  'connections.failover': INTENT,
  'connections.set-config': INTENT,
  'delimiters.set': INTENT,
  'fixedLayers.clear-layer': INTENT,
  'fixedLayers.load': INTENT,
  'fixedLayers.set-banks': INTENT,
  'fixedLayers.set-config': INTENT,
  'layers.clear': INTENT,
  'lock.engage': INTENT,
  'lock.release': INTENT,
  'playoutLayers.clear': INTENT,
  'rehearse.enter': INTENT,
  'rehearse.exit': INTENT,
  'sources.set-assignments': INTENT,
  'sources.set-config': INTENT,
  'sources.set-media-playback': INTENT,
  'stack.clear-all': INTENT,
  // `B-301` — dismissing a row's error: an operator verb on that row, judged as its removal is.
  'stack.dismiss-error': INTENT,
  'stack.dismiss-restore-report': INTENT,
  'stack.load': INTENT,
  'stack.media-plate-transport': INTENT,
  'stack.next': INTENT,
  'stack.out': INTENT,
  'stack.remove': INTENT,
  'stack.remove-all': INTENT,
  'stack.set-active-look': INTENT,
  'stack.set-pass-timing': INTENT,
  'stack.set-plate-volume': INTENT,
  'stack.set-plate-volumes': INTENT,
  'stack.set-position': INTENT,
  'stack.silence-all-live-plates': INTENT,
  'stack.silence-channel-live-plates': INTENT,
  'stack.stop': INTENT,
  'stack.stop-all': INTENT,
  'stack.swap-live-source': INTENT,
  'stack.take': INTENT,
  'stack.update': INTENT,
  'station.take-off-air': INTENT,
  'templates.import': INTENT,
  'templates.remove': INTENT,
  'update.cancel': INTENT,
  'update.request': INTENT,
  'bridgeSession.sign-in': INTENT,
};

/**
 * What a socket holding `holds` is told of `payload` on `name` — the payload itself, its
 * projection, or {@link TELL_NOTHING}. `holds === null` (auth OFF, a `*` grant) is every channel:
 * the payload unchanged, and no lookup at all.
 *
 * ⚠ FAILS CLOSED: a name the table does not classify tells a scoped socket nothing. The coverage
 * test keeps that from ever happening; this keeps a slip from leaking if it does.
 */
export function scopePayload(
  table: Readonly<Record<string, ScopeEntry>>,
  name: string,
  payload: unknown,
  holds: Holds | null,
  ctx: ScopeContext,
): unknown {
  if (holds === null) return payload;
  const entry = table[name];
  if (entry === undefined) return TELL_NOTHING;
  return entry.kind === 'scoped' ? entry.project(payload, holds, ctx) : payload;
}
