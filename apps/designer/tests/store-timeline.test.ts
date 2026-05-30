import { afterEach, describe, expect, it } from 'vitest';
import type { Keyframe } from '@cg/shared-schema';
import { ProjectService } from '../src/main/services/ProjectService.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';

afterEach(() => {
  designerStore._reset();
});

function freshSceneWithShape(): string {
  const projects = new ProjectService({
    recentFilePath: '/tmp/recent.json',
    randomId: () => 'scene-tl',
  });
  const { scene } = projects.newScene('tl', 'lower-third');
  designerStore.setScene(scene, null);
  const el = defaultShape('el-1', 0, 0);
  designerStore.addElement(el);
  return el.id;
}

describe('designerStore — playhead', () => {
  it('setScene initializes playhead to frameRange.in and pauses', () => {
    const projects = new ProjectService({ recentFilePath: '/tmp/r.json', randomId: () => 'x' });
    const { scene } = projects.newScene('x', 'lower-third');
    designerStore.setScene({ ...scene, frameRange: { in: 7, out: 80 } }, null);
    expect(designerStore.get().playhead).toBe(7);
    expect(designerStore.get().playing).toBe(false);
  });

  it('setPlayhead clamps to frameRange', () => {
    freshSceneWithShape();
    designerStore.setPlayhead(-50);
    expect(designerStore.get().playhead).toBe(0);
    designerStore.setPlayhead(9999);
    expect(designerStore.get().playhead).toBe(designerStore.get().scene!.frameRange.out);
  });

  it('setPlayhead rounds to integer frames', () => {
    freshSceneWithShape();
    designerStore.setPlayhead(3.7);
    expect(designerStore.get().playhead).toBe(4);
  });

  it('setPlaying toggles the flag', () => {
    freshSceneWithShape();
    designerStore.setPlaying(true);
    expect(designerStore.get().playing).toBe(true);
    designerStore.setPlaying(false);
    expect(designerStore.get().playing).toBe(false);
  });
});

describe('designerStore — keyframes', () => {
  const kf = (frame: number, value: number): Keyframe => ({ frame, value, easing: 'linear' });

  it('setKeyframe inserts the first keyframe and creates the track', () => {
    const id = freshSceneWithShape();
    designerStore.setKeyframe(id, 'opacity', kf(0, 0));
    const el = designerStore.get().scene!.layers[0]!.children[0]!;
    expect(el.animation?.tracks.opacity?.keyframes).toEqual([kf(0, 0)]);
  });

  it('setKeyframe keeps keyframes frame-ascending', () => {
    const id = freshSceneWithShape();
    designerStore.setKeyframe(id, 'opacity', kf(10, 1));
    designerStore.setKeyframe(id, 'opacity', kf(0, 0));
    designerStore.setKeyframe(id, 'opacity', kf(5, 0.5));
    const frames = designerStore
      .get()
      .scene!.layers[0]!.children[0]!.animation!.tracks.opacity!.keyframes.map((k) => k.frame);
    expect(frames).toEqual([0, 5, 10]);
  });

  it('setKeyframe overwrites at the same frame', () => {
    const id = freshSceneWithShape();
    designerStore.setKeyframe(id, 'opacity', kf(5, 0.2));
    designerStore.setKeyframe(id, 'opacity', kf(5, 0.8));
    const track = designerStore.get().scene!.layers[0]!.children[0]!.animation!.tracks.opacity!;
    expect(track.keyframes).toEqual([kf(5, 0.8)]);
  });

  it('moveKeyframe updates the frame and re-sorts', () => {
    const id = freshSceneWithShape();
    designerStore.setKeyframe(id, 'opacity', kf(0, 0));
    designerStore.setKeyframe(id, 'opacity', kf(10, 1));
    designerStore.moveKeyframe(id, 'opacity', 0, 20);
    const frames = designerStore
      .get()
      .scene!.layers[0]!.children[0]!.animation!.tracks.opacity!.keyframes.map((k) => k.frame);
    expect(frames).toEqual([10, 20]);
  });

  it('moveKeyframe clamps to non-negative frame', () => {
    const id = freshSceneWithShape();
    designerStore.setKeyframe(id, 'opacity', kf(0, 0));
    designerStore.moveKeyframe(id, 'opacity', 0, -10);
    const track = designerStore.get().scene!.layers[0]!.children[0]!.animation!.tracks.opacity!;
    expect(track.keyframes[0]!.frame).toBe(0);
  });

  it('removeKeyframe drops one keyframe', () => {
    const id = freshSceneWithShape();
    designerStore.setKeyframe(id, 'opacity', kf(0, 0));
    designerStore.setKeyframe(id, 'opacity', kf(10, 1));
    designerStore.removeKeyframe(id, 'opacity', 0);
    const track = designerStore.get().scene!.layers[0]!.children[0]!.animation!.tracks.opacity!;
    expect(track.keyframes).toEqual([kf(10, 1)]);
  });

  it('removeKeyframe deletes the track when the last keyframe goes', () => {
    const id = freshSceneWithShape();
    designerStore.setKeyframe(id, 'opacity', kf(0, 0));
    designerStore.removeKeyframe(id, 'opacity', 0);
    const animation = designerStore.get().scene!.layers[0]!.children[0]!.animation;
    expect(animation?.tracks.opacity).toBeUndefined();
  });
});
