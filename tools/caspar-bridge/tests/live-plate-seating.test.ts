import { describe, expect, it } from 'vitest';
import { allocateLiveLayers } from '../src/live-plate-seating.js';

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
