import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOW_BANK_COUNT,
  DEFAULT_LOW_BANK_START,
  FixedLayerBankSchema,
  MAX_LOW_FIXED_LAYER,
  bankPosition,
  defaultFixedLayerBank,
  defaultLayerAlias,
  fixedBankSlots,
  isLayerVisible,
  isLowBankLayer,
  layerAlias,
  lowBankEnd,
  requiredBankFor,
  validateSourceCatalog,
  type FixedLayerBank,
  type SourceCatalog,
} from '../src/index.js';

/**
 * 🔴 **`single-clock-look-switch` — THE SECOND DECLARED BANK.**
 *
 * What is pinned here is not the arithmetic of two ranges but the three decisions the
 * arithmetic serves: that the bed half is ALWAYS declared (so no reader branches on its
 * absence), that ONE predicate tells the halves apart everywhere, and that the classification
 * of a package is DERIVED rather than chosen.
 */

const HIGH = { channel: 1, start: 70, count: 10 };

function bank(over: Partial<FixedLayerBank> = {}): FixedLayerBank {
  return FixedLayerBankSchema.parse({ ...HIGH, ...over });
}

describe('the bed half is always declared', () => {
  it('🔴 a bank written before the bed rows existed parses INTO them, never without them', () => {
    // The upgrade case, and the reason `low` is `.default()` rather than `.optional()`: a
    // persisted file from an older build must come up with beds, or the very station the
    // migration exists for would boot with nowhere to migrate to.
    const parsed = FixedLayerBankSchema.parse(HIGH);
    expect(parsed.low).toEqual({
      start: DEFAULT_LOW_BANK_START,
      count: DEFAULT_LOW_BANK_COUNT,
      // 🔴 `B-202` — AND ITS TICKS. This assertion used to stop at `{ start, count }`, which
      // is why the omission survived: `isLayerVisible` reads an absent tick as VISIBLE, so
      // the upgraded station — the ONLY station that takes this path — came up with nine
      // visible bed rows against a fresh install's two. The shape was right and the picture
      // was wrong, and nothing here looked at the picture.
      visibility: {
        1: false,
        2: false,
        3: false,
        4: false,
        5: false,
        6: false,
        7: false,
        8: true,
        9: true,
      },
    });
  });

  it('🔴 B-202 — the UPGRADE path and the FRESH path show the same bed rows', () => {
    // The two ways a bank reaches a reader with no bed half of its own. They are computed by
    // different code paths (the schema's `.default()` vs `defaultFixedLayerBank()`), so the
    // only thing that keeps them equal is that both call `defaultLowBankVisibility` — and
    // the only thing that keeps THAT true is this test.
    const upgraded = FixedLayerBankSchema.parse(HIGH);
    const fresh = defaultFixedLayerBank();
    const shownOn = (b: FixedLayerBank): number[] => {
      const shown: number[] = [];
      for (let layer = 1; layer <= 9; layer++) if (isLayerVisible(b, layer)) shown.push(layer);
      return shown;
    };
    expect(shownOn(upgraded)).toEqual(shownOn(fresh));
    expect(shownOn(upgraded)).toEqual([8, 9]);
  });

  it('B-202 — each parse gets its OWN tick record, not a shared one', () => {
    // `.default()` takes a thunk for this reason: a shared literal handed to two readers is
    // one mutation away from a default that differs between them in the same process.
    const first = FixedLayerBankSchema.parse(HIGH);
    (first.low.visibility ?? {})['9'] = false;
    expect(isLayerVisible(FixedLayerBankSchema.parse(HIGH), 9)).toBe(true);
  });

  it('the built-in default bank states its beds explicitly, with the top two ticked', () => {
    const built = defaultFixedLayerBank();
    expect(built.low.start).toBe(1);
    expect(built.low.count).toBe(9);
    const shown = [];
    for (let layer = 1; layer <= 9; layer++) if (isLayerVisible(built, layer)) shown.push(layer);
    expect(shown).toEqual([8, 9]);
  });

  it('🔴 layer 0 is not a bed row — it is legal and reads as "unset" in too many places', () => {
    expect(FixedLayerBankSchema.safeParse({ ...HIGH, low: { start: 0, count: 9 } }).success).toBe(
      false,
    );
  });

  it('a bed range past the free band is refused by the schema, not discovered later', () => {
    expect(
      FixedLayerBankSchema.safeParse({ ...HIGH, low: { start: 1, count: MAX_LOW_FIXED_LAYER + 1 } })
        .success,
    ).toBe(false);
  });
});

