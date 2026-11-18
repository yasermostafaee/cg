import { afterEach, describe, expect, it } from 'vitest';
import {
  outputTranslate,
  resolveDefaultPosition,
  resolveProjectOutputRaster,
  type Position,
  type Scene,
} from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { packProject, projectCompositionForExport, readProjectDocument } from '@cg/vcg-format';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { ensureCompositions } from '../src/renderer/state/scene-doc.js';

const position: Position = { anchor: 'bottom-right', offset: { x: -40, y: -30 } };
const scene = (): Scene => {
  const result = designerStore.get().scene;
  if (result === null) throw new Error('Missing test project');
  return result;
};
const active = (): Scene => {
  const state = designerStore.get();
  const result = editSceneOf(state.scene, state.activeCompositionId);
  if (result === null) throw new Error('Missing test composition');
  return result;
};
function fresh(): string {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene: source } = projects.newScene('Small graphic', 'custom', {
    resolution: { width: 800, height: 200 },
  });
  // Existing project fixture predates the explicit output raster written by New Project.
  const { outputRaster: _createdRaster, ...legacy } = source;
  designerStore.setScene(legacy, null);
  const id = designerStore.get().activeCompositionId;
  if (id === null) throw new Error('Missing active composition');
  return id;
}
afterEach(() => designerStore._reset());

