import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';

/**
 * D-047 — `reorderElement(id, targetVisualIndex)` reorders an element within its
 * sibling set by its timeline row position. `targetVisualIndex` is the displayed
 * top→bottom index (the timeline lists `[...flatten].reverse()`, so top = front).
 * The sibling set's `zIndex` is renumbered so top→bottom maps to DESCENDING `zIndex`
 * (top = highest = front-most) and the runtime's ascending-`zIndex` paint order
 * matches the array order. One undo reverts it; a drop at the origin is a no-op.
 */

function freshSceneWithShapes(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('reorder-test', 'custom');
  designerStore.setScene(scene, null);
  // Added in order → children array [el-1, el-2, el-3]; the timeline lists them
  // reversed, so the top→bottom rows are [el-3, el-2, el-1].
  designerStore.addElement(defaultShape('el-1', 0, 0));
  designerStore.addElement(defaultShape('el-2', 0, 0));
  designerStore.addElement(defaultShape('el-3', 0, 0));
  // Close the setup burst so a later reorder is its own isolated undo entry.
  designerStore.markHistoryBoundary();
}

function children(): readonly Element[] {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!.children;
}
const ids = (): string[] => children().map((e) => e.id);
const zIndices = (): number[] => children().map((e) => e.zIndex);
/** Paint order = children sorted ASCENDING by zIndex (what the scene-builder does). */
const paintOrder = (): string[] =>
  [...children()].sort((a, b) => a.zIndex - b.zIndex).map((e) => e.id);
/** Timeline rows, top→bottom (what the dock renders): the reverse of array order. */
const rowOrder = (): string[] => [...children()].map((e) => e.id).reverse();

beforeEach(() => {
  freshSceneWithShapes();
});

afterEach(() => {
  designerStore._reset();
});

describe('designerStore.reorderElement — D-047 layer reorder', () => {
  it('seeds three same-z elements (paint == array order via stable sort)', () => {
    expect(ids()).toEqual(['el-1', 'el-2', 'el-3']);
    expect(zIndices()).toEqual([0, 0, 0]);
    expect(rowOrder()).toEqual(['el-3', 'el-2', 'el-1']);
  });

  it('moves the bottom row to the top and renumbers zIndex (top = highest = front)', () => {
    // el-1 is the bottom row (visual index 2). Move it to the top (index 0).
    designerStore.reorderElement('el-1', 0);

    // Displayed top→bottom is now [el-1, el-3, el-2].
    expect(rowOrder()).toEqual(['el-1', 'el-3', 'el-2']);
    // Array order (back→front) is the reverse of that, with zIndex = array index.
    expect(ids()).toEqual(['el-2', 'el-3', 'el-1']);
    expect(zIndices()).toEqual([0, 1, 2]);
    // Top row maps to the HIGHEST zIndex (front-most).
    const top = children().find((e) => e.id === 'el-1')!;
    expect(top.zIndex).toBe(Math.max(...zIndices()));
    // Render order (ascending zIndex sort) matches the array order, front-most last.
    expect(paintOrder()).toEqual(ids());
    expect(paintOrder().at(-1)).toBe('el-1');
  });

  it('moves a top row down to the bottom', () => {
    // el-3 is the top row (visual index 0). Move it to the bottom (index 2).
    designerStore.reorderElement('el-3', 2);
    expect(rowOrder()).toEqual(['el-2', 'el-1', 'el-3']);
    // el-3 is now back-most → lowest zIndex (paints first).
    expect(paintOrder().at(0)).toBe('el-3');
    expect(children().find((e) => e.id === 'el-3')!.zIndex).toBe(Math.min(...zIndices()));
  });

  it('a single undo restores the previous order and zIndex', () => {
    designerStore.reorderElement('el-1', 0);
    expect(ids()).toEqual(['el-2', 'el-3', 'el-1']);
    designerStore.undo();
    expect(ids()).toEqual(['el-1', 'el-2', 'el-3']);
    expect(zIndices()).toEqual([0, 0, 0]);
  });

  it('dropping at the origin index is a no-op (no reorder, no zIndex change)', () => {
    // el-3 already sits at the top (visual index 0).
    designerStore.reorderElement('el-3', 0);
    expect(ids()).toEqual(['el-1', 'el-2', 'el-3']);
    expect(zIndices()).toEqual([0, 0, 0]);
  });

  it('clamps an out-of-range target into the list', () => {
    designerStore.reorderElement('el-3', 99); // far past the bottom
    expect(rowOrder()).toEqual(['el-2', 'el-1', 'el-3']); // el-3 lands at the bottom
  });

  it('is a no-op for an unknown element id', () => {
    designerStore.reorderElement('nope', 0);
    expect(ids()).toEqual(['el-1', 'el-2', 'el-3']);
    expect(zIndices()).toEqual([0, 0, 0]);
  });
});