describe('isLowBankLayer — THE predicate the halves are told apart by', () => {
  it('answers from the DECLARED bed range, never from a hard-coded 1–9', () => {
    // A station whose beds are 2–5 is the case a local `layer <= 9` gets wrong, and it gets
    // it wrong silently: layers 1, 6, 7, 8 and 9 are not bed rows for that bank at all.
    const narrow = bank({ low: { start: 2, count: 4 } });
    expect(lowBankEnd(narrow)).toBe(5);
    expect([1, 2, 3, 4, 5, 6, 70].map((l) => isLowBankLayer(narrow, l))).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('the two halves keep their OWN ticks, aliases and numbering', () => {
  it('a tick in one half says nothing about the same-numbered key in the other', () => {
    const b = bank({ visibility: { '70': false }, low: { start: 1, count: 9, visibility: {} } });
    expect(isLayerVisible(b, 70)).toBe(false);
    // The bed half declares nothing about layer 1, and absent means visible — the operator
    // half's record must not be consulted for it.
    expect(isLayerVisible(b, 1)).toBe(true);
  });

  it('aliases are read from the half that owns the layer', () => {
    const b = bank({
      aliases: { '79': 'CLOCK' },
      low: { start: 1, count: 9, aliases: { '9': 'BED' } },
    });
    expect(layerAlias(b, 79)).toBe('CLOCK');
    expect(layerAlias(b, 9)).toBe('BED');
    expect(layerAlias(b, 8)).toBeUndefined();
  });

  it('🔴 each half counts down from its OWN top, and beds are named BED', () => {
    const b = bank();
    // Operator rows: 79 is `Layer 1`, as before the beds existed — unchanged, deliberately.
    expect(bankPosition(b, 79)).toBe(1);
    expect(defaultLayerAlias(b, 79)).toBe('Layer 1');
    // Beds: 9 is `Bed 1`. Numbering them ON from the operator rows would make a bed's name
    // move whenever the operator bank's count changed.
    expect(bankPosition(b, 9)).toBe(1);
    expect(defaultLayerAlias(b, 9)).toBe('Bed 1');
    expect(defaultLayerAlias(b, 1)).toBe('Bed 9');
  });
});

describe('fixedBankSlots — the UNION, which is what makes the shape cost nothing', () => {
  it('yields both halves, operator rows first', () => {
    const slots = fixedBankSlots(bank());
    expect(slots).toHaveLength(19);
    expect(slots[0]).toEqual({ channel: 1, layer: 70 });
    expect(slots[9]).toEqual({ channel: 1, layer: 79 });
    expect(slots[10]).toEqual({ channel: 1, layer: 1 });
    expect(slots[18]).toEqual({ channel: 1, layer: 9 });
  });

  it('beds ride the bank’s channel — a bed and its plates are on one channel by construction', () => {
    expect(fixedBankSlots(bank({ channel: 3 })).every((s) => s.channel === 3)).toBe(true);
  });
});

describe('requiredBankFor — the classification is DERIVED, at import', () => {
  const carrier = {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center' as const, offset: { x: 0, y: 0 } },
  };

  it('🔴 a package that DECLARES plates is a bed', () => {
    expect(
      requiredBankFor({
        liveSources: {
          ...carrier,
          sources: [
            {
              elementId: 'e',
              sourceId: 'guest-1',
              rect: { x: 0, y: 0, width: 1, height: 1 },
              dynamic: false,
            },
          ],
        },
      }),
    ).toBe('low');
  });

  it('🔴 a package that declares NONE is furniture', () => {
    expect(requiredBankFor({ liveSources: { ...carrier, sources: [] } })).toBe('high');
  });

  it('🔴 an ABSENT carrier resolves HIGH, and the argument is positive', () => {
    /*
      An absent carrier means the record predates Live Sources entirely, so the bridge can
      seat no plates for it whatever its scene contains — its page renders alone, with
      nothing composited over it, exactly as it does today. `high` is where it has always
      been and where it still behaves correctly. Sending it low would put a graphic the
      bridge cannot reason about underneath every live picture.
    */
    expect(requiredBankFor({})).toBe('high');
  });
});

describe('the band must lie ABOVE the beds — disjointness is not enough', () => {
  const catalog = (start: number, end: number): SourceCatalog => ({
    sources: [],
    layerRange: { start, end },
  });

  it('accepts the suggested band, which starts one layer above the default beds', () => {
    expect(() =>
      validateSourceCatalog(catalog(10, 59), { fixedBank: bank(), reservedLayers: [] }),
    ).not.toThrow();
  });

  it('🔴 refuses a band that starts INSIDE the bed rows', () => {
    expect(() =>
      validateSourceCatalog(catalog(5, 59), { fixedBank: bank(), reservedLayers: [] }),
    ).toThrow(/BELOW/);
  });

  it('🔴 refuses a band that is DISJOINT from the beds but sits BELOW them', () => {
    // The case a plain overlap test would pass and this one must not: beds at 5–9, band at
    // 1–3. Nothing collides, and every bed still draws OVER every plate — which is the one
    // thing a bed may never do. Disjointness and strictly-below are different questions.
    expect(() =>
      validateSourceCatalog(catalog(1, 3), {
        fixedBank: FixedLayerBankSchema.parse({
          channel: 1,
          start: 70,
          count: 10,
          low: { start: 5, count: 5 },
        }),
        reservedLayers: [],
      }),
    ).toThrow(/BELOW/);
  });
});
