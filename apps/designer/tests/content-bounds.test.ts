import { describe, expect, it } from 'vitest';
import type { Element, Layer } from '@cg/shared-schema';
import { contentBounds } from '../src/renderer/features/canvas/content-bounds.js';

/**
 * D-071 — `contentBounds` is the scene-coord AABB of all top-level elements on the active
 * composition (at the current frame, via `effectiveTransformAt`), folding each element's
 * 4 corners through `Scale·Rotate-about-anchor`. It feeds `pasteboardLayout` so the
 * pasteboard grows to contain off-frame content. A nested composition INSTANCE contributes
 * only its OWN box (no recursion, Q3); empty → null (no growth).
 */

function box(x: number, y: number, w: number, h: number, rotation = 0): Element {
  return {
    id: `el-${String(x)}-${String(y)}`,
    name: 'box',
    type: 'shape',
    shape: 'rect',
    transform: {
      position: { x, y },
      size: { w, h },
      scale: { x: 1, y: 1 },
      rotation,
      anchor: { x: 0, y: 0 },
    },
    fill: { kind: 'solid', color: '#fff' },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  } as unknown as Element;
}

function layers(...els: Element[]): Layer[] {
  return [{ id: 'L', name: 'layer', children: els } as unknown as Layer];
}

describe('contentBounds', () => {
  it('empty / no layers → null (so the pasteboard does not grow)', () => {
    expect(contentBounds([], 0)).toBeNull();
    expect(contentBounds(layers(), 0)).toBeNull();
  });

  it('axis-aligned box → its scene AABB (corner fold, no rotation)', () => {
    expect(contentBounds(layers(box(100, 200, 320, 120)), 0)).toEqual({
      minX: 100,
      minY: 200,
      maxX: 420,
      maxY: 320,
    });
  });

  it('unions multiple elements, including off-frame negative coords', () => {
    const b = contentBounds(layers(box(100, 100, 200, 200), box(-1500, -300, 100, 100)), 0)!;
    expect(b.minX).toBe(-1500);
    expect(b.minY).toBe(-300);
    expect(b.maxX).toBe(300); // 100 + 200
    expect(b.maxY).toBe(300);
  });

  it('folds the 4 corners through rotation (Scale·Rotate-about-anchor)', () => {
    // 100×100 at origin, anchor (0,0), rotated 45° → a diamond spanning ±70.71 in x, 0..141.42 y.
    const b = contentBounds(layers(box(0, 0, 100, 100, 45)), 0)!;
    const d = 100 / Math.SQRT2; // ≈70.71
    expect(b.minX).toBeCloseTo(-d, 4);
    expect(b.maxX).toBeCloseTo(d, 4);
    expect(b.minY).toBeCloseTo(0, 4);
    expect(b.maxY).toBeCloseTo(2 * d, 4); // 141.42
  });

  it('a nested composition INSTANCE contributes only its OWN box (no recursion, Q3)', () => {
    // A composition instance at (500,50) size 200×100 — with off-frame children that MUST
    // be ignored (contentBounds never recurses into an element's subtree).
    const instance = {
      id: 'inst',
      name: 'inst',
      type: 'composition',
      compositionId: 'c1',
      transform: {
        position: { x: 500, y: 50 },
        size: { w: 200, h: 100 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      children: [box(-99999, -99999, 100, 100)], // off-frame child — must NOT count
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
    } as unknown as Element;
    expect(contentBounds(layers(instance), 0)).toEqual({
      minX: 500,
      minY: 50,
      maxX: 700,
      maxY: 150,
    });
  });
});
