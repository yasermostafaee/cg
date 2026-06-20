import { beforeEach, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import {
  _resetCore,
  getState,
  markHistoryBoundary,
  markSaved,
  set,
  setSavedBaseline,
  undo,
} from '../src/renderer/state/store-core.js';

/**
 * D-088 — dirty is the document content hash. `set()` is optimistic (identity); the
 * authoritative content reconcile runs on a history boundary and in `markSaved`. Covers:
 * edit ⇒ dirty; edit-then-revert ⇒ clean; undo-to-saved ⇒ clean; save ⇒ clean;
 * updatedAt-only ⇒ clean.
 */

function scene(name = 'Demo'): Scene {
  return {
    schemaVersion: 1,
    id: 'p1',
    name,
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  } as Scene;
}

/** Mirror documentSlice.setScene's baseline+load for a loaded project. */
function load(s: Scene): void {
  setSavedBaseline(s);
  set({ scene: s });
}

beforeEach(() => _resetCore());

describe('dirty signal (D-088)', () => {
  it('a freshly loaded project is clean', () => {
    load(scene());
    expect(getState().dirty).toBe(false);
  });

  it('editing the document makes it dirty', () => {
    load(scene());
    set({ scene: { ...scene(), name: 'Edited' } });
    expect(getState().dirty).toBe(true);
  });

  it('a non-scene patch does not change dirty', () => {
    load(scene());
    set({ selection: new Set(['x']) });
    expect(getState().dirty).toBe(false);
  });

  it('editing then reverting to identical content is clean again (after a boundary)', () => {
    load(scene());
    set({ scene: { ...scene(), name: 'Edited' } });
    expect(getState().dirty).toBe(true);
    set({ scene: { ...scene() } }); // a NEW object with the original content
    expect(getState().dirty).toBe(true); // optimistic (identity differs)
    markHistoryBoundary(); // authoritative reconcile by content hash
    expect(getState().dirty).toBe(false);
  });

  it('undoing back to the saved state is clean', () => {
    load(scene());
    set({ scene: { ...scene(), name: 'Edited' } });
    expect(getState().dirty).toBe(true);
    undo();
    expect(getState().dirty).toBe(false);
  });

  it('markSaved clears dirty and rebaselines', () => {
    load(scene());
    set({ scene: { ...scene(), name: 'Edited' } });
    markSaved();
    expect(getState().dirty).toBe(false);
    // A further edit is dirty again against the new baseline.
    set({ scene: { ...scene(), name: 'Edited again' } });
    expect(getState().dirty).toBe(true);
  });

  it('a metadata.updatedAt-only change reconciles to clean', () => {
    load(scene());
    set({
      scene: {
        ...scene(),
        metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2099-12-31T00:00:00.000Z' },
      },
    });
    markHistoryBoundary();
    expect(getState().dirty).toBe(false);
  });
});
