import { describe, expect, it } from 'vitest';
import type { VideoPlaceholderElement } from '@cg/shared-schema';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';
import { calculateSingleLiveSourceLayout } from '../src/renderer/features/inspector/live-source-single-layout.js';

const plate = (aspect = 16 / 9): VideoPlaceholderElement => ({
  ...defaultLiveSource('live-1', 100, 100),
  expectedAspect: aspect,
});

describe('D-169 — single Live Source quick layout', () => {
  it('fills a matching canvas exactly', () => {
    expect(calculateSingleLiveSourceLayout(plate(), { width: 1920, height: 1080 }, 0)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      margin: 0,
    });
  });

  it('keeps at least the requested inset on every edge without changing aspect', () => {
    expect(calculateSingleLiveSourceLayout(plate(), { width: 1920, height: 1080 }, 54)).toEqual({
      x: 96,
      y: 54,
      width: 1728,
      height: 972,
      margin: 54,
    });
  });

  it('centres a portrait plate without stretching it', () => {
    const result = calculateSingleLiveSourceLayout(plate(3 / 4), { width: 1920, height: 1080 }, 40);
    expect(result).not.toBeNull();
    expect(result?.y).toBe(40);
    expect(result?.height).toBe(1000);
    expect(result?.width).toBe(750);
    expect(result?.x).toBe(585);
  });

  it('clamps an excessive or negative margin inside the canvas', () => {
    expect(calculateSingleLiveSourceLayout(plate(1), { width: 100, height: 80 }, -20)?.margin).toBe(
      0,
    );
    const tiny = calculateSingleLiveSourceLayout(plate(1), { width: 100, height: 80 }, 999);
    expect(tiny?.margin).toBe(39);
    expect(tiny?.width).toBe(2);
    expect(tiny?.height).toBe(2);
  });
});
