import { liveCropWindow, MAX_LIVE_CROP_ZOOM } from '@cg/shared-schema';
import { describe, expect, it } from 'vitest';
import { PAN_CORNERS, resizePanCrop } from '../src/renderer/features/monitors/previewPanCrop.js';

const WIDE = 16 / 9;
const SCREEN = { width: 160, height: 90 };
const CENTER = { x: 0.5, y: 0.5 };

describe('D-178 — resize the preview crop', () => {
  it.each(PAN_CORNERS)('keeps the opposite corner fixed from $name', (corner) => {
    const focus = resizePanCrop(
      CENTER,
      WIDE,
      WIDE,
      corner,
      SCREEN,
      (corner.x === 0 ? 1 : -1) * 40,
      (corner.y === 0 ? 1 : -1) * 22.5,
    );
    const window = liveCropWindow(WIDE, WIDE, focus);
    expect(window.width).toBeCloseTo(0.75);
    expect(window.height).toBeCloseTo(0.75);
    expect(window.x + window.width * (1 - corner.x)).toBeCloseTo(1 - corner.x);
    expect(window.y + window.height * (1 - corner.y)).toBeCloseTo(1 - corner.y);
  });

  it('clamps the smallest and largest windows, including at a source edge', () => {
    const corner = PAN_CORNERS[3];
    const small = resizePanCrop(CENTER, 4 / 3, WIDE, corner, SCREEN, -1000, -1000);
    expect(small.zoom).toBe(MAX_LIVE_CROP_ZOOM);
    const large = resizePanCrop({ ...small, x: 1, y: 1 }, 4 / 3, WIDE, corner, SCREEN, 1000, 1000);
    expect(large.zoom).toBe(1);
    const window = liveCropWindow(4 / 3, WIDE, large);
    expect(window.x + window.width).toBeCloseTo(1);
    expect(window.y + window.height).toBeCloseTo(1);
    expect(window.x).toBeGreaterThanOrEqual(0);
    expect(window.y).toBeGreaterThanOrEqual(0);
  });
});
