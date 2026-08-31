import { describe, expect, it } from 'vitest';
import {
  changeEvents,
  changeSeries,
  distribution,
  firstChangeIndex,
  meanAbsDiff,
  separationOk,
  SETTLED_FRACTION,
  splitFrames,
  THRESHOLD_FLOOR,
} from '../src/analyse.js';

/**
 * `B-174` — the pixel-comparison core, tested on synthetic streams whose transitions are
 * KNOWN. Every case here is a way the measured `k` could come back wrong while the harness
 * still printed a confident number.
 */

const frame = (fill: number, size = 12): Uint8Array => new Uint8Array(size).fill(fill);

describe('meanAbsDiff / splitFrames / changeSeries', () => {
  it('meanAbsDiff is the mean absolute per-byte difference', () => {
    expect(meanAbsDiff(frame(10), frame(10))).toBe(0);
    expect(meanAbsDiff(frame(10), frame(13))).toBe(3);
  });

  it('meanAbsDiff refuses frames of different sizes rather than guessing', () => {
    expect(() => meanAbsDiff(frame(0, 3), frame(0, 4))).toThrow(/differ in size/);
  });

  it('splitFrames drops a trailing partial frame instead of reading half a frame as data', () => {
    const raw = new Uint8Array(10);
    expect(splitFrames(raw, 4)).toHaveLength(2);
  });

  it('changeSeries starts at 0 — frame 0 has no predecessor and must never read as an event', () => {
    const series = changeSeries([frame(0), frame(0), frame(200)]);
    expect(series[0]).toBe(0);
    expect(series[1]).toBe(0);
    expect(series[2]).toBe(200);
  });
});

describe('firstChangeIndex', () => {
  it('finds the first frame that differs from its predecessor, after the baseline', () => {
    // 10 quiet frames, then a hard cut.
    const frames = [...Array.from({ length: 10 }, () => frame(10)), frame(200), frame(200)];
    const point = firstChangeIndex(changeSeries(frames), 8);
    expect(point.index).toBe(10);
    expect(point.magnitude).toBe(190);
  });

  it('derives its threshold from the QUIET frames, so codec noise does not read as a cut', () => {
    // Noise of ±2 in the baseline; the transition is 60. Threshold = 2×6 = 12.
    const noisy = Array.from({ length: 10 }, (_, i) => frame(10 + (i % 2 === 0 ? 2 : 0)));
    const frames = [...noisy, frame(70)];
    const point = firstChangeIndex(changeSeries(frames), 10);
    expect(point.noiseFloor).toBe(2);
    expect(point.threshold).toBe(12);
    expect(point.index).toBe(10);
  });

  it('a perfectly clean baseline still gets the absolute floor, never a zero threshold', () => {
    const frames = Array.from({ length: 10 }, () => frame(10));
    const point = firstChangeIndex(changeSeries(frames), 8);
    expect(point.threshold).toBe(THRESHOLD_FLOOR);
  });

  it('🔴 no transition → null, never a rounded guess — the run is DISCARDED upstream', () => {
    const frames = Array.from({ length: 20 }, () => frame(10));
    expect(firstChangeIndex(changeSeries(frames), 10).index).toBeNull();
  });

  it('a change INSIDE the baseline window is not reported as the transition', () => {
    // The event at index 3 sits in the baseline; the real one is at 12. The baseline noise
    // then contains the index-3 spike, which raises the threshold — the price of a dirty
    // settle, and why the harness settles BEFORE it records.
    const frames = [
      ...Array.from({ length: 3 }, () => frame(10)),
      frame(14),
      ...Array.from({ length: 8 }, () => frame(14)),
      frame(240),
    ];
    const point = firstChangeIndex(changeSeries(frames), 10);
    expect(point.index).toBe(12);
  });
});

describe('changeEvents', () => {
  it('reports EVERY rising edge — B-155 has three moving parts, not one', () => {
    const quiet = frame(10);
    const frames = [
      ...Array.from({ length: 8 }, () => quiet),
      frame(100), // event 1 (fills move)
      frame(100),
      frame(100),
      frame(220), // event 2 (the replace lands)
      frame(220),
    ];
    const series = changeSeries(frames);
    const { threshold } = firstChangeIndex(series, 8);
    expect(changeEvents(series, 8, threshold)).toEqual([8, 11]);
  });
});

describe('distribution', () => {
  it('odd and even sample counts both produce a real median', () => {
    expect(distribution([3, 1, 2]).median).toBe(2);
    expect(distribution([1, 2, 3, 4]).median).toBe(2.5);
  });

  it('an empty sample reports n=0 rather than pretending a value', () => {
    const d = distribution([]);
    expect(d.n).toBe(0);
    expect(Number.isNaN(d.median)).toBe(true);
  });

  it('min/max/values come back sorted', () => {
    const d = distribution([3, 1, 2]);
    expect(d.min).toBe(1);
    expect(d.max).toBe(3);
    expect(d.values).toEqual([1, 2, 3]);
  });
});

describe('separationOk — a crossing has to LOOK like the transition the run performed', () => {
  it('accepts a crossing at the scale of the settled difference', () => {
    expect(separationOk(74, 74)).toBe(true);
    expect(separationOk(30, 74)).toBe(true);
  });

  it('🔴 rejects the video-noise crossing that reported k = −340 ms', () => {
    // The measured numbers from the video-background sweep, run 04: a crossing of 6.3 while
    // that probe settled 74 between its two states. Nine sibling runs read +40 ms.
    expect(separationOk(6.3, 74)).toBe(false);
  });

  it('is a FRACTION of what the run settled, not a fixed magnitude', () => {
    // A quiet probe that legitimately moves only a little is still accepted, because the bar
    // moves with it — the point of deriving the bar rather than picking one.
    expect(separationOk(5, 10)).toBe(true);
    expect(SETTLED_FRACTION).toBeLessThan(1);
  });
});
