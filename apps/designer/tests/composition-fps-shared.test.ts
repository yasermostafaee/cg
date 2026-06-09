import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

afterEach(() => {
  designerStore._reset();
});

function fresh(frameRate?: 25 | 29.97 | 50 | 59.94 | 60): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('fps', 'custom', frameRate ? { frameRate } : {});
  designerStore.setScene(scene, null);
}

/** The fps the inspector/canvas see for whichever composition is active. */
function activeFps(): number {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.frameRate;
}

describe('D-026 — fps is a single shared PROJECT setting', () => {
  it('every composition is projected with the one project fps', () => {
    fresh(25);
    const a = designerStore.addComposition()!;
    const b = designerStore.addComposition()!;

    designerStore.setActiveComposition(a);
    expect(activeFps()).toBe(25);
    designerStore.setActiveComposition(b);
    expect(activeFps()).toBe(25); // same project fps, not a per-comp value

    // Compositions carry no frameRate of their own.
    const comps = designerStore.get().scene!.compositions!;
    for (const c of comps) {
      expect((c as Record<string, unknown>).frameRate).toBeUndefined();
    }
  });

  it('a new composition does not introduce its own fps', () => {
    fresh(60);
    const id = designerStore.addComposition()!;
    const comp = designerStore.get().scene!.compositions!.find((c) => c.id === id)!;
    expect((comp as Record<string, unknown>).frameRate).toBeUndefined();
    designerStore.setActiveComposition(id);
    expect(activeFps()).toBe(60);
  });
});
