import {
  DEFAULT_LAYER_POLICY,
  isLiveState,
  LayerManager,
  OutOfLayersError,
  Reconciler,
  RedundancyAdapter,
  ServerSession,
  UnknownTemplateTypeError,
  type FailoverEvent,
  type LayerPolicy,
  type LayerSlot,
  type ServerLabel,
} from '@cg/caspar-client';
import { positionQuery } from '@cg/shared-schema';
import type {
  AuditEntry,
  FieldValues,
  Position,
  RetainedStackItem,
  StackItemState,
} from '@cg/shared-schema';
import {
  isLayerVisible,
  // R-030 — the video-mode token map lives in shared-ipc, not caspar-client, so
  // the browser's MockRuntime can read the SAME map without dragging `node:net`
  // into the SPA bundle (see channelSettings.ts for the full reasoning).
  parseVideoModeFromInfo,
  videoModeRaster,
  type PLAYOUT_CLEAR_REASONS,
  type PlayoutLayerState,
  type DelimiterOption,
  type ChannelResponse,
  type ConnectionConfig,
  type ConnectionHealth,
  type ConnectionsSetConfigChannel,
  type FixedLayerBank,
  type FixedSlotState,
  type LockState,
  type OrphanLayer,
  type OwnedOccupancyWarning,
  type PendingUpdate,
  type Settings,
  type TemplateInfo,
  type ChannelSettings,
  type ChannelSettingsState,
  type CHANNEL_SETTINGS_SET_REASONS,
  type Rehearsal,
  type REHEARSE_ENTER_REASONS,
  type REHEARSE_EXIT_REASONS,
} from '@cg/shared-ipc';
import { ChannelSettingsStore } from './channel-settings-store.js';
import {
  validateFixedBank,
  validateFixedBankChange,
  FixedLayersConfigError,
  type FixedLayersErrorCode,
  type SlotOccupancy,
} from './fixed-layers-store.js';
import { CommandBuilder, type CommandSlot } from './command-builder.js';
import { OrphanTracker } from './orphan-tracker.js';
import { TemplateRegistry } from './template-registry.js';
import { DelimiterStore } from './delimiter-store.js';
import {
  TemplateHttpServer,
  deriveServeOptions,
  isLoopbackHost,
  type TemplateServeOptions,
  type TemplateServeOverride,
} from './template-http-server.js';

/** R-010 — the `connections.set-config` response shape. */
type SetConfigResult = ChannelResponse<typeof ConnectionsSetConfigChannel>;

/** R-028 part B — a refused deliberate playout clear. */
type PlayoutClearReason = (typeof PLAYOUT_CLEAR_REASONS)[number];

/** R-030 — a refused channel-settings change. */
type ChannelSettingsSetReason = (typeof CHANNEL_SETTINGS_SET_REASONS)[number];

/** R-022 — a refused rehearse entry. */
type RehearseEnterReason = (typeof REHEARSE_ENTER_REASONS)[number];
/** R-022 — a refused rehearse exit. */
type RehearseExitReason = (typeof REHEARSE_EXIT_REASONS)[number];

/**
 * R-022 — the wording for a rehearse transition that is already in flight.
 *
 * WHY THIS SERIALISATION EXISTS, because it looks like mere debounce and is not.
 * The mute and the un-mute are separate AMCP round trips, and `exitRehearse`
 * necessarily drops the claim BEFORE its un-mute lands (so the state is honest if
 * the send fails). Two overlapping transitions can therefore interleave as:
 *
 *   exit: drop claim → [await un-mute]
 *   enter:              mute → set claim
 *   exit:                              → un-mute LANDS
 *
 * leaving a row that CLAIMS to be rehearsing while its layer is NOT muted. On
 * 2.5.0 that is audio on air behind a UI insisting the graphic cannot reach air —
 * the worst kind of wrong this feature can be, because the interlock is the whole
 * point of it. Serialising per item makes the interleaving unrepresentable rather
 * than merely unlikely, which is the standard this surface holds everywhere else.
 */
const BUSY_MESSAGE =
  'A rehearse change for this row is still in flight — wait for it to finish, then try again.';

/**
 * R-022 — the volume a layer is INTENDED to have: full.
 *
 * A named constant, not a bare `1`, because it appears in four places that must
 * agree — the take path's unconditional re-assert, the rehearse exit, the startup
 * re-assert, and the tests — and because it is the seam a future per-layer volume
 * feature would replace. Rehearse does NOT change a layer's intended volume; it
 * applies a temporary mute over it, which is why the restore is a re-assert of
 * intent rather than an "un-mute" that has to remember what it clobbered.
 */
const INTENDED_VOLUME = 1;

/**
 * THE on-air predicate for a stack item — the ONE definition of "on air or
 * unsettled", read by R-010's `setConfig` gate, R-030's raster gate, the
 * rehearse-entry guard and the rehearse abort.
 *
 * Extracted because rehearse made it the fourth consumer, and a fourth inline
 * copy of this status list is exactly how one of them comes to disagree — the
 * repo's one-canonical-predicate rule (CLAUDE.md golden rule 6). The stakes
 * differ per caller but the question does not: `updating`/`exiting` ride an
 * on-air producer, and B-044's `unconfirmed` means the on-air result is UNKNOWN.
 * Unknown must count as on air in every one of these gates, because each one's
 * failure mode is acting on a live graphic.
 */
function isOnAirStatus(status: StackItemState['status'], pending: boolean): boolean {
  return (
    pending ||
    status === 'playing' ||
    status === 'on-air' ||
    status === 'updating' ||
    status === 'exiting' ||
    status === 'unconfirmed'
  );
}

/**
 * R-010 — where the OSC UDP ingest binds, derived from the declared server's
 * locality exactly like the template serve path: a LOCAL CasparCG pushes OSC
 * to loopback; a REMOTE one pushes across the LAN, so the ingest must bind a
 * routable interface or confirmations never arrive (render-but-never-confirm,
 * the half-plumbed-remote gap found in the R-010 diagnosis). Data plane only —
 * the control WebSocket bind is not derived from any of this.
 */
export function deriveOscBindHost(serverHost: string): string {
  return isLoopbackHost(serverHost) ? '127.0.0.1' : '0.0.0.0';
}

/** CasparCG video channel the bridge drives (Phase 2: single channel). */
const DEFAULT_CHANNEL = 1;
/** Outbound delta coalescing window (Phase-2 NOTE — bound publishes under churn). */
const COALESCE_MS = 20;
/** Keep the post-reconnect resync window short so the bridge is responsive. */
const RESYNC_MS = 150;
/**
 * B-044 — bounded completion for transient intents (update/out): if the
 * command's AMCP ack has not arrived within this window, the Reconciler
 * expires the intent to the explicit `unconfirmed` state (never a stuck
 * `updating`/`exiting` badge, never a silent revert).
 */
const INTENT_TIMEOUT_MS = 5000;
/**
 * R-009 — orphan-sweep cadence: how often the bridge samples the primary's
 * OSC occupancy tap and compares it against the layers it owns. Zero AMCP
 * traffic per sweep (the tap is passive); an orphan surfaces within two
 * cycles (~10 s worst case at the default).
 */
const SWEEP_MS = 5000;
/**
 * R-009 — an occupancy entry older than this is treated as unoccupied: real
 * CasparCG goes SILENT for a CLEARed layer (B-053) rather than reporting
 * `empty`, so ageing-out IS the empty signal. Far above the wire's per-tick
 * repetition (~50 Hz), far below the sweep cadence doubling.
 */
const OCCUPANCY_STALE_MS = 2500;

/**
 * R-021 stage 2a (D7) — is a FIXED slot busy (a resident item or retained
 * intent)? Reads the two REAL sources: the LayerManager's fixed binding for
 * the slot, and the slot keys of the retained-intent map the restore path
 * uses. Both are empty until stage 3 lands the exact-slot load chain, so this
 * answers false today and becomes correct automatically when bindings exist.
 * Exported + pure so it unit-tests directly.
 */
export function isFixedSlotBusy(
  slot: LayerSlot,
  sources: {
    fixedBinding: (slot: LayerSlot) => string | undefined;
    retainedSlotKeys: ReadonlySet<string>;
  },
): boolean {
  return (
    sources.fixedBinding(slot) !== undefined ||
    sources.retainedSlotKeys.has(`${String(slot.channel)}:${String(slot.layer)}`)
  );
}

