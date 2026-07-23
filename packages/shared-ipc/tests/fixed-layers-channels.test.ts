import { describe, expect, it } from 'vitest';
import {
  FIXED_LAYERS_SET_CONFIG_REASONS,
  FixedLayersSetConfigChannel,
  FixedSlotStateSchema,
} from '../src/index.js';

/**
 * R-021 stage 2a — the fixed-bank wire contract (S1/S2).
 *
 * S2 note: the validator's `FixedLayersErrorCode` in
 * `tools/caspar-bridge/src/fixed-layers-store.ts` is DERIVED from
 * `FIXED_LAYERS_SET_CONFIG_REASONS` (one definition), and a compile-time
 * both-ways assignability check lives beside the store's tests — so the two
 * cannot drift by construction. This test pins the wire side: the set-config
 * response's `reason` enum is exactly that shared const.
 */

describe('FixedSlotState (S1)', () => {
  const base = { channel: 1, layer: 72, binding: null };

  it('round-trips all three observed kinds', () => {
    for (const observed of [
      { kind: 'unknown' },
      { kind: 'empty' },
      { kind: 'producer', producer: 'decklink' },
    ]) {
      const parsed = FixedSlotStateSchema.parse({ ...base, observed });
      expect(parsed.observed).toEqual(observed);
    }
  });

  it('rejects an unknown observation kind', () => {
    expect(FixedSlotStateSchema.safeParse({ ...base, observed: { kind: 'mystery' } }).success).toBe(
      false,
    );
  });

  it('rejects a producer observation without its producer kind', () => {
    expect(
      FixedSlotStateSchema.safeParse({ ...base, observed: { kind: 'producer' } }).success,
    ).toBe(false);
  });

  it('carries alias and a (stage-3) binding when present', () => {
    const parsed = FixedSlotStateSchema.parse({
      ...base,
      alias: 'ساعت',
      observed: { kind: 'empty' },
      binding: { itemId: 'item-1', templateType: 'clock' },
    });
    expect(parsed.alias).toBe('ساعت');
    expect(parsed.binding).toEqual({ itemId: 'item-1', templateType: 'clock' });
  });
});

describe('set-config reason union (S2)', () => {
  it('the response reason enum is exactly the shared reason const', () => {
    const reasonSchema = FixedLayersSetConfigChannel.response.shape.reason.unwrap();
    expect([...reasonSchema.options].sort()).toEqual([...FIXED_LAYERS_SET_CONFIG_REASONS].sort());
  });
});
