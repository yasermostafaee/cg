import { EventEmitter } from 'node:events';

/**
 * Layer slot allocator per Phase 5 §6.
 *
 * CasparCG's coordinate space is `(channel, layer)`. Channels are global;
 * layers within a channel render bottom-up. Two graphics on the same
 * `(ch, layer)` overwrite each other — which is why the LayerManager
 * exists: partition the space by template type so operators can't
 * accidentally collide.
 *
 * Default policy (configurable per deployment):
 *
 *   logo-bug    : 90–99   (pinned, rarely dynamic)
 *   lower-third : 10–19
 *   ticker      : 20–29
 *   breaking    : 30–39
 *   fullscreen  : 50–59
 *   custom      : 60–69
 *
 * Allocation flow:
 *   1. allocate(templateType, channel) → first free slot in the range.
 *   2. AMCP fires PLAY / CG ADD using the returned slot.
 *   3. OSC `/foreground/producer` flips to 'html' → slot confirmed.
 *   4. On `CG STOP` + `CLEAR`, slot returns to 'empty' → deallocate.
 *
 * Collision detection: if OSC reports a slot occupied that the allocator
 * thinks is free, raise `'collision'` and quarantine the slot until the
 * operator decides to take ownership (CLEAR) or yields.
 */
export type LayerPolicy = Record<string, [low: number, high: number]>;

export const DEFAULT_LAYER_POLICY: LayerPolicy = {
  'logo-bug': [90, 99],
  'lower-third': [10, 19],
  ticker: [20, 29],
  'breaking-news': [30, 39],
  fullscreen: [50, 59],
  custom: [60, 69],
};

export interface LayerSlot {
  readonly channel: number;
  readonly layer: number;
}

export interface PinnedSlot extends LayerSlot {
  readonly templateId: string;
  readonly autoStart: boolean;
}

export interface LayerManagerOptions {
  policy?: LayerPolicy;
  pinned?: readonly PinnedSlot[];
  /**
   * R-021 — FIXED operator slots. Like `pinned`, a fixed slot is fenced from
   * birth: `allocate()` can never return one and `deallocate()` never frees
   * one. UNLIKE `pinned`, a fixed slot is NOT template-pinned — it carries no
   * `templateId`, no `autoStart`, and no auto-start semantics may leak from
   * the pinned path (design.md (c)): it sits EMPTY until the operator binds an
   * item via {@link LayerManager.bindFixed}. A slot declared both pinned and
   * fixed is a config conflict and the constructor THROWS
   * ({@link FixedPinnedConflictError}) — conflicts resolve loudly at startup.
   */
  fixed?: readonly LayerSlot[];
  /**
   * R-028 / C-015 — layer NUMBERS reserved for the playout system, fenced on
   * EVERY channel: `allocate()` never returns one and `reserve()` refuses one
   * (a restore must never put our graphic back onto a playout layer, even if
   * its retained coordinate predates the reservation). Config-declared, never
   * inferred from the wire — a playout graphic and one of ours are
   * indistinguishable there (OSC reports producer kind, not identity).
   */
  reservedLayers?: readonly number[];
}

export interface LayerManagerEvents {
  /** A slot was successfully allocated. */
  allocated: [slot: LayerSlot, templateType: string];
  /** A slot was released back to the free pool. */
  released: [slot: LayerSlot];
  /** OSC reported a slot occupied that we thought was free. */
  collision: [slot: LayerSlot, foreignProducer: string];
  /** Allocation failed because the policy range is exhausted. */
  'out-of-layers': [templateType: string, channel: number];
}

/** Thrown when no slot is available in the policy range. */
export class OutOfLayersError extends Error {
  override readonly name = 'OutOfLayersError';
  constructor(
    readonly templateType: string,
    readonly channel: number,
    /**
     * C-014 — how many in-range slots the failed scan skipped because they
     * were QUARANTINED (foreign-occupied). Lets the load refusal say WHY the
     * range is exhausted: "occupied by another system's output" is actionable
     * in a way a bare "no free layer" is not.
     */
    readonly quarantinedInRange = 0,
  ) {
    super(`No free layer in range for templateType=${templateType} on channel ${String(channel)}`);
  }
}

/** Thrown when a slot is requested for an unknown template type. */
export class UnknownTemplateTypeError extends Error {
  override readonly name = 'UnknownTemplateTypeError';
  constructor(readonly templateType: string) {
    super(`No policy range for templateType=${templateType}`);
  }
}

