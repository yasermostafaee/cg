import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, ShapeElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';
import {
  effectiveTransformAt,
  keyframeVariantFor,
} from '../src/renderer/features/timeline/keyframe-helpers.js';

function freshSceneWithShape(): ShapeElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('anim-test', 'custom');
  designerStore.setScene(scene, null);
  const shape = defaultShape('el-1', 50, 60);
  designerStore.addElement(shape);
  return shape;
}

function selected(): Element {
  const state = designerStore.get();
  const el = state.scene!.layers[0]!.children[0]!;
  return el;
}

beforeEach(() => {
  freshSceneWithShape();
});

afterEach(() => {
  designerStore._reset();
});

describe('designerStore — currentFrame + scrub', () => {
  it('setCurrentFrame clamps to the scene frameRange', () => {
    designerStore.setCurrentFrame(-10);
    expect(designerStore.get().currentFrame).toBe(0);
    designerStore.setCurrentFrame(1_000);
    expect(designerStore.get().currentFrame).toBe(50);
    designerStore.setCurrentFrame(25);
    expect(designerStore.get().currentFrame).toBe(25);
  });

  it('setCurrentFrame rounds non-integer scrub positions to the nearest frame', () => {
    designerStore.setCurrentFrame(7.4);
    expect(designerStore.get().currentFrame).toBe(7);
    designerStore.setCurrentFrame(7.6);
    expect(designerStore.get().currentFrame).toBe(8);
  });
});

describe('designerStore — upsertKeyframe', () => {
  it('creates a track + keyframe when none exists', () => {
    designerStore.setCurrentFrame(10);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    const el = selected();
    expect(el.animation?.tracks['position.x']?.keyframes).toEqual([
      { frame: 10, value: 100, easing: 'linear' },
    ]);
  });

  it('keeps keyframes sorted by frame on insert', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 30, 300);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 20, 200);
    const el = selected();
    const frames = el.animation?.tracks['position.x']?.keyframes.map((k) => k.frame);
    expect(frames).toEqual([10, 20, 30]);
  });

  it('overwrites the keyframe value when the frame already has one (no duplicates)', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 15, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 15, 222);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs?.[0]?.value).toBe(222);
  });
});

describe('designerStore — moveKeyframe', () => {
  it('moves a keyframe to a new frame and keeps the track sorted', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 250);
    designerStore.moveKeyframe('el-1', 'position.x', 5, 40);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs?.map((k) => k.frame)).toEqual([25, 40]);
    expect(kfs?.map((k) => k.value)).toEqual([250, 50]);
  });

  it('drops a colliding keyframe (moved one wins)', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 250);
    designerStore.moveKeyframe('el-1', 'position.x', 5, 25);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs?.[0]).toEqual({ frame: 25, value: 50, easing: 'linear' });
  });

  it('is a no-op when fromFrame has no keyframe', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.moveKeyframe('el-1', 'position.x', 999, 10);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs).toEqual([{ frame: 5, value: 50, easing: 'linear' }]);
  });
});

describe('designerStore — removeKeyframe', () => {
  it('drops the keyframe from the track', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 250);
    designerStore.removeKeyframe('el-1', 'position.x', 5);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs).toEqual([{ frame: 25, value: 250, easing: 'linear' }]);
  });

  it('removing the last keyframe prunes the track entry', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 5, 50);
    designerStore.removeKeyframe('el-1', 'position.x', 5);
    const el = selected();
    expect(el.animation).toBeUndefined();
  });
});

describe('designerStore — commitAnimatable (track-aware routing)', () => {
  it('updates the static value when the property has no track yet', () => {
    designerStore.setCurrentFrame(10);
    designerStore.commitAnimatable('el-1', 'position.x', 999);
    expect(selected().transform.position.x).toBe(999);
    expect(selected().animation).toBeUndefined();
  });

  it('replaces the keyframe value when a keyframe sits on the current frame', () => {
    designerStore.setCurrentFrame(20);
    designerStore.upsertKeyframe('el-1', 'position.x', 20, 200);
    designerStore.commitAnimatable('el-1', 'position.x', 555);
    const el = selected();
    expect(el.transform.position.x).toBe(50); // unchanged static
    const kfs = el.animation?.tracks['position.x']?.keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs?.[0]).toMatchObject({ frame: 20, value: 555 });
  });

  it('inserts a new keyframe at the current frame when the track already has one elsewhere', () => {
    // Author a keyframe at frame 10 first.
    designerStore.setCurrentFrame(10);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    // Move the playhead to frame 30 and edit the property as if dragging.
    designerStore.setCurrentFrame(30);
    designerStore.commitAnimatable('el-1', 'position.x', 777);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs?.map((k) => ({ frame: k.frame, value: k.value }))).toEqual([
      { frame: 10, value: 100 },
      { frame: 30, value: 777 },
    ]);
    // Static must be unchanged once a track exists.
    expect(selected().transform.position.x).toBe(50);
  });

  it('updates static opacity off-track and inserts new opacity keyframe once a track exists', () => {
    designerStore.setCurrentFrame(5);
    designerStore.commitAnimatable('el-1', 'opacity', 0.5);
    expect(selected().opacity).toBe(0.5);

    // First keyframe establishes the track.
    designerStore.upsertKeyframe('el-1', 'opacity', 5, 0.5);
    designerStore.setCurrentFrame(15);
    designerStore.commitAnimatable('el-1', 'opacity', 0.2);
    const kfs = selected().animation?.tracks.opacity?.keyframes;
    expect(kfs?.map((k) => ({ frame: k.frame, value: k.value }))).toEqual([
      { frame: 5, value: 0.5 },
      { frame: 15, value: 0.2 },
    ]);
    expect(selected().opacity).toBe(0.5); // static unchanged
  });
});

