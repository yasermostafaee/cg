import { afterEach, describe, expect, it } from 'vitest';
import { activeRangeOf, SceneSchema, type Composition } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';

afterEach(() => {
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

/** The active document (composition, or the root scene) the store is editing. */
function activeDoc(): Pick<Composition, 'frameRange' | 'activeRange' | 'lifecycle' | 'playout'> {
  const s = designerStore.get();
  const scene = s.scene;
  if (scene === null) throw new Error('no scene');
  const id = s.activeCompositionId;
  const doc = id !== null ? scene.compositions?.find((c) => c.id === id) : scene;
  if (doc === undefined || doc === null) throw new Error('no active doc');
  return doc;
}

describe('designerStore — D-020 lifecycle / playout', () => {
  it('setLifecycle clamps markers into the active region and keeps intro ≤ outro', () => {
    freshScene();
    const r = activeRangeOf(activeDoc());
    // Request out-of-bounds + out-of-order markers.
    designerStore.setLifecycle({ introEndFrame: r.out + 50, outroStartFrame: r.in - 10 });
    const lc = activeDoc().lifecycle;
    expect(lc).toBeDefined();
    if (lc === undefined) return;
    expect(lc.introEndFrame).toBeGreaterThanOrEqual(r.in);
    expect(lc.introEndFrame).toBeLessThanOrEqual(r.out);
    expect(lc.outroStartFrame).toBeGreaterThanOrEqual(lc.introEndFrame);
    expect(lc.outroStartFrame).toBeLessThanOrEqual(r.out);
  });

  it('the stored lifecycle always satisfies the schema invariant', () => {
    freshScene();
    designerStore.setLifecycle({ introEndFrame: 8, outroStartFrame: 3 }); // requested out of order
    // SceneSchema validates the root + every nested composition's invariant.
    expect(() => SceneSchema.parse(designerStore.get().scene)).not.toThrow();
  });

  it('setLifecycle(null) clears the markers', () => {
    freshScene();
    designerStore.setLifecycle({ introEndFrame: 1, outroStartFrame: 2 });
    expect(activeDoc().lifecycle).toBeDefined();
    designerStore.setLifecycle(null);
    expect(activeDoc().lifecycle).toBeUndefined();
  });

  it('setPlayout merges onto the existing config (default manual)', () => {
    freshScene();
    expect(activeDoc().playout).toBeUndefined();
    designerStore.setPlayout({ mode: 'auto-out', holdMs: 1500 });
    expect(activeDoc().playout).toMatchObject({ mode: 'auto-out', holdMs: 1500 });
    // A partial patch keeps the prior mode.
    designerStore.setPlayout({ holdMs: 2000 });
    expect(activeDoc().playout).toMatchObject({ mode: 'auto-out', holdMs: 2000 });
  });
});
