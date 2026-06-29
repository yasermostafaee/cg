import { describe, expect, it } from 'vitest';
import { SceneSchema } from '@cg/shared-schema';
import type { AnchorPoint } from '@cg/shared-schema';
import { hitsElement } from '../src/renderer/features/canvas/hit-test.js';
import {
  normalizePathPoints,
  pathFromScenePoints,
} from '../src/renderer/state/element-defaults.js';

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });

// A closed triangle in scene coords: base (0,0)-(100,0), apex (50,100).
const triangle: AnchorPoint[] = [corner('a', 0, 0), corner('b', 100, 0), corner('c', 50, 100)];

describe('pathFromScenePoints (D-109 factory)', () => {
  it('normalizes: position = bbox top-left, points in a 0-origin frame, size = bbox', () => {
    const el = pathFromScenePoints(
      'p',
      [corner('a', 40, 30), corner('b', 140, 30), corner('c', 90, 130)],
      true,
    );
    expect(el.type).toBe('path');
    expect(el.transform.position).toEqual({ x: 40, y: 30 });
    expect(el.transform.size).toEqual({ w: 100, h: 100 });
    expect(el.points.map((p) => ({ x: p.x, y: p.y }))).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ]);
    expect(el.closed).toBe(true);
  });

  it('an open path defaults stroke + carries no fill requirement; round-trips through the schema', () => {
    const el = pathFromScenePoints('p', triangle, false);
    expect(el.closed).toBe(false);
    expect(el.stroke?.width).toBeGreaterThan(0);
    expect(() => SceneSchema.parse(scene(el))).not.toThrow();
  });

  it('preserves stable anchor ids', () => {
    const el = pathFromScenePoints('p', triangle, true);
    expect(el.points.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('normalizePathPoints (D-109)', () => {
  it('re-anchors a point dragged past the origin without moving the others on screen', () => {
    const el = pathFromScenePoints('p', triangle, true); // position (0,0)
    // Drag anchor 'a' to local (-20, -10) → bbox shifts; normalize must keep every
    // point's SCENE position (position += shift, points -= shift).
    const moved = {
      ...el,
      points: el.points.map((p) => (p.id === 'a' ? { ...p, x: -20, y: -10 } : p)),
    };
    const n = normalizePathPoints(moved);
    expect(n.transform.position).toEqual({ x: -20, y: -10 });
    expect(n.points.find((p) => p.id === 'a')).toMatchObject({ x: 0, y: 0 });
    // 'b' was at local (100,0); after the shift it's (120,10) but its scene spot
    // (position + local) is unchanged: (-20+120, -10+10) = (100, 0).
    const b = n.points.find((p) => p.id === 'b');
    expect(n.transform.position.x + (b?.x ?? 0)).toBe(100);
    expect(n.transform.position.y + (b?.y ?? 0)).toBe(0);
  });
});

describe('hitsElement — path (D-109)', () => {
  const closed = pathFromScenePoints('p', triangle, true);
  const open = pathFromScenePoints('o', [corner('a', 0, 0), corner('b', 100, 0)], false);

  it('a closed path hits its filled interior', () => {
    expect(hitsElement(closed, { x: 50, y: 50 })).toBe(true);
  });

  it('a click inside the bbox but OUTSIDE the actual shape does not select', () => {
    // (5, 90): inside the 100×100 bbox, far outside the triangle and its edges.
    expect(hitsElement(closed, { x: 5, y: 90 })).toBe(false);
  });

  it('an open path hits within a grab margin of its stroke, misses far away', () => {
    expect(hitsElement(open, { x: 50, y: 2 })).toBe(true); // ~2px from the segment
    expect(hitsElement(open, { x: 50, y: 60 })).toBe(false); // far from the stroke; open ⇒ no fill
  });
});

function scene(el: ReturnType<typeof pathFromScenePoints>) {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'lower-third' as const,
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      { id: 'L1', name: 'm', visible: true, locked: false, blendMode: 'normal', children: [el] },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-06-29T00:00:00.000Z', updatedAt: '2026-06-29T00:00:00.000Z' },
  };
}
