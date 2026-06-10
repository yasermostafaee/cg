import { describe, expect, it } from 'vitest';
import type { Keyframe } from '@cg/shared-schema';
import {
  buildKeyframeStacks,
  clamp01,
  deltaFramesFromPx,
  frameFromClientX,
  frameSpan,
  frameToPct,
  frameToPctClamped,
  isKeyframeSelected,
  pickStride,
  segmentPct,
  stackOffsetPx,
  stridePeriodPct,
  tickFrames,
  type KeyframeRefLike,
} from '../src/renderer/features/timeline/timeline-geometry.js';

/**
 * Pure timeline-authoring geometry extracted from the React event closures in
 * FrameRuler/TrackRow/TimelineDock. The interactive UI is covered by the
 * Playwright E2E suite; this guards the deterministic math.
 */

const kf = (frame: number, id?: string): Keyframe => ({
  ...(id !== undefined ? { id } : {}),
  frame,
  value: 0,
  easing: 'linear',
});

describe('clamp01', () => {
  it('clamps to [0, 1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });
});

describe('frameSpan', () => {
  it('is the frame difference', () => {
    expect(frameSpan(0, 300)).toBe(300);
    expect(frameSpan(10, 40)).toBe(30);
  });
  it('floors at 1 so a zero-length range never divides by zero', () => {
    expect(frameSpan(50, 50)).toBe(1);
    expect(frameSpan(50, 10)).toBe(1);
  });
});

describe('frameFromClientX', () => {
  // Lane spanning client x ∈ [100, 700] (width 600) over frames 0..300.
  it('maps the left edge to frameIn and the right edge to frameOut', () => {
    expect(frameFromClientX(100, 100, 600, 0, 300)).toBe(0);
    expect(frameFromClientX(700, 100, 600, 0, 300)).toBe(300);
  });
  it('maps the midpoint to the middle frame', () => {
    expect(frameFromClientX(400, 100, 600, 0, 300)).toBe(150);
  });
  it('rounds to the nearest frame (snap-to-frame)', () => {
    // The lane is 2px/frame, so the half-frame boundary sits 1px off each frame.
    expect(frameFromClientX(402, 100, 600, 0, 300)).toBe(151); // 302px → 151 exactly
    expect(frameFromClientX(401, 100, 600, 0, 300)).toBe(151); // 150.5 → rounds up
    expect(frameFromClientX(399, 100, 600, 0, 300)).toBe(150); // 149.5 → rounds up
  });
  it('pins past either edge to frameIn / frameOut', () => {
    expect(frameFromClientX(0, 100, 600, 0, 300)).toBe(0);
    expect(frameFromClientX(9999, 100, 600, 0, 300)).toBe(300);
  });
  it('honours a non-zero frameIn', () => {
    expect(frameFromClientX(100, 100, 600, 100, 400)).toBe(100);
    expect(frameFromClientX(700, 100, 600, 100, 400)).toBe(400);
  });
});

describe('frameToPct / frameToPctClamped', () => {
  it('maps in/mid/out to 0 / 50 / 100 percent', () => {
    expect(frameToPct(0, 0, 300)).toBe(0);
    expect(frameToPct(150, 0, 300)).toBe(50);
    expect(frameToPct(300, 0, 300)).toBe(100);
  });
  it('frameToPct is unclamped (off-range points sit off-lane)', () => {
    expect(frameToPct(-30, 0, 300)).toBeCloseTo(-10, 6);
    expect(frameToPct(330, 0, 300)).toBeCloseTo(110, 6);
  });
  it('frameToPctClamped pins to [0, 100]', () => {
    expect(frameToPctClamped(-30, 0, 300)).toBe(0);
    expect(frameToPctClamped(330, 0, 300)).toBe(100);
    expect(frameToPctClamped(150, 0, 300)).toBe(50);
  });
});

describe('segmentPct', () => {
  it('returns the left offset and width between two keyframes', () => {
    expect(segmentPct(60, 150, 0, 300)).toEqual({ leftPct: 20, widthPct: 30 });
  });
  it('reports a non-positive width for a stacked pair (same frame)', () => {
    expect(segmentPct(150, 150, 0, 300).widthPct).toBe(0);
    expect(segmentPct(150, 90, 0, 300).widthPct).toBeLessThan(0);
  });
});

describe('deltaFramesFromPx', () => {
  it('converts a pixel delta to a (float) frame delta over the total span', () => {
    // 600px wide lane over 300 frames ⇒ 2px/frame ⇒ 60px = 30 frames.
    expect(deltaFramesFromPx(60, 600, 0, 300)).toBe(30);
    expect(deltaFramesFromPx(-60, 600, 0, 300)).toBe(-30);
  });
  it('does not snap (returns fractional frames)', () => {
    expect(deltaFramesFromPx(3, 600, 0, 300)).toBeCloseTo(1.5, 6);
  });
});

describe('pickStride', () => {
  it('walks the 1/2/5/10/25 ladder by visible-frame count', () => {
    expect(pickStride(44)).toBe(1);
    expect(pickStride(45)).toBe(2);
    expect(pickStride(90)).toBe(2);
    expect(pickStride(91)).toBe(5);
    expect(pickStride(200)).toBe(5);
    expect(pickStride(201)).toBe(10);
    expect(pickStride(500)).toBe(10);
    expect(pickStride(501)).toBe(25);
  });
});

describe('tickFrames', () => {
  it('lists frames from lo to hi inclusive every stride', () => {
    expect(tickFrames(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10]);
  });
  it('includes hi only when it lands on the stride', () => {
    expect(tickFrames(0, 9, 2)).toEqual([0, 2, 4, 6, 8]);
  });
  it('returns just [lo] for an empty/degenerate range', () => {
    expect(tickFrames(5, 5, 2)).toEqual([5]);
    expect(tickFrames(5, 1, 2)).toEqual([5]);
  });
});

describe('stridePeriodPct', () => {
  it('is the percent-of-span occupied by one stride', () => {
    expect(stridePeriodPct(5, 0, 100)).toBe(5);
    expect(stridePeriodPct(10, 0, 200)).toBe(5);
  });
});

describe('buildKeyframeStacks / stackOffsetPx', () => {
  it('counts how many keyframes share each frame', () => {
    const { countByFrame } = buildKeyframeStacks([kf(10, 'a'), kf(10, 'b'), kf(20, 'c')]);
    expect(countByFrame.get(10)).toBe(2);
    expect(countByFrame.get(20)).toBe(1);
  });
  it('assigns each id its slot index within its frame (array order)', () => {
    const { indexById } = buildKeyframeStacks([kf(10, 'a'), kf(10, 'b'), kf(10, 'c')]);
    expect(indexById.get('a')).toBe(0);
    expect(indexById.get('b')).toBe(1);
    expect(indexById.get('c')).toBe(2);
  });
  it('omits legacy id-less points from indexById but still counts them', () => {
    const { countByFrame, indexById } = buildKeyframeStacks([kf(10), kf(10, 'b')]);
    expect(countByFrame.get(10)).toBe(2);
    expect(indexById.get('b')).toBe(1);
    expect(indexById.size).toBe(1);
  });
  it('centres the fan: a lone point is 0, a pair straddles, a triple is -gap/0/+gap', () => {
    expect(stackOffsetPx(0, 1)).toBe(0);
    expect(stackOffsetPx(0, 2)).toBe(-2.5);
    expect(stackOffsetPx(1, 2)).toBe(2.5);
    expect(stackOffsetPx(0, 3)).toBe(-5);
    expect(stackOffsetPx(1, 3)).toBe(0);
    expect(stackOffsetPx(2, 3)).toBe(5);
  });
});

describe('isKeyframeSelected', () => {
  const sel: readonly KeyframeRefLike[] = [
    { elementId: 'e1', property: 'position.x', frame: 10 },
    { elementId: 'e1', property: 'opacity', frame: 20 },
  ];
  it('is true only for an exact element+property+frame match', () => {
    expect(isKeyframeSelected(sel, 'e1', 'position.x', 10)).toBe(true);
    expect(isKeyframeSelected(sel, 'e1', 'opacity', 20)).toBe(true);
  });
  it('is false when any of element / property / frame differs', () => {
    expect(isKeyframeSelected(sel, 'e2', 'position.x', 10)).toBe(false);
    expect(isKeyframeSelected(sel, 'e1', 'position.y', 10)).toBe(false);
    expect(isKeyframeSelected(sel, 'e1', 'position.x', 11)).toBe(false);
    expect(isKeyframeSelected([], 'e1', 'position.x', 10)).toBe(false);
  });
});
