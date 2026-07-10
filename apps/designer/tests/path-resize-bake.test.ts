import { afterEach, describe, expect, it } from 'vitest';
import type { AnchorPoint, PathElement } from '@cg/shared-schema';
import { pathVisualBBox } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import {
  normalizePathPoints,
  pathFromScenePoints,
} from '../src/renderer/state/element-defaults.js';

/**
 * B-062 — a STATIC path resize bakes into the point coordinates (owner model:
 * size == visualBBox), so a later anchor-drag normalize never snaps the shape
 * back to its pre-resize size.
 */

afterEach(() => {
  designerStore._reset();
});

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });

function seedPath(): PathElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
  designerStore.addElement(
    pathFromScenePoints('p1', [corner('a', 0, 0), corner('b', 100, 0), corner('c', 50, 100)], true),
  );
  return livePath();
}

function livePath(): PathElement {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId);
  for (const layer of doc?.layers ?? []) {
    for (const el of layer.children) if (el.type === 'path') return el;
  }
  throw new Error('no path');
}

describe('static path resize bakes points (B-062)', () => {
  it('commitAnimatable size.w scales anchor x-coordinates and keeps the invariant', () => {
    seedPath();
    designerStore.commitAnimatable('p1', 'size.w', 200);
    const el = livePath();
    expect(el.transform.size.w).toBe(200);
    expect(el.points.map((p) => p.x)).toEqual([0, 200, 100]); // baked ×2
    const v = pathVisualBBox(el.points, el.closed);
    expect(el.transform.size.w).toBeCloseTo(Math.max(v.w, 1), 9); // size==visualBBox
  });

  it('handles scale with the axis too', () => {
    seedPath();
    const smooth: AnchorPoint = { id: 's', x: 50, y: 50, smooth: true, out: { x: 10, y: 4 } };
    designerStore.updateElement('p1', {
      points: [...livePath().points, smooth],
    } as Partial<PathElement> as never);
    designerStore.commitAnimatable('p1', 'size.w', 200);
    const el = livePath();
    const s = el.points.find((p) => p.id === 's');
    expect(s?.out?.x).toBeCloseTo(20, 9); // x-component ×2
    expect(s?.out?.y).toBeCloseTo(4, 9); // y untouched
  });

  it('an anchor drag AFTER a resize does not snap the size back (the B-062 symptom)', () => {
    seedPath();
    designerStore.commitAnimatable('p1', 'size.h', 300); // bake ×3 on y
    const before = livePath();
    expect(before.transform.size.h).toBe(300);
    // Simulate the anchor-drag commit path: move one anchor, run the normalize.
    const moved = before.points.map((p) => (p.id === 'a' ? { ...p, x: p.x - 10 } : p));
    const n = normalizePathPoints({ ...before, points: moved });
    designerStore.updateElement('p1', {
      points: n.points,
      transform: n.transform,
    } as Partial<PathElement> as never);
    const after = livePath();
    // The pre-resize height was 100; the old model snapped back to it here.
    expect(after.transform.size.h).toBeCloseTo(300, 6);
  });
});
