import {
  AmcpTimeoutError,
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
import {
  isRestorable,
  liveSourceFit,
  positionQuery,
  resolveDefaultPosition,
  type LiveSourceFit,
} from '@cg/shared-schema';
import type {
  AuditEntry,
  FieldValues,
  LivePlateVolumes,
  LiveSourceOverride,
  LiveSourceRect,
  Position,
  RetainedStackItem,
  StackItemState,
} from '@cg/shared-schema';
import { isRetainedOnAir } from '@cg/shared-schema';
import {
  isLayerVisible,
  // R-030 — the video-mode token map lives in shared-ipc, not caspar-client, so
  // the browser's MockRuntime can read the SAME map without dragging `node:net`
  // into the SPA bundle (see channelSettings.ts for the full reasoning).
  parseVideoModeFromInfo,
  videoModeRaster,
  type LayerClearReason,
  type PLAYOUT_CLEAR_REASONS,
  type RestoreSkip,
  type RestoreSkipReason,
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
  type TemplateLook,
  type ChannelSettings,
  type ChannelSettingsState,
  EMPTY_SOURCE_ASSIGNMENTS,
  EMPTY_SOURCE_CATALOG,
  checkSourceAssignments,
  checkSourceCatalog,
  liveSourceCarrierState,
  pruneAssignmentsForCatalog,
  type SourceAssignments,
  type SourceCatalog,
  type SourceProducer,
  type SourcesSetAssignmentsReason,
  type SourcesSetConfigReason,
  type TemplateSourceAssignment,
  type CHANNEL_SETTINGS_SET_REASONS,
  type Rehearsal,
  type REHEARSE_ENTER_REASONS,
  type REHEARSE_EXIT_REASONS,
} from '@cg/shared-ipc';
import { operatorActor } from './actor-context.js';
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
import {
  reconcileLiveLayers,
  type LiveLayerAdoption,
  type LiveLayerLedger,
  type LiveLayerOccupancy,
  type LiveLayerRecord,
  type NormalizedRect,
} from './live-layers.js';
import { AuditWriter, readRecentEntries } from '@cg/audit';
import { resolvePlateAssignments, type ResolvedPlate } from './live-plate-assignment.js';
import { resolvePlateAspect } from './live-plate-fit.js';
import {
  allocateLiveLayers,
  LIVE_PLATE_NO_LAYER,
  LIVE_PLATE_NO_RANGE,
} from './live-plate-seating.js';
import { releaseLivePlate, type LivePlateRelease } from './live-plate-release.js';
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

/**
 * R-021 stage 4 (task 3.1) — where a restored item is put, or WHY it is not.
 *
 * A bare `CommandSlot | null` could not carry the second answer, and B-108's rule
 * is that every skip is reported WITH ITS REASON: "your operator row was already
 * taken" and "the dynamic range is exhausted" send the operator to two different
 * places, and only one of them can be fixed by removing something.
 */
type RestorePlacement = { slot: CommandSlot } | { skip: RestoreSkipReason };

/**
 * C-015 phase 6 (task 6.0) — ONE plate, fully resolved and ready to seat.
 *
 * Every term is DECIDED before a single command leaves this process: which
 * catalog entry the plate resolved to, which layer it goes on, and the exact
 * geometry. That split is the point of the type — a refusal (unassigned plate,
 * contradicted aspect, no room in the band) must be reachable while the wire is
 * still untouched, so a refused take mutates nothing at all.
 */
interface LivePlatePlacement {
  /** The layer this plate's producer goes on — inside the declared band. */
  readonly slot: CommandSlot;
  /** The SCENE's handle for the hole (`guest-1`), which the ledger records. */
  readonly plateId: string;
  /** The assigned catalog entry's producer, still as a parsed union. */
  readonly producer: SourceProducer;
  /** `FILL` and `CLIP`, from ONE computation — never assembled separately. */
  readonly fit: { readonly fill: NormalizedRect; readonly clip: NormalizedRect };
}

/** The decision half of the assembly: what to seat, or why the take is refused. */
type LiveSeatingPlan =
  | {
      readonly ok: true;
      /** What the DESIRED set asks to be on screen — one entry per plate with a rect. */
      readonly placements: readonly LivePlatePlacement[];
      /**
       * `multibox-layout-switch` `tasks.md` 6.5 — **every plate the template DECLARES,
       * resolved to its producer, whether or not the desired set places it.**
       *
       * The release policy needs BOTH axes and they are different questions: a plate with
       * no rect in this look is HELD (it is still declared, a later look can show it),
       * while a plate the template no longer declares at all is TORN DOWN (nothing can
       * bring it back). A plan that carried only `placements` could not tell them apart,
       * and the reconcile would have to re-read the carrier to find out — a second
       * spelling of "what does this template declare", resolved a second way.
       *
       * It also carries the producer FORM, which is what `canHoldLivePlate` needs: the
       * ledger records the producer as the string that went on the wire, and re-parsing
       * that string to recover its kind would be a third spelling of the same fact.
       */
      readonly resolved: ReadonlyMap<string, SourceProducer>;
      /**
       * Plates the desired set DID place a rect for, whose hole then clipped to nothing —
       * the row's position override has carried them off the frame entirely.
       *
       * Carried separately from plain absence because the two are different facts and the
       * operator-facing sentence differs: "this look does not show it" is authoring, "it
       * is off the frame" is the row's position. Same disposition, honest reason.
       */
      readonly offFrame: ReadonlySet<string>;
      /**
       * Every plate the template DECLARES, whether or not this plan resolved it.
       *
       * 🔴 Separate from {@link resolved}, and the separation is what keeps a release honest.
       * "Is this plate still part of the template" is a question about the CARRIER; "what
       * producer is behind it" is a question about the ASSIGNMENT, and under a live action
       * the second is only asked of the plates going on screen. Reading declaredness off
       * `resolved` would make an unresolved plate look RETIRED and tear down a producer that
       * a later look still wants.
       */
      readonly declared: ReadonlySet<string>;
      /**
       * Declared plates this plan could not resolve to a catalog entry, and was not allowed
       * to refuse over (see `#planLiveSeating`'s `scope`).
       *
       * 🔴 The apply LEAVES THESE EXACTLY AS THEY ARE — not re-fitted, not held, not torn
       * down. "I cannot tell what this is" is not a licence to change anything about it, and
       * the one thing that must never follow from a missing assignment is a destroyed
       * picture that was working.
       */
      readonly unresolved: ReadonlySet<string>;
    }
  | { readonly ok: false; readonly errorCode: string; readonly message: string };

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
 * C-015 phase 6 (6.5) — **the volume every producer the bridge creates is born
 * with: silent.**
 *
 * Named rather than a bare `0` for the reason `INTENDED_VOLUME` is named, plus
 * one this project has now been bitten by three times: **zero is falsy.** A bare
 * literal here invites a `volume && …` or a `?? INTENDED_VOLUME` somewhere
 * downstream to read a deliberate mute as "no volume requested" and blanket the
 * layer back to full — which is a guest's live microphone on air with nothing in
 * any log saying it happened. A named constant makes the intent unmistakable at
 * every site that touches it.
 */
const CREATED_MUTED_VOLUME = 0;

/**
 * C-015 phase 6 (6.5b) — the load was refused because the layer could not be
 * MUTED, so the `CG ADD` was never sent.
 *
 * A code of its own rather than the rehearse path's `mute-failed`, because §8's
 * rule applies to consequences as much as to mechanisms: both say "CasparCG
 * refused the mute", but one means PVW was not started and the other means the
 * graphic was not loaded. One sentence covering both would be right about the
 * cause and wrong about what just happened to the operator.
 */
const ADD_MUTE_FAILED = 'add-mute-failed';

/**
 * §8 — A TIMEOUT IS NOT "THE COMMAND NEVER LEFT", and B-141 is where the
 * difference stops being cosmetic.
 *
 * `#send`'s catch used to flatten every throw — `AmcpTimeoutError` included —
 * into `amcp-send-failed`, whose operator sentence is "The command never reached
 * CasparCG". On a timeout the command DID leave this process and nothing came
 * back: a different machine to go and look at, and a different remedy. That is
 * exactly the `mute-failed` class DEBT.md §5 records — a wrapper may add
 * context, it may not replace the cause.
 *
 * ONE spelling, deliberately, and both readers use it: `#send` returns it to the
 * caller, and `auditVerdict` maps it to the schema's `timeout` outcome. Two
 * literals would be two rules, which is how the panel's action list drifted from
 * the schema's in the first place (B-141 fact 4).
 */
const AMCP_TIMEOUT_CODE = 'amcp-timeout';

/*
 * B-141 — who the bridge records as having acted.
 *
 * This WAS the constant `'operator'`, left as a single seam so that the day an
 * identity scheme was decided there would be exactly one place to change. That
 * day came: it is now `operatorActor()`, the per-console name the acting browser
 * declared, resolved in `actor-context.ts` — which is still exactly one place.
 *
 * 🔴 Read that file before relying on the value. It is SELF-DECLARED and
 * UNVERIFIED: it answers "which console, as labelled", never "which person,
 * proven".
 */

/**
 * B-141 — the facts ONE audited action carries, filled in as they become known.
 *
 * Seeded from the PRE-STATE (`#itemDetail`) so that the EARLIEST refusals — the
 * ones that return before the item is even looked up — still say which item,
 * which template and which layer the operator was acting on. An impl that learns
 * more on the way (a `load` allocating its slot) writes it here.
 */
interface AuditDetail {
  itemId?: string;
  templateId?: string;
  slot?: CommandSlot;
  /**
   * `remove()` ONLY — the wire failure its `{ accepted: true }` response cannot
   * express. See the note at the assignment. Nothing else may use this to
   * contradict a result, or "the outcome is DERIVED from the result" stops being
   * a rule and becomes a habit.
   */
  wireFailure?: string;
}

/**
 * B-141 — the audit outcome of a finished operation, DERIVED from what it
 * answered rather than from where in the method we happen to be standing.
 *
 * This function is the whole reason the seven verbs could not simply grow an
 * append at the end of each: every one of them has more exits than it has happy
 * paths, and an entry written before the answer is known records `ok` for a
 * refusal. A forensic log that misreports an on-air action is worse than none.
 */
function auditVerdict(
  detail: AuditDetail,
  result: { accepted: boolean; errorCode?: string },
): { outcome: AuditEntry['outcome']; errorCode?: string } {
  const errorCode = detail.wireFailure ?? result.errorCode;
  if (result.accepted && detail.wireFailure === undefined) return { outcome: 'ok' };
  return {
    // The schema's third outcome, reachable exactly because `#send` now tells a
    // timeout apart from a send failure. "Nothing came back" and "it was refused"
    // are the two readings a dispute has to choose between.
    outcome: errorCode === AMCP_TIMEOUT_CODE ? 'timeout' : 'failed',
    ...(errorCode !== undefined ? { errorCode } : {}),
  };
}

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
   * D-137 / C-015 — emitted with the FULL source catalog whenever a browser
   * changes it, so every connected console converges without polling.
   */
  readonly sourceCatalogChanged = new Emitter<SourceCatalog>();
  /**
   * D-137 / C-015 — emitted with the FULL assignment set whenever it changes,
   * INCLUDING when a catalog deletion cascaded through it. That case is the
   * reason this is a push and not a poll: no browser asked for the change, and
   * every browser is showing plates it now affects.
   */
  readonly sourceAssignmentsChanged = new Emitter<SourceAssignments>();
  /**
   * B-145 — emitted with the FULL ledger whenever the Live Source layers this bridge owns
   * change, so it can be PERSISTED and survive a restart.
   *
   * 🔴 **The runtime emits; it does not write files.** That is the same seam
   * `sourceCatalogChanged` / `sourceAssignmentsChanged` already use, and it is what keeps
   * `fs` out of the class that talks to the wire. `bridge.ts` subscribes and persists.
   */
  readonly liveLayersChanged = new Emitter<LiveLayerLedger>();
  /**
   * `multibox-layout-switch` `tasks.md` 6.5 / §12.4 — emitted for EVERY plate the
   * reconcile releases, held or torn down.
   *
   * 🔴 **This is what makes §12.4's teardown fallback "a NAMED, OBSERVABLE behaviour"
   * rather than a teardown nobody can tell from a bug.** A held plate and a torn-down one
   * look identical from outside — both stop being visible — and they differ in the one way
   * that matters on air: the held one comes back as a cut, the torn-down one comes back as
   * a fresh `PLAY`. An operator watching a switch that re-acquires needs to be able to
   * learn WHY here, not by reading the source.
   */
  readonly livePlateReleased = new Emitter<LivePlateRelease>();
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
   * C-015 phase 5 — THE LIVE SOURCE LEDGER, deliberately BESIDE {@link #slots}
   * and never folded into it.
   *
   * `#slots` answers ONE question — "where does this item's TEMPLATE live" — as
   * one coordinate per item, and every read site below depends on that answer
   * being exactly that. An item owning N live layers is unrepresentable in it,
   * so widening its value type would touch every one of those sites for a
   * reason none of them share. The types live in `live-layers.ts`, which argues
   * this at length; the field is here because phase 5 is where it is WIRED.
   *
   * This is the third ownership class: not `#slots` (an operator graphic's
   * layer), not `#reservedSet` (a fence AWAY from the company's playout system),
   * but a layer the BRIDGE itself owns. Three doors read it — the R-009 sweep,
   * the C-014 quarantine, and `clearLayer`'s R-015 refusal — and each is
   * commented at its own site.
   *
   * ⚠ **Empty in this phase, and that is expected, not a gap.** No verb can seat
   * a live producer yet (`playSource` is phase 6.1), so nothing populates this
   * in production. The doors are still wired now, because the alternative — a
   * live guest box existing on a layer the un-narrowed sweep can reclaim — is
   * an operator being invited to clear a face off air (`design.md` §4).
   */
  readonly #liveLayers: LiveLayerLedger = new Map();
  /**
   * `multibox-layout-switch` §14 (LOOKS) phase 3 — **itemId → the id of the look that
   * item is currently showing.**
   *
   * ABSENT means "the authored default", never "no look": exactly one look is always
   * active (§14.5), so this map records a DEPARTURE from the default rather than the
   * state itself — which is why nothing has to write it at take time and why an item
   * whose template has no looks simply never appears here.
   *
   * 🔴 **It is not a second spelling of the ledger.** The ledger says which producers are
   * SEATED; this says which of them the page is PUNCHING A HOLE for. `tasks.md` 6.5 makes
   * that separation load-bearing — a held plate is seated and not punched — so the two
   * facts cannot share one store without one of them becoming unrepresentable.
   */
  readonly #activeLooks = new Map<string, string>();
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
   * R-048 / C-015 phase 6 (6.9) — itemId → plateId → catalog source id: this
   * ROW's live-source substitutions.
   *
   * The `#positions` precedent EXACTLY, and deliberately: process memory, keyed by
   * itemId, deleted at remove, survives a setConfig, and carried across a bridge
   * restart by the browser's retention rather than by a file (6.9d). It is an
   * OPERATOR PLACEMENT-shaped fact, not server knowledge.
   *
   * 🔴 **IT NEVER WRITES BACK to the template's assignment or the installation's
   * catalog.** An emergency substitution must not silently become the permanent
   * configuration — the operator patching around a dead feed at 20:59 is not
   * making a decision about tomorrow's rundown, and the assignment is shared by
   * every other row carrying that template.
   */
  readonly #sourceOverrides = new Map<string, LiveSourceOverride>();
  /**
   * C-015 phase 6 (6.5f) — itemId → plateId → the volume that PLATE is intended to
   * have. **THE single source of the audio intent.**
   *
   * 🔴 **IT IS NOT `LiveLayerRecord.intendedVolume`, AND THE SPLIT IS THE POINT.**
   * This map is the INTENT — what the operator asked for, which outlives any
   * producer and any layer. The ledger's field is what was SENT, exactly as its
   * `producer` is _"recorded as SENT rather than as configured"_. Reading the
   * intent from the ledger, as the first cut did, ties it to a record that is
   * rebuilt on every seat and destroyed on every teardown — so a raised plate went
   * silent the moment its item was cleared and re-taken, and nothing said so.
   *
   * The `#positions` / `#sourceOverrides` precedent in every other respect:
   * process memory, keyed by itemId, dropped at remove, carried across a bridge
   * restart by the browser's retention rather than by a file (6.5f / 6.9d).
   */
  readonly #plateVolumes = new Map<string, LivePlateVolumes>();
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

  /**
   * R-021 stage 4 (task 3.1, owner decision d1) — **RESTORE-BLOCKED**: a retained
   * item whose DECLARED row is held by a producer that is provably not ours, so
   * the restore parked instead of acting.
   *
   * ⭐ **WHY IT IS RECORDED AND NOT DERIVED.** "Non-html producer under a binding"
   * is the same shape as several honest, non-blocked situations, and the one that
   * separates them is our KNOWLEDGE at the moment of decision: from a BLIND tap
   * that shape means `unverified` (B-093 — silence is evidence of nothing), and
   * only from a HEARING tap does it mean blocked. A re-derivation at publish time
   * cannot see which of those actually happened, so it would eventually claim
   * blocked on evidence that never existed. This map is written at exactly ONE
   * place — the decision itself, in `#decidePendingRestores` — and read at
   * exactly one — `#computeFixedState`, which puts it on the wire.
   *
   * The entry keeps the OBSERVED producer beside the slot so the reason survives
   * with the state rather than being re-looked-up from a tap that has since moved
   * on.
   *
   * It is cleared by every route out of the state: the item is decided (the
   * foreign producer vacated, or it turned out to be ours), the operator issues
   * any command (`#retirePendingRestore`), or the item is removed. It may NEVER
   * be cleared by allocate-elsewhere or by an automatic CLEAR — those are the two
   * exits d1 forbids.
   */
  readonly #restoreBlocked = new Map<string, { slot: CommandSlot; producer: string }>();
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
   * D-137 / C-015 — the installation mapping in force.
   *
   * LOADED AND VALIDATED IN `createBridge`, before the WebSocket binds, and
   * handed in here already-good: an unusable file is a hard boot failure and a
   * band that overlaps the bank or the reservation is refused at startup, not
   * adjudicated at take time (the fixed-bank governing principle).
   */
  #sourceCatalog: SourceCatalog;
  /**
   * D-137 / C-015 — which catalog entry each template's each PLATE uses.
   * LOADED, VALIDATED and PRUNED in `createBridge`, before the WebSocket binds.
   */
  #sourceAssignments: SourceAssignments;
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
  /**
   * B-141 — THE AUDIT RECORD.
   *
   * `#auditWriter` is the source of truth when a path is configured: NDJSON on
   * disk, append-only, surviving a bridge restart. `#audit` remains as the
   * in-memory tail ONLY for the no-writer case (tests, and a bridge started
   * without `--audit-log-path`), so `auditRecent` always has something coherent
   * to answer with.
   *
   * 🔴 **A FAILED AUDIT WRITE MUST NEVER TAKE THE STATION OFF AIR**, and the
   * contrast with the config stores is deliberate rather than an inconsistency.
   * An unusable `--source-assignments-path` or `--fixed-layers-path` IS a hard
   * boot failure, because those files are PRECONDITIONS for correct playout — a
   * take resolved against a half-read bank puts the wrong thing on the wrong
   * layer. An audit entry is a RECORD OF what happened; nothing downstream reads
   * it to decide what to send. So every append is fire-and-forget: the writer
   * emits `error`, keeps its own `lastError` and `errorCount`, keeps trying, and
   * the take proceeds regardless.
   */
  #audit: AuditEntry[] = [];
  #auditWriter: AuditWriter | null = null;
  #auditLogPath: string | null = null;
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
      /**
       * D-137 / C-015 — the VALIDATED source catalog (resolved and checked in
       * `createBridge` before the WebSocket binds). Absent = NO SOURCES, which
       * is the fail-closed default and never a guessed one.
       */
      sourceCatalog?: SourceCatalog;
      /**
       * D-137 / C-015 — the VALIDATED and PRUNED assignments. Absent = NOTHING
       * ASSIGNED, which is exactly what a freshly imported library has.
       */
      sourceAssignments?: SourceAssignments;
      /**
       * B-141 — where the NDJSON audit record lives. ABSENT means no writer is
       * configured, which the panel reports AS SUCH rather than as "no entries".
       */
      auditLogPath?: string;
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
    // D-137 / C-015 — already loaded and validated by `createBridge`; absent
    // files resolved to the EMPTY value there, never to a guessed default.
    this.#sourceCatalog = options.sourceCatalog ?? EMPTY_SOURCE_CATALOG;
    this.#sourceAssignments = options.sourceAssignments ?? EMPTY_SOURCE_ASSIGNMENTS;
    // B-141 — the audit writer, when a path is configured. Constructing it opens
    // nothing yet; the first `append` creates the parent directory and the file.
    // Deliberately NOT wrapped in a boot-time reachability check: an audit log we
    // cannot open must not stop the bridge coming up.
    if (options.auditLogPath !== undefined) {
      this.#auditLogPath = options.auditLogPath;
      this.#auditWriter = new AuditWriter({ filePath: options.auditLogPath });
    }
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
          // R-021 stage 4 — sampled ONCE, with the producer KIND, and the key set
          // derived from it. `reconcileOnReconnect` only asks "occupied?"; the
          // restore decision additionally asks "ours?" on a declared row.
          const observedProducers = this.#observedProducers(session);
          const occupiedKeys = new Set(observedProducers.keys());
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
          void this.#decidePendingRestores(observedProducers, heard);
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
    /*
      B-141 — CLOSE THE AUDIT FILE HANDLE. `AuditWriter` holds one open for its
      whole life and offers `close()`; nothing was calling it, so every runtime
      leaked a descriptor that node then destroyed at GC — which since node 22 is a
      hard `ERR_INVALID_STATE`, not a warning. Surfaced by the B-141 append-site
      suite, where one runtime per test made it seven uncaught exceptions in a run
      that otherwise reported all green.

      LAST, and awaited: the sessions and the template server are torn down first,
      so anything they record on the way out is still written before the handle
      goes. Failure is swallowed for the same reason every other audit failure is —
      a shutdown must not be blocked by the record of it.
    */
    await this.#auditWriter?.close().catch(() => undefined);
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
      // R-048 (6.9 / 6.9d) — the source override joins the snapshot at the same
      // point and for the same reasons: the row must be able to SAY that a plate
      // is not on its configured source, and the browser's retention mirrors what
      // it is published (`StackRetentionStore.toRetained`), which is what carries
      // it across a bridge restart. Both are spread conditionally so an item with
      // neither is the identical object it was before either field existed.
      const sourceOverride = this.#sourceOverrides.get(item.itemId);
      // 6.5f — the audio intent joins them, and it matters MORE than either: audio
      // is the one property of a graphic an operator cannot see, so a console that
      // cannot read this back cannot tell a live guest from a silent one.
      const plateVolumes = this.#plateVolumes.get(item.itemId);
      if (position === undefined && sourceOverride === undefined && plateVolumes === undefined)
        return item;
      return {
        ...item,
        ...(position !== undefined && { position }),
        ...(sourceOverride !== undefined && { sourceOverride }),
        ...(plateVolumes !== undefined && { plateVolumes }),
      };
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
    return this.#audited('load', { itemId, templateId }, (detail) =>
      this.#loadImpl(itemId, templateId, fields, detail),
    );
  }

  async #loadImpl(
    itemId: string,
    templateId: string,
    fields: FieldValues,
    detail: AuditDetail,
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

    // The layer is only known HERE, after allocation — the refusals above it
    // genuinely have no slot to name, and inventing one would be worse than the gap.
    detail.slot = slot;
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
    // B-141 — the SECOND entry point for the `load` action, audited HERE rather
    // than in the shared `#loadOnto`: every refusal `loadFixed` owns
    // (`unknown-template`, `not-fixed`, `slot-bound`) returns long before
    // `#loadOnto` is reached, and those are exactly the entries worth having.
    // Auditing the shared tail instead would have recorded nothing for any of them.
    return this.#audited('load', { itemId, templateId, slot }, () =>
      this.#loadFixedImpl(slot, itemId, templateId, fields),
    );
  }

  async #loadFixedImpl(
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
      // B-141 — the race has a NAME now. Recorded as a bare failure it was
      // indistinguishable from an AMCP refusal, which sends whoever reads the log
      // the next day to the playout machine for something that happened here.
      return { accepted: false, errorCode: 'item-removed' };
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
   * exhausted layer range. B-108 — every skip is reported WITH ITS REASON, per
   * item, because a bare count cannot tell the operator which rows are gone.
   *
   * ⭐ **B-109 / B-107 — step 2 runs ONLY for a restorable state.** A row retained
   * as `cleared` (the operator emptied that layer) or `error` (it never got what it
   * asked for) is restored as a ROW — slot reserved, OSC interest bound, published —
   * but is NEVER entered into `#pendingRestore`. That is the whole fix, and it is
   * deliberately structural: an item that is not pending cannot reach
   * `#decidePendingRestores`, so its "silent layer → re-ADD" branch is UNREACHABLE
   * for it rather than guarded against. Occupancy is not consulted for such a row at
   * all — silence on a layer the operator emptied is the EXPECTED reading, not
   * evidence that a producer was lost.
   */
  async restore(items: readonly RetainedStackItem[]): Promise<{
    restored: number;
    skipped: RestoreSkip[];
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
    const skipped: RestoreSkip[] = [];
    for (const item of items) {
      // The live bridge wins over the retained copy — never clobber. BENIGN: the row
      // is still there, backed by the live bridge, so nothing is lost and B-108's
      // surface deliberately says nothing about it.
      if (this.#reconciler.get(item.itemId) !== null) {
        skipped.push({ itemId: item.itemId, reason: 'already-held' });
        continue;
      }
      if (!this.#templates.has(item.templateId)) {
        skipped.push({ itemId: item.itemId, reason: 'unknown-template' });
        continue;
      }
      const placement = this.#slotForRestore(item);
      if ('skip' in placement) {
        skipped.push({ itemId: item.itemId, reason: placement.skip });
        continue;
      }
      const { slot } = placement;
      /*
        🔴 §12.6 — DOOR 2 OF 2: EXCLUSIVITY, on the door that has NO OTHER COVER.

        A restore never passes through `take()` (`design.md` §8), and it adopts every
        retained on-air item with no cap — so without this a reconnect re-seats the very
        pair of multi-box templates a take refuses, and does it silently, on a link that
        just came back. ONE predicate, called from both sites, never re-derived here
        (golden rule 6).

        Gated on `isRetainedOnAir` — the canonical reading of a retained state, the same
        one `restoreItem` uses — because only a row coming back ON AIR can collide. A
        `loaded` or `cleared` multi-box row puts nothing on the channel and must still come
        back, or the refusal would quietly delete rows the operator can see.

        Refused BEFORE `restoreItem`, so a refused restore mutates nothing — the same
        discipline the take door keeps, and the same as the three skips above it.
      */
      if (isRetainedOnAir(item.state)) {
        const exclusivity = this.#refuseSecondMultiBox(item.itemId, item.templateId, slot.channel);
        if (exclusivity !== null) {
          // B-114 — release by the SAME door the slot was taken through (see below).
          if (this.#layers.isFixed(slot)) this.#layers.unbindFixed(slot);
          else this.#layers.deallocate(slot);
          skipped.push({
            itemId: item.itemId,
            reason: 'multibox-already-on-air',
            // The bridge's own sentence, naming BOTH halves. `RestoreSkipReason` is a
            // fixed code and cannot say WHICH template is already on air — the same gap
            // `stack.take`'s `message` exists to fill, and filled the same way.
            detail: exclusivity.message,
          });
          continue;
        }
      }
      if (
        this.#reconciler.restoreItem({
          itemId: item.itemId,
          templateId: item.templateId,
          fields: item.fields,
          state: item.state,
          ...(item.errorCode !== undefined && { errorCode: item.errorCode }),
        }) === null
      ) {
        // B-114 — release by the SAME door the slot was taken through.
        // `deallocate` returns early for a fixed slot on purpose (it must keep
        // the fence), so using it alone here would leave the row bound to an
        // item the reconciler just refused — a permanently occupied row holding
        // nothing, which no verb can clear.
        if (this.#layers.isFixed(slot)) this.#layers.unbindFixed(slot);
        else this.#layers.deallocate(slot);
        skipped.push({ itemId: item.itemId, reason: 'already-held' });
        continue;
      }
      this.#slots.set(item.itemId, slot);
      this.#reconciler.assignSlot(item.itemId, { ...slot, server: 'primary' });
      // Bound for EVERY restored row including a cleared one: an `out` retains its
      // slot (B-109's own trace), so the row keeps its layer identity and OSC is
      // what confirms the layer really is idle.
      this.#addInterest(slot);
      // R-011 — the operator's placement is intent too, and #sendAdd reads it
      // off #positions, so it must be back BEFORE any re-ADD decision runs.
      //
      // ⭐ R-048 (6.9d) — the per-plate SOURCE override attaches HERE, beside it and
      // for the identical reason: an OPEN-axis optional field on `RetainedStackItem`,
      // re-applied BEFORE any adopt-vs-re-ADD decision runs, so whatever this restore
      // goes on to seat carries it. Dropping it would silently revert the plate to
      // the DEAD source the operator patched around — the B-107 / B-109 class,
      // retention losing state it did not model. See `RetainedStackItemSchema`'s
      // two-axes note.
      if (item.position !== undefined) this.#positions.set(item.itemId, item.position);
      if (item.sourceOverride !== undefined) {
        this.#sourceOverrides.set(item.itemId, item.sourceOverride);
      }
      // 6.5f — and the audio intent, for the same reason and with a failure that is
      // HARDER to notice: a dropped source override shows the wrong picture, which
      // somebody sees; a dropped volume shows the right picture in silence.
      if (item.plateVolumes !== undefined) {
        this.#plateVolumes.set(item.itemId, item.plateVolumes);
      }
      /*
       * 🔴 B-109 / B-107 — THE PENDING RESTORE IS THE LICENCE TO TOUCH THE LAYER, and
       * only a restorable state gets one.
       *
       * `cleared` — the operator CLEARed this graphic to take it off air and kept the
       * row. Its layer is empty BECAUSE THEY EMPTIED IT. Parking it here would hand it
       * to `#decidePendingRestores`, whose "silent layer → the producer is gone, re-ADD
       * it" branch cannot tell a producer CasparCG destroyed from one the OPERATOR
       * destroyed — and would put the graphic back with a `CG ADD` nobody asked for.
       * `error` — the row never had a producer to lose, and a lost link may never
       * IMPROVE a status.
       *
       * NOT a guard inside the decision: the decision is reached only THROUGH this map,
       * so leaving the row out of it makes the re-ADD unreachable rather than merely
       * refused. A second copy of the predicate inside `#decidePendingRestores` is the
       * kind of drift golden rule 6 exists to prevent.
       */
      if (isRestorable(item.state)) {
        this.#pendingRestore.set(item.itemId, {
          slot,
          templateId: item.templateId,
          fields: item.fields,
        });
      }
      this.#markDirty(item.itemId);
      restored++;
    }

    // If the primary session is ALREADY healthy the `to === 'healthy'`
    // transition fired long ago and will not fire again (the late-page-reload
    // case) — but the tap has been filling ever since, so the answer is
    // available right now. Without this branch those items would sit pending
    // forever, visible but never adopted or re-ADDed.
    //
    // Gated on the PENDING set, not on `restored`: a restore of nothing but cleared
    // and errored rows restores rows but licenses no wire action, and sampling
    // occupancy for it would be work done to reach a no-op.
    if (this.#pendingRestore.size > 0 && this.#adapter.primarySession.state === 'healthy') {
      await this.#decidePendingRestores(
        this.#observedProducers(this.#adapter.primarySession),
        this.#adapter.primarySession.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs),
      );
    }
    return { restored, skipped };
  }

  /**
   * R-021 stage 4 — the tap's observation as `adoptionKey → producer KIND`.
   *
   * The restore decision used to take a bare `Set` of occupied keys, which
   * answered "is something there?" and could not answer "is it OURS?" — and those
   * are different questions with opposite safe answers on a DECLARED row. One
   * helper rather than a third hand-rolled loop: the key format is `adoptionKey`
   * (the sweep's own), and the staleness bound is `#occupancyStaleMs` and never a
   * second constant.
   *
   * The caller decides whether the tap is HEARING at all (`hasFreshOsc`); this
   * only reports what it heard. An empty map from a hearing tap means empty
   * layers (B-053); from a blind one it means nothing whatsoever, which is why
   * the distinction never lives in here.
   */
  #observedProducers(session: ServerSession): ReadonlyMap<string, string> {
    const byKey = new Map<string, string>();
    for (const o of session.osc.occupancy.occupied(this.#occupancyStaleMs)) {
      byKey.set(adoptionKey({ channel: o.channel, layer: o.layer }), o.producer);
    }
    return byKey;
  }

  /**
   * B-092 — the layer a restored item takes. The RETAINED slot is preferred and
   * taken exactly: it is the layer the surviving producer is actually on, so it
   * is the layer whose occupancy decides adopt-vs-re-ADD. Re-allocating some
   * other free layer would consult the wrong layer's occupancy and could ADD a
   * second producer beside a live one.
   *
   * ⭐ **R-021 stage 4 (task 3.1) — THE BRANCH IS THE POINT: A DECLARED ROW AND A
   * DYNAMIC LAYER GET OPPOSITE ANSWERS WHEN THE EXACT SLOT CANNOT BE TAKEN.**
   *
   *   DYNAMIC → #368's fall-through to `#allocate()`, unchanged and
   *     hardware-validated. Re-homing an anonymous layer costs nothing an
   *     operator can perceive; the item just comes back somewhere in its range.
   *   DECLARED (fixed) → **NEVER `#allocate()`.** R-021's acceptance is "the item
   *     survives ON THE SAME layer", and the row IS the promise ("layer 72 is the
   *     clock"). An item bound to 72 coming back on 61 silently breaks the whole
   *     item — and under R-028's declared model EVERY item is on a declared row,
   *     so the fall-through would misplace every row after a bridge restart, not
   *     an edge case. Skipped honestly instead (`fixed-slot-taken`).
   *
   * 🔴 **THE TWO DOORS ARE DIFFERENT FUNCTIONS AND THAT IS LOAD-BEARING.**
   * `reserve()` refuses a fixed slot BY CONSTRUCTION (born allocated, so never
   * "free" to reserve) and `bindFixed()` refuses a non-fixed one, so neither can
   * stand in for the other. B-114 replaced `reserve()` with `bindFixed()` rather
   * than branching, which fixed the declared row and silently cost the DYNAMIC
   * row its exact-slot restore: every dynamic retained coordinate fell straight
   * through to `#allocate()`, which is precisely the wrong-layer-occupancy hazard
   * this method's own contract forbids. Both doors are now reached through an
   * explicit `isFixed` test, so neither branch can be "simplified" into the other
   * again (design.md §d test 5 pins it).
   *
   * The bound value for a declared row is the REGISTRY's `templateType`, resolved
   * exactly as `fixedLoad` resolves it — the row reads this straight back out as
   * its label, so binding the raw id here would restore the row under a UUID.
   *
   * `null` means the item is SKIPPED, with the caller reporting which of the two
   * reasons applied (B-108 — every skip is reported WITH ITS REASON).
   */
  #slotForRestore(item: RetainedStackItem): RestorePlacement {
    if (item.slot !== undefined) {
      // R-028 / C-015 — a retained coordinate now inside the RESERVED playout
      // range is SKIPPED, never re-homed. Falling through to `#allocate()`
      // would consult a DIFFERENT layer's occupancy (the exact
      // wrong-layer-occupancy hazard this method's contract forbids) and could
      // re-ADD a duplicate while the surviving producer stays live on the
      // playout layer — two copies on air, with the row pointing at the wrong
      // one. Skipping keeps the wire untouched, exactly like the
      // exhausted-range case; the survivor is the playout team's to deal with.
      if (this.#reservedSet.has(item.slot.layer)) return { skip: 'no-layer' };
      const slot = { channel: item.slot.channel, layer: item.slot.layer };
      // ── A DECLARED OPERATOR ROW — the exact slot or nothing. ───────────────
      //
      // B-114's reason for `bindFixed` stands and is why the branch exists at
      // all: `reserve()` refuses a fixed slot, and for a `custom` template type
      // `#allocate()` would additionally throw (that range IS the reserved playout
      // range), so a declared row used to come back with `fixedBinding` unrecorded
      // — publishing `binding: null`, the operator's templates gone from the
      // surface, and the row refusing a fresh LOAD because its occupancy reads
      // `unknown` until OSC arrives.
      if (this.#layers.isFixed(slot)) {
        const templateType = this.#templates.get(item.templateId)?.templateType ?? item.templateId;
        // The `false` case is a row ANOTHER restored item already bound. It is
        // returned as a skip and NOT allocated elsewhere — see the method's note.
        return this.#layers.bindFixed(slot, templateType) ? { slot } : { skip: 'fixed-slot-taken' };
      }
      // ── A DYNAMIC layer — #368, unchanged: exact slot first, then elsewhere. ──
      if (this.#layers.reserve(slot, item.templateId)) return { slot };
    }
    try {
      return { slot: this.#allocate(item.templateId) };
    } catch {
      return { skip: 'no-layer' };
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
    observedProducers: ReadonlyMap<string, string>,
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
    /*
     * R-021 stage 4 — the entries this pass could not decide, re-parked verbatim
     * at the end. Collected rather than left in place because the loop below
     * consults `#pendingRestore` through nothing else, and re-adding DURING the
     * iteration would make "was this decided?" depend on map ordering.
     */
    const stillPending = new Map<string, (typeof pending)[number][1]>();

    // The restore pass does not report per-item reasons anywhere (it is a bulk
    // rebuild with no operator waiting on it), so it takes `#sendAdd`'s result
    // whole and looks at neither half.
    const adds: Promise<{ ok: boolean; errorCode?: string }>[] = [];
    for (const [itemId, entry] of pending) {
      const { slot, templateId, fields } = entry;
      // A remove landed between the restore and this decision — the item is
      // gone; its slot was already released by remove(). Nothing to do.
      if (this.#reconciler.get(itemId) === null) continue;
      // We can decide now, so any earlier blind-tap doubt is resolved: drop the
      // `unverified` marker before settling the item either way. (No-op unless a
      // previous, blind pass had set it.)
      this.#reconciler.setUnverifiable(itemId, false);

      const producer = observedProducers.get(adoptionKey(slot));
      if (producer !== undefined) {
        /*
         * 🔴 R-021 stage 4 (task 3.1, owner decision d1) — RESTORE-BLOCKED.
         *
         * A DECLARED operator row holding a producer that is provably not ours.
         * All three of the obvious moves are wrong, and each is wrong for a
         * reason this codebase has already paid for:
         *
         *   ADOPT IN PLACE — NO. Adopting a decklink as our html item is B-092's
         *     recorded misadoption lie: the row would claim an item that is not
         *     on that layer, and `#adopted` would additionally suppress the one
         *     CLEAR that could later fix it.
         *   CLEAR IT — NO. An automatic CLEAR of a live non-html producer is the
         *     blind-destruction class R-015 exists to prevent. The hard Clear is
         *     an OPERATOR power (task 4.3); a restore is not an operator action,
         *     and automatic paths never destroy.
         *   ALLOCATE ELSEWHERE — NO, and doubly so: `#slotForRestore` has already
         *     refused it for this row, because the row IS the promise.
         *
         * So it PARKS: nothing is sent, the item keeps its slot and its binding,
         * and the row states both facts — the item waiting and what is observed.
         * It stays in `#pendingRestore`, which is what makes the second exit d1
         * names work by itself: when the foreign producer vacates, this same
         * decision runs from the sweep, sees a silent layer, and re-ADDs through
         * the ordinary path. No separate un-block mechanism exists to drift.
         *
         * "Not html" fails safe and video kinds are never enumerated — the same
         * discriminator `clearLayer` and the playout tab use, never a second list.
         */
        if (this.#layers.isFixed(slot) && producer !== 'html') {
          this.#restoreBlocked.set(itemId, { slot, producer });
          stillPending.set(itemId, entry);
          this.#markDirty(itemId);
          continue;
        }
        // Adopted by OBSERVATION, not by a CLEAR — so this deliberately does
        // NOT go through `#markAdoptedOnPrimary`, whose owned-occupancy
        // resolution means "provably cleared". We proved the opposite: there IS
        // a producer, and it is ours.
        this.#restoreBlocked.delete(itemId);
        this.#adopted.add(adoptionKey(slot));
        continue;
      }

      // The layer is silent, so nothing is blocking this row any more — the
      // marker goes BEFORE the re-ADD, so a publish triggered by it cannot carry
      // a stale block.
      this.#restoreBlocked.delete(itemId);
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
    for (const [itemId, entry] of stillPending) this.#pendingRestore.set(itemId, entry);
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
    // R-021 stage 4 — an explicit operator command is the FIRST of d1's two exits
    // from `restore-blocked` ("Clear, then take"). Dropped unconditionally and
    // beside the pending entry, so there is exactly one place a block dies by the
    // operator's hand and no route can retire the restore while leaving the row
    // still reading BLOCKED.
    this.#restoreBlocked.delete(itemId);
    if (this.#pendingRestore.delete(itemId)) {
      // The doubt is resolved by the operator's own command; drop the marker so
      // the row stops reading `unverified` on the strength of it.
      this.#reconciler.setUnverifiable(itemId, false);
    }
  }

  async take(itemId: string): Promise<{ accepted: boolean; errorCode?: string; message?: string }> {
    return this.#audited('take', this.#itemDetail(itemId), () => this.#takeImpl(itemId));
  }

  async #takeImpl(
    itemId: string,
  ): Promise<{ accepted: boolean; errorCode?: string; message?: string }> {
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

    /*
      C-015 phase 6 (6.0) — DECIDE THE LIVE PLATES HERE, WHERE A REFUSAL COSTS
      NOTHING.

      `#planLiveSeating` resolves every plate to a catalog entry, validates the
      author's aspect assertion, computes the geometry and picks the layers —
      and sends nothing. So an unassigned plate, a contradicted aspect or a band
      with no room refuses the take with the wire, the Reconciler and the ledger
      all untouched, exactly like the three refusals above it. Deciding it later
      would mean refusing after the pre-roll `CG ADD` had already replaced the
      stage, which is a mutation on a take the operator was told did not happen.

      The SEATING is deliberately far from here — one command before the `CG
      PLAY` — because a live producer starts rendering the instant it is played:
      there is no loaded-but-not-playing state for a route or a card the way
      there is for an html producer. Every frame between seating and the take is
      a frame with a guest's picture on air and no graphic around it.
    */
    /*
      §12.6 — DOOR 1 OF 2: EXCLUSIVITY. Exactly one multi-box template on air per
      channel.

      Here for the same reason `#planLiveSeating` is here — a refusal costs nothing at
      this point, with the wire, the Reconciler and the ledger all untouched. BEFORE the
      seating plan rather than inside it: the plan resolves THIS item's plates, while this
      asks about the on-air SET, and folding one question into the other is how the answer
      to either stops being findable.

      The second door is `restore()`, which never passes through here. Both call
      `#refuseSecondMultiBox` — ONE predicate, two sites (golden rule 6).
    */
    const exclusivity = this.#refuseSecondMultiBox(
      itemId,
      this.#reconciler.get(itemId)?.templateId ?? itemId,
      slot.channel,
    );
    if (exclusivity !== null) {
      process.stderr.write(
        `[caspar-bridge] take refused for ${itemId}: ${exclusivity.message}
`,
      );
      return { accepted: false, ...exclusivity };
    }

    /*
      §14 (LOOKS) phase 3 — A TAKE IS THE FIRST RECONCILE, AGAINST AN EMPTY PRIOR SET.

      The desired set is the ACTIVE LOOK's rects — the authored default for a fresh row
      (`#activeLookOf`), or whichever look a previous switch left recorded on a re-take, so
      re-taking a row does not silently return it to the default look while the operator is
      watching the one they chose.
    */
    const plan = this.#planLiveSeating(
      itemId,
      slot,
      this.#desiredPlateRects(itemId),
      'all-declarations',
    );
    if (!plan.ok) {
      process.stderr.write(`[caspar-bridge] take refused for ${itemId}: ${plan.message}\n`);
      // The MESSAGE rides out with the code. Which PLATE is unassigned, and which
      // two aspects disagree, are the facts that make these refusals actionable,
      // and no fixed code can carry them — see `StackTakeChannel`.
      return { accepted: false, errorCode: plan.errorCode, message: plan.message };
    }

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

    /*
      C-015 phase 6 (6.0) — SEAT THE PLATES, one command before the graphic they
      belong to.

      LAST, and BEFORE the `CG PLAY`. Both halves of that are on-air decisions:

      - LAST, because a live producer renders the moment it is played. Seating at
        load time — the obvious "pre-roll it like the template" — would put a
        guest's picture on the programme channel for as long as the operator
        cued ahead, framed by nothing.
      - BEFORE the take, because the alternative is the template landing with its
        holes still empty. That is the outcome 6.7's whole refusal exists to
        prevent, and arriving at it by an ordering choice would be no better than
        arriving at it by a missing assignment. The cost is the mirror window —
        pictures with no frame around them for one command — which is bounded by
        the very next line on the same connection.

      A seating failure REFUSES THE TAKE and the graphic never plays: the plates
      have already been rolled back, so refusing leaves nothing half-placed
      anywhere. An item that was already on air keeps its template layer and
      loses its boxes, and the row is told why — which is honest, and is the
      whole reason this returns a code rather than a boolean.
    */
    const seated = await this.#applyLivePlates(itemId, plan, 'take');
    if (!seated.ok) {
      const code = seated.errorCode ?? 'amcp-error';
      this.#reconciler.applyAck(seq, false, code);
      return { accepted: false, errorCode: code };
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
    return this.#audited('update', this.#itemDetail(itemId), () =>
      this.#updateImpl(itemId, fields, mergeMode),
    );
  }

  async #updateImpl(
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
    // The audit ACTION is `stop` — the schema's word for the verb, not this
    // method's disambiguating name (`stop()` on this class is the process
    // shutdown). The log speaks the operator's vocabulary, not the class's.
    return this.#audited('stop', this.#itemDetail(itemId), () => this.#stopItemImpl(itemId));
  }

  async #stopItemImpl(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
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
    // C-015 phase 6 (6.0/6.6) — the plates come down WITH the graphic. STOP takes
    // the template off air but leaves its producer resident, so without this the
    // guest pictures would still be on the channel with nothing around them. See
    // `out()` for why the live layers go FIRST.
    await this.teardownLiveLayers(itemId);
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
    return this.#audited('next', this.#itemDetail(itemId), () => this.#nextItemImpl(itemId));
  }

  async #nextItemImpl(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const { ok, errorCode } = await this.#send(this.#builder.next(slot), this.#nextSeq(), 'urgent');
    return ok ? { accepted: true } : { accepted: false, errorCode: errorCode ?? 'amcp-error' };
  }

  async out(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    return this.#audited('out', this.#itemDetail(itemId), () => this.#outImpl(itemId));
  }

  async #outImpl(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    // B-141 — the code the other five item verbs already answer. `out` alone
    // returned a bare `{ accepted: false }`, so its refusal reached the operator as
    // "Not accepted." and would reach the audit log with nothing to say WHICH
    // refusal it was — the one field a dispute turns on.
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
    // R-006 — see #noServerReachable(). An out cannot reach a dead server either; claiming it
    // succeeded would be the mirror-image lie (an operator believing a graphic came OFF).
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'out', itemId }, seq);
    this.#armExpiry(seq);
    /*
      C-015 phase 6 (6.0/6.6) — THE LIVE LAYERS COME DOWN FIRST, THEN THE GRAPHIC.

      The order is an on-air decision, not a tidy-up. The template sits ABOVE its
      plates (70–99 over the declared 10–59 band) and covers the frame with a hole
      punched in it. Clearing the template first would strip that covering off and
      leave bare guest rectangles keyed over programme for the duration of the
      teardown round-trips — which reads on air as the wrong source having been
      taken. Clearing the plates first leaves the designed frames standing with
      programme showing through them for the same moment: still wrong, but it is a
      graphic the audience has already been looking at.

      The cost is that the operator's Out waits for the plates. Best-effort per
      layer (`teardownLiveLayers`), so one stuck send cannot strand the graphic
      behind it.
    */
    await this.teardownLiveLayers(itemId);
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
        /*
         * R-021 stage 4 (task 3.1) — the RESTORE-BLOCKED fact, read from the
         * ledger the decision itself wrote and never re-derived from
         * `observed` (see `#restoreBlocked`).
         *
         * Guarded on the SLOT as well as the item: the block is about THIS row,
         * so an item that somehow moved must not carry a stale block onto its
         * new row. Absent, never `false` — the wire says nothing about rows
         * that are not blocked, so an old browser reads them exactly as before.
         */
        const blocked =
          itemId !== undefined && this.#restoreBlocked.get(itemId)?.slot.layer === slot.layer;
        return {
          channel: slot.channel,
          layer: slot.layer,
          ...(alias !== undefined ? { alias } : {}),
          observed,
          binding:
            itemId !== undefined && templateType !== undefined
              ? { itemId, templateType, ...identity, ...(blocked ? { restoreBlocked: true } : {}) }
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

  // ── C-015 phase 5: the Live Source ledger (the THIRD ownership class) ──────

  /**
   * Every Live Source coordinate the bridge currently owns, as `ch:layer` keys.
   *
   * The ONE place that flattens the ledger to coordinates — all three ownership
   * doors call this rather than walking `#liveLayers` themselves, so "is this a
   * Live Source layer" has exactly one implementation and cannot drift between
   * the sweep, the quarantine and the refusal (golden rule 6). Keyed through
   * `adoptionKey` so the format matches the sweep's `owned` set exactly.
   */
  #liveLayerKeys(): Set<string> {
    const keys = new Set<string>();
    for (const records of this.#liveLayers.values()) {
      for (const record of records) keys.add(adoptionKey(record.slot));
    }
    return keys;
  }

  /**
   * C-015 phase 6 (6.2) — **the EFFECTIVE output position of one stack item: the
   * SAME three-step chain the page resolves for itself.**
   *
   * `operator override ?? the template's carried defaultPosition ?? centred`
   *
   * 🔴 **THE MIDDLE STEP IS THE ONE THAT WAS ALMOST MISSED, AND IT IS LOAD-BEARING.**
   * An earlier draft of the design said `defaultPosition` need not reach the bridge,
   * on the grounds that the bridge holds the operator's effective position in
   * `#positions` and would otherwise use the same `centred` default the page does.
   * That is wrong for every template whose author set a position: the bridge appends
   * the position query **only when an override exists** (see `#sendAdd`), so with no
   * override no `pos` rides the URL and the page falls back to
   * `scene.defaultPosition` — while a bridge assuming `centred` would compute a
   * different anchor translate and put the live box where the hole is not.
   *
   * The hole is transparent, so nothing on air would say why. That is the whole
   * reason `defaultPosition` joins `resolution` on the `liveSources` carrier.
   *
   * `resolveDefaultPosition` (@cg/shared-schema) supplies the tail rather than a
   * local `{ anchor: 'center' }` literal — the same rule as `positionQuery` one
   * method over: two spellings of "centred" is how the composited box comes to sit
   * somewhere the hole is not.
   */
  #effectivePosition(itemId: string, carried: Position | undefined): Position {
    return this.#positions.get(itemId) ?? resolveDefaultPosition({ defaultPosition: carried });
  }

  /**
   * C-015 phase 6 (6.2 / 6.3 / 6.4) — **the `FILL` + `CLIP` for ONE plate of one item.**
   *
   * Everything the arithmetic needs is resolved HERE, because only the bridge holds
   * it: the channel raster (`ChannelSettingsStore.rasterFor` — which falls back to the
   * reference frame, so it is never absent), the operator's override, and the
   * template's carried `resolution` + `defaultPosition`. The arithmetic itself is
   * `liveSourceFit` in `@cg/shared-schema` — the ONE implementation (6.2a), shared
   * with the page's own placement terms and pinned to the page's composition by
   * 6.2b's contract test.
   *
   * `sourceAspect` is passed in rather than resolved here: it comes from the
   * ASSIGNED catalog entry through §3a's chain, which is the caller's to walk
   * (a plate with no assignment refuses the take before any geometry is computed —
   * 6.7).
   */
  liveSourceFitFor(input: {
    channel: number;
    itemId: string;
    rect: { x: number; y: number; width: number; height: number };
    sceneResolution: { width: number; height: number };
    carriedDefaultPosition?: Position | undefined;
    sourceAspect: number | null;
  }): LiveSourceFit {
    return liveSourceFit({
      rect: input.rect,
      sceneResolution: input.sceneResolution,
      raster: this.#channelSettings.rasterFor(input.channel),
      position: this.#effectivePosition(input.itemId, input.carriedDefaultPosition),
      sourceAspect: input.sourceAspect,
    });
  }

  /**
   * C-015 phase 6 (task 6.0) — **THE ASSEMBLY, HALF ONE: decide everything this
   * item's plates need, and touch NOTHING.**
   *
   * ── WHY THIS TASK EXISTS AT ALL ────────────────────────────────────────────
   *
   * Phase 6 part 1 built every COMPONENT — the verbs (6.1), the arithmetic
   * (6.2/6.2a/6.2b/6.4), the fit policy and its refusal (6.3), the unassigned
   * refusal (6.7), teardown (6.6) — and **nothing enumerated the call site that
   * strings them together**, so a declared plate put no picture on air. That was a
   * gap in the TASK LIST rather than an omission by a session: 6.1 says "build the
   * verbs", 6.2 "build the arithmetic", and no item said "call them". This method
   * and {@link #seatLiveLayers} are that call site.
   *
   * ── THE SPLIT: DECIDE, THEN ACT ────────────────────────────────────────────
   *
   * Every refusal is reachable from here, where the wire has not been touched:
   *
   *   - a plate with no assignment          → `live-source-unassigned` (6.7)
   *   - an `expectedAspect` the source contradicts → `live-source-aspect-mismatch` (6.3)
   *   - no declared Live Source band        → `live-source-no-layer-range`
   *   - a band with no room                 → `live-source-no-layer`
   *
   * A refused take must mutate nothing, which is why this runs BEFORE the take
   * applies its intent — the same shape as the `rehearsing` / `unknown-item` /
   * `disconnected` refusals it sits beside.
   *
   * ── WHAT AN ABSENT CARRIER DOES, AND WHY IT IS NOT A REFUSAL ───────────────
   *
   * `liveSourceCarrierState` has three answers and only `'declared'` seats
   * anything. `'none'` is a template with no plates. `'unknown'` is a template
   * imported before the carrier existed — and it is deliberately NOT a take
   * refusal: nothing here can tell whether such a template has holes, the great
   * majority have none, and refusing every pre-carrier template's take would take
   * a station's whole existing rundown off air on upgrade. The operator is warned
   * where the warning can be acted on (the template picker marks the row as
   * needing a re-import), which is the same place the spec puts it.
   */
  /**
   * 🔴 **§12.6 — THE ONE PREDICATE: is another item carrying a MULTI-BOX template already
   * on air on this channel?**
   *
   * The client's requirement is *"a switch between the multi-box layouts, with exactly ONE
   * active at a time, so the operator cannot make a mistake"* (`design.md` §0.1). §8 measured
   * that two multi-box templates on air together is reachable TODAY, by two doors — a take
   * (`#planLiveSeating` allocates a second template's plates AROUND the first's rather than
   * refusing) and a restore (`#decidePendingRestores` adopts every retained on-air item with
   * no cap). There is no mutual-exclusion primitive anywhere in the tree to build the rule
   * out of, so this is it.
   *
   * ── ONE PREDICATE, TWO CALL SITES, AND WHY THAT IS THE WHOLE DECISION ───────
   *
   * Restore **never passes through `take()`**, so the refusal has two sites by necessity.
   * `CLAUDE.md` golden rule 6 is written about exactly this shape: the second site must CALL
   * this, never re-derive the condition locally, because *"a second local copy is how a name
   * comes to lie about what it tests"*.
   *
   * ⚠ **It is deliberately NOT `hasLivePlates`.** `deps.hasLivePlates`
   * (`apps/runtime/src/renderer/features/layers/layerRowActions.ts:655`) is a RENDERER fact
   * about one row's template DECLARING plates. This is a BRIDGE fact about the on-air SET.
   * §8 offers that name as the tree's nearest existing shape, not as the predicate; reusing
   * it for a different condition is the failure golden rule 6 forbids.
   *
   * ── THE THREE TERMS, EACH ANSWERED BY THE ONE THING THAT OWNS IT ────────────
   *
   * - **"on air"** — {@link isOnAirStatus}, the canonical status predicate, reused rather
   *   than re-spelled. Its own comment says unknown must count as on air in every gate
   *   whose failure mode is acting on a live graphic. This is such a gate.
   * - **"on this channel"** — `#slots`, the single source of where an item's template lives.
   *   Two multi-box templates on DIFFERENT channels do not compete for one output.
   * - **"multi-box"** — {@link multiBoxCount} below.
   *
   * Returns the INCUMBENT rather than a boolean, because the refusal has to be able to name
   * what is already on air (`design.md` §12.6's refusal-family discipline). A bare `true`
   * would send the operator hunting.
   */
  #multiBoxItemOnAirOnChannel(
    channel: number,
    exceptItemId: string,
  ): { itemId: string; templateId: string; boxes: number } | null {
    for (const item of this.#reconciler.snapshot()) {
      if (item.itemId === exceptItemId) continue;
      if (!isOnAirStatus(item.status, item.pending)) continue;
      if (this.#slots.get(item.itemId)?.channel !== channel) continue;
      const boxes = this.#multiBoxCount(item.templateId);
      if (boxes > 1) return { itemId: item.itemId, templateId: item.templateId, boxes };
    }
    return null;
  }

  /**
   * How many BOXES a template declares — 0 when it declares none, and 0 when nothing can
   * say.
   *
   * A box IS a Live Source plate (`design.md` §0.5: `plateId` IS the `routeKey`); an
   * arrangement positions box INSTANCES and does not change how many there are. So the
   * count is the carrier's declaration length, and `> 1` is what "multi-box" means.
   *
   * ⚠ **`'unknown'` counts as 0, and that is the same call `#planLiveSeating` already
   * makes** for the same reason, written up in its header: a template imported before the
   * carrier existed cannot be read, the great majority have no holes, and treating them as
   * multi-box would refuse a station's whole existing rundown on upgrade. Such a template
   * also seats NO plates at all, so it is not an incumbent whose boxes this rule protects.
   * The operator is warned where the warning can be acted on — the template picker marks
   * the row as needing a re-import.
   */
  /*
    ⭐ §14 (LOOKS) phase 3 — VERIFIED UNCHANGED, AND HERE IS THE DRIFT TO REFUSE.

    Under LOOKS the carrier's `sources` IS the multi-frame group's declaration list —
    source-keyed, one entry per declared source — so this already counts the GROUP and never
    the retired arrangements. Nothing had to move.

    🔴 What a later reader will be tempted to do is count the ACTIVE LOOK's rects instead
    ("only one box is showing, so this is not a multi-box template"). That is wrong, and the
    failure is delayed rather than immediate: a row parked on a solo look would stop being an
    incumbent, a second multi-box template would be allowed on air beside it, and the
    collision would arrive later — when somebody switched the first row back to six boxes,
    with both templates already playing. Exclusivity is a property of what a template CAN put
    on the channel, which is its declaration, and a look switch must never change the answer.
  */
  #multiBoxCount(templateId: string): number {
    const template = this.#templates.get(templateId);
    if (template === null || template === undefined) return 0;
    if (liveSourceCarrierState(template) !== 'declared') return 0;
    return template.liveSources?.sources.length ?? 0;
  }

  /**
   * §12.6 — the refusal itself, in the refusal family's words, or `null` when the item may
   * proceed.
   *
   * Both call sites get the SAME sentence from here, so the two doors cannot describe one
   * rule differently. It names BOTH halves — what is already on air and what was refused —
   * because a refusal that names neither is a dead end at the moment the operator is under
   * time pressure.
   */
  #refuseSecondMultiBox(
    itemId: string,
    templateId: string,
    channel: number,
  ): { errorCode: string; message: string } | null {
    // Only a multi-box arrival can collide: a lower-third over a live 3-box is ordinary
    // stacking, not the crosstalk this refuses.
    //
    // ⚠ `templateId` is a PARAMETER rather than looked up from the reconciler, because the
    // restore door asks this question BEFORE the item exists there. A lookup would answer
    // `undefined` at that site and silently let every restore through — the refusal would
    // be present, wired, and dead on the door that has no other cover.
    if (this.#multiBoxCount(templateId) <= 1) return null;
    const incumbent = this.#multiBoxItemOnAirOnChannel(channel, itemId);
    if (incumbent === null) return null;
    return {
      errorCode: 'multibox-already-on-air',
      message:
        `exactly one multi-box template may be on air per channel: "${incumbent.templateId}" ` +
        `(${String(incumbent.boxes)} boxes, item "${incumbent.itemId}") is already on air on ` +
        `channel ${String(channel)} — take it off air first`,
    };
  }

  #planLiveSeating(
    itemId: string,
    slot: CommandSlot,
    desired: Readonly<Record<string, LiveSourceRect>>,
    /**
     * WHICH plates an unresolvable assignment may refuse this action over.
     *
     * `'all-declarations'` — the TAKE. Every look the template can reach is answered here,
     * where a refusal costs nothing, so a plate that is one picker click from being on
     * screen cannot refuse DURING a live switch with the previous look already leaving.
     *
     * `'desired-only'` — a LIVE switch or swap. 🔴 The row is on air and the operator is
     * usually repairing something. Only a plate that must be seated ANEW may refuse: one
     * this look does not show cannot, and — the case that matters most — neither can one that
     * is ALREADY ON SCREEN. A plate whose assignment disappeared under it is still a working
     * picture; refusing the operator's repair of a different box over it, or tearing it down,
     * would both be worse than leaving it exactly where it is.
     */
    scope: 'all-declarations' | 'desired-only',
  ): LiveSeatingPlan {
    const templateId = this.#reconciler.get(itemId)?.templateId ?? itemId;
    const template = this.#templates.get(templateId);
    const carrier = template === null ? undefined : template.liveSources;
    if (
      template === null ||
      carrier === undefined ||
      liveSourceCarrierState(template) !== 'declared'
    )
      return {
        ok: true,
        placements: [],
        resolved: new Map(),
        offFrame: new Set(),
        declared: new Set(),
        unresolved: new Set(),
      };

    // 6.7 — ALL-OR-NOTHING, and it refuses before any geometry is computed: a
    // layout with one unfilled hole is the silent-empty-hole outcome reached by a
    // different road.
    const declared = new Set(carrier.sources.map((d) => d.sourceId));
    const seatedAlready = new Set((this.#liveLayers.get(itemId) ?? []).map((r) => r.sourceId));
    /*
      WHICH PLATES MAY REFUSE THIS ACTION — see `scope`. A take answers for every look the
      template can reach; a live action answers only for what it must put on screen ANEW,
      because a plate already up is a working picture and a plate the look hides is nobody's
      business right now.
    */
    const mustResolve = carrier.sources.filter(
      (d) =>
        scope === 'all-declarations' ||
        (desired[d.sourceId] !== undefined && !seatedAlready.has(d.sourceId)),
    );
    const mustResolveIds = new Set(mustResolve.map((d) => d.sourceId));
    const assignment = resolvePlateAssignments({
      templateId,
      declarations: mustResolve,
      assignments: this.#sourceAssignments,
      catalog: this.#sourceCatalog,
      // R-048 (6.9) — this ROW's substitutions outrank the template assignment.
      // Passed INTO the one resolver rather than applied after it, so a swapped
      // plate and an assigned plate cannot be resolved by two different rules.
      overrides: this.#sourceOverrides.get(itemId),
    });
    if (!assignment.ok)
      return { ok: false, errorCode: assignment.errorCode, message: assignment.message };

    /*
      §14 (LOOKS) phase 3 — WHAT RESOLVES, WHAT MAY REFUSE, AND WHAT IS SIMPLY LEFT ALONE.

      The all-or-nothing resolution above covers `mustResolve` — the plates this action has to
      put on screen anew. Everything else is resolved here ONE AT A TIME and TOLERANTLY,
      through the SAME resolver, because two other groups still need their producer known
      without being able to refuse anything:

      - plates the look does not show, whose producer FORM decides §12.4's hold-vs-teardown;
      - plates ALREADY ON SCREEN, which must keep working even if their assignment vanished.

      A plate that resolves nowhere is recorded in `unresolved` and the apply leaves it exactly
      as it is — not re-fitted, not held, not torn down. "I cannot tell what this is" is not a
      licence to change anything about it.
    */
    const byPlate = new Map<string, ResolvedPlate>();
    for (const plate of assignment.plates) byPlate.set(plate.declaration.sourceId, plate);
    for (const declaration of carrier.sources) {
      if (byPlate.has(declaration.sourceId)) continue;
      const one = resolvePlateAssignments({
        templateId,
        declarations: [declaration],
        assignments: this.#sourceAssignments,
        catalog: this.#sourceCatalog,
        overrides: this.#sourceOverrides.get(itemId),
      });
      const plate = one.ok ? one.plates[0] : undefined;
      if (plate !== undefined) byPlate.set(declaration.sourceId, plate);
    }

    const resolved = new Map<string, SourceProducer>();
    const offFrame = new Set<string>();
    const unresolved = new Set<string>();
    const fitted: { plateId: string; producer: SourceProducer; fit: LivePlatePlacement['fit'] }[] =
      [];
    for (const declaration of carrier.sources) {
      const plateId = declaration.sourceId;
      const plate = byPlate.get(plateId);
      if (plate === undefined) {
        unresolved.add(plateId);
        continue;
      }
      // 6.3 — the fit aspect through §3a's chain, which is also where the author's
      // assertion is VALIDATED against the assigned source.
      const aspect = resolvePlateAspect({
        plateId,
        source: plate.source,
        expectedAspect: declaration.expectedAspect,
      });
      if (!aspect.ok) {
        // A contradicted aspect refuses only where an unresolvable assignment would: on a
        // plate this action must put on screen anew. One already up is a working picture, and
        // an author's assertion disagreeing with a since-edited mapping is not a reason to
        // refuse the operator's repair of a different box.
        if (mustResolveIds.has(plateId))
          return { ok: false, errorCode: aspect.errorCode, message: aspect.message };
        unresolved.add(plateId);
        continue;
      }
      resolved.set(plateId, plate.source.producer);
      // 6.4 (LOOKS) — THE RECT COMES FROM THE DESIRED SET, never from the declaration.
      // `declaration.rect` is the source's rect in the DEFAULT look (`collectLookCarrier`),
      // so reading it here would pin every look to the default's geometry — and because
      // `MIXER FILL` survives a producer swap, the symptom would be a WRONG CROP on a
      // picture that is otherwise perfectly on air. A source with NO entry is absent from
      // this look; the carrier never emits a zero-area rect, so absence is the only
      // spelling of "not shown here".
      const rect = desired[plateId];
      if (rect === undefined) continue;
      const fit = this.liveSourceFitFor({
        channel: slot.channel,
        itemId,
        rect,
        sceneResolution: carrier.resolution,
        carriedDefaultPosition: carrier.defaultPosition,
        sourceAspect: aspect.aspect,
      });
      // 6.4 — a hole ENTIRELY outside the scene rect has an empty mask, and the
      // correct behaviour there is to seat NO PRODUCER AT ALL rather than to emit a
      // zero-area rect. It costs the plate its layer too: allocating one for a
      // producer that will never be sent would burn a layer out of a band that
      // has to hold every other box. Not a refusal — nothing about it is visible
      // on air, so refusing the take would be refusing over an invisible detail.
      if (fit.clip === null) {
        offFrame.add(plateId);
        continue;
      }
      fitted.push({
        plateId,
        producer: plate.source.producer,
        fit: { fill: fit.fill, clip: fit.clip },
      });
    }

    // The EMPTY look is valid and carries an empty map — background alone (`collectLookCarrier`).
    // It is not an early exit from the reconcile: everything the item has seated is still
    // released through the policy below, which is the whole difference between a look with
    // no plates and a template with none.
    if (fitted.length === 0)
      return { ok: true, placements: [], resolved, offFrame, declared, unresolved };

    const range = this.#sourceCatalog.layerRange;
    if (range === undefined) {
      return {
        ok: false,
        errorCode: LIVE_PLATE_NO_RANGE,
        message:
          `this template has ${String(fitted.length)} live plate(s), but no Live Source layer ` +
          `band is declared on this installation — there is nowhere to put a producer. ` +
          `Declare the band in CG Control's source settings, then take again.`,
      };
    }

    /*
      RE-USE THE LAYER A PLATE IS ALREADY ON, and this is not an optimisation.

      A re-take of an item that still owns its layers must land on the SAME
      coordinates. Moving a plate would leave the old layer's producer running
      with nobody's name on it — the ledger (which teardown walks) would now name
      the new layer, so the old picture would sit on air until somebody noticed
      it by eye. The ledger is keyed by itemId, so "already on" is a question this
      method can answer exactly.
    */
    const currentLayer = new Map<string, number>();
    for (const record of this.#liveLayers.get(itemId) ?? []) {
      if (record.slot.channel === slot.channel)
        currentLayer.set(record.sourceId, record.slot.layer);
    }
    const preferred = fitted.map((f) => currentLayer.get(f.plateId));
    /*
      🔴 `ours` IS THE LAYERS THIS PLAN WILL RE-SEAT — **NOT** EVERY LAYER THE ITEM OWNS.

      The distinction did not exist before LOOKS and the code did not have to make it: a take
      seated every declaration, so every ledger record for the item was also in `fitted` and
      the two sets were equal. `new Set(currentLayer.values())` was therefore a correct — and
      cheaper-looking — spelling of "the layers we are re-seating".

      HELD plates broke that invariant, because a held record stays in the ledger while being
      absent from `fitted`. Under the old spelling its layer was still reported AVAILABLE, so
      a plate the new look shows for the FIRST TIME (no `preferred` of its own) was allocated
      straight onto it: the fresh `PLAY` destroyed the held producer with no `CLEAR`, the
      ledger ended up naming one slot twice, and — worst of all — switching BACK found the
      stale held record still matching layer+producer, so `seatUnchanged` fired and nothing
      was ever re-played. The operator's box showed the wrong feed, wrongly cropped and
      silent, permanently, while the ledger and the published state both named the right one.
      Only a re-take repaired it.

      So the available set is derived from `preferred` itself. A held plate's layer is in the
      ledger, `#declaredLayerClass` calls it `'live-source'`, and it is now correctly NOT
      ours to hand out — which is exactly right: holding a plate means holding its layer.
    */
    const ours = new Set(preferred.filter((layer): layer is number => layer !== undefined));
    // A layer carrying a bound template is not free either. `#slots` is that fact's
    // single source, exactly as `#declaredLayerClass` is the single source for the
    // three DECLARED classes — this is the one class it does not cover, because a
    // bound dynamic slot is a runtime allocation rather than a declaration.
    const bound = new Set<number>();
    for (const s of this.#slots.values()) if (s.channel === slot.channel) bound.add(s.layer);

    const layers = allocateLiveLayers({
      range,
      preferred,
      // ⚠ OUR OWN ledgered layers count as AVAILABLE — for this item, and only for the
      // plates this plan is actually re-seating (see `ours` above).
      // `#declaredLayerClass` calls them `'live-source'`, which is correct for every other
      // caller and would here forbid an item from re-seating onto the layer it is using.
      isAvailable: (layer) =>
        ours.has(layer) ||
        (this.#declaredLayerClass(slot.channel, layer) === null && !bound.has(layer)),
    });
    if (layers === null) {
      return {
        ok: false,
        errorCode: LIVE_PLATE_NO_LAYER,
        message:
          `the Live Source layer band ${String(range.start)}-${String(range.end)} has no room ` +
          `for this template's ${String(fitted.length)} live plate(s) on channel ` +
          `${String(slot.channel)}. Clear a graphic that is holding live layers, or widen the ` +
          `band in CG Control's source settings.`,
      };
    }

    return {
      ok: true,
      resolved,
      offFrame,
      declared,
      unresolved,
      placements: fitted.map((f, i) => ({
        slot: { channel: slot.channel, layer: layers[i] as number },
        plateId: f.plateId,
        producer: f.producer,
        fit: f.fit,
      })),
    };
  }

  /**
   * `multibox-layout-switch` §14 (LOOKS) phase 3 — **which LOOK is this item showing.**
   *
   * `undefined` when the template authors none — a pre-LOOKS template, or one whose
   * carrier predates the field. That is a THIRD answer and not "the first look": a
   * template with no looks has one fixed set of rects, and pretending it has a look would
   * make `#desiredPlateRects` answer from an empty rect map and release every plate.
   *
   * An item that has never switched resolves to the AUTHORED DEFAULT (`defaultLookId`),
   * because exactly one look is always active (§14.5): `#activeLooks` records a DEPARTURE
   * from that default, so a fresh take needs no write to enter the right one. The final
   * `?? looks[0]` is the same tolerant read `defaultLookOf` makes — a carrier whose
   * `defaultLookId` names nothing is a broken import, and refusing to show anything at all
   * would be a worse answer than showing the first look.
   */
  #activeLookOf(itemId: string): TemplateLook | undefined {
    const templateId = this.#reconciler.get(itemId)?.templateId ?? itemId;
    const carrier = this.#templates.get(templateId)?.liveSources;
    const looks = carrier?.looks;
    if (looks === undefined || looks.length === 0) return undefined;
    // A recorded id that names nothing is STALE (the template was re-imported with different
    // looks), and the honest fallback is the template's AUTHORED default — never array order,
    // which is what a fresh take would enter and what the operator expects to see.
    const wanted = this.#activeLooks.get(itemId) ?? carrier?.defaultLookId;
    return (
      looks.find((l) => l.id === wanted) ??
      looks.find((l) => l.id === carrier?.defaultLookId) ??
      looks[0]
    );
  }

  /** §14 phase 3 — the look this item is showing, for a caller that only needs the id. */
  activeLookId(itemId: string): string | undefined {
    return this.#activeLookOf(itemId)?.id;
  }

  /**
   * 🔴 **THE ONE ANSWER to "which rect does each of this item's plates have RIGHT NOW" —
   * the DESIRED set `reconcileLivePlates` reconciles against.**
   *
   * Two carriers, one shape. A LOOKS template answers from the active look's `rects`; a
   * pre-LOOKS one answers from the declarations, whose `rect` is the only geometry it has.
   * Both produce `{routeKey → rect}` and every caller downstream sees exactly one kind of
   * input — which is what lets the take, the switch and the swap share one reconcile
   * instead of each learning which carrier it is looking at.
   *
   * ⚠ A source ABSENT from the returned map is absent from the look. `collectLookCarrier`
   * guarantees the carrier never emits a zero-area rect for a hidden plate, so absence is
   * the only spelling and the reconcile can read it without ambiguity.
   */
  #desiredPlateRects(itemId: string): Record<string, LiveSourceRect> {
    const templateId = this.#reconciler.get(itemId)?.templateId ?? itemId;
    const carrier = this.#templates.get(templateId)?.liveSources;
    if (carrier === undefined) return {};
    const look = this.#activeLookOf(itemId);
    if (look !== undefined) return { ...look.rects };
    return Object.fromEntries(carrier.sources.map((s) => [s.sourceId, s.rect] as const));
  }

  /**
   * `multibox-layout-switch` §14.5 / `tasks.md` 6.1 — **SWITCH A ROW TO A DIFFERENT LOOK,
   * while it is on air.**
   *
   * The bridge half of the switch, and the door stage E's look picker calls. It records
   * which look the row is showing and reconciles the live plates against that look's
   * rects — holes and fits move, seats do not (see {@link reconcileLivePlates}).
   *
   * ⚠ **THE PAGE'S HALF IS NOT WIRED YET, AND THIS METHOD DOES NOT PRETEND OTHERWISE.**
   * A look switch is TWO mutations on two machines: the bridge moves the producers'
   * `MIXER FILL`/`CLIP` (here), and the PAGE flips which look's instance is visible and
   * re-punches its holes (`@cg/template-runtime`'s own `setActiveLook`, landed in phase
   * 1D). There is no transport between them — the served page learns nothing from a `CG
   * UPDATE` today — so on the plant this call currently moves the fills while the page
   * keeps punching the outgoing look's holes. Wiring that transport is its own decision
   * (a reserved field in the update payload, and what a page that ignores it should do),
   * and it belongs with the operator surface rather than being invented here.
   *
   * An OFF-AIR item with nothing seated is a legal target, exactly as `swapLiveSource`'s
   * is: the look is recorded, nothing is sent, and the next take enters it. Deliberately not
   * gated on reachability in that case — it is a list edit, not an on-air action. ⚠ The test
   * is the row's STATUS, never an empty ledger: an on-air row can have an empty ledger (the
   * empty look; every plate a torn-down clip), and treating that as "not on air" told the
   * operator a switch had succeeded while every hole stayed dark.
   */
  async setActiveLook(
    itemId: string,
    lookId: string,
  ): Promise<{ ok: boolean; reason?: string; message?: string }> {
    const templateId = this.#reconciler.get(itemId)?.templateId;
    if (templateId === undefined || this.#slots.get(itemId) === undefined) {
      return { ok: false, reason: 'unknown-item', message: 'That item is not on the stack.' };
    }
    const looks = this.#templates.get(templateId)?.liveSources?.looks ?? [];
    const look = looks.find((l) => l.id === lookId);
    if (look === undefined) {
      return {
        ok: false,
        reason: 'unknown-look',
        message: `This template has no look called "${lookId}".`,
      };
    }
    // Recorded BEFORE the reconcile, and it stays recorded even if the reconcile refuses.
    // The look is what the operator asked this row to show; a failed AMCP send is a fact
    // about the wire. Rolling the intent back would leave the next take entering the OLD
    // look with nothing anywhere saying why.
    this.#activeLooks.set(itemId, lookId);
    /*
      🔴 "IS THIS ROW ON AIR" IS ASKED OF THE STATUS, NOT OF THE LEDGER.

      This tested `the ledger is empty` and called it "nothing is seated, so recording the
      look IS the whole action". An empty ledger is NOT the same fact: `registerLiveLayers`
      DELETES an item's entry when its record list is empty, and two ordinary on-air paths
      reach that state — a row taken on the EMPTY look (valid, background alone), and a row
      whose plates were all `media` clips that §12.4's named fallback tore down on the way
      out of a look. Both are unambiguously on air.

      Under the old spelling such a row was told `ok` while NOTHING was sent: every hole in
      a populated look stayed empty, the reachability refusal below was skipped too, and only
      a re-take — a cut — repaired it. That is 6.7's "designed layout with a hole in it"
      reached with no refusal and no message.

      Golden rule 6, in the file that lectures about it 300 lines up: reuse the ONE canonical
      predicate rather than deriving a second local spelling of "on air". The ledger check
      stays, but only for what it genuinely answers — an OFF-AIR row with no seats has nothing
      to reconcile, so recording the look really is the whole action there.
    */
    const item = this.#reconciler.get(itemId);
    const onAir = item != null && isOnAirStatus(item.status, item.pending);
    if (!onAir && (this.#liveLayers.get(itemId) ?? []).length === 0) return { ok: true };
    if (this.#noServerReachable()) {
      return {
        ok: false,
        reason: 'disconnected',
        message:
          'Not connected to CasparCG — the look was recorded but the live sources were not ' +
          'moved. Reissue it once the server is back.',
      };
    }
    const reconciled = await this.reconcileLivePlates(itemId, this.#desiredPlateRects(itemId), {
      mode: 'live',
    });
    if (reconciled.ok) return { ok: true };
    return {
      ok: false,
      ...(reconciled.errorCode === undefined ? {} : { reason: reconciled.errorCode }),
      ...(reconciled.message === undefined ? {} : { message: reconciled.message }),
    };
  }

  /**
   * `multibox-layout-switch` `design.md` §4 / `tasks.md` 6.1 — **THE ONE RECONCILE:
   * bring the seated live-plate set of a RUNNING row into line with a freshly-resolved
   * DESIRED set.**
   *
   * §4's whole argument, in one method. A **look switch** changes _which plates are
   * visible and where_; a **source swap** changes _what one plate shows_; a **take** is
   * the same thing against an empty prior set. All three are one question — "which
   * producer is behind which hole, at what geometry" — and the tree used to answer it in
   * two places that each knew half of it (`#seatLiveLayers`: every plate, take only;
   * `swapLiveSource`: one plate, live). `swapLiveSource` already argued the case one level
   * down — _"a swap that resolved plates its own way would be a second spelling"_ — and
   * this is that argument applied one level up, so the switch never becomes a third path.
   *
   * ── THE INPUT: `desired` IS THE ACTIVE LOOK'S `{routeKey → rect}` ────────────────
   *
   * Nothing here reads a layout, an arrangement or a look object. It takes a rect map and
   * reconciles against it, which is what lets the take, the switch and the swap share it
   * without any of them learning the others' vocabulary. 🔴 **A source ABSENT from the map
   * is absent from the look** — the carrier never emits a zero-area rect
   * (`collectLookCarrier`), so absence is the ONLY spelling of "not shown here", and it is
   * what triggers §12.4's release.
   *
   * ── WHY IT IS A DELTA AND NOT A RE-SEAT ─────────────────────────────────────────
   *
   * 🔴 **A plain look switch must issue NO `PLAY` AT ALL.** A `PLAY` creates a fresh
   * producer: on the plant a route re-acquires visibly, so a switch that re-seated would
   * be the very re-acquire §12.4 chose "held" to avoid. Every plate whose seat is
   * unchanged — same layer, same producer — gets `MIXER FILL`/`CLIP` and nothing else. The
   * seat is preserved by construction rather than by a special case: `#planLiveSeating`
   * prefers the layer a plate is already on, and a held plate is still in the ledger, so
   * it is still preferred.
   *
   * ── THE TWO MODES — ONE FACT, READ ONCE, GATING BOTH BEHAVIOURS ─────────────────
   *
   * `mode` says what the ACTION IS, not what it should do, because two behaviours follow
   * from the same fact and letting a caller set them independently is how they would come
   * to disagree (golden rule 7's shape: one condition, read once).
   *
   * - `'take'` — **the row is being put on air, from nothing.**
   *   - _Re-asserts every plate._ 🔴 A re-take is the OPERATOR'S REPAIR VERB. The ledger is
   *     a CLAIM, not a confirmation — nothing tracks live-layer liveness the way `#loaded`
   *     tracks the CG producer (B-039) — so a plate whose producer the server has since
   *     destroyed is indistinguishable here from a healthy one. A take that sent nothing
   *     for it would leave the operator's one repair action doing nothing at all.
   *   - _Rolls back everything on failure._ Nothing is on air yet, and the failure modes
   *     are a producer with no geometry (a guest blown up across the programme, unmasked)
   *     and a fill without its clip (renders nothing at all — `design.md` §3). A layer in
   *     either state is worse than a layer left black, so every layer this action touched
   *     comes down and the take is refused.
   * - `'live'` — **a switch or a swap on a row ALREADY ON AIR.**
   *   - _Delta only._ 🔴 A plate whose seat has not changed gets NO `PLAY`. Re-seating
   *     would create a fresh producer, and on the plant a route re-acquires visibly — the
   *     very re-acquire §12.4 chose "held" to avoid. This is what makes a look switch move
   *     holes and fits and nothing else.
   *   - _Undoes only the plate that failed._ Rolling back would mean blacking plates that
   *     are working, to punish a plate that is not. Destructive only if this action CREATED
   *     the plate: a REPLACE that failed left the previous producer on the layer untouched,
   *     which is `B-126`'s rule and is exactly what `swapLiveSource` promises the operator.
   */
  async reconcileLivePlates(
    itemId: string,
    desired: Readonly<Record<string, LiveSourceRect>>,
    opts: { mode: 'take' | 'live' },
  ): Promise<{ ok: boolean; errorCode?: string; message?: string }> {
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { ok: false, errorCode: 'unknown-item' };
    const plan = this.#planLiveSeating(
      itemId,
      slot,
      desired,
      opts.mode === 'take' ? 'all-declarations' : 'desired-only',
    );
    if (!plan.ok) return { ok: false, errorCode: plan.errorCode, message: plan.message };
    return this.#applyLivePlates(itemId, plan, opts.mode);
  }

  /**
   * C-015 phase 6 (task 6.0) — **THE ASSEMBLY, HALF TWO: put the pictures on the
   * layers, and record what was actually sent** — now the SEND half of the §4
   * reconcile above.
   *
   * ⚠ **WHY THE RECONCILE IS TWO HALVES A CALLER CAN USE SEPARATELY, rather than one
   * call the take also makes.** The take's ordering is an on-air constraint, written up
   * at both of its call sites: it DECIDES before the pre-roll `CG ADD` (so a refusal
   * costs nothing and mutates nothing) and SENDS one command before the `CG PLAY` (so a
   * guest's picture is never on the programme channel while the operator cues ahead).
   * Collapsing those into one call would move the refusal AFTER the `CG ADD` had already
   * replaced the stage — a mutation on a take the operator was told did not happen. So
   * the take calls `#planLiveSeating` and this, in that order, with its own work between;
   * `reconcileLivePlates` is the same two halves composed for callers with no such
   * constraint. There is ONE planner and ONE applier, and no third path.
   *
   * Per plate SEATED, in one batch on one connection:
   *
   *   1. `PLAY <ch>-<layer> <producer>` — {@link CommandBuilder.playSource};
   *   2. `MIXER <ch>-<layer> VOLUME 0` — **6.5, immediately after and before the
   *      layer can be composited.** The producer does not exist before the `PLAY`,
   *      so "same batch" is the strongest guarantee available here; this is the
   *      half of the audio rule that belongs to creation itself rather than to a
   *      later step (design.md §7);
   *   3. `MIXER … FILL` + `MIXER … CLIP` — {@link CommandBuilder.mixerFit}, which
   *      emits both from one geometry so they can never be set apart.
   *
   * A plate whose seat is UNCHANGED gets step 3 alone, and only when the geometry
   * actually moved — see the delta note on {@link reconcileLivePlates}.
   *
   * The ledger is written with `sourceArgument` — the SAME function `playSource`
   * uses — so `producer` records what went on the wire rather than a second
   * formatting of the same config.
   *
   * ── THE FAILURE PATH, WHICH IS THE PART WORTH READING ──────────────────────
   *
   * 🔴 **Under `'take'`, any failure rolls back EVERY layer this action
   * touched, including one the item already owned.** The instinct is to keep a
   * previously-on-air box up, and it is wrong for a take: the half-placed layer comes
   * down and the take is refused, for the reasons on {@link reconcileLivePlates}.
   *
   * The record is pushed BEFORE its send is awaited, deliberately: from the moment
   * a `PLAY` leaves this process a producer may be on that layer, so a rollback
   * that walked only the ACKED sends would leave a live picture nobody owns and
   * nothing would ever clear it.
   *
   * On refusal the ledger is restored to the layers this action never reached, so
   * it keeps naming exactly the coordinates that still carry a producer of
   * ours — which is what the R-009 sweep, the quarantine and the clear refusal all
   * read.
   */
  async #applyLivePlates(
    itemId: string,
    plan: {
      readonly placements: readonly LivePlatePlacement[];
      readonly resolved: ReadonlyMap<string, SourceProducer>;
      readonly offFrame: ReadonlySet<string>;
      readonly declared: ReadonlySet<string>;
      readonly unresolved: ReadonlySet<string>;
    },
    mode: 'take' | 'live',
  ): Promise<{ ok: boolean; errorCode?: string; message?: string }> {
    const { placements, resolved, offFrame, declared, unresolved } = plan;
    const previous = this.#liveLayers.get(itemId) ?? [];
    if (placements.length === 0 && previous.length === 0) return { ok: true };

    /*
      6.5f / 6.9c — THE PLATE'S AUDIO INTENT, READ FROM `#plateVolumes` AND NOT FROM
      THE PREVIOUS LEDGER.

      The intent belongs to the PLATE, so a re-seat carries it: a plate the operator
      deliberately raised must not go silent because its item was re-taken, and a
      plate nobody raised is born muted, which is the rule.

      🔴 It used to be read off `previous` — the ledger records for this item — and
      that was wrong in exactly the case the rule exists for. The ledger is
      destroyed by teardown, so a CLEAR followed by a re-take dropped the intent
      and re-muted the plate with nothing anywhere saying it had happened. The
      intent map outlives both, which is also what lets retention carry it.
    */
    const intent = this.#plateVolumes.get(itemId) ?? {};
    const key = (record: { slot: CommandSlot }): string => adoptionKey(record.slot);
    const same = (a: NormalizedRect, b: NormalizedRect): boolean =>
      a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
    const priorByPlate = new Map(previous.map((r) => [r.sourceId, r] as const));

    /** The ledger this action is building — seated plates first, then the held ones. */
    const next: LiveLayerRecord[] = [];
    /** Records this action actually sent a `PLAY` for — the rollback set. */
    const touched: LiveLayerRecord[] = [];
    let failure: string | undefined;
    let failedPlate:
      | {
          record: LiveLayerRecord;
          prior: LiveLayerRecord | undefined;
          /** Did this plate send a `PLAY` at all (a re-seat), or only geometry (a re-fit)? */
          reseat: boolean;
          playLanded: boolean;
        }
      | undefined;

    for (const placement of placements) {
      const prior = priorByPlate.get(placement.plateId);
      const producer = this.#builder.sourceArgument(placement.producer);
      /*
        🔴 THE DELTA'S ONE QUESTION: is this plate already sitting where it needs to be,
        showing what it needs to show? Layer AND producer, both — the layer alone would
        re-fit a plate whose source had been swapped underneath it, and the producer alone
        would leave a plate re-fitted on a layer it no longer occupies.

        `held` is deliberately NOT part of this comparison. A held plate IS seated; that is
        the whole point of holding it, and all coming back costs is the fit and its volume.

        ⚠ Asked ONLY under `'live'`. A take re-asserts unconditionally — see the mode note
        on {@link reconcileLivePlates}: the ledger cannot tell a healthy producer from one
        the server has destroyed, so the repair verb must send rather than reason.
      */
      const seatUnchanged =
        mode === 'live' &&
        prior !== undefined &&
        key(prior) === key(placement) &&
        prior.producer === producer;

      const record: LiveLayerRecord = {
        slot: placement.slot,
        sourceId: placement.plateId,
        // `'fill'` for every producer form this change can seat. A fill+key PAIR is
        // two layers and is C-021's, blocked on hardware — the role is recorded
        // rather than assumed so the ledger is already shaped for it.
        role: 'fill',
        producer,
        fill: placement.fit.fill,
        clip: placement.fit.clip,
        // `??`, never `||`: a plate whose recorded intent IS 0 must resolve to 0
        // rather than falling through to the default that happens to equal it —
        // the two agree today, and a future non-zero default would make the bug
        // appear in a line nobody edited.
        intendedVolume: intent[placement.plateId] ?? CREATED_MUTED_VOLUME,
      };

      const lines: string[] = [];
      if (seatUnchanged && prior !== undefined) {
        // 6.4 — THE FIT, RE-DERIVED PER LOOK. Emitted only when the geometry actually
        // moved, so an unchanged plate costs the wire nothing; but when it moved this is
        // the ONLY thing that moves it, and getting it wrong is a wrong CROP on a picture
        // that is otherwise perfectly on air — `MIXER FILL` survives a producer swap, so
        // nothing downstream would correct it and nothing would look broken.
        if (!same(prior.fill, record.fill) || !same(prior.clip, record.clip)) {
          lines.push(...this.#builder.mixerFit(placement.slot, placement.fit));
        }
        // A plate coming back from HELD was muted by the hold, so its intent has to be
        // re-asserted or a deliberately-raised source returns silent — the same fault
        // 6.9c names for the swap, arriving by the look switch instead.
        if (prior.held === true) {
          lines.push(this.#builder.mixerVolume(placement.slot, record.intendedVolume));
        }
      } else {
        lines.push(
          this.#builder.playSource(placement.slot, placement.producer),
          this.#builder.mixerVolume(placement.slot, record.intendedVolume),
          ...this.#builder.mixerFit(placement.slot, placement.fit),
        );
        touched.push(record);
      }

      next.push(record);
      /*
        🔴 WHETHER THE `PLAY` LANDED IS A FACT THE FAILURE PATH CANNOT RECONSTRUCT LATER,
        so it is captured HERE, at the only moment it is knowable.

        A re-seat sends three things and any of them can be refused. If the `PLAY` was
        acked and the `MIXER` after it was not, the layer carries the NEW producer while
        the geometry is still the old one — and a failure path that assumed "a failed
        re-seat left the previous producer alone" would write the PREVIOUS producer into
        the ledger and pin the wrong feed on air with nothing anywhere disagreeing.
        `lines[0]` is the `playSource` whenever this is a re-seat; a re-fit sends no
        producer at all, so there is nothing to have landed.
      */
      const reseat = !seatUnchanged;
      let playLanded = false;
      for (const [i, line] of lines.entries()) {
        // Urgent lane: seating runs inside a take, and a take does not queue
        // behind a load.
        const sent = await this.#send(line, this.#nextSeq(), 'urgent');
        if (sent.ok) {
          if (reseat && i === 0) playLanded = true;
          continue;
        }
        failure = sent.errorCode ?? 'amcp-error';
        failedPlate = { record, prior, reseat, playLanded };
        break;
      }
      if (failure !== undefined) break;
    }

    if (failure !== undefined) {
      if (mode === 'take') {
        for (const record of touched) {
          await this.#send(this.#builder.out(record.slot), this.#nextSeq(), 'urgent');
          await this.#send(this.#builder.mixerClear(record.slot), this.#nextSeq(), 'urgent');
        }
        const rolledBack = new Set(touched.map(key));
        this.registerLiveLayers(
          itemId,
          previous.filter((record) => !rolledBack.has(key(record))),
        );
        return { ok: false, errorCode: failure };
      }
      /*
        LIVE — undo the ONE plate that failed and leave every other plate exactly as it is.
        The row is on air; blacking working boxes to punish a failing one is the opposite of
        what the operator needs in that minute.

        ── THE TWO QUESTIONS, AND THE ONE FACT THAT ANSWERS BOTH ────────────────────

        This branch used to ask "did this PLATE have a prior record?" and use the answer for
        everything. That is the wrong axis twice over:

        - It is not "did this ACTION create the producer that is on this SLOT". A plate that
          MOVED layers (the band was re-declared under an on-air row — `setSourceCatalog`
          permits that) has a prior record on a DIFFERENT slot, so the old spelling read
          "replace" and left a freshly-created, UNMASKED producer on the new layer that the
          ledger did not name. Nothing would ever clear it.
        - It is not "is the previous producer still on the layer". That is true only when the
          `PLAY` itself was refused. When the `PLAY` was ACKED and the `MIXER` after it was
          not, the layer carries the NEW producer — and writing the PRIOR record back pinned
          the wrong feed on air with the ledger, the published state and the operator all
          agreeing about the wrong thing.

        So the destructive step and the ledger entry are both decided from ONE evaluation of
        the same fact, read once (golden rule 7): did this action put a producer on a slot
        that nothing of ours already occupied?
      */
      const failed = failedPlate;
      const replacedInPlace =
        failed !== undefined &&
        failed.prior !== undefined &&
        key(failed.prior) === key(failed.record);
      let tornDown = false;
      if (failed !== undefined && !replacedInPlace) {
        /*
          Nothing of ours was on this slot before this action, so there is no previous
          picture to protect and `B-126`'s rule does not apply. A producer may nonetheless be
          there — a `PLAY` that left this process may have taken effect even when its ack did
          not — and its `MIXER FILL`/`CLIP` never landed, so it would be a live input at FULL
          FRAME with no mask: a guest blown up across the programme. That is worse on air than
          black, which is the same judgement the take's rollback makes.
        */
        await this.#send(this.#builder.out(failed.record.slot), this.#nextSeq(), 'urgent');
        await this.#send(this.#builder.mixerClear(failed.record.slot), this.#nextSeq(), 'urgent');
        tornDown = true;
      }

      /*
        WHAT THE LEDGER KEEPS FOR THE FAILED PLATE — decided from what actually reached the
        layer, because the ledger's whole job is to name what is on air.

        The sends for one plate go out in a fixed order and the loop stops at the FIRST
        refusal, which makes the state after a failure knowable rather than guessed:

        - **A re-seat whose `PLAY` was refused.** Nothing after it was sent either, so the
          layer still carries exactly what it carried before — producer AND geometry. The
          PRIOR record is the honest entry, and no `CLEAR` precedes anything (`B-126`): the
          operator is told the plate is still on its previous source, and it is.
        - **A re-seat whose `PLAY` LANDED.** The layer now carries the NEW producer even
          though the `MIXER` after it was refused. Writing the prior record back would pin the
          wrong feed on air with the ledger, the published state and the operator all agreeing
          about something that is not true. The record this action built is kept.
        - **A re-fit (no `PLAY` at all).** The producer never changed; a `FILL` or `CLIP` was
          refused, so the geometry is partially applied and is not the prior geometry either.
          The ATTEMPTED record is kept so that re-issuing the same switch computes a real
          delta and REPAIRS it — reverting to the prior geometry made the retry a no-op and
          left the plate black.
      */
      const revertToPrior =
        failed !== undefined && replacedInPlace && failed.reseat && !failed.playLanded;
      const settledFailed =
        failed === undefined
          ? []
          : tornDown
            ? []
            : revertToPrior && failed.prior !== undefined
              ? [failed.prior]
              : [failed.record];
      /*
        Every other record this action built stands, unioned by SLOT with what we already
        owned — nothing may leave the ledger while a producer of ours may still be on it,
        because the ledger is the only thing teardown and the R-009 sweep walk. Plates after
        the failing one were never processed, a moved plate's vacated layer is still ours, and
        the release policy never ran; all of those coordinates come back through `stranded`.

        ⚠ A moved plate is transiently in the ledger TWICE, under one `sourceId` on two slots.
        That is deliberate and is the safe direction — ownership of both coordinates outlives
        a dead socket, and the next successful reconcile's slot-keyed sweep clears the vacated
        layer.

        🔴 THE ORDER IS THE ITEM'S PREVIOUS ORDER, with genuinely new slots appended. Record
        ORDER is not a behaviour this change may alter — callers index the list — and it also
        carries a meaning worth keeping: `priorByPlate` and `currentLayer` are last-wins Maps,
        so for a plate that appears twice the LATER entry wins, and appending the new slot
        after the old one makes the freshly settled record the one the next reconcile reads
        as `prior`.
      */
      const settled = next
        .filter((r) => failed === undefined || r.sourceId !== failed.record.sourceId)
        .concat(settledFailed);
      const bySlot = new Map<string, LiveLayerRecord>();
      for (const r of previous) bySlot.set(key(r), r);
      for (const r of settled) bySlot.set(key(r), r);
      if (tornDown && failed !== undefined) bySlot.delete(key(failed.record));
      const ordered: LiveLayerRecord[] = [];
      const placedSlots = new Set<string>();
      for (const r of previous) {
        const k = key(r);
        const held = bySlot.get(k);
        if (held === undefined || placedSlots.has(k)) continue;
        ordered.push(held);
        placedSlots.add(k);
      }
      for (const [k, r] of bySlot) if (!placedSlots.has(k)) ordered.push(r);
      this.registerLiveLayers(itemId, ordered);

      /*
        THE HONEST SENTENCE. When the `PLAY` landed and only what followed it was refused, the
        new source IS on air — possibly mis-cropped or at the wrong volume — and a caller that
        told the operator "nothing changed, it is still on its previous source" would be
        describing a row that no longer exists.
      */
      if (failed !== undefined && failed.playLanded && !tornDown) {
        return {
          ok: false,
          errorCode: failure,
          message:
            `plate "${failed.record.sourceId}" IS now on its new source, but CasparCG refused ` +
            `the command that followed it, so its geometry or volume may be wrong. Nothing was ` +
            `cleared — re-issue the change to correct it.`,
        };
      }
      return { ok: false, errorCode: failure };
    }

    /*
      §12.4 / 6.5 — THE RELEASE POLICY, for every plate the desired set does not place.

      HELD by default: the producer stays seated on its band layer, muted and idle, so
      switching back is a cut. It stops being VISIBLE because the page stops punching its
      hole — a different mutation on a different machine, which is why the record survives
      with `held` set rather than being dropped.

      The fallback is NAMED and OBSERVABLE rather than implicit (`releaseLivePlate`), and it
      splits on two independent axes: a plate the template no longer DECLARES has no look
      that could bring it back, and a `media` clip cannot be held idle because it would run
      to its end and come back black.
    */
    const placed = new Set(placements.map((p) => p.plateId));
    const releases: LivePlateRelease[] = [];
    for (const record of previous) {
      if (placed.has(record.sourceId)) continue;
      /*
        🔴 UNRESOLVABLE IS NOT A DISPOSITION. This plate is declared and seated; we simply
        could not say which catalog entry is behind it — usually because a live action only
        resolves what it must put on screen. It keeps its record, its layer, its geometry and
        its audio exactly as they are. Muting it would silence a box that is on screen;
        tearing it down would destroy a working picture over a missing fact.
      */
      if (unresolved.has(record.sourceId)) {
        next.push(record);
        continue;
      }
      const release = releaseLivePlate({
        itemId,
        plateId: record.sourceId,
        producer: resolved.get(record.sourceId),
        // From the CARRIER, never from what this plan happened to resolve — see the note on
        // `declared`. A live action resolves only the plates going on screen, so a held
        // plate is routinely absent from `resolved` while being very much still declared.
        stillDeclared: declared.has(record.sourceId),
        offFrame: offFrame.has(record.sourceId),
      });
      releases.push(release);
      if (release.disposition !== 'held') continue;
      /*
        🔴 `held` RECORDS THAT THE MUTE LANDED, NOT THAT WE INTENDED IT.

        The mute is what makes a hidden plate silent, and `held: true` is also the latch that
        stops it being re-sent on a later switch. Committing the latch without looking at the
        send meant one refused `MIXER VOLUME` left a plate the operator cannot see AUDIBLE on
        air — a voice from a box that is not on screen — and every subsequent switch skipped
        the mute because the record already said held. Nothing would ever retry it.

        So the send is awaited and its result decides the flag. A plate whose mute was refused
        stays `held: false` in the ledger: it is still seated and still off-screen, and the
        very next reconcile tries the mute again. The flag under-claims on failure, which is
        the safe direction — the only thing it costs is a redundant `VOLUME 0` later.
      */
      let muted = record.held === true;
      // Mute on the way out, once — a plate held across two switches must not re-send it —
      // and unconditionally under a take, which re-asserts every layer it owns for the
      // repair reason above.
      if (record.held !== true || mode === 'take') {
        const sent = await this.#send(
          this.#builder.mixerVolume(record.slot, CREATED_MUTED_VOLUME),
          this.#nextSeq(),
          'urgent',
        );
        muted = sent.ok;
      }
      next.push({ ...record, held: muted });
    }

    this.registerLiveLayers(itemId, next);

    /*
      THE ONE SWEEP THAT CLEARS. A layer this item owned and no longer does — torn down by
      the policy above, or left behind because a plate moved to a different layer (a
      re-imported template, a re-declared band). It is ours, it still has our producer on
      it, and nothing else will ever come for it: the ledger no longer names it, so teardown
      will not reach it and the R-009 sweep will not reclaim it (it is not an orphan; it is
      ours). Cleared LAST, after the ledger already names the layers that must survive.

      🔴 Keyed on the SLOT, not on the plate, and that is what makes it total: hold, teardown
      and a layer move all reduce to "is this coordinate still in the ledger", so no
      disposition can invent a fourth way to leave a producer stranded.
    */
    const kept = new Set(next.map(key));
    for (const record of previous) {
      if (kept.has(key(record))) continue;
      await this.#send(this.#builder.out(record.slot), this.#nextSeq(), 'urgent');
      await this.#send(this.#builder.mixerClear(record.slot), this.#nextSeq(), 'urgent');
    }
    // Announced AFTER the wire and the ledger agree, so a subscriber that reads the ledger
    // on this event sees the state the sentence describes.
    for (const release of releases) this.livePlateReleased.emit(release);
    return { ok: true };
  }

  /**
   * R-048 / C-015 phase 6 (6.9 / 6.9a / 6.9b / 6.9c) — **POINT ONE PLATE AT A
   * DIFFERENT SOURCE, WHILE THE TEMPLATE IS ON AIR.**
   *
   * The case is a client requirement: a three-plate template is on air, one input
   * drops, and that plate goes black while the other two are fine. The operator
   * repoints the dead one without taking the graphic off air and without
   * disturbing its neighbours.
   *
   * `sourceId === null` clears the override and puts the plate back on the
   * template's assignment — the same path, run with one fewer substitution. An
   * emergency patch the operator cannot undo is its own trap.
   *
   * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
   *
   * 🔴 **A PER-ITEM OVERRIDE. The template's ASSIGNMENT and the installation's
   * CATALOG are both untouched** — the same shape as the position override, and
   * for a sharper reason: the assignment is shared by every row carrying that
   * template and the catalog is installation-wide, so writing back would make one
   * operator's 20:59 emergency into tomorrow's configuration.
   *
   * 🔴 **A REPLACE, NEVER A CLEAR-THEN-ADD.** `PLAY` on the occupied layer
   * substitutes the producer in place. A `CLEAR` followed by a `PLAY` that fails
   * is the `B-126` window arriving during an emergency: a destructive step
   * committed before the constructive one was known to succeed, leaving the
   * operator with a BLACK plate where they had a merely-dead one. On failure the
   * previous producer stays, the ledger is unchanged, the override is NOT
   * recorded, and the row is told — a state that claimed the new source while the
   * layer carried the old would be worse than the failure.
   *
   * ⚠ **THAT SUBSTITUTION IS UNVERIFIED ON THE PLANT'S 2.3.2 (task 6.9a).** The
   * mock models `PLAY` on an occupied layer as a replace, so the tests prove this
   * code is self-consistent and prove NOTHING about the server. It rides with
   * §3b's `DEFER`/`COMMIT` question and 6.3a's `CLIP` probe — all AMCP probes on
   * the same build.
   *
   * ── THE THREE THINGS THAT TRAVEL WITH IT ───────────────────────────────────
   *
   * 1. **The FIT (6.9b), in the same action.** The new source may carry a different
   *    format, so crop-to-fill re-derives through §3a's chain — including its
   *    refusal, so a substitution the author's `expectedAspect` contradicts is
   *    refused rather than silently cropping a face. Not a second operator step:
   *    under pressure a second step is a step that does not happen.
   * 2. **The AUDIO INTENT (6.9c).** Every bridge-created producer is born muted,
   *    so a deliberately-raised plate would go SILENT at the moment the operator
   *    was fixing it. The intent belongs to the PLATE (`LiveLayerRecord.intendedVolume`),
   *    not to the producer instance, and the swap re-asserts it.
   * 3. **The OVERRIDE ITSELF, across a bridge restart (6.9d)** — carried by the
   *    published state into the browser's retention, which is where `#positions`
   *    already goes.
   *
   * An item with no live layers seated yet is a legal target: the override is
   * recorded, nothing is sent, and the next take resolves through it.
   */
  async swapLiveSource(
    itemId: string,
    plateId: string,
    sourceId: string | null,
  ): Promise<{ ok: boolean; reason?: string; message?: string }> {
    const templateId = this.#reconciler.get(itemId)?.templateId;
    if (templateId === undefined || this.#slots.get(itemId) === undefined) {
      return { ok: false, reason: 'unknown-item', message: 'That item is not on the stack.' };
    }
    const template = this.#templates.get(templateId);
    const declaration = template?.liveSources?.sources.find((s) => s.sourceId === plateId);
    if (declaration === undefined) {
      return {
        ok: false,
        reason: 'unknown-plate',
        message: `This template has no live plate called "${plateId}".`,
      };
    }
    const source =
      sourceId === null
        ? null
        : (this.#sourceCatalog.sources.find((s) => s.id === sourceId) ?? null);
    if (sourceId !== null && source === null) {
      return {
        ok: false,
        reason: 'unknown-source',
        message: `This installation has no live source with the id "${sourceId}".`,
      };
    }

    const current = this.#sourceOverrides.get(itemId) ?? {};
    const next: Record<string, string> = { ...current };
    if (sourceId === null) delete next[plateId];
    else next[plateId] = sourceId;

    const record = (this.#liveLayers.get(itemId) ?? []).find((r) => r.sourceId === plateId);
    if (record === undefined) {
      // Nothing seated for this plate — the item is not on air, or its hole is
      // off-frame. Recording the override IS the whole action; the next take
      // resolves through it. Deliberately not gated on reachability: this is a
      // list edit, exactly like setting a position on an idle row.
      this.#applySourceOverride(itemId, next);
      return { ok: true };
    }

    if (this.#noServerReachable()) {
      return {
        ok: false,
        reason: 'disconnected',
        message:
          'Not connected to CasparCG — the swap was refused, not queued. Reissue it once the ' +
          'server is back.',
      };
    }

    /*
      🔴 §4 / 6.3 — THE SWAP IS A CALLER OF THE ONE RECONCILE, NOT A PEER OF IT.

      This method used to resolve, fit, `PLAY`, re-assert and re-ledger one plate itself,
      beside a seating path that did the same for all of them. Its own comment argued
      against exactly that shape one level down — a swap that resolved plates its own way
      would be a second spelling of "which producer is behind this hole" — and `design.md`
      §4 applies the argument one level up: the layout switch must not become a third path
      either, so all three go through `reconcileLivePlates`.

      Everything the old body did survives, because the reconcile does it for every plate:
      the resolution through `resolvePlateAssignments` WITH this override, the fit
      re-derived from §3a's chain (6.9b), the plate's audio intent re-asserted onto the new
      producer (6.9c), the ledger rewritten from what was actually sent — and the REPLACE
      with no `CLEAR` in front of it, which under the reconcile is simply what "the seat
      changed" means (`B-126`). The neighbours are untouched because their seats did not
      change, not because this method walks around them.

      THE OVERRIDE IS WRITTEN FIRST, AND ROLLED BACK ON REFUSAL. The resolver reads
      `#sourceOverrides`, so the prospective value has to be in place for the reconcile to
      resolve through it — and the contract this method has always kept is that a refused
      swap records nothing. Written through the raw map rather than `#applySourceOverride`
      so a refusal never publishes a substitution that did not happen.
    */
    const restore = this.#sourceOverrides.get(itemId);
    if (Object.keys(next).length === 0) this.#sourceOverrides.delete(itemId);
    else this.#sourceOverrides.set(itemId, next);

    const reconciled = await this.reconcileLivePlates(itemId, this.#desiredPlateRects(itemId), {
      // The row is ON AIR — this method's whole reason for existing. A failure must not
      // black the plates that are working; see {@link reconcileLivePlates}.
      mode: 'live',
    });
    if (!reconciled.ok) {
      if (restore === undefined) this.#sourceOverrides.delete(itemId);
      else this.#sourceOverrides.set(itemId, restore);
      return {
        ok: false,
        reason: reconciled.errorCode ?? 'amcp-error',
        message:
          reconciled.message ??
          `CasparCG refused the substitution, so plate "${plateId}" is still on its previous ` +
            `source. Nothing was cleared.`,
      };
    }
    this.#applySourceOverride(itemId, next);
    return { ok: true };
  }

  /** Store (or drop) an item's override map and publish the change. */
  #applySourceOverride(itemId: string, next: Record<string, string>): void {
    // An EMPTY map is no override at all, not an override of nothing: keeping one
    // would publish `sourceOverride: {}` and make a row that is back on its
    // template assignment look substituted.
    if (Object.keys(next).length === 0) this.#sourceOverrides.delete(itemId);
    else this.#sourceOverrides.set(itemId, next);
    this.#markDirty(itemId);
  }

  /**
   * C-015 phase 6 (6.5 / 6.9c) — **the EXPLICIT RECORDED INTENT that raises a
   * plate's audio, and the only thing that may.**
   *
   * The rule is that every producer the bridge creates is created muted and audio
   * is raised only by an explicit intent NAMING THE LAYER. This is that intent for
   * a Live Source plate: it is recorded against the PLATE in the ledger, so it
   * survives a swap (6.9c) and a re-seat, and it is asserted on the wire
   * immediately so the operator hears the result of their own action.
   *
   * ── 6.5f — WHAT THIS RECORDS, AND WHY THERE IS ONLY ONE OF IT ─────────────
   *
   * It writes `#plateVolumes` — the INTENT — and, when a producer is already
   * seated, asserts it on the wire immediately so the operator hears the result of
   * their own action rather than discovering it at the next take.
   *
   * 🔴 **IT DOES NOT ADD AN UNMUTE PATH.** The seating path already asserts each
   * plate's intent on every take, unconditionally, from this same map — that is
   * the plate's exact analogue of `take()`'s unconditional `INTENDED_VOLUME`
   * re-assert, and it is the mechanism the mute half defers to. This method feeds
   * that mechanism; it does not duplicate it. A second spelling of "what volume
   * should this layer have" is the `B-100` / `P-012` failure this project has now
   * paid for five times.
   *
   * ⚠ **A VOLUME OF `0` IS A LEGITIMATE AUTHORED VALUE** — "the operator muted this
   * plate" — and is recorded exactly like any other. It is NOT the absent case,
   * which means "nobody has said" and is what a fresh plate inherits. Every read
   * tests `=== undefined`, never truthiness.
   *
   * IT WORKS ON A ROW THAT IS NOT ON AIR. There is no producer to command, so
   * nothing is sent and the intent simply stands — the next take carries it. That
   * is what makes it possible to arm a plate's audio BEFORE the take instead of
   * having to catch it afterwards, which is the whole operator complaint the mute
   * rule creates.
   */
  async setLivePlateVolume(
    itemId: string,
    plateId: string,
    volume: number,
  ): Promise<{ ok: boolean; reason?: string }> {
    // The PLATE must be one this item's template actually declares. Checked
    // against the declaration rather than against the ledger, so the intent can be
    // armed before anything is seated — the ledger is empty until the take.
    const templateId = this.#reconciler.get(itemId)?.templateId;
    const declared = templateId === undefined ? undefined : this.#templates.get(templateId);
    const plate = declared?.liveSources?.sources.find((x) => x.sourceId === plateId);
    if (plate === undefined) return { ok: false, reason: 'unknown-plate' };
    // `Number.isFinite` first: `NaN >= 0` is false, so a NaN would otherwise fall
    // through the range test and be recorded as an intent nothing can assert.
    if (!Number.isFinite(volume) || volume < 0 || volume > 1)
      return { ok: false, reason: 'invalid-volume' };

    const record = (this.#liveLayers.get(itemId) ?? []).find((r) => r.sourceId === plateId);
    /*
      🔴 A HELD PLATE IS NOT ASSERTED ON THE WIRE — the intent is recorded and applied when a
      look brings the plate back.

      §12.4's hold is "muted and idle": the producer is seated but the active look punches no
      hole for it, so the operator cannot see it. Asserting a raise onto that layer would put
      a VOICE ON AIR from a box that is not on screen — and the hold's mute is a one-shot, so
      nothing would ever take it back down.

      Recording the intent alone is exactly right and needs no new mechanism: the intent
      belongs to the PLATE (6.5f), `#plateVolumes` outlives the ledger, and the reconcile
      re-asserts it at the moment it un-holds the plate. So the operator can arm a held
      source's audio before switching to the look that shows it — which is the same
      before-the-take affordance the mute rule already exists to preserve.
    */
    if (record !== undefined && record.held !== true) {
      if (this.#noServerReachable()) return { ok: false, reason: 'disconnected' };
      const sent = await this.#send(
        this.#builder.mixerVolume(record.slot, volume),
        this.#nextSeq(),
        'urgent',
      );
      if (!sent.ok) return { ok: false, reason: sent.errorCode ?? 'amcp-error' };
      // The ledger's copy is what was SENT, so it is updated only after the send
      // LANDED. A ledger claiming a volume the layer never received would be
      // re-asserted onto every future swap, spreading one failed command into a
      // standing lie about what is audible.
      this.registerLiveLayers(
        itemId,
        (this.#liveLayers.get(itemId) ?? []).map((r) =>
          r.sourceId === plateId ? { ...r, intendedVolume: volume } : r,
        ),
      );
    }

    this.#plateVolumes.set(itemId, { ...this.#plateVolumes.get(itemId), [plateId]: volume });
    this.#markDirty(itemId);
    return { ok: true };
  }

  /** The audio intent for one item's plates, or `undefined` when none is recorded. */
  livePlateVolumes(itemId: string): LivePlateVolumes | undefined {
    return this.#plateVolumes.get(itemId);
  }

  /** Is this exact coordinate a bridge-owned Live Source layer? */
  #isLiveLayer(channel: number, layer: number): boolean {
    return this.#liveLayerKeys().has(adoptionKey({ channel, layer }));
  }

  /**
   * R-028 (6.5) — **WHICH DECLARED CLASS A LAYER BELONGS TO. THE ONE SPELLING.**
   *
   * The model has THREE declared classes, and the danger 6.5 exists for is not
   * that any one of them is implemented wrongly — each has had exactly one source
   * of truth for a while — it is that **nothing enumerated the LIST**. A narrowing
   * written against two of three is not a bug review catches; it is a
   * correct-looking test that silently forbids the missing class. So the list
   * lives here, once, and every arm DELEGATES to that class's existing single
   * source rather than re-deriving it (golden rule 6):
   *
   *   `playout`      — the reserved range from install config (`#reservedSet`).
   *                   Declared as SOMEBODY ELSE'S. Channel-agnostic: a layer
   *                   NUMBER is reserved, because the playout team owns the
   *                   number across the machine.
   *   `live-source`  — a coordinate in the bridge's OWN ledger
   *                   (`#liveLayerKeys`). Declared as OURS, and the only class
   *                   that is a runtime record rather than a static range —
   *                   which is exactly what makes it ownable at all (C-015).
   *   `operator-row` — a layer of the declared bank (`LayerManager.isFixed`).
   *                   Declared as the operator's TERRITORY.
   *
   * ⚠ **"Declared" is NOT a synonym for "not an orphan", and reading it that way
   * is the mistake this function is shaped to prevent.** The three classes make
   * three DIFFERENT claims, and the consumer decides what each is worth:
   * `playout` says the layer is not ours to touch, `live-source` says we put that
   * producer there ourselves, and `operator-row` says only that the operator may
   * USE this layer — it says nothing about what is on it right now. Returning a
   * bare boolean here would have collapsed all three into the strongest one.
   *
   * Order is deliberate and matters where the sets could overlap. `playout` first
   * because the reservation is absolute (the validator refuses a bank that
   * intersects it, so this is defence in depth); `live-source` before
   * `operator-row` because a ledgered coordinate is a fact about a producer we
   * seated, which outranks a fact about a range.
   */
  #declaredLayerClass(
    channel: number,
    layer: number,
  ): 'playout' | 'live-source' | 'operator-row' | null {
    if (this.#reservedSet.has(layer)) return 'playout';
    if (this.#isLiveLayer(channel, layer)) return 'live-source';
    if (this.#layers.isFixed({ channel, layer })) return 'operator-row';
    return null;
  }

  /**
   * Record the Live Source layers an item owns. **Bookkeeping ONLY — this sends
   * no AMCP and creates no producer.**
   *
   * Phase 6.1's `playSource` is what will seat an actual producer and call this
   * with what it sent; the ledger is phase 5's because OWNERSHIP is phase 5's.
   * Keeping the write path here (rather than inventing it inside a phase-6 verb)
   * is what lets the three doors be wired and REGRESSION-TESTED before any verb
   * exists to fill them — which is the whole point of landing ownership first.
   *
   * Replaces the item's previous records wholesale: a re-seat re-states what the
   * item owns rather than accumulating stale coordinates.
   */
  registerLiveLayers(itemId: string, records: readonly LiveLayerRecord[]): void {
    if (records.length === 0) {
      this.#liveLayers.delete(itemId);
      this.#publishLiveLayers();
      return;
    }
    this.#liveLayers.set(itemId, [...records]);
    this.#publishLiveLayers();
  }

  /**
   * B-145 — announce the ledger so it can be persisted.
   *
   * Called from the ONE write path and the ONE release path, for the reason
   * {@link releaseLiveLayers} already gives about its own body: a rule with four
   * implementations is a rule that drifts. If a future change adds a third way to mutate
   * the ledger, it goes through those two — not around them.
   */
  #publishLiveLayers(): void {
    this.liveLayersChanged.emit(this.#liveLayers);
  }

  /**
   * Forget an item's Live Source layers (teardown). Bookkeeping only.
   *
   * ⚠ **THE ONE SPELLING OF “forget this item's live layers”, and every site now
   * goes through it.** It had three inline copies of its own body
   * (`#liveLayers.delete(itemId)`) beside it and no production caller at all, so it
   * was a named rule with four implementations — found by the standing
   * extend-the-list-forget-the-mutator sweep in session AH, which is exactly the
   * drift that rule predicts. A future release that has to do more than delete (an
   * audit line, a publish) would otherwise have been added to one of the four.
   */
  releaseLiveLayers(itemId: string): void {
    this.#liveLayers.delete(itemId);
    this.#publishLiveLayers();
  }

  /**
   * C-015 phase 6 (task 6.6) — **TEAR DOWN an item's Live Source layers: clear the
   * producer AND reset the mixer, then release the ledger.**
   *
   * 🔴 **THE `MIXER … CLEAR` IS NOT TIDINESS, AND OMITTING IT IS THE BUG.** Mixer
   * state belongs to the CHANNEL'S MIXER, not to the producer, so it survives both
   * the `CLEAR` on the line above and a `CG REMOVE` (measured on hardware, and the
   * same fact R-022's rehearse volume restore is built on). A teardown that clears
   * only the producer leaves a `FILL` **and a `CLIP`** on that layer, waiting for
   * whatever the bridge puts there next.
   *
   * Of the two, the inherited **`CLIP` is far worse**: a stale `FILL` puts the next
   * graphic in the wrong PLACE, which somebody sees and reports, whereas a stale
   * `CLIP` makes an otherwise-correct graphic **INVISIBLE** — with a `202` on the
   * wire, nothing in any log, and an operator staring at a layer that reports a
   * healthy producer and shows nothing.
   *
   * ORDER: the `CLEAR` first, then the `MIXER CLEAR`. The producer goes before its
   * geometry so there is never a window in which a live picture is on the layer with
   * its mask already reset — which would flash the un-masked, oversized crop-to-fill
   * rect across the frame.
   *
   * THE LEDGER IS RELEASED LAST, and only after the sends. Releasing it first would
   * hand the layer back to the R-009 orphan sweep (DOOR 1's boundary case) while a
   * producer of ours is still on it — the sweep would then surface our own live layer
   * as a reclaimable orphan for the moment between.
   *
   * Best-effort per layer: one failing send must not strand the rest, exactly as
   * `removeAll` does not let one stuck item strand the graphics behind it.
   */
  async teardownLiveLayers(itemId: string): Promise<void> {
    const records = this.#liveLayers.get(itemId);
    if (records === undefined || records.length === 0) {
      // Still release: an empty entry is bookkeeping to drop, not a no-op to skip.
      this.releaseLiveLayers(itemId);
      return;
    }
    for (const record of records) {
      await this.#send(this.#builder.out(record.slot), this.#nextSeq(), 'urgent');
      await this.#send(this.#builder.mixerClear(record.slot), this.#nextSeq(), 'urgent');
    }
    this.releaseLiveLayers(itemId);
  }

  /**
   * 🔴 **B-145 — ADOPT a persisted ledger at boot, corrected by what the server actually
   * has.**
   *
   * The persisted file knows the NAMES this bridge gave those layers — the `itemId`, the
   * symbolic `sourceId`, the fill/key `role` — none of which the server was ever told, so
   * no amount of server reading re-derives them. The server knows the TRUTH about which
   * layers still carry a producer. `reconcileLiveLayers` resolves the two, and **its result
   * becomes the ledger**: one authority, with the file as an input to it rather than a
   * second answer consulted later.
   *
   * ⚠ **`observe` is INJECTED rather than read from a socket here**, mirroring
   * `fixed-layers-store.ts`'s `slotOccupancy` option. It keeps "what is on this layer" out
   * of "what does the ledger say", so the rule is testable without a server and the caller
   * stays free to source occupancy from `INFO` (measured to report per-layer producers and
   * to drop a layer as soon as it is cleared) or from the OSC tap.
   *
   * Returns the adoption so the caller can REPORT what the server contradicted. A record
   * dropped here means a producer went away while the bridge was down; that is a fact worth
   * printing, not a silent correction.
   */
  adoptLiveLayers(
    persisted: LiveLayerLedger,
    observe: (slot: CommandSlot) => LiveLayerOccupancy,
  ): LiveLayerAdoption {
    const adoption = reconcileLiveLayers({ persisted, observe });
    this.#liveLayers.clear();
    for (const [itemId, records] of adoption.adopted) this.#liveLayers.set(itemId, [...records]);
    this.#publishLiveLayers();
    return adoption;
  }

  /** The ledger, for tests and for phase 6's re-emission of `FILL`/`CLIP`. */
  liveLayers(): ReadonlyMap<string, readonly LiveLayerRecord[]> {
    return new Map([...this.#liveLayers].map(([id, rs]) => [id, [...rs]]));
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
      void this.#decidePendingRestores(this.#observedProducers(session), true);
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
      .filter((o) => this.#declaredLayerClass(o.channel, o.layer) !== 'playout');
    const owned = new Set<string>();
    for (const slot of this.#slots.values()) {
      owned.add(`${String(slot.channel)}:${String(slot.layer)}`);
    }
    /*
     * C-015 phase 5 (R-009) — DOOR 1 of 3: Live Source layers are OWNED, so they
     * are never orphan candidates.
     *
     * This is ownership, not exclusion — the opposite of the reserved-range
     * filter above. The bridge PUT this producer here and knows the coordinate
     * from its own ledger; the reserved range is a fence away from a layer the
     * bridge neither owns nor watches. Both end in "not an orphan", by different
     * arguments, and conflating them is how one of them later gets deleted as a
     * duplicate.
     *
     * Why it cannot be left to the kind test: a live producer is `route` /
     * `decklink` / `ndi`, never `html`, so nothing about producer KIND rescues
     * it — R-009's doctrine is "declared, never detected" (`design.md` §4), and
     * this is the declaration. Without it the sweep surfaces a live guest box as
     * reclaimable and invites the operator to clear a face off air.
     *
     * ⭐ R-028 (6.2/6.5) — THE NARROWING IS DONE, and it is done against the ONE
     * class list (`#declaredLayerClass`) rather than against two hand-written
     * membership tests. Each class gets the treatment its own CLAIM justifies,
     * which is why the list returns a class and not a boolean:
     *
     *   `playout`      → filtered out of the candidates entirely, above. Not ours,
     *                    never surfaced: an html playout graphic is
     *                    indistinguishable from ours on the wire, so surfacing it
     *                    would invite the operator to clear live automation output.
     *   `live-source`  → OWNED (this line). We seated that producer and know the
     *                    coordinate from our own ledger.
     *   `operator-row` → deliberately NOT excluded — see the note below, which is
     *                    the one place the three classes are treated differently
     *                    and the reason it is argued rather than asserted.
     *
     * DOOR 1 in `tests/live-source-ownership.integration.test.ts` fails if this
     * line is dropped, which is what protects it through any later rewrite.
     */
    for (const key of this.#liveLayerKeys()) owned.add(key);
    /*
     * 🔴 THE ONE CLASS THAT IS DECLARED AND STILL A CANDIDATE — read this before
     * "finishing" the narrowing.
     *
     * R-028 task 6.2 says the sweep's candidates become "layers nobody declared",
     * and taken literally that would exclude the operator bank too. It must not,
     * and the reason is that DECLARED and OWNED are different facts. An operator
     * row declares that the layer is the operator's to USE; it says nothing about
     * what is on it. A bank layer carrying an item WE bound is already `owned`
     * above through `#slots`, so what remains here is exactly "a producer on the
     * operator's own layer that we did not put there" — which is the definition of
     * an orphan, on the one surface whose owner can actually deal with it.
     *
     * BANK LAYERS WERE ONCE EXCLUDED, and the exclusion's own premise expired.
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
    if (!ok) return { ok: false, reason: 'amcp-error' };
    // Adoption marking mirrors `clearLayer`: a CLEAR we executed on the current
    // primary is an adoption, so the bookkeeping stays consistent with the other two
    // clear paths. It is bookkeeping ONLY — it is never a precondition above.
    if (onPrimary) this.#markAdoptedOnPrimary(slot);
    // B-125 — AFTER the clear landed, never before it. See `#reconcileClearedSlot`.
    this.#reconcileClearedSlot(slot);
    return { ok: true };
  }

  /**
   * B-125 — the layer was just CLEARed by a LAYER-addressed command; make the
   * ITEM bookkeeping say so.
   *
   * ── THE RACE THIS CLOSES ────────────────────────────────────────────────────
   *
   * The operator's row routes CLEAR on `item === null` **at click time**. If a
   * load + take binds an item to that layer in the instant between the render
   * that saw an empty row and the click that acted on it, the UNBOUND branch
   * fires and destroys a producer the stack item still believes is resident —
   * without going through `out()`, which is where that belief is normally
   * retired. Two things are then left lying:
   *
   *   - `#loaded` still holds the item, and it is what `take()`'s B-039 pre-roll
   *     reads to decide whether to re-`CG ADD`. Stale, the next take sends a bare
   *     `CG PLAY` onto an EMPTY layer: accepted on the wire, nothing on air. This
   *     half never self-heals, on any install.
   *   - the published STATUS keeps claiming `loaded`/on-air. On a hearing plant
   *     the occupancy tap observes `empty` and `freshTruth` derives `idle` within
   *     a TTL; on an OSC-LESS install (B-094 / B-101) that correction never comes
   *     and the row lies until the operator hits REMOVE.
   *
   * ── 🔴 THE FIX THAT WAS CONSIDERED AND REJECTED — DO NOT REPROPOSE IT ───────
   *
   * Refusing the clear when the layer is owned. It reads like the safe answer and
   * it is the wrong one: it reintroduces dependence on **the very bookkeeping this
   * escape hatch exists to bypass**. The hatch is reached precisely when `#slots`
   * and the status are what is wrong, so a guard that consults them fails exactly
   * when it is needed. The clear stays unconditional; the bookkeeping catches up.
   *
   * ── WHY NO SECOND `CLEAR` IS SENT ──────────────────────────────────────────
   *
   * Reusing `out(itemId)` would be the obvious reuse, and it would put a second,
   * redundant `CLEAR` for the same coordinate on an air-affecting lane. There is
   * nothing left to destroy: the caller only reaches here on an ACKED clear of
   * this exact slot. So the intent is applied as an `immediate` out — the flag
   * that has existed on the `out` intent since the Reconciler was written and
   * finally has its caller: `intentStatus` lands directly on the terminal `idle`
   * with no `settle` and no pending ack, because the command it describes has
   * ALREADY been sent and acked. Nothing is claimed here that the wire has not
   * already confirmed.
   *
   * ⚠ Call this ONLY after a clear that succeeded. On a refusal the layer was
   * never touched, and reconciling would knock a perfectly resident producer's
   * row back to `idle` — the exact inverse of the defect, produced by its fix.
   */
  #reconcileClearedSlot(slot: CommandSlot): void {
    for (const [itemId, owned] of this.#slots) {
      if (owned.channel !== slot.channel || owned.layer !== slot.layer) continue;
      // B-039 — the producer is destroyed, so a later take must re-ADD rather
      // than `CG PLAY` an empty layer. The slot stays RESERVED (the item is
      // still on the stack, idle) exactly as it does after `out()`.
      this.#loaded.delete(itemId);
      this.#reconciler.applyIntent({ kind: 'out', itemId, immediate: true }, this.#nextSeq());
    }
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
    // The reason type comes from `LAYER_CLEAR_REASONS` rather than being spelled
    // out again here: ONE canonical list, so a reason cannot exist on the wire
    // and be unrepresentable in the implementation (or the reverse).
  ): Promise<{ ok: boolean; reason?: LayerClearReason }> {
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
    /*
     * C-015 phase 5 (R-015) — DOOR 3 of 3: a Live Source layer is refused with
     * its OWN reason, so the operator is told what the layer is.
     *
     * ⚠ MUST PRECEDE the `html` test below. A live producer is never `html`, so
     * without this it would be refused as `foreign` — the right outcome carried
     * by the wrong statement. `foreign` means "provably not ours"; this layer is
     * emphatically ours. It is not `owned` either: that reason means a stack
     * item's TEMPLATE is here, and this coordinate is not in `#slots` at all.
     *
     * ⚠ C-015 asked for an EXEMPTION here — "the bridge may CLEAR what it owns"
     * — and applying that as worded is backwards: `clearLayer` is the
     * operator-facing `layers.clear` door ONLY, so an exemption would make Live
     * Source layers operator-CLEARABLE, inverting the protection. The bridge
     * needs no exemption to clear what it owns: its own teardown calls
     * `#builder.out(slot)` directly and never routes through here. Refusal with
     * a distinct reason is the decision (`design.md` §4, C5).
     */
    if (this.#isLiveLayer(channel, layer)) {
      return { ok: false, reason: 'live-source' };
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
   * ⭐ **B-122 — THE STATUS PREDICATE IS GONE, AND MUST NOT COME BACK UNDER ANOTHER NAME.**
   *
   * It used to mirror the row's Clear gating (everything not `idle`/`loaded`), which sounds
   * like consistency and is in fact the defect: it gated the emergency control on **exactly
   * the values that may be wrong in the emergency**. With every item wrongly reading `idle`
   * this sent nothing and returned `{ ok: true, cleared: 0 }` — the operator told the escape
   * hatch worked while the graphic was still on air. A success report for a no-op is worse
   * than a disabled button, because a disabled button tells the truth.
   *
   * The owner's decision (2026-08-12): a clear goes to EVERY item holding a bound slot,
   * regardless of believed status, INCLUDING rows the model believes are merely `loaded`.
   * Losing a cued row is the ACCEPTED COST — an emergency control must not depend on the
   * bookkeeping whose failure is the emergency.
   *
   * The one filter that remains is about OWNERSHIP, not belief: an item with no slot holds no
   * layer of ours, so there is nothing for us to clear. That is a structural fact, it cannot
   * be wrong in the way a status can, and it is what keeps this per-LAYER (see above).
   *
   * ⚠ **A Live Source layer is REFUSED, not cleared** (C-015 phase 5 — the third ownership
   * class). Broadening this verb must not let it reach a class that was just fenced off at
   * `clearLayer`: a bulk button that cuts a guest's face off air without ever naming it is
   * the hazard phase 5 exists to prevent. The check reuses `#isLiveLayer` — the ONE
   * flattening of the ledger every ownership door reads — so it cannot drift from the others.
   *
   * The report distinguishes what was SENT from what LANDED from what was never addressed,
   * so no shape of no-op can come back as a success (B-122's acceptance).
   */
  async clearAll(): Promise<{
    ok: boolean;
    cleared: number;
    attempted: number;
    refused: { itemId: string; reason: LayerClearReason }[];
  }> {
    const bound = this.#reconciler
      .snapshot()
      .map((item) => ({ itemId: item.itemId, slot: this.#slots.get(item.itemId) }))
      .filter((c): c is { itemId: string; slot: CommandSlot } => c.slot !== undefined);
    const refused: { itemId: string; reason: LayerClearReason }[] = [];
    let attempted = 0;
    let cleared = 0;
    for (const { itemId, slot } of bound) {
      if (this.#isLiveLayer(slot.channel, slot.layer)) {
        refused.push({ itemId, reason: 'live-source' });
        continue;
      }
      attempted += 1;
      // → `CLEAR <ch>-<layer>` for THIS item's own slot. Never a channel-wide clear.
      if ((await this.out(itemId)).accepted) cleared += 1;
    }
    // Nothing owed is not a success. `attempted > 0` is what stops an empty
    // stack — or a stack of nothing but refusals — reporting a completed clear.
    return { ok: attempted > 0 && cleared === attempted, cleared, attempted, refused };
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
   * Built like `clearAll` in SHAPE — the same sequential loop through the
   * per-item verb rather than a burst, and the same "a failure does not abort
   * the rest" property, because one stuck graphic must never strand the ones
   * behind it on air. Reusing `stopItem` means the C-012 semantics (`#loaded`
   * and `#adopted` untouched, so a later take RESUMES rather than re-ADDs) can
   * never drift between the single and bulk paths.
   *
   * ⭐ **THE CANDIDATE PREDICATES NOW DIFFER, DELIBERATELY (B-122).** This one
   * still asks the status (anything not idle/loaded that holds a slot);
   * `clearAll` no longer asks it at all. That is not drift — the two verbs
   * answer different questions:
   *
   *   - Clear-All is an EMERGENCY control, so it must not depend on the
   *     bookkeeping whose failure is the emergency. It clears every bound slot.
   *   - Stop-All is a PROGRAMME control. `CG STOP` asks a template to run its
   *     authored outro, which is meaningless for a row that was never PLAYed —
   *     an `idle` or `loaded` item has no outro to run and nothing to leave. The
   *     status is the right question here because it is not the axis under
   *     suspicion; a wrong `idle` costs a graceful exit, never a stranded
   *     graphic, and CLEAR ALL sits beside it as the remedy that ignores it.
   *
   * ⚠ Do not "restore consistency" by copying either predicate onto the other.
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
    return this.#audited('remove', this.#itemDetail(itemId), (detail) =>
      this.#removeImpl(itemId, detail),
    );
  }

  async #removeImpl(itemId: string, detail: AuditDetail): Promise<{ accepted: boolean }> {
    const slot = this.#slots.get(itemId);
    // Drop it from the stack immediately (UI responsiveness), then best-effort
    // clear the slot on the server.
    this.#reconciler.applyIntent({ kind: 'remove', itemId }, this.#nextSeq());
    this.#loaded.delete(itemId);
    // R-011 — the override dies with the ITEM (a re-used itemId starts clean).
    this.#positions.delete(itemId);
    // R-048 (6.9) — and so does the live-source override, by the same rule: a
    // re-used itemId must not inherit somebody else's emergency substitution.
    this.#sourceOverrides.delete(itemId);
    // 6.5f — and the audio intent. A re-used itemId inheriting a RAISED plate is
    // the worst of the three: it puts a microphone on air that nobody asked for.
    this.#plateVolumes.delete(itemId);
    // §14 (LOOKS) phase 3 — and the active look, by the same rule as the three above: a
    // re-used itemId must enter its template's AUTHORED default, never the look some
    // earlier row happened to leave behind.
    this.#activeLooks.delete(itemId);
    // B-092 — a restore awaiting its occupancy decision dies with the item too:
    // the operator removed it, so there is nothing left to adopt or re-ADD (the
    // urgent CLEAR below is the removal's own, and it is unconditional).
    // R-021 stage 4 — and so does its `restore-blocked` marker, or the row would
    // publish a block for an item that no longer exists.
    this.#pendingRestore.delete(itemId);
    this.#restoreBlocked.delete(itemId);
    // C-015 phase 6 (6.0/6.6) — the plates die with the item, and BEFORE its own
    // CLEAR for `out()`'s reason. Unconditional on `slot`: the ledger is keyed by
    // itemId, so an item whose slot was already released can still own live
    // layers, and those are precisely the ones nothing else would ever reach.
    await this.teardownLiveLayers(itemId);
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
      const { ok, onPrimary, errorCode } = await this.#send(
        this.#builder.out(slot),
        this.#nextSeq(),
        'urgent',
      );
      // A CLEAR executed on the CURRENT PRIMARY counts as adoption (see out()).
      if (ok && onPrimary) this.#markAdoptedOnPrimary(slot);
      /*
        🔴 B-141 — THE ONE VERB WHOSE RESPONSE CANNOT CARRY ITS OWN OUTCOME.

        `remove` answers `{ accepted: true }` unconditionally, and that is right for
        the CALLER: the row is off the stack whatever the wire did, and the layer is
        deallocated either way. But this CLEAR is best-effort, and a failed one
        leaves a graphic ON AIR with its row gone from every browser — precisely the
        state someone asks about the next day, and the one an `ok` row would deny.

        So the failure is handed to the WRAPPER rather than to the response: the
        contract the SPA depends on is untouched, and the log still says what
        happened. This is the only sanctioned use of `wireFailure`; anywhere else it
        would be a way to contradict a result, which is the habit `auditVerdict`
        exists to prevent.
      */
      if (!ok) detail.wireFailure = errorCode ?? 'amcp-error';
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
    this.#recordAudit({
      actor: operatorActor(),
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
    const newPrimary = this.#adapter.currentPrimary;
    // B-141 — `server` records which machine is primary AFTER the switch, which
    // is the fact someone reading the log the next day is actually asking about.
    this.#recordAudit({
      actor: operatorActor(),
      action: 'failover',
      server: newPrimary === 'A' ? 'primary' : 'backup',
      outcome: ok ? 'ok' : 'failed',
    });
    return { ok, newPrimary };
  }

  // ── lock / templates / audit / settings / update (in-memory stubs) ──
  lockState(): LockState {
    return this.#lock;
  }
  engage(pin: string): { ok: boolean } {
    this.#lockPin = pin;
    this.#lock = { engaged: true, reason: 'operator', engagedAt: new Date().toISOString() };
    this.lockChanged.emit(this.#lock);
    // B-141 — the PIN is never recorded, only that the lock was engaged.
    this.#recordAudit({ actor: operatorActor(), action: 'lock-engage', outcome: 'ok' });
    return { ok: true };
  }
  release(pin: string): { ok: boolean; reason?: 'pin-mismatch' | 'not-engaged' } {
    if (!this.#lock.engaged) {
      this.#recordAudit({
        actor: operatorActor(),
        action: 'lock-release',
        outcome: 'failed',
        errorCode: 'not-engaged',
      });
      return { ok: false, reason: 'not-engaged' };
    }
    if (this.#lockPin !== pin) {
      // A REFUSED release is the entry that matters most here — it is the one an
      // operator would later ask about.
      this.#recordAudit({
        actor: operatorActor(),
        action: 'lock-release',
        outcome: 'failed',
        errorCode: 'pin-mismatch',
      });
      return { ok: false, reason: 'pin-mismatch' };
    }
    this.#lock = { engaged: false };
    this.#lockPin = null;
    this.lockChanged.emit(this.#lock);
    this.#recordAudit({ actor: operatorActor(), action: 'lock-release', outcome: 'ok' });
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
    /*
      B-141 — THE FIFTEENTH ACTION, and the one the change's own bookkeeping had
      lost: `import` is neither in the seven playout verbs nor among the three
      named as having no bridge operation. It HAS one, right here.

      ⚠ A REDELIVERY IS NOT AN OPERATOR IMPORT and gets no line. It is the SPA
      replaying its entire library after every reconnect (B-085) — a burst of
      entries, on a schedule nobody chose, for something nobody did. A log that
      has to be scrolled past is a log that stops being read, and the whole
      complaint in B-141 is that this one is not read because it says nothing.

      Recorded outside `#audited`: this method is SYNCHRONOUS and answers
      `{ registered }` rather than `{ accepted }`, so it shares no shape with the
      wrapper. What it does share is `#recordOutcome` — the mapping lives in one
      place even though the call shapes are two.
    */
    if (redelivery) return this.#templateImportImpl(template, html, true);
    const detail: AuditDetail = { templateId: template.templateId };
    let result: { registered: boolean; templateId: string; skipped?: boolean };
    try {
      result = this.#templateImportImpl(template, html, false);
    } catch (err) {
      this.#recordOutcome('import', detail, { outcome: 'failed', errorCode: 'internal-error' });
      throw err;
    }
    this.#recordOutcome('import', detail, { outcome: 'ok' });
    return result;
  }

  #templateImportImpl(
    template: TemplateInfo,
    html: string,
    redelivery: boolean,
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

  /**
   * B-141 — the PRE-STATE of an item, as the audit record must name it.
   *
   * Read BEFORE the operation runs, deliberately: `remove` deletes the slot and
   * `out` empties the layer, so reading afterwards would record the layer the item
   * is on NOW (none) instead of the one the operator acted on.
   */
  #itemDetail(itemId: string): AuditDetail {
    const templateId = this.#reconciler.get(itemId)?.templateId;
    const slot = this.#slots.get(itemId);
    return {
      itemId,
      ...(templateId !== undefined ? { templateId } : {}),
      ...(slot !== undefined ? { slot } : {}),
    };
  }

  /**
   * ⭐ **B-141 — RUN AN OPERATOR ACTION SO THAT IT CANNOT RETURN WITHOUT ITS AUDIT
   * LINE.**
   *
   * The seven playout verbs have between three and eight exits each — every
   * refusal is its own `return` — so "remember to append before each one" is a
   * rule that holds until the next branch is added. This makes it structural
   * instead: the PUBLIC method is nothing but this wrapper, the real body is a
   * private impl it calls exactly once, and every path out of that impl —
   * including a THROW — passes through here. The same move as B-139: an API that
   * cannot be called wrong beats a call site that happens to be correct today.
   *
   * Three properties it exists to guarantee, each of which the naive
   * append-at-the-end would have broken:
   *
   *   1. **The outcome is DERIVED from the answer** (`auditVerdict`), never
   *      assumed from position. A refused take records `failed` with the code that
   *      refused it, not `ok`.
   *   2. **The entry is written where the outcome is KNOWN**, so `ts` — stamped by
   *      `#recordAudit` at the moment of the append — is the outcome's time, and
   *      file order is OUTCOME order rather than invocation order. Two concurrent
   *      takes appear in the order they finished, which is the order air saw.
   *      ⚠ **This half of the guarantee is NOT ours alone**: it also needs
   *      `AuditWriter` to CHAIN its appends, because `#recordAudit` is
   *      fire-and-forget and two concurrent `write`s complete in either order.
   *      That was missing at first and CI caught it — a refusal landed ahead of
   *      the accepted action that preceded it, on a tree where Windows agreed.
   *   3. **It cannot fail the operation.** `#recordAudit` is fire-and-forget and
   *      swallows the writer's rejection; a full disk surfaces through
   *      `auditHealth().lastError` and the station stays on air. The contrast with
   *      the config stores is deliberate and is stated at `#auditWriter`: those
   *      files are PRECONDITIONS for correct playout, so an unusable one is a hard
   *      boot failure. An audit entry is a RECORD OF what happened, and nothing
   *      downstream reads it to decide what to send.
   */
  async #audited<T extends { accepted: boolean; errorCode?: string }>(
    action: AuditEntry['action'],
    detail: AuditDetail,
    run: (detail: AuditDetail) => Promise<T>,
  ): Promise<T> {
    let result: T;
    try {
      result = await run(detail);
    } catch (err) {
      // A THROW IS AN OUTCOME TOO. Without this, the one exit that never reaches a
      // `return` would be the one exit with no record — and an action that blew up
      // mid-flight is more interesting to whoever reads the log than one that
      // refused cleanly, not less. The error is re-thrown untouched.
      this.#recordOutcome(action, detail, { outcome: 'failed', errorCode: 'internal-error' });
      throw err;
    }
    this.#recordOutcome(action, detail, auditVerdict(detail, result));
    return result;
  }

  /**
   * B-141 — the ONE place a `{ detail, verdict }` pair becomes an `AuditEntry`.
   *
   * Shared by `#audited` and by the synchronous `templateImport`, so the two call
   * SHAPES cannot drift into two mappings.
   */
  #recordOutcome(
    action: AuditEntry['action'],
    detail: AuditDetail,
    verdict: { outcome: AuditEntry['outcome']; errorCode?: string },
  ): void {
    this.#recordAudit({
      actor: operatorActor(),
      action,
      ...(detail.itemId !== undefined ? { itemId: detail.itemId } : {}),
      ...(detail.templateId !== undefined ? { templateId: detail.templateId } : {}),
      // The SAME stamping `assignSlot` uses — the coordinate is the primary's. A
      // second convention for "which machine is this layer on" is how one rule
      // comes to have two spellings.
      ...(detail.slot !== undefined
        ? {
            slot: {
              channel: detail.slot.channel,
              layer: detail.slot.layer,
              server: 'primary' as const,
            },
          }
        : {}),
      outcome: verdict.outcome,
      ...(verdict.errorCode !== undefined ? { errorCode: verdict.errorCode } : {}),
    });
  }

  /**
   * B-141 — record ONE auditable action. Fire-and-forget, by contract.
   *
   * Never awaited by a caller and never able to refuse one: see the note on
   * `#audit`. The writer keeps its own error state, which `auditHealth` exposes
   * so the panel can tell "failing" from "empty" — the distinction the old
   * "No audit entries yet." could not make.
   */
  #recordAudit(entry: Omit<AuditEntry, 'ts'> & { ts?: string }): void {
    const row: AuditEntry = { ...entry, ts: entry.ts ?? new Date().toISOString() } as AuditEntry;
    // The in-memory tail is kept in BOTH modes: with no writer it is the only
    // record, and with one it keeps `auditRecent` answering during the window
    // before the first flush.
    this.#audit.unshift(row);
    if (this.#audit.length > 500) this.#audit.length = 500;
    if (this.#auditWriter === null) return;
    void this.#auditWriter.append(row).catch(() => {
      // Swallowed DELIBERATELY. The writer has already recorded the failure in
      // `lastError` / `errorCount` and emitted `error`; re-throwing here would
      // reject the caller's operation, which is exactly what must not happen.
    });
  }

  /**
   * B-141 — what the operator surface needs to tell three empty states apart:
   * no writer configured, a writer that is failing, and genuinely empty.
   */
  auditHealth(): {
    configured: boolean;
    path: string | null;
    errorCount: number;
    lastError: string | null;
  } {
    return {
      configured: this.#auditWriter !== null,
      path: this.#auditLogPath,
      errorCount: this.#auditWriter?.errorCount ?? 0,
      lastError: this.#auditWriter?.lastError?.message ?? null,
    };
  }

  async auditRecent(
    limit = 200,
    action?: AuditEntry['action'],
    actor?: string,
  ): Promise<AuditEntry[]> {
    if (this.#auditLogPath !== null) {
      try {
        return await readRecentEntries({
          filePath: this.#auditLogPath,
          limit,
          ...(action !== undefined ? { action } : {}),
          ...(actor !== undefined ? { actor } : {}),
        });
      } catch {
        // A read failure is reported through `auditHealth`, never as an empty
        // log — "nothing here" and "I could not look" must not look the same.
      }
    }
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
   * D-137 / C-015 — the installation's source catalog in force. An EMPTY
   * `sources` list is a real answer and means nothing can be assigned; it is
   * never a "not loaded yet".
   */
  sourceCatalog(): SourceCatalog {
    return this.#sourceCatalog;
  }

  /** D-137 / C-015 — which catalog entry each template's each plate uses. */
  sourceAssignments(): SourceAssignments {
    return this.#sourceAssignments;
  }

  /**
   * Replace the source catalog: validate → apply → CASCADE → publish
   * (`bridge.ts` persists after the ok, the R-010 order).
   *
   * THE VALIDATION IS THE SAME FUNCTION THE BOOT PATH CALLS, against the SAME
   * bank and reserved list resolved once in `createBridge`. At-change is the
   * half that gets forgotten, and it is the half an operator can trigger with a
   * graphic on air: a band edited into the candidate bank would put a live
   * producer on top of an operator row, at 21:59, with no boot in between.
   *
   * 🔴 **DELETING A SOURCE CASCADES, HERE, IN THE SAME OPERATION.** The delete
   * is not refused — an installation must be able to retire a live — and it is
   * not left to dangle until air, which is the failure this project exists to
   * prevent. Every assignment the new catalog orphans is dropped and RETURNED,
   * so the caller can name at the moment of deletion which templates referenced
   * it; those plates then read as unassigned and their take refuses naming the
   * plate. The prune is `@cg/shared-ipc`'s, the SAME one the boot path uses —
   * two spellings of "which assignments does this catalog orphan" is how they
   * come to disagree.
   */
  setSourceCatalog(next: SourceCatalog): {
    ok: boolean;
    reason?: SourcesSetConfigReason;
    message?: string;
    droppedAssignments?: TemplateSourceAssignment[];
  } {
    const verdict = checkSourceCatalog(next, {
      fixedBank: this.#fixedBank,
      reservedLayers: this.#reservedLayers,
    });
    if (!verdict.ok) return verdict;
    this.#sourceCatalog = next;
    this.sourceCatalogChanged.emit(next);
    const pruned = pruneAssignmentsForCatalog(this.#sourceAssignments, next);
    if (pruned.dropped.length > 0) {
      this.#sourceAssignments = pruned.value;
      this.sourceAssignmentsChanged.emit(pruned.value);
      return { ok: true, droppedAssignments: [...pruned.dropped] };
    }
    return { ok: true };
  }

  /**
   * Replace the assignments: validate against the catalog IN FORCE → apply →
   * publish (`bridge.ts` persists after the ok).
   *
   * An assignment naming a source this installation does not define is REFUSED
   * here rather than pruned: the product's own surface cannot produce one, so a
   * caller that does is stale or hand-written, and silently dropping its request
   * would report a success the caller did not get. The LOAD path prunes instead,
   * and `pruneAssignmentsForCatalog`'s docstring records why the two doors
   * answer differently.
   */
  setSourceAssignments(next: SourceAssignments): {
    ok: boolean;
    reason?: SourcesSetAssignmentsReason;
    message?: string;
  } {
    const verdict = checkSourceAssignments(next, { catalog: this.#sourceCatalog });
    if (!verdict.ok) return verdict;
    this.#sourceAssignments = next;
    this.sourceAssignmentsChanged.emit(next);
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
    const live = this.#liveLayerKeys();
    for (const occ of session.osc.occupancy.occupied(this.#occupancyStaleMs)) {
      /*
       * C-015 phase 5 (C-014) — DOOR 2 of 3: a bridge-owned Live Source layer is
       * not foreign, so it is never quarantined from allocation.
       *
       * ⚠ THIS TEST IS FIRST, BEFORE THE `html` TEST BELOW, AND THE ORDER IS THE
       * TASK. The `html` test is a KIND heuristic stating "only html can be
       * ours", which is precisely what a bridge-owned NON-html layer defeats: a
       * live producer reports `route` / `decklink` / `ndi`, so it falls straight
       * through that test into `foreign` and gets quarantined — the layer the
       * bridge is about to composite a guest onto, fenced off from allocation by
       * the bridge itself.
       *
       * Consulting the DECLARATION before the detection is R-009's own doctrine
       * ("declared, never detected", `design.md` §4). Placed after the kind test
       * it would still skip today — but only because live producers happen never
       * to be `html`, which makes the correctness of this door depend on a fact
       * about a different one. Ownership is not a kind question, and this line
       * does not ask a kind question.
       */
      if (live.has(adoptionKey(occ))) continue;
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
    } catch (err) {
      this.#clearExpiry(seq);
      // §8 / `AMCP_TIMEOUT_CODE` — "it timed out" and "it never left" point at two
      // different machines, so they get two codes. Every other throw keeps the old
      // spelling: a code is worth minting only when it changes where the operator
      // goes to look.
      const errorCode = err instanceof AmcpTimeoutError ? AMCP_TIMEOUT_CODE : 'amcp-send-failed';
      this.#reconciler.applyAck(seq, false, errorCode);
      return { ok: false, onPrimary: false, errorCode };
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
    /*
      C-015 phase 6 (6.5 / 6.5a / 6.5b / 6.5c) — MUTE BEFORE THE ADD, ON THE WIRE.

      THE RULE: every producer the bridge creates is created MUTED, and audio is
      raised only by an explicit recorded intent naming the layer (design.md §7,
      widened by the owner in §12.4 from a Live Source rule to THE rule). This is
      the `CG ADD` half; `#seatLiveLayers` is the `playSource` half.

      🔴 **THE ORDER IS THE WHOLE THING, AND IT IS THE OPPOSITE OF `playSource`'s.**
      A bare `CG ADD` puts the template's audio on the channel on 2.5.0 — measured
      at 0.24 s (R-029) — so ADD-then-mute is the same leak, merely shorter: _"an
      implementation that gets the order wrong looks correct in every test that does
      not listen"_ (R-042). For `playSource` the mute cannot precede the command
      because the producer does not exist until the `PLAY`; here it can, and MIXER
      state is CHANNEL state that survives `CLEAR` and `CG REMOVE`
      (`command-builder.ts`, measured), which is what makes muting a layer before
      anything is on it legal at all.

      A FAILED MUTE DOES NOT PROCEED TO THE ADD. That is R-042's own acceptance and
      it is the honest reading: the mute is not a courtesy step around the load, it
      is the condition under which loading is safe. Failing closed costs the
      operator a load; failing open costs a station audio on air that nobody asked
      for and no UI shows.

      ⭐ **ONE PLACE, FOUR SITES.** This is the single emit chokepoint for `CG ADD`
      and it has exactly four callers — `#loadOnto` (the dynamic `load()`; the fixed
      `loadFixed` is LIST-ONLY and emits nothing), `#decidePendingRestores` (B-121's
      uncovered reconnect path), `setPosition`'s re-ADD, and `take()`'s B-039
      pre-roll. Muting here closes all four by construction, which is why the rule
      needed one implementation and not three guards. `live-add-mute.integration.test.ts`
      pins each site individually on the wire, because a chokepoint that acquires a
      caller who bypasses it is exactly how this class comes back.

      ⚠ **IT RIDES ITS OWN SEQ.** The `seq` argument belongs to the LOAD intent; a
      `MIXER` ack settling it would report the load complete before the ADD had even
      been sent.

      ⚠ **THE UNMUTE HALF IS NOT REBUILT HERE.** `take()` re-asserts
      `INTENDED_VOLUME` unconditionally on every take, and that re-assert IS the
      "explicit recorded intent" this rule names. A second unmute path would be the
      `B-100` / `P-012` one-rule-two-spellings failure this project has now paid for
      five times.
    */
    const muted = await this.#send(
      this.#builder.mixerVolume(slot, CREATED_MUTED_VOLUME),
      this.#nextSeq(),
      'normal',
    );
    if (!muted.ok) {
      this.#reconciler.applyAck(seq, false, ADD_MUTE_FAILED);
      return { ok: false, errorCode: ADD_MUTE_FAILED };
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
