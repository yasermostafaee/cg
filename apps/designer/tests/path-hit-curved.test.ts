import { describe, expect, it } from 'vitest';
import type { AnchorPoint } from '@cg/shared-schema';
import { hitsElement } from '../src/renderer/features/canvas/hit-test.js';
import { pathFromScenePoints } from '../src/renderer/state/element-defaults.js';

/**
 * B-055 — path hit-testing follows the ACTUAL curved outline, not the anchor
 * polygon. The runtime renders each segment as a cubic with c1 = a + a.out and
 * c2 = b + b.in (straight only when BOTH are absent); the hit-test flattens the
 * same cubics before the ray-cast / grab-margin tests, so bézier bulges outside
 * the anchor polygon HIT and concavities inside it MISS.
 */

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });

/** The triangle (0,0)-(100,0)-(50,100) whose TOP edge carries the given handles. */
function triangleWithTopEdge(outY: number, inY: number, closed = true) {
  const a: AnchorPoint = { id: 'a', x: 0, y: 0, smooth: true, out: { x: 0, y: outY } };
  const b: AnchorPoint = { id: 'b', x: 100, y: 0, smooth: true, in: { x: 0, y: inY } };
  return pathFromScenePoints('p', [a, b, corner('c', 50, 100)], closed);
}

describe('hitsElement — curved path outline (B-055)', () => {
  it('a click under an outward bulge (outside the anchor polygon) HITS', () => {
    const el = triangleWithTopEdge(-80, -80); // top edge bulges up to y ≈ −60
    expect(hitsElement(el, { x: 50, y: -40 })).toBe(true);
  });

  it('a click in a concavity (inside the anchor polygon, outside the shape) MISSES', () => {
    const el = triangleWithTopEdge(60, 60); // top edge dips down to y ≈ +45
    expect(hitsElement(el, { x: 50, y: 20 })).toBe(false);
  });

  it('the interior still hits in both variants', () => {
    expect(hitsElement(triangleWithTopEdge(-80, -80), { x: 50, y: 60 })).toBe(true);
    expect(hitsElement(triangleWithTopEdge(60, 60), { x: 50, y: 60 })).toBe(true);
  });

  it('an OPEN curved path hits near its actual curve, not the straight chord', () => {
    const a: AnchorPoint = { id: 'a', x: 0, y: 0, smooth: true, out: { x: 0, y: -80 } };
    const b: AnchorPoint = { id: 'b', x: 100, y: 0, smooth: true, in: { x: 0, y: -80 } };
    const el = pathFromScenePoints('o', [a, b], false); // curve apex ≈ (50, −60)
    expect(hitsElement(el, { x: 50, y: -58 })).toBe(true); // near the real stroke
    expect(hitsElement(el, { x: 50, y: 60 })).toBe(false); // far from everything
  });

  it('straight-edged paths behave as before (regression guard)', () => {
    const el = pathFromScenePoints(
      's',
      [corner('a', 0, 0), corner('b', 100, 0), corner('c', 50, 100)],
      true,
    );
    expect(hitsElement(el, { x: 50, y: 50 })).toBe(true);
    expect(hitsElement(el, { x: 5, y: 90 })).toBe(false);
  });
});
