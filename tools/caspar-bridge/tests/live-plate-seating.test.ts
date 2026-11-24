import { describe, expect, it } from 'vitest';
import {
  allocateLiveLayers,
  allocateOrderedLiveLayers,
  spaceLiveLayersForBorders,
} from '../src/live-plate-seating.js';

/**
 * C-015 phase 6 (task 6.0) — **which layers a template's plates go on.**
 *
 * The pure half of the assembly, tested without a bridge: the caller answers "is
 * this layer free" and this decides where each plate lands. Every case here is one
 * the integration test cannot isolate, because there the answer is entangled with
 * the ledger, the bank and the bound template slots.
 */

const FREE = (): true => true;

describe('allocateLiveLayers', () => {
  it('takes fresh layers LOWEST FIRST, deterministically', () => {
    // Deterministic on purpose: a wire-trace assertion has to be able to name the
    // layer, and an operator seeing two boxes on 10 and 11 can read the pattern.
    expect(
      allocateLiveLayers({
        range: { start: 10, end: 59 },
        preferred: [undefined, undefined, undefined],
        isAvailable: FREE,
      }),
    ).toEqual([10, 11, 12]);
  });

  it('skips what the caller says is taken', () => {
    expect(
      allocateLiveLayers({
        range: { start: 10, end: 59 },
        preferred: [undefined, undefined],
        isAvailable: (layer) => layer !== 10 && layer !== 11,
      }),
    ).toEqual([12, 13]);
  });

  it('🔴 honours the layer a plate is ALREADY on — a moved plate strands a live picture', () => {
    // The old layer would keep its producer with nobody's name on it: the ledger
    // teardown walks would name the NEW layer, so the picture would stay on air
    // until somebody noticed it by eye.
    expect(
      allocateLiveLayers({
        range: { start: 10, end: 59 },
        preferred: [42, undefined, 17],
        isAvailable: FREE,
      }),
    ).toEqual([42, 10, 17]);
  });

  it('🔴 layer 0 is a REAL preference, not "no preference" — zero is falsy', () => {
    // The whole reason `preferred` is tested with `!== undefined`. A truthiness
    // check would silently re-home a plate off layer 0 and leave its producer
    // behind, which is the same defect `route.layer` already produced once.
    expect(
      allocateLiveLayers({
        range: { start: 0, end: 9 },
        preferred: [0],
        isAvailable: FREE,
      }),
    ).toEqual([0]);
  });

  it('falls through to a fresh layer when the preferred one is no longer free', () => {
    expect(
      allocateLiveLayers({
        range: { start: 10, end: 59 },
        preferred: [42],
        isAvailable: (layer) => layer !== 42,
      }),
    ).toEqual([10]);
  });

  it('falls through when the preferred layer is outside the declared band', () => {
    // The band moved under a running bridge — the old coordinate is no longer
    // ours to place on, whatever the ledger still says.
    expect(
      allocateLiveLayers({
        range: { start: 10, end: 19 },
        preferred: [42],
        isAvailable: FREE,
      }),
    ).toEqual([10]);
  });

  it('never hands the same layer to two plates, even when both prefer it', () => {
    const layers = allocateLiveLayers({
      range: { start: 10, end: 59 },
      preferred: [30, 30],
      isAvailable: FREE,
    });
    expect(layers).toEqual([30, 10]);
    expect(new Set(layers ?? []).size).toBe(2);
  });

  it('🔴 refuses ALL-OR-NOTHING when the band cannot hold every plate', () => {
    // A template with three guest boxes and room for two is a designed layout with
    // a hole in it — the silent-empty-hole outcome reached by a different road.
    expect(
      allocateLiveLayers({
        range: { start: 30, end: 31 },
        preferred: [undefined, undefined, undefined],
        isAvailable: FREE,
      }),
    ).toBeNull();
  });

  it('refuses when the band is wide enough but nothing in it is free', () => {
    expect(
      allocateLiveLayers({
        range: { start: 30, end: 39 },
        preferred: [undefined],
        isAvailable: () => false,
      }),
    ).toBeNull();
  });

  it('a template with no plates allocates nothing and does not refuse', () => {
    expect(
      allocateLiveLayers({ range: { start: 10, end: 59 }, preferred: [], isAvailable: FREE }),
    ).toEqual([]);
  });
});

