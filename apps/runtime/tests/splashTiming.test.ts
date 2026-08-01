import { describe, expect, it } from 'vitest';
import {
  SPLASH_CEILING_MS,
  SPLASH_COLD_FLOOR_MS,
  SPLASH_PHASES,
  SPLASH_WARM_FLOOR_MS,
  splashDismissAt,
  splashFloorMs,
  splashProgress,
  splashProgressPercent,
} from '../src/renderer/splashTiming.js';

/**
 * R-031 — the splash's timing contract, as arithmetic.
 *
 * These assert the RULE, not the wiring: `tests/splash.dom.test.ts` is what proves the
 * inline script in `index.html` actually implements what is proved here.
 */

const T0 = 1_000_000;

describe('splashFloorMs', () => {
  it('a cold start holds for at least five seconds', () => {
    expect(splashFloorMs(true)).toBe(SPLASH_COLD_FLOOR_MS);
    expect(SPLASH_COLD_FLOOR_MS).toBe(5000);
  });

  it('a warm reload holds only long enough not to strobe', () => {
    expect(splashFloorMs(false)).toBe(SPLASH_WARM_FLOOR_MS);
    expect(SPLASH_WARM_FLOOR_MS).toBe(600);
  });
});

describe('splashDismissAt', () => {
  it('a cold boot that finishes early still holds the full floor', () => {
    // Boot done 200ms in — the splash is NOT hiding a slow boot, it is being the
    // product's first frame, which is what the cold floor is for.
    const at = splashDismissAt({ firstPaintAt: T0, bootDoneAt: T0 + 200, coldStart: true });
    expect(at).toBe(T0 + SPLASH_COLD_FLOOR_MS);
    expect(at - T0).toBeGreaterThanOrEqual(5000);
  });

  it('a warm boot that finishes early holds only the warm floor', () => {
    const at = splashDismissAt({ firstPaintAt: T0, bootDoneAt: T0 + 120, coldStart: false });
    expect(at).toBe(T0 + SPLASH_WARM_FLOOR_MS);
    expect(at - T0).toBeGreaterThanOrEqual(600);
    expect(at - T0).toBeLessThan(SPLASH_COLD_FLOOR_MS);
  });

  it('a boot SLOWER than the floor extends the hold — the floor is a minimum, not a schedule', () => {
    const slow = T0 + 9000;
    expect(splashDismissAt({ firstPaintAt: T0, bootDoneAt: slow, coldStart: true })).toBe(slow);
    expect(splashDismissAt({ firstPaintAt: T0, bootDoneAt: slow, coldStart: false })).toBe(slow);
  });

  it('the ceiling fires with boot still incomplete', () => {
    // The safety property: a stuck boot must never leave the operator without a door
    // into the application. No `bootDoneAt` at all ⇒ the ceiling is the answer.
    const at = splashDismissAt({ firstPaintAt: T0, bootDoneAt: undefined, coldStart: true });
    expect(at).toBe(T0 + SPLASH_CEILING_MS);
    expect(SPLASH_CEILING_MS).toBe(20_000);
  });

  it('the ceiling wins over a boot that lands after it', () => {
    const at = splashDismissAt({
      firstPaintAt: T0,
      bootDoneAt: T0 + 45_000,
      coldStart: true,
    });
    expect(at).toBe(T0 + SPLASH_CEILING_MS);
  });

  it('is a pure function — the same input always gives the same instant', () => {
    // Stated as a test because the whole point of extracting this was that a tangle of
    // `setTimeout`s cannot be reasoned about. Two identical calls, two identical answers.
    const input = { firstPaintAt: T0, bootDoneAt: T0 + 3000, coldStart: true } as const;
    expect(splashDismissAt(input)).toBe(splashDismissAt(input));
  });
});

describe('splashProgress — one definition for the rail and the percentage', () => {
  const TOTAL = SPLASH_PHASES.length;
  const FLOOR = SPLASH_COLD_FLOOR_MS;

  /** A cold boot at `elapsedMs` with `completedSteps` behind it. */
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
    expect(at(0, 0)).toBe(0);
    expect(splashProgressPercent(at(0, 0))).toBe(0);
  });

  it('IS GATED BY REAL STEPS — the clock can never run ahead of finished work', () => {
    // The floor has fully elapsed but only one of three steps is behind us. The `min` is
    // the whole honesty argument: without it this would sit at 100% over a boot that is
    // still probing a bridge that may never answer.
    expect(at(FLOOR, 1)).toBeCloseTo(1 / 3, 10);
    expect(at(FLOOR * 4, 2)).toBeCloseTo(2 / 3, 10);
    expect(splashProgressPercent(at(FLOOR * 4, 2))).toBe(66);
  });

  it('IS GATED BY THE CLOCK — finished work does not open a door the floor still holds', () => {
    // Every step done a fifth of the way in. The hold is what remains, so the reading is
    // the hold's, and it is the countdown to the door opening that §5 describes.
    expect(at(FLOOR / 5, TOTAL)).toBeCloseTo(0.2, 10);
    expect(at(FLOOR / 2, TOTAL)).toBeCloseTo(0.5, 10);
  });

  it('READS 100 EXACTLY WHEN THE SPLASH MAY DISMISS — floor elapsed AND boot done', () => {
    expect(splashProgressPercent(at(FLOOR, TOTAL))).toBe(100);
    // …and at neither one alone.
    expect(splashProgressPercent(at(FLOOR, TOTAL - 1))).toBeLessThan(100);
    expect(splashProgressPercent(at(FLOOR - 1, TOTAL))).toBeLessThan(100);
  });

  it('never exceeds 100, however long a slow boot overruns the floor', () => {
    expect(at(FLOOR * 10, TOTAL)).toBe(1);
    expect(splashProgressPercent(at(FLOOR * 10, TOTAL))).toBe(100);
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
    // 99.6% is not 100%. A screen reading 100 while the door is still shut is the same
    // false claim as the terminal READY label this splash deliberately does not have.
    expect(splashProgressPercent(at(FLOOR * 0.996, TOTAL))).toBe(99);
  });

  it('a warm reload sweeps the same arc over its own shorter floor', () => {
    const warm = (elapsedMs: number, completedSteps: number): number =>
      splashProgress({
        elapsedMs,
        floorMs: SPLASH_WARM_FLOOR_MS,
        completedSteps,
        totalSteps: TOTAL,
      });
    expect(splashProgressPercent(warm(SPLASH_WARM_FLOOR_MS / 2, TOTAL))).toBe(50);
    expect(splashProgressPercent(warm(SPLASH_WARM_FLOOR_MS, TOTAL))).toBe(100);
  });

  it('at the ceiling with a boot that never finished, it honestly reads below 100', () => {
    // Stated because it looks like a bug and is not: the splash dismisses at 20 s
    // regardless, and pretending the number reached 100 would be inventing the one thing
    // this readout refuses to invent.
    expect(splashProgressPercent(at(SPLASH_CEILING_MS, 1))).toBe(33);
  });
});
