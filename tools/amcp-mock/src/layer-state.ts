import type { LayerSlot, LayerState } from './types.js';

/**
 * In-memory registry of (channel, layer) → LayerState. The mock owns
 * this; OSC emissions are derived from it on each tick.
 *
 * Keys are `"<channel>:<layer>"` strings — Map is cheaper than nested
 * Maps and the slot space is small in practice.
 */
export class LayerRegistry {
  private readonly slots = new Map<string, LayerState>();

  get(slot: LayerSlot): LayerState {
    const key = keyOf(slot);
    const existing = this.slots.get(key);
    if (existing) return existing;
    const fresh: LayerState = {
      slot: { channel: slot.channel, layer: slot.layer },
      producer: 'empty',
      filePath: '',
      backgroundProducer: 'empty',
      paused: false,
    };
    this.slots.set(key, fresh);
    return fresh;
  }

  /** Returns `undefined` when the slot has never been touched. */
  peek(slot: LayerSlot): LayerState | undefined {
    return this.slots.get(keyOf(slot));
  }

  patch(slot: LayerSlot, patch: Partial<Omit<LayerState, 'slot'>>): LayerState {
    const cur = this.get(slot);
    const next: LayerState = { ...cur, ...patch };
    this.slots.set(keyOf(slot), next);
    return next;
  }

  /** All currently-tracked layers (allocated by any past write). */
  all(): readonly LayerState[] {
    return [...this.slots.values()];
  }
}

function keyOf(slot: LayerSlot): string {
  return `${String(slot.channel)}:${String(slot.layer)}`;
}
