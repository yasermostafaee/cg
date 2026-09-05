import { isOnAirStatus } from '@cg/shared-schema';
import type { AuditEntry, Position, StackItemState, StackItemStatus } from '@cg/shared-schema';
import type {
  ConnectionConfig,
  ConnectionHealth,
  FixedLayerBank,
  FixedSlotObservation,
  FixedSlotState,
  LayerClearReason,
  LockState,
  OrphanLayer,
  OwnedOccupancyWarning,
  PendingUpdate,
  PLAYOUT_CLEAR_REASONS,
  PlayoutLayerState,
  LiveLayerState,
  Settings,
  TemplateInfo,
  DelimiterOption,
  Rehearsal,
  REHEARSE_ENTER_REASONS,
  ChannelRaster,
  ChannelSettings,
  ChannelSettingsState,
  CHANNEL_SETTINGS_SET_REASONS,
  SourceAssignments,
  SourceCatalog,
  SourcesSetAssignmentsReason,
  SourcesSetConfigReason,
  TemplateSourceAssignment,
} from '@cg/shared-ipc';
// R-030 — `videoModeRaster` is the ONE video-mode → raster map, shared with the
// bridge. The mock must never carry a second copy: a mock that disagreed with the
// bridge about what `1080i5000` means would show a mismatch that does not exist
// on air.
import {
  ChannelRasterSchema,
  checkSourceAssignments,
  checkSourceCatalog,
  defaultFixedLayerBank,
  DelimiterOptionSchema,
  fixedBankSlots,
  isFixedBankLayer,
  describeTemplateReferences,
  type TemplateReference,
  isLowBankLayer,
  layerAlias,
  EMPTY_SOURCE_ASSIGNMENTS,
  EMPTY_SOURCE_CATALOG,
  pruneAssignmentsForCatalog,
  REFERENCE_RASTER,
  REMOVE_ON_AIR_CODE,
  SourceAssignmentsSchema,
  SourceCatalogSchema,
  videoModeRaster,
} from '@cg/shared-ipc';
import { Emitter } from './emitter.js';
import { operatorActorForWire } from './operatorName.js';
import { configuredHosts, isLoopbackHost } from '../shared/loopback.js';
import { seedConfig, seedHealth, seedStack, seedTemplates } from './seed.js';

/** R-028 part B — the mock mirrors the bridge's refusal union exactly. */
type PlayoutClearReason = (typeof PLAYOUT_CLEAR_REASONS)[number];

type FieldValues = StackItemState['fields'];

const SETTINGS_KEY = 'cg-runtime:settings';
const DELIMITERS_KEY = 'cg-runtime:delimiters';
const SOURCE_CATALOG_KEY = 'cg-runtime:source-catalog';
const SOURCE_ASSIGNMENTS_KEY = 'cg-runtime:source-assignments';
const CHANNEL_SETTINGS_KEY = 'cg-runtime:channel-settings';

/**
 * D-137 / C-015 — read a `localStorage`-backed config value, falling back to
 * `fallback` when the key is absent, unreadable or does not parse.
 *
 * ONE helper for both live-source keys, so the two cannot come to disagree about
 * what an unusable store means. It means the EMPTY value, never a guess: a mock
 * that invented a source would show test mode a plant that does not exist.
 */
function readStored<T>(
  key: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  fallback: T,
): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data !== undefined) return parsed.data;
    }
  } catch {
    // Unusable storage falls through to the empty value — never a guess.
  }
  return fallback;
}

/** The write half. Persistence lost is not the session's value lost. */
function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence lost, the session's value is not.
  }
}

/**
 * R-030 parity — the channel the mock declares, matching `MOCK_BANK`'s.
 *
 * The mock reports the SAME video mode it configures, so test mode shows the
 * `match` verdict rather than a permanent fake alarm. A simulated mismatch would
 * be indistinguishable from a real one on the operator's screen, and R-006's
 * whole doctrine is that the mock must never wear a signal that means a real
 * server said something.
 */
const MOCK_CHANNEL = 1;
const MOCK_VIDEO_MODE = '1080i5000';

/** R-034 parity — the same shipped list the bridge starts a station with. */
const DEFAULT_DELIMITERS: readonly DelimiterOption[] = [
  { id: 'newline', label: 'new line', value: '\\n' },
  { id: 'pipe', label: 'pipe', value: '|' },
  { id: 'persian-comma', label: 'Persian comma', value: '،' },
  { id: 'comma', label: 'comma', value: ',' },
  { id: 'semicolon', label: 'semicolon', value: ';' },
];

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * In-memory simulation of the CasparCG playout controller. Replaces the
 * Electron main process for the browser build until the local WebSocket↔TCP
 * bridge lands. Intents drive a simple status state machine; everything the
 * RuntimeBridge contract promises is implemented against mock state so the
 * operator UI is fully interactive.
 */
export class MockRuntime {
  readonly stackChanged = new Emitter<readonly StackItemState[]>();
  readonly healthChanged = new Emitter<ConnectionHealth>();
  readonly configChanged = new Emitter<ConnectionConfig>();
  readonly orphansChanged = new Emitter<OrphanLayer[]>();
  readonly ownedOccupancyChanged = new Emitter<OwnedOccupancyWarning[]>();
  readonly lockChanged = new Emitter<LockState>();
  readonly settingsChanged = new Emitter<Settings>();
  readonly updateChanged = new Emitter<PendingUpdate | null>();
  // R-021 stage 2a — fixed-bank parity.
  readonly fixedConfigChanged = new Emitter<FixedLayerBank | null>();
  readonly fixedStateChanged = new Emitter<FixedSlotState[]>();
  // R-028 (o1) parity — the bridge pushes the full catalogue on every change.
  readonly templatesChanged = new Emitter<TemplateInfo[]>();
  // R-028 part B — the declared playout layers' occupancy.
  readonly playoutStateChanged = new Emitter<PlayoutLayerState[]>();
  // B-145 (2.8) parity — the bridge's OWN Live Source ledger, pushed on change.
  readonly liveLayersChanged = new Emitter<LiveLayerState[]>();
  // R-034 parity — the shared delimiter list.
  readonly delimitersChanged = new Emitter<DelimiterOption[]>();
  // D-137 / C-015 parity — the installation's Live Source mapping.
  readonly sourceCatalogChanged = new Emitter<SourceCatalog>();
  readonly sourceAssignmentsChanged = new Emitter<SourceAssignments>();
  // R-030 parity — the per-channel output raster + the video-mode reading.
  readonly channelSettingsChanged = new Emitter<ChannelSettingsState>();
  // R-022 parity — the rehearsing set.
  readonly rehearseChanged = new Emitter<Rehearsal[]>();

  /** R-022 parity — rows in REHEARSE, keyed by item id. Session state, like the bridge's. */
  readonly #rehearsing = new Map<string, Rehearsal>();