/**
 * R-021 — thrown by the constructor when one slot is declared BOTH pinned and
 * fixed. The two mechanisms have contradictory semantics (auto-started
 * template vs empty operator slot), so the conflict is refused loudly at
 * startup — the design's governing principle — rather than one silently
 * winning.
 */
export class FixedPinnedConflictError extends Error {
  override readonly name = 'FixedPinnedConflictError';
  constructor(
    readonly slot: LayerSlot,
    message?: string,
  ) {
    super(
      message ??
        `Layer ${String(slot.channel)}-${String(slot.layer)} is declared both PINNED and FIXED — ` +
          `remove it from one of the two sets`,
    );
  }
}

interface SlotState {
  status: 'free' | 'allocated' | 'quarantined';
  templateType?: string;
}

export class LayerManager extends EventEmitter<LayerManagerEvents> {
  private readonly policy: LayerPolicy;
  private readonly pinned: ReadonlyMap<string, PinnedSlot>;
  /**
   * R-021 — the fixed operator slots, fenced from birth (see
   * {@link LayerManagerOptions.fixed}). Mutable ONLY via {@link applyFixed}
   * (live bank changes, stage 2a).
   */
  private readonly fixed: Map<string, LayerSlot>;
  /** R-028 / C-015 — reserved playout layer numbers (channel-agnostic fence). */
  private readonly reservedLayers: ReadonlySet<number>;
  private readonly slots = new Map<string, SlotState>();

  constructor(options: LayerManagerOptions = {}) {
    super();
    this.policy = options.policy ?? DEFAULT_LAYER_POLICY;
    this.reservedLayers = new Set(options.reservedLayers ?? []);
    const pinnedEntries: [string, PinnedSlot][] = [];
    for (const p of options.pinned ?? []) {
      pinnedEntries.push([keyOf(p), p]);
      this.slots.set(keyOf(p), { status: 'allocated', templateType: 'pinned' });
    }
    this.pinned = new Map(pinnedEntries);
    const fixedEntries: [string, LayerSlot][] = [];
    for (const f of options.fixed ?? []) {
      const key = keyOf(f);
      if (this.pinned.has(key)) throw new FixedPinnedConflictError(f);
      fixedEntries.push([key, { channel: f.channel, layer: f.layer }]);
      // Allocated-from-birth so allocate() can never return it — but with NO
      // templateType: a fenced-but-unbound slot is not an allocation, so the
      // allocations() filter skips it until bindFixed() records a binding.
      this.slots.set(key, { status: 'allocated' });
    }
    this.fixed = new Map(fixedEntries);
  }

  /**
   * Try to allocate a slot for `templateType` on `channel`. Returns the
   * lowest free layer in the policy range; throws if exhausted or if the
   * template type is unknown.
   */
  allocate(templateType: string, channel: number): LayerSlot {
    const range = this.policy[templateType];
    if (range === undefined) {
      throw new UnknownTemplateTypeError(templateType);
    }
    const [low, high] = range;
    // C-014 — count the quarantined (foreign-occupied) slots the scan walks
    // past, so an exhausted range can say WHY it is exhausted.
    let quarantinedInRange = 0;
    for (let layer = low; layer <= high; layer++) {
      // R-028 / C-015 — a reserved playout layer is never an allocation
      // candidate, whatever the policy range says (the default policy's
      // `custom` 60–69 is exactly where the playout split lives).
      if (this.reservedLayers.has(layer)) continue;
      const slot = { channel, layer };
      const state = this.slots.get(keyOf(slot));
      if (state === undefined || state.status === 'free') {
        this.slots.set(keyOf(slot), { status: 'allocated', templateType });
        this.emit('allocated', slot, templateType);
        return slot;
      }
      if (state.status === 'quarantined') quarantinedInRange++;
    }
    this.emit('out-of-layers', templateType, channel);
    throw new OutOfLayersError(templateType, channel, quarantinedInRange);
  }

