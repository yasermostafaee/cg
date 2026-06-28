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
  it('setLifecycle clamps the out-point into the active region', () => {
    freshScene();
    const r = activeRangeOf(activeDoc());
    // Request an out-of-bounds out-point.
    designerStore.setLifecycle({ outPoint: r.out + 50 });
    const lc = activeDoc().lifecycle;
    expect(lc).toBeDefined();
    if (lc === undefined) return;
    expect(lc.outPoint).toBeGreaterThanOrEqual(r.in);
    expect(lc.outPoint).toBeLessThanOrEqual(r.out);
  });

  it('the stored lifecycle always satisfies the schema invariant', () => {
    freshScene();
    designerStore.setLifecycle({ outPoint: -10 }); // requested below the active region
    // SceneSchema validates the root + every nested composition's invariant.
    expect(() => SceneSchema.parse(designerStore.get().scene)).not.toThrow();
  });

  it('setLifecycle(null) clears the out-point', () => {
    freshScene();
    designerStore.setLifecycle({ outPoint: 2 });
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

  // D-113 — clearing the out-point must revert an out-point-DEPENDENT mode (auto-out / loop-cycle)
  // to manual, atomically (one undo step), since those modes promise an animated exit with no marker
  // to start from. No change when already manual; no auto-restore when an out-point is re-added.
  it('D-113 — clearing the out-point in auto-out reverts the mode to manual (rest preserved)', () => {
    freshScene();
    designerStore.setLifecycle({ outPoint: 2 });
    designerStore.setPlayout({ mode: 'auto-out', holdMs: 1500 });
    designerStore.setLifecycle(null);
    expect(activeDoc().lifecycle).toBeUndefined();
    expect(activeDoc().playout).toMatchObject({ mode: 'manual', holdMs: 1500 });
  });

  it('D-113 — clearing the out-point in loop-cycle reverts the mode to manual', () => {
    freshScene();
    designerStore.setLifecycle({ outPoint: 2 });
    designerStore.setPlayout({ mode: 'loop-cycle', repeat: 3 });
    designerStore.setLifecycle(null);
    expect(activeDoc().lifecycle).toBeUndefined();
    expect(activeDoc().playout).toMatchObject({ mode: 'manual' });
  });

  it('D-113 — clearing the out-point in manual leaves the playout untouched (no spurious write)', () => {
    freshScene();
    designerStore.setLifecycle({ outPoint: 2 });
    designerStore.setLifecycle(null); // still default manual ⇒ no playout written
    expect(activeDoc().lifecycle).toBeUndefined();
    expect(activeDoc().playout).toBeUndefined();
  });

  it('D-113 — the clear + revert is a SINGLE undo step (restores out-point AND mode together)', () => {
    freshScene();
    designerStore.setLifecycle({ outPoint: 2 });
    designerStore.setPlayout({ mode: 'auto-out' });
    designerStore.markHistoryBoundary();
    designerStore.setLifecycle(null);
    expect(activeDoc().lifecycle).toBeUndefined();
    expect(activeDoc().playout?.mode).toBe('manual');
    // ONE undo restores BOTH the out-point and the auto-out mode (atomic action).
    designerStore.undo();
    expect(activeDoc().lifecycle?.outPoint).toBe(2);
    expect(activeDoc().playout?.mode).toBe('auto-out');
  });
});
