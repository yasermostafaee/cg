import { afterEach, describe, expect, it } from 'vitest';
import type { AnchorPoint, PathElement } from '@cg/shared-schema';
import { pathVisualBBox } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import {
  normalizePathPoints,
  pathFromScenePoints,
} from '../src/renderer/state/element-defaults.js';
import { localToScene } from '../src/renderer/features/canvas/geometry.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * B-061 (owner re-verify round) — editing a path must be STABLE under rotation
 * and scale. Every point edit re-normalizes (size must track the visual bbox or
 * the runtime's viewBox stretch distorts the shape mid-drag), and the
 * re-normalize moves the rotation pivot (`anchor⊙size`); the position
 * compensation must therefore be render-neutral under the FULL transform —
 * `position' = position + (I − M)(A − A') + M·vmin` — or dragging ONE anchor of
 * a rotated path re-projects every OTHER anchor (probe: 2.07 scene px drift per
 * tick at 30°). These tests drive the exact PathEditor.applyPoints route.
 */

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });

afterEach(() => {
  designerStore._reset();
});

function seedTriangle(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('rot-edit', 'lower-third');
  designerStore.setScene(scene, null);
  designerStore.addElement(
    pathFromScenePoints(
      'p1',
      [corner('a', 200, 100), corner('b', 340, 100), corner('c', 270, 210)],
      true,
    ),
  );
}

function livePath(): PathElement {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId);
  for (const layer of doc?.layers ?? []) {
    for (const el of layer.children) if (el.type === 'path') return el;
  }
  throw new Error('no path');
}

/** Rendered SCENE position of a point-space coordinate (PathEditor.screen at zoom 1). */
function rendered(el: PathElement, p: { x: number; y: number }): { x: number; y: number } {
  const vb = pathVisualBBox(el.points, el.closed);
  const fx = el.transform.size.w / Math.max(vb.w, 1);
  const fy = el.transform.size.h / Math.max(vb.h, 1);
  return localToScene(el.transform, (p.x - vb.x) * fx, (p.y - vb.y) * fy);
}

/** One PathEditor.applyPoints tick: normalize the edited points, commit both fields. */
function applyPoints(el: PathElement, next: readonly AnchorPoint[]): void {
  const normalized = normalizePathPoints({ ...el, points: [...next] });
  designerStore.updateElement(el.id, {
    points: normalized.points,
    transform: normalized.transform,
  } as Partial<PathElement>);
}

/** Drag anchor `id` by (dx,dy) in point space and return {before, after} elements. */
function dragTick(id: string, dx: number, dy: number): { before: PathElement; after: PathElement } {
  const before = livePath();
  applyPoints(
    before,
    before.points.map((p) => (p.id === id ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
  );
  return { before, after: livePath() };
}

function expectOthersStable(
  before: PathElement,
  after: PathElement,
  draggedId: string,
  digits = 9,
): void {
  for (const p of before.points) {
    if (p.id === draggedId) continue;
    const b = rendered(before, p);
    const pAfter = after.points.find((q) => q.id === p.id);
    expect(pAfter).toBeDefined();
    if (pAfter === undefined) continue;
    const a = rendered(after, pAfter);
    expect(a.x).toBeCloseTo(b.x, digits);
    expect(a.y).toBeCloseTo(b.y, digits);
  }
}

describe('rotated path editing is render-stable (B-061 drift fix)', () => {
  it('30° rotation: dragging one anchor leaves every OTHER anchor rendered in place, and the dragged one lands exactly delta away in local space', () => {
    seedTriangle();
    designerStore.updateTransform('p1', { rotation: 30 });
    const { before, after } = dragTick('c', 10, 8);
    expectOthersStable(before, after, 'c');

    // The dragged anchor: exactly (base + delta) mapped through the ORIGINAL frame
    // (the unchanged-point map is preserved, so the same forward map applies).
    const baseC = before.points.find((p) => p.id === 'c');
    const afterC = after.points.find((p) => p.id === 'c');
    expect(baseC).toBeDefined();
    expect(afterC).toBeDefined();
    if (baseC === undefined || afterC === undefined) return;
    const want = rendered(before, { x: baseC.x + 10, y: baseC.y + 8 });
    const got = rendered(after, afterC);
    expect(got.x).toBeCloseTo(want.x, 9);
    expect(got.y).toBeCloseTo(want.y, 9);
  });

  it('90° rotation + non-uniform scale (2, 0.5): other anchors stay put across multiple ticks', () => {
    seedTriangle();
    designerStore.updateTransform('p1', { rotation: 90, scale: { x: 2, y: 0.5 } });
    // Three consecutive move ticks (a real drag), each growing/shrinking the bbox.
    let r1 = dragTick('a', -6, -4);
    expectOthersStable(r1.before, r1.after, 'a');
    r1 = dragTick('a', -6, 10);
    expectOthersStable(r1.before, r1.after, 'a');
    r1 = dragTick('a', 15, -2);
    expectOthersStable(r1.before, r1.after, 'a');
  });

  it('rotated handle drag (bbox growth via a curve bulge) keeps the anchors rendered in place', () => {
    seedTriangle();
    designerStore.updateTransform('p1', { rotation: 45 });
    const before = livePath();
    // Pull a mirrored smooth handle out of anchor 'b' — the bulge outgrows the
    // old bbox, forcing a size + pivot change (the dragHandle route).
    applyPoints(
      before,
      before.points.map((p) =>
        p.id === 'b' ? { ...p, smooth: true, out: { x: 30, y: -40 }, in: { x: -30, y: 40 } } : p,
      ),
    );
    expectOthersStable(before, livePath(), 'b');
  });

  it('unrotated/unscaled: the compensation reduces to the plain position += bbox.min', () => {
    // Guards the formula's identity limit — pen drawing and every pre-existing
    // rotation-0 flow must behave exactly as before the fix.
    const el: PathElement = {
      ...pathFromScenePoints('p2', [corner('a', 0, 0), corner('b', 100, 0)], false),
      transform: {
        position: { x: 50, y: 60 },
        size: { w: 100, h: 1 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
      },
    };
    const moved = el.points.map((p) => (p.id === 'a' ? { ...p, x: -20, y: -10 } : p));
    const n = normalizePathPoints({ ...el, points: moved });
    expect(n.transform.position.x).toBeCloseTo(50 - 20, 9);
    expect(n.transform.position.y).toBeCloseTo(60 - 10, 9);
    const vb = pathVisualBBox(n.points, n.closed);
    expect(vb.x).toBeCloseTo(0, 9);
    expect(vb.y).toBeCloseTo(0, 9);
    expect(n.transform.size.w).toBeCloseTo(Math.max(vb.w, 1), 9);
    expect(n.transform.size.h).toBeCloseTo(Math.max(vb.h, 1), 9);
  });
});
