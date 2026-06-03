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
