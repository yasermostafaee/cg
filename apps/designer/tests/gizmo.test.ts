import { describe, expect, it } from 'vitest';
import { pivotClientFromGrab } from '../src/renderer/features/canvas/geometry.js';

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

  // B-022 — the corner offset is scaled by the element's scaleX/scaleY (the renderer's
  // Scale·Rotate) before the zoom, so the pivot lands on the anchor under a prior scale.
  it('applies the element scale to the offset (non-uniform)', () => {
    // offset (40,30) at rotation 0, zoom 1, element scale (2, 1) → screen offset (80, 30).
    const p = pivotClientFromGrab(150, 120, 40, 30, 0, 1, 2, 1);
    expect(p.x).toBeCloseTo(150 - 80);
    expect(p.y).toBeCloseTo(120 - 30);
  });

  it('composes element scale with rotation and zoom', () => {
    // offset (10,0) rotated 90° → (0,10); ×scale(2,3) → (0,30); ×zoom 0.5 → (0,15).
    const p = pivotClientFromGrab(100, 100, 10, 0, 90, 0.5, 2, 3);
    expect(p.x).toBeCloseTo(100 - 0);
    expect(p.y).toBeCloseTo(100 - 15);
  });

  it('defaults element scale to 1 (back-compatible 6-arg call)', () => {
    const p = pivotClientFromGrab(150, 120, 40, 30, 0, 1);
    expect(p.x).toBeCloseTo(110);
    expect(p.y).toBeCloseTo(90);
  });
});
