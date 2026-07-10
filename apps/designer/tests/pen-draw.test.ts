/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import type { PathElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import {
  cancelPen,
  endPenSession,
  finishPen,
  isPenDrawing,
  penDraftPoints,
  penPointerDown,
} from '../src/renderer/features/canvas/pen-draw.js';

/**
 * B-037 — the pen draft state machine. The draft is module-level, so every test
 * ends the session before resetting the store (a leaked draft is exactly the bug
 * this change fixes — the tests must not recreate it across cases).
 */

afterEach(() => {
  endPenSession();
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

/** All path elements in the open composition. */
function pathEls(): PathElement[] {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId);
  const out: PathElement[] = [];
  for (const layer of doc?.layers ?? []) {
    for (const el of layer.children) if (el.type === 'path') out.push(el);
  }
  return out;
}

/** A pen pointer-down at scene (x, y), scale 1. Only clientX/Y are read. */
const pd = (x: number, y: number): boolean =>
  penPointerDown({ x, y }, 1, { clientX: x, clientY: y } as PointerEvent);

describe('pen draft state machine (B-037)', () => {
  it('two clicks create ONE selected 2-anchor element; the draft is live', () => {
    freshScene();
    pd(10, 10);
    expect(isPenDrawing()).toBe(true);
    expect(pathEls()).toHaveLength(0); // < 2 anchors → nothing in the scene yet
    pd(110, 10);
    const els = pathEls();
    expect(els).toHaveLength(1);
    expect(els[0]!.points).toHaveLength(2);
    expect(els[0]!.closed).toBe(false);
    expect(designerStore.get().selection.has(els[0]!.id)).toBe(true);
    expect(penDraftPoints().map((p) => ({ x: p.x, y: p.y }))).toEqual([
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ]);
  });

  it('clicking the first anchor closes the path and the pen STAYS armed', () => {
    freshScene();
    designerStore.setTool('pen');
    pd(10, 10);
    pd(110, 10);
    pd(60, 90);
    const closed = pd(10, 10); // within PEN_CLOSE_PX/scale of the first anchor
    expect(closed).toBe(true);
    expect(isPenDrawing()).toBe(false);
    const els = pathEls();
    expect(els).toHaveLength(1);
    expect(els[0]!.closed).toBe(true);
    expect(els[0]!.points).toHaveLength(3);
    // B-037 — no forced tool reset: the pen stays armed after a finish.
    expect(designerStore.get().tool).toBe('pen');
    expect(penDraftPoints()).toHaveLength(0);
  });

  it('after a finish the next pointer-down starts a NEW independent element', () => {
    freshScene();
    pd(10, 10);
    pd(110, 10);
    finishPen(false);
    const first = pathEls()[0]!;
    const firstPointsBefore = JSON.stringify(first.points);

    pd(300, 200);
    expect(isPenDrawing()).toBe(true);
    pd(400, 200);
    const els = pathEls();
    expect(els).toHaveLength(2);
    expect(els[1]!.id).not.toBe(first.id);
    // Shape 1 untouched by the second draw.
    const firstAfter = pathEls().find((e) => e.id === first.id)!;
    expect(JSON.stringify(firstAfter.points)).toBe(firstPointsBefore);
    expect(firstAfter.points).toHaveLength(2);
  });

  it('endPenSession finishes a ≥ 2-anchor draft OPEN and the next session starts fresh', () => {
    freshScene();
    pd(10, 10);
    pd(110, 10);
    endPenSession(); // e.g. tool switched mid-draw
    expect(isPenDrawing()).toBe(false);
    let els = pathEls();
    expect(els).toHaveLength(1);
    expect(els[0]!.closed).toBe(false);
    expect(els[0]!.points).toHaveLength(2);

    // A later pen session must NOT append to shape 1.
    pd(300, 200);
    pd(400, 200);
    els = pathEls();
    expect(els).toHaveLength(2);
    expect(els[0]!.points).toHaveLength(2);
  });

  it('endPenSession cancels a 1-anchor draft (nothing persists)', () => {
    freshScene();
    pd(10, 10);
    endPenSession();
    expect(isPenDrawing()).toBe(false);
    expect(pathEls()).toHaveLength(0);
  });

  it('cancelPen (Esc) removes the created element entirely', () => {
    freshScene();
    pd(10, 10);
    pd(110, 10);
    pd(60, 90);
    expect(pathEls()).toHaveLength(1);
    cancelPen();
    expect(isPenDrawing()).toBe(false);
    expect(pathEls()).toHaveLength(0);
  });

  it('cancelPen on a 1-anchor draft is a pure reset', () => {
    freshScene();
    pd(10, 10);
    cancelPen();
    expect(isPenDrawing()).toBe(false);
    expect(pathEls()).toHaveLength(0);
  });

  it('consecutive sessions get distinct collision-safe element ids', () => {
    freshScene();
    pd(10, 10);
    pd(110, 10);
    finishPen(false);
    pd(200, 10);
    pd(300, 10);
    finishPen(false);
    const [a, b] = pathEls();
    expect(a!.id).not.toBe(b!.id);
    expect(a!.id).toMatch(/^el-/);
    expect(b!.id).toMatch(/^el-/);
  });

  it('undo after a cancel restores the WHOLE canceled path as one step (leading boundary)', () => {
    freshScene();
    pd(10, 10);
    pd(110, 10);
    pd(60, 90);
    cancelPen();
    expect(pathEls()).toHaveLength(0);
    // The leading boundary keeps the removal out of the draw's coalescing window,
    // so one undo restores the full 3-anchor path — never a partial phantom.
    designerStore.undo();
    const els = pathEls();
    expect(els).toHaveLength(1);
    expect(els[0]!.points).toHaveLength(3);
  });

  it('a draft whose element was deleted mid-draw dies; the next click starts fresh', () => {
    freshScene();
    pd(10, 10);
    pd(110, 10);
    const staleId = pathEls()[0]!.id;
    // Simulate the Delete key acting on the auto-selected draft element.
    designerStore.removeElement(staleId);
    expect(isPenDrawing()).toBe(false); // lazy invalidation dropped the stale draft
    expect(penDraftPoints()).toHaveLength(0);
    pd(300, 200);
    pd(400, 200);
    const els = pathEls();
    expect(els).toHaveLength(1);
    expect(els[0]!.id).not.toBe(staleId);
    expect(els[0]!.points).toHaveLength(2); // fresh — not the old anchors resurrected
  });

  it('a draft whose element was externally shrunk (undo mid-draw) dies without touching it', () => {
    freshScene();
    pd(10, 10);
    pd(110, 10);
    pd(60, 90);
    const el = pathEls()[0]!;
    // Simulate an undo stepping the element back to 2 anchors while the draft holds 3.
    designerStore.updateElement(el.id, { points: el.points.slice(0, 2) } as never);
    expect(isPenDrawing()).toBe(false);
    // The survivor keeps its restored geometry — never resurrected, never removed.
    expect(pathEls()[0]!.points).toHaveLength(2);
    pd(300, 200);
    pd(400, 200);
    expect(pathEls()).toHaveLength(2);
    expect(pathEls()[0]!.points).toHaveLength(2);
  });

  it('drag-to-smooth mirrors the handles on the last anchor', () => {
    freshScene();
    pd(10, 10);
    pd(110, 10);
    // The pointermove listener attached by the last pointer-down turns the anchor
    // smooth; only clientX/clientY are read from the event.
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 30 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    const el = pathEls()[0]!;
    const last = el.points[el.points.length - 1]!;
    expect(last.smooth).toBe(true);
    expect(last.out).toEqual({ x: 30, y: 20 });
    expect(last.in).toEqual({ x: -30, y: -20 });
  });
});
