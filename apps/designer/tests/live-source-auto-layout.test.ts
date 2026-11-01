import { describe, expect, it } from 'vitest';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';
import {
  calculateLiveSourceAutoLayout,
  liveSourceRowCounts,
} from '../src/renderer/features/inspector/live-source-auto-layout.js';

describe('Live Source auto layout (B-360)', () => {
  it('chooses balanced rows and lets the fuller row sit at either edge', () => {
    expect(liveSourceRowCounts(2, 'more-top')).toEqual([2]);
    expect(liveSourceRowCounts(3, 'more-top')).toEqual([2, 1]);
    expect(liveSourceRowCounts(3, 'more-bottom')).toEqual([1, 2]);
    expect(liveSourceRowCounts(5, 'more-top')).toEqual([3, 2]);
    expect(liveSourceRowCounts(8, 'more-bottom')).toEqual([2, 3, 3]);
    expect(liveSourceRowCounts(2, 'more-top', 'vertical')).toEqual([1, 1]);
  });

  it('places a 2+1 layout symmetrically with exact equal gaps and preserved aspect', () => {
    const elements = [
      defaultLiveSource('a', 1, 2),
      defaultLiveSource('b', 3, 4),
      defaultLiveSource('c', 5, 6),
    ];
    const [a, b, c] = calculateLiveSourceAutoLayout(
      elements,
      { width: 1920, height: 1080 },
      'more-top',
    );
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    expect(a!.y).toBeCloseTo(b!.y);
    expect(c!.y).toBeGreaterThan(a!.y);
    expect(b!.x - (a!.x + a!.width)).toBeCloseTo(c!.y - (a!.y + a!.height));
    expect(a!.x).toBeCloseTo(1920 - (b!.x + b!.width));
    expect(c!.x).toBeCloseTo((1920 - c!.width) / 2);
    for (const item of [a!, b!, c!]) {
      expect(item.width / item.height).toBeCloseTo(16 / 9);
    }
  });

  it('keeps one common height and exact gaps when declared aspects differ', () => {
    const square = { ...defaultLiveSource('square', 0, 0), expectedAspect: 1 };
    const wide = { ...defaultLiveSource('wide', 0, 0), expectedAspect: 2 };
    const [a, b] = calculateLiveSourceAutoLayout(
      [square, wide],
      { width: 1200, height: 800 },
      'more-top',
    );
    expect(a!.height).toBeCloseTo(b!.height);
    expect(a!.width / a!.height).toBeCloseTo(1);
    expect(b!.width / b!.height).toBeCloseTo(2);
    expect(b!.x - (a!.x + a!.width)).toBeCloseTo(20);
    expect(a!.x).toBeCloseTo(1200 - (b!.x + b!.width));
  });

  it('uses independent horizontal/vertical gaps and can stack two plates', () => {
    const elements = [defaultLiveSource('a', 0, 0), defaultLiveSource('b', 0, 0)];
    const [top, bottom] = calculateLiveSourceAutoLayout(
      elements,
      { width: 1920, height: 1080 },
      'more-top',
      { twoPlateLayout: 'vertical', horizontalGap: 80, verticalGap: 140 },
    );
    expect(top!.x).toBeCloseTo(bottom!.x);
    expect(bottom!.y - (top!.y + top!.height)).toBeCloseTo(140);
    expect(top!.y).toBeCloseTo(1080 - (bottom!.y + bottom!.height));
  });

  it('swaps mixed-aspect seats without changing layer order', () => {
    const portrait = { ...defaultLiveSource('portrait', 0, 0), expectedAspect: 3 / 4 };
    const wide = { ...defaultLiveSource('wide', 0, 0), expectedAspect: 16 / 9 };
    const normal = calculateLiveSourceAutoLayout(
      [portrait, wide],
      { width: 1920, height: 1080 },
      'more-top',
      { horizontalGap: 60 },
    );
    const swapped = calculateLiveSourceAutoLayout(
      [portrait, wide],
      { width: 1920, height: 1080 },
      'more-top',
      { horizontalGap: 60, reverse: true },
    );
    expect(normal.map((item) => item.id)).toEqual(['portrait', 'wide']);
    expect(swapped.map((item) => item.id)).toEqual(['wide', 'portrait']);
    expect(normal[1]!.x - (normal[0]!.x + normal[0]!.width)).toBeCloseTo(60);
    expect(swapped[1]!.x - (swapped[0]!.x + swapped[0]!.width)).toBeCloseTo(60);
  });
});