describe('designerStore — selectedKeyframe', () => {
  it('setSelectedKeyframe stores the point reference', () => {
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'rotation', frame: 7 });
    expect(designerStore.get().selectedKeyframe).toEqual({
      elementId: 'el-1',
      property: 'rotation',
      frame: 7,
    });
    designerStore.setSelectedKeyframe(null);
    expect(designerStore.get().selectedKeyframe).toBeNull();
  });

  it('moveKeyframe of the selected point follows the new frame', () => {
    designerStore.upsertKeyframe('el-1', 'rotation', 10, 0);
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'rotation', frame: 10 });
    designerStore.moveKeyframe('el-1', 'rotation', 10, 25);
    expect(designerStore.get().selectedKeyframe).toEqual({
      elementId: 'el-1',
      property: 'rotation',
      frame: 25,
    });
  });

  it('removeKeyframe clears the selection when it referenced the removed point', () => {
    designerStore.upsertKeyframe('el-1', 'rotation', 10, 0);
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'rotation', frame: 10 });
    designerStore.removeKeyframe('el-1', 'rotation', 10);
    expect(designerStore.get().selectedKeyframe).toBeNull();
  });

  it('setKeyframeValue / setKeyframeEasing mutate the existing point in place', () => {
    designerStore.upsertKeyframe('el-1', 'scale.x', 12, 1.0);
    designerStore.setKeyframeValue('el-1', 'scale.x', 12, 2.5);
    designerStore.setKeyframeEasing('el-1', 'scale.x', 12, 'ease-in-out');
    const kf = selected().animation?.tracks['scale.x']?.keyframes[0];
    expect(kf).toEqual({ frame: 12, value: 2.5, easing: 'ease-in-out' });
  });
});

describe('D-007 — top-level view routing + new-scene options', () => {
  it('store.view defaults to "landing"', () => {
    expect(designerStore.get().view).toBe('studio'); // after freshSceneWithShape
    designerStore.setScene(null, null);
    expect(designerStore.get().view).toBe('landing');
  });

  it('setScene(scene, path) flips view to "studio"', () => {
    designerStore.setScene(null, null);
    expect(designerStore.get().view).toBe('landing');
    // re-seat a scene via the platform path
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('back', 'custom');
    designerStore.setScene(scene, null);
    expect(designerStore.get().view).toBe('studio');
  });

  it('setView explicitly flips between landing and studio', () => {
    designerStore.setView('landing');
    expect(designerStore.get().view).toBe('landing');
    designerStore.setView('studio');
    expect(designerStore.get().view).toBe('studio');
  });

  it('ProjectStore.newScene honors resolution + frameRate overrides', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('opts', 'custom', {
      resolution: { width: 1280, height: 720 },
      frameRate: 25,
    });
    expect(scene.resolution).toEqual({ width: 1280, height: 720 });
    expect(scene.frameRate).toBe(25);
  });

  it('ProjectStore.newScene without options keeps the v1 defaults', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('defaults', 'custom');
    expect(scene.resolution).toEqual({ width: 1920, height: 1080 });
    expect(scene.frameRate).toBe(50);
  });
});

describe('B-002 — every keyframe on a track keeps its own distinct value', () => {
  it('three position.x keyframes can each hold a different value', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 0, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 500);
    designerStore.upsertKeyframe('el-1', 'position.x', 50, 50);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs?.map((k) => [k.frame, k.value])).toEqual([
      [0, 100],
      [25, 500],
      [50, 50],
    ]);
  });

  it('editing one keyframe does not touch the others (track-aware commit)', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 0, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 25, 500);
    designerStore.upsertKeyframe('el-1', 'position.x', 50, 50);
    // Scrub to frame 25 and re-commit a different value.
    designerStore.setCurrentFrame(25);
    designerStore.commitAnimatable('el-1', 'position.x', 999);
    const kfs = selected().animation?.tracks['position.x']?.keyframes;
    expect(kfs?.map((k) => [k.frame, k.value])).toEqual([
      [0, 100],
      [25, 999],
      [50, 50],
    ]);
  });
});

