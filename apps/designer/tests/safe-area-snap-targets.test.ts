import { describe, expect, it } from 'vitest';
import { DEFAULT_BROADCAST_GUIDE_PROFILE } from '@cg/ui';
import { safeAreaSnapTargets } from '../src/renderer/features/canvas/safe-area-snap-targets.js';

const input = {
  raster: { width: 1920, height: 1080 },
  resolution: { width: 1920, height: 1080 },
  position: { anchor: 'center' as const, offset: { x: 0, y: 0 } },
  profile: DEFAULT_BROADCAST_GUIDE_PROFILE,
  visible: true,
};

describe('visible broadcast safe-area snap edges', () => {
  it('includes both action and graphics edges in native project pixels', () => {
    expect(safeAreaSnapTargets(input)).toEqual({
      x: [67, 1853, 96, 1824],
      y: [38, 1042, 54, 1026],
    });
  });
  it('keeps equal-size HD project/composition coordinates1:1', () => {
    expect(
      safeAreaSnapTargets({
        ...input,
        raster: { width: 1280, height: 720 },
        resolution: { width: 1280, height: 720 },
      }),
    ).toEqual({
      x: [45, 1235, 64, 1216],
      y: [25, 695, 36, 684],
    });
  });
  it('converts project edges into a positioned cropped composition without scaling it', () => {
    expect(
      safeAreaSnapTargets({
        ...input,
        resolution: { width: 100, height: 100 },
        position: { anchor: 'top-right', offset: { x: -25, y: 35 } },
      }),
    ).toEqual({ x: [-1728, 58, -1699, 29], y: [3, 1007, 19, 991] });
  });
  it('uses the same contained custom aspect and preserves fractional edges', () => {
    expect(
      safeAreaSnapTargets({
        ...input,
        profile: { ...input.profile, aspect: 'custom', customAspect: { width: 3, height: 2 } },
      }),
    ).toEqual({
      x: [206.5, 1713.5, 231, 1689],
      y: [38, 1042, 54, 1026],
    });
  });
  it('does not attract elements to hidden Safe Areas or disabled broadcast rectangles', () => {
    expect(safeAreaSnapTargets({ ...input, visible: false })).toEqual({ x: [], y: [] });
    expect(
      safeAreaSnapTargets({ ...input, profile: { ...input.profile, standardVisible: false } }),
    ).toEqual({ x: [], y: [] });
  });
  it('does not convert saved custom H/V preferences into broadcast snap targets', () => {
    const targets = safeAreaSnapTargets({
      ...input,
      profile: {
        ...input.profile,
        lines: [{ id: 'old-line', name: 'Legacy guide', axis: 'x', position: 42, visible: true }],
      },
    });
    expect(targets).toEqual(safeAreaSnapTargets(input));
  });
});
