import type { AuditEntry, Position, StackItemState, StackItemStatus } from '@cg/shared-schema';
import type {
  ConnectionConfig,
  ConnectionHealth,
  FixedLayerBank,
  FixedSlotObservation,
  FixedSlotState,
  LockState,
  OrphanLayer,
  OwnedOccupancyWarning,
  PendingUpdate,
  PLAYOUT_CLEAR_REASONS,
  PlayoutLayerState,
  Settings,
  TemplateInfo,
  DelimiterOption,
} from '@cg/shared-ipc';
import { DelimiterOptionSchema } from '@cg/shared-ipc';
import { Emitter } from './emitter.js';
import { isLoopbackHost } from '../shared/loopback.js';
import { seedConfig, seedHealth, seedStack, seedTemplates } from './seed.js';

/** R-028 part B — the mock mirrors the bridge's refusal union exactly. */
type PlayoutClearReason = (typeof PLAYOUT_CLEAR_REASONS)[number];

type FieldValues = StackItemState['fields'];

const SETTINGS_KEY = 'cg-runtime:settings';
const DELIMITERS_KEY = 'cg-runtime:delimiters';

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
  // R-034 parity — the shared delimiter list.
  readonly delimitersChanged = new Emitter<DelimiterOption[]>();

  #stack: StackItemState[] = seedStack();
  #templates = new Map<string, TemplateInfo>(seedTemplates().map((t) => [t.templateId, t]));
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
  // B-070 — producer-existence bookkeeping (bridge parity: the bridge's
  // `#loaded`). A producer lives from load/take until out/remove destroys it.
  // A seeded item that is not idle already has one.
  readonly #loaded = new Set<string>(
    seedStack()
      .filter((i) => i.status !== 'idle')
      .map((i) => i.itemId),
  );

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
      return position === undefined ? { ...i } : { ...i, position };
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
    this.#audit.unshift(auditEntry('load', { itemId, templateId }));
    this.#emitStack();
    return { accepted: true };
  }

  take(itemId: string): { accepted: boolean; errorCode?: string } {
    const item = this.#find(itemId);
    if (item === null) return { accepted: false, errorCode: 'unknown-item' };
    // B-070/B-039 parity — a take with no live producer re-ADDs first, so a
    // producer always exists afterwards.
    this.#loaded.add(itemId);
    this.#settleSlotObservation(itemId, 'producer');
    this.#transition(itemId, 'playing', true);
    this.#audit.unshift(auditEntry('take', { itemId, templateId: item.templateId }));
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
  ): { accepted: boolean; errorCode?: string } {
    const item = this.#find(itemId);
    if (item === null) return { accepted: false, errorCode: 'unknown-item' };
    const merged = mergeMode === 'merge' ? { ...item.fields, ...fields } : fields;

    // No producer on the slot ⇒ commit only, nothing "sent", intent settled
    // (B-044: never rest non-terminal — an unsettled `updating` is the zombie
    // `pending` that used to block setPosition for the item's whole life).
    if (!this.#loaded.has(itemId)) {
      this.#patch(itemId, { fields: merged, pending: false });
      this.#audit.unshift(auditEntry('update', { itemId, templateId: item.templateId }));
      this.#emitStack();
      return { accepted: true };
    }

    const wasOnAir = item.status === 'on-air' || item.status === 'playing';
    this.#patch(itemId, {
      fields: merged,
      status: wasOnAir ? 'updating' : item.status,
      pending: wasOnAir,
    });
    this.#audit.unshift(auditEntry('update', { itemId, templateId: item.templateId }));
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
    this.#audit.unshift(auditEntry('stop', { itemId, templateId: item.templateId }));
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
    this.#audit.unshift(auditEntry('next', { itemId, templateId: item.templateId }));
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
    this.#audit.unshift(auditEntry('out', { itemId, templateId: item.templateId }));
    this.#settle(itemId, 'idle');
    // B-056 parity — the mock's simulated servers are healthy, so an out's
    // CLEAR "lands on the primary": the item's warning provably resolves.
    this.#resolveOwnedOccupancy(itemId);
    return { accepted: true };
  }

  remove(itemId: string): { accepted: boolean } {
    const item = this.#find(itemId);
    this.#stack = this.#stack.filter((i) => i.itemId !== itemId);
    if (item !== null)
      this.#audit.unshift(auditEntry('remove', { itemId, templateId: item.templateId }));
    this.#emitStack();
    // B-056 parity — the item is gone / its layer deallocated.
    this.#resolveOwnedOccupancy(itemId);
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
    // B-072 parity — republish so the renderer learns the applied override
    // (the bridge marks dirty here for the same reason).
    this.#emitStack();
    return { ok: true };
  }

  /** R-011 — the stored override for an item (test/diagnostic surface). */
  positionOf(itemId: string): Position | undefined {
    return this.#positions.get(itemId);
  }

  /** R-010 — OUT + REMOVE everything: clears (simulated) air, empties the list. */
  removeAll(): { ok: boolean; removed: number } {
    const removed = this.#stack.length;
    for (const item of this.#stack) {
      this.#audit.unshift(
        auditEntry('remove', { itemId: item.itemId, templateId: item.templateId }),
      );
      // B-056 parity — every item's removal resolves its warning.
      this.#resolveOwnedOccupancy(item.itemId);
    }
    this.#stack = [];
    this.#emitStack();
    return { ok: true, removed };
  }

  /**
   * Take every ON-AIR item off air, and KEEP it on the stack (it settles to idle).
   *
   * Parity with the real bridge: the same status predicate (everything not `idle`/`loaded` —
   * the row's own Clear gating) and the same per-item `out()`, which in the mock runs the
   * same B-070/B-056 bookkeeping a single Clear does. No new verb, and the list is untouched
   * — that is the whole difference from `removeAll`.
   *
   * It deliberately does NOT also filter on "holds a slot", which the bridge does for
   * broadcast safety (clear only the layers we allocated; never a channel-wide clear). The
   * mock allocates NO slots and reaches NO server — there is no wire, no channel and no
   * program feed to protect here. Adding that filter would simply make Clear-All a no-op in
   * test mode, which is the one place it needs to be exercisable.
   */
  clearAll(): { ok: boolean; cleared: number } {
    const onAir = this.#stack.filter((i) => i.status !== 'idle' && i.status !== 'loaded');
    for (const item of onAir) {
      this.out(item.itemId);
    }
    return { ok: true, cleared: onAir.length };
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
    const inBank =
      bank !== null &&
      channel === bank.channel &&
      layer >= bank.start &&
      layer < bank.start + bank.count;
    if (!inBank) return { accepted: false, errorCode: 'not-fixed' };
    if (this.#fixedBindings.has(layer)) return { accepted: false, errorCode: 'slot-bound' };

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
    const inBank =
      bank !== null &&
      channel === bank.channel &&
      layer >= bank.start &&
      layer < bank.start + bank.count;
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
    const { channel, start, count, aliases } = this.#fixedBank;
    const out: FixedSlotState[] = [];
    for (let layer = start; layer <= start + count - 1; layer++) {
      const alias = aliases?.[String(layer)];
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
    templateServe?: { serveHost: string; port: number; exposed: boolean };
  } {
    const unsettled = this.#stack.filter(
      (i) =>
        i.pending ||
        i.status === 'playing' ||
        i.status === 'on-air' ||
        i.status === 'updating' ||
        i.status === 'exiting' ||
        i.status === 'unconfirmed',
    ).length;
    if (unsettled > 0) {
      return {
        ok: false,
        reason: 'on-air-block',
        message: `${String(unsettled)} item(s) are on air or unsettled — Remove All (or Out each item) first.`,
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
        exposed: !isLoopbackHost(config.servers.A.host),
      },
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
    if (
      bank !== null &&
      channel === bank.channel &&
      layer >= bank.start &&
      layer < bank.start + bank.count
    ) {
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
  } {
    if (!this.#templates.has(templateId)) {
      return {
        ok: false,
        reason: 'unknown-template',
        message: `Template “${templateId}” is not registered.`,
      };
    }

    const referencing = this.#stack.filter((i) => i.templateId === templateId).length;
    if (referencing > 0) {
      return {
        ok: false,
        reason: 'in-use',
        message: `${String(referencing)} stack item(s) still use this template — remove them (or Remove All) first.`,
      };
    }

    this.#templates.delete(templateId);
    this.#removedTemplateIds.add(templateId);
    // R-028 (o1) parity — the catalogue push every browser converges on.
    this.templatesChanged.emit(this.templateList());
    return { ok: true };
  }

  // ── audit ───────────────────────────────────────────────────────────
  auditRecent(limit = 200, action?: AuditEntry['action'], actor?: string): AuditEntry[] {
    let rows = this.#audit;
    if (action !== undefined) rows = rows.filter((r) => r.action === action);
    if (actor !== undefined) rows = rows.filter((r) => r.actor === actor);
    return rows.slice(0, limit);
  }

  // ── settings ────────────────────────────────────────────────────────
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
  return { ts: new Date().toISOString(), actor: 'operator', action, outcome: 'ok', ...extra };
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
  return fixedBankSeedArmed()
    ? {
        channel: 1,
        start: 70,
        // R-028 — EIGHTEEN rows, not four. 70–73 keep the four documented
        // display cases (html / non-html / empty / unknown); 74–85 are seeded
        // EMPTY so the E2E suite has rows it can actually LOAD onto; 86–87
        // carry the seed's two remaining stack items. Since part B's occupancy
        // gate refuses a load onto anything not observably empty — an unbound
        // row can still carry a live graphic — one empty row would let exactly
        // one spec load, once.
        count: 18,
        aliases: { '70': 'CLOCK', '71': 'LOWER THIRD', '86': 'TICKER', '87': 'LOGO BUG' },
      }
    : null;
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
  return seedStack().map((item, i) => [
    layers[i] ?? 88 + i,
    { itemId: item.itemId, templateType: types[i] ?? 'custom', templateId: item.templateId },
  ]);
}