  /**
   * B-092 — reserve an EXACT slot (rather than the lowest free one) for
   * `templateType`. Returns false when the slot is already taken.
   *
   * Restoring retained stack intent after a bridge restart cannot use
   * `allocate()`: the retained slot is the layer the item's producer is
   * actually ON, so it is the layer whose occupancy decides adopt-vs-re-ADD.
   * Re-allocating "some free layer" would consult the wrong layer's occupancy
   * and could ADD a second producer beside a live one. The range policy is
   * deliberately NOT re-checked — the coordinate came from this allocator in a
   * previous process, and honouring it is the whole point.
   *
   * R-021 — a FIXED slot always returns false here: exact-slot binding to a
   * fixed slot goes through {@link bindFixed}, never `reserve()` (a fixed slot
   * is born allocated, so it is never "free" to reserve).
   */
  reserve(slot: LayerSlot, templateType: string): boolean {
    const key = keyOf(slot);
    if (this.fixed.has(key)) return false;
    // R-028 / C-015 — a retained coordinate that now sits in the reserved
    // playout range is refused: honouring it would put our graphic onto a
    // layer the playout system owns.
    if (this.reservedLayers.has(slot.layer)) return false;
    const state = this.slots.get(key);
    if (state !== undefined && state.status !== 'free') return false;
    this.slots.set(key, { status: 'allocated', templateType });
    this.emit('allocated', slot, templateType);
    return true;
  }

  /** Release a slot — caller should invoke this after the slot is observed empty. */
  deallocate(slot: LayerSlot): void {
    const key = keyOf(slot);
    if (this.pinned.has(key)) {
      // Pinned slots don't get released by normal deallocation.
      return;
    }
    if (this.fixed.has(key)) {
      // R-021 — fixed slots stay fenced for the life of the process; unbinding
      // an item goes through unbindFixed(), which keeps the fence.
      return;
    }
    if (!this.slots.has(key)) return;
    this.slots.set(key, { status: 'free' });
    this.emit('released', slot);
  }

  /** True if the slot is currently allocated (or quarantined/pinned). */
  isAllocated(slot: LayerSlot): boolean {
    const s = this.slots.get(keyOf(slot));
    return s !== undefined && s.status !== 'free';
  }

  /** True iff the slot is pinned. */
  isPinned(slot: LayerSlot): boolean {
    return this.pinned.has(keyOf(slot));
  }

  /** R-021 — true iff the slot is a fixed operator slot. */
  isFixed(slot: LayerSlot): boolean {
    return this.fixed.has(keyOf(slot));
  }

  /** R-021 — the fixed operator slots (config-defined; empty until items bind). */
  fixedSlots(): readonly LayerSlot[] {
    return [...this.fixed.values()];
  }

  /**
   * R-021 — bind an item's template type to a FIXED slot (the exact-slot path
   * for fixed slots — `reserve()` refuses them). Returns false when the slot
   * is not fixed or is already bound; on success records the binding and emits
   * `allocated`.
   */
  bindFixed(slot: LayerSlot, templateType: string): boolean {
    const key = keyOf(slot);
    if (!this.fixed.has(key)) return false;
    const state = this.slots.get(key);
    if (state?.templateType !== undefined) return false;
    this.slots.set(key, { status: 'allocated', templateType });
    this.emit('allocated', slot, templateType);
    return true;
  }

  /**
   * R-021 — clear a fixed slot's binding. Emits `released`, but the slot STAYS
   * fenced: it never returns to the dynamic pool.
   */
  unbindFixed(slot: LayerSlot): void {
    const key = keyOf(slot);
    if (!this.fixed.has(key)) return;
    const state = this.slots.get(key);
    if (state?.templateType === undefined) return;
    this.slots.set(key, { status: 'allocated' });
    this.emit('released', slot);
  }

  /** R-021 — the template type bound to a fixed slot, or undefined when unbound. */
  fixedBinding(slot: LayerSlot): string | undefined {
    if (!this.fixed.has(keyOf(slot))) return undefined;
    return this.slots.get(keyOf(slot))?.templateType;
  }