  #stack: StackItemState[] = [
    ...seedStack(),
    ...seedBlockedStackItem(),
    // §14.5 Stage E — the look-bearing row (e2e-armed only).
    ...seedLooksStackItem(),
  ];
  #templates = new Map<string, TemplateInfo>(
    // §14.5 Stage E — the look-bearing template joins the starters when armed.
    [...seedTemplates(), ...seedLooksTemplate()].map((t) => [t.templateId, t]),
  );
  /** R-028 part B parity — ids removed here, so a re-delivery cannot revive them. */
  readonly #removedTemplateIds = new Set<string>();
  #config: ConnectionConfig = seedConfig();
  #health: ConnectionHealth = seedHealth('A');
  #lock: LockState = { engaged: false };
  #lockHash: string | null = null;
  #audit: AuditEntry[] = [];
  #pendingUpdate: PendingUpdate | null = null;
  // R-009 — the offline mock has no real server, so no orphans, EXCEPT a
  // test-only seed (CG_E2E_ORPHAN) so Playwright can drive the visible flow.
  #orphans: OrphanLayer[] = seedOrphans();
  // B-056 — same shape: no real primary to miss, EXCEPT a test-only seed
  // (CG_E2E_OWNED_OCCUPANCY) so Playwright can drive the warning + remedy.
  #ownedOccupancy: OwnedOccupancyWarning[] = seedOwnedOccupancy();
  // R-011 — per-item operator position overrides (bridge parity).
  readonly #positions = new Map<string, Position>();
  // R-048 — per-item, per-plate live-source overrides (bridge parity).
  readonly #sourceOverrides = new Map<string, Record<string, string>>();
  /** Session BM — the per-look composition, mirroring the bridge. */
  readonly #lookSourceBindings = new Map<string, Record<string, Record<string, string>>>();
  /**
   * 🔴 **SESSION BP parity — the template assignment this row FROZE at take (level 2).**
   *
   * The mock seats no producers, so it cannot demonstrate the freeze on a wire it does not
   * have. What it MUST model is the published FIELD and its lifetime — written at take,
   * thawed at a landed `out`/`stop`, dropped at `remove` — because the Inspector reads that
   * field to say which plates of an on-air row are resolving something other than the live
   * template default. A mock that never published it would leave the offline Runtime showing
   * the LIVE default for a frozen row: the surface-is-confidently-wrong outcome, reached in
   * test mode only, which is the precise mistake `B-070`'s note above is about.
   */
  readonly #frozenAssignments = new Map<string, Record<string, string>>();
  /**
   * §14 (LOOKS) Stage E parity — itemId → the look the OPERATOR picked.
   *
   * Only explicit picks live here, exactly as on the bridge. What a row is SHOWING is a
   * different question and is answered by {@link resolvedActiveLook}, so a never-switched
   * row still publishes its authored default rather than nothing.
   */
  readonly #activeLooks = new Map<string, string>();
  // C-015 (6.5f) — per-item, per-plate AUDIO INTENT (bridge parity).
  readonly #plateVolumes = new Map<string, Record<string, number>>();
  // B-070 — producer-existence bookkeeping (bridge parity: the bridge's
  // `#loaded`). A producer lives from load/take until out/remove destroys it.
  // A seeded item that is not idle already has one.
  readonly #loaded = new Set<string>(
    seedStack()
      .filter((i) => i.status !== 'idle')
      .map((i) => i.itemId),
  );
  // R-021 stage 4 — the blocked row's item is deliberately NOT in `#loaded`: the
  // whole claim of the state is that nothing of ours is on that layer. The bridge's
  // real restore never issued the `CG ADD`, so no producer exists for it.

  // ── stack ───────────────────────────────────────────────────────────

  /**
   * B-072 parity — the published item state joins the stored position
   * override, exactly as the real bridge's `#published()` does. `#emitStack()`
   * routes through here, so one join covers BOTH channels (snapshot and
   * state-changed). Without this the mock would be the only runtime that
   * fails to model the read-back, and the UI would once again be built against
   * semantics the bridge does not have (the B-070 lesson).
   */
  stackSnapshot(): StackItemState[] {
    return this.#stack.map((i) => {
      const position = this.#positions.get(i.itemId);
      const sourceOverride = this.#sourceOverrides.get(i.itemId);
      const lookSourceOverride = this.#lookSourceBindings.get(i.itemId);
      const plateVolumes = this.#plateVolumes.get(i.itemId);
      // §14 (LOOKS) Stage E parity — through the RESOLVER, never the raw pick map.
      const activeLookId = this.resolvedActiveLook(i.itemId);
      // Session BP parity — the FROZEN level 2, so the Inspector can name it offline too.
      const frozenAssignment = this.#frozenAssignments.get(i.itemId);
      return {
        ...i,
        ...(position !== undefined && { position }),
        ...(sourceOverride !== undefined && { sourceOverride }),
        ...(lookSourceOverride !== undefined && { lookSourceOverride }),
        ...(frozenAssignment !== undefined && { frozenAssignment }),
        ...(plateVolumes !== undefined && { plateVolumes }),
        ...(activeLookId !== undefined && { activeLookId }),
      };
    });
  }

  load(itemId: string, templateId: string, fields: FieldValues): { accepted: boolean } {
    const next: StackItemState = { itemId, templateId, fields, status: 'loaded', pending: false };
    const idx = this.#stack.findIndex((i) => i.itemId === itemId);
    if (idx === -1) this.#stack.push(next);
    else this.#stack[idx] = next;
    // B-070 parity — CG ADD creates the producer.
    this.#loaded.add(itemId);
    this.#settleSlotObservation(itemId, 'producer');
    this.#audit.unshift(auditEntry('load', this.#auditItem(itemId, templateId)));
    this.#emitStack();
    return { accepted: true };
  }

  take(itemId: string): { accepted: boolean; errorCode?: string } {
    // R-022 parity — THE INTERLOCK, and the mock must hold it too. If test mode
    // allowed a take the real bridge refuses, the interlock would be exercised
    // nowhere in the suite and the UI would be built against semantics the bridge
    // does not have — the precise mistake the `update` comment below records.
    if (this.#rehearsing.has(itemId)) return { accepted: false, errorCode: 'rehearsing' };
    const item = this.#find(itemId);
    if (item === null) return { accepted: false, errorCode: 'unknown-item' };
    // B-070/B-039 parity — a take with no live producer re-ADDs first, so a
    // producer always exists afterwards.
    this.#loaded.add(itemId);
    this.#settleSlotObservation(itemId, 'producer');
    this.#transition(itemId, 'playing', true);
    this.#audit.unshift(auditEntry('take', this.#auditItem(itemId, item.templateId)));
    // 🔴 SESSION BP parity — THE TAKE PINS LEVEL 2. A row that is on air does not change its
    // picture because somebody edited configuration, and the take is the only writer.
    // Deliberately a SET rather than set-if-absent: a re-take re-freezes, which is the
    // operator's way to adopt an edited default.
    this.#frozenAssignments.set(itemId, this.#assignmentMapFor(item.templateId));
    // C-015 parity — the take is what SEATS the plates.
    this.#seatLivePlates(itemId);
    this.#settle(itemId, 'on-air');
    return { accepted: true };
  }

  /**
   * B-070 parity — the bridge's PRODUCER-STATE rule. `CG UPDATE` needs a live
   * producer, not air: with no producer on the slot the bridge COMMITS the
   * fields and sends nothing (the next take's re-ADD carries them). The mock
   * used to accept an update on ANY item with no producer model at all — which
   * is precisely why the R-003 Inspector UX was built and tested against
   * semantics the real bridge does not have, and why this bug reached air.
   *
   * `#loaded` mirrors the bridge's producer bookkeeping: a producer exists from
   * `load`/`take` until `out`/`remove` destroys it.
   */
  update(
    itemId: string,
    fields: FieldValues,
    mergeMode: 'merge' | 'replace',
    /**
     * Session BM-2 — the row's COMPLETE per-look input map, applied with the fields.
     *
     * ⚠ Applied BEFORE the merge below, mirroring the bridge's order: the bindings move the
     * fills and the page is told afterwards. The mock has no fills to move, so what parity
     * requires of it is only that ONE call carries both halves and that the map REPLACES
     * rather than merges — a mock that merged would let a test pass while the real bridge
     * cleared a binding the test thought it had removed.
     */
    lookBindings?: Readonly<Record<string, Readonly<Record<string, string>>>>,
  ): { accepted: boolean; errorCode?: string } {
    const item = this.#find(itemId);
    if (item === null) return { accepted: false, errorCode: 'unknown-item' };
    if (lookBindings !== undefined) {
      if (Object.keys(lookBindings).length === 0) this.#lookSourceBindings.delete(itemId);
      else
        this.#lookSourceBindings.set(
          itemId,
          lookBindings as Record<string, Record<string, string>>,
        );
    }
    const merged = mergeMode === 'merge' ? { ...item.fields, ...fields } : fields;

    // No producer on the slot ⇒ commit only, nothing "sent", intent settled
    // (B-044: never rest non-terminal — an unsettled `updating` is the zombie
    // `pending` that used to block setPosition for the item's whole life).
    if (!this.#loaded.has(itemId)) {
      this.#patch(itemId, { fields: merged, pending: false });
      this.#audit.unshift(auditEntry('update', this.#auditItem(itemId, item.templateId)));
      this.#emitStack();
      return { accepted: true };
    }

    const wasOnAir = item.status === 'on-air' || item.status === 'playing';
    this.#patch(itemId, {
      fields: merged,
      status: wasOnAir ? 'updating' : item.status,
      pending: wasOnAir,
    });
    this.#audit.unshift(auditEntry('update', this.#auditItem(itemId, item.templateId)));
    // B-044 contract: `updating` is transient — it settles to the item's
    // underlying on-air state on the (simulated) ack, never resting.
    if (wasOnAir) this.#settle(itemId, 'on-air');
    else this.#emitStack();
    return { accepted: true };
  }

  /**
   * C-012 parity — the GRACEFUL stop. Unlike `out`'s CLEAR this leaves the producer
   * RESIDENT: `#loaded` keeps the item, so a later take resumes with no re-ADD, and
   * the item settles at `loaded` rather than `idle`. Mirrors the bridge exactly so
   * test mode cannot teach the operator a different mental model from air.
   */
  stop(itemId: string): { accepted: boolean } {
    const item = this.#find(itemId);
    if (item === null) return { accepted: false };
    this.#transition(itemId, 'exiting', true);
    this.#audit.unshift(auditEntry('stop', this.#auditItem(itemId, item.templateId)));
    // C-015 parity — `#stopItemImpl` awaits `teardownLiveLayers`, so the plates come
    // down WITH the graphic even though the template producer survives below.
    this.#releaseLivePlates(itemId);
    // SESSION BP parity — off air, so level 2 thaws. The resident producer is beside the
    // point: what the freeze protects is the PICTURE, and there is no longer one.
    this.#thawAssignment(itemId);
    // The producer survives, so `#loaded` is deliberately NOT cleared.
    this.#settle(itemId, 'loaded');
    return { accepted: true };
  }

  /**
   * R-028 (5.4) parity — advance the template's sequence. Offline there is no
   * template running, so this changes NO item state: `next` carries none on
   * the bridge either (only the template's internal step moves). Modelled at
   * all so the row's NEXT verb dispatches identically in test mode.
   */
  next(itemId: string): { accepted: boolean; errorCode?: string } {
    const item = this.#find(itemId);
    if (item === null) return { accepted: false, errorCode: 'unknown-item' };
    this.#audit.unshift(auditEntry('next', this.#auditItem(itemId, item.templateId)));
    return { accepted: true };
  }

  /** C-012 parity — STOP every on-air item; producers stay resident. */
  stopAll(): { ok: boolean; stopped: number } {
    const onAir = this.#stack.filter((i) => i.status !== 'idle' && i.status !== 'loaded');
    for (const item of onAir) this.stop(item.itemId);
    return { ok: true, stopped: onAir.length };
  }

  out(itemId: string): { accepted: boolean } {
    const item = this.#find(itemId);
    if (item === null) return { accepted: false };
    this.#transition(itemId, 'exiting', true);
    // B-070 parity — out's CLEAR DESTROYS the producer, so a later update
    // commits without a wire send and a later take re-ADDs.
    this.#loaded.delete(itemId);
    this.#settleSlotObservation(itemId, 'empty');
    this.#audit.unshift(auditEntry('out', this.#auditItem(itemId, item.templateId)));
    // C-015 parity — `#outImpl` takes the live layers down FIRST, then the graphic.
    this.#releaseLivePlates(itemId);
    // SESSION BP parity — and level 2 thaws: an assignment edit now lands at the next take,
    // which is what the Inspector has always promised for an off-air row.
    this.#thawAssignment(itemId);
    this.#settle(itemId, 'idle');
    // B-056 parity — the mock's simulated servers are healthy, so an out's
    // CLEAR "lands on the primary": the item's warning provably resolves.
    this.#resolveOwnedOccupancy(itemId);
    return { accepted: true };
  }

  remove(itemId: string): { accepted: boolean; errorCode?: string } {
    const item = this.#find(itemId);
    // `R-017` parity — the mock must REFUSE where the bridge refuses, or a surface built
    // against it ships against a fiction (`B-070`/`B-072`, the reason `mock-bridge-parity`
    // exists). Same imported predicate, so the two cannot drift.
    // ⚠ The bridge additionally exempts an item on no declared operator row (`B-212`); the
    // mock has no layer-class model, and every item it holds IS on a row, so the exemption
    // is unreachable here rather than omitted.
    if (item !== null && isOnAirStatus(item)) {
      return { accepted: false, errorCode: REMOVE_ON_AIR_CODE };
    }
    this.#stack = this.#stack.filter((i) => i.itemId !== itemId);
    if (item !== null)
      this.#audit.unshift(auditEntry('remove', this.#auditItem(itemId, item.templateId)));
    // SESSION BP parity — the frozen level 2 dies with the item, so a re-used itemId never
    // inherits a retired show's assignment.
    this.#frozenAssignments.delete(itemId);
    this.#emitStack();
    // B-056 parity — the item is gone / its layer deallocated.
    this.#resolveOwnedOccupancy(itemId);
    // C-015 parity — `#removeImpl` awaits `teardownLiveLayers` unconditionally on the
    // slot: an item whose slot was already released can still own live layers.
    this.#releaseLivePlates(itemId);
    // §14 (LOOKS) parity — and the look, by the same rule: a re-used itemId must enter its
    // template’s AUTHORED default, never the look some earlier row left behind.
    this.#activeLooks.delete(itemId);
    // R-011 parity — the override dies with the item.
    this.#positions.delete(itemId);
    // B-070 parity — the producer dies with the item.
    this.#loaded.delete(itemId);
    // …so the layer it held reads EMPTY on the next sweep. Settled BEFORE the
    // binding is released, since the binding is how the layer is found.
    this.#settleSlotObservation(itemId, 'empty');
    // R-021 stage 3 parity — and so does any FIXED binding (the bridge's
    // `#releaseSlot`): the slot stays in the bank, unbound and re-loadable, and
    // the row stops naming an item that is no longer on the stack.
    this.#releaseFixedBinding(itemId);
    return { accepted: true };
  }

  /** Drop `itemId`'s fixed binding, if it holds one, and republish. */
  #releaseFixedBinding(itemId: string): void {
    for (const [layer, bound] of this.#fixedBindings) {
      if (bound.itemId !== itemId) continue;
      this.#fixedBindings.delete(layer);
      this.fixedStateChanged.emit(this.fixedLayersState());
      return;
    }
  }

  /**
   * The mock's stand-in for the NEXT OSC SWEEP.
   *
   * On the real bridge the wire observation is not something a command writes —
   * it is what the tap reports a moment later. A `CG ADD` puts an html producer
   * on the layer and the next sweep says so; a `CLEAR` destroys it and the next
   * sweep reports the layer empty. Without modelling that, the mock's rows kept
   * reading "occupied — html producer" forever after a CLEAR, which is the exact
   * class of divergence B-070 was: a UI built and tested against semantics the
   * bridge does not have.
   *
   * Only ever touches a layer the mock itself holds a BINDING for. A foreign
   * producer's layer (71's ffmpeg) is not ours to narrate, and an unbound row's
   * observation must keep coming from the seed alone.
   */
  #settleSlotObservation(itemId: string, kind: 'producer' | 'empty'): void {
    for (const [layer, bound] of this.#fixedBindings) {
      if (bound.itemId !== itemId) continue;
      this.#fixedObservations.set(
        layer,
        kind === 'empty' ? { kind: 'empty' } : { kind: 'producer', producer: 'html' },
      );
      this.fixedStateChanged.emit(this.fixedLayersState());
      return;
    }
  }

  /**
   * R-011 parity — the bridge's set-position contract: refused while the
   * item is on air or unsettled (position is fixed once taken), stored
   * otherwise. The offline mock renders nothing, so storing is the whole
   * effect; the on-air runtime behavior is integration-tested bridge-side.
   */
  setPosition(
    itemId: string,
    position: Position,
  ): { ok: boolean; reason?: 'on-air' | 'unknown-item' } {
    const item = this.#find(itemId);
    if (item === null) return { ok: false, reason: 'unknown-item' };
    if (isOnAirStatus(item)) {
      return { ok: false, reason: 'on-air' };
    }
    this.#positions.set(itemId, position);
    // B-072 parity — republish so the renderer learns the applied override
    // (the bridge marks dirty here for the same reason).
    this.#emitStack();
    return { ok: true };
  }

  /** R-011 — the stored override for an item (test/diagnostic surface). */
  positionOf(itemId: string): Position | undefined {
    return this.#positions.get(itemId);
  }

  /**
   * R-048 parity — the bridge's swap contract, minus the wire.
   *
   * The offline mock has no producers, so recording the override IS the whole
   * effect here; the on-air behaviour (a REPLACE with no preceding CLEAR, the
   * refit, the audio intent) is integration-tested bridge-side against the AMCP
   * mock, which is the only place it can be observed at all.
   *
   * ⚠ **It deliberately does NOT refuse an on-air item, and that is the contract
   * rather than an omission** — `setPosition` above refuses one because moving a
   * live graphic mid-shot is a different act. Patching around a dead feed is the
   * ENTIRE use of this verb, so refusing on air would refuse it in the only
   * situation it exists for.
   */
  swapLiveSource(
    itemId: string,
    plateId: string,
    sourceId: string | null,
    /** Session BM — absent is the emergency patch (every look); present is one look's binding. */
    lookId?: string,
  ): { ok: boolean; reason?: string; message?: string } {
    const item = this.#find(itemId);
    if (item === null) return { ok: false, reason: 'unknown-item' };
    if (lookId !== undefined) {
      const bindings: Record<string, Record<string, string>> = {
        ...this.#lookSourceBindings.get(itemId),
      };
      const forLook: Record<string, string> = { ...bindings[lookId] };
      if (sourceId === null) delete forLook[plateId];
      else forLook[plateId] = sourceId;
      if (Object.keys(forLook).length === 0) delete bindings[lookId];
      else bindings[lookId] = forLook;
      if (Object.keys(bindings).length === 0) this.#lookSourceBindings.delete(itemId);
      else this.#lookSourceBindings.set(itemId, bindings);
      this.#emitStack();
      return { ok: true };
    }
    const next: Record<string, string> = { ...this.#sourceOverrides.get(itemId) };
    if (sourceId === null) delete next[plateId];
    else next[plateId] = sourceId;
    // An EMPTY map is no override at all: keeping one would publish
    // `sourceOverride: {}` and make a row back on its assignment look substituted.
    if (Object.keys(next).length === 0) this.#sourceOverrides.delete(itemId);
    else this.#sourceOverrides.set(itemId, next);
    this.#emitStack();
    return { ok: true };
  }

  /**
   * §14 (LOOKS) Stage E parity — **the look this row is SHOWING**, resolved exactly as
   * the bridge's `#activeLookOf` resolves it: the operator's pick, else the authored
   * default, else the first look. `undefined` when the template authors no looks.
   *
   * 🔴 The same three-step chain in the same order, deliberately. A mock that resolved it
   * differently would put a different look in the picker from the one a take enters, and
   * test mode would be rehearsing a switch the real console does not make.
   */
  resolvedActiveLook(itemId: string): string | undefined {
    const item = this.#find(itemId);
    if (item === null) return undefined;
    const live = this.#templates.get(item.templateId)?.liveSources;
    const looks = live?.looks ?? [];
    if (looks.length === 0) return undefined;
    const wanted = this.#activeLooks.get(itemId);
    return (
      looks.find((l) => l.id === wanted)?.id ??
      looks.find((l) => l.id === live?.defaultLookId)?.id ??
      looks[0]?.id
    );
  }

  /**
   * §14 (LOOKS) Stage E parity — switch this row to another AUTHORED look.
   *
   * The refusals mirror the bridge because the picker is built against them: an item the
   * stack does not carry, and a look the template does not author. A mock that accepted
   * either would teach the surface that any string is a look.
   */
  setActiveLook(
    itemId: string,
    lookId: string,
  ): { ok: boolean; reason?: string; message?: string } {
    const item = this.#find(itemId);
    if (item === null) {
      return { ok: false, reason: 'unknown-item', message: 'That item is not on the stack.' };
    }
    const looks = this.#templates.get(item.templateId)?.liveSources?.looks ?? [];
    if (!looks.some((l) => l.id === lookId)) {
      return {
        ok: false,
        reason: 'unknown-look',
        message: `This template has no look called "${lookId}".`,
      };
    }
    /*
      `tasks.md` 7.9 — the bridge records the look only once the PAGE has been told, so that a
      refused switch leaves nothing for a later `swapLiveSource` to act on. This is the same
      rule, arriving at the same place from the other end: the offline mock has no wire and no
      served page, so there is nothing that can disagree and recording IS the whole action.
      ⚠ Do NOT "restore parity" by adding refusal handling here — there is no refusal to
      handle, and inventing one would make the mock model a failure the offline path cannot
      have.
    */
    this.#activeLooks.set(itemId, lookId);
    this.#emitStack();
    return { ok: true };
  }

  /** R-048 — the stored override for an item (test/diagnostic surface). */
  sourceOverrideOf(itemId: string): Readonly<Record<string, string>> | undefined {
    return this.#sourceOverrides.get(itemId);
  }

  /**
   * C-015 (6.5f) parity — record a plate's AUDIO INTENT.
   *
   * The offline mock has no producers, so recording the intent IS the whole effect;
   * the wire assertion (`MIXER … VOLUME`) is integration-tested bridge-side.
   *
   * ⚠ **A volume of `0` is RECORDED, not treated as a delete.** It is the operator
   * saying "mute this plate", which is a different state from never having said
   * anything — and folding them together here would make the mock teach the UI a
   * model the bridge does not have, which is exactly what this parity guard exists
   * to prevent (B-070 / B-072).
   */
  setPlateVolume(
    itemId: string,
    plateId: string,
    volume: number,
  ): { ok: boolean; reason?: string } {
    if (this.#find(itemId) === null) return { ok: false, reason: 'unknown-item' };
    if (!Number.isFinite(volume) || volume < 0 || volume > 1)
      return { ok: false, reason: 'invalid-volume' };
    this.#plateVolumes.set(itemId, { ...this.#plateVolumes.get(itemId), [plateId]: volume });
    this.#emitStack();
    return { ok: true };
  }

  /**
   * `add-multibox-audio` parity — the MAP of plate volumes, applied as ONE action.
   *
   * Composes {@link setPlateVolume} exactly as the bridge composes its own writer, so the
   * offline console cannot teach the UI a model the bridge does not have (the B-070 / B-072
   * parity rule). There is no lock here because there is no wire and no reconcile to
   * interleave with — the bridge's `#withLiveSeatLock` exists to keep a look switch out of
   * the middle of a SOLO, and the offline mock has neither.
   *
   * ⚠ **One outcome per plate**, like the bridge: a SOLO that lands three plates and is
   * refused on the fourth must not report as a plain success or a plain failure.
   */
  setPlateVolumes(
    itemId: string,
    volumes: Readonly<Record<string, number>>,
  ): { ok: boolean; results: { plateId: string; ok: boolean; reason?: string }[] } {
    const results = Object.entries(volumes).map(([plateId, volume]) => {
      const verdict = this.setPlateVolume(itemId, plateId, volume);
      return {
        plateId,
        ok: verdict.ok,
        ...(verdict.reason !== undefined && { reason: verdict.reason }),
      };
    });
    return { ok: results.every((r) => r.ok), results };
  }

  /**
   * PANIC parity — silence every plate the (mock) LEDGER holds a seat for.
   *
   * 🔴 **SCOPED FROM `liveLayersState()`, not from the stack, and that IS the parity that
   * matters here.** The bridge answers this from its ledger precisely so that a row whose
   * STATUS does not say "on air" — the boot-adoption window, `B-145` (once misnamed the
   * `exitRehearse` window; rehearse seats nothing, `B-216`) — is still silenced. A mock that
   * scoped it from `isOnAir` would teach the UI a model the bridge does not have, which is the
   * `B-070` / `B-072` class this parity guard exists for.
   *
   * The offline mock has no wire, so `silenced` and `recorded` are the same number: recording
   * the intent IS the whole effect. ⚠ Do NOT "restore parity" by inventing a held/sent split
   * here — the mock's seed carries a HELD row, but modelling a send it cannot make would be a
   * fiction, and the wire behaviour is integration-tested bridge-side where it can be observed.
   */
  silenceAllLivePlates(): {
    ok: boolean;
    silenced: number;
    recorded: number;
    rows: { itemId: string; plates: number }[];
    failed: { itemId: string; plateId: string; reason: string }[];
  } {
    const byItem = new Map<string, Set<string>>();
    for (const layer of this.liveLayersState()) {
      const plates = byItem.get(layer.itemId) ?? new Set<string>();
      plates.add(layer.sourceId);
      byItem.set(layer.itemId, plates);
    }
    const rows: { itemId: string; plates: number }[] = [];
    let recorded = 0;
    for (const [itemId, plates] of byItem) {
      rows.push({ itemId, plates: plates.size });
      for (const plateId of plates) {
        this.#plateVolumes.set(itemId, { ...this.#plateVolumes.get(itemId), [plateId]: 0 });
        recorded += 1;
      }
    }
    if (recorded > 0) this.#emitStack();
    // Nothing owed is NOT a success — the same `B-122` rule the bridge applies.
    return { ok: recorded > 0, silenced: recorded, recorded, rows, failed: [] };
  }

  /** C-015 (6.5f) — the stored audio intent for an item (test/diagnostic surface). */
  plateVolumesOf(itemId: string): Readonly<Record<string, number>> | undefined {
    return this.#plateVolumes.get(itemId);
  }

  /** R-010 — OUT + REMOVE everything: clears (simulated) air, empties the list. */
  removeAll(): { ok: boolean; removed: number; errorCode?: string } {
    // `R-017` parity — all-or-nothing, decided before the first removal (see the bridge's
    // `removeAll` for why a per-item refusal inside the loop would half-empty the stack and
    // then report that nothing happened).
    if (this.#stack.some(isOnAirStatus)) {
      return { ok: false, removed: 0, errorCode: REMOVE_ON_AIR_CODE };
    }
    const removed = this.#stack.length;
    for (const item of this.#stack) {
      this.#audit.unshift(auditEntry('remove', this.#auditItem(item.itemId, item.templateId)));
      // B-056 parity — every item's removal resolves its warning.
      this.#resolveOwnedOccupancy(item.itemId);
    }
    this.#stack = [];
    this.#emitStack();
    return { ok: true, removed };
  }

  /**
   * Take every item off air, and KEEP it on the stack (it settles to idle).
   *
   * ⭐ **B-122 — NO STATUS PREDICATE, matching the bridge.** This used to filter on
   * everything-not-`idle`/`loaded`, mirroring the bridge's old candidate set. That set was
   * the defect: it gated the emergency control on precisely the values that may be wrong in
   * the emergency, and returned a SUCCESS having sent nothing. The owner's decision
   * (2026-08-12) is that a clear goes to every row the console holds, whatever it believes —
   * including the merely-`loaded` ones. ⚠ Do not reintroduce a status filter here; the mock
   * demonstrating a narrower Clear-All than the bridge is how the wrong behaviour gets
   * "confirmed" in test mode.
   *
   * The bridge's remaining filter is "holds a bound slot" — an OWNERSHIP fact, not a belief,
   * and its broadcast-safety point is that we clear only the layers we allocated and never a
   * channel. The mock allocates NO slots and reaches NO server: there is no wire, no channel
   * and no program feed to protect, so every row is addressable and `attempted` is simply the
   * stack length. Applying the bridge's slot filter here would make Clear-All a permanent
   * no-op in the one mode where it needs to be exercisable.
   *
   * `refused` is always empty: the Live Source ledger is a bridge-side structure and the mock
   * has none. The field is reported rather than omitted so the shape is identical either way.
   */
  clearAll(): {
    ok: boolean;
    cleared: number;
    attempted: number;
    refused: { itemId: string; reason: LayerClearReason }[];
  } {
    const addressable = [...this.#stack];
    for (const item of addressable) {
      this.out(item.itemId);
    }
    const attempted = addressable.length;
    // Nothing owed is not a success — the honest shape the operator's toast reads.
    return { ok: attempted > 0, cleared: attempted, attempted, refused: [] };
  }

  // ── R-021 stage 2a: fixed-bank parity ───────────────────────────────
  // Mirrors the bridge's fidelity level for `connections.set-config`: the
  // mock APPLIES and publishes; it does NOT re-implement the store's
  // validators (the bridge is the authority; this is explicit test mode).
  #fixedBank: FixedLayerBank | null = seedFixedBank();
  // R-021 stage 2b — per-layer observations, test-seed only (see seedFixedObservations):
  // the offline mock has no OSC, so outside the seed this map stays EMPTY and
  // every slot honestly reads `unknown`.
  readonly #fixedObservations = seedFixedObservations();
  // R-021 stage 3 — the bridge's LayerManager fixed BINDING, modelled: layer →
  // the item bound to it. The mock allocates no real layers, so this map IS its
  // `fixedBinding`, and `loadFixed` is the only thing that writes to it.
  // R-028 (3.1) — `templateId` rides along so the published binding carries
  // identity, exactly like the bridge's registry join.
  readonly #fixedBindings = new Map<
    number,
    { itemId: string; templateType: string; templateId: string }
  >(seedFixedBindings());

  // R-028 part B — the declared playout layers, test-seeded like the bank.
  readonly #playoutObservations = seedPlayoutLayers();
  // B-145 (2.8) parity — the seated Live Source layers, e2e-seeded like the bank.
  readonly #liveLayerSeed = seedLiveLayers();
  /**
   * Which items currently have their plates SEATED.
   *
   * Seeded from the catalogue at construction, which models the real `B-145` case: a
   * console attaching to a bridge that already has plates on air. From then on it is
   * driven by the SAME verbs the bridge hooks — see the note on `#seatLivePlates`.
   */
  #liveSeatedItems = new Set(seedLiveLayers().map((r) => r.itemId));

  fixedLayersConfig(): FixedLayerBank | null {
    return this.#fixedBank;
  }

  /** R-028 part B — the declared playout layers and what is observed on them. */
  playoutLayersState(): PlayoutLayerState[] {
    return [...this.#playoutObservations.entries()]
      .sort(([a], [b]) => a - b)
      .map(([layer, observed]) => ({ channel: 1, layer, observed }));
  }
  /**
   * `B-145` acceptance 1, display half (2.8) parity — the Live Source layers the
   * mock believes it has seated.
   *
   * ⚠ **FILTERED BY THE STACK, so the seed cannot outlive its row.** On air a
   * live layer is released when its item is stopped or removed, so a mock ledger
   * that stayed put after the operator removed the row would show a seated layer
   * with no owner — i.e. it would fake the STRANDED state, the one thing in this
   * list that means an emergency. Deriving presence from `#stack` makes release
   * fall out of the model instead of needing its own verb, and keeps the offline
   * console incapable of showing an alarm it cannot really be in.
   */
  liveLayersState(): LiveLayerState[] {
    return this.#liveLayerSeed.filter((r) => this.#liveSeatedItems.has(r.itemId));
  }

  /**
   * 🔴 **THE MOCK RELEASES ON THE SAME THREE VERBS THE BRIDGE DOES, AND THAT LIST IS
   * THE WHOLE POINT.**
   *
   * A first cut filtered the seed by STACK MEMBERSHIP, which looks like release but
   * models only `remove`. On air `teardownLiveLayers` is awaited by `#stopItemImpl`
   * (*"the plates come down WITH the graphic"*) and by `#outImpl` (*"THE LIVE LAYERS
   * COME DOWN FIRST, THEN THE GRAPHIC"*) as well — so after a STOP or an OUT the real
   * console shows nothing on those layers while the mock went on reporting a guest
   * "On screen". A mock that teaches a different — and more dangerous — mental model
   * than air is precisely what `playoutClear`’s parity note forbids.
   */
  /**
   * SESSION BP parity — the template's `{plate → catalog id}` as the store has it NOW.
   *
   * Read through `sourceAssignments()`, which prunes against the catalog in force, so the
   * snapshot a mock take freezes is the same answer a mock read would have given — never a
   * raw `localStorage` peek that could pin a plate the catalog has already retired.
   */
  #assignmentMapFor(templateId: string): Record<string, string> {
    const map: Record<string, string> = {};
    for (const a of this.sourceAssignments().assignments) {
      if (a.templateId === templateId) map[a.plateId] = a.sourceId;
    }
    return map;
  }

  /**
   * SESSION BP parity — off air, so level 2 resolves live again. ONE method for both verbs
   * that take a row off, exactly as the bridge's `#thawAssignment` is; the mock's sends
   * always land, so there is no failure branch to mirror here.
   */
  #thawAssignment(itemId: string): void {
    this.#frozenAssignments.delete(itemId);
  }

  #seatLivePlates(itemId: string): void {
    if (!this.#liveLayerSeed.some((r) => r.itemId === itemId)) return;
    if (this.#liveSeatedItems.has(itemId)) return;
    this.#liveSeatedItems.add(itemId);
    this.liveLayersChanged.emit(this.liveLayersState());
  }

  #releaseLivePlates(itemId: string): void {
    if (!this.#liveSeatedItems.delete(itemId)) return;
    this.liveLayersChanged.emit(this.liveLayersState());
  }

  /**
   * R-028 part B parity — the deliberate playout clear, with the bridge's gate
   * modelled EXACTLY, because the gate is what the operator UI is built
   * against: not reserved → `not-reserved`; unverifiable or absent occupancy →
   * `unknown-occupancy`; any non-`html` kind → `not-html`, naming what was
   * seen. A mock that cleared freely would teach test mode a different — and
   * more dangerous — mental model than air.
   */
  playoutClear(
    channel: number,
    layer: number,
  ): { ok: boolean; reason?: PlayoutClearReason; observedProducer?: string } {
    const observed = this.#playoutObservations.get(layer);
    if (observed === undefined) return { ok: false, reason: 'not-reserved' };
    if (observed.kind === 'unknown') return { ok: false, reason: 'unknown-occupancy' };
    // Distinct from unknown: the tap LOOKED and found nothing there.
    if (observed.kind === 'empty') return { ok: false, reason: 'already-empty' };
    if (observed.producer !== 'html') {
      return { ok: false, reason: 'not-html', observedProducer: observed.producer };
    }
    this.#playoutObservations.set(layer, { kind: 'empty' });
    this.playoutStateChanged.emit(this.playoutLayersState());
    void channel;
    return { ok: true };
  }

  setFixedLayers(next: FixedLayerBank): { ok: boolean; message?: string } {
    this.#fixedBank = next;
    this.fixedConfigChanged.emit(next);
    this.fixedStateChanged.emit(this.fixedLayersState());
    return { ok: true };
  }

  /**
   * R-021 stage 3 parity — the EXACT-SLOT load. The bridge resolves the layer
   * through `LayerManager.bindFixed`; the mock has no LayerManager, so
   * `#fixedBindings` stands in for it — but the REFUSALS are modelled exactly,
   * because they are what the operator UI is built against: a coordinate
   * outside the declared bank is `not-fixed` (this path is never a door onto an
   * arbitrary layer) and an already-bound slot is `slot-bound` (rebinding is
   * Remove-then-load, two explicit steps). An unregistered template refuses
   * with the same `unknown-template` the bridge answers.
   *
   * `slot-bound` MIRRORS THE BRIDGE'S OCCUPANCY RULE, not the old binding one.
   * A CLEARed row keeps its binding and loses its producer, and putting the
   * row's own template back is exactly the load that must succeed there — so a
   * mock that refused it would teach test mode the defect this change removes.
   * Rebinding to a DIFFERENT item is still refused whatever the layer says.
   * `#loaded` is the producer signal here as it is bridge-side.
   *
   * On acceptance the item joins the stack exactly as `load()` builds it — the
   * fixed row is a second surface onto an ORDINARY stack item, never a parallel
   * item kind — and the per-slot state republishes so the row names it.
   */
  loadFixed(
    channel: number,
    layer: number,
    itemId: string,
    templateId: string,
    fields: FieldValues,
  ): { accepted: boolean; errorCode?: string } {
    const template = this.#templates.get(templateId);
    if (template === undefined) return { accepted: false, errorCode: 'unknown-template' };
    const bank = this.#fixedBank;
    // `B-201` — BOTH halves. This read `layer < bank.start + bank.count`, the operator half
    // alone, so every bed row answered `not-fixed` — and a bed row is exactly where a
    // plate-declaring package is the ONLY thing the picker will let an operator put.
    const inBank = bank !== null && isFixedBankLayer(bank, channel, layer);
    if (!inBank) return { accepted: false, errorCode: 'not-fixed' };
    const bound = this.#fixedBindings.get(layer);
    // R-022 parity — the LOAD interlock, and the mock must hold it for the same
    // reason it holds `take`'s: if test mode allowed a load the real bridge
    // refuses, the interlock would be exercised nowhere in the suite and the UI
    // would be built against semantics the bridge does not have.
    if (bound !== undefined && this.#rehearsing.has(bound.itemId)) {
      return { accepted: false, errorCode: 'rehearsing' };
    }
    // A different item may never take a bound row — Remove-then-load, two steps.
    if (bound !== undefined && bound.itemId !== itemId) {
      return { accepted: false, errorCode: 'slot-bound' };
    }
    // The same item may not re-load over its OWN live producer; CLEAR first.
    if (bound !== undefined && this.#loaded.has(itemId)) {
      return { accepted: false, errorCode: 'slot-bound' };
    }

    this.#fixedBindings.set(layer, { itemId, templateType: template.templateType, templateId });
    this.load(itemId, templateId, fields);
    this.fixedStateChanged.emit(this.fixedLayersState());
    return { accepted: true };
  }

  /**
   * The BANK-SCOPED layer clear, with the bridge's guard modelled EXACTLY — because
   * the guard is what the operator UI is built against, and a mock that cleared more
   * freely than air would teach test mode a more dangerous mental model than the real
   * thing.
   *
   * Permission is STRUCTURAL and comes from two facts, both required: the layer is in
   * the DECLARED bank (`start`..`start+count-1` on the bank's channel — never the
   * VISIBLE rows, since a tick is a display concern), and the layer is NOT reserved.
   * Reserved is checked FIRST so it wins even if the two sets ever overlapped.
   *
   * It consults NO occupancy and NO binding, which is the whole point: those are the
   * things that may be wrong when the operator needs this. So an `unknown` observation
   * does not block it, and an unticked in-bank row is still clearable.
   */
  clearBankLayer(
    channel: number,
    layer: number,
  ): { ok: boolean; reason?: 'not-in-bank' | 'reserved' | 'amcp-error'; message?: string } {
    // The reserved set is channel-agnostic here exactly as it is on the bridge.
    if (this.#playoutObservations.has(layer)) {
      return {
        ok: false,
        reason: 'reserved',
        message: `layer ${String(layer)} is inside the reserved playout range`,
      };
    }
    const bank = this.#fixedBank;
    // `B-201` — BOTH halves (see `loadFixed`). A bed row is a declared row of the bank, so
    // the bank-scoped clear must reach it or a bed becomes the one row nothing can clear.
    const inBank = bank !== null && isFixedBankLayer(bank, channel, layer);
    if (!inBank) {
      return {
        ok: false,
        reason: 'not-in-bank',
        message: `${String(channel)}-${String(layer)} is not a layer of the declared bank`,
      };
    }
    // A CLEAR destroys whatever was there. Offline that means: the observation
    // becomes empty, and any binding on the layer is gone — the producer it named
    // no longer exists, so keeping the binding would make the row lie.
    this.#fixedObservations.set(layer, { kind: 'empty' });
    this.#fixedBindings.delete(layer);
    this.fixedStateChanged.emit(this.fixedLayersState());
    return { ok: true };
  }

  /**
   * Per-slot state, offline: there is no OSC and no server, so occupancy is
   * honestly UNKNOWN for every slot (never 'empty' — the B-094 honesty rule).
   * The ONE exception is the e2e observation seed (`seedFixedObservations`) —
   * explicit test mode, empty on a normal boot.
   *
   * R-021 stage 3 — `binding` is real, and (bridge parity) it survives only
   * while the item is still on the stack: a removed item drops the binding, so
   * the row can never keep naming an item that is gone.
   */
  fixedLayersState(): FixedSlotState[] {
    if (this.#fixedBank === null) return [];
    const bank = this.#fixedBank;
    const out: FixedSlotState[] = [];
    /*
      🔴 `B-201` — THE UNION, because that is what the bridge publishes.

      This loop used to run `start … start + count - 1`: the OPERATOR half, and only it. So
      when `single-clock-look-switch` added the bed half, the offline mock kept publishing
      exactly the rows it always had — no bed slots, no "Graphics beds" group head, and no
      row a plate-bearing package could legally be loaded onto. The bank OBJECT had a `low`
      half all along; nothing ever turned it into slots.

      That is the shape to watch for: the two-bank change was careful to make `fixedBankSlots`
      the ONE place the union is computed, and every bridge-side consumer went through it —
      but this parallel loop reconstructed the range from `start`/`count` instead of calling
      it, so it silently opted out of the new half. A range rebuilt by hand is a second
      derivation, and a second derivation is how the mock came to disagree with the bridge
      about which rows exist.
    */
    for (const slot of fixedBankSlots(bank)) {
      const { channel, layer } = slot;
      // Read through `layerAlias`, which answers from the half that OWNS the layer — the
      // two halves keep their own alias records and a merged lookup would make bed 9's key
      // collide with an operator row's on a bank whose numbering happened to overlap.
      const alias = layerAlias(bank, layer);
      const bound = this.#fixedBindings.get(layer);
      // R-028 (3.1) parity — the binding carries WHICH template is on the row
      // as RAW naming facts (id + name + file name), the same join the bridge
      // does with its registry; the renderer resolves the label canonically.
      const boundInfo = bound !== undefined ? this.#templates.get(bound.templateId) : undefined;
      out.push({
        channel,
        layer,
        ...(alias !== undefined ? { alias } : {}),
        observed: this.#fixedObservations.get(layer) ?? { kind: 'unknown' },
        binding:
          bound !== undefined
            ? {
                itemId: bound.itemId,
                templateType: bound.templateType,
                templateId: bound.templateId,
                ...(boundInfo?.name !== undefined && boundInfo.name !== ''
                  ? { templateName: boundInfo.name }
                  : {}),
                ...(boundInfo?.sourceFileName !== undefined && boundInfo.sourceFileName !== ''
                  ? { sourceFileName: boundInfo.sourceFileName }
                  : {}),
                // R-021 stage 4 parity — the bridge publishes this from the ledger
                // its restore decision wrote (`#restoreBlocked`). The offline mock
                // runs no restore, so the SEED stands in for the decision; what
                // matters for parity is that the FIELD exists on this wire and is
                // absent (never `false`) on every other row.
                ...(isSeededBlockedLayer(layer) ? { restoreBlocked: true as const } : {}),
              }
            : null,
      });
    }
    return out;
  }

  // ── connections ─────────────────────────────────────────────────────
  config(): ConnectionConfig {
    return this.#config;
  }

  /**
   * R-010 — mock parity with the bridge's `setConfig`: same on-air gate
   * (playing/on-air/updating/exiting/unconfirmed or pending blocks), health
   * re-derived with/without the backup, and a simulated `exposed` flag for a
   * non-loopback primary. No real sockets — this is the offline mock.
   */
  setConfig(config: ConnectionConfig): {
    ok: boolean;
    // 'apply-in-progress' exists for parity with the serialized bridge apply
    // (fix-setconfig-serve-restart); the synchronous mock can never emit it.
    reason?: 'on-air-block' | 'apply-in-progress' | 'apply-failed';
    message?: string;
    // B-162 — `unreachable` rides here too: the mock is what the browser talks
    // to with no bridge, and a mock whose response shape is missing the fault
    // channel teaches every surface built against it that the fault cannot
    // happen.
    templateServe?: {
      serveHost: string;
      port: number;
      exposed: boolean;
      unreachable?: string[];
    };
  } {
    const unsettled = this.#stack.filter(isOnAirStatus).length;
    if (unsettled > 0) {
      return {
        ok: false,
        reason: 'on-air-block',
        message: `${String(unsettled)} item(s) are on air or unsettled — Clear All takes them off air and keeps the rows.`,
      };
    }
    this.#config = config;
    this.#health = this.#healthFor(config);
    this.#audit.unshift(auditEntry('reconnect', { server: 'primary' }));
    this.configChanged.emit(config);
    this.healthChanged.emit(this.#health);
    return {
      ok: true,
      templateServe: {
        serveHost: '127.0.0.1',
        port: 0,
        // B-162 — the SET, not the primary. The mock serves nothing, so this is
        // only the shape the real bridge reports; deriving it from `servers.A`
        // alone here is the same wrong axis that cost the real one a backup's
        // graphics, and a mock that models the bug teaches it.
        exposed: !configuredHosts(config).every(isLoopbackHost),
        /*
          🔴 ALWAYS EMPTY, AND THAT IS THE HONEST ANSWER RATHER THAN THE LAZY ONE.

          The obvious implementation — derive it from the `serveHost` two lines up —
          reports EVERY remote server as unable to fetch templates, because that
          `127.0.0.1` is a PLACEHOLDER the mock has always printed and not an address
          anything serves from. There is no template HTTP server in the browser at
          all. The mock would then be inventing a fault out of its own stand-in value
          and showing every offline operator a warning about a bridge they are not
          running.

          What the mock simulates is what the REAL bridge would answer for this
          config, and for a remote server the real bridge binds routable and
          advertises a reachable host — so nothing is unreachable. The mock cannot
          simulate the cases where that derivation goes wrong (no LAN interface, a
          `--template-serve-host` typo) because it cannot see this machine's
          interfaces, so it declines to claim one. The panel's warning is exercised
          in `serverSettingsPanel.dom.test.ts`, where the response can be arranged.
        */
        unreachable: [],
      },
    };
  }

  /**
   * `C-024` — the mock's `connections.template-serve`.
   *
   * 🔴 **NO FLAG OVERRIDES AND NO CANDIDATES, and both absences are deliberate.** The browser has
   * no command line to read and no interface list to enumerate, so inventing either would be the
   * same fault `B-162`'s mock note already records one field down: a stand-in value presented as a
   * measurement. An empty `flagOverrides` is the TRUE answer offline — nothing is masking anything
   * — and an empty `candidates` correctly leaves the operator typing, which is what an offline
   * console can honestly offer.
   *
   * The stored value is echoed back because that half IS knowable here: it is what the mock holds.
   */
  templateServeInfo(): {
    serveHost: string;
    port: number;
    exposed: boolean;
    // Mutable arrays, matching what the channel schema infers — the bridge shim assigns this
    // straight into the contract's response type and `readonly` is not assignable to it.
    unreachable: string[];
    flagOverrides: { serveHost?: string; port?: number };
    candidates: string[];
  } {
    const stored = this.#config.templateServeHost?.trim();
    return {
      serveHost: stored !== undefined && stored.length > 0 ? stored : '127.0.0.1',
      port: this.#config.templateServePort ?? 0,
      exposed: !configuredHosts(this.#config).every(isLoopbackHost),
      // Same reasoning as `setConfig`'s field: the mock serves nothing, so it must not
      // invent a fault out of its own placeholder.
      unreachable: [],
      flagOverrides: {},
      candidates: [],
    };
  }

  /** Health derived from the declared servers (backup card only when B exists). */
  #healthFor(config: ConnectionConfig): ConnectionHealth {
    const at = new Date().toISOString();
    return {
      primary: { label: 'A', state: 'healthy', amcpAxisOk: true, oscFreshAt: at },
      ...(config.servers.B !== undefined
        ? { backup: { label: 'B' as const, state: 'healthy' as const, amcpAxisOk: true } }
        : {}),
      currentPrimary: 'A',
      strategy: config.strategy,
    };
  }

  health(): ConnectionHealth {
    return this.#health;
  }

  failover(): { ok: boolean; newPrimary: 'A' | 'B' } {
    // B-046 parity — nothing to fail over to without a declared backup.
    if (this.#config.servers.B === undefined) {
      return { ok: false, newPrimary: this.#health.currentPrimary };
    }
    const newPrimary = this.#health.currentPrimary === 'A' ? 'B' : 'A';
    this.#health = {
      ...seedHealth(newPrimary),
      lastFailover: {
        at: new Date().toISOString(),
        reason: 'manual',
        from: this.#health.currentPrimary,
        to: newPrimary,
      },
    };
    this.#audit.unshift(
      auditEntry('failover', { server: newPrimary === 'A' ? 'primary' : 'backup' }),
    );
    this.healthChanged.emit(this.#health);
    return { ok: true, newPrimary };
  }

  // ── layers (R-009) ──────────────────────────────────────────────────
  orphans(): OrphanLayer[] {
    return [...this.#orphans];
  }

  /**
   * R-009 parity — the mock "clears" a surfaced orphan (removes it and
   * publishes the change), matching the bridge's resolve-on-observed-empty
   * from the operator's point of view. Owned-layer refusal can't be
   * modeled (the mock has no layer slots); the bridge integration tests
   * carry that guard.
   *
   * R-015 parity — the bridge refuses `foreign` unless the layer's FRESH
   * observation reports an `html` producer. The mock's "observation" is its
   * orphan list: a non-`html` orphan refuses, and an unknown coordinate (no
   * observation at all) refuses too — never a blind CLEAR.
   *
   * R-021 stage 2b parity — a FIXED-bank layer's observation lives in
   * `#fixedObservations` instead (fixed layers never surface as orphans, 4.2a).
   * Same predicate, same refusal: only an observed `html` producer clears; the
   * cleared slot settles to observed-empty and republishes, which is the mock's
   * stand-in for the bridge's next-sweep resolve.
   */
  clearLayer(
    channel: number,
    layer: number,
  ): { ok: boolean; reason?: 'owned' | 'foreign' | 'amcp-error' } {
    const bank = this.#fixedBank;
    // `B-201` — BOTH halves (see `loadFixed`). Ours-vs-foreign is decided the same way on a
    // bed row as on an operator row; the half a layer sits in is not part of that question.
    if (bank !== null && isFixedBankLayer(bank, channel, layer)) {
      const observed = this.#fixedObservations.get(layer);
      if (observed?.kind !== 'producer' || observed.producer !== 'html') {
        return { ok: false, reason: 'foreign' };
      }
      this.#fixedObservations.set(layer, { kind: 'empty' });
      this.fixedStateChanged.emit(this.fixedLayersState());
      return { ok: true };
    }
    const observed = this.#orphans.find((o) => o.channel === channel && o.layer === layer);
    if (observed === undefined || observed.producer !== 'html') {
      return { ok: false, reason: 'foreign' };
    }
    this.#orphans = this.#orphans.filter((o) => !(o.channel === channel && o.layer === layer));
    this.orphansChanged.emit(this.orphans());
    return { ok: true };
  }

  /** B-056 — the currently surfaced owned-slot warnings (offline: seed-only). */
  ownedOccupancy(): OwnedOccupancyWarning[] {
    return [...this.#ownedOccupancy];
  }

  /**
   * B-056 parity — drop an item's warning and publish the change. In the
   * offline mock the simulated servers are always healthy, so every
   * out/remove counts as a CLEAR provably landing on the primary.
   */
  #resolveOwnedOccupancy(itemId: string): void {
    const before = this.#ownedOccupancy.length;
    this.#ownedOccupancy = this.#ownedOccupancy.filter((w) => w.itemId !== itemId);
    if (this.#ownedOccupancy.length !== before) {
      this.ownedOccupancyChanged.emit(this.ownedOccupancy());
    }
  }

  // ── lock ────────────────────────────────────────────────────────────
  lockState(): LockState {
    return this.#lock;
  }

  async engage(pin: string): Promise<{ ok: boolean }> {
    this.#lockHash = await sha256Hex(pin);
    this.#lock = { engaged: true, reason: 'operator', engagedAt: new Date().toISOString() };
    this.#audit.unshift(auditEntry('lock-engage', {}));
    this.lockChanged.emit(this.#lock);
    return { ok: true };
  }

  async release(pin: string): Promise<{ ok: boolean; reason?: 'pin-mismatch' | 'not-engaged' }> {
    if (!this.#lock.engaged) return { ok: false, reason: 'not-engaged' };
    if (this.#lockHash !== (await sha256Hex(pin))) return { ok: false, reason: 'pin-mismatch' };
    this.#lock = { engaged: false };
    this.#lockHash = null;
    this.#audit.unshift(auditEntry('lock-release', {}));
    this.lockChanged.emit(this.#lock);
    return { ok: true };
  }

  // ── templates ───────────────────────────────────────────────────────
  templateGet(templateId: string): TemplateInfo | null {
    return this.#templates.get(templateId) ?? null;
  }

  templateList(): TemplateInfo[] {
    return [...this.#templates.values()];
  }

  /**
   * Register a verified template (R-001). The renderer has already run
   * `@cg/vcg-format.verify` + `unpack` on the uploaded `.vcg`; we just extend
   * the in-memory registry so `templateGet` / `templateList` surface it (and the
   * Inspector picks up its field schema). A re-imported id overwrites the prior
   * entry. No persistence — the registry resets on reload (see design.md).
   */
  templateImport(
    template: TemplateInfo,
    redelivery = false,
  ): { registered: boolean; templateId: string; skipped?: boolean } {
    // R-028 part B parity — the same reconciliation rule as the bridge: a
    // re-delivery never resurrects a removal and never overwrites what is held.
    if (redelivery) {
      if (this.#removedTemplateIds.has(template.templateId)) {
        return { registered: false, templateId: template.templateId, skipped: true };
      }
    } else {
      this.#removedTemplateIds.delete(template.templateId);
    }
    this.#templates.set(template.templateId, template);
    // R-028 (o1) parity — the catalogue push every browser converges on.
    this.templatesChanged.emit(this.templateList());
    this.fixedStateChanged.emit(this.fixedLayersState());
    return { registered: true, templateId: template.templateId };
  }

  /**
   * R-005 — remove a template. Mirrors the bridge's refuse-while-referenced predicate
   * against the mock's OWN stack, so offline behaves exactly like a live bridge (the B-074
   * parity guard exists because a drifted mock is how a UI ships against a contract the
   * bridge never honors).
   */
  templateRemove(templateId: string): {
    ok: boolean;
    reason?: 'in-use' | 'unknown-template';
    message?: string;
    references?: TemplateReference[];
  } {
    if (!this.#templates.has(templateId)) {
      return {
        ok: false,
        reason: 'unknown-template',
        message: `Template “${templateId}” is not registered.`,
      };
    }

    // `B-212` parity — WHERE each item is, through the ONE shared wording, against
    // the mock's own bank; a mock that only counted would teach test mode the
    // sentence the real station no longer says.
    const references: TemplateReference[] = this.#stack
      .filter((i) => i.templateId === templateId)
      .map((i) => {
        const slot = this.#slotFor(i.itemId);
        return { itemId: i.itemId, ...(slot !== null && { slot }) };
      });
    if (references.length > 0) {
      return {
        ok: false,
        reason: 'in-use',
        message: describeTemplateReferences(references, this.#fixedBank),
        references,
      };
    }

    this.#templates.delete(templateId);
    this.#removedTemplateIds.add(templateId);
    // R-028 (o1) parity — the catalogue push every browser converges on.
    this.templatesChanged.emit(this.templateList());
    return { ok: true };
  }

  // ── audit ───────────────────────────────────────────────────────────
  /**
   * B-141 parity — the offline mock's audit IS in memory and IS working, so it
   * reports a configured, healthy, path-less instrument.
   *
   * `path: null` is the honest answer rather than a fake filename: there is no
   * file, and the panel must never send an operator hunting for one. `configured:
   * true` is equally honest — entries really are being recorded here, so an empty
   * list in test mode genuinely does mean "nothing happened yet", which is exactly
   * the distinction this method exists to let the panel draw.
   */
  auditHealth(): {
    configured: boolean;
    path: string | null;
    errorCount: number;
    lastError: string | null;
  } {
    return { configured: true, path: null, errorCount: 0, lastError: null };
  }

  auditRecent(limit = 200, action?: AuditEntry['action'], actor?: string): AuditEntry[] {
    let rows = this.#audit;
    if (action !== undefined) rows = rows.filter((r) => r.action === action);
    if (actor !== undefined) rows = rows.filter((r) => r.actor === actor);
    return rows.slice(0, limit);
  }

  // ── settings ────────────────────────────────────────────────────────
  /**
   * D-137 / C-015 parity — the installation's SOURCE CATALOG.
   *
   * The bridge persists it to a file of its own; the offline mock has no disk,
   * so it uses `localStorage` — the closest thing test mode has to "survives a
   * restart", and the same store the delimiters already use.
   *
   * ⚠ AN ABSENT/UNUSABLE STORE FALLS BACK TO THE EMPTY CATALOG, never to a
   * seeded one. The delimiters fall back to the shipped defaults because an
   * empty picker is a dead end; a seeded CATALOG would be the opposite mistake —
   * test mode would show sources this plant does not have, which is exactly the
   * kind of thing R-006 forbids the mock from wearing.
   */
  sourceCatalog(): SourceCatalog {
    return readStored(SOURCE_CATALOG_KEY, SourceCatalogSchema, EMPTY_SOURCE_CATALOG);
  }

  /** D-137 / C-015 parity — which catalog entry each template's each plate uses. */
  sourceAssignments(): SourceAssignments {
    // PRUNED on every read, against the catalog in force. `localStorage` is two
    // independently-writable keys, so the same disagreement the bridge meets
    // between two files can happen here — and it must resolve the same way, or
    // test mode would show a plate as bound that the real station shows as not.
    const stored = readStored(
      SOURCE_ASSIGNMENTS_KEY,
      SourceAssignmentsSchema,
      EMPTY_SOURCE_ASSIGNMENTS,
    );
    return pruneAssignmentsForCatalog(stored, this.sourceCatalog()).value;
  }

  /**
   * Mirrors the bridge's refusals exactly, because it IS the bridge's validator:
   * `checkSourceCatalog` lives in `@cg/shared-ipc` so the mock cannot come to
   * refuse something the real station allows, or allow something it refuses.
   *
   * The DELETE cascade is the bridge's too (`pruneAssignmentsForCatalog`), and
   * it is here rather than in the UI for the same reason: a plate left dangling
   * in test mode is a rehearsal of the on-air failure this prevents.
   */
  setSourceCatalog(next: SourceCatalog): {
    ok: boolean;
    reason?: SourcesSetConfigReason;
    message?: string;
    droppedAssignments?: TemplateSourceAssignment[];
  } {
    const verdict = checkSourceCatalog(next, {
      fixedBank: this.#fixedBank,
      // The mock declares no playout reservation — there is no playout system
      // behind it to fence off.
      reservedLayers: [],
    });
    if (!verdict.ok) return verdict;
    // ⚠ READ THE ASSIGNMENTS FIRST. `sourceAssignments()` prunes against the
    // catalog IN FORCE, so reading it after the write would return the already-
    // pruned set and report NOTHING dropped — the deletion would cascade
    // silently, which is the one thing this report exists to prevent.
    const before = this.sourceAssignments();
    writeStored(SOURCE_CATALOG_KEY, next);
    this.sourceCatalogChanged.emit(next);
    const pruned = pruneAssignmentsForCatalog(before, next);
    if (pruned.dropped.length > 0) {
      writeStored(SOURCE_ASSIGNMENTS_KEY, pruned.value);
      this.sourceAssignmentsChanged.emit(pruned.value);
      return { ok: true, droppedAssignments: [...pruned.dropped] };
    }
    return { ok: true };
  }

  /** Mirrors the bridge's assignment refusals, from the same shared validator. */
  setSourceAssignments(next: SourceAssignments): {
    ok: boolean;
    reason?: SourcesSetAssignmentsReason;
    message?: string;
  } {
    const verdict = checkSourceAssignments(next, { catalog: this.sourceCatalog() });
    if (!verdict.ok) return verdict;
    writeStored(SOURCE_ASSIGNMENTS_KEY, next);
    this.sourceAssignmentsChanged.emit(next);
    return { ok: true };
  }

  /**
   * R-034 parity — the delimiter list. The bridge persists it to DISK; the
   * offline mock has no disk, so it uses `localStorage` — which is the closest
   * thing test mode has to "survives a restart", and the same store the mock
   * already uses for settings.
   */
  delimitersList(): DelimiterOption[] {
    try {
      const raw = localStorage.getItem(DELIMITERS_KEY);
      if (raw !== null) {
        const parsed = DelimiterOptionSchema.array().safeParse(JSON.parse(raw));
        if (parsed.success && parsed.data.length > 0) return parsed.data;
      }
    } catch {
      // Unusable storage falls through to the defaults — never an empty picker.
    }
    return [...DEFAULT_DELIMITERS];
  }

  /** Mirrors the bridge's refusals exactly, so the UI meets one behaviour. */
  delimitersSet(delimiters: readonly DelimiterOption[]): {
    ok: boolean;
    reason?: 'empty-list' | 'duplicate-value';
    message?: string;
  } {
    if (delimiters.length === 0) {
      return {
        ok: false,
        reason: 'empty-list',
        message: 'At least one delimiter must remain — a split field needs something to split on.',
      };
    }
    const seen = new Set<string>();
    for (const d of delimiters) {
      if (seen.has(d.value)) {
        return {
          ok: false,
          reason: 'duplicate-value',
          message: `“${d.value}” appears twice — two delimiters that split identically cannot be told apart.`,
        };
      }
      seen.add(d.value);
    }
    try {
      localStorage.setItem(DELIMITERS_KEY, JSON.stringify(delimiters));
    } catch {
      // Persistence lost, the session's list is not.
    }
    this.delimitersChanged.emit([...delimiters]);
    return { ok: true };
  }

  /**
   * R-030 parity — the channel raster. The bridge persists it to DISK; the
   * offline mock has no disk, so it uses `localStorage`, exactly as the
   * delimiter list does.
   *
   * `observed` reports the mode the mock itself is configured for, so the
   * verdict reads `match`. That is not the mock flattering itself: a simulated
   * MISMATCH would be pixel-identical on screen to a real server contradicting
   * config, and R-006 forbids the mock wearing a signal that means a real server
   * said something.
   */
  channelSettingsState(): ChannelSettingsState {
    return {
      settings: [{ channel: MOCK_CHANNEL, raster: this.#mockRaster() }],
      observed: [
        {
          channel: MOCK_CHANNEL,
          mode: MOCK_VIDEO_MODE,
          raster: videoModeRaster(MOCK_VIDEO_MODE) ?? null,
        },
      ],
    };
  }

  #mockRaster(): ChannelRaster {
    try {
      const raw = localStorage.getItem(CHANNEL_SETTINGS_KEY);
      if (raw !== null) {
        const parsed = ChannelRasterSchema.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data;
      }
    } catch {
      // Unusable storage falls through to the reference raster — the same
      // fallback the bridge's store uses, so the two never diverge on default.
    }
    return { ...REFERENCE_RASTER };
  }

  /** Mirrors the bridge's refusals exactly, so the UI meets one behaviour. */
  setChannelSettings(settings: ChannelSettings): {
    ok: boolean;
    reason?: (typeof CHANNEL_SETTINGS_SET_REASONS)[number];
    message?: string;
  } {
    // Same gate, same wording, same predicate shape as the bridge: changing the
    // raster re-scales every graphic on the channel.
    const unsettled = this.#stack.filter(isOnAirStatus).length;
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
    if (settings.channel !== MOCK_CHANNEL) {
      return {
        ok: false,
        reason: 'unknown-channel',
        message: `Channel ${String(settings.channel)} is not declared by this install (declared: ${String(MOCK_CHANNEL)}).`,
      };
    }
    try {
      localStorage.setItem(CHANNEL_SETTINGS_KEY, JSON.stringify(settings.raster));
    } catch {
      // Persistence lost, the session's raster is not.
    }
    this.channelSettingsChanged.emit(this.channelSettingsState());
    return { ok: true };
  }

  /**
   * R-022 parity — REHEARSE.
   *
   * Mirrors the bridge's guards EXACTLY, including the fail-closed on-air rule.
   * The mock has no AMCP socket, so it cannot fail the mute and never returns
   * `mute-failed` — which is an honest gap and not a modelled behaviour: test mode
   * simply has no layer to leave unmuted. Everything the UI branches on is here.
   */
  rehearseState(): Rehearsal[] {
    return [...this.#rehearsing.values()].sort(
      (a, b) => a.channel - b.channel || a.layer - b.layer,
    );
  }

  enterRehearse(itemId: string): {
    ok: boolean;
    reason?: (typeof REHEARSE_ENTER_REASONS)[number];
    message?: string;
  } {
    const item = this.#find(itemId);
    if (item === null) {
      return { ok: false, reason: 'unknown-item', message: 'That item is not on the stack.' };
    }
    if (this.#rehearsing.has(itemId)) return { ok: true };
    // Fail closed: `unconfirmed`/`pending` mean the on-air result is UNKNOWN, and
    // an unknown must never be muted on a guess. Not "the same status list as the
    // bridge's" any more — literally the same function (`operator-surface` §5(B)).
    if (isOnAirStatus(item)) {
      return {
        ok: false,
        reason: 'on-air',
        message:
          'That graphic is on air or unsettled. Take it off air before rehearsing it — ' +
          'rehearse mutes the layer, and muting a live graphic is not something this will do.',
      };
    }
    // Bridge parity — a RESIDENT PRODUCER is no longer required. Rehearse renders
    // the bound template locally; the layer is not an input to that render, and
    // requiring it made a CLEARed row un-rehearsable while a STOPped one was fine.
    // The mock sends no AMCP at all, so the bridge's mute branch has no analogue
    // here: what it mirrors is the PRECONDITION, which is the binding.
    const slot = this.#slotFor(itemId);
    if (slot === null) {
      // The binding IS the precondition, so its absence is a real refusal — and it
      // is `unknown-item`, matching the bridge's own missing-slot answer. Inventing
      // a layer number would put a false coordinate on the wire, which a second
      // browser would then read as fact.
      return {
        ok: false,
        reason: 'unknown-item',
        message: 'That item is not bound to a layer, so there is nothing to rehearse.',
      };
    }
    this.#rehearsing.set(itemId, { itemId, channel: slot.channel, layer: slot.layer });
    this.rehearseChanged.emit(this.rehearseState());
    return { ok: true };
  }

  /**
   * `B-211` parity — an audit entry names the LAYER the item was on, exactly as the
   * bridge's `#itemDetail` does (the pre-state, read before the verb runs). The Audit
   * panel turns that into the row's name; a mock that recorded no slot would be the
   * one build where the log could not name a row.
   */
  #auditItem(itemId: string, templateId: string): Partial<AuditEntry> {
    const slot = this.#slotFor(itemId);
    return {
      itemId,
      templateId,
      ...(slot !== null && { slot: { ...slot, server: 'primary' as const } }),
    };
  }

  /** The fixed layer this item is bound to, or null when the mock knows of none. */
  #slotFor(itemId: string): { channel: number; layer: number } | null {
    for (const [layer, bound] of this.#fixedBindings) {
      if (bound.itemId === itemId) return { channel: this.#fixedBank?.channel ?? 1, layer };
    }
    return null;
  }

  exitRehearse(itemId: string): { ok: boolean; reason?: 'unknown-item'; message?: string } {
    if (!this.#rehearsing.delete(itemId)) {
      return { ok: false, reason: 'unknown-item', message: 'That item is not rehearsing.' };
    }
    this.rehearseChanged.emit(this.rehearseState());
    return { ok: true };
  }

  settingsGet(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw !== null) return JSON.parse(raw) as Settings;
    } catch {
      /* fall through to default */
    }
    return { telemetry: 'off' };
  }

  settingsSet(patch: Partial<Settings>): Settings {
    const next: Settings = { ...this.settingsGet(), ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* non-persistent fallback is acceptable */
    }
    this.settingsChanged.emit(next);
    return next;
  }

  // ── update gate ─────────────────────────────────────────────────────
  updateRequest(
    version: string,
    notes?: string,
  ): {
    accepted: true;
    deferred: boolean;
    pending: PendingUpdate;
  } {
    const onAir = this.#stack.some((i) => i.status === 'on-air' || i.status === 'playing');
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
  #find(itemId: string): StackItemState | null {
    return this.#stack.find((i) => i.itemId === itemId) ?? null;
  }

  #patch(itemId: string, patch: Partial<StackItemState>): void {
    this.#stack = this.#stack.map((i) => (i.itemId === itemId ? { ...i, ...patch } : i));
    this.#emitStack();
  }

  #transition(itemId: string, status: StackItemStatus, pending: boolean): void {
    this.#patch(itemId, { status, pending });
  }

  /**
   * Simulated ack-settlement of the B-044 pending-intent contract: a transient
   * intent (`playing`+pending / `updating` / `exiting`) settles to its
   * underlying state when its own round-trip acks — here a 160 ms beat stands
   * in for the WS + AMCP round-trip. Mirrors the bridge Reconciler's
   * settle-on-ack (update → the underlying on-air state; out → `idle`); the
   * real path additionally expires to `unconfirmed` after 5 s without an ack —
   * the mock never loses acks, so it has no unconfirmed path.
   */
  #settle(itemId: string, status: StackItemStatus): void {
    setTimeout(() => {
      const item = this.#find(itemId);
      if (item === null || !item.pending) return;
      this.#patch(itemId, { status, pending: false });
    }, 160);
  }

  #emitStack(): void {
    this.stackChanged.emit(this.stackSnapshot());
  }
}

function auditEntry(action: AuditEntry['action'], extra: Partial<AuditEntry>): AuditEntry {
  /*
    B-141 follow-up — the mock records the SAME actor the real bridge would: this
    console's declared name, or `unattributed` when it has none. A mock that kept
    writing the old `'operator'` literal would make the offline console the one place
    where the audit column disagrees with every other build, and the parity is the
    point of this mock's audit at all.
  */
  return {
    ts: new Date().toISOString(),
    actor: operatorActorForWire(),
    action,
    outcome: 'ok',
    ...extra,
  };
}

/**
 * R-009 — e2e-only orphan seed: with `window.CG_E2E_ORPHAN` armed (via
 * addInitScript, alongside the CG_E2E flag) the offline mock boots with one
 * surfaced orphan so Playwright can drive the banner + Clear flow. The
 * bridge-side truth (real OSC tap + sweep) is integration-tested.
 *
 * R-015 — the seed also carries one VIDEO layer (`ffmpeg`, the program feed
 * on layer 1) so Playwright can assert the neutral, Clear-less presentation
 * beside the html orphan's warning strip.
 */
function seedOrphans(): OrphanLayer[] {
  const flagged = (globalThis as { CG_E2E_ORPHAN?: boolean }).CG_E2E_ORPHAN === true;
  return flagged
    ? [
        { channel: 1, layer: 60, producer: 'html', since: new Date().toISOString() },
        { channel: 1, layer: 1, producer: 'ffmpeg', since: new Date().toISOString() },
      ]
    : [];
}

/**
 * B-056 — e2e-only owned-slot warning seed: with `window.CG_E2E_OWNED_OCCUPANCY`
 * armed the offline mock boots with one warning against a seeded stack item so
 * Playwright can drive the banner + Out/Remove remedy. The bridge-side truth
 * (load-time detection off the real OSC tap) is integration-tested.
 *
 * The itemId MUST name a row that `seedStack()` actually creates — the remedy
 * the E2E drives is removing that row.
 */
function seedOwnedOccupancy(): OwnedOccupancyWarning[] {
  const flagged =
    (globalThis as { CG_E2E_OWNED_OCCUPANCY?: boolean }).CG_E2E_OWNED_OCCUPANCY === true;
  return flagged
    ? [
        {
          channel: 1,
          layer: 10,
          itemId: 'item-irib-news',
          producer: 'html',
          since: new Date().toISOString(),
        },
      ]
    : [];
}

/** Is the R-021 e2e fixed-bank seed armed (via addInitScript, like CG_E2E_ORPHAN)? */
function fixedBankSeedArmed(): boolean {
  return (globalThis as { CG_E2E_FIXED_BANK?: boolean }).CG_E2E_FIXED_BANK === true;
}

/**
 * R-021 stage 2b — e2e-only fixed-bank seed: with `window.CG_E2E_FIXED_BANK`
 * armed the offline mock boots with a declared bank so Playwright can drive
 * the visible flow (permanent rows, aliases, the verb split, the confirm-gated
 * Clear). UNSEEDED, the mock has no bank — the panel renders nothing, exactly
 * like today.
 */
function seedFixedBank(): FixedLayerBank | null {
  if (!fixedBankSeedArmed()) return null;
  /*
    🔴 `B-202` — THE BED HALF IS TAKEN FROM THE CANONICAL DEFAULT, then deviated from
    DELIBERATELY and in the open.

    It used to be the literal `{ start: 1, count: 9 }` with a comment claiming it showed
    "both groups exactly as a real station does". That was false in the only way that
    matters: `visibility` was ABSENT, and `isLayerVisible` reads absent as VISIBLE, so the
    mock showed NINE bed rows where `defaultFixedLayerBank()` shows two. A restated literal
    cannot notice when the thing it restates changes — which is the whole reason the schema
    grew this half in the first place — so `start`/`count` now come from the one function
    that owns them, and the E2E's deviation is a named override rather than an omission.

    ⚠ THE DEVIATION, and why it is not the drift above: every bed row is TICKED, because
    Playwright reaches a row by CLICKING its `LOAD`, and a hidden row is not rendered to
    click. This is the same trade the operator half already makes deliberately — twenty rows
    instead of the default five, for exactly the same reason and documented directly below.
    The difference between the two is that this one now SAYS `visibility`, so the next reader
    meets a decision instead of a default they have to know the semantics of.
  */
  const defaults = defaultFixedLayerBank();
  const low = defaults.low;
  const lowVisibility: Record<string, boolean> = {};
  // The bed rows come from the ONE enumeration, filtered by the ONE predicate —
  // never `low.start … low.start + low.count` by hand (`P-039`'s guard flagged
  // exactly that here, the same shape `B-201` found four times in this file).
  for (const { layer } of fixedBankSlots(defaults)) {
    if (isLowBankLayer(defaults, layer)) lowVisibility[String(layer)] = true;
  }
  return {
    channel: 1,
    low: { start: low.start, count: low.count, visibility: lowVisibility },
    start: 70,
    // R-028 — EIGHTEEN rows, not four. 70–73 keep the four documented
    // display cases (html / non-html / empty / unknown); 74–85 are seeded
    // EMPTY so the E2E suite has rows it can actually LOAD onto; 86–87
    // carry the seed's two remaining stack items. Since part B's occupancy
    // gate refuses a load onto anything not observably empty — an unbound
    // row can still carry a live graphic — one empty row would let exactly
    // one spec load, once.
    // R-021 stage 4 — NINETEEN. Layer 88 is the `restore-blocked` row: bound,
    // observed carrying a producer that is not ours, and the item waiting. It
    // needs its own row because every other case is already spoken for, and
    // because the property under test is a BOUND row over a FOREIGN producer —
    // which none of 70–87 models (71 is foreign but unbound).
    // §14.5 Stage E — TWENTY. Layer 89 carries the LOOK-BEARING row, and it needs
    // its own for the same reason 88 did: the property under test is a row whose
    // template AUTHORS LOOKS, and no other seeded row has one, so the picker would
    // have nowhere to render. It is also why 70 must stay look-less — the spec that
    // proves a picker is ABSENT where there are no looks reads that row.
    count: 20,
    aliases: {
      '70': 'CLOCK',
      '71': 'LOWER THIRD',
      // `B-224` — the LONGEST real row name (a plant alias, from the owner's screenshot),
      // seeded so the E2E can hold the NAME column to it at the narrower panel width.
      '73': 'میانبرنامه روی انتن',
      '86': 'TICKER',
      '87': 'LOGO BUG',
      '88': 'STUDIO FEED',
      '89': 'DEBATE',
    },
  };
}

/**
 * R-021 stage 2b — the seed's per-layer observations, covering all four
 * display cases (html / non-html producer / empty / unknown) so Playwright can
 * assert the verb split and the honest wording. The offline mock has no OSC,
 * so WITHOUT the seed this map is empty and every slot reads `unknown` — the
 * bridge-side truth (real tap + sweep) is integration-tested in
 * tools/caspar-bridge.
 */
function seedFixedObservations(): Map<number, FixedSlotObservation> {
  return fixedBankSeedArmed()
    ? new Map<number, FixedSlotObservation>([
        [70, { kind: 'producer', producer: 'html' }],
        [71, { kind: 'producer', producer: 'ffmpeg' }],
        [72, { kind: 'empty' }],
        [73, { kind: 'unknown' }],
        // Loadable rows for the E2E flows (see `seedFixedBank`). Without an
        // explicit `empty` these default to `unknown`, which the load gate
        // refuses — correctly, but it would leave the suite nowhere to load.
        ...([74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85] as const).map(
          (layer) => [layer, { kind: 'empty' }] as [number, FixedSlotObservation],
        ),
        // 86/87 hold the seed's two IDLE items. Idle means no `CG ADD` has run,
        // so there is no producer and the wire correctly sees an EMPTY layer —
        // a bound row over an empty layer is not a contradiction.
        [86, { kind: 'empty' }],
        [87, { kind: 'empty' }],
        // R-021 stage 4 — the blocked row's layer, held by somebody else's feed.
        // A kind our system never places, so "not html" is decidable from the wire
        // alone (video kinds are never enumerated).
        [88, { kind: 'producer', producer: 'decklink' }],
        /*
          🔴 `B-201` — THE BED ROWS ARE LOADABLE TOO, and they have to be seeded to be.

          `single-clock-look-switch` made a plate-declaring package refusable on an operator
          row (`wrong-bank`), so every spec that loads one now has to reach a BED row — and a
          bed row with no observation reads `unknown`, which the occupancy gate refuses for a
          completely different reason. Two refusals in a row, the second only visible after
          fixing the first, is how one broken spec turns into two rounds of work.

          Seeded from the bank rather than a literal range, so widening the bed half in
          `seedFixedBank` cannot leave rows behind that the picker offers and the gate then
          refuses.
        */
        ...(() => {
          const bank = seedFixedBank();
          if (bank === null) return [];
          const beds: [number, FixedSlotObservation][] = [];
          for (const { layer } of fixedBankSlots(bank)) {
            if (isLowBankLayer(bank, layer)) beds.push([layer, { kind: 'empty' }]);
          }
          return beds;
        })(),
      ])
    : new Map();
}

/**
 * R-028 part B — the e2e playout-layer seed, armed by the SAME flag as the
 * fixed bank. It covers all THREE occupant cases the tab must distinguish, and
 * they are the cases the safety gate turns on:
 *
 *   60 — an `html` producer      → clearable (the playout graphics case)
 *   61 — an `ffmpeg` producer    → NOT clearable, and no control at all: a
 *        video on a playout layer is the antenna/live-channel accident the
 *        reservation exists to prevent
 *   62 — `unknown`               → NOT clearable: occupancy cannot be
 *        verified, and unknown is never treated as empty
 *   63 — `empty`                 → nothing there, nothing offered
 *
 * The offline mock has no OSC, so UNSEEDED there are no reserved layers at all
 * and the tab does not appear — the bridge-side truth is integration-tested in
 * tools/caspar-bridge.
 */
function seedPlayoutLayers(): Map<number, FixedSlotObservation> {
  return fixedBankSeedArmed()
    ? new Map<number, FixedSlotObservation>([
        [60, { kind: 'producer', producer: 'html' }],
        [61, { kind: 'producer', producer: 'ffmpeg' }],
        [62, { kind: 'unknown' }],
        [63, { kind: 'empty' }],
      ])
    : new Map();
}
/**
 * `B-145` (2.8) — e2e-only Live Source ledger seed, armed by the SAME flag as the
 * fixed bank and for the same reason.
 *
 * UNSEEDED the offline mock's ledger is EMPTY, and that is the honest state rather
 * than a gap: the mock has no CasparCG, its source catalog starts empty on purpose
 * (`sourceCatalog()` — *"a seeded CATALOG… would show sources this plant does not
 * have"*), and it declares no layer band, so it has seated nothing. This mirrors
 * `seedPlayoutLayers` exactly, whose own note says the bridge-side truth is
 * integration-tested in `tools/caspar-bridge` rather than faked here.
 *
 * ARMED, it seats two plates for the seeded news row so Playwright can drive the
 * visible flow — a multi-box carrier with one plate ON SCREEN and one HELD, which
 * are the two dispositions §12.4 defines and the only pair whose difference the
 * list has to make legible.
 *
 * 🔴 **Both rows name `item-irib-news`, an item `seedStack()` actually carries.**
 * A seed whose `itemId` matched no row would render as STRANDED — the one state
 * that means "a live face is on air and no row can reach it" — and test mode would
 * teach an alarm that is not true of it. The mock cannot strand a layer, and it
 * must not appear to.
 *
 * Both rows are `unverified: false`: the mock never restarts and never adopts a file,
 * so it has no unconfirmed records to model. A seed that claimed otherwise would put a
 * demotion on screen that test mode can never actually be in.
 *
 * The band is 10–11, inside `SUGGESTED_LIVE_SOURCE_LAYER_RANGE` (10–59) and
 * disjoint from the seeded fixed bank at 70+, exactly as a real install's
 * validator requires.
 */
function seedLiveLayers(): LiveLayerState[] {
  return fixedBankSeedArmed()
    ? [
        {
          channel: 1,
          layer: 10,
          itemId: 'item-irib-news',
          sourceId: 'guest-1',
          role: 'fill',
          producer: 'route://1-1',
          held: false,
          unverified: false,
        },
        {
          channel: 1,
          layer: 11,
          itemId: 'item-irib-news',
          sourceId: 'guest-2',
          role: 'fill',
          producer: 'route://1-2',
          held: true,
          unverified: false,
        },
      ]
    : [];
}

/**
 * R-028 — bind the SEEDED stack items to seeded rows.
 *
 * Before part B the mock's seeded stack rendered in its own Stack panel, so it
 * was visible without belonging to any layer. Now an item is only visible ON a
 * row: the stack panel is gone and the row IS the surface. Without this the
 * seed existed but showed nowhere, which is both a lie about the model and the
 * reason several E2E specs had nothing to click.
 *
 * Bound to 70 and 71 — the two rows the seed already gives producers, so the
 * binding and the observation agree the way they would on a real bridge.
 */
/**
 * R-021 stage 4 — the `restore-blocked` row's own seeded item, e2e-only.
 *
 * Deliberately NOT added to `seedStack()`: that seed is the offline mock's ordinary
 * stack for every user, and a fourth row would change what an operator sees with no
 * flag armed. This one exists only while `CG_E2E_FIXED_BANK` is set, beside the
 * bank it belongs to.
 *
 * It is seeded `on-air` because that is the whole point of the state: retention
 * brings the item back as it last was, so a row that simply published its status
 * would wear the broadcast colour over a layer we have proven is carrying a
 * decklink. BLOCKED has to outrank it, and the E2E has to be able to see that.
 */
const BLOCKED_SEED = {
  layer: 88,
  itemId: 'item-blocked-restore',
  templateType: 'clock',
} as const;

/** The blocked row's stack item, or [] when the bank seed is not armed. */
export function seedBlockedStackItem(): StackItemState[] {
  if (!fixedBankSeedArmed()) return [];
  const templateId = seedStack()[0]?.templateId ?? 'irib-news';
  return [
    {
      itemId: BLOCKED_SEED.itemId,
      templateId,
      fields: {},
      status: 'on-air',
      pending: false,
      slot: { channel: 1, layer: BLOCKED_SEED.layer, server: 'primary' },
    },
  ];
}

/**
 * §14.5 Stage E — an e2e-only LOOK-BEARING template and the row that carries it.
 *
 * Armed by the SAME flag as the bank and the live-layer ledger, and for the same reason
 * `BLOCKED_SEED` gives: this is not the offline mock’s ordinary furniture, and an extra
 * row would change what every user sees with no flag set. Armed, it is the only way
 * Playwright can drive the picker at all — no starter template authors looks.
 *
 * THREE looks with DISJOINT membership between two of them (`left` {1,2} vs `right`
 * {3,4}), because that is the switch shape that actually exercises release-and-seat in
 * one reconcile; a subset pair would let a broken switch look fine.
 */
const LOOKS_SEED = {
  layer: 89,
  itemId: 'item-looks',
  templateId: 'e2e-looks',
  templateType: 'custom',
} as const;

const LOOKS_BOX = (x: number, y: number) => ({ x, y, width: 480, height: 270 });

/** The look-bearing template, or [] when the seed is not armed. */
export function seedLooksTemplate(): TemplateInfo[] {
  if (!fixedBankSeedArmed()) return [];
  const keys = ['live-1', 'live-2', 'live-3', 'live-4'];
  const all = Object.fromEntries(
    keys.map((k, i) => [k, LOOKS_BOX((i % 2) * 480, Math.floor(i / 2) * 270)]),
  );
  const pick = (ks: string[]) => Object.fromEntries(ks.map((k) => [k, all[k]]));
  return [
    {
      templateId: LOOKS_SEED.templateId,
      name: 'Debate — 4 box',
      templateType: LOOKS_SEED.templateType,
      fields: [],
      liveSources: {
        resolution: { width: 1920, height: 1080 },
        defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
        sources: keys.map((k) => ({
          elementId: `el-${k}`,
          sourceId: k,
          rect: all[k],
          dynamic: false,
        })),
        looks: [
          {
            id: 'left',
            name: 'Left pair',
            entered: { mode: 'cut' },
            rects: pick(['live-1', 'live-2']),
          },
          {
            id: 'right',
            name: 'Right pair',
            entered: { mode: 'cut' },
            rects: pick(['live-3', 'live-4']),
          },
          { id: 'all', name: 'All four', entered: { mode: 'cut' }, rects: all },
        ],
        defaultLookId: 'left',
      },
    } as TemplateInfo,
  ];
}

/** The look-bearing row’s stack item, or [] when the seed is not armed. */
export function seedLooksStackItem(): StackItemState[] {
  if (!fixedBankSeedArmed()) return [];
  return [
    {
      itemId: LOOKS_SEED.itemId,
      templateId: LOOKS_SEED.templateId,
      fields: {},
      status: 'on-air',
      pending: false,
      slot: { channel: 1, layer: LOOKS_SEED.layer, server: 'primary' },
    },
  ];
}

function seedFixedBindings(): [
  number,
  { itemId: string; templateType: string; templateId: string },
][] {
  if (!fixedBankSeedArmed()) return [];
  const types = ['clock', 'ticker', 'logo-bug'];
  // 70 takes the seed's LOADED item, because 70 is the row observed as an html
  // producer and a loaded item HAS one — binding and wire agree. The two IDLE
  // items go on 86/87, observed empty, for the same reason in reverse. 71–73
  // stay UNBOUND so they keep modelling the foreign-producer / empty / unknown
  // display cases cleanly.
  const layers = [70, 86, 87];
  const bindings: [number, { itemId: string; templateType: string; templateId: string }][] =
    seedStack().map((item, i) => [
      layers[i] ?? 89 + i,
      { itemId: item.itemId, templateType: types[i] ?? 'custom', templateId: item.templateId },
    ]);
  // §14.5 Stage E — and the look-bearing row, so the picker has somewhere to render.
  for (const item of seedLooksStackItem()) {
    bindings.push([
      LOOKS_SEED.layer,
      {
        itemId: item.itemId,
        templateType: LOOKS_SEED.templateType,
        templateId: item.templateId,
      },
    ]);
  }
  // R-021 stage 4 — and the blocked row, bound over a foreign producer.
  for (const item of seedBlockedStackItem()) {
    bindings.push([
      BLOCKED_SEED.layer,
      {
        itemId: item.itemId,
        templateType: BLOCKED_SEED.templateType,
        templateId: item.templateId,
      },
    ]);
  }
  return bindings;
}

/** Is this seeded layer the e2e `restore-blocked` row? */
function isSeededBlockedLayer(layer: number): boolean {
  return fixedBankSeedArmed() && layer === BLOCKED_SEED.layer;
}
