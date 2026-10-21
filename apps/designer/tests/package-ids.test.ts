import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, scopeSceneToComposition } from '../src/renderer/state/store.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';

/**
 * 🔴 `B-352` — a copy gets new ids, or its exports collide with the original's in CG Control. A
 * duplicated composition already has its own composition id; a project saved as a copy takes a new
 * project id, in the open scene AND in its undo history.
 */

afterEach(() => {
  designerStore._reset();
});

function freshProject(): void {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'telavat',
    'lower-third',
  );
  designerStore.setScene(scene, null);
}

const packageIdOf = (compositionId: string): string => {
  const st = designerStore.get();
  return scopeSceneToComposition(st.scene, compositionId)!.id;
};

describe('🔴 B-352 — a copy exports under its own ids', () => {
  it('a duplicated composition exports with an id of its own', () => {
    freshProject();
    const original = designerStore.get().activeCompositionId!;
    const copy = designerStore.duplicateComposition(original)!;
    expect(packageIdOf(copy)).not.toBe(packageIdOf(original));
  });

  it('Save As: the open project takes the copy’s id, and its compositions export under new ids', () => {
    freshProject();
    const comp = designerStore.get().activeCompositionId!;
    const before = packageIdOf(comp);
    designerStore.adoptProjectId('the-copy');
    expect(designerStore.get().scene?.id).toBe('the-copy');
    expect(packageIdOf(comp)).not.toBe(before);
  });

  it('an undo after Save As never brings the original’s id back', () => {
    freshProject();
    designerStore.addElement(defaultShape('s1', 0, 0));
    designerStore.markHistoryBoundary();
    designerStore.addElement(defaultShape('s2', 10, 10));
    designerStore.adoptProjectId('the-copy');
    designerStore.undo();
    expect(designerStore.get().scene?.id).toBe('the-copy');
    designerStore.redo();
    expect(designerStore.get().scene?.id).toBe('the-copy');
  });
});
