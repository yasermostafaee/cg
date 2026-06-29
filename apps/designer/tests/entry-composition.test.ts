import { afterEach, describe, expect, it } from 'vitest';
import { SceneSchema, type Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { ensureCompositions } from '../src/renderer/state/scene-doc.js';

afterEach(() => {
  designerStore._reset();
});

/** A fresh project + two compositions `a`, `b` (in list order); returns their ids. */
function setupTwoComps(): { a: string; b: string; scene: Scene } {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('entry', 'custom');
  designerStore.setScene(scene, null);
  const a = designerStore.addComposition()!;
  const b = designerStore.addComposition()!;
  return { a, b, scene: designerStore.get().scene as Scene };
}

describe('D-115 — designate the main / entry composition', () => {
  it('setEntryComposition persists the designation; an unknown id is a no-op; null clears it', () => {
    const { b } = setupTwoComps();
    designerStore.setEntryComposition(b);
    expect(designerStore.get().scene?.entryCompositionId).toBe(b);
    designerStore.setEntryComposition('does-not-exist'); // unknown ⇒ no-op
    expect(designerStore.get().scene?.entryCompositionId).toBe(b);
    designerStore.setEntryComposition(null); // clear ⇒ fall back to default
    expect(designerStore.get().scene?.entryCompositionId).toBeUndefined();
  });

  it('deleting the MAIN composition clears the designation; deleting another leaves it', () => {
    const { a, b } = setupTwoComps();
    const c = designerStore.addComposition()!;
    designerStore.setEntryComposition(b);
    designerStore.deleteComposition(c); // a NON-main comp
    expect(designerStore.get().scene?.entryCompositionId).toBe(b); // intact
    expect(a).not.toBe(b);
    designerStore.deleteComposition(b); // the main comp
    expect(designerStore.get().scene?.entryCompositionId).toBeUndefined(); // cleared
  });

  it('ensureCompositions opens the designated main; falls back to the first when absent or stale', () => {
    const { b, scene } = setupTwoComps();
    const first = scene.compositions![0]!.id; // the list-order default; `b` is a LATER comp
    expect(b).not.toBe(first);
    // No designation ⇒ the first composition (the prior default — no regression).
    expect(ensureCompositions(scene).activeId).toBe(first);
    // Designated + valid ⇒ that composition, regardless of list order.
    expect(ensureCompositions({ ...scene, entryCompositionId: b }).activeId).toBe(b);
    // Stale id ⇒ the first composition (graceful fallback).
    expect(ensureCompositions({ ...scene, entryCompositionId: 'gone' }).activeId).toBe(first);
  });

  it('the designation round-trips through SceneSchema (saved / reloaded / exported)', () => {
    const { b, scene } = setupTwoComps();
    const designated = SceneSchema.parse({ ...scene, entryCompositionId: b });
    const reloaded = SceneSchema.parse(JSON.parse(JSON.stringify(designated)));
    expect(reloaded.entryCompositionId).toBe(b);
    // Absent round-trips as absent (not coerced) — backward compatible.
    const plain = SceneSchema.parse(JSON.parse(JSON.stringify(scene)));
    expect(plain.entryCompositionId).toBeUndefined();
  });
});
