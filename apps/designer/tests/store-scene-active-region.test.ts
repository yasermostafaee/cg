import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activeRangeOf } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('active-region-test', 'custom');
  designerStore.setScene(scene, null);
}

function scene() {
  const s = designerStore.get().scene;
  if (s === null) throw new Error('no scene');
  return s;
}

beforeEach(() => {
  freshScene();
});

afterEach(() => {
  designerStore._reset();
});

describe('designerStore — scene active region', () => {
  it('defaults to the full frameRange when activeRange is unset', () => {
    expect(scene().frameRange).toEqual({ in: 0, out: 50 });
    expect(scene().activeRange).toBeUndefined();
    // The resolver treats an absent activeRange as the full scene.
    expect(activeRangeOf(scene())).toEqual({ in: 0, out: 50 });
  });

  it('setSceneActiveOut narrows the active region without touching the total', () => {
    designerStore.setSceneActiveOut(20);
    expect(scene().activeRange).toEqual({ in: 0, out: 20 });
    // Total (ruler) is preserved — the remaining frames stay.
    expect(scene().frameRange).toEqual({ in: 0, out: 50 });
  });

  it('clamps the active out-point to [in + 1, frameRange.out]', () => {
    designerStore.setSceneActiveOut(0); // below in + 1
    expect(scene().activeRange?.out).toBe(1);
    designerStore.setSceneActiveOut(999); // beyond the total
    expect(scene().activeRange?.out).toBe(50);
  });

  it('rounds a fractional drag position to the nearest frame', () => {
    designerStore.setSceneActiveOut(19.4);
    expect(scene().activeRange?.out).toBe(19);
    designerStore.setSceneActiveOut(19.6);
    expect(scene().activeRange?.out).toBe(20);
  });

  it('shrinking the total via setSceneDurationFrames clamps the active region in', () => {
    designerStore.setSceneActiveOut(40);
    designerStore.setSceneDurationFrames(30); // total -> [0, 30]
    expect(scene().frameRange).toEqual({ in: 0, out: 30 });
    expect(scene().activeRange).toEqual({ in: 0, out: 30 });
  });

  it('growing the total via setSceneDurationFrames leaves the active region intact', () => {
    designerStore.setSceneActiveOut(20);
    designerStore.setSceneDurationFrames(80); // total -> [0, 80]
    expect(scene().frameRange).toEqual({ in: 0, out: 80 });
    expect(scene().activeRange).toEqual({ in: 0, out: 20 });
  });

  it('keeps the full scene scrubbable past the active out-point', () => {
    designerStore.setSceneActiveOut(20);
    // The playhead can still reach the trailing frames for inspection.
    designerStore.setCurrentFrame(42);
    expect(designerStore.get().currentFrame).toBe(42);
  });
});
