import { describe, expect, it } from 'vitest';
import {
  SPLASH_CEILING_MS,
  SPLASH_COLD_FLOOR_MS,
  SPLASH_WARM_FLOOR_MS,
  splashDismissAt,
  splashFloorMs,
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
