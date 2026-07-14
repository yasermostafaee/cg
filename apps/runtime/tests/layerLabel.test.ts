import { describe, expect, it } from 'vitest';
import type { LayerSlot } from '@cg/shared-schema';
import { layerDetail, layerLabel } from '../src/renderer/features/stack/layerLabel.js';

/**
 * The stack row used to say "no slot" for an item that was not on air, and "slot 1-61" for
 * one that was. "Slot" is our word for the LayerManager's (channel, layer) coordinate — an
 * operator has never heard it. The layer is the thing they DO know: it is what CasparCG's
 * own tooling shows them, and what they would clear by hand. So: "no layer", and the real
 * layer number when there is one.
 */

const SLOT: LayerSlot = { channel: 1, layer: 61, server: 'primary' };

describe('layerLabel — the stack row line', () => {
  it('names the real layer the item holds', () => {
    expect(layerLabel(SLOT)).toBe('layer 61');
  });

  it('says "no layer" — not "no slot" — when the item holds none', () => {
    expect(layerLabel(undefined)).toBe('no layer');
  });

  it('never leaks the word "slot" to the operator', () => {
    expect(layerLabel(SLOT)).not.toContain('slot');
    expect(layerLabel(undefined)).not.toContain('slot');
  });

  it('surfaces the layer number itself, not the internal channel-layer pair', () => {
    // The layer IS the slot here: 12 is the number the operator would clear by hand.
    expect(layerLabel({ channel: 2, layer: 12, server: 'both' })).toBe('layer 12');
  });
});

describe('layerDetail — the Inspector line', () => {
  it('adds the rest of the coordinate, for reconciling against CasparCG', () => {
    expect(layerDetail(SLOT)).toBe('layer 61 · channel 1 · primary');
  });

  it('answers the empty case instead of hiding it', () => {
    expect(layerDetail(undefined)).toBe('no layer');
  });
});
