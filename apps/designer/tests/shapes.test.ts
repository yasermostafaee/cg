import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { SceneSchema, ShapeElementSchema } from '@cg/shared-schema';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultEllipse, defaultShape } from '../src/renderer/state/element-defaults.js';

afterEach(() => {
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('shapes', 'custom');
  designerStore.setScene(scene, null);
}

describe('defaultEllipse', () => {
  it('produces a schema-valid ellipse ShapeElement', () => {
    const el = defaultEllipse('el-1', 100, 200);
    const parsed = ShapeElementSchema.parse(el);
    expect(parsed.type).toBe('shape');
    expect(parsed.shape).toBe('ellipse');
  });

  it('defaults to a circle (equal width and height)', () => {
    const el = defaultEllipse('el-1', 0, 0);
    expect(el.transform.size.w).toBe(el.transform.size.h);
  });

  it('positions the shape at the click point', () => {
    const el = defaultEllipse('el-1', 320, 540);
    expect(el.transform.position).toEqual({ x: 320, y: 540 });
  });
});

describe('defaultShape stays a rectangle', () => {
  it('is shape: rect', () => {
    expect(defaultShape('el-1', 0, 0).shape).toBe('rect');
  });
});

describe('adding an ellipse via the store', () => {
  it('selects the new element and keeps the scene schema-valid', () => {
    freshScene();
    designerStore.addElement(defaultEllipse('el-ellipse', 50, 60));
    const state = designerStore.get();
    expect(state.selection.has('el-ellipse')).toBe(true);
    // The whole scene (with the new ellipse) still validates.
    expect(() => SceneSchema.parse(state.scene)).not.toThrow();
    const added = editSceneOf(state.scene, state.activeCompositionId)
      ?.layers.flatMap((l) => l.children)
      .find((e) => e.id === 'el-ellipse');
    expect(added?.type === 'shape' && added.shape === 'ellipse').toBe(true);
  });
});
