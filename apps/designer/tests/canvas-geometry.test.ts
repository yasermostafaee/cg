import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  computeResize,
  computeRotationAngle,
  cornerLocal,
  fitZoom,
  handleLocal,
  localToScene,
  rot,
  screenToScene,
  snapAxis,
  snapValue,
  type BoxTransform,
} from '../src/renderer/features/canvas/geometry.js';

/**
 * Pure canvas-editor geometry: the gizmo resize/rotate math, snapping, and the
 * screen↔scene coordinate conversions extracted from the React components.
 * (`pivotClientFromGrab` is exercised by gizmo.test.ts.)
 */

const box = (over: Partial<BoxTransform> = {}): BoxTransform => ({
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
  ...over,
});

describe('rot', () => {
  it('rotates a unit vector by 90° and 180°', () => {
    const a = rot(1, 0, Math.cos(Math.PI / 2), Math.sin(Math.PI / 2));
    expect(a.x).toBeCloseTo(0);
    expect(a.y).toBeCloseTo(1);
    const b = rot(1, 0, Math.cos(Math.PI), Math.sin(Math.PI));
    expect(b.x).toBeCloseTo(-1);
    expect(b.y).toBeCloseTo(0);
  });
});

describe('cornerLocal / handleLocal', () => {
  it('returns the four corners', () => {
    expect(cornerLocal('tl', 100, 40)).toEqual({ x: 0, y: 0 });
    expect(cornerLocal('tr', 100, 40)).toEqual({ x: 100, y: 0 });
    expect(cornerLocal('bl', 100, 40)).toEqual({ x: 0, y: 40 });
    expect(cornerLocal('br', 100, 40)).toEqual({ x: 100, y: 40 });
  });

  it('returns edge midpoints for edge handles, corners for corner handles', () => {
    expect(handleLocal('r', 100, 40)).toEqual({ x: 100, y: 20 });
    expect(handleLocal('l', 100, 40)).toEqual({ x: 0, y: 20 });
    expect(handleLocal('t', 100, 40)).toEqual({ x: 50, y: 0 });
    expect(handleLocal('b', 100, 40)).toEqual({ x: 50, y: 40 });
    expect(handleLocal('br', 100, 40)).toEqual({ x: 100, y: 40 });
  });
});

describe('localToScene', () => {
  it('is a translation by position at rotation 0 / top-left anchor', () => {
    expect(localToScene(box({ position: { x: 10, y: 20 } }), 5, 5)).toEqual({ x: 15, y: 25 });
  });

  it('rotates a local point about a top-left anchor (90°)', () => {
    // local (10,0) under a 90° rotation about (0,0) → (0,10) in scene.
    const p = localToScene(box({ rotation: 90 }), 10, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
  });
});

describe('computeResize', () => {
  it('br handle resizes both axes from a fixed top-left', () => {
    const r = computeResize(box(), 'br', { x: 150, y: 120 });
    expect(r.position).toEqual({ x: 0, y: 0 });
    expect(r.size).toEqual({ w: 150, h: 120 });
  });

  it('edge handle frees only one axis', () => {
    const r = computeResize(box(), 'r', { x: 150, y: 9999 });
    expect(r.size).toEqual({ w: 150, h: 100 }); // height unchanged
  });

  it('clamps to the minimum size', () => {
    const r = computeResize(box(), 'br', { x: 2, y: 2 });
    expect(r.size).toEqual({ w: 4, h: 4 });
  });

  it('keeps the fixed (opposite) corner put with a centred anchor', () => {
    const r = computeResize(box({ anchor: { x: 0.5, y: 0.5 } }), 'br', { x: 200, y: 200 });
    // tl corner (the fixed one) stays at scene (0,0).
    expect(r.position.x).toBeCloseTo(0);
    expect(r.position.y).toBeCloseTo(0);
    expect(r.size).toEqual({ w: 200, h: 200 });
  });

  it('resizes in the element’s rotated frame (90°)', () => {
    // Under 90° about (0,0), local br (200,150) maps to scene (-150,200).
    const r = computeResize(box({ rotation: 90 }), 'br', { x: -150, y: 200 });
    expect(r.size.w).toBeCloseTo(200);
    expect(r.size.h).toBeCloseTo(150);
    expect(r.position.x).toBeCloseTo(0);
    expect(r.position.y).toBeCloseTo(0);
  });
});

describe('computeRotationAngle', () => {
  it('adds the cursor delta to the start angle (no snap)', () => {
    expect(computeRotationAngle(45, 10, 40, false)).toBe(75);
  });

  it('snaps to the nearest 15° within 6°', () => {
    expect(computeRotationAngle(0, 0, 13, true)).toBe(15);
    expect(computeRotationAngle(0, 0, 24, true)).toBe(30);
  });

  it('does not snap beyond the 6° threshold', () => {
    expect(computeRotationAngle(0, 0, 22, true)).toBe(22);
  });

  it('snap disabled (e.g. Shift held) rotates freely', () => {
    expect(computeRotationAngle(0, 0, 13, false)).toBe(13);
  });
});

describe('snapValue', () => {
  it('returns the nearest target within the threshold', () => {
    expect(snapValue(102, [0, 100, 200], 5)).toBe(100);
    expect(snapValue(103, [100, 105], 5)).toBe(105); // closest wins
  });
  it('returns null when nothing is in range', () => {
    expect(snapValue(150, [0, 100, 200], 5)).toBeNull();
  });
});

describe('snapAxis', () => {
  it('snaps the near edge and reports the guide', () => {
    expect(snapAxis(98, 100, [100], 5)).toEqual({ value: 100, guide: 100 });
  });
  it('snaps via the centre anchor, leaving the origin offset', () => {
    expect(snapAxis(50, 100, [100], 5)).toEqual({ value: 50, guide: 100 });
  });
  it('returns null when no anchor is within the threshold', () => {
    expect(snapAxis(0, 10, [100], 5)).toBeNull();
  });
});

describe('screenToScene', () => {
  it('subtracts the stage origin and divides by zoom', () => {
    expect(screenToScene(120, 70, { left: 20, top: 10 }, 2)).toEqual({ x: 50, y: 30 });
  });
});

describe('clampZoom', () => {
  it('clamps to the bounds and falls back on non-finite input', () => {
    expect(clampZoom(5, 0.1, 4, 0.5)).toBe(4);
    expect(clampZoom(0.05, 0.1, 4, 0.5)).toBe(0.1);
    expect(clampZoom(Number.NaN, 0.1, 4, 0.5)).toBe(0.5);
  });
});

describe('fitZoom', () => {
  it('returns the limiting (smaller) ratio', () => {
    expect(fitZoom(820, 470, 1920, 1080, 16)).toBeCloseTo((470 - 16) / 1080);
  });
  it('returns null when the viewport is too small to fit anything', () => {
    expect(fitZoom(10, 10, 1920, 1080, 16)).toBeNull();
  });
});