  /**
   * R-021 stage 2a — apply a LIVE bank change (the VALIDATED next bank's
   * slots). New slots are added fenced-and-unbound; slots no longer in the
   * bank return to 'free' (emitting `released`); bound slots may NEVER be
   * removed — that throws {@link FixedPinnedConflictError} as defence in depth
   * BEHIND the store's `shrink-occupied` validator, not a substitute for it.
   * Bound slots that remain in the bank, and pinned slots, are untouched.
   */
  applyFixed(next: readonly LayerSlot[]): void {
    const nextByKey = new Map(next.map((s) => [keyOf(s), s] as const));
    // Pre-flight every check — mutate nothing until all pass.
    for (const [key, slot] of nextByKey) {
      if (this.pinned.has(key)) throw new FixedPinnedConflictError(slot);
    }
    for (const [key, slot] of this.fixed) {
      if (nextByKey.has(key)) continue;
      if (this.slots.get(key)?.templateType !== undefined) {
        throw new FixedPinnedConflictError(
          slot,
          `Layer ${String(slot.channel)}-${String(slot.layer)} is still BOUND and cannot be ` +
            `removed from the fixed bank — unbind it first`,
        );
      }
    }
    // All checks passed — mutate.
    for (const [key, slot] of [...this.fixed]) {
      if (!nextByKey.has(key)) {
        this.fixed.delete(key);
        this.slots.set(key, { status: 'free' });
        this.emit('released', slot);
      }
    }
    for (const [key, slot] of nextByKey) {
      if (this.fixed.has(key)) continue;
      this.fixed.set(key, { channel: slot.channel, layer: slot.layer });
      this.slots.set(key, { status: 'allocated' });
    }
  }

  /**
   * Used by the collision detector to mark a slot as quarantined until resolved.
   *
   * R-021 — a FIXED slot is never quarantined (no-op): a fenced slot is not an
   * allocation candidate (quarantine exists to withdraw layers from the
   * allocatable pool), and a quarantined fixed slot would break bindFixed.
   * Stage 4 derives `restore-blocked` from the OCCUPANCY TAP, not from the
   * quarantine set.
   */
  quarantine(slot: LayerSlot): void {
    const key = keyOf(slot);
    if (this.fixed.has(key)) return;
    const state = this.slots.get(key);
    if (state === undefined) {
      this.slots.set(key, { status: 'quarantined' });
    } else {
      this.slots.set(key, { ...state, status: 'quarantined' });
    }
  }

  /** Returns true if observation matches expectation, false if we have a collision. */
  observe(slot: LayerSlot, producer: 'empty' | 'html' | string): boolean {
    const key = keyOf(slot);
    const state = this.slots.get(key);

    // R-021 — a fixed slot never participates in collision detection: it is not
    // an allocation candidate, so foreign content there is not a "collision
    // with an allocation" (and must not quarantine — see quarantine()). The
    // occupancy itself is stage 4's concern, read from the tap.
    if (this.fixed.has(key)) return true;

    if (producer === 'empty') {
      // Slot is empty on the wire. If we thought it was allocated, that's
      // a stale view — but not a collision; let the caller deallocate.
      if (this.pinned.has(key)) return true;
      if (state !== undefined && state.status === 'allocated') {
        // Allocated but observed empty → caller should deallocate.
        return true;
      }
      return true;
    }

    // Producer is non-empty — slot is loaded on the wire.
    if (state === undefined || state.status === 'free') {
      this.quarantine(slot);
      this.emit('collision', slot, producer);
      return false;
    }
    // We expected it allocated; OSC confirms. No collision.
    return true;
  }

  /**
   * C-014 — the currently QUARANTINED slots (foreign-occupied; excluded from
   * allocation). The bridge's quarantine reconciliation enumerates this to
   * release layers whose foreign observation has gone.
   */
  quarantined(): readonly LayerSlot[] {
    const out: LayerSlot[] = [];
    for (const [key, state] of this.slots) {
      if (state.status === 'quarantined') {
        const slot = parseKey(key);
        if (slot !== null) out.push(slot);
      }
    }
    return out;
  }

  /** All currently-allocated slots (for diagnostics). */
  allocations(): readonly { slot: LayerSlot; templateType: string }[] {
    const out: { slot: LayerSlot; templateType: string }[] = [];
    for (const [key, state] of this.slots) {
      if (state.status === 'allocated' && state.templateType !== undefined) {
        const slot = parseKey(key);
        if (slot !== null) out.push({ slot, templateType: state.templateType });
      }
    }
    return out;
  }

  /** Pinned slots (config-defined; ServerSession auto-plays at startup). */
  pinnedSlots(): readonly PinnedSlot[] {
    return [...this.pinned.values()];
  }
}

function keyOf(slot: LayerSlot): string {
  return `${String(slot.channel)}:${String(slot.layer)}`;
}

function parseKey(key: string): LayerSlot | null {
  const [ch, ly] = key.split(':');
  if (ch === undefined || ly === undefined) return null;
  const channel = Number(ch);
  const layer = Number(ly);
  if (!Number.isFinite(channel) || !Number.isFinite(layer)) return null;
  return { channel, layer };
}
