import { describe, expect, it } from 'vitest';
import {
  migratePathGeometry,
  migrateScenePaths,
  pathBBox,
  pathVisualBBox,
  type AnchorPoint,
  type PathElement,
  type Scene,
} from '../src/index.js';

/**
 * B-059/B-062 — the legacy → size==visualBBox migration. The invariant after
 * migration: points' visual bbox at (0,0) with `size` == its extents; rendered
 * geometry (viewBox mapping + transforms + keyframe values) pixel-identical.
 */

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });

const baseTransform = {
  position: { x: 10, y: 20 },
  size: { w: 100, h: 100 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  anchor: { x: 0.5, y: 0.5 },
};

function pathEl(points: AnchorPoint[], closed: boolean, transform = baseTransform): PathElement {
  return {
    id: 'p',
    name: 'Path',
    type: 'path',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform,
    points,
    closed,
  };
}

/** Legacy render mapping: point → scene through viewBox(anchors bbox)→size. */
function legacyRenderPoint(el: PathElement, p: { x: number; y: number }): { x: number; y: number } {
  const a = pathBBox(el.points);
  const fx = el.transform.size.w / Math.max(a.w, 1);
  const fy = el.transform.size.h / Math.max(a.h, 1);
  return {
    x: el.transform.position.x + (p.x - a.x) * fx,
    y: el.transform.position.y + (p.y - a.y) * fy,
  };
}

/** New render mapping: viewBox(visual bbox)→size. */
function newRenderPoint(el: PathElement, p: { x: number; y: number }): { x: number; y: number } {
  const v = pathVisualBBox(el.points, el.closed);
  const fx = el.transform.size.w / Math.max(v.w, 1);
  const fy = el.transform.size.h / Math.max(v.h, 1);
  return {
    x: el.transform.position.x + (p.x - v.x) * fx,
    y: el.transform.position.y + (p.y - v.y) * fy,
  };
}

describe('migratePathGeometry (B-059/B-062)', () => {
  it('a conforming element is identity (same reference)', () => {
    // Straight triangle whose size == bbox — already conforming.
    const el = pathEl([corner('a', 0, 0), corner('b', 100, 0), corner('c', 50, 100)], true);
    expect(migratePathGeometry(el)).toBe(el);
  });

  it('a legacy RESIZED straight path bakes the ratio into the points, pixel-identically', () => {
    // Legacy: bbox 100×100 rendered onto size 200×50 (resized under the old model).
    const el = pathEl([corner('a', 0, 0), corner('b', 100, 0), corner('c', 50, 100)], true, {
      ...baseTransform,
      size: { w: 200, h: 50 },
    });
    const m = migratePathGeometry(el);
    expect(m).not.toBe(el);
    // Invariant: visual bbox at (0,0), size == extents.
    const v = pathVisualBBox(m.points, m.closed);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(0, 9);
    expect(m.transform.size.w).toBeCloseTo(Math.max(v.w, 1), 9);
    expect(m.transform.size.h).toBeCloseTo(Math.max(v.h, 1), 9);
    // Every anchor renders at the SAME scene spot under old-mapping(el) and new-mapping(m).
    el.points.forEach((p, i) => {
      const before = legacyRenderPoint(el, p);
      const mp = m.points[i];
      if (mp === undefined) throw new Error('missing migrated point');
      const after = newRenderPoint(m, mp);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    });
  });

  it('a legacy CURVED arc migrates so size spans the bulge, anchors render in place', () => {
    const a: AnchorPoint = { id: 'a', x: 0, y: 0, smooth: true, out: { x: 0, y: -80 } };
    const b: AnchorPoint = { id: 'b', x: 100, y: 0, smooth: true, in: { x: 0, y: -80 } };
    // Legacy-normalized arc: anchors bbox (0,0,100,0) → size (100, 1).
    const el = pathEl([a, b], false, { ...baseTransform, size: { w: 100, h: 1 } });
    const m = migratePathGeometry(el);
    // The migrated size spans the visual bulge (~60 units above the chord).
    expect(m.transform.size.h).toBeGreaterThan(50);
    // Anchors keep their scene spots.
    el.points.forEach((p, i) => {
      const before = legacyRenderPoint(el, p);
      const mp = m.points[i];
      if (mp === undefined) throw new Error('missing migrated point');
      const after = newRenderPoint(m, mp);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    });
    // Migration is idempotent.
    expect(migratePathGeometry(m)).toBe(m);
  });

  it('a STATIC rotation keeps its pivot-corrected render (the anchor is a box fraction)', () => {
    const a: AnchorPoint = { id: 'a', x: 0, y: 0, smooth: true, out: { x: 0, y: -80 } };
    const b: AnchorPoint = { id: 'b', x: 100, y: 0, smooth: true, in: { x: 0, y: -80 } };
    const el = pathEl([a, b], false, {
      ...baseTransform,
      size: { w: 100, h: 1 },
      rotation: 30,
    });
    const m = migratePathGeometry(el);
    // Compare the FULL rendered scene position of each anchor: unrotated map,
    // then rotate about the respective pivot (anchor fraction of the box).
    const rot = (
      p: { x: number; y: number },
      piv: { x: number; y: number },
    ): { x: number; y: number } => {
      const rad = (30 * Math.PI) / 180;
      const dx = p.x - piv.x;
      const dy = p.y - piv.y;
      return {
        x: piv.x + dx * Math.cos(rad) - dy * Math.sin(rad),
        y: piv.y + dx * Math.sin(rad) + dy * Math.cos(rad),
      };
    };
    const pivBefore = {
      x: el.transform.position.x + 0.5 * el.transform.size.w,
      y: el.transform.position.y + 0.5 * el.transform.size.h,
    };
    const pivAfter = {
      x: m.transform.position.x + 0.5 * m.transform.size.w,
      y: m.transform.position.y + 0.5 * m.transform.size.h,
    };
    el.points.forEach((p, i) => {
      const before = rot(legacyRenderPoint(el, p), pivBefore);
      const mp = m.points[i];
      if (mp === undefined) throw new Error('missing migrated point');
      const after = rot(newRenderPoint(m, mp), pivAfter);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    });
  });

  it('size/position keyframe values are compensated by the constant ratio/shift', () => {
    const a: AnchorPoint = { id: 'a', x: 0, y: 0, smooth: true, out: { x: 0, y: -80 } };
    const b: AnchorPoint = { id: 'b', x: 100, y: 0, smooth: true, in: { x: 0, y: -80 } };
    const el: PathElement = {
      ...pathEl([a, b], false, { ...baseTransform, size: { w: 100, h: 1 } }),
      animation: {
        tracks: {
          'size.h': { keyframes: [{ frame: 0, value: 1, easing: 'linear' }] },
          'position.y': { keyframes: [{ frame: 0, value: 20, easing: 'linear' }] },
        },
      },
    };
    const m = migratePathGeometry(el);
    const ratioH = m.transform.size.h / el.transform.size.h;
    const dY = m.transform.position.y - el.transform.position.y;
    expect(m.animation?.tracks['size.h']?.keyframes[0]?.value).toBeCloseTo(1 * ratioH, 9);
    expect(m.animation?.tracks['position.y']?.keyframes[0]?.value).toBeCloseTo(20 + dY, 9);
  });
});

describe('migrateScenePaths', () => {
  it('is identity for a scene without legacy paths', () => {
    const scene = {
      schemaVersion: 1,
      id: 's',
      name: 's',
      templateType: 'lower-third',
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      frameRange: { in: 0, out: 50 },
      editorBackdrop: 'transparent',
      layers: [
        {
          id: 'L1',
          name: 'm',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [pathEl([corner('a', 0, 0), corner('b', 100, 0), corner('c', 50, 100)], true)],
        },
      ],
      fields: [],
      bindings: [],
      fonts: [],
      metadata: { createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z' },
    } as unknown as Scene;
    expect(migrateScenePaths(scene)).toBe(scene); // identity — clean loads stay clean
  });
});