/** Minimal typed pub-sub backing the bridge's `on*` publish channels. */
class Emitter<T> {
  readonly #handlers = new Set<(value: T) => void>();
  subscribe(handler: (value: T) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }
  emit(value: T): void {
    for (const handler of [...this.#handlers]) handler(value);
  }
}

/**
 * **Real** C-001 backing. Replaces the throwaway in-memory `RuntimeBacking` with
 * the actual `@cg/caspar-client` stack running in its native Node tier: one
 * `ServerSession` per DECLARED server (A always, B only when the config
 * declares a backup — B-046) under a `RedundancyAdapter` (Phase 3a), a
 * `Reconciler` (the single source of truth for stack state), a `LayerManager`
 * (slot allocation), and the `CommandBuilder` seam.
 *
 * Browser-side everything is unchanged: this answers the same `@cg/shared-ipc`
 * contract `bridge.ts` routes, exposes the same `*Changed` emitters, and the
 * `Reconciler.snapshot()` is published over `StackStateChangedChannel`.
 *
 * Stack state comes from the Reconciler, driven by AMCP acks AND real OSC
 * confirmations from the **current primary** — NOT a hand-rolled state machine.
 * Failover (auto per the strategy's triggers, or manual via `connections.failover`)
 * switches the live server; the published `ConnectionHealth` reflects the real
 * current primary + last failover, and the new primary's OSC re-confirms state.
 * Non-playout channels (lock / templates / audit / settings / update gate) stay
 * simple in-memory stubs.
 *
 * Integration-tested ONLY against `tools/amcp-mock` (NOT real hardware — the
 * on-hardware AMCP-sequence validation is Phase 3b).
 */
export class CasparRuntime {
  readonly stackChanged = new Emitter<readonly StackItemState[]>();
  readonly healthChanged = new Emitter<ConnectionHealth>();
  readonly lockChanged = new Emitter<LockState>();
  readonly settingsChanged = new Emitter<Settings>();
  readonly updateChanged = new Emitter<PendingUpdate | null>();
  /** R-010 — emitted after every successful `setConfig` apply. */
  readonly configChanged = new Emitter<ConnectionConfig>();
  /** R-009 — emitted ONLY when the surfaced orphan-layer set changes. */
  readonly orphansChanged = new Emitter<OrphanLayer[]>();
  /** B-056 — emitted ONLY when the owned-slot warning set changes. */
  readonly ownedOccupancyChanged = new Emitter<OwnedOccupancyWarning[]>();
  /** R-021 stage 2a — emitted after every applied fixed-bank change. */
  readonly fixedConfigChanged = new Emitter<FixedLayerBank | null>();
  /** R-021 stage 2a — emitted ONLY when the per-slot fixed state changes. */
  readonly fixedStateChanged = new Emitter<FixedSlotState[]>();
  /**
   * R-028 (o1) — emitted with the full catalogue after every import/removal,
   * so every connected browser converges on the same library.
   */
  readonly templatesChanged = new Emitter<TemplateInfo[]>();
  /** R-028 part B — emitted ONLY when the declared playout layers' state changes. */
  readonly playoutStateChanged = new Emitter<PlayoutLayerState[]>();
  /** R-034 — emitted with the full delimiter list whenever a browser changes it. */
  readonly delimitersChanged = new Emitter<DelimiterOption[]>();
  /**
   * R-030 — emitted when a browser changes the channel raster AND when a fresh
   * `INFO <channel>` reading lands. Both, because the mismatch verdict is a
   * function of the two together: a new reading can turn a settled `match` into
   * a `mismatch` without anybody touching config.
   */
  readonly channelSettingsChanged = new Emitter<ChannelSettingsState>();
  /**
   * R-022 — emitted whenever the rehearsing set changes. Bridge-owned and pushed
   * to EVERY client: if rehearse lived in one browser, the second operator would
   * see that row as ordinary and load onto it — a collision on a real layer.
   */
  readonly rehearseChanged = new Emitter<Rehearsal[]>();

  // R-010 — mutable: `setConfig` swaps the whole connection layer at runtime.
  #config: ConnectionConfig;
  /** One session per DECLARED server (B-046: B exists only when configured). */
  #sessions: { A: ServerSession; B?: ServerSession };
  #adapter: RedundancyAdapter;
  readonly #reconciler = new Reconciler();
  // R-021 stage 1 — constructed in the constructor so the resolved fixed bank
  // (and the ONE policy object the validator saw) reach the allocator.
  readonly #layers: LayerManager;
  // R-021 stage 2a — the declared bank (null = none), the policy in force, and
  // the last PUBLISHED per-slot state (JSON, for the publish-on-change compare).
  #fixedBank: FixedLayerBank | null;
  readonly #layerPolicy: LayerPolicy;
  /**
   * R-028 — the reserved playout layer numbers, from real config. The SAME list
   * the boot validator saw and the LayerManager fences on — resolved once in
   * `createBridge`, never re-derived here.
   *
   * ⚠ **THIS IS NOT THE C-015 / D-137 LIVE SOURCE SEAM, and it used to say it
   * was.** `reservedLayers` is _"the layer numbers the **company's playout
   * system** owns"_ (`packages/shared-ipc/src/channels/fixedLayers.ts`), i.e. a
   * fence AWAY from a foreign owner — the exact INVERSE of a record of layers
   * **we** own, which is what a Live Source layer is.
   *
   * The mis-tag was load-bearing, not cosmetic: R-028's task 1.2 wired this list
   * and marked C-015 done with the list empty, which satisfied C-015's
   * DISJOINTNESS half and none of its OWNERSHIP half — and the mislabel is what
   * made that read as complete. It also invites a fix that breaks three doors at
   * once: a Live Source placed in here is unplaceable (`allocate()` skips
   * reserved layers), unreservable (`reserve()` refuses them) and unclearable
   * (`clearLayer` refuses them as `reserved`).
   *
   * Bridge-owned Live Source layers are a THIRD ownership class with its own
   * ledger — see `live-layers.ts` and `live-source-multibox` design.md §4.
   */
  readonly #reservedLayers: readonly number[];
  /** The same list as a Set, for the sweep/clear/restore membership checks. */
  readonly #reservedSet: ReadonlySet<number>;
  #lastFixedStateJson: string | null = null;
  /** R-028 part B — the last PUBLISHED playout state (publish-on-change compare). */
  #lastPlayoutStateJson: string | null = null;
  readonly #builder = new CommandBuilder();

  /**
   * itemId → the slot RESERVED for it (so take/update/out target it). Set at load,
   * retained through out (the item is still on the stack, idle), deleted at remove.
   */
  readonly #slots = new Map<string, CommandSlot>();
  /**
   * B-039 — itemIds whose slot currently has a LIVE producer (a `CG ADD` succeeded
   * and no later `CLEAR` destroyed it). The prescriptive signal: `take` plays when
   * present, else re-issues `CG ADD` (a fresh load) before `CG PLAY`. Server-agnostic
   * (mirror-sync fans out ADD/CLEAR to both, so existence matches on each).
   * B-054 — invalidated wholesale whenever a declared session completes an AMCP
   * reconnect cycle (see #wireAdapter): a restarted CasparCG comes back with
   * EMPTY layers, so this memory would otherwise be a lie and the next take
   * would bare-PLAY nothing.
   */
  readonly #loaded = new Set<string>();
  /**
   * Reconnect-reconciliation — layers this process has CLEARed at least once
   * (adoption, out, remove), i.e. layers whose producer state the bridge KNOWS.
   * The first `CG ADD` onto a layer not in this set is preceded by a `CLEAR`
   * ("adoption"), destroying any producer a previous bridge session orphaned
   * there BEFORE the item's slot/OSC interest bind — the orphan's state can
   * never route to the fresh item. Deliberately NOT a startup sweep: an orphan
   * on a layer no load targets stays on air (on-air safety — a cold bridge
   * cannot tell junk from a graphic ridden through a controller restart).
   */
  readonly #adopted = new Set<string>();
  /**
   * B-056 — owned-slot occupancy warnings, keyed `ch:layer` (a layer has at
   * most one owner). Raised at load time when the adopt-CLEAR missed the
   * current primary while the primary's occupancy tap OBSERVED the layer
   * non-empty; resolved only on provable events (a CLEAR landing on the
   * primary — every `#markAdoptedOnPrimary` site — the item's removal, or a
   * server swap). Never resolved optimistically; never triggers a CLEAR.
   */
  readonly #ownedOccupancy = new Map<string, OwnedOccupancyWarning>();
  /**
   * B-094 — the last PUBLISHED answer to "have we ever heard OSC from the current
   * primary?", so the sweep can re-publish health when it flips.
   *
   * Health is otherwise emitted only on adapter health / failover / setConfig
   * events, and OSC starting or stopping is none of those — so without this the
   * NO OSC indicator would appear or clear only when something unrelated happened
   * to change. `null` = nothing published yet.
   */
  #lastPublishedOscHeard: boolean | null = null;
  /**
   * R-011 — itemId → the operator's on-air position override. Appended as a
   * query onto the RESOLVED served URL in #sendAdd (never a bare id — the
   * B-064 serve contract is untouched). Process-memory like #slots; survives
   * setConfig (an operator placement is not server knowledge), deleted at
   * remove. The manifest default stays OPAQUE to the bridge — the runtime
   * reads it from the scene inside the served HTML; the bridge only ever
   * knows explicit operator overrides.
   */
  readonly #positions = new Map<string, Position>();
  /**
   * B-092 — restored items awaiting their adopt-vs-re-ADD decision.
   *
   * Retained stack intent arrives when the SPA reconnects, which on a bridge
   * restart is BEFORE the fresh CasparCG session has handshaken — and the OSC
   * occupancy tap (the only thing that can tell "the graphic is still on air"
   * from "the layer is empty") is empty until the session drains its resync.
   * So `restore()` seeds state and parks the item here; the decision is taken
   * where occupancy is knowable — the transition INTO `healthy`, or inline when
   * the session is already healthy and the tap is warm.
   *
   * Nothing is sent to CasparCG for an item while it sits here: the row is back
   * on the operator's stack, and the wire is untouched until we can prove what
   * is on the layer.
   */
  readonly #pendingRestore = new Map<
    string,
    { slot: CommandSlot; templateId: string; fields: FieldValues }
  >();
  #seq = 0;
  #lastFailover: ConnectionHealth['lastFailover'] = undefined;

  // Coalescing (Phase-2 NOTE): collapse per-itemId changes into bounded publishes.
  readonly #dirty = new Set<string>();
  #flushTimer: ReturnType<typeof setTimeout> | null = null;

  // B-044 — per-seq expiry timers for in-flight transient intents (update/out).
  readonly #expiryTimers = new Map<number, ReturnType<typeof setTimeout>>();

  // R-009 — the periodic orphan sweep: unref'd interval armed in start(),
  // cleared in stop() (the B-053 dispose caution); the tick reads the
  // CURRENT primary dynamically, so failover/setConfig need no rewiring.
  #sweepTimer: ReturnType<typeof setInterval> | null = null;
  readonly #sweepMs: number;
  readonly #occupancyStaleMs: number;
  readonly #orphanTracker = new OrphanTracker();

  // ── non-playout stub state ──────────────────────────────────────────
  // B-038 Phase 2 — holds each imported template's info + the browser-produced
  // self-contained HTML, keyed by id. B-038 Phase 3 — the HTTP server serves that
  // HTML at `/template/<id>`, so `CG ADD` can reference a real, loadable URL.
  // R-028 (o1) — persisted to disk when a templates dir is configured, and
  // hydrated in the constructor so the registry is complete before the
  // WebSocket ever answers a `templates.list`.
  readonly #templates: TemplateRegistry;
  /** R-034 — the station's delimiter list, persisted beside the templates. */
  readonly #delimiters: DelimiterStore;
  /** R-030 — the per-channel output raster + what `INFO` reports, persisted. */
  readonly #channelSettings: ChannelSettingsStore;
  /**
   * R-030 — which server label produced the video-mode reading we hold for each
   * channel.
   *
   * Keyed by server, not merely "have we read it once", because A and B are
   * DIFFERENT MACHINES and can be configured with different video modes. A
   * reading taken from A says nothing about the channel now that B is primary,
   * so failover must re-read rather than keep quoting the old server's answer.
   * This is the same "probe the axis you intend to judge" rule the CLAUDE.md
   * golden rules state for liveness, applied to geometry.
   */
  readonly #modeReadFrom = new Map<number, ServerLabel>();
  /**
   * R-030 — channels whose raster mismatch has already been shouted, so a
   * settled fault is announced on its TRANSITION and not on every publish.
   * Without this, a mismatch that nobody has fixed yet would repeat on each
   * reading and bury the next distinct problem in its own noise.
   */
  readonly #mismatchWarned = new Map<number, boolean>();
  /**
   * R-022 — rows currently in REHEARSE, keyed by item id. Process state, not
   * persisted: a bridge restart is precisely the case where the claim must NOT
   * survive — the mute does not survive either (startup re-asserts every declared
   * row's volume), so a persisted rehearse flag would outlive the condition it
   * describes and interlock PLAY on a layer that is no longer muted.
   *
   * The value carries `muted` — whether ENTRY actually sent `MIXER VOLUME 0` —
   * because the exit path must mirror the entry path exactly. A rehearsal
   * entered over an EMPTY layer sends no mute, and so must send no restore: a
   * `MIXER VOLUME` on a layer we never touched is not a harmless no-op, it is a
   * command aimed at whatever occupies that layer NOW. It is internal state and
   * never reaches the wire — {@link rehearseState} projects the `Rehearsal`
   * shape the contract declares.
   */
  readonly #rehearsing = new Map<string, Rehearsal & { muted: boolean }>();
  /**
   * R-022 — items whose rehearse transition (mute or un-mute) is in flight. See
   * {@link BUSY_MESSAGE} for the interleaving this prevents; it is a correctness
   * lock, not a debounce.
   */
  readonly #rehearseBusy = new Set<string>();
  /** R-022 — the startup volume re-assert is once per process, not per sweep. */
  #volumesReasserted = false;
  /**
   * R-028 part B — ids this bridge REMOVED, so a reconnecting browser's
   * re-delivery cannot bring them back. Process-lifetime only, deliberately: a
   * bridge restart re-reads the persisted registry, and a template absent from
   * it is indistinguishable from one that was never imported — at which point a
   * browser's re-delivery is the desired REPAIR rather than a resurrection. The
   * tombstone only needs to outlive the reconnects of the session that removed.
   */
  readonly #removedTemplateIds = new Set<string>();
  readonly #templateServer: TemplateHttpServer;
  #serveOptions: TemplateServeOptions;
  /** Kept for `setConfig`'s serve re-derivation (explicit overrides keep winning). */
  readonly #serveOverride: TemplateServeOverride;
  /**
   * fix-setconfig-serve-restart — TRUE once `startServing()` has run for
   * this process: serving is INTENDED, so every apply must leave the
   * template server genuinely listening (or say `apply-failed`), and a load
   * while it is down must fail loudly — never ship a bare id. Replaces the
   * old transient `listening` snapshot, which read FALSE mid-teardown and
   * let a concurrent apply skip the restart entirely.
   */
  #servingDesired = false;
  /** fix-setconfig-serve-restart — applies are SERIALIZED; see setConfig(). */
  #applyInFlight = false;
  #lock: LockState = { engaged: false };
  #lockPin: string | null = null;
  #audit: AuditEntry[] = [];
  #settings: Settings = { telemetry: 'off' };
  #pendingUpdate: PendingUpdate | null = null;

  #started = false;
  readonly #intentTimeoutMs: number;
  /**
   * TEST-ONLY seam (B-100): per-`ServerSession` health-timer overrides. Empty in
   * production, so the ServerSession defaults apply. A test uses it to drive and
   * HOLD a session in `degraded` (OSC-silent, AMCP up) deterministically — the
   * state the reachability predicate must count as reachable.
   */
  readonly #sessionTuning: {
    oscDegradedAfterMs?: number;
    oscDownAfterMs?: number;
    watcherIntervalMs?: number;
  };

  constructor(
    config: ConnectionConfig,
    serveOverride: TemplateServeOverride = {},
    options: {
      intentTimeoutMs?: number;
      sweepMs?: number;
      occupancyStaleMs?: number;
      /** TEST-ONLY seam: inject a template server (e.g. one whose start() fails). */
      templateServer?: TemplateHttpServer;
      /** TEST-ONLY seam (B-100): override each session's OSC health timers. */
      sessionTuning?: {
        oscDegradedAfterMs?: number;
        oscDownAfterMs?: number;
        watcherIntervalMs?: number;
      };
      /**
       * R-021 stage 1 — the VALIDATED fixed operator slots (from
       * `fixed-layers-store`'s validator) and the layer policy in force. The
       * policy MUST be the same object the validator saw — resolved once in
       * `createBridge`, never two copies.
       */
      fixedSlots?: readonly LayerSlot[];
      layerPolicy?: LayerPolicy;
      /**
       * R-021 stage 2a — the bank the slots came from (aliases + the CURRENT
       * side of live change validation). Absent = no bank declared.
       */
      fixedBank?: FixedLayerBank;
      /**
       * R-028 / C-015 — the reserved playout layer numbers, from real config
       * (resolved once in `createBridge`; the SAME list the boot validator
       * saw). Fenced from allocation in the LayerManager AND enforced against
       * every live bank change here.
       */
      reservedLayers?: readonly number[];
      /**
       * R-028 (o1) — where the template registry persists (one JSON file per
       * template). Absent = in-memory only (unit tests).
       */
      templatesDir?: string;
    } = {},
  ) {
    this.#reservedLayers = options.reservedLayers ?? [];
    this.#reservedSet = new Set(this.#reservedLayers);
    this.#layers = new LayerManager({
      ...(options.layerPolicy !== undefined ? { policy: options.layerPolicy } : {}),
      ...(options.fixedSlots !== undefined ? { fixed: options.fixedSlots } : {}),
      reservedLayers: this.#reservedLayers,
    });
    this.#layerPolicy = options.layerPolicy ?? DEFAULT_LAYER_POLICY;
    this.#fixedBank = options.fixedBank ?? null;
    // R-028 (o1) — hydrate the persisted catalogue BEFORE anything can ask
    // for it; a bridge restart must not empty the library.
    this.#templates = new TemplateRegistry(options.templatesDir);
    this.#templates.loadPersisted();
    // R-034 — same shape, same reason: the delimiter list is read from disk
    // before the WebSocket can answer a `delimiters.list`, so a bridge restart
    // never hands a browser the defaults over the operator's own list.
    this.#delimiters = new DelimiterStore(options.templatesDir);
    this.#delimiters.hydrate();
    // R-030 — same shape, same reason: the channel raster is read from disk
    // before the WebSocket can answer a `channelSettings.get`, and before the
    // first `CG ADD` can append a geometry query. Hydrating late would mean the
    // first load of a session placed its graphic against a default raster and
    // every later one against the configured raster — the kind of difference
    // nobody would think to look for.
    this.#channelSettings = new ChannelSettingsStore(options.templatesDir);
    this.#channelSettings.hydrate(this.#declaredChannels());
    this.#intentTimeoutMs = options.intentTimeoutMs ?? INTENT_TIMEOUT_MS;
    this.#sweepMs = options.sweepMs ?? SWEEP_MS;
    this.#occupancyStaleMs = options.occupancyStaleMs ?? OCCUPANCY_STALE_MS;
    this.#sessionTuning = options.sessionTuning ?? {};
    this.#templateServer =
      options.templateServer ?? new TemplateHttpServer((id) => this.#templates.html(id));
    this.#config = config;
    this.#serveOverride = serveOverride;
    // B-038 Phase 3 — serve loopback when CasparCG is local; an opt-in routable
    // host (configured or guessed) when remote. The control WS stays loopback.
    this.#serveOptions = deriveServeOptions(config.servers.A.host, serveOverride);
    // B-046 — only DECLARED servers get a session: no phantom backup, no
    // reconnect churn, no divergence noise under the single-server default.
    this.#sessions = this.#buildSessions(config);
    this.#adapter = new RedundancyAdapter({
      strategy: config.strategy,
      sessions: this.#sessions,
      initialPrimary: 'A',
      autoFailoverEnabled: config.autoFailoverEnabled,
    });
  }

  /**
   * Construct one `ServerSession` per declared server. Pure (no I/O —
   * connecting happens in `start()`). R-010 — the OSC bind derives from each
   * server's locality exactly like the template serve path: a LOCAL CasparCG
   * pushes OSC to loopback; a REMOTE one pushes across the LAN, so the ingest
   * must bind a routable interface or confirmations never arrive
   * (render-but-never-confirm). Data-plane only; the control WS bind is
   * untouched by any of this.
   */
  #buildSessions(config: ConnectionConfig): { A: ServerSession; B?: ServerSession } {
    const session = (name: ServerLabel, ep: ConnectionConfig['servers']['A']): ServerSession =>
      new ServerSession({
        name,
        host: ep.host,
        port: ep.amcpPort,
        oscPort: ep.oscPort,
        oscBindHost: deriveOscBindHost(ep.host),
        resyncDurationMs: RESYNC_MS,
        // TEST-ONLY (B-100): empty in production, so ServerSession defaults hold.
        ...this.#sessionTuning,
      });
    return {
      A: session('A', config.servers.A),
      ...(config.servers.B !== undefined ? { B: session('B', config.servers.B) } : {}),
    };
  }

  /**
   * Bind the CURRENT sessions/adapter to the Reconciler + health surface.
   * Called from `start()` and again after every `setConfig` rebuild (the old
   * listeners die with the old session/adapter objects).
   */
  #wireAdapter(): void {
    // OSC firehose → Reconciler, but only from the **current primary** — the
    // backup mirrors the same commands, so after a failover the new primary's
    // OSC re-confirms state. Each OscTransport already ran interest →
    // rate-limit → change-track and handed us typed events.
    for (const label of ['A', 'B'] as const) {
      const session = this.#sessions[label];
      if (session === undefined) continue;
      session.osc.on('events', (events) => {
        if (this.#adapter.currentPrimary !== label) return;
        for (const event of events) this.#reconciler.applyOsc(event);
      });
      // B-054 — 'healthy' fires only when a session completes a full AMCP
      // (re)connect cycle (never on degraded→healthy OSC recovery): the
      // server behind it may have restarted with EMPTY layers, so producer
      // existence can no longer be vouched for. Clear wholesale — commands
      // fan out to every declared server, so the next take's B-039 re-ADD
      // heals whichever side lost its producers and benignly stage-replaces
      // on one that kept them. Sends nothing itself; #adopted stays (a
      // restarted server's layers are empty — the skipped adopt-CLEAR is a
      // no-op by construction).
      session.on('healthy', () => {
        if (this.#sessions[label] !== session) return; // torn-down era
        this.#loaded.clear();
      });
      // B-086 — honest ON AIR across a CasparCG link-loss. The CURRENT PRIMARY's
      // OSC is what verifies on-air claims, so its link state drives the
      // reconciler's "unverifiable" display. B-100 note: this demote keys on the
      // primary LEAVING `healthy` (OSC silence included), which since B-100 is a
      // DIFFERENT condition from the on-air REFUSAL `#noServerReachable()` (which
      // stays false while a `degraded` server is still reachable). They coincided
      // under the old predicate; now honesty is the display's job and reachability
      // is the refusal's — the operator is WARNED on silence, not BLOCKED:
      //   LEFT 'healthy'  → on-air/played items re-publish as UNVERIFIED
      //                     ("WAS ON AIR", muted) — the wire can't back them.
      //   INTO 'healthy'  → clear the flag AND reconcile against real occupancy
      //                     (this fires AFTER the RESYNCING OSC drain, and on a
      //                     degraded→healthy recovery — both have occupancy
      //                     populated): a still-occupied layer restores ON AIR
      //                     via resumed OSC; a silent layer (producer gone) resets
      //                     to IDLE. The two calls coalesce into one publish, so an
      //                     emptied item never flashes red.
      session.on('state-change', ({ from, to }) => {
        if (this.#sessions[label] !== session) return; // torn-down era
        if (this.#adapter.currentPrimary !== label) return; // only the primary feeds the reconciler
        if (to === 'healthy') {
          this.#reconciler.setLinkDown(false);
          const occupiedKeys = new Set(
            session.osc.occupancy
              .occupied(this.#occupancyStaleMs)
              .map((o) => `${String(o.channel)}:${String(o.layer)}`),
          );
          // B-092 — decide the pending RESTORES here, against this same drained
          // occupancy sample, and BEFORE `reconcileOnReconnect`. This is the
          // only point where the answer exists: the tap resets on resync and
          // refills during the RESYNCING drain, so at the SPA's reconnect (when
          // the intent arrived) it was empty. Ordering is load-bearing twice
          // over: `transitionTo` emits this BEFORE `emit('healthy')`, so we run
          // before that handler clears `#loaded`; and every record mutation
          // inside is SYNCHRONOUS (only the CG ADD is awaited), so the
          // `reconcileOnReconnect` on the next line iterates a settled
          // reconciler — a re-ADDed item already reads `played: false` and is
          // correctly left alone by it.
          const heard = session.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs);
          void this.#decidePendingRestores(occupiedKeys, heard);
          // The SAME blind-tap distinction applies here, and this path had the
          // bug too: `reconcileOnReconnect` resets a `played` item to IDLE when
          // its slot is not in `occupiedKeys`, treating silence as proof the
          // producer is gone (B-053). From a tap that has never heard any OSC
          // that is not proof of anything — it would report a genuinely LIVE
          // graphic as idle, on a link that is UP. Skipping is the honest move:
          // items keep their last known state (B-086's `unverified` demotion
          // from the drop still stands) rather than being falsely reset, and the
          // sweep reconciles for real once OSC arrives.
          if (heard) {
            this.#reconciler.reconcileOnReconnect(occupiedKeys);
          } else {
            // …and while blind, NO on-air claim is verifiable — not just the
            // restored ones. Skipping the reconcile alone would leave a played
            // item that is genuinely gone sitting on a confident red ON AIR
            // (its ack floor), because `setLinkDown(false)` has just cleared the
            // only demotion that was covering it. The link being UP is exactly
            // what makes that insidious: a green health pill beside a red claim
            // nothing can back. Mark every played item unverifiable instead —
            // the same honest answer B-086 gives when the link drops, for the
            // same reason: the verification channel is dead.
            for (const item of this.#reconciler.snapshot()) {
              if (item.status === 'on-air' || item.status === 'playing') {
                this.#reconciler.setUnverifiable(item.itemId, true);
                this.#markDirty(item.itemId);
              }
            }
          }
        } else if (from === 'healthy') {
          this.#reconciler.setLinkDown(true);
        }
      });
    }

    // Real health + failover from the adapter — replaces the Phase-1/2 mock health.
    this.#adapter.on('health', () => this.healthChanged.emit(this.health()));
    this.#adapter.on('failover-complete', (event: FailoverEvent) => {
      this.#lastFailover = {
        at: new Date(event.at).toISOString(),
        reason: event.reason,
        from: event.from,
        to: event.to,
      };
      this.healthChanged.emit(this.health());
    });
  }

  /** Wire the stack and connect the declared sessions. Idempotent. */
  start(): void {
    if (this.#started) return;
    this.#started = true;

    this.#reconciler.on('item-changed', (state) => this.#markDirty(state.itemId));
    this.#reconciler.on('item-removed', (info) => this.#markDirty(info.itemId));

    this.#wireAdapter();

    // R-009 — arm the orphan sweep. Unref'd so it never keeps the process
    // alive; the tick self-gates on the primary session's health.
    this.#sweepTimer = setInterval(() => {
      this.#sweepOccupancy();
    }, this.#sweepMs);
    this.#sweepTimer.unref?.();

    this.#sessions.A.start();
    this.#sessions.B?.start();
  }

  /**
   * B-038 Phase 3 — start the template HTTP server (`GET /template/<id>` → the
   * retained HTML). Idempotent. After this, `load()` issues `CG ADD` with the
   * served URL instead of the bare template id.
   */
  async startServing(): Promise<void> {
    // Serving is now INTENDED for the life of the process — every later
    // apply must restart it (or fail loudly), and #sendAdd must never fall
    // back to a bare id (fix-setconfig-serve-restart).
    this.#servingDesired = true;
    await this.#templateServer.start(this.#serveOptions);
  }

  /** The template HTTP serve address once serving (B-038 Phase 3), else null. */
  get templateServe(): { serveHost: string; port: number; bindHost: string } | null {
    return this.#templateServer.listening
      ? {
          serveHost: this.#templateServer.serveHost,
          port: this.#templateServer.port,
          bindHost: this.#serveOptions.bindHost,
        }
      : null;
  }

  /** The served URL for a template id (the `CG ADD` arg), or null if not serving. */
  templateServeUrl(templateId: string): string | null {
    return this.#templateServer.listening ? this.#templateServer.urlFor(templateId) : null;
  }

  async stop(): Promise<void> {
    if (this.#flushTimer !== null) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
    if (this.#sweepTimer !== null) clearInterval(this.#sweepTimer);
    this.#sweepTimer = null;
    for (const timer of this.#expiryTimers.values()) clearTimeout(timer);
    this.#expiryTimers.clear();
    await Promise.all([this.#sessions.A.stop(), this.#sessions.B?.stop() ?? Promise.resolve()]);
    await this.#templateServer.stop();
  }

  /** Which server is currently the live primary. */
  get currentPrimary(): ServerLabel {
    return this.#adapter.currentPrimary;
  }

  /** The current primary's bound OSC port (0 until bound). Diagnostic. */
  get oscPort(): number {
    return this.#adapter.primarySession.osc.port;
  }

  /**
   * Resolves when ALL DECLARED sessions reach HEALTHY — A alone under a
   * single-server config, both under a mirror pair (B-046: the old
   * both-always contract could never resolve without a real backup).
   */
  whenServerHealthy(timeoutMs = 5000): Promise<void> {
    const sessions: ServerSession[] = [
      this.#sessions.A,
      ...(this.#sessions.B !== undefined ? [this.#sessions.B] : []),
    ];
    const allHealthy = (): boolean => sessions.every((s) => s.state === 'healthy');
    if (allHealthy()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        for (const s of sessions) s.off('healthy', check);
      };
      const check = (): void => {
        if (allHealthy()) {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('declared CasparCG server(s) did not reach HEALTHY in time'));
      }, timeoutMs);
      for (const s of sessions) s.on('healthy', check);
      check();
    });
  }

  // ── stack (real: Reconciler + AMCP via the seam) ────────────────────

  /**
   * B-072 — the item state as PUBLISHED to the renderer: the Reconciler's
   * snapshot joined with the operator's stored position overrides.
   *
   * Ownership deliberately does not move. The Reconciler owns reconciled item
   * state (it answers to acks and OSC, and a position override is neither);
   * `#positions` stays operator UI state owned here. They meet only at the
   * point of publication, which is the ONLY place both are needed. Every
   * renderer-facing exit — `stackSnapshot()` and the `stackChanged` push —
   * goes through here; internal `#reconciler.snapshot()` callers stay raw.
   *
   * `remove()` already drops the override, so a removed item's state simply
   * has no `position`: delete-on-remove is inherited, not re-implemented.
   */
  #published(): readonly StackItemState[] {
    return this.#reconciler.snapshot().map((item) => {
      const position = this.#positions.get(item.itemId);
      return position === undefined ? item : { ...item, position };
    });
  }

  stackSnapshot(): readonly StackItemState[] {
    return this.#published();
  }

  async load(
    itemId: string,
    templateId: string,
    fields: FieldValues,
  ): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'load', itemId, templateId, fields }, seq);

    // Reconnect-reconciliation — never blind-ADD a URL the bridge can't serve:
    // an unregistered template is a visible failed load. (Real CasparCG would
    // 202 the ADD without fetching and CEF-load the 404 page — a silent blank
    // on air; the guard is what makes the failure loud.)
    if (!this.#templates.has(templateId)) {
      this.#reconciler.applyAck(seq, false, 'unknown-template');
      return { accepted: false, errorCode: 'unknown-template' };
    }

    let slot: CommandSlot;
    try {
      slot = this.#allocate(templateId);
    } catch (err) {
      // C-014 — say WHY the range is exhausted: a range eaten by QUARANTINED
      // (foreign-occupied) layers is a different operator situation from a
      // genuinely full range — the former cannot be freed from this console
      // (R-015 forbids clearing foreign layers), the latter can (Remove
      // something). The code rides the ack AND the response (B-070) so the
      // Library's Load toast can say it.
      const foreignBlocked = err instanceof OutOfLayersError && err.quarantinedInRange > 0;
      const code = foreignBlocked ? 'no-layer-foreign-occupied' : 'no-layer';
      this.#reconciler.applyAck(seq, false, code);
      return { accepted: false, errorCode: code };
    }

    return this.#loadOnto(itemId, templateId, fields, slot, seq);
  }

  /**
   * R-021 stage 3 — load an item onto an EXACT FIXED slot (`fixedLayers.load`).
   *
   * The ONE difference from `load()` is how the layer is resolved, and it is
   * the whole point: `load()` ALLOCATES from the dynamic policy ranges, this
   * binds the coordinate the operator's row names through
   * {@link LayerManager.bindFixed}. It deliberately does NOT call `reserve()`
   * — `reserve()` refuses fixed slots by construction (a fixed slot is born
   * allocated, so it is never "free") — nor `#allocate()`, which can never
   * return a fixed slot for the same reason. Everything AFTER the slot is
   * resolved is the shared `#loadOnto`, not a second copy of the load path:
   * the B-100 single-reachability-read, the adopt-CLEAR, the slot/interest
   * binding and the B-039 pre-roll `CG ADD` are identical, so a fixed load can
   * never drift from a dynamic one.
   *
   * Refusals (`FIXED_LAYERS_LOAD_REASONS`): an unregistered template, a
   * coordinate outside the declared bank (`not-fixed` — this channel is not a
   * door onto an arbitrary layer), or a slot that already carries an item
   * (`slot-bound` — rebinding is Remove-then-load, two explicit steps).
   */
  async loadFixed(
    slot: CommandSlot,
    itemId: string,
    templateId: string,
    fields: FieldValues,
  ): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'load', itemId, templateId, fields }, seq);

    // Same guard, same code as `load()`: never blind-ADD a URL we cannot serve.
    if (!this.#templates.has(templateId)) {
      this.#reconciler.applyAck(seq, false, 'unknown-template');
      return { accepted: false, errorCode: 'unknown-template' };
    }
    if (!this.#layers.isFixed(slot)) {
      this.#reconciler.applyAck(seq, false, 'not-fixed');
      return { accepted: false, errorCode: 'not-fixed' };
    }
    /*
     * THE REHEARSE INTERLOCK ON LOAD IS GONE, AND ITS ABSENCE IS THE STRONGER
     * FORM — do not add it back.
     *
     * It was added one task ago because LOAD could put an unmuted producer under
     * a rehearsing row: `#loadOnto` issued a `CG ADD`, and a bare ADD is audible
     * on 2.5.0 (R-029). LOAD is now LIST-ONLY and emits no AMCP at all, so there
     * is no producer to put anywhere and nothing for the guard to protect.
     *
     * Replaced by a test rather than deleted quietly: `cleared-row-verbs`
     * asserts LOAD emits ZERO AMCP in every state INCLUDING a rehearsing row.
     * A path that cannot exist beats a guard that has to be remembered — the
     * same move as `StackPruneInput`, where the bad call became unrepresentable
     * instead of merely checked.
     *
     * If LOAD is ever given a wire step again, the guard comes back WITH it.
     */
    // The registry's OWN templateType — the LayerManager records what is bound,
    // and the per-slot publish reads it straight back out, so the row names the
    // template kind the operator recognises rather than an internal id.
    const templateType = this.#templates.get(templateId)?.templateType ?? templateId;
    /**
     * `slot-bound` NOW REFUSES ON OCCUPANCY, NOT ON THE BINDING.
     *
     * It used to be `!bindFixed(...)`, which is false whenever the slot carries
     * ANY binding — and a CLEARed row still carries one, because `out()` destroys
     * the producer and leaves the item. So the layer refused the one load that
     * should always work: putting the row's OWN already-bound template back after
     * a CLEAR. That is the second half of the reported defect; the row's toggle
     * was the half the operator could see.
     *
     * The two facts are separated here:
     *
     *   - REBINDING A ROW TO A DIFFERENT ITEM stays refused whatever the layer
     *     says. Remove-then-load is two explicit steps by decision, and nothing
     *     about an empty layer makes silently moving a row's binding acceptable.
     *   - THE SAME ITEM RE-LOADING is refused only while a producer is actually
     *     RESIDENT. With one there, this would be a reload of a live layer, which
     *     the operator reaches through CLEAR first; with none, it is the re-ADD.
     *
     * `#loaded` IS the occupancy signal, deliberately, and not OSC. It is the
     * bridge's own producer record — exactly what `out()` deletes and exactly what
     * `take()`'s B-039 pre-roll reads to decide whether to re-ADD — so the load
     * path and the take path cannot disagree about whether a producer exists. OSC
     * would have been the wrong axis twice over: it is absent on OSC-less installs
     * (B-101 — silence is not evidence), and a wire that cannot be heard would
     * then refuse every re-ADD on precisely the plants this fixes.
     */
    const boundItemId = this.#itemBoundToSlot(slot);
    if (boundItemId !== undefined && boundItemId !== itemId) {
      this.#reconciler.applyAck(seq, false, 'slot-bound');
      return { accepted: false, errorCode: 'slot-bound' };
    }
    if (boundItemId === itemId && this.#loaded.has(itemId)) {
      this.#reconciler.applyAck(seq, false, 'slot-bound');
      return { accepted: false, errorCode: 'slot-bound' };
    }
    // Re-binding the SAME item onto its own empty row: drop the stale binding so
    // `bindFixed` can record it again. `unbindFixed` keeps the slot fenced out of
    // the dynamic pool, so this cannot leak a fixed layer into allocation.
    if (boundItemId === itemId) this.#layers.unbindFixed(slot);
    if (!this.#layers.bindFixed(slot, templateType)) {
      this.#reconciler.applyAck(seq, false, 'slot-bound');
      return { accepted: false, errorCode: 'slot-bound' };
    }
    // NOTE: the state is published from `#loadOnto`, once the item→slot map is
    // set. A publish HERE would find only half the binding (the LayerManager's
    // template type, no itemId yet) and so publish `null` — the honest
    // both-halves rule in `#computeFixedState`.
    //
    // LIST-ONLY: the operator's LOAD binds the row and touches NO LAYER. See
    // `#loadOnto`'s `listOnly` note for why, and for why it rides the same
    // single boolean that B-100 pairs the CLEAR and the ADD on.
    return this.#loadOnto(itemId, templateId, fields, slot, seq, true);
  }

  /**
   * The load path from the resolved slot onward — shared VERBATIM by the
   * dynamic `load()` and the fixed `loadFixed()`, so the two can never drift on
   * the parts that touch air (B-100's single reachability read, the
   * adopt-CLEAR, the ownerless-producer bail, the B-056 detection and the
   * B-039 pre-roll ADD). Only slot RESOLUTION differs between the callers.
   */
  async #loadOnto(
    itemId: string,
    templateId: string,
    fields: FieldValues,
    slot: CommandSlot,
    seq: number,
    /**
     * LIST-ONLY: bind the row and touch NO LAYER — no adopt-CLEAR, no pre-roll
     * `CG ADD`, no AMCP of any kind.
     *
     * "The list is ours, the layer is CasparCG's." The operator's LOAD is a
     * LIST action — pick a template, import it into the bridge's store, bind it
     * to a row — and it must work with CasparCG unreachable, because building a
     * rundown before the playout machine is up is ordinary. Nothing is lost by
     * not pre-rolling: `take()` re-ADDs on the way to air (B-039 / R-028
     * decision 5), which is the path a disconnected load has always taken.
     *
     * It is expressed as a THIRD REASON for `reachable` to be false rather than
     * as a branch of its own, and that is deliberate. B-100's rule is that ONE
     * boolean gates both the destructive adopt-CLEAR and the constructive ADD
     * that repairs it; a separate "skip the ADD" flag would be a second read and
     * could leave a layer cleared-and-empty. Here the pairing is preserved by
     * construction: list-only means neither, never one.
     */
    listOnly = false,
  ): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-100 — evaluate reachability ONCE, here, and gate BOTH the destructive
    // adopt-CLEAR and the constructive pre-roll ADD on this single value. The two
    // used to be independent reads of the predicate with an await between them, so
    // a session slipping state in the gap could land the CLEAR yet skip the ADD —
    // CLEAR-then-nothing, a BLACK layer. One evaluation makes the pairing structural:
    // if the CLEAR can reach the wire, the ADD is attempted; neither, or both.
    const reachable = !listOnly && !this.#noServerReachable();

    // Reconnect-reconciliation — adopt the layer BEFORE binding the slot/OSC
    // interest: destroy any producer a previous bridge session orphaned there,
    // so its OSC state can never route to this fresh item. The CLEAR is issued
    // ONLY when a server is reachable (B-100): a CLEAR that lands with no following
    // ADD is exactly the black-layer window this pairing exists to close.
    const { adopted } = await this.#adoptLayer(slot, reachable);

    // The adopt-CLEAR awaited a real AMCP round-trip — a remove() may have
    // landed meanwhile and, finding no slot yet, cleaned up nothing. If the
    // item is gone, release the layer and bail instead of binding a ghost
    // slot/interest and ADDing an ownerless producer.
    if (this.#reconciler.get(itemId) === null) {
      this.#releaseSlot(slot);
      return { accepted: false };
    }

    this.#slots.set(itemId, slot);
    this.#reconciler.assignSlot(itemId, { ...slot, server: 'primary' });
    // Interest on every declared session's OSC so whichever is primary, its
    // confirmations pass the filter (survives failover).
    this.#addInterest(slot);

    // R-021 stage 3 — BOTH halves of a fixed binding now exist (the
    // LayerManager's template type + this item→slot entry), so the row can be
    // told. Published through the SAME change-compare the sweep uses, never a
    // second derivation; a no-op for a dynamic slot.
    if (this.#layers.isFixed(slot)) this.#publishFixedStateIfChanged();

    // B-056 — the adopt-CLEAR did NOT land on the current primary (backup-only
    // success, or a failed CLEAR): if the primary's occupancy tap OBSERVES the
    // layer non-empty, a previous session's producer is visibly live on the
    // primary output under this item's own layer — warn the operator. Sampled
    // BEFORE our own ADD (after it, an owned-layer producer report is
    // indistinguishable from our own). Purely additive: the load proceeds
    // exactly as before either way. Unknown occupancy (tap silent/stale)
    // deliberately does NOT warn — observed occupancy only (design §3).
    if (!adopted) this.#detectOwnedOccupancy(slot, itemId);

    // B-082 — a load is NOT an on-air action, so a dead link is not a load FAILURE.
    // With no reachable server there is simply nothing to pre-roll: skip the `CG ADD`
    // instead of attempting it and failing. Attempting it acked `amcp-send-failed` and
    // parked the row in ERROR — which told the operator "this item is broken" when the
    // only true statement was "the server isn't there". The item stays on the stack at
    // the `loaded` its intent already set, and nothing is on air to hide (no server is
    // reachable), so the Reconciler's "never claim idle/loaded over a live graphic"
    // doctrine is untouched.
    //
    // This is NOT the deferral R-006 forbids: nothing is queued for later delivery. The
    // item just has no live producer — the SAME condition every item is in after a
    // reconnect (`#loaded` is per-server and cleared on drop, :314/:924). `take`/`update`
    // already recover from it by lazily re-issuing the `CG ADD` before the `CG PLAY`
    // (B-039, :606/:660), pulling template + current fields from the Reconciler at the
    // moment of use rather than replaying a stored command. So the item plays normally
    // once the link is back, and until then the on-air verbs stay REFUSED by
    // `#noServerReachable()`. No AMCP verb is added and the ADD→PLAY order is preserved.
    //
    // B-100 — this reads the SAME `reachable` captured above the adopt-CLEAR, so the two
    // decisions can never split: with no server reachable the adopt-CLEAR was skipped too,
    // so we can never leave a layer cleared-and-empty.
    if (!reachable) return { accepted: true };

    // B-039 — `CG ADD` only (play-on-load OFF in the builder): the producer is
    // loaded, NOT playing. The operator's take issues the `CG PLAY`.
    // §8 — the ADD's own reason reaches the operator instead of a bare refusal.
    const added = await this.#sendAdd(itemId, slot, templateId, fields, seq);
    return {
      accepted: added.ok,
      ...(added.errorCode !== undefined && { errorCode: added.errorCode }),
    };
  }

  /**
   * B-092 — rebuild the stack from the browser's RETAINED intent.
   *
   * The stack otherwise lives ONLY in this process's Reconciler and dies with
   * it: a restarted bridge boots empty, the SPA re-pulls that empty snapshot,
   * and every row the operator built disappears. The browser owns the intent
   * across the death; this puts it back.
   *
   * This method deliberately does NOT go through `load()`. `load()` ADOPTS the
   * layer first — a hard `CLEAR` before its first `CG ADD` there — and on a
   * bridge-ONLY restart (CasparCG still rendering) that CLEAR lands on the LIVE
   * layer: the graphic flashes OFF AIR and comes back merely loaded. That is
   * the broadcast-safety lie this codebase forbids, so the restore is
   * occupancy-aware instead, and it is split in two:
   *
   *   1. HERE: seed the Reconciler, take the retained layer, bind OSC interest,
   *      restore the position override, publish. The rows are back immediately
   *      — before CasparCG is even reachable — and NOTHING is sent to the wire.
   *   2. `#decidePendingRestores`: once real occupancy is knowable, adopt the
   *      layer without clearing it (a producer survived) or re-ADD onto it (the
   *      layer is empty). Neither branch can ever clear a live layer.
   *
   * Skipped, never fatal: an item this bridge ALREADY holds (local intent must
   * never clobber a live bridge's own state — a page reload against a healthy
   * bridge changes nothing), an unregistered template (the SPA re-delivers its
   * library first, so this means the template is genuinely gone), or an
   * exhausted layer range.
   */
  async restore(items: readonly RetainedStackItem[]): Promise<{
    restored: number;
    skipped: number;
  }> {
    // B-086 honesty, applied to seeded records: the reconciler learns `linkDown`
    // from session TRANSITIONS, and a bridge whose CasparCG session has never
    // been healthy has fired none — so without this a restored on-air item
    // would publish the broadcast-red `playing` on a link that reaches nothing.
    // (No ordinary path can hit that: `take` is refused while the link is down,
    // so only a restore can seed play evidence there.)
    //
    // DEMOTE-ONLY, and on the PRIMARY's state — the same signal B-086 demotes
    // on, because only the current primary's OSC can verify an on-air claim.
    // Never the reachability predicate `#noServerReachable()` (which is false whenever
    // ANY server is reachable): in a mirror pair with the primary down and the
    // backup up, clearing the flag here would UN-demote B-086's `unverified`
    // rows back to a confident red ON AIR that nothing verifies. Lifting the
    // flag stays where it belongs — the healthy transition.
    if (this.#adapter.primarySession.state !== 'healthy') this.#reconciler.setLinkDown(true);

    let restored = 0;
    let skipped = 0;
    for (const item of items) {
      // The live bridge wins over the retained copy — never clobber.
      if (this.#reconciler.get(item.itemId) !== null) {
        skipped++;
        continue;
      }
      if (!this.#templates.has(item.templateId)) {
        skipped++;
        continue;
      }
      const slot = this.#slotForRestore(item);
      if (slot === null) {
        skipped++;
        continue;
      }
      if (
        this.#reconciler.restoreItem({
          itemId: item.itemId,
          templateId: item.templateId,
          fields: item.fields,
          played: item.played,
        }) === null
      ) {
        // B-114 — release by the SAME door the slot was taken through.
        // `deallocate` returns early for a fixed slot on purpose (it must keep
        // the fence), so using it alone here would leave the row bound to an
        // item the reconciler just refused — a permanently occupied row holding
        // nothing, which no verb can clear.
        if (this.#layers.isFixed(slot)) this.#layers.unbindFixed(slot);
        else this.#layers.deallocate(slot);
        skipped++;
        continue;
      }
      this.#slots.set(item.itemId, slot);
      this.#reconciler.assignSlot(item.itemId, { ...slot, server: 'primary' });
      this.#addInterest(slot);
      // R-011 — the operator's placement is intent too, and #sendAdd reads it
      // off #positions, so it must be back BEFORE any re-ADD decision runs.
      if (item.position !== undefined) this.#positions.set(item.itemId, item.position);
      this.#pendingRestore.set(item.itemId, {
        slot,
        templateId: item.templateId,
        fields: item.fields,
      });
      this.#markDirty(item.itemId);
      restored++;
    }

    // If the primary session is ALREADY healthy the `to === 'healthy'`
    // transition fired long ago and will not fire again (the late-page-reload
    // case) — but the tap has been filling ever since, so the answer is
    // available right now. Without this branch those items would sit pending
    // forever, visible but never adopted or re-ADDed.
    if (restored > 0 && this.#adapter.primarySession.state === 'healthy') {
      const occupiedKeys = new Set(
        this.#adapter.primarySession.osc.occupancy
          .occupied(this.#occupancyStaleMs)
          .map((o) => `${String(o.channel)}:${String(o.layer)}`),
      );
      await this.#decidePendingRestores(
        occupiedKeys,
        this.#adapter.primarySession.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs),
      );
    }
    return { restored, skipped };
  }

  /**
   * B-092 — the layer a restored item takes. The RETAINED slot is preferred and
   * reserved exactly: it is the layer the surviving producer is actually on, so
   * it is the layer whose occupancy decides adopt-vs-re-ADD. Re-allocating some
   * other free layer would consult the wrong layer's occupancy and could ADD a
   * second producer beside a live one. Falls back to normal allocation when the
   * intent carries no slot or the layer is already taken; `null` when the range
   * is exhausted (the item is skipped, exactly as a load would fail).
   */
  #slotForRestore(item: RetainedStackItem): CommandSlot | null {
    if (item.slot !== undefined) {
      // R-028 / C-015 — a retained coordinate now inside the RESERVED playout
      // range is SKIPPED, never re-homed. Falling through to `#allocate()`
      // would consult a DIFFERENT layer's occupancy (the exact
      // wrong-layer-occupancy hazard this method's contract forbids) and could
      // re-ADD a duplicate while the surviving producer stays live on the
      // playout layer — two copies on air, with the row pointing at the wrong
      // one. Skipping keeps the wire untouched, exactly like the
      // exhausted-range case; the survivor is the playout team's to deal with.
      if (this.#reservedSet.has(item.slot.layer)) return null;
      const slot = { channel: item.slot.channel, layer: item.slot.layer };
      // B-114 — a retained coordinate inside the DECLARED BANK is re-bound with
      // `bindFixed`, not `reserve`.
      //
      // `reserve()` refuses a fixed slot BY CONSTRUCTION (a fixed slot is born
      // allocated, so it is never "free" to reserve). Falling through to
      // `#allocate()` for one is wrong twice over: it re-homes the operator's
      // row onto some dynamic layer, and for a `custom` template type that
      // range IS the reserved playout range, so allocation throws and the item
      // is SKIPPED entirely. Either way `fixedBinding` is never recorded, so
      // after a bridge restart every declared row published `binding: null` —
      // the operator's templates vanished from the surface, and the rows also
      // refused a fresh LOAD because their occupancy is `unknown` until OSC
      // arrives. The row was left with nothing on it and no way to fill it.
      //
      // The bound value is the REGISTRY's `templateType`, resolved exactly as
      // `fixedLoad` resolves it — the row reads this straight back out as its
      // label, so binding the raw id here would restore the row under a UUID.
      const templateType = this.#templates.get(item.templateId)?.templateType ?? item.templateId;
      if (this.#layers.bindFixed(slot, templateType)) return slot;
    }
    try {
      return this.#allocate(item.templateId);
    } catch {
      return null;
    }
  }

  /**
   * B-092 — resolve every pending restore against REAL occupancy. This is the
   * broadcast-safety core of the change: `occupiedSlotKeys` comes from the OSC
   * occupancy tap (the same sample B-086's reconnect reconcile uses), and
   * silence means unoccupied — real CasparCG goes SILENT for a cleared layer
   * rather than reporting `empty` (B-053), the same contract the orphan sweep
   * relies on.
   *
   *   OCCUPIED → ADOPT WITHOUT CLEARING. A producer survived the bridge's
   *     death: the item is genuinely still on air, so the correct action is to
   *     touch NOTHING. Marking the layer adopted is what guarantees no later
   *     adoption issues the CLEAR that would flash it off air; resumed OSC
   *     re-derives `on-air` by itself from the record's play evidence.
   *   SILENT → RE-ADD as loaded. The producer is gone (bridge AND CasparCG
   *     restarted), so a fresh `CG ADD` puts the item back — still with NO
   *     adopt-CLEAR in front of it.
   *
   *   TAP NEVER HEARD ANY OSC → REFUSE TO DECIDE. Send nothing at all and
   *     publish the item as `unverified`. See below.
   *
   * No branch sends a CLEAR. But "no CLEAR" was never the property worth
   * protecting on its own — KEEPING THE GRAPHIC ON AIR was, and the original
   * design lost it in one case. This comment used to argue that a wrong
   * "silent" verdict was acceptable because a `CG ADD` is only a stage replace.
   * Hardware disproved that (PR #353's probe, captured on the wire): the re-ADD
   * carries play-on-load `0`, so replacing a LIVE producer with a non-playing
   * one takes the graphic OFF AIR. Silently, with no error and no operator
   * signal — the safe path degrading into the unsafe one.
   *
   * The root cause was that an empty tap has two meanings — "this layer is
   * empty" and "I have never heard from the server" — that demand OPPOSITE
   * actions. `hasReceivedOsc` separates them: silence is evidence of emptiness
   * ONLY from a tap that is actually hearing OSC. Otherwise it is evidence of
   * no evidence, and the honest move is to do nothing and say so.
   *
   * Record mutations are synchronous; only the ADD is awaited. The caller at
   * the healthy transition relies on that (see `#wireAdapter`).
   */
  async #decidePendingRestores(
    occupiedSlotKeys: ReadonlySet<string>,
    tapHasReceivedOsc: boolean,
  ): Promise<void> {
    if (this.#pendingRestore.size === 0) return;

    // BLIND TAP — refuse to decide. The items stay pending (so the periodic
    // sweep can decide them if OSC starts arriving), nothing is sent, and every
    // affected row publishes the honest `unverified` instead of an on-air claim
    // nothing can back.
    if (!tapHasReceivedOsc) {
      for (const [itemId, { slot }] of this.#pendingRestore) {
        if (this.#reconciler.get(itemId) === null) continue;
        this.#reconciler.setUnverifiable(itemId, true);
        this.#markDirty(itemId);
        // The one line whoever debugs a blind install will grep for. Says what was
        // NOT done and why, and names the fix — an install in this state looks
        // healthy on AMCP, so the cause is not otherwise discoverable.
        process.stderr.write(
          `[caspar-bridge] restore REFUSED for ${itemId} on ${adoptionKey(slot)}: ` +
            `no OSC has ever arrived, so the layer cannot be verified. Nothing was sent ` +
            `(a re-ADD here would take a live graphic off air). ` +
            `Enable OSC in casparcg.config (predefined-client / UDP port).
`,
        );
      }
      return;
    }

    const pending = [...this.#pendingRestore];
    this.#pendingRestore.clear();

    // The restore pass does not report per-item reasons anywhere (it is a bulk
    // rebuild with no operator waiting on it), so it takes `#sendAdd`'s result
    // whole and looks at neither half.
    const adds: Promise<{ ok: boolean; errorCode?: string }>[] = [];
    for (const [itemId, { slot, templateId, fields }] of pending) {
      // A remove landed between the restore and this decision — the item is
      // gone; its slot was already released by remove(). Nothing to do.
      if (this.#reconciler.get(itemId) === null) continue;
      // We can decide now, so any earlier blind-tap doubt is resolved: drop the
      // `unverified` marker before settling the item either way. (No-op unless a
      // previous, blind pass had set it.)
      this.#reconciler.setUnverifiable(itemId, false);

      if (occupiedSlotKeys.has(adoptionKey(slot))) {
        // Adopted by OBSERVATION, not by a CLEAR — so this deliberately does
        // NOT go through `#markAdoptedOnPrimary`, whose owned-occupancy
        // resolution means "provably cleared". We proved the opposite: there IS
        // a producer, and it is ours.
        this.#adopted.add(adoptionKey(slot));
        continue;
      }

      // Silent layer: no producer survived, so the honest state is `loaded`.
      // Re-creating the record through the ordinary `load` intent is what makes
      // it honest — it resets play evidence, so the item can no longer claim
      // air, and `reconcileOnReconnect` (which runs right after us) correctly
      // leaves it alone. The slot must be re-assigned: a fresh `load` record
      // carries none.
      const seq = this.#nextSeq();
      this.#reconciler.applyIntent({ kind: 'load', itemId, templateId, fields }, seq);
      this.#reconciler.assignSlot(itemId, { ...slot, server: 'primary' });
      adds.push(this.#sendAdd(itemId, slot, templateId, fields, seq));
    }
    await Promise.all(adds);
  }

  /**
   * R-011 — store the operator's per-item position override. Refused while
   * the item is on air or unsettled (the R-010 predicate — `unconfirmed`
   * blocks because the on-air result is UNKNOWN); position is fixed once
   * taken (Option A can't reposition on air without a re-serve flash). A
   * LOADED-not-taken item is re-ADDed immediately — an invisible re-serve
   * with the new query, on a non-intent seq (the take re-ADD precedent) so
   * the item's status is never perturbed; the re-ADD is best-effort (the
   * override is stored regardless and the next ADD carries it). An idle
   * item just stores it for the next load.
   */
  async setPosition(
    itemId: string,
    position: Position,
  ): Promise<{ ok: boolean; reason?: 'on-air' | 'unknown-item' }> {
    const item = this.#reconciler.get(itemId);
    if (item === null) return { ok: false, reason: 'unknown-item' };
    if (
      item.pending ||
      item.status === 'playing' ||
      item.status === 'on-air' ||
      item.status === 'updating' ||
      item.status === 'exiting' ||
      item.status === 'unconfirmed'
    ) {
      return { ok: false, reason: 'on-air' };
    }
    this.#positions.set(itemId, position);
    // B-072 — republish so the renderer learns the applied override. Essential
    // for an IDLE item, whose set-position sends nothing to CasparCG and would
    // otherwise never reach the SPA: the picker would re-seed from the manifest
    // default on the next reselect and an innocent re-Apply would revert it.
    // This is a STATE publish only — no intent, no status change, no wire
    // traffic (the R-011 refusal predicate and the AMCP path are untouched).
    this.#markDirty(itemId);
    const slot = this.#slots.get(itemId);
    if (slot !== undefined && this.#loaded.has(itemId) && this.#templates.has(item.templateId)) {
      await this.#sendAdd(itemId, slot, item.templateId, item.fields, this.#nextSeq());
    }
    return { ok: true };
  }

  /**
   * R-006 — the connection gate the on-air verbs never had.
   *
   * `take`/`update`/`out` must reach CasparCG to mean anything. Issuing one at a dead
   * primary used to apply the intent OPTIMISTICALLY and only then discover the send had
   * failed — which is how an item ends up wearing a status no wire ever confirmed. The
   * orphan sweep has gated on exactly this predicate all along (`#sweepOccupancy`); the
   * verbs simply never did.
   *
   * Refusing BEFORE `applyIntent` is the load-bearing part: an intent that is never applied
   * cannot produce an optimistic status, so there is nothing to lie about. And it is a
   * REFUSAL, not a deferral — a queued command would be stranded (reconnect-reconciliation
   * re-delivers template HTML, never stack intents), which is the same false belief one
   * step later.
   *
   * The predicate is "**no declared server is reachable**", NOT "the primary is down"
   * and NOT "no session is `healthy`". Two distinctions are load-bearing:
   *
   *   - B-056 — in a mirror pair whose PRIMARY's AMCP link is dead while the BACKUP is
   *     healthy (auto-failover off — the human-in-the-loop scenario), every send still
   *     lands backup-only on a real, rendering CasparCG. Something genuinely IS on air
   *     there, so refusing would be both a regression of the redundancy contract and a
   *     lie in the opposite direction. We refuse only when the command can reach NO
   *     server at all.
   *   - B-100 — a `degraded` server (OSC-silent past the threshold, AMCP socket still
   *     up) is REACHABLE: OSC is the CONFIRMATION channel, AMCP is the COMMAND channel,
   *     and a command reaches CasparCG over AMCP regardless of OSC. Refusing on OSC
   *     silence would turn a monitoring fault into a total playout outage (B-094's
   *     wrong-OSC-port install would go off air entirely). Reachability therefore reuses
   *     the caspar-client's own `isLiveState` (`healthy` OR `degraded`) rather than
   *     re-deriving the state list here — a second local copy is how the name came to
   *     lie about the predicate in the first place. Honesty under silence is preserved by
   *     the surfaces that already exist (B-086 demotes on-air rows to `unverified`,
   *     B-094 renders `⚠ NO OSC`), not by refusal.
   */
  #noServerReachable(): boolean {
    const sessions = [this.#sessions.A, this.#sessions.B].filter(
      (s): s is ServerSession => s !== undefined,
    );
    return sessions.every((s) => !isLiveState(s.state));
  }

  /**
   * Retire a pending restore because the OPERATOR has acted on the item.
   *
   * Load-bearing since the blind-tap refusal (B-093) made a pending restore able
   * to OUTLIVE the decision pass: before it, every pending entry was consumed on
   * the first decision, so it could never be stale. Now an item can sit pending
   * across reconnects while the operator takes it, edits its fields, or clears
   * it — and the parked entry still holds the RESTORE-TIME template, fields and
   * slot. Deciding it later would replay that stale snapshot over live state:
   * re-ADDing (play-on-load 0) over a producer the operator has since taken to
   * air, and reverting their field edits.
   *
   * The operator's action is newer evidence than anything the restore was
   * waiting to infer, so it simply retires the restore.
   */
  #retirePendingRestore(itemId: string): void {
    if (this.#pendingRestore.delete(itemId)) {
      // The doubt is resolved by the operator's own command; drop the marker so
      // the row stops reading `unverified` on the strength of it.
      this.#reconciler.setUnverifiable(itemId, false);
    }
  }

  async take(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    /**
     * R-022 — THE INTERLOCK. A rehearsing item cannot be taken to air, and the
     * refusal lives HERE rather than only in a disabled button.
     *
     * This is the whole point of making rehearse a mode instead of a preview
     * pane. A greyed-out PLAY is a request, not a guarantee: another browser with
     * a stale snapshot, a client that reconnected mid-rehearse, or any direct
     * call reaches this method with the button's opinion nowhere in sight. If the
     * only thing standing between rehearse and air were UI state, rehearse would
     * be exactly the "preview pane we hope nobody plays from" this feature exists
     * not to be.
     *
     * Refused rather than silently exiting rehearse and playing: leaving the mode
     * is the operator's decision, and a PLAY that quietly dropped the interlock
     * would be a compound verb hiding a mode change behind a take — the same
     * objection that keeps re-binding a row a two-step Remove-then-Load.
     *
     * FIRST in the method, before `#retirePendingRestore`: a refused take must
     * mutate nothing, and retiring a parked restore is a mutation.
     */
    if (this.#rehearsing.has(itemId)) return { accepted: false, errorCode: 'rehearsing' };
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'take', itemId }, seq);

    // B-039 — PRESCRIPTIVE: `CG PLAY` only renders if a live producer exists on the
    // slot. If a prior out destroyed it, re-issue `CG ADD` (a fresh load) FIRST so
    // the take re-renders instead of playing an empty layer. The re-ADD recovers the
    // template id + current (merged) fields from the Reconciler, and rides a
    // non-intent seq so its ack doesn't perturb the take's status.
    if (!this.#loaded.has(itemId)) {
      const item = this.#reconciler.get(itemId);
      const templateId = item?.templateId ?? itemId;
      // Reconnect-reconciliation — the re-ADD is a fresh load: the same
      // unknown-template guard applies (never blind-ADD an unservable URL).
      if (!this.#templates.has(templateId)) {
        this.#reconciler.applyAck(seq, false, 'unknown-template');
        return { accepted: false, errorCode: 'unknown-template' };
      }
      const added = await this.#sendAdd(
        itemId,
        slot,
        templateId,
        item?.fields ?? {},
        this.#nextSeq(),
      );
      if (!added.ok) {
        /*
          §8 — THE PRE-ROLL'S OWN REASON, not a re-labelling of it.

          This said `amcp-error` for every failure of the B-039 re-ADD, including
          the one where the bridge's OWN template server is down and CasparCG was
          never contacted. `amcp-error` asserts CasparCG was involved; the
          operator reads it and goes to the playout machine.

          The fallback stays `amcp-error` only for the case where the ADD really
          did fail at the wire with no code to quote.
        */
        const code = added.errorCode ?? 'amcp-error';
        this.#reconciler.applyAck(seq, false, code);
        return { accepted: false, errorCode: code };
      }
    }

    // R-022 — RE-ASSERT THE INTENDED VOLUME, UNCONDITIONALLY, ON EVERY TAKE.
    //
    // This is the single most important line in the rehearse feature, and it is
    // deliberately HERE — in the play path — rather than in a "leave rehearse"
    // step. Rehearse mutes a layer whose producer stays resident, and MIXER state
    // is channel state: it survives a CLEAR, a CG REMOVE and a bridge restart,
    // and nothing restores it implicitly. A mute that is not restored means A
    // GRAPHIC THAT GOES TO AIR SILENT — which is worse than the audio leak the
    // mute prevents, because nobody notices until someone asks why there is no
    // sound.
    //
    // Putting the restore only on the rehearse-exit path would leave a crash, a
    // browser reload, a dropped WebSocket or any missed transition able to strand
    // the mute. Re-asserting on every take makes that class of bug unreachable:
    // whatever happened before, a graphic cannot reach air without its intended
    // volume being set on the way.
    //
    // It rides its OWN seq, not the take's, so a MIXER refusal cannot perturb the
    // take's reconciled status — and it is deliberately NOT gated on
    // `#rehearsing.has(itemId)`. Gating it would reintroduce exactly the
    // dependence on our own bookkeeping being correct that this exists to remove;
    // the command is idempotent and costs one AMCP line.
    const volumeOk = await this.#send(
      this.#builder.mixerVolume(slot, INTENDED_VOLUME),
      this.#nextSeq(),
      'urgent',
    );
    if (!volumeOk.ok) {
      // A FAILED re-assert does NOT block the take, and it must not be silent.
      //
      // Not blocking: refusing to put a graphic on air because a volume command
      // was rejected would be the worse failure — the operator would have no way
      // to get their graphic up, over an audio setting.
      //
      // Not silent: this is the one moment at which the "graphic airs silent"
      // failure becomes possible, and it is otherwise completely undetectable —
      // every other signal about the layer reads identically muted or not. The
      // first cut of this swallowed the result entirely, which meant the single
      // most consequential failure in the feature had no trace anywhere.
      process.stderr.write(
        `[caspar-bridge] ⚠ could not re-assert volume on ${String(slot.channel)}-${String(slot.layer)} ` +
          `before taking ${itemId} to air (${volumeOk.errorCode ?? 'unknown'}). If this layer was ` +
          `left muted by a rehearsal, the graphic may be ON AIR SILENT — check the output audio.\n`,
      );
    }

    // B-079 — bounded completion for a take, which it never had: #armExpiry was called for
    // update and out only, so a take whose ack never settled rested on its optimistic
    // playing/on-air claim forever, with nothing to bound it.
    this.#armExpiry(seq);
    // §8 — the PLAY's own code rides out: `amcp-send-failed` (the command never
    // left this process) and `amcp-404` (CasparCG refused it) are different facts
    // pointing at different machines, and flattening both to `amcp-error` told the
    // operator neither.
    const { ok, errorCode } = await this.#send(this.#builder.take(slot), seq, 'normal');
    return ok ? { accepted: true } : { accepted: false, errorCode: errorCode ?? 'amcp-error' };
  }

  /**
   * R-022 — enter REHEARSE for a not-on-air item with a template BOUND.
   *
   * THE PRECONDITION IS THE BINDING, AND THAT IS THE WHOLE TEST. Rehearse renders
   * the retained page locally, from the bound template, the operator's values and
   * the channel raster — all bridge-owned, none of them the CasparCG layer. It
   * used to additionally require a resident producer, which made a preview refuse
   * to preview because of a resource it does not use: a CLEARed row could not be
   * rehearsed while the same row after STOP could, and the operator experiences
   * both as "close it".
   *
   * WHAT REMAINS IS A BRANCH ON THE LAYER, NOT A GATE ON IT:
   *
   *   - RESIDENT PRODUCER → mute first, exactly as before. On 2.5.0 a bare
   *     `CG ADD` puts the template's audio on air (R-029), so the mute IS the
   *     safety condition and is part of the guard, not a follow-up: if it does
   *     not land, rehearse is REFUSED. Entering anyway would leave a resident
   *     producer unmuted while every browser shows the row as safely rehearsing.
   *     The producer STAYS RESIDENT — the alternative, CLEAR then re-ADD, is the
   *     sequence that failed in the field (adopt-`CLEAR` succeeded, the `CG ADD`
   *     after it 404'd, the layer was left empty on air), and this is R-029's
   *     recorded containment option 2.
   *   - EMPTY LAYER → enter with NO AMCP TRAFFIC AT ALL. There is nothing on the
   *     layer, so there is nothing to make safe, and a mute aimed at an empty
   *     layer is a command with no subject.
   *
   * Every guard is still HERE, bridge-side, so no UI state can bypass it. The
   * on-air refusal is UNCHANGED and still fails closed: rehearsing a live graphic
   * would mute air.
   */
  async enterRehearse(itemId: string): Promise<{
    ok: boolean;
    reason?: RehearseEnterReason;
    message?: string;
  }> {
    const slot = this.#slots.get(itemId);
    if (slot === undefined) {
      return { ok: false, reason: 'unknown-item', message: 'That item is not on the stack.' };
    }
    if (this.#rehearseBusy.has(itemId)) return { ok: false, reason: 'busy', message: BUSY_MESSAGE };
    if (this.#rehearsing.has(itemId)) return { ok: true };
    const item = this.#reconciler.get(itemId);
    if (item === null || item === undefined) {
      return { ok: false, reason: 'unknown-item', message: 'That item is not on the stack.' };
    }
    // Fail closed on the air question: `unconfirmed`/`pending` mean the on-air
    // result is UNKNOWN, and an unknown must never be muted on a guess. Reuses
    // the SAME predicate `#onAirCount` and R-010's `setConfig` gate read, never a
    // second local list of what counts as on air.
    if (isOnAirStatus(item.status, item.pending)) {
      return {
        ok: false,
        reason: 'on-air',
        message:
          'That graphic is on air or unsettled. Take it off air before rehearsing it — ' +
          'rehearse mutes the layer, and muting a live graphic is not something this will do.',
      };
    }
    // THE BRANCH. Read ONCE, here, and carried into the rehearsal record — the
    // exit path must not re-derive it. Between entry and exit the layer can
    // change under us (a take, another operator, the playout system), and a
    // second read would decide the restore from a DIFFERENT fact than the one
    // that decided the mute. That is the B-100 two-reads class: the constructive
    // step and the step that undoes it must read the same evaluation.
    const mustMute = this.#loaded.has(itemId);
    if (!mustMute) {
      // Nothing resident: no mute, no traffic, nothing to fail. `#rehearseBusy`
      // is not taken either — it serialises AMCP round trips, and there are none.
      this.#rehearsing.set(itemId, {
        itemId,
        channel: slot.channel,
        layer: slot.layer,
        muted: false,
      });
      this.rehearseChanged.emit(this.rehearseState());
      return { ok: true };
    }
    // A producer is resident, so mute it — BEST EFFORT. See the note below for
    // why entry no longer refuses when it does not land.
    this.#rehearseBusy.add(itemId);
    try {
      const { ok } = await this.#send(
        this.#builder.mixerVolume(slot, 0),
        this.#nextSeq(),
        'urgent',
      );
      /*
       * §4 — THE MUTE IS BEST-EFFORT. ENTRY NEVER FAILS ON IT.
       *
       * It used to refuse, which made ON PVW behave differently on two rows the
       * operator considers identical: a row closed with STOP keeps its producer,
       * so `#loaded` still held it and the mute branch ran and failed; a row
       * closed with CLEAR had `#loaded` deleted by `out()`, took the zero-AMCP
       * path, and succeeded. Two ways of closing a graphic, two different answers.
       *
       * That is the last thing `dev-rehearse-decouple` left behind. It removed the
       * PRECONDITION — rehearse no longer requires a resident producer — but kept
       * this CONSEQUENCE branch, and the branch reads `#loaded`, which is exactly
       * "what is on the CasparCG layer". The standing decision is that entry does
       * not depend on that, so it no longer does.
       *
       * WHAT IS GIVEN UP, stated rather than buried: with the mute unlanded, a
       * resident producer stays unmuted while the row claims PVW, and on 2.5.0 a
       * resident producer's audio can be on air (R-029). The exchange is
       * deliberate — PVW sends nothing to the layer, so entering changes nothing
       * that was not already true, and the common case for a failed mute is an
       * unreachable server, where nothing we do reaches air anyway.
       *
       * The failure is RECORDED, not swallowed: `muted` carries whether the mute
       * actually landed, and exit mirrors it — a rehearsal that muted nothing
       * restores nothing, which is the B-100 read-once pairing this branch has
       * always kept.
       */
      this.#rehearsing.set(itemId, {
        itemId,
        channel: slot.channel,
        layer: slot.layer,
        // What ACTUALLY happened, not what was intended — exit mirrors this.
        muted: ok,
      });
      this.rehearseChanged.emit(this.rehearseState());
      return { ok: true };
    } finally {
      this.#rehearseBusy.delete(itemId);
    }
  }

  /**
   * R-022 — leave REHEARSE and restore the layer's intended volume.
   *
   * Reports `ok` even when the un-mute command fails, and says so in `message`.
   * The alternative would leave every browser claiming rehearse over a layer the
   * bridge no longer treats as rehearsing — a UI that lies about an interlock is
   * worse than one that admits a command failed. The restore is also not the last
   * line of defence: the PLAY path re-asserts the intended volume on every take
   * and the bridge re-asserts for every declared row at startup, so a failed
   * un-mute here cannot strand a silent graphic on air.
   */
  async exitRehearse(itemId: string): Promise<{
    ok: boolean;
    reason?: RehearseExitReason;
    message?: string;
  }> {
    if (this.#rehearseBusy.has(itemId)) return { ok: false, reason: 'busy', message: BUSY_MESSAGE };
    const rehearsal = this.#rehearsing.get(itemId);
    if (rehearsal === undefined) {
      return { ok: false, reason: 'unknown-item', message: 'That item is not rehearsing.' };
    }
    // Dropped from the set FIRST, so the state is honest even if the send throws:
    // the bridge has stopped interlocking this row, and it must not keep telling
    // browsers otherwise.
    this.#rehearsing.delete(itemId);
    this.rehearseChanged.emit(this.rehearseState());
    // EXIT MIRRORS ENTRY. A rehearsal that muted nothing restores nothing: the
    // flag is the one recorded at entry, never a fresh read of `#loaded`. A
    // producer loaded onto this layer DURING the rehearsal is not ours to
    // re-volume on the way out — the restore would be aimed at a graphic this
    // rehearsal never silenced.
    if (!rehearsal.muted) return { ok: true };
    this.#rehearseBusy.add(itemId);
    try {
      const { ok } = await this.#send(
        this.#builder.mixerVolume(
          { channel: rehearsal.channel, layer: rehearsal.layer },
          INTENDED_VOLUME,
        ),
        this.#nextSeq(),
        'urgent',
      );
      if (ok) return { ok: true };
      return {
        ok: true,
        message:
          'Rehearse ended, but the layer volume could not be restored. It will be re-asserted the ' +
          'next time this layer is taken to air.',
      };
    } finally {
      this.#rehearseBusy.delete(itemId);
    }
  }

  /**
   * R-022 — every row currently rehearsing, PROJECTED to the wire contract.
   *
   * The internal record also carries `muted`, which is bridge bookkeeping about
   * a command it sent; the contract is "facts only — the renderer derives its own
   * row state", and a browser has no use for it. Projected explicitly rather than
   * spread, so a field added to the internal record can never leak onto the wire
   * by default.
   */
  rehearseState(): Rehearsal[] {
    return [...this.#rehearsing.values()]
      .sort((a, b) => a.channel - b.channel || a.layer - b.layer)
      .map(({ itemId, channel, layer }) => ({ itemId, channel, layer }));
  }

  /**
   * R-022 — REHEARSE IS A CLAIM ABOUT OUR INTENT, NOT A GUARANTEE ABOUT THE
   * CHANNEL. If the layer goes live by ANY route while a row is rehearsing —
   * another operator on another browser, the playout system driving AMCP
   * directly, anything — the honest response to being wrong is to stop claiming
   * it, immediately, and restore the volume.
   *
   * Called from the occupancy sweep. The signal is the RECONCILED ITEM STATUS,
   * not OSC occupancy, and the distinction matters: a rehearsing layer carries a
   * resident `html` producer, so OSC reports `html` whether it is playing or
   * merely held ready — occupancy genuinely cannot tell the two apart, and using
   * it here would abort every rehearsal on the first sweep. The reconciler's
   * status is driven by AMCP acks and OSC confirmations together and is the only
   * thing that distinguishes them.
   */
  #abortRehearsalsThatWentLive(): void {
    for (const itemId of [...this.#rehearsing.keys()]) {
      const item = this.#reconciler.get(itemId);
      // An item that has VANISHED (removed from the stack) is also no longer
      // ours to interlock. Its volume still has to be restored — the producer may
      // be gone but the mixer setting is not.
      const live = item == null || isOnAirStatus(item.status, item.pending);
      if (!live) continue;
      process.stderr.write(
        `[caspar-bridge] rehearse on ${String(itemId)} ended: the layer went live by another ` +
          `route, so the rehearse claim was withdrawn and the volume restored.\n`,
      );
      void this.exitRehearse(itemId);
    }
  }

  /**
   * R-022 — re-assert the intended volume for every DECLARED row at startup.
   *
   * The bridge already owns restore, and this belongs with it. A bridge that died
   * mid-rehearse left a muted layer behind: mixer state is channel state and
   * survives the process, so without this the next operator would take that
   * graphic to air silent, with nothing anywhere explaining why. Runs once the
   * primary is first reachable, best-effort, and is idempotent.
   */
  async #reassertDeclaredVolumes(): Promise<void> {
    const bank = this.#fixedBank;
    if (bank === null) return;
    for (let layer = bank.start; layer < bank.start + bank.count; layer++) {
      // `normal`, not `urgent`: this is startup housekeeping across the whole
      // bank, and it must never sit ahead of an operator's take in the queue.
      await this.#send(
        this.#builder.mixerVolume({ channel: bank.channel, layer }, INTENDED_VOLUME),
        this.#nextSeq(),
        'normal',
      );
    }
  }

  async update(
    itemId: string,
    fields: FieldValues,
    mergeMode: 'merge' | 'replace',
  ): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
    // R-006 — see #noServerReachable(): refuse before the intent exists.
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'update', itemId, fields, mergeMode }, seq);

    // B-070 — PRESCRIPTIVE, the rule `update` never had (take has it since
    // B-039; setPosition checks the same set). `CG UPDATE` needs a live
    // PRODUCER, not air: real CasparCG 403s it on a layer whose producer is
    // empty. When the slot holds no producer — a prior `out` destroyed it, a
    // reconnect/setConfig cleared the bookkeeping — the operator's edit is
    // COMMITTED to the authoritative field-set and NOTHING goes on the wire.
    // The next take's B-039 re-ADD replays exactly these fields through
    // `CG ADD`'s data payload, so the edit reaches air.
    //
    // The intent is settled IN-PROCESS: a no-send path has no wire ack, and
    // B-044 forbids resting non-terminal (an unsettled `updating` is precisely
    // the zombie `pending` that used to block R-011's setPosition forever).
    if (!this.#loaded.has(itemId)) {
      this.#reconciler.applyAck(seq, true);
      return { accepted: true };
    }

    // Send the merged field set the Reconciler now holds.
    const merged = this.#reconciler.get(itemId)?.fields ?? fields;
    this.#armExpiry(seq);
    const { ok, errorCode } = await this.#send(this.#builder.update(slot, merged), seq, 'normal');
    return ok ? { accepted: true } : { accepted: false, errorCode: errorCode ?? 'amcp-error' };
  }

  /**
   * C-012 — GRACEFUL stop: run the template's own outro and leave the producer
   * RESIDENT on the layer.
   *
   * The distinction from `out()` is the whole point, and it is hardware-verified
   * (PR #353's probe, CasparCG 2.3.2 `4de6d18f`):
   *
   *   out()  -> `CLEAR <ch>-<layer>`  — OSC goes SILENT, the producer is DESTROYED,
   *             and a later take must re-ADD before it can play.
   *   stop() -> `CG <ch>-<layer> STOP` — 202 CG OK, the template's `window.stop`
   *             fires (its graceful outro, NOT `remove()`'s synchronous kill), OSC
   *             still reports `html`, and a bare `CG PLAY` RESUMES it with no re-ADD.
   *
   * So `#loaded` is deliberately NOT cleared here — that set means "a live producer
   * exists on this slot", which after a STOP is still true. Keeping it is what makes
   * the resume work: `take()` sees the producer and issues a bare `CG PLAY` instead
   * of the B-039 re-ADD. Deleting it would force a pointless re-load and throw away
   * the very property that makes STOP worth having.
   *
   * `#adopted` is likewise untouched: a STOP proves nothing about the layer being
   * clear — it leaves a producer there — so it must not count as adoption the way a
   * landed CLEAR does.
   *
   * Nothing waits on the outro. The ack means CasparCG accepted the command, not
   * that the animation finished, and outro completion is not observable from here
   * (B-030). No timer chases it.
   */
  // NB `stop()` on this class is the PROCESS shutdown, so the item verb is
  // `stopItem` — the AMCP verb it sends is still `CG … STOP`.
  async stopItem(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
    // R-006 — STOP takes a graphic off air, so it is an on-air-affecting command and
    // is refused with the link down exactly like take/update/out. Claiming a stop
    // succeeded when nothing reached CasparCG is the same lie in the other direction.
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'stop', itemId }, seq);
    this.#armExpiry(seq);
    // Urgent lane, like out(): an air-affecting verb does not queue behind loads.
    // §8 — and the code comes with it. A refused STOP used to answer a bare
    // `{ accepted: false }`, which the toast could only render as "Not accepted."
    // — the operator told that a graphic did not come off air, and nothing about
    // whether the command reached CasparCG at all.
    const { ok, errorCode } = await this.#send(this.#builder.stop(slot), seq, 'urgent');
    return { accepted: ok, ...(!ok && errorCode !== undefined && { errorCode }) };
  }

  /**
   * R-028 (5.4) — advance the item's template sequence: `CG … NEXT`.
   *
   * Modelled on `stopItem`, and for the same reasons: it is on-air-affecting
   * (the graphic visibly changes), so it is REFUSED with no reachable server
   * (R-006) rather than optimistically applied, and it rides the urgent lane —
   * an operator stepping a sequence must not queue behind a load.
   *
   * NOT an intent: `next` carries no per-item state the Reconciler models
   * (the item stays exactly as on-air as it was; only the template's internal
   * step moved), so it applies no intent and arms no expiry. That is why it
   * touches neither `#loaded` nor `#adopted` — advancing a sequence proves
   * nothing new about the producer's existence beyond what PLAY already did.
   *
   * The bridge does NOT re-check `hasNext` here: whether a template has a next
   * step is import-time knowledge carried on `TemplateInfo`, and the row gates
   * on it. A NEXT that reaches a single-step template is a harmless no-op on
   * the wire (`CG NEXT` on a template with no sequence does nothing), so the
   * gate is the UI's to hold and this path stays a thin verb.
   */
  async nextItem(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const { ok, errorCode } = await this.#send(this.#builder.next(slot), this.#nextSeq(), 'urgent');
    return ok ? { accepted: true } : { accepted: false, errorCode: errorCode ?? 'amcp-error' };
  }

  async out(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false };
    // R-006 — see #noServerReachable(). An out cannot reach a dead server either; claiming it
    // succeeded would be the mirror-image lie (an operator believing a graphic came OFF).
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'out', itemId }, seq);
    this.#armExpiry(seq);
    const { ok, onPrimary, errorCode } = await this.#send(this.#builder.out(slot), seq, 'urgent');
    // B-039 — `CLEAR` DESTROYS the producer: record that no producer exists on the
    // slot so a subsequent take re-ADDs (instead of `CG PLAY`-ing an empty layer).
    // The slot stays RESERVED (the item is still on the stack, idle) until remove —
    // retake re-ADDs onto the same slot; OSC interest stays put so idle confirms.
    this.#loaded.delete(itemId);
    // A CLEAR executed on the CURRENT PRIMARY counts as adoption — the layer's
    // state is known there (a backup-only ack proves nothing about the primary)
    // — and provably resolves any B-056 owned-slot warning; a backup-only out
    // leaves the warning standing (the primary's orphan may still be live).
    if (ok && onPrimary) this.#markAdoptedOnPrimary(slot);
    // §8 — CLEAR is the escape hatch, so it is the verb where "the command never
    // left" versus "CasparCG refused it" matters MOST: the first is fixed by
    // waiting for the link, the second means the graphic is still on air and
    // needs another route off. It answered a bare `{ accepted: false }`.
    return { accepted: ok, ...(!ok && errorCode !== undefined && { errorCode }) };
  }

  // ── R-009: orphan-layer sweep + explicit per-layer Clear ────────────

  /** The currently surfaced orphan layers (stable-sorted). */
  orphans(): OrphanLayer[] {
    return this.#orphanTracker.orphans();
  }

  /**
   * R-021 stage 1 — the configured fixed operator slots (empty when no bank is
   * declared). Read from the LayerManager, the single source of the bank.
   */
  fixedSlots(): readonly LayerSlot[] {
    return this.#layers.fixedSlots();
  }

  // ── R-021 stage 2a: fixed-bank wire contract (config + per-slot state) ──

  /** The declared fixed bank, or null when none is configured. */
  fixedLayersConfig(): FixedLayerBank | null {
    return this.#fixedBank;
  }

  /**
   * Apply a LIVE bank change (design (e)): validate → apply → publish. The
   * validators are `fixed-layers-store`'s — never re-derived here — called
   * with the SAME policy object the LayerManager was built with. There is NO
   * on-air block (growth and alias changes are live by design; the refusals
   * are renumber/channel-change and shrink-with-residents). On refusal
   * NOTHING is applied or published; persistence is the caller's step
   * (`bridge.ts` persists on ok, non-fatally, after this returns).
   */
  setFixedLayers(next: FixedLayerBank): {
    ok: boolean;
    reason?: FixedLayersErrorCode;
    message?: string;
  } {
    let slots: readonly LayerSlot[];
    try {
      if (this.#fixedBank === null) {
        // No current bank: installing one live is validated like a load…
        slots = validateFixedBank(next, {
          policy: this.#layerPolicy,
          reservedLayers: this.#reservedLayers,
        });
        // …PLUS the fail-closed untick rule, which validateFixedBank alone
        // cannot carry (the BOOT path shares it, and at boot occupancy is
        // always unknown — the persisted ticks were adjudicated when applied).
        // A LIVE install that arrives with layers already hidden must not
        // slip an occupied or unverifiable layer out of sight in one step.
        for (let layer = next.start; layer <= next.start + next.count - 1; layer++) {
          if (isLayerVisible(next, layer)) continue;
          const occupancy = this.#fixedSlotOccupancy({ channel: next.channel, layer });
          if (occupancy === 'occupied') {
            throw new FixedLayersConfigError(
              'untick-occupied',
              `cannot hide layer ${String(layer)}: it is OCCUPIED (an item or producer is on ` +
                `it) — remove its template first (removal implies clear), then untick`,
            );
          }
          if (occupancy === 'unknown') {
            throw new FixedLayersConfigError(
              'untick-unknown',
              `cannot hide layer ${String(layer)}: its occupancy is UNKNOWN (no healthy ` +
                `CasparCG link or no fresh OSC), and unknown is never treated as empty — a ` +
                `hidden row may be on air. Restore the link/OSC so the layer reads empty, ` +
                `then untick`,
            );
          }
        }
      } else {
        slots = validateFixedBankChange(this.#fixedBank, next, {
          policy: this.#layerPolicy,
          reservedLayers: this.#reservedLayers,
          slotOccupancy: (slot) => this.#fixedSlotOccupancy(slot),
        });
      }
    } catch (err) {
      if (err instanceof FixedLayersConfigError) {
        return { ok: false, reason: err.code, message: err.message };
      }
      throw err;
    }
    this.#layers.applyFixed(slots);
    this.#fixedBank = next;
    this.fixedConfigChanged.emit(next);
    // The bank changed, so the per-slot state did too — publish through the
    // same change-compare the sweep uses (never a second derivation).
    this.#publishFixedStateIfChanged();
    return { ok: true };
  }

  /** The current per-slot state, computed on demand ([] when no bank). */
  fixedLayersState(): FixedSlotState[] {
    return this.#computeFixedState();
  }

  /**
   * The slot keys retained restore intent points at (empty until stage 3/4
   * populate real retained bindings on fixed slots — see `isFixedSlotBusy`).
   */
  #retainedFixedSlotKeys(): ReadonlySet<string> {
    const keys = new Set<string>();
    for (const { slot } of this.#pendingRestore.values()) {
      keys.add(`${String(slot.channel)}:${String(slot.layer)}`);
    }
    return keys;
  }

  /**
   * R-028 (2.3) — the occupancy verdict the untick validator reads, composed
   * from the two knowledge sources IN ORDER:
   *
   *   1. The bridge's OWN records — a bound item or retained intent
   *      (`isFixedSlotBusy`). Valid even with no OSC at all: the bridge put
   *      the item there, so `occupied` needs no wire confirmation.
   *   2. The occupancy tap, with the SAME hearing predicate
   *      `#computeFixedState` publishes from (`state === 'healthy'` +
   *      `hasFreshOsc`) — never a second staleness constant. Hearing +
   *      observed producer → `occupied` (a foreign/playout producer blocks
   *      hiding too); hearing + silent → `empty` (B-053); not hearing →
   *      `unknown` — which the validator REFUSES, fail closed.
   */
  #fixedSlotOccupancy(slot: LayerSlot): SlotOccupancy {
    if (
      isFixedSlotBusy(slot, {
        fixedBinding: (s) => this.#layers.fixedBinding(s),
        retainedSlotKeys: this.#retainedFixedSlotKeys(),
      })
    ) {
      return 'occupied';
    }
    const session = this.#adapter.primarySession;
    const hearing =
      session.state === 'healthy' && session.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs);
    if (!hearing) return 'unknown';
    const observed = session.osc.occupancy
      .occupied(this.#occupancyStaleMs)
      .some((o) => o.channel === slot.channel && o.layer === slot.layer);
    return observed ? 'occupied' : 'empty';
  }

  /**
   * Per-slot state per D3's honesty rules, reusing the sweep's OWN predicates
   * (`state !== 'healthy'`, `hasFreshOsc(#occupancyStaleMs)`,
   * `occupied(#occupancyStaleMs)`) — never a second staleness constant:
   * unhealthy primary or a silent tap ⇒ every slot `unknown` (never 'empty');
   * a hearing tap ⇒ present layers are `producer`, absent ones `empty`
   * (B-053: on a hearing tap, silence IS empty).
   *
   * R-021 stage 3 — `binding` is now real: the `itemId` comes from `#slots`
   * (the item→slot map every load already maintains) and the `templateType`
   * from the LayerManager's own `fixedBinding` — the SINGLE source of what is
   * bound, never a second local map. BOTH must be present, so a half-state
   * (an item removed but the fence not yet dropped, or vice versa) publishes
   * `null` rather than a binding that names nothing.
   */
  #computeFixedState(): FixedSlotState[] {
    const slots = this.#layers.fixedSlots();
    if (slots.length === 0) return [];
    const aliases = this.#fixedBank?.aliases ?? {};
    const itemBySlot = new Map<string, string>();
    for (const [itemId, s] of this.#slots) {
      itemBySlot.set(`${String(s.channel)}:${String(s.layer)}`, itemId);
    }
    const session = this.#adapter.primarySession;
    const hearing =
      session.state === 'healthy' && session.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs);
    const occupiedBy = new Map<string, string>();
    if (hearing) {
      for (const o of session.osc.occupancy.occupied(this.#occupancyStaleMs)) {
        occupiedBy.set(`${String(o.channel)}:${String(o.layer)}`, o.producer);
      }
    }
    return [...slots]
      .sort((a, b) => a.channel - b.channel || a.layer - b.layer)
      .map((slot) => {
        const key = `${String(slot.channel)}:${String(slot.layer)}`;
        const alias = aliases[String(slot.layer)];
        const producer = occupiedBy.get(key);
        const observed: FixedSlotState['observed'] = !hearing
          ? { kind: 'unknown' }
          : producer !== undefined
            ? { kind: 'producer', producer }
            : { kind: 'empty' };
        const itemId = itemBySlot.get(key);
        const templateType = this.#layers.fixedBinding(slot);
        // R-028 (3.1) — WHICH template is on the row, resolved by the bridge
        // (item → templateId → its own registry), so every browser reads the
        // SAME answer and an item another browser loaded is never foreign.
        // (3.3) — resolution needs a LIVE item→slot binding: after a bridge
        // restart there is none until the item is reloaded, so identity is
        // simply ABSENT (honest unknown) — never guessed from the persisted
        // registry, which records what was imported, not what is on a layer.
        let identity: {
          templateId?: string;
          templateName?: string;
          sourceFileName?: string;
        } = {};
        if (itemId !== undefined) {
          const templateId = this.#reconciler.get(itemId)?.templateId;
          if (templateId !== undefined) {
            // RAW naming facts only — name AND sourceFileName. The renderer
            // resolves the display label with its ONE canonical rule
            // (`templateDisplayName`: file name first); resolving here would
            // be the second copy of that rule.
            const info = this.#templates.get(templateId);
            identity = {
              templateId,
              ...(info?.name !== undefined && info.name !== '' ? { templateName: info.name } : {}),
              ...(info?.sourceFileName !== undefined && info.sourceFileName !== ''
                ? { sourceFileName: info.sourceFileName }
                : {}),
            };
          }
        }
        return {
          channel: slot.channel,
          layer: slot.layer,
          ...(alias !== undefined ? { alias } : {}),
          observed,
          binding:
            itemId !== undefined && templateType !== undefined
              ? { itemId, templateType, ...identity }
              : null,
        };
      });
  }

  /**
   * Publish the per-slot state ONLY when it differs from the last published
   * array (deep compare — the orphan-tracker precedent). Runs from the sweep
   * tick that already samples occupancy (no second timer) and from an applied
   * bank change. With no bank declared it never publishes anything.
   */
  #publishFixedStateIfChanged(): void {
    if (this.#layers.fixedSlots().length === 0 && this.#fixedBank === null) return;
    const state = this.#computeFixedState();
    const json = JSON.stringify(state);
    if (json === this.#lastFixedStateJson) return;
    this.#lastFixedStateJson = json;
    this.fixedStateChanged.emit(state);
  }

  /** B-056 — the currently surfaced owned-slot warnings (stable-sorted). */
  ownedOccupancy(): OwnedOccupancyWarning[] {
    return [...this.#ownedOccupancy.values()].sort(
      (a, b) => a.channel - b.channel || a.layer - b.layer,
    );
  }

  /**
   * One sweep tick: sample the CURRENT primary's passive OSC occupancy tap
   * and diff it against the layers this bridge owns (#slots). Reads the
   * primary dynamically — after a failover or setConfig the next tick
   * sweeps the new primary with zero rewiring. Skips unless the primary
   * session is healthy: while disconnected the sweep neither runs nor
   * resolves — existing warnings FREEZE (absence of knowledge is not
   * knowledge of absence). Publishes only when the surfaced set changes;
   * no per-tick logging.
   */
  #sweepOccupancy(): void {
    // R-021 stage 2a — the per-slot fixed state publishes from THIS tick
    // (same occupancy sample, no second timer), and deliberately BEFORE the
    // healthy guard: on a disconnect the next tick honestly re-publishes every
    // slot as `unknown` instead of freezing a stale 'empty'/'producer'.
    this.#publishFixedStateIfChanged();
    // R-028 part B — the PLAYOUT state publishes here for the SAME reason, and
    // it matters more here than anywhere else: this is the input to a CLEAR
    // gate. Published after the guard (as it first was), a CasparCG outage
    // would leave the tab frozen on "Graphic on air (html)" with an ENABLED
    // CLEAR that the bridge can only refuse — unverifiable occupancy shown as
    // verified, and an enabled control that can only reject, both at once.
    // The two publishes belong on the SAME side of the guard because they
    // answer the same question about the same tap.
    this.#publishPlayoutStateIfChanged();

    // R-022 — withdraw any rehearse claim whose layer has gone live by another
    // route. Deliberately BEFORE the reachability guards, like the two publishes
    // above and for the same reason: this reads the RECONCILER, not the wire, so
    // it needs no healthy session — and a rehearse claim that has become false
    // must not be left standing just because the server is unreachable.
    this.#abortRehearsalsThatWentLive();

    const session = this.#adapter.primarySession;

    // R-030 — piggyback the video-mode read on this tick rather than arming a
    // second timer, and gate it so it is NOT one AMCP query every 5 s: a channel
    // whose mode has already been read FROM THE CURRENT PRIMARY is not re-read.
    // Failover re-arms it, because A and B are different machines that can carry
    // different video modes — a reading from A is not evidence about B.
    //
    // DELIBERATELY BEFORE THE `healthy` GUARD BELOW, and gated on `isLiveState`
    // instead. The video mode is an AMCP-AXIS question — it is answered by
    // sending `INFO` and reading the reply — so OSC silence must not decide
    // whether it can be asked (CLAUDE.md golden rules 6 and 8: probe the axis
    // you intend to judge, and reuse the ONE canonical predicate). `degraded` is
    // AMCP-up / OSC-silent and therefore REACHABLE. Sitting under the `healthy`
    // guard, as the first cut of this did, meant every OSC-less install read no
    // mode at all, reported `unreadable` forever, and so silently lost the
    // mismatch check — on exactly the installs the C-018 recon was about.
    if (isLiveState(session.state)) {
      for (const channel of this.#declaredChannels()) {
        if (this.#modeReadFrom.get(channel) === this.#adapter.currentPrimary) continue;
        void this.#readChannelMode(channel);
      }
      // R-022 — re-assert every declared row's intended volume, once, as soon as a
      // server is first reachable. A bridge that died mid-rehearse left a MUTED
      // layer behind (mixer state is channel state and outlives the process), and
      // without this the next operator would take that graphic to air silent with
      // nothing anywhere explaining why. Gated on `isLiveState` for the same reason
      // as the mode read: it is an AMCP-axis action, so OSC silence must not
      // decide whether it happens.
      if (!this.#volumesReasserted) {
        this.#volumesReasserted = true;
        void this.#reassertDeclaredVolumes();
      }
    }

    if (session.state !== 'healthy') return;

    // B-094 — re-publish health when the OSC-heard bit flips, so the operator's
    // NO OSC indicator appears and clears on its own. Cheap: this tick already
    // runs, and it publishes only on a CHANGE, never per tick.
    const heard = session.osc.occupancy.lastOscTrafficAt !== null;
    if (this.#lastPublishedOscHeard !== heard) {
      this.#lastPublishedOscHeard = heard;
      this.healthChanged.emit(this.health());
    }

    // A restore that refused to decide (blind tap) left its items pending. If
    // OSC has started arriving since, decide them now — otherwise a tap that
    // came up a moment after the healthy transition would strand those rows as
    // `unverified` for the life of the process. Cheap: this tick already runs
    // and already samples occupancy.
    if (
      this.#pendingRestore.size > 0 &&
      session.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs)
    ) {
      const occupiedKeys = new Set(
        session.osc.occupancy
          .occupied(this.#occupancyStaleMs)
          .map((o) => `${String(o.channel)}:${String(o.layer)}`),
      );
      void this.#decidePendingRestores(occupiedKeys, true);
    }

    // C-014 — keep the allocation quarantine in step with what the tap sees;
    // the same tick that surfaces orphans withdraws foreign layers from the
    // allocatable pool (and returns them when the foreign producer leaves).
    this.#reconcileForeignQuarantine();

    // R-028 / C-015 — declared playout layers are excluded from the orphan
    // candidates entirely (the spec scenario "Declared playout layers never
    // surface as orphans"): the sweep would otherwise permanently surface a
    // healthy playout graphic as reclaimable and invite the operator to clear
    // live automation output. Exclusion, not ownership — the bridge neither
    // owns nor watches these layers; it just declares them off limits.
    const occupied = session.osc.occupancy
      .occupied(this.#occupancyStaleMs)
      .filter((o) => !this.#reservedSet.has(o.layer));
    const owned = new Set<string>();
    for (const slot of this.#slots.values()) {
      owned.add(`${String(slot.channel)}:${String(slot.layer)}`);
    }
    /*
     * BANK LAYERS ARE NO LONGER EXCLUDED — the exclusion's own premise expired.
     *
     * It read: "fixed slots are excluded from the orphan surface: the fixed
     * bank's PERMANENT row is its occupancy surface, and a bank fenced from
     * allocation but still shouted about in the R-009 banner would be an
     * incoherent intermediate state."
     *
     * THE ROW IS NO LONGER THAT SURFACE. An unbound bank row now reads `EMPTY`
     * unconditionally and asks CasparCG nothing — the owner's rule, and it stays.
     * So the two halves that used to cover this fact between them became zero:
     * another system's live video on a declared bank layer was reported nowhere,
     * while the row said "Nothing is loaded on this row" and offered LOAD.
     *
     * There is no double-talk left to avoid, because only one voice remains. And
     * the banner already models this case properly — `html` gets the warning
     * strip with a confirm-gated Clear (plausibly OUR graphic riding a dead
     * session), `ffmpeg` gets the neutral "in use by other systems" strip. A
     * second, narrower banner would be a second implementation of one fact.
     *
     * SCOPE: only UNBOUND bank layers can surface here. A bank layer carrying an
     * item we bound is already in `owned` above via `#slots`, so this reports
     * exactly "a producer on a bank layer that we did not put there" — ticked or
     * unticked alike, because an unticked row with a producer is kept visible by
     * the panel and tells the same lie.
     *
     * WHAT MUST NOT MOVE: the RESERVED playout range is still filtered out of
     * `occupied` above, and that exclusion is a different rule with a different
     * and still-valid reason — a playout `html` graphic is indistinguishable from
     * ours on the wire, so surfacing it would invite the operator to clear the
     * company's live automation output. It is pinned by its own test rather than
     * left to this comment.
     */
    const { changed } = this.#orphanTracker.update(occupied, owned);
    if (changed) this.orphansChanged.emit(this.orphans());
  }

  // ── R-028 part B: the declared playout layers (the operator's tab) ──

  /**
   * The state of every DECLARED reserved layer, computed on demand ([] when
   * nothing is reserved).
   *
   * Occupancy is read through the SAME hearing predicate the fixed rows use —
   * a healthy primary AND a fresh OSC tap — so `unknown` means the same thing
   * on both surfaces. It is deliberately NOT collapsed to `empty`: a tab that
   * reads "nothing here" when it simply cannot see is the failure mode part A's
   * untick refusal and task 3.3's honest-unknown both exist to prevent, and
   * here it would also be the input to a CLEAR gate.
   *
   * The reserved set is channel-agnostic (a layer NUMBER is reserved), so the
   * rows are reported on the bridge's own channel — the one it drives.
   */
  playoutLayersState(): PlayoutLayerState[] {
    if (this.#reservedLayers.length === 0) return [];
    const session = this.#adapter.primarySession;
    const hearing =
      session.state === 'healthy' && session.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs);
    const producerByLayer = new Map<number, string>();
    if (hearing) {
      for (const o of session.osc.occupancy.occupied(this.#occupancyStaleMs)) {
        if (o.channel === DEFAULT_CHANNEL) producerByLayer.set(o.layer, o.producer);
      }
    }
    return [...this.#reservedLayers]
      .sort((a, b) => a - b)
      .map((layer) => {
        const producer = producerByLayer.get(layer);
        const observed: PlayoutLayerState['observed'] = !hearing
          ? { kind: 'unknown' }
          : producer !== undefined
            ? { kind: 'producer', producer }
            : { kind: 'empty' };
        return { channel: DEFAULT_CHANNEL, layer, observed };
      });
  }

  /** Publish the playout-layer state ONLY when it differs (the orphan-tracker precedent). */
  #publishPlayoutStateIfChanged(): void {
    if (this.#reservedLayers.length === 0) return;
    const state = this.playoutLayersState();
    const json = JSON.stringify(state);
    if (json === this.#lastPlayoutStateJson) return;
    this.#lastPlayoutStateJson = json;
    this.playoutStateChanged.emit(state);
  }

  /**
   * R-028 part B — the operator's DELIBERATE clear of one declared playout
   * layer, from the playout tab. Every refusal fails closed.
   *
   * This is a second, narrower door than `clearLayer`, never a loosening of
   * it: `clearLayer` still refuses reserved layers outright (part A), the
   * orphan sweep still excludes them, and no automatic path can reach here.
   * Only an operator who opened a tab labelled "not our layers" can.
   *
   * The gate, in order, and why each step fails closed:
   *
   *   NOT RESERVED  → refuse. This channel is for declared playout layers
   *     only; it must never become a general clear-anything door.
   *   NOT HEARING / NO FRESH OBSERVATION → refuse (`unknown-occupancy`).
   *     Silence is evidence of nothing (B-093). A kind gate that cannot read
   *     its input must refuse rather than guess — and guessing here means
   *     possibly clearing a live video feed.
   *   NOT `html`    → refuse (`not-html`), naming what was seen. The
   *     reservation says who owns the LAYER, not what is on it: a video,
   *     route or decklink can land on 60–69 by the playout operator's own
   *     mistake, and that is exactly the antenna/live-channel accident the
   *     reservation exists to prevent. "Not html" fails safe — video kinds are
   *     never enumerated.
   *
   * Ownership check ordering note: a reserved layer can never be in `#slots`
   * (allocation and reserve are both fenced off reserved layers), so there is
   * no owned-vs-reserved ambiguity to resolve here.
   */
  async playoutClear(
    channel: number,
    layer: number,
  ): Promise<{ ok: boolean; reason?: PlayoutClearReason; observedProducer?: string }> {
    if (!this.#reservedSet.has(layer)) return { ok: false, reason: 'not-reserved' };
    const session = this.#adapter.primarySession;
    const hearing =
      session.state === 'healthy' && session.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs);
    if (!hearing) return { ok: false, reason: 'unknown-occupancy' };
    const observed = session.osc.occupancy
      .occupied(this.#occupancyStaleMs)
      .find((o) => o.channel === channel && o.layer === layer);
    // Nothing observed on a HEARING tap means the layer is already EMPTY
    // (B-053: on a hearing tap, silence for a layer IS empty) — there is
    // nothing to clear, and reporting ok would claim an act we did not do.
    //
    // This is deliberately its OWN reason, not `unknown-occupancy`: the two are
    // opposite statements about our knowledge. "I can see it is empty" and "I
    // cannot see" must never share a message, or the operator is told the
    // bridge is blind when in fact it looked and found nothing.
    if (observed === undefined) return { ok: false, reason: 'already-empty' };
    if (observed.producer !== 'html') {
      return { ok: false, reason: 'not-html', observedProducer: observed.producer };
    }
    const slot: CommandSlot = { channel, layer };
    const { ok } = await this.#send(this.#builder.out(slot), this.#nextSeq(), 'urgent');
    // Deliberately NOT marked adopted: adoption is bookkeeping about layers we
    // OWN, and clearing a playout layer never makes it ours. The next sweep
    // re-reads the tap and the tab tells the truth either way.
    return ok ? { ok: true } : { ok: false, reason: 'amcp-error' };
  }

  /**
   * THE BANK-SCOPED LAYER CLEAR — the always-available escape hatch.
   *
   * The sentence this command asserts is a strong one: *"I may clear this layer
   * without knowing what is on it."* Two structural facts license it, both required,
   * and both derived from CONFIG so that no UI state, no stale bookkeeping and no
   * silent OSC port can bypass them:
   *
   *   1. the layer is inside the DECLARED bank, and
   *   2. the layer is NOT inside the reserved playout range.
   *
   * If both hold, the layer is ours and may be cleared whatever we currently believe
   * is on it. That indifference is the entire point — it is what makes this work when
   * occupancy reads `unknown`, and it is why the guard cannot depend on OSC.
   *
   * ORDER MATTERS AND IS DELIBERATE: reserved is checked FIRST. Boot already refuses a
   * bank that overlaps the reservation (`validateFixedBank` throws before the
   * WebSocket binds) and so does every live change, so the two sets cannot currently
   * intersect — but if they ever did, the reserved refusal must WIN rather than being
   * shadowed by a bank membership that happens to be true. Checking it first makes
   * that outcome hold by construction instead of by a proof about another module.
   *
   * The reserved set is channel-AGNOSTIC (a layer NUMBER is reserved) while bank
   * membership is channel-SPECIFIC. Both readings are kept exactly as they are
   * elsewhere: the channel-agnostic reservation is the more conservative of the two,
   * and this is not the place to narrow it.
   *
   * WHAT IT DELIBERATELY DOES **NOT** CONSULT: `#slots` (do we think we own it),
   * the item's status, the occupancy tap, OSC freshness, or the row's visibility
   * tick. Each of those is a thing that can be WRONG in the situation this exists
   * for, so making any of them a precondition would reintroduce the failure.
   *
   * It is NOT a loosening of {@link clearLayer} or {@link playoutClear}: both keep
   * every guard they have. This is a third, NARROWER door — it can only ever reach a
   * layer the operator's own bank declares.
   */
  async clearBankLayer(
    channel: number,
    layer: number,
  ): Promise<{
    ok: boolean;
    reason?: 'not-in-bank' | 'reserved' | 'amcp-error';
    message?: string;
  }> {
    // GUARD 0 — THE COORDINATE IS TWO INTEGERS, checked here rather than trusted.
    //
    // This is not defensive noise; it closes a real bypass in the guard below. Both
    // subsequent checks mis-answer on a non-number, and they mis-answer in OPPOSITE
    // directions, which is the dangerous combination:
    //
    //   - `#reservedSet` is a `Set<number>`, so `.has('55')` is FALSE — a string layer
    //     slips past the reservation entirely;
    //   - `isFixed` keys on `` `${String(channel)}:${String(layer)}` `` (see `keyOf`),
    //     so `{channel:'1', layer:'70'}` produces the SAME key as the real slot and
    //     MATCHES.
    //
    // Together those would mean a string-typed coordinate is treated as in-bank while
    // being invisible to the reservation. The WebSocket boundary does reject such a
    // payload today (`handleMessage` hands the handler `safeParse`d data, and
    // `z.number()` does not coerce) — but that is a guarantee in ANOTHER module, and
    // this method already has an in-process caller that skips it: `invokeRoute` in the
    // wire tests calls `route.handle(req)` directly. A safety guard must not depend on
    // every present and future caller having validated first, which is the same
    // reasoning that puts the reservation check ahead of the membership check.
    if (!Number.isInteger(channel) || !Number.isInteger(layer)) {
      return {
        ok: false,
        reason: 'not-in-bank',
        message:
          `${String(channel)}-${String(layer)} is not a valid layer coordinate — a bank ` +
          `layer is two integers, so this can be neither in the bank nor cleared`,
      };
    }
    // GUARD 2 FIRST — see the ordering note above. Absolute, and channel-agnostic.
    if (this.#reservedSet.has(layer)) {
      return {
        ok: false,
        reason: 'reserved',
        message:
          `layer ${String(layer)} is inside the reserved playout range — the company's ` +
          `playout system owns it, and clearing it would take playout output off air`,
      };
    }
    // GUARD 1 — membership in the DECLARED bank, read from the LayerManager's
    // config-derived fixed set. Channel-aware, and independent of visibility ticks:
    // `bankSlots` enumerates every declared layer whether its row is shown or not, so
    // unticking a row can never remove it from the guard's world.
    if (!this.#layers.isFixed({ channel, layer })) {
      return {
        ok: false,
        reason: 'not-in-bank',
        message:
          `${String(channel)}-${String(layer)} is not a layer of the declared operator ` +
          `bank — this clear is scoped to the bank and can address nothing else`,
      };
    }
    const slot: CommandSlot = { channel, layer };
    const { ok, onPrimary } = await this.#send(this.#builder.out(slot), this.#nextSeq(), 'urgent');
    // Adoption marking mirrors `clearLayer`: a CLEAR we executed on the current
    // primary is an adoption, so the bookkeeping stays consistent with the other two
    // clear paths. It is bookkeeping ONLY — it is never a precondition above.
    if (ok && onPrimary) this.#markAdoptedOnPrimary(slot);
    return ok ? { ok: true } : { ok: false, reason: 'amcp-error' };
  }

  /**
   * Explicit operator Clear of a surfaced (UNOWNED) layer: sends an urgent
   * `CLEAR <ch>-<layer>` through the adapter (mirror-sync fans it out so a
   * real pair clears everywhere). REFUSED for a layer the bridge owns —
   * clearing owned layers is Out/Remove's job (guards a UI race where the
   * operator clicks Clear just as a load claims the layer).
   *
   * R-015 — REFUSED (`foreign`) unless the current primary's occupancy tap
   * has a FRESH observation of this exact layer reporting an `html`
   * producer. This system only ever places HTML producers, so `html` is the
   * one kind that can plausibly be our own orphaned graphic (R-009's case);
   * a non-`html` kind — a video played by another system, a program feed,
   * or anything unrecognised ("not html" fails safe, video kinds are never
   * enumerated) — is PROVABLY not ours, and clearing it must be impossible
   * from ANY caller, not merely unoffered by the UI. No fresh observation
   * refuses too: silence is evidence of nothing (the B-093 lesson), so it
   * cannot license a CLEAR — which also covers the B-094 AMCP-alive/OSC-dead
   * install, where every layer would otherwise read clearable blind.
   *
   * Touches no slots and no OSC interest (it owns neither); a CLEAR executed
   * on the current primary counts as adoption (consistent with out/remove).
   * The warning resolves via the next sweep's observed empty — never
   * optimistically, and NEVER without this explicit operator request.
   */
  async clearLayer(
    channel: number,
    layer: number,
  ): Promise<{ ok: boolean; reason?: 'owned' | 'foreign' | 'reserved' | 'amcp-error' }> {
    // R-028 / C-015 — a DECLARED playout layer is never clearable, from any
    // caller. The R-015 `html` discriminator below cannot protect it: a
    // playout template graphic IS an html producer, and that
    // indistinguishability is exactly why the reservation exists in config.
    // Config is the identity here; clearing would take playout output off air.
    if (this.#reservedSet.has(layer)) {
      return { ok: false, reason: 'reserved' };
    }
    for (const slot of this.#slots.values()) {
      if (slot.channel === channel && slot.layer === layer) {
        return { ok: false, reason: 'owned' };
      }
    }
    const observed = this.#adapter.primarySession.osc.occupancy
      .occupied(this.#occupancyStaleMs)
      .find((o) => o.channel === channel && o.layer === layer);
    if (observed === undefined || observed.producer !== 'html') {
      return { ok: false, reason: 'foreign' };
    }
    const slot: CommandSlot = { channel, layer };
    const { ok, onPrimary } = await this.#send(this.#builder.out(slot), this.#nextSeq(), 'urgent');
    if (ok && onPrimary) this.#markAdoptedOnPrimary(slot);
    return ok ? { ok: true } : { ok: false, reason: 'amcp-error' };
  }

  /**
   * R-010 — Remove-All: OUT + REMOVE every stack item, clearing air and
   * emptying the list. Sequentially reuses the per-item `remove()` (urgent
   * CLEAR, interest removal, dealloc, adoption mark — B-039 CLEAR-destroys
   * semantics): layer-ordered, no command burst, and a per-item failure
   * doesn't abort the rest (`remove` drops the item regardless). The
   * sanctioned path to unblock a server reconfiguration.
   */
  async removeAll(): Promise<{ ok: boolean; removed: number }> {
    const items = this.#reconciler.snapshot();
    for (const item of items) {
      await this.remove(item.itemId);
    }
    return { ok: true, removed: items.length };
  }

  /**
   * Take every ON-AIR item off air, and KEEP them on the stack (they settle to idle).
   *
   * **BROADCAST SAFETY — this is per-LAYER, never per-channel.**
   *
   * It clears ONLY the layers this app itself allocated, and only each item's OWN layer:
   * `CLEAR <ch>-<layer>` per on-air item (`CLEAR 1-10`, `CLEAR 1-20`, …). It MUST NEVER emit
   * a channel-level `CLEAR <channel>` — that wipes the ENTIRE channel, including the
   * program/background signal this app does not manage and must never touch. Taking our
   * graphics off air must leave the program feed on air.
   *
   * The iteration is therefore over items that actually HOLD a slot. An item with no slot
   * holds no layer of ours, so there is nothing for us to clear and nothing is sent. (`out()`
   * refuses a slotless item anyway, but the safety property should be visible HERE, not
   * inherited from a guard three call-levels away.)
   *
   * NO new AMCP verb: it issues the SAME per-item `out()` the row's Clear button sends, on
   * the urgent (air-safety) lane, with the same B-039 CLEAR-destroys bookkeeping — so the
   * slot stays reserved and a later take re-ADDs. Sequential, like `removeAll`: no command
   * burst. A per-item failure does not abort the rest — a stuck item must not strand the
   * graphics behind it on air.
   *
   * The status predicate mirrors the row's Clear gating exactly (everything that is not
   * `idle` or `loaded`), so this IS "press Clear on every row where Clear is enabled".
   */
  async clearAll(): Promise<{ ok: boolean; cleared: number }> {
    const clearable = this.#reconciler
      .snapshot()
      .filter(
        (i) =>
          i.status !== 'idle' && i.status !== 'loaded' && this.#slots.get(i.itemId) !== undefined,
      );
    for (const item of clearable) {
      // → `CLEAR <ch>-<layer>` for THIS item's own slot. Never a channel-wide clear.
      await this.out(item.itemId);
    }
    return { ok: true, cleared: clearable.length };
  }

  /**
   * C-012 / R-028 — STOP every on-air item: each template runs its OWN outro and
   * its producer stays RESIDENT.
   *
   * The graceful sibling of `clearAll`, and the distinction is the whole point.
   * Clear-All hard-cuts everything off air; Stop-All asks each graphic to leave
   * the way it was authored to leave. On a real programme that is the difference
   * between a clean end-of-segment and every lower-third snapping to black at
   * once.
   *
   * Deliberately built exactly like `clearAll`: the SAME candidate predicate
   * (anything not idle/loaded that actually holds a slot — so nothing is sent
   * for an item that owns no layer), the SAME sequential loop through the
   * per-item verb rather than a burst, and the SAME "a failure does not abort
   * the rest" property — one stuck graphic must never strand the ones behind it
   * on air. Reusing `stopItem` means the C-012 semantics (`#loaded` and
   * `#adopted` untouched, so a later take RESUMES rather than re-ADDs) can never
   * drift between the single and bulk paths.
   */
  async stopAll(): Promise<{ ok: boolean; stopped: number }> {
    const stoppable = this.#reconciler
      .snapshot()
      .filter(
        (i) =>
          i.status !== 'idle' && i.status !== 'loaded' && this.#slots.get(i.itemId) !== undefined,
      );
    for (const item of stoppable) {
      await this.stopItem(item.itemId);
    }
    return { ok: true, stopped: stoppable.length };
  }

  async remove(itemId: string): Promise<{ accepted: boolean }> {
    const slot = this.#slots.get(itemId);
    // Drop it from the stack immediately (UI responsiveness), then best-effort
    // clear the slot on the server.
    this.#reconciler.applyIntent({ kind: 'remove', itemId }, this.#nextSeq());
    this.#loaded.delete(itemId);
    // R-011 — the override dies with the ITEM (a re-used itemId starts clean).
    this.#positions.delete(itemId);
    // B-092 — a restore awaiting its occupancy decision dies with the item too:
    // the operator removed it, so there is nothing left to adopt or re-ADD (the
    // urgent CLEAR below is the removal's own, and it is unconditional).
    this.#pendingRestore.delete(itemId);
    if (slot !== undefined) {
      this.#slots.delete(itemId);
      this.#removeInterest(slot);
      // R-021 stage 3 — fixed-aware: `deallocate` no-ops on a fixed slot, so a
      // removed item would otherwise leave its binding published forever.
      this.#releaseSlot(slot);
      // B-056 — the layer is deallocated: resolve its warning REGARDLESS of
      // the CLEAR below landing. The layer is unowned from here — whatever
      // survives on the primary is the R-009 sweep's to surface (as a
      // regular, clearable orphan) once the primary is observable again.
      this.#resolveOwnedOccupancy(slot);
      const { ok, onPrimary } = await this.#send(
        this.#builder.out(slot),
        this.#nextSeq(),
        'urgent',
      );
      // A CLEAR executed on the CURRENT PRIMARY counts as adoption (see out()).
      if (ok && onPrimary) this.#markAdoptedOnPrimary(slot);
    }
    return { accepted: true };
  }

  // ── connections ─────────────────────────────────────────────────────
  config(): ConnectionConfig {
    return this.#config;
  }

  /**
   * R-010 — apply a new `ConnectionConfig` to the RUNNING bridge: tear down
   * the declared sessions/adapter, rebuild from `next`, and reconnect —
   * without restarting the WS bridge or dropping clients. Ordered so
   * everything fallible happens as late as possible; failure semantics are
   * LAND-ON-NEW-CONFIG (see the R-010 design): an unreachable host is NOT an
   * error (sessions retry with backoff; health honestly reports
   * disconnected), and the only `apply-failed` case is the template server
   * failing to bind even after a loopback retry — sessions still run on the
   * new config, a defined non-crashing degraded state.
   *
   * SECURITY invariant: this method touches ONLY the CasparCG-facing data
   * plane (AMCP sessions out, template HTTP out, OSC UDP in). The control
   * WebSocket's loopback bind lives in `createBridge` and is unreachable
   * from here by construction — no ConnectionConfig, remote or not, can
   * expose it.
   */
  async setConfig(next: ConnectionConfig): Promise<SetConfigResult> {
    // 0. SERIALIZE (fix-setconfig-serve-restart) — two applies interleaving
    //    was the regression's root cause: the second read the mid-teardown
    //    `listening=false`, skipped the serve restart, and could leave the
    //    adapter holding already-stopped sessions. At most one apply runs;
    //    a concurrent request is refused loudly with nothing changed.
    if (this.#applyInFlight) {
      return {
        ok: false,
        reason: 'apply-in-progress',
        message: 'Another apply is still in progress — wait for it and retry.',
      };
    }
    this.#applyInFlight = true;
    try {
      return await this.#applyConfig(next);
    } finally {
      this.#applyInFlight = false;
    }
  }

  async #applyConfig(next: ConnectionConfig): Promise<SetConfigResult> {
    // 1. On-air gate — bridge-authoritative (the UI mirrors it; races lose here).
    const unsettled = this.#onAirCount();
    if (unsettled > 0) {
      return {
        ok: false,
        reason: 'on-air-block',
        message:
          `${String(unsettled)} item(s) are on air or unsettled — ` +
          `Remove All (or Out each item) first.`,
      };
    }

    // 2. Construct the new sessions first (pure — nothing torn down yet;
    //    connecting happens at start()).
    const sessions = this.#buildSessions(next);

    // 3. Teardown: old sessions (rejects their queued commands — safe,
    //    nothing is on air), the old adapter (its listeners die with the old
    //    objects), and the template server (bounded: held CEF sockets are
    //    force-destroyed in stop()).
    await Promise.all([this.#sessions.A.stop(), this.#sessions.B?.stop() ?? Promise.resolve()]);
    await this.#templateServer.stop();

    // 4. Rebuild + rewire. The Reconciler, template registry, and #slots
    //    survive (stack rows and imported templates are not
    //    connection-scoped). #loaded/#adopted do NOT: both are per-server
    //    knowledge — a producer/adoption on the OLD server says nothing
    //    about the new one — so a later Take heals via adopt-CLEAR + re-ADD
    //    (B-039 / reconnect-reconciliation semantics). OSC interest is
    //    re-registered for every retained slot on the NEW sessions.
    this.#config = next;
    this.#sessions = sessions;
    this.#adapter = new RedundancyAdapter({
      strategy: next.strategy,
      sessions,
      initialPrimary: 'A',
      autoFailoverEnabled: next.autoFailoverEnabled,
    });
    this.#wireAdapter();
    for (const slot of this.#slots.values()) this.#addInterest(slot);
    this.#loaded.clear();
    this.#adopted.clear();
    // The last failover described the old server pair — a new era starts clean.
    this.#lastFailover = undefined;
    // R-009 — surfaced orphans described the OLD server too; the new
    // sessions' taps re-accumulate and the sweep re-surfaces what's real.
    if (this.#orphanTracker.reset().changed) this.orphansChanged.emit([]);
    // C-014 — the allocation quarantine described the OLD server's occupancy;
    // release it wholesale and let the new taps re-quarantine what's real.
    for (const slot of this.#layers.quarantined()) this.#layers.deallocate(slot);
    // B-056 — owned-slot warnings described the OLD primary; drop wholesale.
    if (this.#ownedOccupancy.size > 0) {
      this.#ownedOccupancy.clear();
      this.ownedOccupancyChanged.emit([]);
    }

    // 5. Template serve — re-derive from the new primary's locality; the only
    //    realistically fallible step (bind conflict). Retry ONCE on safe
    //    loopback-ephemeral options; if that also fails, land on the new
    //    config with serving down (loads fail loudly via the serve guards).
    //    fix-setconfig-serve-restart: gate on the PROCESS-LEVEL intent
    //    (#servingDesired, set once by startServing()) — never on the
    //    transient `listening`, which reads false during any in-flight
    //    teardown and previously let a concurrent apply skip this step.
    this.#serveOptions = deriveServeOptions(next.servers.A.host, this.#serveOverride);
    let serveError: string | null = null;
    if (this.#servingDesired) {
      try {
        await this.#templateServer.start(this.#serveOptions);
      } catch {
        this.#serveOptions = { bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' };
        try {
          await this.#templateServer.start(this.#serveOptions);
        } catch (retryErr) {
          serveError = retryErr instanceof Error ? retryErr.message : String(retryErr);
        }
      }
      // Belt-and-braces: whatever the path above did, an apply may never
      // conclude ok with serving desired but down.
      if (serveError === null && !this.#templateServer.listening) {
        serveError = 'template server is not listening after restart';
      }
    }

    // 6. Connect + surface: every client sees the new config and fresh health.
    this.#sessions.A.start();
    this.#sessions.B?.start();
    this.#audit.unshift({
      ts: new Date().toISOString(),
      actor: 'operator',
      action: 'reconnect',
      server: 'primary',
      outcome: serveError === null ? 'ok' : 'failed',
    });
    this.configChanged.emit(next);
    this.healthChanged.emit(this.health());

    if (serveError !== null) {
      return {
        ok: false,
        reason: 'apply-failed',
        message: `connected, but the template server failed to bind: ${serveError}`,
      };
    }
    const serve = this.templateServe;
    const exposed =
      serve !== null && serve.bindHost !== '127.0.0.1' && serve.bindHost !== 'localhost';
    if (exposed && serve !== null) {
      process.stderr.write(
        `[caspar-bridge] ⚠ template HTTP server LAN-EXPOSED on ` +
          `${serve.bindHost}:${String(serve.port)} — CG ADD URL host is ${serve.serveHost}. ` +
          `Control WebSocket remains loopback-bound.\n`,
      );
    }
    return {
      ok: true,
      ...(serve !== null
        ? { templateServe: { serveHost: serve.serveHost, port: serve.port, exposed } }
        : {}),
    };
  }

  /**
   * R-010 — the on-air gate: anything visibly on air OR unsettled blocks a
   * server switch. Stricter than the updateRequest precedent on purpose:
   * `updating`/`exiting` ride an on-air producer, and B-044's `unconfirmed`
   * means the on-air result is UNKNOWN — unknown must block. `idle`/`loaded`/
   * `error`/`disconnected` rest states don't.
   */
  #onAirCount(): number {
    return this.#reconciler.snapshot().filter((i) => isOnAirStatus(i.status, i.pending)).length;
  }

  health(): ConnectionHealth {
    // `primary`/`backup` reflect the current ROLES (after failover, `primary`
    // is the live server). ServerSessionState and ServerHealth.state share the
    // same vocabulary. `backup` is absent under a single-server config.
    const cur = this.#adapter.currentPrimary;
    const other: ServerLabel = cur === 'A' ? 'B' : 'A';
    const snapshot = (label: ServerLabel, session: ServerSession): ConnectionHealth['primary'] => {
      const state = session.state;
      // B-094 — publish WHEN we last heard OSC from this server, so the operator
      // surface can tell "answering AMCP but silent on OSC" apart from "down".
      // The two look identical on the AMCP axis (`amcpAxisOk`) yet call for
      // opposite remedies: one is a CasparCG config fix, the other is a dead
      // server. Absent means never heard from in this session.
      //
      // The SAME signal B-093's restore guard reads — source-filtered to this
      // declared server, so another box's OSC cannot make this look healthy.
      // Deliberately not a second, divergent source of truth.
      const heardAt = session.osc.occupancy.lastOscTrafficAt;
      return {
        label,
        state,
        amcpAxisOk: state === 'healthy',
        ...(heardAt !== null ? { oscFreshAt: new Date(heardAt).toISOString() } : {}),
      };
    };
    const primarySession = this.#sessions[cur];
    const backupSession = this.#sessions[other];
    return {
      // The current primary is always a declared session (failover refuses
      // to swap onto an undeclared backup); fall back to A defensively.
      primary: snapshot(cur, primarySession ?? this.#sessions.A),
      ...(backupSession !== undefined ? { backup: snapshot(other, backupSession) } : {}),
      currentPrimary: cur,
      strategy: this.#config.strategy,
      ...(this.#lastFailover !== undefined ? { lastFailover: this.#lastFailover } : {}),
    };
  }

  /**
   * Manual operator failover (the `connections.failover` channel). Real
   * switch; refused (`ok: false`) when no backup is declared (B-046).
   */
  async failover(): Promise<{ ok: boolean; newPrimary: ServerLabel }> {
    const ok = await this.#adapter.failover('manual');
    return { ok, newPrimary: this.#adapter.currentPrimary };
  }

  // ── lock / templates / audit / settings / update (in-memory stubs) ──
  lockState(): LockState {
    return this.#lock;
  }
  engage(pin: string): { ok: boolean } {
    this.#lockPin = pin;
    this.#lock = { engaged: true, reason: 'operator', engagedAt: new Date().toISOString() };
    this.lockChanged.emit(this.#lock);
    return { ok: true };
  }
  release(pin: string): { ok: boolean; reason?: 'pin-mismatch' | 'not-engaged' } {
    if (!this.#lock.engaged) return { ok: false, reason: 'not-engaged' };
    if (this.#lockPin !== pin) return { ok: false, reason: 'pin-mismatch' };
    this.#lock = { engaged: false };
    this.#lockPin = null;
    this.lockChanged.emit(this.#lock);
    return { ok: true };
  }

  templateGet(templateId: string): TemplateInfo | null {
    return this.#templates.get(templateId);
  }
  templateList(): TemplateInfo[] {
    return this.#templates.list();
  }
  /**
   * B-038 Phase 2 — register a template AND retain its browser-produced
   * self-contained HTML, keyed by id. Re-import replaces both. The HTML is held,
   * not served yet (Phase 3 serves it over HTTP; Phase 4 `CG ADD`s its URL).
   */
  /**
   * R-028 part B — the reconciliation policy, enforced here because this is
   * where a removal actually happens.
   *
   * An operator's import (no `redelivery` flag) always wins and clears the
   * tombstone. A reconnect RE-DELIVERY is ignored when the id is either:
   *
   *   - deliberately REMOVED — otherwise any browser still holding a local copy
   *     resurrects it on its next reconnect, and a page reload is enough. The
   *     removal was an operator decision on the catalogue of record; a stale
   *     browser must not undo it;
   *   - ALREADY HELD — the bridge's copy is the catalogue of record and may be
   *     newer than the re-delivering browser's, so an older local copy must not
   *     overwrite it.
   *
   * Both cases answer `registered: true` (the template IS available, which is
   * all the caller needs) with `skipped: true` for honesty.
   */
  templateImport(
    template: TemplateInfo,
    html: string,
    redelivery = false,
  ): { registered: boolean; templateId: string; skipped?: boolean } {
    if (redelivery) {
      if (this.#removedTemplateIds.has(template.templateId)) {
        return { registered: false, templateId: template.templateId, skipped: true };
      }
      // NOTE — an id the bridge ALREADY holds is deliberately NOT skipped.
      //
      // An earlier draft kept the bridge's copy ("the catalogue of record is
      // newer"), which quietly REVERSED B-085's documented local-wins policy:
      // a browser that fixed a template while offline would reconnect, be
      // ignored, and the STALE html would keep going to air with no signal
      // that the correction never landed. Nothing here can tell which copy is
      // newer — `TemplateInfo` carries no version — so the safe direction is
      // the documented one, and the tombstone above is the narrower fix that
      // part A actually asked for (stop RESURRECTION, not stop repair).
    } else {
      // An operator re-importing a previously removed template revives it.
      this.#removedTemplateIds.delete(template.templateId);
    }
    const result = this.#templates.import(template, html);
    // R-028 (o1) — every browser converges on the same catalogue.
    this.templatesChanged.emit(this.#templates.list());
    // A re-import can change the template's display name — the rows naming it
    // must follow (published through the same change-compare as always).
    this.#publishFixedStateIfChanged();
    return result;
  }
  /** The retained HTML for a template id, or `null` (the Phase 3 serve seam). */
  templateHtml(templateId: string): string | null {
    return this.#templates.html(templateId);
  }

  /**
   * R-005 — remove a template from the library. Refused while ANY stack item references it.
   *
   * The predicate is deliberately "any reference", not "any ON-AIR reference" (the R-010
   * gate's shape). Removal never takes a graphic off air — CasparCG already pulled the
   * self-contained HTML into CEF — so the damage is invisible at the click and deferred:
   * `load()` and `take()`'s B-039 re-ADD both guard on `#templates.has(...)` and would
   * refuse with `unknown-template` forever, and `setPosition`'s re-ADD would silently stop
   * re-ADDing. An `idle`/`loaded` row is poisoned exactly as badly as an on-air one, so
   * both block. Removing the referencing items (stack.remove / Remove-All) is the unblock
   * path — the same one R-010 points at.
   */
  templateRemove(templateId: string): {
    ok: boolean;
    reason?: 'in-use' | 'unknown-template';
    message?: string;
  } {
    if (!this.#templates.has(templateId)) {
      return {
        ok: false,
        reason: 'unknown-template',
        message: `Template “${templateId}” is not registered.`,
      };
    }

    const referencing = this.#reconciler
      .snapshot()
      .filter((i) => i.templateId === templateId).length;
    if (referencing > 0) {
      return {
        ok: false,
        reason: 'in-use',
        message: `${String(referencing)} stack item(s) still use this template — remove them (or Remove All) first.`,
      };
    }

    this.#templates.remove(templateId);
    // R-028 part B — remember the removal, so a browser that still holds a
    // local copy cannot resurrect it by reconnecting (see `templateImport`).
    this.#removedTemplateIds.add(templateId);
    // R-028 (o1) — every browser converges on the same catalogue.
    this.templatesChanged.emit(this.#templates.list());
    return { ok: true };
  }

  auditRecent(limit = 200, action?: AuditEntry['action'], actor?: string): AuditEntry[] {
    let rows = this.#audit;
    if (action !== undefined) rows = rows.filter((r) => r.action === action);
    if (actor !== undefined) rows = rows.filter((r) => r.actor === actor);
    return rows.slice(0, limit);
  }

  /** R-034 — the station's split delimiters (disk-persisted, shared by every browser). */
  delimitersList(): DelimiterOption[] {
    return this.#delimiters.list();
  }

  /**
   * Replace the delimiter list. The STORE decides whether the list is allowed
   * and supplies the operator-facing reason — the R-005 removal shape — so the
   * refusal cannot differ between the two browsers that might attempt it.
   */
  delimitersSet(delimiters: readonly DelimiterOption[]): {
    ok: boolean;
    reason?: 'empty-list' | 'duplicate-value';
    message?: string;
  } {
    const refusal = this.#delimiters.set(delimiters);
    if (refusal !== null) return { ok: false, reason: refusal.reason, message: refusal.message };
    // Every connected browser converges, the `templates.changed` precedent.
    this.delimitersChanged.emit(this.#delimiters.list());
    return { ok: true };
  }

  /**
   * R-030 — the channels this install DECLARES.
   *
   * The fixed bank is the only channel authority the install has (the SPA's
   * `ChannelScope` reads the same fact), and channel 1 is the documented default
   * when no bank is declared — `FixedLayerBankSchema`'s own default, not a second
   * guess invented here. When the channel list eventually arrives from an API,
   * THIS is the one function that changes.
   */
  #declaredChannels(): number[] {
    return [this.#fixedBank?.channel ?? DEFAULT_CHANNEL];
  }

  /** R-030 — the configured raster(s) plus what `INFO <channel>` reported. */
  channelSettingsState(): ChannelSettingsState {
    return this.#channelSettings.state();
  }

  /**
   * R-030 — apply a channel's settings.
   *
   * The ON-AIR gate is HERE rather than in the store, because it needs the
   * reconciler's view of what is live and the store has no business holding
   * one. It reuses `#onAirCount` — the SAME predicate R-010's `setConfig` uses,
   * never a second local copy of "what counts as on air" — and it is not
   * politeness: changing the raster re-scales EVERY graphic on the channel, so
   * applying it under a live graphic would move what is on air, mid-shot. Fail
   * closed, so `unconfirmed`/`pending` count as on air.
   */
  setChannelSettings(settings: ChannelSettings): {
    ok: boolean;
    reason?: ChannelSettingsSetReason;
    message?: string;
  } {
    const unsettled = this.#onAirCount();
    if (unsettled > 0) {
      return {
        ok: false,
        reason: 'on-air-block',
        message:
          `${String(unsettled)} item(s) are on air or unsettled — changing the channel raster ` +
          `re-scales every graphic on the channel, so it cannot be applied while anything is live. ` +
          `Take them off air first.`,
      };
    }
    const refusal = this.#channelSettings.set(settings);
    if (refusal !== null) return { ok: false, reason: refusal.reason, message: refusal.message };
    this.#announceChannelSettings(settings.channel);
    return { ok: true };
  }

  /**
   * R-030 — publish the channel-settings state, and shout on stderr when a
   * channel's raster BECOMES a mismatch.
   *
   * This is one function called from BOTH sides on purpose. The verdict is a
   * function of config AND the server's reading, so either can create a
   * mismatch: a new `INFO` reading can contradict settled config, and a config
   * change can contradict a settled reading. Warning from only the reading path
   * — which is what the first cut of this did — meant an operator who typed the
   * wrong raster got silence, which is precisely the case they most need told
   * about, because they have just formed a false belief about where graphics land.
   *
   * The warning fires on the TRANSITION, not on every publish: a mismatch that
   * has already been announced is not re-announced until it clears, so a settled
   * fault cannot bury the next one in repeats.
   */
  #announceChannelSettings(channel: number): void {
    const warning = this.#channelSettings.mismatchWarning(channel);
    if (warning !== null) {
      if (this.#mismatchWarned.get(channel) !== true) {
        this.#mismatchWarned.set(channel, true);
        process.stderr.write(warning);
      }
    } else {
      this.#mismatchWarned.set(channel, false);
    }
    this.channelSettingsChanged.emit(this.#channelSettings.state());
  }

  /**
   * R-030 — read the channel's REAL video mode off the server and compare it
   * with what config claims.
   *
   * The configured raster is a CLAIM; `INFO <channel>` is the fact. When they
   * disagree every graphic on the channel is mis-placed, and silently, because
   * nothing else in the system would notice — so the disagreement is shouted on
   * stderr and pushed to every browser rather than logged at debug.
   *
   * Sends through the adapter directly, NOT through `#send`: that path settles a
   * reconciler intent by `seq`, and this query has no intent to settle. It rides
   * `low` priority so a diagnostic read can never delay an operator's take (the
   * `CommandQueue` header's own classification of non-heartbeat `INFO`).
   *
   * Failure is SILENT here on purpose — a timeout or a 404 leaves `observed`
   * absent, which `rasterVerdict` reports as `unreadable`, i.e. "the check could
   * not be performed". Writing a scary line for an unreachable server would
   * duplicate what connection health already says, and inventing an entry would
   * turn a missing measurement into evidence.
   */
  async #readChannelMode(channel: number): Promise<void> {
    try {
      // `target: 'primary'` — the geometry that matters is the channel currently
      // ON AIR, and under a mirror strategy the default `'both'` fans out and can
      // return the BACKUP's reply as the winner. That would attribute B's video
      // mode to the live channel, which is the wrong machine's answer to the
      // question actually being asked.
      const result = await this.#adapter.send(`INFO ${String(channel)}`, {
        priority: 'low',
        target: 'primary',
      });
      const response = result.response;
      if (response.kind !== 'ok-multi') return;
      const mode = parseVideoModeFromInfo(response.lines.join('\n'));
      if (mode === null) return;
      // Attributed to the server that actually ANSWERED, never to whoever was
      // primary when the send started: a failover mid-flight would otherwise
      // record the reading under the wrong label and suppress the re-read that
      // the new primary needs.
      this.#modeReadFrom.set(channel, result.winner);
      const changed = this.#channelSettings.observe({
        channel,
        mode,
        raster: videoModeRaster(mode) ?? null,
      });
      if (!changed) return;
      this.#announceChannelSettings(channel);
    } catch {
      // See above: an unreadable mode stays absent, never guessed.
    }
  }

  settingsGet(): Settings {
    return this.#settings;
  }
  settingsSet(patch: Partial<Settings>): Settings {
    this.#settings = { ...this.#settings, ...patch };
    this.settingsChanged.emit(this.#settings);
    return this.#settings;
  }

  updateRequest(
    version: string,
    notes?: string,
  ): { accepted: true; deferred: boolean; pending: PendingUpdate } {
    // B-053 parity — count acked 'playing' as on air (matches MockRuntime):
    // post-fix 'on-air' exists only while OSC truth is fresh on a TAKEN item,
    // and a playing item whose truth decayed must still defer the update.
    const onAir = this.#reconciler
      .snapshot()
      .some((i) => i.status === 'on-air' || i.status === 'playing');
    const pending: PendingUpdate = {
      version,
      requestedAt: new Date().toISOString(),
      ...(notes !== undefined ? { notes } : {}),
    };
    this.#pendingUpdate = pending;
    this.updateChanged.emit(pending);
    return { accepted: true, deferred: onAir, pending };
  }
  updateState(): PendingUpdate | null {
    return this.#pendingUpdate;
  }
  updateCancel(): { ok: boolean } {
    this.#pendingUpdate = null;
    this.updateChanged.emit(null);
    return { ok: true };
  }

  // ── internals ───────────────────────────────────────────────────────
  #nextSeq(): number {
    return ++this.#seq;
  }

  /**
   * R-021 stage 3 — release the slot an item held, whichever KIND of slot it is.
   *
   * `deallocate()` deliberately NO-OPS on a fixed slot (the fence must survive
   * for the life of the process), so on its own it would leave a removed item's
   * binding recorded forever: the row would keep naming an item that is no
   * longer on the stack, and the slot could never be re-bound (`slot-bound`).
   * `unbindFixed()` is the fixed counterpart — it drops the binding and KEEPS
   * the fence. One helper so every release site gets both cases right; a second
   * local copy of this branch is how the two would drift (B-100/P-012).
   */
  #releaseSlot(slot: CommandSlot): void {
    if (this.#layers.isFixed(slot)) {
      this.#layers.unbindFixed(slot);
      // The binding is published state — the row must stop naming the item.
      this.#publishFixedStateIfChanged();
      return;
    }
    this.#layers.deallocate(slot);
  }

  /** Allocate a slot, falling back to the `custom` range for unknown types. */
  #allocate(templateId: string): CommandSlot {
    // C-014 — point-in-time freshness: the sweep's cadence alone would leave a
    // window where a just-arrived foreign producer gets allocated over. Same
    // sample, same predicate, run synchronously before the scan.
    this.#reconcileForeignQuarantine();
    try {
      return this.#layers.allocate(templateId, DEFAULT_CHANNEL);
    } catch (err) {
      // Unknown template type → fall back to the `custom` range. An exhausted
      // range (OutOfLayersError) propagates to the caller as a failed load.
      if (err instanceof UnknownTemplateTypeError) {
        return this.#layers.allocate('custom', DEFAULT_CHANNEL);
      }
      throw err;
    }
  }

  /**
   * Reconnect-reconciliation — the first `CG ADD` per layer per process is
   * preceded by a `CLEAR` of that layer ("adoption"): deterministic allocation
   * makes a collision with a dead session's orphan near-certain, and real
   * CasparCG's `CG ADD` would destroy that producer anyway (stage replace) —
   * the explicit CLEAR just does it BEFORE the fresh item binds its slot/OSC
   * interest, versions/producer-types independent and mock-testable. Rides a
   * non-intent seq so the item's status is settled only by its own ADD. A
   * failed CLEAR (e.g. server down) leaves the layer unadopted — the next
   * load retries; the ADD's own failure settles the intent honestly.
   *
   * B-056 — returns the primary-landing result it already computes
   * (`adopted`: the layer is in `#adopted` after the call), so `load()` can
   * warn when the CLEAR missed the primary. Return value only — the CLEAR,
   * the `ok && onPrimary` gate, and the backup-only-stays-unadopted rule are
   * behaviorally unchanged.
   */
  async #adoptLayer(slot: CommandSlot, reachable: boolean): Promise<{ adopted: boolean }> {
    const key = adoptionKey(slot);
    if (this.#adopted.has(key)) return { adopted: true };
    // B-100 — never issue the adopt-CLEAR when no server is reachable. With a live
    // AMCP link the CLEAR lands, and load()'s pre-roll ADD reads this SAME `reachable`,
    // so a landed CLEAR is always paired with an attempted ADD — never black-then-nothing.
    // With nothing reachable the CLEAR could not land anyway; skipping it keeps the
    // pairing structural rather than relying on the transport to fail.
    if (!reachable) return { adopted: this.#adopted.has(key) };
    const { ok, onPrimary } = await this.#send(this.#builder.out(slot), this.#nextSeq(), 'normal');
    // A backup-only success (mirror-sync with the primary momentarily down)
    // did NOT clear the primary's layer — leave it unadopted so a later load
    // retries the CLEAR where the orphan actually lives.
    if (ok && onPrimary) this.#markAdoptedOnPrimary(slot);
    return { adopted: this.#adopted.has(key) };
  }

  /**
   * B-056 — a CLEAR for this layer executed on the CURRENT PRIMARY: mark it
   * adopted (reconnect-reconciliation bookkeeping, unchanged) AND resolve any
   * owned-slot occupancy warning — the primary's layer state is now provably
   * clean. Shared by every adoption-marking site (adopt / out / remove /
   * operator clearLayer) so "adopted" and "provably cleared" can never drift.
   */
  #markAdoptedOnPrimary(slot: CommandSlot): void {
    this.#adopted.add(adoptionKey(slot));
    this.#resolveOwnedOccupancy(slot);
  }

  /**
   * B-056 — load-time, one-shot detection (deliberately NOT a sweep: only
   * between a failed/backup-only adopt and our own ADD is a producer report
   * on this layer provably FOREIGN). Warns only on occupancy OBSERVED fresh
   * on the current primary's passive tap — the same freshness contract as
   * the R-009 sweep (an aged-out entry is the empty signal, B-053).
   */
  #detectOwnedOccupancy(slot: CommandSlot, itemId: string): void {
    const occupied = this.#adapter.primarySession.osc.occupancy.occupied(this.#occupancyStaleMs);
    const hit = occupied.find((o) => o.channel === slot.channel && o.layer === slot.layer);
    if (hit === undefined) return;
    this.#ownedOccupancy.set(adoptionKey(slot), {
      channel: slot.channel,
      layer: slot.layer,
      itemId,
      producer: hit.producer,
      since: new Date().toISOString(),
    });
    this.ownedOccupancyChanged.emit(this.ownedOccupancy());
  }

  /** B-056 — drop a layer's warning (provable resolution only); publish on change. */
  #resolveOwnedOccupancy(slot: CommandSlot): void {
    if (this.#ownedOccupancy.delete(adoptionKey(slot))) {
      this.ownedOccupancyChanged.emit(this.ownedOccupancy());
    }
  }

  /**
   * C-014 — reconcile the LayerManager's QUARANTINE set against the current
   * primary's fresh non-`html` occupancy, so allocation can never land on —
   * and adopt-CLEAR — another system's output.
   *
   * The discriminator is R-015's, verbatim: this system only places `html`
   * producers, so a fresh non-`html` observation (video, or anything
   * unrecognised — "not html" fails safe) is provably foreign. A layer with NO
   * fresh observation stays allocatable: allocation fails OPEN on silence,
   * deliberately opposite to `clearLayer`'s refusal — a blind (B-094) install
   * must still be able to play out, and on a hearing tap silence genuinely
   * means empty (B-053, aged-out entries ARE the empty signal).
   *
   * Runs at every sweep tick AND at allocation time (the sweep's cadence alone
   * would leave a TOCTOU window). Frozen while the primary is not healthy —
   * the same absence-of-knowledge discipline as the R-009 warnings — and
   * dropped wholesale on setConfig (old-server knowledge). Owned (#slots) and
   * pinned slots are never quarantined: a foreign producer under an OWNED
   * layer is B-056's warning, not an allocation concern.
   *
   * Release goes through `deallocate()`, not `observe('empty')`: observe()'s
   * explicit-empty release contract predates B-053 (real CasparCG goes SILENT
   * for a cleared layer), so the bridge reconciles from aged-out occupancy
   * instead of feeding it synthetic empties.
   */
  #reconcileForeignQuarantine(): void {
    const session = this.#adapter.primarySession;
    if (session.state !== 'healthy') return;

    const foreign = new Map<string, { slot: CommandSlot; producer: string }>();
    for (const occ of session.osc.occupancy.occupied(this.#occupancyStaleMs)) {
      if (occ.producer === 'html') continue;
      foreign.set(adoptionKey(occ), {
        slot: { channel: occ.channel, layer: occ.layer },
        producer: occ.producer,
      });
    }

    const quarantinedNow = new Set(this.#layers.quarantined().map((s) => adoptionKey(s)));

    for (const [key, { slot, producer }] of foreign) {
      if (quarantinedNow.has(key)) continue;
      // Allocated (ours or pinned) — not quarantine's to touch; B-056 owns it.
      if (this.#layers.isAllocated(slot)) continue;
      this.#layers.quarantine(slot);
      // The one line whoever wonders why a layer is being skipped will grep for.
      process.stderr.write(
        `[caspar-bridge] layer ${String(slot.channel)}-${String(slot.layer)} quarantined from ` +
          `allocation: a foreign producer (${producer}) is on it. It will not be allocated or ` +
          `cleared; it returns to the pool when the producer leaves.
`,
      );
    }

    for (const key of quarantinedNow) {
      if (foreign.has(key)) continue;
      const sep = key.indexOf(':');
      this.#layers.deallocate({
        channel: Number(key.slice(0, sep)),
        layer: Number(key.slice(sep + 1)),
      });
    }
  }

  #addInterest(slot: CommandSlot): void {
    this.#sessions.A.osc.interest.add(slot.channel, slot.layer);
    this.#sessions.B?.osc.interest.add(slot.channel, slot.layer);
  }

  #removeInterest(slot: CommandSlot): void {
    this.#sessions.A.osc.interest.remove(slot.channel, slot.layer);
    this.#sessions.B?.osc.interest.remove(slot.channel, slot.layer);
  }

  /**
   * B-044 — arm the bounded-completion timer for a transient intent
   * (update/out). Cleared when the ack lands (`#send`); on fire the Reconciler
   * expires the intent to the explicit `unconfirmed` state (a no-op if a newer
   * intent superseded it or the ack already settled it).
   */
  #armExpiry(seq: number): void {
    const timer = setTimeout(() => {
      this.#expiryTimers.delete(seq);
      this.#reconciler.expireIntent(seq);
    }, this.#intentTimeoutMs);
    timer.unref?.();
    this.#expiryTimers.set(seq, timer);
  }

  #clearExpiry(seq: number): void {
    const timer = this.#expiryTimers.get(seq);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#expiryTimers.delete(seq);
    }
  }

  /**
   * Send an AMCP line through the `RedundancyAdapter` (strategy-aware fan-out to
   * primary/backup; drives the auto-failover triggers), await the ack, and feed
   * it to the Reconciler. `onPrimary` reports whether the server that is NOW the
   * current primary executed the command — in mirror-sync a backup-only success
   * still acks `ok`, but the primary's layer state was NOT touched (the
   * adoption bookkeeping must not trust it).
   */
  async #send(
    line: string,
    seq: number,
    priority: 'urgent' | 'normal',
  ): Promise<{ ok: boolean; onPrimary: boolean; errorCode?: string }> {
    try {
      const result = await this.#adapter.send(line, { priority });
      // A response ARRIVED, so the B-044 bounded timeout no longer applies —
      // and the ack below settles the intent either way (B-070: a failed ack
      // settles too), so no expiry is needed to rescue it.
      this.#clearExpiry(seq);
      const ok = result.response.kind !== 'err';
      // B-070 — surface the REAL AMCP code so a refusal can explain itself
      // (`stack.update` used to answer a bare `{ accepted: false }`, which the
      // Inspector could only render as the generic "Not accepted.").
      const errorCode = ok ? undefined : `amcp-${String(result.response.code)}`;
      this.#reconciler.applyAck(seq, ok, errorCode);
      return {
        ok,
        onPrimary: result.winner === this.#adapter.currentPrimary,
        ...(errorCode !== undefined && { errorCode }),
      };
    } catch {
      this.#clearExpiry(seq);
      this.#reconciler.applyAck(seq, false, 'amcp-send-failed');
      return { ok: false, onPrimary: false, errorCode: 'amcp-send-failed' };
    }
  }

  /**
   * B-039 — issue `CG ADD` (play-on-load OFF) for an item's slot and, on success,
   * record that a live producer now exists (`#loaded`). Shared by `load` and the
   * `take` re-ADD path. Uses the SERVED `/template/<id>` URL when the HTTP server is
   * up (B-038 Phase 3), else the bare id (isolated unit tests).
   */
  /*
    §8 — IT RETURNS THE REASON, NOT JUST A BOOLEAN, AND THAT IS THE POINT.

    It used to answer `boolean`, so both of its failures — the bridge's own
    template server being down (`template-serve-down`) and whatever `#send`
    reported (an AMCP refusal code, or `amcp-send-failed` when the command never
    left) — arrived at the caller as `false` and were re-labelled `amcp-error`.
    `amcp-error` NAMES A MECHANISM: it says CasparCG was involved. When the local
    HTTP server is down, CasparCG was not involved at all, and the operator is
    sent to the wrong machine.

    That is the `mute-failed` class exactly, and it cost this project an
    investigation into mute scope and 2.3.2-versus-2.5.0 audio. A wrapper may add
    context; it may not replace the cause.
  */
  async #sendAdd(
    itemId: string,
    slot: CommandSlot,
    templateId: string,
    fields: FieldValues,
    seq: number,
  ): Promise<{ ok: boolean; errorCode?: string }> {
    // fix-setconfig-serve-restart — the loud-failure contract: when serving
    // is INTENDED for this process but the server is down, a load must fail
    // with a clear reason (mirroring the unknown-template guard) — NEVER
    // ship a bare template id (real CasparCG 404s it: a silent blank ADD).
    // The bare-id fallback survives ONLY for the never-served unit-test path.
    if (!this.#templateServer.listening && this.#servingDesired) {
      this.#reconciler.applyAck(seq, false, 'template-serve-down');
      return { ok: false, errorCode: 'template-serve-down' };
    }
    let templateArg = this.#templateServer.listening
      ? this.#templateServer.urlFor(templateId)
      : templateId;
    // R-011 — a stored operator position rides the RESOLVED served URL's
    // query (the single permitted touch in the B-064 serve path: the guard
    // above already ran, and a bare id — the never-served unit-test branch —
    // is NEVER given a query). Both load's ADD and take's B-039 re-ADD flow
    // through here, so both inherit the override. The position never touches
    // the data payload — the AMCP escape rule is unaffected.
    //
    // R-030 — the CHANNEL RASTER rides the same query, and note that it is
    // appended INDEPENDENTLY of whether a position override exists. That
    // independence is the whole point: a graphic with no operator override still
    // has an authored position, and on a non-1080 channel that authored position
    // is computed against the wrong frame unless the page is told the real
    // geometry. Gating the raster behind `position !== undefined` would have
    // left exactly the untouched-by-the-operator graphics — the majority —
    // mis-placed, which is the C-018 defect surviving its own fix.
    if (this.#templateServer.listening) {
      const params: string[] = [];
      const position = this.#positions.get(itemId);
      // `positionQuery` (@cg/shared-schema), never a local spelling: PVW's
      // rehearsal frame now hands the SAME string to the page's own
      // `applyOutputPosition`, and two spellings of one override is how a
      // preview comes to place a graphic differently from air.
      if (position !== undefined) params.push(positionQuery(position));
      // The raster is ALWAYS present (`rasterFor` falls back to the reference
      // frame), so the query is never empty and needs no emptiness guard — the
      // position half is the only optional part.
      const raster = this.#channelSettings.rasterFor(slot.channel);
      params.push(`cw=${String(raster.width)}`, `ch=${String(raster.height)}`);
      templateArg += `?${params.join('&')}`;
    }
    const { ok, errorCode } = await this.#send(
      this.#builder.load(slot, templateArg, fields),
      seq,
      'normal',
    );
    if (ok) this.#loaded.add(itemId);
    return { ok, ...(errorCode !== undefined && { errorCode }) };
  }

  /**
   * The item currently bound to a slot, or undefined when the slot is free.
   *
   * `#slots` is itemId → slot, so this is its inverse. Kept as one helper rather
   * than an inline scan at each site because `loadFixed`'s refusal now depends on
   * WHICH item is bound, and a second copy of "who is on this layer" is how the
   * binding/occupancy conflation this method exists to resolve got started.
   */
  #itemBoundToSlot(slot: CommandSlot): string | undefined {
    for (const [itemId, s] of this.#slots) {
      if (s.channel === slot.channel && s.layer === slot.layer) return itemId;
    }
    return undefined;
  }

  #markDirty(itemId: string): void {
    this.#dirty.add(itemId);
    if (this.#flushTimer !== null) return;
    const timer = setTimeout(() => {
      this.#flushTimer = null;
      this.#dirty.clear();
      this.stackChanged.emit(this.#published());
    }, COALESCE_MS);
    timer.unref?.();
    this.#flushTimer = timer;
  }
}

/** Key for the per-process layer-adoption set (reconnect-reconciliation). */
function adoptionKey(slot: CommandSlot): string {
  return `${String(slot.channel)}:${String(slot.layer)}`;
}
