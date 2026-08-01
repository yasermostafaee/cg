import { describe, expect, it } from 'vitest';
import {
  SPLASH_CEILING_MS,
  splashDismissAt,
  splashFloorMs,
  splashProgress,
  splashProgressPercent,
  type SplashFloors,
} from '../src/timing.js';

/**
 * The splash timing contract, as arithmetic — asserted here ONCE for both apps.
 *
 * These assert the RULE. Each app's `tests/splash.dom.test.ts` is what proves its own inline
 * script actually implements what is proved here, and each app's own test file pins the
 * floors, session key and phase list that belong to it.
 */

const T0 = 1_000_000;

/** What both products currently ship. */
const SHIPPED: SplashFloors = { cold: 8000, warm: 3000 };
/** Deliberately DIFFERENT numbers, so these prove the function is parameterised at all.
 *  Both products currently ship SHIPPED's values; if a test used only those, a hard-coded
 *  floor would pass this file unnoticed. */
const OTHER: SplashFloors = { cold: 4000, warm: 900 };

describe('splashFloorMs', () => {
  it('picks the cold or the warm floor, per app', () => {
    expect(splashFloorMs(true, SHIPPED)).toBe(8000);
    expect(splashFloorMs(false, SHIPPED)).toBe(3000);
    expect(splashFloorMs(true, OTHER)).toBe(4000);
    expect(splashFloorMs(false, OTHER)).toBe(900);
  });
});

describe('splashDismissAt', () => {
  it('a cold boot that finishes early still holds the full floor', () => {
    // The splash is NOT hiding a slow boot, it is being the product's first frame.
    const at = splashDismissAt({
      firstPaintAt: T0,
      bootDoneAt: T0 + 200,
      coldStart: true,
      floors: OTHER,
    });
    expect(at).toBe(T0 + OTHER.cold);
  });

  it('a warm boot that finishes early holds only THAT set of floors` warm value', () => {
    const warm = (floors: SplashFloors): number =>
      splashDismissAt({ firstPaintAt: T0, bootDoneAt: T0 + 120, coldStart: false, floors });
    expect(warm(SHIPPED) - T0).toBe(3000);
    expect(warm(OTHER) - T0).toBe(900);
  });

  it('a boot SLOWER than the floor extends the hold — the floor is a minimum, not a schedule', () => {
    const slow = T0 + 9000;
    for (const floors of [SHIPPED, OTHER]) {
      expect(splashDismissAt({ firstPaintAt: T0, bootDoneAt: slow, coldStart: true, floors })).toBe(
        slow,
      );
    }
  });

  it('the ceiling fires with boot still incomplete', () => {
    // The safety property: a stuck boot must never leave the operator without a door into
    // the application. No `bootDoneAt` at all ⇒ the ceiling is the answer.
    const at = splashDismissAt({
      firstPaintAt: T0,
      bootDoneAt: undefined,
      coldStart: true,
      floors: OTHER,
    });
    expect(at).toBe(T0 + SPLASH_CEILING_MS);
    expect(SPLASH_CEILING_MS).toBe(20_000);
  });

  it('the ceiling wins over a boot that lands after it', () => {
    const at = splashDismissAt({
      firstPaintAt: T0,
      bootDoneAt: T0 + 45_000,
      coldStart: true,
      floors: OTHER,
    });
    expect(at).toBe(T0 + SPLASH_CEILING_MS);
  });

  it('is a pure function — the same input always gives the same instant', () => {
    const input = {
      firstPaintAt: T0,
      bootDoneAt: T0 + 3000,
      coldStart: true,
      floors: SHIPPED,
    } as const;
    expect(splashDismissAt(input)).toBe(splashDismissAt(input));
  });
});

describe('splashProgress — one definition for the rail and the percentage', () => {
  const FLOOR = 5000;
  const TOTAL = 3;

  function at(elapsedMs: number, completedSteps: number, previous?: number): number {
    return splashProgress({
      elapsedMs,
      floorMs: FLOOR,
      completedSteps,
      totalSteps: TOTAL,
      previous,
    });
  }

  it('starts at zero — nothing has finished on the first frame', () => {
    expect(splashProgressPercent(at(0, 0))).toBe(0);
  });

  it('IS GATED BY REAL STEPS — the clock can never run ahead of finished work', () => {
    // The floor has fully elapsed but only one of three steps is behind us. The `min` is the
    // whole honesty argument: without it this would sit at 100% over a boot that is still
    // waiting on a storage layer that may never answer.
    expect(at(FLOOR, 1)).toBeCloseTo(1 / 3, 10);
    expect(splashProgressPercent(at(FLOOR * 4, 2))).toBe(66);
  });

  it('IS GATED BY THE CLOCK — finished work does not open a door the floor still holds', () => {
    expect(at(FLOOR / 5, TOTAL)).toBeCloseTo(0.2, 10);
    expect(at(FLOOR / 2, TOTAL)).toBeCloseTo(0.5, 10);
  });

  it('READS 100 EXACTLY WHEN THE SPLASH MAY DISMISS — floor elapsed AND boot done', () => {
    expect(splashProgressPercent(at(FLOOR, TOTAL))).toBe(100);
    expect(splashProgressPercent(at(FLOOR, TOTAL - 1))).toBeLessThan(100);
    expect(splashProgressPercent(at(FLOOR - 1, TOTAL))).toBeLessThan(100);
  });

  it('never exceeds 100, however long a slow boot overruns the floor', () => {
    expect(at(FLOOR * 10, TOTAL)).toBe(1);
  });

  it('NEVER GOES BACKWARDS — a retreating readout reads as a fault', () => {
    const seen = at(FLOOR / 2, TOTAL);
    // A clock that jumped back (system time adjustment, a resumed tab) cannot un-report
    // progress the operator has already been shown.
    expect(at(0, TOTAL, seen)).toBe(seen);
    expect(at(FLOOR / 4, 0, seen)).toBe(seen);
  });

  it('is monotone across a whole cold boot, step by step', () => {
    const timeline: [number, number][] = [
      [0, 0],
      [400, 1],
      [900, 2],
      [1200, TOTAL],
      [2500, TOTAL],
      [FLOOR, TOTAL],
    ];
    let previous = 0;
    const readings = timeline.map(([elapsed, steps]) => {
      previous = at(elapsed, steps, previous);
      return splashProgressPercent(previous);
    });
    expect(readings).toEqual([...readings].sort((a, b) => a - b));
    expect(readings.at(-1)).toBe(100);
  });

  it('FLOORS rather than rounds — 100 cannot appear a moment early', () => {
    // 99.6% is not 100%. A screen reading 100 while the door is still shut is the same false
    // claim as the terminal READY label these splashes deliberately do not have.
    expect(splashProgressPercent(at(FLOOR * 0.996, TOTAL))).toBe(99);
  });

  it('a two-step app and a three-step app both sweep their own arc', () => {
    // The denominator is the app's own phase count; nothing here assumes three.
    const two = splashProgress({
      elapsedMs: FLOOR,
      floorMs: FLOOR,
      completedSteps: 1,
      totalSteps: 2,
    });
    expect(splashProgressPercent(two)).toBe(50);
  });

  it('at the ceiling with a boot that never finished, it honestly reads below 100', () => {
    expect(splashProgressPercent(at(SPLASH_CEILING_MS, 1))).toBe(33);
  });
});