describe('allocateOrderedLiveLayers', () => {
  it('places a pinned upper seat’s predecessors first, even with holes and unrelated seats', () => {
    expect(
      allocateOrderedLiveLayers(
        {
          range: { start: 30, end: 35 },
          preferred: [undefined, 33, undefined, undefined],
          isAvailable: (layer) => layer !== 31,
        },
        [
          [3, 2],
          [2, 1],
        ],
      ),
    ).toEqual([34, 33, 32, 30]);
  });

  it('refuses incompatible pinned coordinates even when there is spare capacity', () => {
    expect(
      allocateOrderedLiveLayers(
        { range: { start: 30, end: 35 }, preferred: [33, 30], isAvailable: FREE },
        [[0, 1]],
      ),
    ).toBeNull();
  });

  it('refuses a producer order that loops across Looks', () => {
    expect(
      allocateOrderedLiveLayers(
        { range: { start: 30, end: 35 }, preferred: [undefined, undefined], isAvailable: FREE },
        [
          [0, 1],
          [1, 0],
        ],
      ),
    ).toBeNull();
  });
});

describe('spaceLiveLayersForBorders', () => {
  it('leaves four usable edges above the requested lower picture and keeps physical order', () => {
    const reserved = new Set([63, 66]);
    expect(
      spaceLiveLayersForBorders([62, 60, 61], new Set([1]), (layer) => !reserved.has(layer), {
        start: 60,
        end: 69,
      }),
    ).toEqual([68, 60, 67]);
  });

  it('leaves independent Focus artwork over unbordered plates and four edges over the third', () => {
    expect(
      spaceLiveLayersForBorders(
        [60, 61, 62],
        new Set([2]),
        FREE,
        { start: 60, end: 68 },
        4,
        new Set(),
        new Map(),
        [],
        new Set([0, 1, 2]),
      ),
    ).toEqual([60, 62, 64]);
  });

  it('shares one Focus page across alternate seats belonging to the same plate', () => {
    const owners = new Map([
      [0, 'a'],
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    expect(
      spaceLiveLayersForBorders(
        [60, 61, 62, 63],
        new Set([3]),
        FREE,
        { start: 60, end: 69 },
        4,
        new Set(),
        owners,
        [],
        new Set([0, 1, 2, 3]),
      ),
    ).toEqual([60, 61, 63, 65]);
  });

  it('keeps existing coordinates when the optional gap already fits', () => {
    expect(
      spaceLiveLayersForBorders([65, 58], new Set([1]), (layer) => layer !== 60 && layer !== 62, {
        start: 58,
        end: 70,
      }),
    ).toEqual([65, 58]);
  });

  it('shifts lower to fit when both fresh picture coordinates were near the foreground', () => {
    expect(spaceLiveLayersForBorders([68, 69], new Set([0]), FREE, { start: 64, end: 70 })).toEqual(
      [65, 70],
    );
  });

  it('leaves a fallback under the owning picture and its border without moving it below a peer', () => {
    expect(
      spaceLiveLayersForBorders(
        [60, 61, 62],
        new Set([0, 1, 2]),
        (layer) => layer !== 65,
        { start: 60, end: 79 },
        4,
        new Set([1, 2]),
      ),
    ).toEqual([60, 67, 73]);
  });

  it('fits four seats into a 20-layer band when two alternates share one plate', () => {
    const seats = new Set([0, 1, 2, 3]);
    const artwork = new Map([
      [0, 'playlist'],
      [1, 'ndi'],
      [2, 'media'],
      [3, 'ndi'],
    ]);
    expect(
      spaceLiveLayersForBorders(
        [60, 61, 62, 63],
        seats,
        FREE,
        { start: 60, end: 78 },
        4,
        seats,
        artwork,
        [
          [0, 1],
          [0, 3],
          [1, 2],
          [3, 2],
        ],
      ),
    ).toEqual([61, 67, 74, 68]);
  });

  it('keeps alternate seats distinct when compacting would reverse a required depth', () => {
    const seats = new Set([0, 1, 2, 3]);
    const artwork = new Map([
      [0, 'playlist'],
      [1, 'ndi'],
      [2, 'media'],
      [3, 'ndi'],
    ]);
    expect(
      spaceLiveLayersForBorders(
        [60, 61, 62, 63],
        seats,
        FREE,
        { start: 60, end: 78 },
        4,
        seats,
        artwork,
        [
          [0, 1],
          [1, 2],
          [2, 3],
        ],
      ),
    ).toBeNull();
  });

  it('returns no optional allocation if even one requested gap would cross the band', () => {
    expect(
      spaceLiveLayersForBorders([62, 60, 61], new Set([0, 1]), FREE, { start: 60, end: 69 }),
    ).toBeNull();
  });
});
