import { describe, expect, it } from 'vitest';
import type { Element } from '@cg/shared-schema';
import { hitsElement, topmostHit } from '../src/renderer/features/canvas/hit-test.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';

function el(id: string, x: number, y: number, w: number, h: number, rotation = 0): Element {
  const base = defaultText(id, x, y);
  return {
    ...base,
    transform: {
      ...base.transform,
      size: { w, h },
      rotation,
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

  it('honors rotation when checking the bounds', () => {
    // 100×40 rect at origin rotated 90° — its bbox becomes 40×100 around center.
    const rotated = el('a', 0, 0, 100, 40, 90);
    // Point (50, 20) is the center, which is always inside.
    expect(hitsElement(rotated, { x: 50, y: 20 })).toBe(true);
    // Point (5, 5) is inside the unrotated bbox but outside the rotated one.
    expect(hitsElement(rotated, { x: 5, y: 5 })).toBe(false);
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