describe('B-003 — keyframeVariantFor collapses to empty / at-frame', () => {
  it('returns empty when the property has no track', () => {
    expect(keyframeVariantFor(selected(), 'position.x', 10, null)).toBe('empty');
  });

  it('returns empty when the track exists but no keyframe at the current frame', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    expect(keyframeVariantFor(selected(), 'position.x', 0, null)).toBe('empty');
  });

  it('returns at-frame when there IS a keyframe at the current frame', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    expect(keyframeVariantFor(selected(), 'position.x', 10, null)).toBe('at-frame');
  });

  it('ignores selectedKeyframe — selection state never affects the indicator', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 100);
    const sel = { elementId: 'el-1', property: 'position.x' as const, frame: 10 };
    // Selected keyframe at the current frame is still just 'at-frame'
    // (the lane diamond, not the indicator, reflects selection).
    expect(keyframeVariantFor(selected(), 'position.x', 10, sel)).toBe('at-frame');
    // Selected keyframe at a different frame leaves the indicator 'empty'.
    expect(keyframeVariantFor(selected(), 'position.x', 5, sel)).toBe('empty');
  });
});

describe('effectiveTransformAt — Gizmo / drag use interpolated values', () => {
  it('falls back to the static transform when no track exists', () => {
    const t = effectiveTransformAt(selected(), 10);
    expect(t.position).toEqual({ x: 50, y: 60 });
    expect(t.size).toEqual({ w: 320, h: 120 });
  });

  it('interpolates between two position.x keyframes', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 0, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 200);
    const t = effectiveTransformAt(selected(), 5);
    expect(t.position.x).toBe(150);
    // Untouched static fields keep their static value
    expect(t.position.y).toBe(60);
    expect(t.size.w).toBe(320);
  });

  it('clamps to first keyframe before its frame', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 200);
    const t = effectiveTransformAt(selected(), 0);
    expect(t.position.x).toBe(200);
  });

  it('clamps to last keyframe after its frame', () => {
    designerStore.upsertKeyframe('el-1', 'position.x', 0, 100);
    designerStore.upsertKeyframe('el-1', 'position.x', 10, 200);
    const t = effectiveTransformAt(selected(), 999);
    expect(t.position.x).toBe(200);
  });
});

describe('B-002 — single-click vs double-click on a timeline diamond', () => {
  it('setSelectedKeyframe alone does NOT open the keyframe inspector', () => {
    designerStore.upsertKeyframe('el-1', 'opacity', 8, 0.5);
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'opacity', frame: 8 });
    expect(designerStore.get().selectedKeyframe).toEqual({
      elementId: 'el-1',
      property: 'opacity',
      frame: 8,
    });
    expect(designerStore.get().keyframeInspectorOpen).toBe(false);
  });

  it('openKeyframeInspector flips the flag (the double-click path)', () => {
    designerStore.upsertKeyframe('el-1', 'opacity', 8, 0.5);
    designerStore.openKeyframeInspector({
      elementId: 'el-1',
      property: 'opacity',
      frame: 8,
    });
    const s = designerStore.get();
    expect(s.selectedKeyframe).toEqual({ elementId: 'el-1', property: 'opacity', frame: 8 });
    expect(s.keyframeInspectorOpen).toBe(true);
  });

  it('closeKeyframeInspector clears the flag but keeps the selection', () => {
    designerStore.upsertKeyframe('el-1', 'opacity', 8, 0.5);
    designerStore.openKeyframeInspector({
      elementId: 'el-1',
      property: 'opacity',
      frame: 8,
    });
    designerStore.closeKeyframeInspector();
    const s = designerStore.get();
    expect(s.keyframeInspectorOpen).toBe(false);
    expect(s.selectedKeyframe).toEqual({ elementId: 'el-1', property: 'opacity', frame: 8 });
  });

  it('single-clicking another keyframe closes the previously-opened inspector', () => {
    designerStore.upsertKeyframe('el-1', 'opacity', 8, 0.5);
    designerStore.upsertKeyframe('el-1', 'opacity', 20, 0.9);
    designerStore.openKeyframeInspector({
      elementId: 'el-1',
      property: 'opacity',
      frame: 8,
    });
    // Single-click on a DIFFERENT diamond.
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'opacity', frame: 20 });
    expect(designerStore.get().keyframeInspectorOpen).toBe(false);
    expect(designerStore.get().selectedKeyframe?.frame).toBe(20);
  });

  it('re-clicking the same diamond keeps the inspector open if it was open', () => {
    designerStore.upsertKeyframe('el-1', 'opacity', 8, 0.5);
    designerStore.openKeyframeInspector({
      elementId: 'el-1',
      property: 'opacity',
      frame: 8,
    });
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'opacity', frame: 8 });
    expect(designerStore.get().keyframeInspectorOpen).toBe(true);
  });
});
