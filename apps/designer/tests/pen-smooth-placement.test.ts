/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import type { PathElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { endPenSession, penPointerDown } from '../src/renderer/features/canvas/pen-draw.js';

/**
 * B-053 — corner-vs-smooth is decided at pointer-UP (Illustrator semantics,
 * owner decision 2026-07-08): a plain click (total drag under the jitter guard,
 * in SCREEN px so it is zoom-independent) places a CORNER anchor even when
 * micro-jitter briefly crossed the old incremental threshold; a genuine drag
 * places a SMOOTH anchor with mirrored handles; a corner placed after a smooth
 * anchor leaves the previous anchor's handles untouched.
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

function pathEl(): PathElement {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId);
  for (const layer of doc?.layers ?? []) {
    for (const el of layer.children) if (el.type === 'path') return el;
  }
  throw new Error('no path element');
}

/** Pointer-down at scene (x,y) with the pointer at screen (cx,cy), given scale. */
const down = (x: number, y: number, cx: number, cy: number, scale: number): boolean =>
  penPointerDown({ x, y }, scale, { clientX: cx, clientY: cy } as PointerEvent);

const move = (cx: number, cy: number): void => {
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: cx, clientY: cy }));
};
const up = (cx: number, cy: number): void => {
  window.dispatchEvent(new MouseEvent('pointerup', { clientX: cx, clientY: cy }));
};

describe('pen anchor placement — corner vs smooth at pointer-up (B-053)', () => {
  it('a 2-screen-px click slip at low zoom places a CORNER (zoom-independent guard)', () => {
    freshScene();
    const scale = 0.5; // 2 screen px = 4 scene px — the old 3-SCENE-px guard fired
    down(20, 20, 10, 10, scale);
    up(10, 10);
    down(220, 20, 110, 10, scale);
    move(112, 10); // 2 screen px of slip before release
    up(112, 10);
    const last = pathEl().points[1]!;
    expect(last.smooth).toBe(false);
    expect(last.in).toBeUndefined();
    expect(last.out).toBeUndefined();
  });

  it('a drag-out-and-back release places a CORNER (decision at UP, not incremental)', () => {
    freshScene();
    down(10, 10, 10, 10, 1);
    up(10, 10);
    down(110, 10, 110, 10, 1);
    move(130, 30); // well past the guard — smooth while held...
    move(111, 10); // ...but returns to a click-sized displacement
    up(111, 10);
    const last = pathEl().points[1]!;
    expect(last.smooth).toBe(false);
    expect(last.in).toBeUndefined();
    expect(last.out).toBeUndefined();
  });

  it('a genuine drag places a SMOOTH anchor with mirrored handles', () => {
    freshScene();
    down(10, 10, 10, 10, 1);
    up(10, 10);
    down(110, 10, 110, 10, 1);
    move(140, 30);
    up(140, 30);
    const last = pathEl().points[1]!;
    expect(last.smooth).toBe(true);
    expect(last.out).toEqual({ x: 30, y: 20 });
    expect(last.in).toEqual({ x: -30, y: -20 });
  });

  it('a corner after a smooth anchor keeps the previous handles intact', () => {
    freshScene();
    down(10, 10, 10, 10, 1);
    up(10, 10);
    down(110, 10, 110, 10, 1);
    move(140, 30);
    up(140, 30); // anchor 2 smooth
    down(210, 10, 210, 10, 1);
    move(211, 11); // click-sized slip
    up(211, 11);
    const pts = pathEl().points;
    expect(pts[1]!.smooth).toBe(true);
    expect(pts[1]!.out).toEqual({ x: 30, y: 20 }); // untouched (Illustrator rule)
    expect(pts[2]!.smooth).toBe(false);
    expect(pts[2]!.in).toBeUndefined();
    expect(pts[2]!.out).toBeUndefined();
  });
});
