import { describe, expect, it } from 'vitest';
import type { FixedLayerBank, Rehearsal } from '@cg/shared-ipc';
import { bankPosition, defaultLayerAlias } from '@cg/shared-ipc';
import {
  caveatsZIndex,
  frameBox,
  frameZIndex,
  overlayZIndex,
  rehearsalCaption,
  rowNameFor,
  stackedByLayer,
  subjectsFor,
  type RehearsalSubject,
} from '../src/renderer/features/monitors/rehearsalFrames.js';

/**
 * R-022 — the COMPOSITE's resolution rules: which rows render, in what order,
 * and what the panel says about the set.
 *
 * The z-order is the one thing in this feature that can be wrong and still look
 * entirely plausible, which is why it is asserted on the RESOLVED ORDER here
 * rather than on rendered output alone.
 */

const BANK: FixedLayerBank = { channel: 1, start: 70, count: 30 };

function subject(over: Partial<RehearsalSubject> & { layer: number }): RehearsalSubject {
  return {
    itemId: `item-${String(over.layer)}`,
    channel: 1,
    rowName: `row-${String(over.layer)}`,
    position: undefined,
    fields: {},
    liveSources: undefined,
    activeLookId: undefined,
    /*
      SESSION BQ — the subject carries the RESOLUTION INPUTS now, not a pre-joined
      plate-keyed name map. See `PlateSourceLookup` for why the old shape WAS the defect.

      ⚠ This fixture kept the removed `plateSourceNames` and omitted the new required field
      for a while and NOTHING caught it: `apps/runtime/tsconfig.json` includes the SRC GLOB
      only, so the runtime's `typecheck` never sees `tests/`, and vitest transpiles without
      checking. Turning that on is its own piece of work — 113 pre-existing errors, measured
      — and is filed rather than smuggled in here (see `B-157`).
    */
    plateSources: {
      templateId: 'tpl-1',
      assignments: { assignments: [] },
      nameOf: () => null,
    },
    ...over,
  };
}

describe('stackedByLayer — the HIGHER CasparCG layer draws on top', () => {
  it('orders ascending by layer, so the highest layer paints last', () => {
    const order = stackedByLayer([
      subject({ layer: 71 }),
      subject({ layer: 99 }),
      subject({ layer: 85 }),
    ]);
    expect(order.map((s) => s.layer)).toEqual([71, 85, 99]);
    // The z-indices follow the order, so the highest layer carries the highest.
    const z = order.map((s, i) => [s.layer, frameZIndex(i)] as const);
    expect(z).toEqual([
      [71, 1],
      [85, 2],
      [99, 3],
    ]);
    // Every frame is ABOVE the checker, which is z-index 0 — a checker between
    // two frames would read as opaque and hide the alpha it exists to reveal.
    expect(Math.min(...z.map(([, zi]) => zi))).toBeGreaterThan(0);
  });

  /**
   * THE TRAP, asserted directly. Both of these numbers are on the same surface,
   * both look like "which row is on top", and both run the OPPOSITE way to the
   * layer number. Keying the composite off either inverts the whole stack.
   */
  it('is NOT the display index: the list is sorted DESCENDING, so index 0 is the TOP graphic', () => {
    // The Layers panel's own order — descending by layer.
    const displayed = [99, 85, 71];
    const order = stackedByLayer(displayed.map((layer) => subject({ layer })));
    // Straight display order would have put layer 99 at the BOTTOM of the stack.
    expect(order.map((s) => s.layer)).not.toEqual(displayed);
    expect(order[order.length - 1]?.layer).toBe(99);
  });

  it('is NOT the alias number: `Layer 1` is the bank’s HIGHEST layer', () => {
    // Layer 99 is `Layer 1` and layer 95 is `Layer 5` — so ordering by the alias
    // number ascending would put the TOP graphic at the BOTTOM of the composite.
    expect(bankPosition(BANK, 99)).toBe(1);
    expect(bankPosition(BANK, 95)).toBe(5);
    const order = stackedByLayer([subject({ layer: 99 }), subject({ layer: 95 })]);
    expect(order.map((s) => s.layer)).toEqual([95, 99]);
    expect(order.map((s) => bankPosition(BANK, s.layer))).toEqual([5, 1]);
  });

  it('is a TOTAL order, so frames never reshuffle between renders', () => {
    const a = stackedByLayer([
      subject({ layer: 71, channel: 2 }),
      subject({ layer: 99, channel: 1 }),
    ]);
    const b = stackedByLayer([
      subject({ layer: 99, channel: 1 }),
      subject({ layer: 71, channel: 2 }),
    ]);
    expect(a.map((s) => [s.channel, s.layer])).toEqual(b.map((s) => [s.channel, s.layer]));
  });

  it('does not mutate its input', () => {
    const input = [subject({ layer: 99 }), subject({ layer: 71 })];
    stackedByLayer(input);
    expect(input.map((s) => s.layer)).toEqual([99, 71]);
  });
});

