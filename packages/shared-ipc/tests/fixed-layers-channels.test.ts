import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIXED_BANK_COUNT,
  DEFAULT_FIXED_BANK_START,
  FIXED_LAYERS_SET_CONFIG_REASONS,
  FixedLayerBankSchema,
  FixedLayersSetConfigChannel,
  FixedSlotStateSchema,
  ReservedLayersSchema,
  defaultFixedLayerBank,
  isLayerVisible,
  reservedLayerNumbers,
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

  it('R-028 (3.1) — the binding carries optional template identity, and absence stays valid', () => {
    const withIdentity = FixedSlotStateSchema.parse({
      ...base,
      observed: { kind: 'producer', producer: 'html' },
      binding: {
        itemId: 'item-1',
        templateType: 'clock',
        templateId: 'tpl-1',
        templateName: 'ساعت اذان',
      },
    });
    expect(withIdentity.binding).toMatchObject({ templateId: 'tpl-1', templateName: 'ساعت اذان' });
    // Absent identity is the honest post-restart shape — never required.
    expect(
      FixedSlotStateSchema.safeParse({
        ...base,
        observed: { kind: 'producer', producer: 'html' },
        binding: { itemId: 'item-1', templateType: 'clock' },
      }).success,
    ).toBe(true);
  });
});

describe('R-028 — visibility ticks + the canonical isLayerVisible predicate', () => {
  it('absent record and absent key both mean VISIBLE; only an explicit false hides', () => {
    const bare = FixedLayerBankSchema.parse({
      channel: 1,
      low: { start: 1, count: 9 },
      start: 70,
      count: 4,
    });
    expect(isLayerVisible(bare, 70)).toBe(true);
    const ticked = FixedLayerBankSchema.parse({
      channel: 1,
      low: { start: 1, count: 9 },
      start: 70,
      count: 4,
      visibility: { '71': false, '72': true },
    });
    expect(isLayerVisible(ticked, 70)).toBe(true); // absent key
    expect(isLayerVisible(ticked, 71)).toBe(false); // explicit false
    expect(isLayerVisible(ticked, 72)).toBe(true); // explicit true
  });

  it('visibility keys must be numeric strings', () => {
    expect(
      FixedLayerBankSchema.safeParse({
        channel: 1,
        low: { start: 1, count: 9 },
        start: 70,
        count: 4,
        visibility: { 'layer-71': false },
      }).success,
    ).toBe(false);
  });
});

describe('the built-in default bank — what a station with no config comes up with', () => {
  it('is channel 1, layers 70–99, thirty rows, with the top five ticked', () => {
    const bank = defaultFixedLayerBank();

    expect(bank.channel).toBe(1);
    expect(bank.start).toBe(70);
    expect(bank.count).toBe(30);
    expect(bank.start + bank.count - 1).toBe(99);

    // The five DISPLAYED rows are the bank's highest layers, counting down.
    const visible = [];
    for (let layer = bank.start; layer <= bank.start + bank.count - 1; layer++) {
      if (isLayerVisible(bank, layer)) visible.push(layer);
    }
    expect(visible).toEqual([95, 96, 97, 98, 99]);
  });

  it('declares every row explicitly — the other twenty-five are present, not absent', () => {
    const bank = defaultFixedLayerBank();
    const keys = Object.keys(bank.visibility ?? {});
    expect(keys).toHaveLength(30);
    // Declared-but-hidden is not the same as not declared: all thirty stay
    // fenced from automatic allocation, and the operator can tick one live.
    expect(bank.visibility?.['70']).toBe(false);
    expect(bank.visibility?.['94']).toBe(false);
    expect(bank.visibility?.['95']).toBe(true);
  });

  it('is a fresh object each call — no shared mutable default', () => {
    const first = defaultFixedLayerBank();
    first.count = 4;
    (first.visibility ?? {})['99'] = false;
    const second = defaultFixedLayerBank();
    expect(second.count).toBe(30);
    expect(isLayerVisible(second, 99)).toBe(true);
  });

  it('round-trips through the schema unchanged', () => {
    expect(FixedLayerBankSchema.parse(defaultFixedLayerBank())).toEqual(defaultFixedLayerBank());
  });

  it("the schema's own defaults agree with it — one answer to 'the default bank'", () => {
    const partial = FixedLayerBankSchema.parse({ channel: 1 });
    expect(partial.start).toBe(DEFAULT_FIXED_BANK_START);
    expect(partial.count).toBe(DEFAULT_FIXED_BANK_COUNT);
    /*
      🔴 `B-202` — AND THE BED HALF, WHICH THIS TEST'S OWN NAME ALREADY PROMISED.
      It checked `start`/`count` on the operator half only, so when `low` arrived with a
      `.default()` that omitted `visibility`, the two answers to "the default bank" diverged
      underneath the one test named for keeping them equal: nine visible bed rows from the
      schema, two from `defaultFixedLayerBank()`. Agreement is asserted on what an operator
      SEES, not on the record's shape — an absent tick and an explicit `true` are the same
      picture, and it is the picture the divergence was in.
    */
    const built = defaultFixedLayerBank();
    for (let layer = 1; layer <= 9; layer++) {
      expect(isLayerVisible(partial, layer)).toBe(isLayerVisible(built, layer));
    }
  });
});

describe('R-028 / C-015 — ReservedLayersSchema + reservedLayerNumbers', () => {
  it('expands inclusive ranges to a flat, de-duplicated, sorted layer list', () => {
    const reserved = ReservedLayersSchema.parse({
      ranges: [
        { from: 60, to: 62 },
        { from: 62, to: 63 },
        { from: 105, to: 105 },
      ],
    });
    expect(reservedLayerNumbers(reserved)).toEqual([60, 61, 62, 63, 105]);
  });

  it('refuses a backwards range (to < from)', () => {
    expect(ReservedLayersSchema.safeParse({ ranges: [{ from: 69, to: 60 }] }).success).toBe(false);
  });
});

describe('set-config reason union (S2)', () => {
  it('the response reason enum is exactly the shared reason const', () => {
    const reasonSchema = FixedLayersSetConfigChannel.response.shape.reason.unwrap();
    expect([...reasonSchema.options].sort()).toEqual([...FIXED_LAYERS_SET_CONFIG_REASONS].sort());
  });
});
