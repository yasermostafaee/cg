import { describe, expect, it } from 'vitest';
import type { Element } from '@cg/shared-schema';
import { hitsElement, topmostHit } from '../src/renderer/features/canvas/hit-test.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';

function el(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation = 0,
  anchor?: { x: number; y: number },
): Element {
  const base = defaultText(id, x, y);
  return {
    ...base,
    transform: {
      ...base.transform,
      size: { w, h },
      rotation,
      ...(anchor !== undefined ? { anchor } : {}),
    },
  };
}

describe('hitsElement', () => {
  it('hits a point inside an axis-aligned rect', () => {
    expect(hitsElement(el('a', 0, 0, 100, 100), { x: 50, y: 50 })).toBe(true);
    expect(hitsElement(el('a', 0, 0, 100, 100), { x: 200, y: 50 })).toBe(false);
  });

  it('hits exactly on the boundary', () => {
    expect(hitsElement(el('a', 0, 0, 100, 100), { x: 0, y: 0 })).toBe(true);
    expect(hitsElement(el('a', 0, 0, 100, 100), { x: 100, y: 100 })).toBe(true);
  });

  it('rotates about a centred anchor', () => {
    // 100×40 rect at origin rotated 90° about its centre {0.5,0.5} (pivot 50,20).
    const rotated = el('a', 0, 0, 100, 40, 90, { x: 0.5, y: 0.5 });
    // The pivot/centre is always inside.
    expect(hitsElement(rotated, { x: 50, y: 20 })).toBe(true);
    // Inside the unrotated bbox but outside the rotated one.
    expect(hitsElement(rotated, { x: 5, y: 5 })).toBe(false);
  });

  it('rotates about the default top-left anchor, matching the renderer', () => {
    // 100×40 rect at origin rotated 90° about {0,0} swings to x∈[-40,0], y∈[0,100].
    const rotated = el('a', 0, 0, 100, 40, 90, { x: 0, y: 0 });
    // The shape's NEW location is hit…
    expect(hitsElement(rotated, { x: -20, y: 50 })).toBe(true);
    // …while the pre-rotation centre is no longer under the shape.
    expect(hitsElement(rotated, { x: 50, y: 20 })).toBe(false);
  });

  it('never hits a degenerate (zero-scale) element', () => {
    const base = el('a', 0, 0, 100, 100);
    const zero: Element = { ...base, transform: { ...base.transform, scale: { x: 0, y: 1 } } };
    expect(hitsElement(zero, { x: 50, y: 50 })).toBe(false);
  });

  it('honours a scaled element about its anchor', () => {
    // 100×100 rect scaled 2× about top-left {0,0} covers [0,200]×[0,200].
    const base = el('a', 0, 0, 100, 100, 0, { x: 0, y: 0 });
    const scaled: Element = {
      ...base,
      transform: { ...base.transform, scale: { x: 2, y: 2 } },
    };
    expect(hitsElement(scaled, { x: 180, y: 180 })).toBe(true);
    expect(hitsElement(scaled, { x: 220, y: 180 })).toBe(false);
  });
});

describe('topmostHit', () => {
  it('returns the last element in iteration order under the point', () => {
    const a = el('a', 0, 0, 100, 100);
    const b = el('b', 50, 50, 100, 100);
    const c = el('c', 75, 75, 100, 100);
    expect(topmostHit([a, b, c], { x: 90, y: 90 })?.id).toBe('c');
    expect(topmostHit([a, b, c], { x: 25, y: 25 })?.id).toBe('a');
  });

  it('returns null when no element is hit', () => {
    const a = el('a', 0, 0, 100, 100);
    expect(topmostHit([a], { x: 200, y: 200 })).toBeNull();
  });

  it('skips invisible + locked elements', () => {
    const a = { ...el('a', 0, 0, 100, 100), visible: false };
    const b = { ...el('b', 0, 0, 100, 100), locked: true };
    expect(topmostHit([a, b], { x: 50, y: 50 })).toBeNull();
  });
});
