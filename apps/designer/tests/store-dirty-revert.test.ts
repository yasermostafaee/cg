/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layer, Scene } from '@cg/shared-schema';
import { designerStore } from '../src/renderer/state/store.js';
import { set } from '../src/renderer/state/store-core.js';
import { hashScene } from '../src/renderer/state/scene-hash.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';

/**
 * D-088 — dirty must clear on edit-then-revert to byte-identical content, where the revert
 * is a FORWARD op (add a shape, then delete it) — NOT Ctrl-Z. This clears via the content
 * HASH (distinct from the undo-to-saved test in store-dirty.test.ts, which clears via object
 * identity). The fix has two parts: the canonical hash treats an absent optional array == []
 * (so `removeElement`'s materialized `fields:[]`/`bindings:[]` don't count), and
 * `removeElement` prunes the untouched scaffold layer `addElement` auto-created.
 */

/** A fresh empty project (one composition, no layers) — like ProjectStore.newScene. */
function newProjectScene(): Scene {
  return {
    schemaVersion: 1,
    id: 'p1',
    name: 'Untitled',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [
      {
        id: 'comp1',
        name: 'comp1',
        resolution: { width: 1920, height: 1080 },
        frameRange: { in: 0, out: 50 },
        background: 'transparent',
        layers: [],
      },
    ],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  } as Scene;
}

function layer(over: Partial<Layer>): Layer {
  return {
    id: 'L1',
    name: 'Layer 1',
    visible: true,
    locked: false,
    blendMode: 'normal',
    children: [],
    ...over,
  } as Layer;
}

/** The active composition's layers (the doc the slice mutations operate on). */
function activeLayers(): readonly Layer[] {
  const st = designerStore.get();
  const scene = st.scene as Scene;
  const comp = (scene.compositions ?? []).find((c) => c.id === st.activeCompositionId);
  return (comp ? comp.layers : scene.layers) as readonly Layer[];
}

/** Load a one-composition scene whose comp holds `layers`, opened as the active doc. */
function loadWithLayers(layers: Layer[]): void {
  const scene = newProjectScene();
  scene.compositions![0].layers = layers;
  designerStore.setScene(scene, null);
}

beforeEach(() => designerStore._reset());
afterEach(() => vi.useRealTimers());

describe('D-088 dirty clears on add → delete revert (content hash)', () => {
  it('empty comp → save → add shape → delete ⇒ clean AND hash matches the saved scene', () => {
    designerStore.setScene(newProjectScene(), null);
    designerStore.markSaved();
    const savedHash = hashScene(designerStore.get().scene as Scene);

    designerStore.addElement(defaultShape('shape1', 100, 100));
    designerStore.markHistoryBoundary();
    expect(designerStore.get().dirty).toBe(true); // mid-edit: genuinely dirty

    designerStore.removeElement('shape1');
    designerStore.markHistoryBoundary();

    expect(hashScene(designerStore.get().scene as Scene)).toBe(savedHash);
    expect(designerStore.get().dirty).toBe(false);
    // The scaffold layer is gone — no orphaned empty "Layer 1" lingers.
    expect(activeLayers()).toHaveLength(0);
  });

  it('GUARD: a customized (renamed) layer that is emptied is NOT pruned', () => {
    // Same default props + scaffold-shaped id, but RENAMED — so it is not a scaffold.
    loadWithLayers([
      layer({ id: 'L123', name: 'Background', children: [defaultShape('s1', 0, 0)] }),
    ]);
    designerStore.removeElement('s1');
    const layers = activeLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0]?.name).toBe('Background');
    expect(layers[0]?.children).toHaveLength(0);
  });

  it('GUARD: emptying one (scaffold) layer leaves the other layers intact', () => {
    loadWithLayers([
      layer({ id: 'L1', name: 'Layer 1', children: [defaultShape('a', 0, 0)] }), // scaffold
      layer({ id: 'keep', name: 'Other', children: [defaultShape('b', 10, 10)] }), // user layer
    ]);
    designerStore.removeElement('a'); // empties the scaffold → pruned
    const layers = activeLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0]?.name).toBe('Other');
    expect(layers[0]?.children.map((e) => e.id)).toEqual(['b']);
  });

  it('delete + scaffold-prune is ONE atomic undo step (undo restores shape+layer in one), and redo re-prunes', () => {
    designerStore.setScene(newProjectScene(), null);
    designerStore.markSaved();

    designerStore.addElement(defaultShape('shape1', 100, 100));
    designerStore.markHistoryBoundary();
    const preDeleteDirty = designerStore.get().dirty; // true (mid-edit)

    designerStore.removeElement('shape1'); // deletes the shape AND prunes the scaffold layer
    designerStore.markHistoryBoundary();
    expect(activeLayers()).toHaveLength(0); // scaffold gone
    expect(designerStore.get().dirty).toBe(false); // reverted to saved content

    // ONE undo reverses the WHOLE atomic delete: the shape is back INSIDE its layer (not an
    // intermediate "empty layer, no shape" — that would mean the prune was a separate step).
    designerStore.undo();
    const undone = activeLayers();
    expect(undone).toHaveLength(1);
    expect(undone[0]?.children.map((e) => e.id)).toEqual(['shape1']);
    expect(designerStore.get().dirty).toBe(preDeleteDirty); // matches pre-delete (true)

    // REDO once returns to the pruned-empty state, clean again (content == saved).
    designerStore.redo();
    expect(activeLayers()).toHaveLength(0);
    expect(designerStore.get().dirty).toBe(false);
  });

  it('a manual revert clears dirty after the settle debounce — no boundary / further interaction', async () => {
    vi.useFakeTimers();
    designerStore.setScene(newProjectScene(), null);
    designerStore.markSaved();
    const saved = designerStore.get().scene as Scene;

    // Bare scene edits with NO markHistoryBoundary — mimics an inspector commit (keyboard/
    // blur) that produces no canvas pointerup.
    set({ scene: { ...saved, name: 'Edited' } });
    expect(designerStore.get().dirty).toBe(true);
    set({ scene: { ...saved } }); // revert: fresh object, content identical to the saved scene
    expect(designerStore.get().dirty).toBe(true); // optimistic, not yet reconciled

    await vi.advanceTimersByTimeAsync(80); // the settle debounce fires — no click/boundary
    expect(designerStore.get().dirty).toBe(false);
  });
});
