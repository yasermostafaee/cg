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

interface SlotState {
  status: 'free' | 'allocated' | 'quarantined';
  templateType?: string;
}

export class LayerManager extends EventEmitter<LayerManagerEvents> {
  private readonly policy: LayerPolicy;
  private readonly pinned: ReadonlyMap<string, PinnedSlot>;
  private readonly slots = new Map<string, SlotState>();

  constructor(options: LayerManagerOptions = {}) {
    super();
    this.policy = options.policy ?? DEFAULT_LAYER_POLICY;
    const pinnedEntries: [string, PinnedSlot][] = [];
    for (const p of options.pinned ?? []) {
      pinnedEntries.push([keyOf(p), p]);
      this.slots.set(keyOf(p), { status: 'allocated', templateType: 'pinned' });
    }
    this.pinned = new Map(pinnedEntries);
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
    for (let layer = low; layer <= high; layer++) {
      const slot = { channel, layer };
      const state = this.slots.get(keyOf(slot));
      if (state === undefined || state.status === 'free') {
        this.slots.set(keyOf(slot), { status: 'allocated', templateType });
        this.emit('allocated', slot, templateType);
        return slot;
      }
    }
    this.emit('out-of-layers', templateType, channel);
    throw new OutOfLayersError(templateType, channel);
  }

  /** Release a slot — caller should invoke this after the slot is observed empty. */
  deallocate(slot: LayerSlot): void {
    const key = keyOf(slot);
    if (this.pinned.has(key)) {
      // Pinned slots don't get released by normal deallocation.
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

  /** Used by the collision detector to mark a slot as quarantined until resolved. */
  quarantine(slot: LayerSlot): void {
    const key = keyOf(slot);
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
