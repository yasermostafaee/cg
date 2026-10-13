import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activeRangeOf } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('active-region-test', 'custom');
  designerStore.setScene(scene, null);
}

// The editing surface is the open composition (size / duration / layers).
function scene() {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId);
  if (doc === null) throw new Error('no active composition');
  return doc;
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

describe('session V — shrinking the active window RE-CLAMPS the lifecycle (the invariant has ONE rule)', () => {
  // Found by instrumentation: `setLifecycle` clamps itself into the active range, but the
  // two mutations that SHRINK that range never re-clamped the lifecycle — a stranded
  // `outPoint` past `activeRange.out` violates `refineLifecycle`, so the scene STOPS
  // PARSING (a save of it cannot be re-loaded), and the follow window's outSpan clamps
  // to 0 silently. One rule, one place: every writer that can move the active window
  // keeps `activeRange.in ≤ contentStart ≤ outPoint ≤ activeRange.out` true.

  it('setSceneDurationFrames (shrink) pulls a now-outside outPoint to the new active end — and the scene still parses', async () => {
    const { SceneSchema } = await import('@cg/shared-schema');
    designerStore.setLifecycle({ outPoint: 40 });
    designerStore.setSceneDurationFrames(30);
    expect(scene().lifecycle?.outPoint).toBe(30);
    expect(SceneSchema.safeParse(designerStore.get().scene).success).toBe(true);
  });

  it('setSceneActiveOut (bar drag) does the same', async () => {
    const { SceneSchema } = await import('@cg/shared-schema');
    designerStore.setLifecycle({ outPoint: 40 });
    designerStore.setSceneActiveOut(25);
    expect(scene().lifecycle?.outPoint).toBe(25);
    expect(SceneSchema.safeParse(designerStore.get().scene).success).toBe(true);
  });

  it('the contentStart marker rides the same clamp (in ≤ contentStart ≤ outPoint)', () => {
    designerStore.setLifecycle({ outPoint: 40 });
    designerStore.setContentStart(35);
    designerStore.setSceneDurationFrames(30);
    const lc = scene().lifecycle!;
    expect(lc.outPoint).toBe(30);
    expect(lc.contentStart).toBe(30);
  });

  it('a shrink that never crosses the lifecycle leaves it byte-identical', () => {
    designerStore.setLifecycle({ outPoint: 20 });
    const before = scene().lifecycle;
    designerStore.setSceneDurationFrames(40);
    expect(scene().lifecycle).toBe(before);
  });
});