describe('subjectsFor — EVERY rehearsing row, no cap and no quiet drop', () => {
  const rehearsals: Rehearsal[] = [
    { itemId: 'a', channel: 1, layer: 99 },
    { itemId: 'b', channel: 1, layer: 71 },
    { itemId: 'c', channel: 1, layer: 85 },
  ];

  it('resolves one subject per rehearsing row', () => {
    const out = subjectsFor(rehearsals, (r) => subject({ layer: r.layer, itemId: r.itemId }));
    expect(out).toHaveLength(rehearsals.length);
    expect(out.map((s) => s.itemId)).toEqual(['b', 'c', 'a']);
  });

  it('drops ONLY a row that has no stack item — the one genuine impossibility', () => {
    const out = subjectsFor(rehearsals, (r) =>
      r.itemId === 'c' ? null : subject({ layer: r.layer, itemId: r.itemId }),
    );
    expect(out.map((s) => s.itemId)).toEqual(['b', 'a']);
  });
});

describe('rehearsalCaption — the panel says what it is showing, always', () => {
  it('names the count when everything rehearsing is on screen', () => {
    expect(rehearsalCaption(1, 1)).toBe('Rehearsing 1 row');
    // Just the count. It used to trail "— composited in channel layer order";
    // the ordering is a property of the picture, not a label the picture needs.
    expect(rehearsalCaption(3, 3)).toBe('Rehearsing 3 rows');
  });

  /**
   * THE HONESTY CONSTRAINT. PVW must never render fewer frames than there are
   * rehearsing rows without saying so — a quiet drop is exactly the bug this
   * whole change fixes, and a shortfall is stated as "showing N of M" wherever
   * it comes from.
   */
  it('states a SHORTFALL explicitly as "showing N of M"', () => {
    expect(rehearsalCaption(2, 3)).toBe('Rehearsing 3 rows — showing 2 of 3');
    expect(rehearsalCaption(0, 1)).toBe('Rehearsing 1 row — showing 0 of 1');
  });
});

describe('rowNameFor — the row’s own name, never the raw layer dressed as an alias', () => {
  it('prefers the configured alias', () => {
    expect(rowNameFor(BANK, 99, 'CLOCK')).toBe('CLOCK');
  });

  it('falls back to the bank’s default alias, which is NOT the layer number', () => {
    expect(rowNameFor(BANK, 99, undefined)).toBe(defaultLayerAlias(BANK, 99));
    expect(rowNameFor(BANK, 99, undefined)).toBe('Layer 1');
    // The defect this closes: the panel used to print `Layer ${rehearsal.layer}`,
    // which reads as the alias format while carrying the real layer number — so
    // layer 99 announced itself as "Layer 99" beside a row called "Layer 1".
    expect(rowNameFor(BANK, 99, undefined)).not.toBe('Layer 99');
  });

  it('with no bank declared, says the layer number and does not invent a position', () => {
    expect(rowNameFor(null, 99, undefined)).toBe('Layer 99');
  });
});

/**
 * R-049 — THE ONE FIT TRANSFORM, and the band the overlay occupies.
 *
 * `frameBox` exists so that the iframes and the live-plate overlay cannot express
 * the fit differently. The test asserts they are the SAME OBJECT SHAPE from one
 * call rather than comparing two literals, because two literals that agree today
 * are exactly the arrangement that drifts.
 */
describe('frameBox — the raster-sized box and the single FIT transform', () => {
  const RASTER = { width: 1440, height: 1080 };

  it('sizes to the RASTER, not to the panel — that is what the pages measure', () => {
    const box = frameBox(RASTER, 0.25);
    expect(box.width).toBe('1440px');
    expect(box.height).toBe('1080px');
  });

  it('composes the fit with the centring translate, about the centre', () => {
    expect(frameBox(RASTER, 0.25).transform).toBe('translate(-50%, -50%) scale(0.25)');
    expect(frameBox(RASTER, 0.25).transformOrigin).toBe('center center');
  });

  it('a fit of 1 still emits the scale — one code path, no special case', () => {
    // Deliberately NOT optimised away. The overlay counter-scales by 1/fit, so a
    // box that sometimes carries a scale and sometimes does not is a second
    // shape for the label maths to disagree with.
    expect(frameBox(RASTER, 1).transform).toBe('translate(-50%, -50%) scale(1)');
  });
});

describe('overlayZIndex / caveatsZIndex — the marker is above every frame', () => {
  it('sits above the TOP frame, whatever the frame count', () => {
    // There is no cap on rehearsing rows, so a constant would be overtaken. A
    // placeholder that ends up under a graphic is worse than none: it would show
    // for one row and vanish for another with nothing to say why.
    for (const count of [1, 2, 3, 12]) {
      expect(overlayZIndex(count)).toBeGreaterThan(frameZIndex(count - 1));
    }
  });

  it('the caveats sit above the overlay — a note about the surface is never covered', () => {
    for (const count of [1, 3, 12]) {
      expect(caveatsZIndex(count)).toBeGreaterThan(overlayZIndex(count));
    }
    // The bare `3` this replaced already tied with the third frame.
    expect(caveatsZIndex(3)).toBeGreaterThan(3);
  });
});
