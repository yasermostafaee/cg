import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, ShapeElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';

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

describe('designerStore — commitAnimatable', () => {
  it('updates the static value when there is no keyframe at the current frame', () => {
    designerStore.setCurrentFrame(10);
    designerStore.commitAnimatable('el-1', 'position.x', 999);
    expect(selected().transform.position.x).toBe(999);
    expect(selected().animation).toBeUndefined();
  });

  it('updates the keyframe value (not the static) when a keyframe sits on the current frame', () => {
    designerStore.setCurrentFrame(20);
    designerStore.upsertKeyframe('el-1', 'position.x', 20, 200);
    designerStore.commitAnimatable('el-1', 'position.x', 555);
    const el = selected();
    expect(el.transform.position.x).toBe(50); // unchanged static
    const kf = el.animation?.tracks['position.x']?.keyframes[0];
    expect(kf?.value).toBe(555);
    expect(kf?.frame).toBe(20);
  });

  it('updates static opacity off-keyframe and keyframe opacity on-keyframe', () => {
    designerStore.setCurrentFrame(5);
    designerStore.commitAnimatable('el-1', 'opacity', 0.5);
    expect(selected().opacity).toBe(0.5);

    designerStore.upsertKeyframe('el-1', 'opacity', 5, 0.5);
    designerStore.commitAnimatable('el-1', 'opacity', 0.2);
    const kf = selected().animation?.tracks.opacity?.keyframes[0];
    expect(kf?.value).toBe(0.2);
    expect(selected().opacity).toBe(0.5); // static unchanged
  });
});
