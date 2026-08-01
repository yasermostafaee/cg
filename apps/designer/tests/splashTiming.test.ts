import { describe, expect, it } from 'vitest';
import {
  SPLASH_CEILING_MS,
  SPLASH_COLD_FLOOR_MS,
  SPLASH_PHASES,
  SPLASH_SESSION_KEY,
  SPLASH_WARM_FLOOR_MS,
  splashDismissAt,
  splashFloorMs,
  splashProgress,
  splashProgressPercent,
} from '../src/renderer/splashTiming.js';

/**
 * The Designer splash's timing — THIS APP'S NUMBERS.
 *
 * The arithmetic itself is proved once in `tools/splash-kit`; both apps run the same
 * functions, so re-proving `min`/`max` here would be testing someone else's code twice.
 * What this file pins is what belongs to the Designer: its floors, its own session key, its
 * phase list — and that the shared rules, once bound to those numbers, still behave.
 */

const T0 = 1_000_000;

describe('the floors are the Designer`s own', () => {
  it('holds a cold start for eight seconds', () => {
    expect(SPLASH_COLD_FLOOR_MS).toBe(8000);
    expect(splashFloorMs(true)).toBe(SPLASH_COLD_FLOOR_MS);
    expect(splashFloorMs(true)).toBeGreaterThanOrEqual(8000);
  });

  it('holds a WARM reload for three seconds — longer than the Runtime`s, by decision', () => {
    // The Runtime's warm floor is 600 ms because it is the on-air tool and an operator
    // reloading it is usually in a hurry. Nobody reloads the Designer under that pressure,
    // so here the splash is a brand moment on every load, and the entrance (which settles at
    // ~1.6 s) is never cut off mid-flight.
    expect(SPLASH_WARM_FLOOR_MS).toBe(3000);
    expect(splashFloorMs(false)).toBe(SPLASH_WARM_FLOOR_MS);
    expect(splashFloorMs(false)).toBeGreaterThanOrEqual(3000);
    expect(splashFloorMs(false)).toBeLessThan(splashFloorMs(true));
  });

  it('uses its OWN session key, not the Runtime`s', () => {
    // Both apps can be open in the same browser at once. A shared marker would make opening
    // one of them decide the other's floor.
    expect(SPLASH_SESSION_KEY).toBe('CG_DESIGNER_SESSION');
    expect(SPLASH_SESSION_KEY).not.toContain('RUNTIME');
  });
});

describe('splashDismissAt, bound to those floors', () => {
  it('a cold boot that finishes at once still holds the full eight seconds', () => {
    const at = splashDismissAt({ firstPaintAt: T0, bootDoneAt: T0 + 150, coldStart: true });
    expect(at - T0).toBe(8000);
  });

  it('a warm reload holds three seconds', () => {
    const at = splashDismissAt({ firstPaintAt: T0, bootDoneAt: T0 + 150, coldStart: false });
    expect(at - T0).toBe(3000);
  });

  it('a boot slower than the floor extends the hold', () => {
    const slow = T0 + 11_000;
    expect(splashDismissAt({ firstPaintAt: T0, bootDoneAt: slow, coldStart: true })).toBe(slow);
  });

  it('THE CEILING IS ABSOLUTE — a boot that never finishes still opens the door', () => {
    // A stuck splash means the operator has no way into the application at all.
    const at = splashDismissAt({ firstPaintAt: T0, bootDoneAt: undefined, coldStart: true });
    expect(at).toBe(T0 + SPLASH_CEILING_MS);
    expect(SPLASH_CEILING_MS).toBe(20_000);
    // …and the cold floor must stay well clear of it, or the two would be the same rule.
    expect(SPLASH_COLD_FLOOR_MS).toBeLessThan(SPLASH_CEILING_MS);
  });
});

describe('the phase list is the boot path that exists', () => {
  it('names three real steps and no terminal word', () => {
    expect([...SPLASH_PHASES]).toEqual(['INITIALIZING', 'OPENING STORAGE', 'STARTING INTERFACE']);
    // No `READY`: the app is not ready until the splash is GONE, so a label claiming it
    // while the door is still shut would be a false claim on the product's first frame.
    expect(SPLASH_PHASES.some((p) => /ready/i.test(p))).toBe(false);
  });

  it('does NOT claim a project-loading step — the boot path has none', () => {
    // The project index is read by the landing screen after React mounts, not by
    // `bootstrap()`. Naming it would be inventing a step to lengthen the readout, and
    // gating on it would risk a splash that never lifts.
    expect(SPLASH_PHASES.some((p) => /project/i.test(p))).toBe(false);
  });
});

describe('the progress readout, over this app`s floor', () => {
  const TOTAL = SPLASH_PHASES.length;
  const FLOOR = SPLASH_COLD_FLOOR_MS;

  function at(elapsedMs: number, completedSteps: number, previous?: number): number {
    return splashProgress({
      elapsedMs,
      floorMs: FLOOR,
      completedSteps,
      totalSteps: TOTAL,
      previous,
    });
  }

  it('starts at 0% and reaches 100% exactly when the splash may dismiss', () => {
    expect(splashProgressPercent(at(0, 0))).toBe(0);
    expect(splashProgressPercent(at(FLOOR, TOTAL))).toBe(100);
    expect(splashProgressPercent(at(FLOOR, TOTAL - 1))).toBeLessThan(100);
    expect(splashProgressPercent(at(FLOOR - 1, TOTAL))).toBeLessThan(100);
  });

  it('is gated by real steps — a slow storage open PARKS the number', () => {
    // Boot is stuck on step 2 of 3 and the eight seconds have run out. The readout must not
    // sweep past work that has not returned.
    expect(splashProgressPercent(at(FLOOR * 2, 1))).toBe(33);
  });

  it('never goes backwards', () => {
    const seen = at(FLOOR / 2, TOTAL);
    expect(at(0, TOTAL, seen)).toBe(seen);
    expect(at(FLOOR / 4, 0, seen)).toBe(seen);
  });

  it('sweeps the whole eight seconds rather than sitting full and static', () => {
    // The point of gating on the floor as well as the steps: on a fast cold boot every step
    // is done in about a second, and without the clock term the rail would sit at 100% for
    // seven seconds with the door still shut.
    const quarter = splashProgressPercent(at(FLOOR / 4, TOTAL));
    const half = splashProgressPercent(at(FLOOR / 2, TOTAL));
    expect(quarter).toBe(25);
    expect(half).toBe(50);
  });
});
