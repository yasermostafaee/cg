import { afterEach, describe, expect, it } from 'vitest';
import { ClockElementSchema, SequenceElementSchema } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import {
  defaultClock,
  defaultSequence,
  defaultShape,
  defaultText,
} from '../src/renderer/state/element-defaults.js';

afterEach(() => {
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

/** Layers of the open composition (mutations target the active document). */
function layers() {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.layers;
}

describe('designerStore — element mutations', () => {
  it('addElement creates a layer if none exists and selects the element', () => {
    freshScene();
    const t = defaultText('el-1', 10, 20);
    designerStore.addElement(t);
    const state = designerStore.get();
    expect(layers()).toHaveLength(1);
    expect(layers()[0]!.children).toHaveLength(1);
    expect(state.selection.has('el-1')).toBe(true);
  });

  it('addElement on existing scene appends to the first layer', () => {
    freshScene();
    designerStore.addElement(defaultText('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    expect(layers()[0]!.children).toHaveLength(2);
    expect(designerStore.get().selection.has('el-2')).toBe(true);
  });

  it('updateElement applies a shallow patch by id', () => {
    freshScene();
    const original = defaultText('el-1', 0, 0);
    designerStore.addElement(original);
    designerStore.updateElement('el-1', { name: 'Renamed' });
    expect(layers()[0]!.children[0]!.name).toBe('Renamed');
  });

  it('updateTransform mutates only the transform sub-tree', () => {
    freshScene();
    designerStore.addElement(defaultText('el-1', 10, 20));
    designerStore.updateTransform('el-1', { position: { x: 100, y: 100 } });
    const el = layers()[0]!.children[0]!;
    expect(el.transform.position).toEqual({ x: 100, y: 100 });
    expect(el.transform.size).toEqual({ w: 480, h: 80 });
  });

  it('removeElement drops the element + clears it from the selection', () => {
    freshScene();
    designerStore.addElement(defaultText('el-1', 0, 0));
    designerStore.removeElement('el-1');
    expect(layers()[0]!.children).toHaveLength(0);
    expect(designerStore.get().selection.has('el-1')).toBe(false);
  });

  it('setSelection replaces the entire selection', () => {
    freshScene();
    designerStore.addElement(defaultText('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    designerStore.setSelection(['el-1', 'el-2']);
    expect([...designerStore.get().selection]).toEqual(['el-1', 'el-2']);
    designerStore.setSelection([]);
    expect(designerStore.get().selection.size).toBe(0);
  });

  it('allElements returns elements across every layer', () => {
    freshScene();
    designerStore.addElement(defaultText('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    expect(designerStore.allElements().map((e) => e.id)).toEqual(['el-1', 'el-2']);
  });

  it('mutations on a missing element are no-ops', () => {
    freshScene();
    designerStore.updateElement('ghost', { name: 'X' });
    designerStore.updateTransform('ghost', { rotation: 90 });
    designerStore.removeElement('ghost');
    expect(layers()).toEqual([]);
  });

  it('mutations with no active scene are no-ops', () => {
    designerStore.addElement(defaultText('el-1', 0, 0));
    designerStore.updateElement('el-1', { name: 'X' });
    designerStore.updateTransform('el-1', { rotation: 90 });
    designerStore.removeElement('el-1');
    expect(designerStore.get().scene).toBeNull();
  });
});

describe('element-defaults', () => {
  it('defaultText produces a valid Text element', () => {
    const t = defaultText('el-1', 5, 6);
    expect(t.type).toBe('text');
    expect(t.transform.position).toEqual({ x: 5, y: 6 });
  });

  it('defaultShape produces a valid Shape element', () => {
    const s = defaultShape('el-1', 7, 8);
    expect(s.type).toBe('shape');
    expect(s.transform.position).toEqual({ x: 7, y: 8 });
    expect(s.fill).toMatchObject({ kind: 'solid' });
  });

  it('defaultClock produces a schema-valid Persian wall clock (D-027)', () => {
    const c = defaultClock('el-1', 9, 10);
    expect(c.type).toBe('clock');
    expect(c.transform.position).toEqual({ x: 9, y: 10 });
    expect(c.mode).toBe('wall');
    expect(c.format).toBe('HH:mm:ss');
    expect(c.digits).toBe('persian');
    expect(c.align).toBe('center');
    expect(c.font.family).toBe('Vazirmatn');
    // Schema-valid as authored (wall needs no target; defaults are explicit).
    expect(ClockElementSchema.parse(c)).toEqual(c);
  });

  it('defaultSequence produces a schema-valid Persian now/next — the Push-up preset (D-029)', () => {
    const q = defaultSequence('el-1', 11, 12);
    expect(q.type).toBe('sequence');
    expect(q.transform.position).toEqual({ x: 11, y: 12 });
    expect(q.direction).toBe('rtl');
    expect(q.advance).toBe('auto');
    expect(q.defaultDwellMs).toBe(5000);
    expect(q.transitionIn).toBe('bottom');
    expect(q.transitionOut).toBe('top');
    expect(q.transitionTiming).toBe('simultaneous');
    expect(q.repeat).toBe('infinite');
    expect(q.items).toHaveLength(3);
    expect(SequenceElementSchema.parse(q)).toEqual(q);
  });
});
