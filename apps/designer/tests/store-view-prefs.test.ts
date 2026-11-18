import { afterEach, describe, expect, it } from 'vitest';
import { SceneSchema } from '@cg/shared-schema';
import { designerStore } from '../src/renderer/state/store.js';

afterEach(() => {
  designerStore._reset();
});

describe('designerStore — View prefs (ruler + snapping)', () => {
  it('defaults: ruler off, snapping on, no guides', () => {
    const s = designerStore.get();
    expect(s.rulerVisible).toBe(false);
    expect(s.safeAreasVisible).toBe(false);
    expect(s.snappingEnabled).toBe(true);
    expect(s.snapGuides).toEqual({ x: [], y: [] });
  });

  it('toggleRuler flips ruler visibility', () => {
    designerStore.toggleRuler();
    expect(designerStore.get().rulerVisible).toBe(true);
    designerStore.toggleRuler();
    expect(designerStore.get().rulerVisible).toBe(false);
  });

  it('safe-area visibility stays in view state without dirtying or creating undo history', () => {
    designerStore.setScene(
      SceneSchema.parse({
        schemaVersion: 1,
        id: 'safe-area-project',
        name: 'Custom authored margins',
        templateType: 'custom',
        resolution: { width: 1920, height: 1080 },
        frameRate: 50,
        frameRange: { in: 0, out: 50 },
        editorBackdrop: 'transparent',
        safeAreas: { title: 10, action: 5 },
        layers: [],
        fields: [],
        bindings: [],
        fonts: [],
        metadata: { createdAt: '2026-11-18T00:00:00.000Z', updatedAt: '2026-11-18T00:00:00.000Z' },
      }),
      null,
    );
    const before = designerStore.get();
    designerStore.toggleSafeAreas();
    expect(designerStore.get()).toMatchObject({
      safeAreasVisible: true,
      dirty: false,
      canUndo: false,
    });
    expect(designerStore.get().scene).toBe(before.scene);
    expect(designerStore.get().scene?.safeAreas).toEqual({ title: 10, action: 5 });
    designerStore.toggleSafeAreas();
    expect(designerStore.get().safeAreasVisible).toBe(false);
  });

  it('toggleSnapping flips snapping and clears any live guides', () => {
    designerStore.setSnapGuides({ x: [960], y: [540] });
    expect(designerStore.get().snapGuides.x).toEqual([960]);
    designerStore.toggleSnapping();
    expect(designerStore.get().snappingEnabled).toBe(false);
    expect(designerStore.get().snapGuides).toEqual({ x: [], y: [] });
  });

  it('setSnapGuides sets and clears guide lines', () => {
    designerStore.setSnapGuides({ x: [0, 960], y: [540] });
    expect(designerStore.get().snapGuides).toEqual({ x: [0, 960], y: [540] });
    designerStore.setSnapGuides({ x: [], y: [] });
    expect(designerStore.get().snapGuides).toEqual({ x: [], y: [] });
  });
});

describe('designerStore — ruler guides', () => {
  it('addGuide appends and returns the index; setGuidePos moves it', () => {
    expect(designerStore.addGuide('x', 100)).toBe(0);
    expect(designerStore.addGuide('x', 300)).toBe(1);
    expect(designerStore.addGuide('y', 540)).toBe(0);
    expect(designerStore.get().guides).toEqual({ x: [100, 300], y: [540] });
    designerStore.setGuidePos('x', 1, 320);
    expect(designerStore.get().guides.x).toEqual([100, 320]);
  });

  it('removeGuide drops the guide at the index', () => {
    designerStore.addGuide('y', 10);
    designerStore.addGuide('y', 20);
    designerStore.addGuide('y', 30);
    designerStore.removeGuide('y', 1);
    expect(designerStore.get().guides.y).toEqual([10, 30]);
  });

  it('out-of-range guide ops are no-ops', () => {
    designerStore.addGuide('x', 5);
    designerStore.setGuidePos('x', 9, 99);
    designerStore.removeGuide('x', 9);
    expect(designerStore.get().guides.x).toEqual([5]);
  });
});
