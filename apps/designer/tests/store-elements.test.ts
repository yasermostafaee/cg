import { afterEach, describe, expect, it } from 'vitest';
import { ProjectService } from '../src/main/services/ProjectService.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultShape, defaultText } from '../src/renderer/state/element-defaults.js';

afterEach(() => {
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectService({
    recentFilePath: '/tmp/recent.json',
    randomId: () => 'scene-fixed',
  });
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

describe('designerStore — element mutations', () => {
  it('addElement creates a layer if none exists and selects the element', () => {
    freshScene();
    const t = defaultText('el-1', 10, 20);
    designerStore.addElement(t);
    const state = designerStore.get();
    expect(state.scene!.layers).toHaveLength(1);
    expect(state.scene!.layers[0]!.children).toHaveLength(1);
    expect(state.selection.has('el-1')).toBe(true);
  });

  it('addElement on existing scene appends to the first layer', () => {
    freshScene();
    designerStore.addElement(defaultText('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    expect(designerStore.get().scene!.layers[0]!.children).toHaveLength(2);
    expect(designerStore.get().selection.has('el-2')).toBe(true);
  });

  it('updateElement applies a shallow patch by id', () => {
    freshScene();
    const original = defaultText('el-1', 0, 0);
    designerStore.addElement(original);
    designerStore.updateElement('el-1', { name: 'Renamed' });
    expect(designerStore.get().scene!.layers[0]!.children[0]!.name).toBe('Renamed');
  });

  it('updateTransform mutates only the transform sub-tree', () => {
    freshScene();
    designerStore.addElement(defaultText('el-1', 10, 20));
    designerStore.updateTransform('el-1', { position: { x: 100, y: 100 } });
    const el = designerStore.get().scene!.layers[0]!.children[0]!;
    expect(el.transform.position).toEqual({ x: 100, y: 100 });
    expect(el.transform.size).toEqual({ w: 480, h: 80 });
  });

  it('removeElement drops the element + clears it from the selection', () => {
    freshScene();
    designerStore.addElement(defaultText('el-1', 0, 0));
    designerStore.removeElement('el-1');
    expect(designerStore.get().scene!.layers[0]!.children).toHaveLength(0);
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
    expect(designerStore.get().scene!.layers).toEqual([]);
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
});
