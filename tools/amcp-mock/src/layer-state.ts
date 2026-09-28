import { FULL_FRAME, type LayerSlot, type LayerState } from './types.js';

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
      backgroundFilePath: '',
      paused: false,
      onAir: false,
      pageResolution: 'resolved',
      // R-022 — a fresh layer is at FULL volume, as on real CasparCG. Defaulting
      // to 0 would have made a missing restore look correct in every test.
      volume: 1,
      // `LOOK-SWITCH-01` — a fresh layer is fully opaque, as on real CasparCG.
      opacity: 1,
      // D-137 — an untouched layer fills the whole frame and masks nothing, which
      // is the identity for both terms. Defaulting to anything smaller would have
      // made a MISSING `MIXER FILL` look like a placed box.
      fill: FULL_FRAME,
      clip: FULL_FRAME,
      // `MEDIA-PLATES-01` — no clip, no clock.
      loop: false,
      clipLengthS: undefined,
      clipElapsedS: 0,
      clipRunningSince: null,
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

/**
 * `MEDIA-PLATES-01` — a clip's elapsed seconds at `now` (ms), as the core's ffmpeg producer keeps
 * it: running time added while playing; at the end, FROZEN at the length (not looping) or wrapped
 * (looping). `undefined` when the layer has no clip clock.
 */
export function clipElapsedAt(layer: LayerState, now: number): number | undefined {
  const length = layer.clipLengthS;
  if (length === undefined) return undefined;
  const running = layer.clipRunningSince === null ? 0 : (now - layer.clipRunningSince) / 1000;
  const raw = layer.clipElapsedS + Math.max(0, running);
  if (raw < length) return raw;
  return layer.loop && length > 0 ? raw % length : length;
}
