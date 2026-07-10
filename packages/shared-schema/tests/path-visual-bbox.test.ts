import { describe, expect, it } from 'vitest';
import { pathBBox, pathVisualBBox, type AnchorPoint } from '../src/index.js';

/**
 * B-059 — `pathVisualBBox` unions each cubic segment's EXACT bézier extents
 * (derivative-root extrema) with the anchors, using the runtime's control-point
 * convention (`c1 = a + a.out`, `c2 = b + b.in`; straight only when both absent;
 * closed paths include the closing segment).
 */

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });

describe('pathVisualBBox (B-059)', () => {
  it('a straight-edged path degrades to exactly pathBBox', () => {
    const pts = [corner('a', 0, 0), corner('b', 100, 0), corner('c', 50, 100)];
    expect(pathVisualBBox(pts, true)).toEqual(pathBBox(pts));
    expect(pathVisualBBox(pts, false)).toEqual(pathBBox(pts));
  });

  it('encloses a symmetric bulge exactly (apex = ¾ of the mirrored handle offset)', () => {
    // Segment (0,0)→(100,0) with c1=(0,-80), c2=(100,-80): y(t) = 3t(1−t)(−80),
    // extremum at t=.5 → y = −60. Exact, not a flattening approximation.
    const a: AnchorPoint = { id: 'a', x: 0, y: 0, smooth: true, out: { x: 0, y: -80 } };
    const b: AnchorPoint = { id: 'b', x: 100, y: 0, smooth: true, in: { x: 0, y: -80 } };
    const box = pathVisualBBox([a, b], false);
    expect(box.y).toBeCloseTo(-60, 10);
    expect(box.h).toBeCloseTo(60, 10);
    expect(box.x).toBe(0);
    expect(box.w).toBe(100);
    // The anchors-only box is the degenerate 100×0 band this bug was about.
    expect(pathBBox([a, b])).toEqual({ x: 0, y: 0, w: 100, h: 0 });
  });

  it('a one-sided handle (linear-derivative fallback axis) is enclosed', () => {
    // Only a.out set: c1=(0,90), c2=b → x-derivative degenerates to the linear case.
    const a: AnchorPoint = { id: 'a', x: 0, y: 0, smooth: true, out: { x: 0, y: 90 } };
    const b = corner('b', 100, 0);
    const box = pathVisualBBox([a, b], false);
    expect(box.y).toBe(0);
    // y(t) = 3(1−t)²t·90 — max at t=1/3 → 90·4/9 = 40/… compute: 3·(2/3)²·(1/3)·90 = 40.
    expect(box.h).toBeCloseTo(40, 10);
  });

  it('a CLOSED path includes the closing segment’s bulge', () => {
    // Closing segment c→a with c1 = (350, 100): x(t) peaks ≈171.5 at t = 0.3 —
    // well past the anchors box (a 100-wide handle would top out INSIDE it; the
    // extremum, not the control point, is what counts).
    const aPt = corner('a', 0, 0);
    const bPt = corner('b', 100, 0);
    const cPt: AnchorPoint = { id: 'c', x: 50, y: 100, smooth: true, out: { x: 300, y: 0 } };
    const open = pathVisualBBox([aPt, bPt, cPt], false);
    const closed = pathVisualBBox([aPt, bPt, cPt], true);
    expect(open.w).toBe(100); // open: no closing segment, no bulge
    expect(closed.x + closed.w).toBeCloseTo(171.5, 1); // closed: the c→a curve extends right
  });

  it('an inward dip does NOT extend the box (extrema inside the anchors box)', () => {
    const a: AnchorPoint = { id: 'a', x: 0, y: 0, smooth: true, out: { x: 0, y: 60 } };
    const b: AnchorPoint = { id: 'b', x: 100, y: 0, smooth: true, in: { x: 0, y: 60 } };
    const box = pathVisualBBox([a, b, corner('c', 50, 100)], true);
    expect(box).toEqual({ x: 0, y: 0, w: 100, h: 100 }); // dip at y=+45 stays inside
  });

  it('empty and single-point inputs are safe', () => {
    expect(pathVisualBBox([], false)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(pathVisualBBox([corner('a', 5, 7)], false)).toEqual({ x: 5, y: 7, w: 0, h: 0 });
  });
});
