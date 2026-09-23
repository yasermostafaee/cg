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

// `LAYER-BANDS-16` — a TEN-row operator bank at the foot of the template band. It is a
// deviation from the shipped twenty on purpose (these tests are about the two halves, not
// about the default), but it sits INSIDE the band: a bank at 70 would now be an old-map
// bank, which is a different test's subject.
const HIGH = { channel: 1, start: 80, count: 10 };

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
        50: false,
        51: false,
        52: false,
        53: false,
        54: false,
        55: false,
        56: false,
        57: false,
        58: true,
        59: true,
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
      for (let layer = 50; layer <= 59; layer++) if (isLayerVisible(b, layer)) shown.push(layer);
      return shown;
    };
    expect(shownOn(upgraded)).toEqual(shownOn(fresh));
    expect(shownOn(upgraded)).toEqual([58, 59]);
  });

  it('B-202 — each parse gets its OWN tick record, not a shared one', () => {
    // `.default()` takes a thunk for this reason: a shared literal handed to two readers is
    // one mutation away from a default that differs between them in the same process.
    const first = FixedLayerBankSchema.parse(HIGH);
    (first.low.visibility ?? {})['59'] = false;
    expect(isLayerVisible(FixedLayerBankSchema.parse(HIGH), 59)).toBe(true);
  });

  it('the built-in default bank states its beds explicitly, with the top two ticked', () => {
    const built = defaultFixedLayerBank();
    expect(built.low.start).toBe(50);
    expect(built.low.count).toBe(10);
    const shown = [];
    for (let layer = 50; layer <= 59; layer++) if (isLayerVisible(built, layer)) shown.push(layer);
    expect(shown).toEqual([58, 59]);
  });

  it('🔴 layer 0 is not a bed row — it is legal and reads as "unset" in too many places', () => {
    expect(FixedLayerBankSchema.safeParse({ ...HIGH, low: { start: 0, count: 9 } }).success).toBe(
      false,
    );
  });

  it('🔴 a bed BELOW the band floor is refused by the schema — the old 1-9 map is gone', () => {
    // `LAYER-BANDS-16`: 1-49 is the playout server's. A bed declared there is the exact
    // defect the re-cut exists to close, and it is refused where it is cheapest to refuse.
    expect(FixedLayerBankSchema.safeParse({ ...HIGH, low: { start: 1, count: 9 } }).success).toBe(
      false,
    );
    expect(FixedLayerBankSchema.safeParse({ ...HIGH, low: { start: 49, count: 1 } }).success).toBe(
      false,
    );
  });

  it('a bed range past the band is refused by the schema, not discovered later', () => {
    expect(
      FixedLayerBankSchema.safeParse({
        ...HIGH,
        low: { start: DEFAULT_LOW_BANK_START, count: DEFAULT_LOW_BANK_COUNT + 1 },
      }).success,
    ).toBe(false);
    expect(
      FixedLayerBankSchema.safeParse({ ...HIGH, low: { start: MAX_LOW_FIXED_LAYER + 1, count: 1 } })
        .success,
    ).toBe(false);
  });
});

describe('isLowBankLayer — THE predicate the halves are told apart by', () => {
  it('answers from the DECLARED bed range, never from a hard-coded 1–9', () => {
    // A station whose beds are 52–55 is the case a local `layer <= 59` gets wrong, and it
    // gets it wrong silently: 50, 51, 56, 57, 58 and 59 are not bed rows for that bank.
    const narrow = bank({ low: { start: 52, count: 4 } });
    expect(lowBankEnd(narrow)).toBe(55);
    expect([51, 52, 53, 54, 55, 56, 80].map((l) => isLowBankLayer(narrow, l))).toEqual([
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
    const b = bank({ visibility: { '80': false }, low: { start: 50, count: 10, visibility: {} } });
    expect(isLayerVisible(b, 80)).toBe(false);
    // The bed half declares nothing about layer 50, and absent means visible — the operator
    // half's record must not be consulted for it.
    expect(isLayerVisible(b, 50)).toBe(true);
  });

  it('aliases are read from the half that owns the layer', () => {
    const b = bank({
      aliases: { '89': 'CLOCK' },
      low: { start: 50, count: 10, aliases: { '59': 'BED' } },
    });
    expect(layerAlias(b, 89)).toBe('CLOCK');
    expect(layerAlias(b, 59)).toBe('BED');
    expect(layerAlias(b, 58)).toBeUndefined();
  });

  it('each half still counts its POSITION down from its own top', () => {
    const b = bank();
    expect(bankPosition(b, 89)).toBe(1);
    expect(bankPosition(b, 59)).toBe(1);
    expect(bankPosition(b, 50)).toBe(10);
  });

  /*
    🔴 `DESKTOP-APPS-01-D` h — the default NAME carries the real AMCP layer, never the position:
    the owner's top row read `Layer 1` while the Inspector said layer 99.
  */
  it('🔴 the default name is the word and the REAL layer — Layer 89, Bed 59, Bed 50', () => {
    const b = bank();
    expect(defaultLayerAlias(b, 89)).toBe('Layer 89');
    expect(defaultLayerAlias(b, 80)).toBe('Layer 80');
    expect(defaultLayerAlias(b, 59)).toBe('Bed 59');
    expect(defaultLayerAlias(b, 50)).toBe('Bed 50');
  });

  it('control — a configured name is kept, whatever the layer', () => {
    const b = bank({
      aliases: { '89': 'CLOCK' },
      low: { start: 50, count: 10, aliases: { '59': 'BED' } },
    });
    expect(layerAlias(b, 89) ?? defaultLayerAlias(b, 89)).toBe('CLOCK');
    expect(layerAlias(b, 59) ?? defaultLayerAlias(b, 59)).toBe('BED');
    expect(layerAlias(b, 88) ?? defaultLayerAlias(b, 88)).toBe('Layer 88');
  });
});

describe('fixedBankSlots — the UNION, which is what makes the shape cost nothing', () => {
  it('yields both halves, operator rows first', () => {
    const slots = fixedBankSlots(bank());
    expect(slots).toHaveLength(20);
    expect(slots[0]).toEqual({ channel: 1, layer: 80 });
    expect(slots[9]).toEqual({ channel: 1, layer: 89 });
    expect(slots[10]).toEqual({ channel: 1, layer: 50 });
    expect(slots[19]).toEqual({ channel: 1, layer: 59 });
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
      validateSourceCatalog(catalog(60, 79), { fixedBank: bank(), reservedLayers: [] }),
    ).not.toThrow();
  });

  it('🔴 refuses a band that starts INSIDE the bed rows', () => {
    expect(() =>
      validateSourceCatalog(catalog(55, 79), { fixedBank: bank(), reservedLayers: [] }),
    ).toThrow(/BELOW/);
  });

  it('🔴 refuses a band that is DISJOINT from the beds but sits BELOW them', () => {
    // The case a plain overlap test would pass and this one must not: beds at 55–59, band
    // at 51–53. Nothing collides, and every bed still draws OVER every plate — which is the
    // one thing a bed may never do. Disjointness and strictly-below are different questions.
    expect(() =>
      validateSourceCatalog(catalog(51, 53), {
        fixedBank: FixedLayerBankSchema.parse({
          channel: 1,
          start: 80,
          count: 10,
          low: { start: 55, count: 5 },
        }),
        reservedLayers: [],
      }),
    ).toThrow(/BELOW/);
  });
});
