import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';

function freshSceneWithShape(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('layer-actions-test', 'custom');
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultShape('el-1', 50, 60));
}

function children(): readonly Element[] {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!.children;
}
function first(): Element {
  return children()[0]!;
}

beforeEach(() => {
  freshSceneWithShape();
});

afterEach(() => {
  designerStore._reset();
});

describe('designerStore — layer context-menu actions', () => {
  it('setElementTimelineColor persists a chosen color on the element', () => {
    designerStore.setElementTimelineColor('el-1', '#22C55E');
    expect(first().timelineColor).toBe('#22C55E');
  });

  it('fitElementLifespanToActiveRange snaps the lifespan to the active region', () => {
    designerStore.setSceneActiveOut(20);
    designerStore.fitElementLifespanToActiveRange('el-1');
    expect(first().lifespan).toEqual({ in: 0, out: 20 });
  });

  it('fitElementLifespanToActiveRange uses the full frameRange when no active region is set', () => {
    designerStore.fitElementLifespanToActiveRange('el-1');
    expect(first().lifespan).toEqual({ in: 0, out: 50 });
  });

  it('copy + paste inserts a fresh clone with a new id', () => {
    designerStore.copyElement('el-1');
    expect(designerStore.hasClipboardElement()).toBe(true);
    designerStore.pasteElement();
    expect(children()).toHaveLength(2);
    const clone = children()[1]!;
    expect(clone.id).not.toBe('el-1');
    expect(clone.name).toBe('Rectangle copy');
    // The clone becomes the selection.
    expect([...designerStore.get().selection]).toEqual([clone.id]);
  });

  it('pasteElement is a no-op with an empty clipboard', () => {
    expect(designerStore.hasClipboardElement()).toBe(false);
    designerStore.pasteElement();
    expect(children()).toHaveLength(1);
  });

  it('cut copies the element and removes it from the scene', () => {
    designerStore.cutElement('el-1');
    expect(children()).toHaveLength(0);
    expect(designerStore.hasClipboardElement()).toBe(true);
    // It can be pasted back.
    designerStore.pasteElement();
    expect(children()).toHaveLength(1);
    expect(children()[0]!.id).not.toBe('el-1');
  });

  it('duplicate inserts a clone directly after the original', () => {
    designerStore.duplicateElement('el-1');
    expect(children()).toHaveLength(2);
    expect(children()[0]!.id).toBe('el-1');
    expect(children()[1]!.id).not.toBe('el-1');
    expect(children()[1]!.name).toBe('Rectangle copy');
  });

  it('clears the clipboard on scene switch', () => {
    designerStore.copyElement('el-1');
    expect(designerStore.hasClipboardElement()).toBe(true);
    freshSceneWithShape();
    expect(designerStore.hasClipboardElement()).toBe(false);
  });
});
