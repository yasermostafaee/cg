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
function activeLayers() {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.layers;
}
function first(): Element {
  return children()[0]!;
}
function addSecondShape(): void {
  designerStore.addElement(defaultShape('el-2', 80, 90));
}
function ids(): string[] {
  return children().map((c) => c.id);
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
    // D-088 — cutting the lone child empties + prunes the auto scaffold layer.
    expect(activeLayers()).toHaveLength(0);
    expect(designerStore.hasClipboardElement()).toBe(true);
    // It can be pasted back (paste re-creates a scaffold layer for the clone).
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

describe('designerStore — selection-aware clipboard / ops (D-076 / D-077)', () => {
  it('copySelection + pasteElements clones every selected element and selects the pasted set', () => {
    addSecondShape();
    designerStore.setSelection(['el-1', 'el-2']);
    designerStore.copySelection();
    expect(designerStore.hasClipboardElement()).toBe(true);
    designerStore.pasteElements();
    expect(children()).toHaveLength(4); // 2 originals + 2 clones
    expect(ids().filter((id) => id !== 'el-1' && id !== 'el-2')).toHaveLength(2);
    // the pasted clones become the selection
    const sel = [...designerStore.get().selection];
    expect(sel).toHaveLength(2);
    expect(sel).not.toContain('el-1');
    expect(sel).not.toContain('el-2');
  });

  it('copySelection captures stack order; pasteElements preserves it after the selected element', () => {
    addSecondShape(); // layer order: el-1, el-2
    designerStore.setSelection(['el-1', 'el-2']);
    designerStore.copySelection(); // clipboard: [clone(el-1), clone(el-2)]
    designerStore.setSelection(['el-1']); // paste right after el-1
    designerStore.pasteElements();
    const order = ids();
    expect(order).toHaveLength(4);
    expect(order[0]).toBe('el-1'); // original
    expect(order[3]).toBe('el-2'); // original, still last
    expect(order[1]).not.toBe('el-1'); // clone of el-1
    expect(order[2]).not.toBe('el-2'); // then clone of el-2 — clipboard order kept
  });

  it('cutSelection copies the whole selection then removes it (one undo step)', () => {
    addSecondShape();
    designerStore.setSelection(['el-1', 'el-2']);
    designerStore.cutSelection();
    expect(designerStore.hasClipboardElement()).toBe(true);
    // both removed; D-088 prunes the now-empty scaffold layer
    expect(activeLayers()).toHaveLength(0);
    // a single undo restores both
    designerStore.undo();
    expect(ids()).toEqual(['el-1', 'el-2']);
  });

  it('cutSelection removes the layer even when one of its keyframes is selected (regression)', () => {
    // Bug state: the element is selected AND one of its keyframes is selected.
    // `deleteSelection` has keyframe-first precedence, so cutSelection must NOT route
    // through it — it must remove the ELEMENT it copied, not delete the keyframe and
    // leave the layer behind.
    designerStore.upsertKeyframe('el-1', 'opacity', 0, 1);
    designerStore.setSelection(['el-1']);
    designerStore.openKeyframeInspector({ elementId: 'el-1', property: 'opacity', frame: 0 });
    expect(designerStore.get().selectedKeyframes).toHaveLength(1);

    designerStore.cutSelection();
    expect(designerStore.hasClipboardElement()).toBe(true);
    expect(activeLayers()).toHaveLength(0); // el-1 actually removed (lone child → scaffold pruned)
  });

  it('duplicateSelection inserts a clone after each original and selects the clones', () => {
    addSecondShape();
    designerStore.setSelection(['el-1', 'el-2']);
    designerStore.duplicateSelection();
    const order = ids();
    expect(order).toHaveLength(4);
    expect(order[0]).toBe('el-1');
    expect(order[1]).not.toBe('el-1'); // clone of el-1, right after it
    expect(order[2]).toBe('el-2');
    expect(order[3]).not.toBe('el-2'); // clone of el-2, right after it
    expect([...designerStore.get().selection]).toHaveLength(2);
    // one undo removes all clones
    designerStore.undo();
    expect(ids()).toEqual(['el-1', 'el-2']);
  });

  it('fitSelectionLifespanToActiveRange fits every selected element in one undo step', () => {
    addSecondShape();
    designerStore.setSceneActiveOut(20);
    designerStore.setSelection(['el-1', 'el-2']);
    designerStore.fitSelectionLifespanToActiveRange();
    for (const el of children()) expect(el.lifespan).toEqual({ in: 0, out: 20 });
    designerStore.undo();
    for (const el of children()) expect(el.lifespan).not.toEqual({ in: 0, out: 20 });
  });

  it('setSelectionTimelineColor colors every selected element in one undo step', () => {
    addSecondShape();
    designerStore.setSelection(['el-1', 'el-2']);
    designerStore.setSelectionTimelineColor('#EF4444');
    for (const el of children()) expect(el.timelineColor).toBe('#EF4444');
    designerStore.undo();
    for (const el of children()) expect(el.timelineColor).not.toBe('#EF4444');
  });

  it('copySelection with nothing selected leaves the clipboard untouched', () => {
    designerStore.copyElement('el-1'); // clipboard holds one
    designerStore.setSelection([]);
    designerStore.copySelection(); // no-op — must not clobber
    expect(designerStore.hasClipboardElement()).toBe(true);
  });
});
