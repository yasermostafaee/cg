import { describe, expect, it } from 'vitest';
import { pivotClientFromGrab } from '../src/renderer/features/canvas/Gizmo.js';

/**
 * Corner rotation recovers the pivot's client position from the grabbed
 * corner's client position and that corner's local offset from the pivot
 * (rotated by the element's angle and scaled by the zoom). For a centre
 * anchor the bottom-right corner sits at local offset (w/2, h/2) from the
 * pivot; the pivot is therefore that offset (rotated/scaled) back from the
 * grab point.
 */
describe('pivotClientFromGrab', () => {
  it('subtracts the (scaled) offset at rotation 0', () => {
    // grab at (150, 120), corner is +40,+30 from the pivot, zoom 1.
    const p = pivotClientFromGrab(150, 120, 40, 30, 0, 1);
    expect(p.x).toBeCloseTo(110);
    expect(p.y).toBeCloseTo(90);
  });

  it('applies the zoom factor to the offset', () => {
    const p = pivotClientFromGrab(150, 120, 40, 30, 0, 0.5);
    expect(p.x).toBeCloseTo(150 - 20);
    expect(p.y).toBeCloseTo(120 - 15);
  });

  it('rotates the offset by the element angle (90°)', () => {
    // At 90° clockwise, local (dx,dy) maps to world (-dy, dx).
    const p = pivotClientFromGrab(100, 100, 10, 0, 90, 1);
    expect(p.x).toBeCloseTo(100 - 0);
    expect(p.y).toBeCloseTo(100 - 10);
  });

  it('rotates the offset by the element angle (180°)', () => {
    const p = pivotClientFromGrab(100, 100, 10, 6, 180, 1);
    expect(p.x).toBeCloseTo(100 + 10);
    expect(p.y).toBeCloseTo(100 + 6);
  });
});
