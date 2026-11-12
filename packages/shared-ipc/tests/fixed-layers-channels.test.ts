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
  fixedBankEnd,
  isLayerVisible,
  layerShortcutBindings,
  reservedLayerNumbers,
} from '../src/index.js';

describe('Fixed layer shortcuts', () => {
  it('retains physical assignments in both halves of a bank', () => {
    const shortcuts = { '99': { play: 'F9', stop: 'Shift+F9' }, '59': { clear: 'Ctrl+KeyD' } };
    expect(FixedLayerBankSchema.parse({ channel: 1, shortcuts }).shortcuts).toEqual(shortcuts);
    expect(FixedLayerBankSchema.parse({ channel: 1 }).shortcuts).toBeUndefined();
  });

  it('reads Next and older bindings together and rejects a conflict across the two', () => {
    const nextShortcuts = { '99': 'F10', '59': 'Shift+F10' };
    const shortcuts = { '99': { play: 'F9' } };
    const bank = FixedLayerBankSchema.parse({ channel: 1, shortcuts, nextShortcuts });
    expect(bank.shortcuts).toEqual(shortcuts);
    expect(bank.nextShortcuts).toEqual(nextShortcuts);
    expect(layerShortcutBindings(bank)).toEqual({
      '99': { play: 'F9', next: 'F10' },
      '59': { next: 'Shift+F10' },
    });
    expect(
      FixedLayerBankSchema.safeParse({ channel: 1, shortcuts, nextShortcuts: { '59': 'F9' } })
        .success,
    ).toBe(false);
    expect(
      FixedLayerBankSchema.safeParse({ channel: 1, nextShortcuts: { '79': 'F10' } }).success,
    ).toBe(false);
  });

  it('rejects duplicate chords, invalid keys and undeclared layers', () => {
    const invalid = [
      { '99': { play: 'F9', stop: 'F9' } },
      { '99': { play: 'F9' }, '59': { stop: 'F9' } },
      { '99': { play: 'KeyP' } },
      { '99': { play: 'Shift+Ctrl+F9' } },
      { '79': { play: 'F9' } },
    ];
    for (const shortcuts of invalid) {
      expect(FixedLayerBankSchema.safeParse({ channel: 1, shortcuts }).success).toBe(false);
    }
  });

  it('reads one additive Space assignment and keeps the legacy chord fields strict', () => {
    const raw = { channel: 1, spaceShortcut: { layer: 59, verb: 'next' } };
    expect(layerShortcutBindings(FixedLayerBankSchema.parse(raw))).toEqual({
      '59': { next: 'Space' },
    });
    expect(
      layerShortcutBindings(FixedLayerBankSchema.parse({ ...raw, spaceShortcut: null })),
    ).toEqual({});
    expect(FixedLayerBankSchema.safeParse({ ...raw, nextShortcuts: { '59': 'F1' } }).success).toBe(
      false,
    );
    expect(
      FixedLayerBankSchema.safeParse({ ...raw, spaceShortcut: { ...raw.spaceShortcut, layer: 79 } })
        .success,
    ).toBe(false);
    expect(
      FixedLayerBankSchema.safeParse({ ...raw, shortcuts: { '59': { stop: 'Space' } } }).success,
    ).toBe(false);
  });
});

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
      low: { start: 50, count: 10 },
      start: 80,
      count: 4,
    });
    expect(isLayerVisible(bare, 80)).toBe(true);
    const ticked = FixedLayerBankSchema.parse({
      channel: 1,
      low: { start: 50, count: 10 },
      start: 80,
      count: 4,
      visibility: { '81': false, '82': true },
    });
    expect(isLayerVisible(ticked, 80)).toBe(true); // absent key
    expect(isLayerVisible(ticked, 81)).toBe(false); // explicit false
    expect(isLayerVisible(ticked, 82)).toBe(true); // explicit true
  });

  it('visibility keys must be numeric strings', () => {
    expect(
      FixedLayerBankSchema.safeParse({
        channel: 1,
        low: { start: 50, count: 10 },
        start: 80,
        count: 4,
        visibility: { 'layer-81': false },
      }).success,
    ).toBe(false);
  });
});

describe('the built-in default bank — what a station with no config comes up with', () => {
  it('is channel 1, the whole 80-99 template band, with the top five ticked', () => {
    const bank = defaultFixedLayerBank();

    expect(bank.channel).toBe(1);
    expect(bank.start).toBe(80);
    expect(bank.count).toBe(20);
    expect(fixedBankEnd(bank)).toBe(99);

    // The five DISPLAYED rows are the bank's highest layers, counting down.
    const visible = [];
    for (let layer = bank.start; layer <= fixedBankEnd(bank); layer++) {
      if (isLayerVisible(bank, layer)) visible.push(layer);
    }
    expect(visible).toEqual([95, 96, 97, 98, 99]);
  });

  it('declares every row explicitly — the other fifteen are present, not absent', () => {
    const bank = defaultFixedLayerBank();
    const keys = Object.keys(bank.visibility ?? {});
    expect(keys).toHaveLength(20);
    // Declared-but-hidden is not the same as not declared: all twenty stay
    // fenced from automatic allocation, and the operator can tick one live.
    expect(bank.visibility?.['80']).toBe(false);
    expect(bank.visibility?.['94']).toBe(false);
    expect(bank.visibility?.['95']).toBe(true);
  });

  it('is a fresh object each call — no shared mutable default', () => {
    const first = defaultFixedLayerBank();
    first.count = 4;
    (first.visibility ?? {})['99'] = false;
    const second = defaultFixedLayerBank();
    expect(second.count).toBe(20);
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
