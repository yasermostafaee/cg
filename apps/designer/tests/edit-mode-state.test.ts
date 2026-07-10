import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { pathFromScenePoints } from '../src/renderer/state/element-defaults.js';
import { designerStore } from '../src/renderer/state/store.js';

/**
 * D-124 — the path point-edit mode state (`editingPathId`): entered explicitly,
 * cleared by anything that leaves the path (selection change, deselect,
 * composition switch, reset); kept when the selection still contains the path.
 */

afterEach(() => {
  designerStore._reset();
});

const corner = (id: string, x: number, y: number) => ({ id, x, y, smooth: false });

function freshSceneWithPath(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
  designerStore.addElement(
    pathFromScenePoints('p1', [corner('a', 0, 0), corner('b', 100, 0)], false),
  );
}

describe('editingPathId (D-124)', () => {
  it('enters and exits explicitly; entering is idempotent', () => {
    freshSceneWithPath();
    expect(designerStore.get().editingPathId).toBeNull();
    designerStore.setEditingPath('p1');
    expect(designerStore.get().editingPathId).toBe('p1');
    designerStore.setEditingPath('p1'); // no-op re-entry
    expect(designerStore.get().editingPathId).toBe('p1');
    designerStore.setEditingPath(null);
    expect(designerStore.get().editingPathId).toBeNull();
  });

  it('survives re-selecting the SAME path; clears when the selection leaves it', () => {
    freshSceneWithPath();
    designerStore.setSelection(['p1']);
    designerStore.setEditingPath('p1');
    designerStore.setSelection(['p1']); // same path re-selected — mode kept
    expect(designerStore.get().editingPathId).toBe('p1');
    designerStore.setSelection(['other']); // different element — mode cleared
    expect(designerStore.get().editingPathId).toBeNull();
  });

  it('clears on deselect and on selection toggle-out', () => {
    freshSceneWithPath();
    designerStore.setSelection(['p1']);
    designerStore.setEditingPath('p1');
    designerStore.setSelection([]);
    expect(designerStore.get().editingPathId).toBeNull();

    designerStore.setSelection(['p1']);
    designerStore.setEditingPath('p1');
    designerStore.toggleInSelection('p1'); // toggled OUT
    expect(designerStore.get().editingPathId).toBeNull();
  });

  it('clears on a composition switch', () => {
    freshSceneWithPath();
    designerStore.setEditingPath('p1');
    const compId = designerStore.addComposition();
    expect(compId).not.toBeNull(); // addComposition opens it (setActiveComposition path)
    expect(designerStore.get().editingPathId).toBeNull();
  });
});
