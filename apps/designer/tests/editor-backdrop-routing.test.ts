import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * B-133 — the editor backdrop control wrote to a field nobody rendered.
 *
 * `updateScene`'s `docKeys` is a set of STRING literals that decides whether a patch
 * lands on the ACTIVE COMPOSITION or on the scene ROOT. B-129 renamed
 * `background` -> `editorBackdrop` across the schema, the renderer, the runtime and
 * both exporters — and this table kept the old spelling.
 *
 * The consequence was silent and total. Every new project lands INSIDE a composition
 * (`newScene` seeds `comp1`), so `editorBackdrop` fell through to the ROOT patch and
 * was written to `scene.editorBackdrop`, while the canvas renders `editSceneOf`, which
 * reads the ACTIVE COMPOSITION's `editorBackdrop`. Written to one place, read from
 * another: changing the backdrop did nothing at all, which is what was reported.
 */

afterEach(() => {
  designerStore._reset();
});

function fresh(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('backdrop', 'lower-third');
  designerStore.setScene(scene, null);
}

/** Exactly what the canvas iframe is handed. */
function rendered(): string {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.editorBackdrop;
}

describe('B-133 — the backdrop patch reaches the document that renders it', () => {
  it('a fresh project is editing a COMPOSITION — the premise the bug turned on', () => {
    fresh();
    expect(designerStore.get().activeCompositionId).not.toBeNull();
  });

  it('writes to the active composition, so the canvas actually changes', () => {
    fresh();
    const compId = designerStore.get().activeCompositionId;

    designerStore.updateScene({ editorBackdrop: '#123456' });

    const comp = designerStore.get().scene!.compositions?.find((c) => c.id === compId);
    expect(comp?.editorBackdrop).toBe('#123456');
    expect(rendered()).toBe('#123456');
  });

  it('still writes the ROOT when the scene root is the active document', () => {
    fresh();
    designerStore.setActiveComposition(null);

    designerStore.updateScene({ editorBackdrop: '#abcdef' });

    // No `rendered()` assertion here on purpose: with no composition active the editor
    // shows the "No Active Compositions" empty state and `editSceneOf` is `null` by
    // design, so there is no canvas projection to compare against. The routing is what
    // this leg pins — the root patch still lands on the root.
    expect(designerStore.get().scene?.editorBackdrop).toBe('#abcdef');
    expect(editSceneOf(designerStore.get().scene, null)).toBeNull();
  });

  it('round-trips back to transparent', () => {
    fresh();
    designerStore.updateScene({ editorBackdrop: '#ff0000' });
    expect(rendered()).toBe('#ff0000');

    designerStore.updateScene({ editorBackdrop: 'transparent' });
    expect(rendered()).toBe('transparent');
  });

  it('each composition keeps its own backdrop', () => {
    fresh();
    const a = designerStore.get().activeCompositionId!;
    const b = designerStore.addComposition()!;

    designerStore.setActiveComposition(a);
    designerStore.updateScene({ editorBackdrop: '#111111' });
    designerStore.setActiveComposition(b);
    designerStore.updateScene({ editorBackdrop: '#222222' });

    designerStore.setActiveComposition(a);
    expect(rendered()).toBe('#111111');
    designerStore.setActiveComposition(b);
    expect(rendered()).toBe('#222222');
  });
});
