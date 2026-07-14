import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';

/**
 * D-127 — `renameProject` sets the scene-ROOT name.
 *
 * The trap this exists to avoid: `'name'` is one of `updateScene`'s `docKeys`, so
 * `updateScene({ name })` with a composition active renames the COMPOSITION, not the
 * project. `renameProject` targets the root unconditionally, through the normal `set()`
 * path — so it also marks the document dirty and makes exactly one undo entry.
 */

afterEach(() => {
  designerStore._reset();
});

function fresh(name = 'Original'): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene(name, 'custom');
  designerStore.setScene(scene, null);
}

const sceneName = (): string => designerStore.get().scene!.name;
const compNames = (): string[] =>
  (designerStore.get().scene!.compositions ?? []).map((c) => c.name);

describe('D-127 — renameProject', () => {
  it('renames the PROJECT (scene root), not the active composition', () => {
    fresh('Original');
    const comps = designerStore.get().scene!.compositions ?? [];
    const active = designerStore.get().activeCompositionId;
    expect(active).not.toBeNull(); // a new project opens on its first composition
    const before = compNames();
    expect(comps.length).toBeGreaterThan(0);

    designerStore.renameProject('Renamed');

    expect(sceneName()).toBe('Renamed');
    // The active composition's own name is untouched — the `updateScene` docKeys trap.
    expect(compNames()).toEqual(before);
  });

  it('trims the committed name', () => {
    fresh('Original');
    designerStore.renameProject('  Spaced Out  ');
    expect(sceneName()).toBe('Spaced Out');
  });

  it('rejects an empty / whitespace-only name (previous name kept, no undo entry)', () => {
    fresh('Original');
    designerStore.markSaved();

    designerStore.renameProject('');
    designerStore.renameProject('   ');
    designerStore.renameProject('\t\n ');

    expect(sceneName()).toBe('Original');
    expect(designerStore.get().canUndo).toBe(false);
    expect(designerStore.get().dirty).toBe(false);
  });

  it('a no-op rename to the same name writes nothing', () => {
    fresh('Original');
    designerStore.markSaved();
    designerStore.renameProject('Original');
    expect(designerStore.get().canUndo).toBe(false);
    expect(designerStore.get().dirty).toBe(false);
  });

  it('marks the document dirty (scene.name is in the content hash)', () => {
    fresh('Original');
    designerStore.markSaved();
    expect(designerStore.get().dirty).toBe(false);

    designerStore.renameProject('Renamed');
    designerStore.markHistoryBoundary(); // authoritative content-hash reconcile

    expect(designerStore.get().dirty).toBe(true);
  });

  it('is ONE undo entry — a single undo restores the previous name', () => {
    fresh('Original');
    expect(designerStore.get().canUndo).toBe(false);

    designerStore.renameProject('Renamed');
    expect(sceneName()).toBe('Renamed');
    expect(designerStore.get().canUndo).toBe(true);

    designerStore.undo();
    expect(sceneName()).toBe('Original');
    expect(designerStore.get().canUndo).toBe(false); // exactly one entry was pushed

    designerStore.redo();
    expect(sceneName()).toBe('Renamed');
  });

  it('is a no-op with no project open', () => {
    designerStore.renameProject('Whatever');
    expect(designerStore.get().scene).toBeNull();
  });
});
