import { afterEach, describe, expect, it } from 'vitest';
import { activeRangeOf, playoutOf, SceneSchema, type Composition } from '@cg/shared-schema';
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

  // D-114 (revises D-113) — clearing the out-point makes the composition `static` (no marker ⇒ no
  // animated exit). The out-point-DEPENDENT modes (auto-out / loop-cycle) are rewritten to `static`
  // atomically (one undo step); a manual/absent composition is left untouched (it already resolves to
  // `static` with no out-point). The invariant is ONE-DIRECTIONAL: re-adding an out-point does not
  // auto-restore the prior mode.
  it('D-114 — clearing the out-point in auto-out reverts the mode to static (rest preserved)', () => {
    freshScene();
    designerStore.setLifecycle({ outPoint: 2 });
    designerStore.setPlayout({ mode: 'auto-out', holdMs: 1500 });
    designerStore.setLifecycle(null);
    expect(activeDoc().lifecycle).toBeUndefined();
    expect(activeDoc().playout).toMatchObject({ mode: 'static', holdMs: 1500 });
  });

  it('D-114 — clearing the out-point in loop-cycle reverts the mode to static', () => {
    freshScene();
    designerStore.setLifecycle({ outPoint: 2 });
    designerStore.setPlayout({ mode: 'loop-cycle', repeat: 3 });
    designerStore.setLifecycle(null);
    expect(activeDoc().lifecycle).toBeUndefined();
    expect(activeDoc().playout).toMatchObject({ mode: 'static' });
  });

  it('D-114 — clearing the out-point in manual leaves the playout untouched (resolves to static)', () => {
    freshScene();
    designerStore.setLifecycle({ outPoint: 2 });
    designerStore.setLifecycle(null); // default manual + no out-point resolves to static, no write
    expect(activeDoc().lifecycle).toBeUndefined();
    expect(activeDoc().playout).toBeUndefined();
    // playoutOf resolves the effective mode to `static` (no out-point + default).
    expect(playoutOf(activeDoc()).mode).toBe('static');
  });

  it('D-114 — the clear + revert is a SINGLE undo step (restores out-point AND mode together)', () => {
    freshScene();
    designerStore.setLifecycle({ outPoint: 2 });
    designerStore.setPlayout({ mode: 'auto-out' });
    designerStore.markHistoryBoundary();
    designerStore.setLifecycle(null);
    expect(activeDoc().lifecycle).toBeUndefined();
    expect(activeDoc().playout?.mode).toBe('static');
    // ONE undo restores BOTH the out-point and the auto-out mode (atomic action).
    designerStore.undo();
    expect(activeDoc().lifecycle?.outPoint).toBe(2);
    expect(activeDoc().playout?.mode).toBe('auto-out');
  });
});
