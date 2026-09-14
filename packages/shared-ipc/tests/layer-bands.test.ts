import { describe, expect, it } from 'vitest';
import {
  assertLayerBands,
  bandSize,
  bandText,
  FIRST_ALLOCATABLE_LAYER,
  inBand,
  LAYER_BAND_ORDER,
  LAYER_BANDS,
  LayerBandError,
  type LayerBand,
  type LayerBandRole,
} from '../src/layer-bands.js';
import {
  DEFAULT_FIXED_BANK_COUNT,
  DEFAULT_FIXED_BANK_START,
  DEFAULT_LOW_BANK_COUNT,
  DEFAULT_LOW_BANK_START,
  MAX_LOW_FIXED_LAYER,
  defaultFixedLayerBank,
  fixedBankEnd,
  lowBankEnd,
} from '../src/channels/fixedLayers.js';
import { SUGGESTED_LIVE_SOURCE_LAYER_RANGE } from '../src/channels/sources.js';

/**
 * `LAYER-BANDS-16` — THE LAYER MAP AND ITS GUARD.
 *
 * The first block pins the owner's cut so a renumbering has to come here and say so. The
 * second is the guard, exercised against DELIBERATELY broken maps: a guard nothing has
 * watched go red is a guard nobody knows the shape of.
 */
describe('the layer map', () => {
  it('is the owner cut of 2026-09-14', () => {
    expect(LAYER_BANDS.bed).toEqual({ start: 50, end: 59 });
    expect(LAYER_BANDS.plate).toEqual({ start: 60, end: 79 });
    expect(LAYER_BANDS.template).toEqual({ start: 80, end: 99 });
    expect(FIRST_ALLOCATABLE_LAYER).toBe(50);
  });

  it('gives ten beds, twenty plates and twenty templates', () => {
    expect(bandSize(LAYER_BANDS.bed)).toBe(10);
    expect(bandSize(LAYER_BANDS.plate)).toBe(20);
    expect(bandSize(LAYER_BANDS.template)).toBe(20);
  });

  it('leaves 1-49 free, and allocates nothing there', () => {
    for (const role of LAYER_BAND_ORDER) {
      expect(LAYER_BANDS[role].start).toBeGreaterThanOrEqual(FIRST_ALLOCATABLE_LAYER);
    }
    for (const layer of [1, 9, 10, 30, 49]) {
      for (const role of LAYER_BAND_ORDER) {
        expect(inBand(LAYER_BANDS[role], layer)).toBe(false);
      }
    }
  });

  it('renders one spelling of a band', () => {
    expect(bandText(LAYER_BANDS.bed)).toBe('50-59');
    expect(bandText(LAYER_BANDS.plate)).toBe('60-79');
    expect(bandText(LAYER_BANDS.template)).toBe('80-99');
  });
});

describe('every allocator reads the map', () => {
  it('seats the graphics-bed bank on the bed band', () => {
    const bank = defaultFixedLayerBank();
    expect(DEFAULT_LOW_BANK_START).toBe(LAYER_BANDS.bed.start);
    expect(DEFAULT_LOW_BANK_COUNT).toBe(bandSize(LAYER_BANDS.bed));
    expect(MAX_LOW_FIXED_LAYER).toBe(LAYER_BANDS.bed.end);
    expect(bank.low.start).toBe(LAYER_BANDS.bed.start);
    expect(lowBankEnd(bank)).toBe(LAYER_BANDS.bed.end);
  });

  it('seats the operator candidate bank on the template band', () => {
    const bank = defaultFixedLayerBank();
    expect(DEFAULT_FIXED_BANK_START).toBe(LAYER_BANDS.template.start);
    expect(DEFAULT_FIXED_BANK_COUNT).toBe(bandSize(LAYER_BANDS.template));
    expect(bank.start).toBe(LAYER_BANDS.template.start);
    expect(fixedBankEnd(bank)).toBe(LAYER_BANDS.template.end);
  });

  it('suggests the plate band for live sources', () => {
    expect(SUGGESTED_LIVE_SOURCE_LAYER_RANGE).toEqual({
      start: LAYER_BANDS.plate.start,
      end: LAYER_BANDS.plate.end,
    });
  });

  /**
   * 🔴 THE ORDERING, read off the SHIPPED defaults rather than off the map — because the
   * map being in order proves nothing if a bank is seated somewhere else. A higher
   * CasparCG layer renders above a lower one, so this IS the composition.
   */
  it('composites bed under plates under templates, on the shipped defaults', () => {
    const bank = defaultFixedLayerBank();
    expect(lowBankEnd(bank)).toBeLessThan(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.start);
    expect(SUGGESTED_LIVE_SOURCE_LAYER_RANGE.end).toBeLessThan(bank.start);
  });
});

describe('assertLayerBands', () => {
  const map = (over: Partial<Record<LayerBandRole, LayerBand>>): Record<LayerBandRole, LayerBand> =>
    ({ ...LAYER_BANDS, ...over }) as Record<LayerBandRole, LayerBand>;

  it('accepts the shipped map', () => {
    expect(() => {
      assertLayerBands();
    }).not.toThrow();
  });

  it('refuses a bed at or above its own plates', () => {
    // The bed's top row lands ON the plate band's first layer. One layer of overlap is all
    // it takes: that bed's opaque background draws over a guest's picture.
    expect(() => {
      assertLayerBands(map({ bed: { start: 51, end: 60 } }));
    }).toThrow(LayerBandError);
    expect(() => {
      assertLayerBands(map({ bed: { start: 51, end: 60 } }));
    }).toThrow(/the bed band 51-60 overlaps the plate band 60-79/);
  });

  it('refuses a bed ABOVE the templates even though nothing overlaps', () => {
    // The case that makes the ordering check worth having separately from the overlap
    // check: these three bands are perfectly disjoint and composite in the wrong order.
    expect(() => {
      assertLayerBands(
        map({
          bed: { start: 90, end: 99 },
          plate: { start: 60, end: 79 },
          template: { start: 50, end: 59 },
        }),
      );
    }).toThrow(/not strictly below/);
  });

  it('refuses any band that allocates below the floor', () => {
    expect(() => {
      assertLayerBands(map({ bed: { start: 1, end: 9 } }));
    }).toThrow(/allocates below layer 50/);
    expect(() => {
      assertLayerBands(map({ plate: { start: 10, end: 59 } }));
    }).toThrow(/allocates below layer 50/);
  });

  it('names the free band in the floor refusal, so nobody reclaims it', () => {
    expect(() => {
      assertLayerBands(map({ bed: { start: 1, end: 9 } }));
    }).toThrow(/1-49 is left free for the playout server/);
  });

  it('refuses two overlapping bands', () => {
    // A bed swallowing the whole plate band. Overlap is asked before order precisely so a
    // touching or engulfing pair is diagnosed as the collision it is.
    expect(() => {
      assertLayerBands(map({ bed: { start: 50, end: 79 } }));
    }).toThrow(/the bed band 50-79 overlaps the plate band 60-79/);
  });

  it('refuses a band that ends before it starts', () => {
    expect(() => {
      assertLayerBands(map({ plate: { start: 79, end: 60 } }));
    }).toThrow(/ends before it starts/);
  });

  it('refuses a non-integer bound', () => {
    expect(() => {
      assertLayerBands(map({ plate: { start: 60.5, end: 79 } }));
    }).toThrow(/not a pair of integers/);
  });
});
