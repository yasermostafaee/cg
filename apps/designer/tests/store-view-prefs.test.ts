import { afterEach, describe, expect, it } from 'vitest';
import { designerStore } from '../src/renderer/state/store.js';

afterEach(() => {
  designerStore._reset();
});

describe('designerStore — View prefs (ruler + snapping)', () => {
  it('defaults: ruler off, snapping on, no guides', () => {
    const s = designerStore.get();
    expect(s.rulerVisible).toBe(false);
    expect(s.snappingEnabled).toBe(true);
    expect(s.snapGuides).toEqual({ x: [], y: [] });
  });

  it('toggleRuler flips ruler visibility', () => {
    designerStore.toggleRuler();
    expect(designerStore.get().rulerVisible).toBe(true);
    designerStore.toggleRuler();
    expect(designerStore.get().rulerVisible).toBe(false);
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