describe('project output raster and independent composition placement', () => {
  it('uses the legacy output reference for an old cropped project and new compositions keep their own sizes', () => {
    fresh();
    expect(resolveProjectOutputRaster(scene())).toEqual({ width: 1920, height: 1080 });
    expect(resolveDefaultPosition(active())).toEqual({ anchor: 'center', offset: { x: 0, y: 0 } });
    expect(outputTranslate(active(), resolveDefaultPosition(active()))).toEqual({ x: 560, y: 440 });
    designerStore.addComposition();
    expect(active().resolution).toEqual({ width: 800, height: 200 });
    expect(scene().resolution).toEqual({ width: 800, height: 200 });
    expect(resolveProjectOutputRaster(active())).toEqual({ width: 1920, height: 1080 });
  });

  it('retains the original legacy HD project raster while resizing or opening compositions', () => {
    fresh();
    const source = { ...scene(), resolution: { width: 1280, height: 720 } };
    designerStore.setScene(source, null);
    expect(active().resolution).toEqual({ width: 800, height: 200 });
    expect(active().outputRaster).toEqual({ width: 1280, height: 720 });
    expect(scene().outputRaster).toBeUndefined();
    designerStore.updateScene({ resolution: { width: 1920, height: 190 } });
    expect(resolveProjectOutputRaster(active())).toEqual({ width: 1280, height: 720 });
    expect(scene().resolution).toEqual({ width: 1280, height: 720 });
    designerStore.undo();
    expect(active().resolution).toEqual({ width: 800, height: 200 });
  });

  it('never mistakes an HD-sized composition in an old Full HD or cropped-root project for the output', () => {
    fresh();
    for (const resolution of [
      { width: 1920, height: 1080 },
      { width: 1920, height: 190 },
      { width: 1024, height: 1024 },
    ]) {
      designerStore.setScene({ ...scene(), resolution }, null);
      designerStore.updateScene({ resolution: { width: 1280, height: 720 } });
      expect(active().outputRaster).toEqual({ width: 1920, height: 1080 });
      expect(resolveProjectOutputRaster(active())).toEqual({ width: 1920, height: 1080 });
      expect(scene().outputRaster).toBeUndefined();
    }
  });

  it('keeps a newly chosen HD output explicit through composition resize, save and export', async () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const created = projects.newScene('HD lower third', 'custom', {
      resolution: { width: 1280, height: 720 },
    }).scene;
    expect(created.outputRaster).toEqual({ width: 1280, height: 720 });
    expect(created.outputRaster).not.toBe(created.resolution);
    designerStore.setScene(created, null);
    designerStore.updateScene({ resolution: { width: 1920, height: 190 } });
    expect(active().outputRaster).toEqual({ width: 1280, height: 720 });
    designerStore.setCompositionOutputPosition({ anchor: 'bottom-center', offset: { x: 0, y: 0 } });
    const bytes = await packProject({
      scene: scene(),
      index: [],
      files: new Map(),
      savedAt: '2026-11-18T00:00:00.000Z',
    });
    const reopened = await readProjectDocument(bytes);
    expect(reopened.scene.outputRaster).toEqual({ width: 1280, height: 720 });
    const compiled = projectCompositionForExport(
      reopened.scene,
      designerStore.get().activeCompositionId,
    );
    expect(compiled?.resolution).toEqual({ width: 1920, height: 190 });
    expect(compiled).not.toHaveProperty('outputRaster');
    expect(compiled?.defaultPosition).toEqual({ anchor: 'bottom-center', offset: { x: 0, y: 0 } });
  });

  it('tracks dirty state and undoes composition placement independently of the project raster', () => {
    const id = fresh();
    const outputRaster = { width: 1280, height: 720 };
    designerStore.setScene({ ...scene(), outputRaster }, null);
    const originalLayers = scene().compositions?.[0]?.layers;
    designerStore.markSaved();
    designerStore.setCompositionOutputPosition(position);
    designerStore.markHistoryBoundary();
    expect(designerStore.get().dirty).toBe(true);
    expect(scene().compositions?.[0]?.layers).toBe(originalLayers);
    expect(scene().defaultPosition).toBeUndefined();
    expect(scene().compositions?.find((c) => c.id === id)?.defaultPosition).toEqual(position);
    expect(active().resolution).toEqual({ width: 800, height: 200 });
    designerStore.undo();
    expect(active().defaultPosition).toBeUndefined();
    expect(scene().outputRaster).toEqual(outputRaster);
    designerStore.redo();
    expect(active().defaultPosition).toEqual(position);
  });

  it('keeps positions independent across compositions and copies the authored position on duplicate', () => {
    const first = fresh();
    designerStore.setCompositionOutputPosition(position);
    const second = designerStore.addComposition();
    if (second === null) throw new Error('Missing second composition');
    designerStore.setCompositionOutputPosition({ anchor: 'top-left', offset: { x: 25, y: 60 } });
    expect(active().defaultPosition?.offset).toEqual({ x: 25, y: 60 });
    designerStore.setActiveComposition(first);
    expect(active().defaultPosition).toEqual(position);
    const copy = designerStore.duplicateComposition(first);
    const duplicate = scene().compositions?.find((c) => c.id === copy);
    expect(duplicate?.defaultPosition).toEqual(position);
    expect(duplicate?.defaultPosition).not.toBe(
      scene().compositions?.find((c) => c.id === first)?.defaultPosition,
    );
  });

  it('retains root placement as the legacy fallback on edit, migration and export', () => {
    const id = fresh();
    const inherited = { ...scene(), defaultPosition: position };
    expect(editSceneOf(inherited, id)?.defaultPosition).toEqual(position);
    const exported = projectCompositionForExport(inherited, id);
    expect(exported?.defaultPosition).toEqual(position);
    expect(exported?.resolution).toEqual({ width: 800, height: 200 });
    const rootLayer = {
      id: 'legacy-layer',
      name: 'Legacy',
      visible: true,
      locked: false,
      blendMode: 'normal' as const,
      children: [],
    };
    const migrated = ensureCompositions({ ...inherited, compositions: [], layers: [rootLayer] });
    expect(editSceneOf(migrated.scene, migrated.activeId)?.defaultPosition).toEqual(position);
    expect(resolveProjectOutputRaster(migrated.scene)).toEqual({ width: 1920, height: 1080 });
  });

  it('preserves authored raster and placement in project save/reopen and copied project identity', async () => {
    const id = fresh();
    designerStore.setScene({ ...scene(), outputRaster: { width: 3840, height: 2160 } }, null);
    designerStore.setCompositionOutputPosition(position);
    const bytes = await packProject({
      scene: scene(),
      index: [],
      files: new Map(),
      savedAt: '2026-11-18T00:00:00.000Z',
    });
    const reopened = await readProjectDocument(bytes);
    designerStore.setScene(reopened.scene, 'reopened.cgproj');
    expect(scene().outputRaster).toEqual({ width: 3840, height: 2160 });
    expect(active().defaultPosition).toEqual(position);
    designerStore.adoptProjectId('copied-project');
    expect(scene().id).toBe('copied-project');
    expect(scene().outputRaster).toEqual({ width: 3840, height: 2160 });
    expect(scene().compositions?.find((c) => c.id === id)?.defaultPosition).toEqual(position);
    const compiled = projectCompositionForExport(scene(), id);
    expect(compiled).not.toHaveProperty('outputRaster');
    expect(compiled?.resolution).toEqual({ width: 800, height: 200 });
    expect(compiled?.defaultPosition).toEqual(position);
  });

  it('rejects invalid and unchanged writes without creating history, including no active composition', () => {
    fresh();
    designerStore.setCompositionOutputPosition(position);
    designerStore.markSaved();
    designerStore.markHistoryBoundary();
    const before = scene();
    designerStore.setCompositionOutputPosition(position);
    designerStore.setCompositionOutputPosition({ ...position, offset: { x: Number.NaN, y: 0 } });
    designerStore.setCompositionOutputPosition({
      ...position,
      offset: { x: Number.POSITIVE_INFINITY, y: 0 },
    });
    expect(scene()).toBe(before);
    expect(designerStore.get().dirty).toBe(false);
    designerStore.setActiveComposition(null);
    designerStore.setCompositionOutputPosition({ ...position, offset: { x: 20, y: 30 } });
    expect(scene()).toBe(before);
  });
});
