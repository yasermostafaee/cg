import { describe, expect, it } from 'vitest';
import {
  SPLASH_CEILING_MS,
  splashDismissAt,
  splashProgress,
  splashProgressPercent,
} from '../src/timing.js';

describe('splash dismissal', () => {
  it.each([0, 120, 9000])('starts at the actual completion instant (%i ms)', (elapsed) => {
    expect(splashDismissAt({ firstPaintAt: 100, bootDoneAt: 100 + elapsed })).toBe(100 + elapsed);
  });

  it('caps late or missing completion at the absolute ceiling', () => {
    expect(SPLASH_CEILING_MS).toBe(20_000);
    expect(splashDismissAt({ firstPaintAt: 100 })).toBe(20_100);
    expect(splashDismissAt({ firstPaintAt: 100, bootDoneAt: 30_000 })).toBe(20_100);
  });
});

describe('splash progress', () => {
  it('tracks real completed steps and floors percentages', () => {
    expect(
      [0, 1, 2, 3].map((completedSteps) =>
        splashProgressPercent(splashProgress({ completedSteps, totalSteps: 3 })),
      ),
    ).toEqual([0, 33, 66, 100]);
    expect(splashProgressPercent(0.999)).toBe(99);
  });

  it('stays monotone and within range', () => {
    expect(splashProgress({ completedSteps: 1, totalSteps: 3, previous: 2 / 3 })).toBe(2 / 3);
    expect(splashProgress({ completedSteps: -2, totalSteps: 3 })).toBe(0);
    expect(splashProgress({ completedSteps: 9, totalSteps: 3 })).toBe(1);
  });
});
