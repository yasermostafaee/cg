import { beforeEach, describe, expect, it } from 'vitest';
import { designerStore } from '../src/renderer/state/store.js';
import { isAspectLocked } from '../src/renderer/state/slices/view.js';

/**
 * `B-218` — THE ASPECT LOCK IS PER PLATE (and per arrangement), NOT ONE FLAG.
 *
 * The owner's report: in a two-box look, setting ONE box to FREE changed it for every box — and
 * in the other looks too. `D-155` had made the lock a single session boolean on purpose ("per
 * author, not per plate"); measured the other way round, the shared flag was the invisible
 * state — an author freeing one box could not see that every other box changed with it.
 *
 * These tests pin the store contract every reader goes through (`isAspectLocked`): keyed by
 * the subject, locked by default, independent per key, and never written into the scene.
 */

const KEYS = ['plate-a', 'plate-b', 'plate-in-other-look', 'arrangement-1'] as const;

describe('B-218 — the aspect lock is keyed per subject', () => {
  beforeEach(() => {
    // Session state survives a scene load on purpose, so the keys are re-locked by hand.
    designerStore.setScene(null, null);
    for (const k of KEYS) designerStore.setAspectLock(k, true);
  });

  it('every subject is LOCKED by default — a plate the author never touched needs no entry', () => {
    const s = designerStore.get();
    expect(isAspectLocked(s, 'plate-a')).toBe(true);
    expect(isAspectLocked(s, 'plate-b')).toBe(true);
    expect(isAspectLocked(s, 'arrangement-1')).toBe(true);
    expect(s.aspectLockOff.size).toBe(0);
  });

  it('🔴 freeing ONE plate leaves every other plate (and every arrangement) locked', () => {
    designerStore.setAspectLock('plate-a', false);
    const s = designerStore.get();
    expect(isAspectLocked(s, 'plate-a')).toBe(false);
    expect(isAspectLocked(s, 'plate-b'), 'the second box in the same look').toBe(true);
    expect(isAspectLocked(s, 'plate-in-other-look'), 'a plate in another look').toBe(true);
    expect(isAspectLocked(s, 'arrangement-1'), 'the CELLS fields').toBe(true);
  });

  it('locking a plate back removes only its own entry', () => {
    designerStore.setAspectLock('plate-a', false);
    designerStore.setAspectLock('plate-b', false);
    designerStore.setAspectLock('plate-a', true);
    const s = designerStore.get();
    expect(isAspectLocked(s, 'plate-a')).toBe(true);
    expect(isAspectLocked(s, 'plate-b')).toBe(false);
  });

  it('a no-op write does not churn the set (subscribers are not woken for nothing)', () => {
    const before = designerStore.get().aspectLockOff;
    designerStore.setAspectLock('plate-a', true);
    expect(designerStore.get().aspectLockOff).toBe(before);
    designerStore.setAspectLock('plate-a', false);
    const after = designerStore.get().aspectLockOff;
    designerStore.setAspectLock('plate-a', false);
    expect(designerStore.get().aspectLockOff).toBe(after);
  });

  it('the preference is session state: the scene and the dirty flag are untouched', () => {
    const sceneBefore = designerStore.get().scene;
    designerStore.setAspectLock('plate-a', false);
    designerStore.setAspectLock('arrangement-1', false);
    expect(designerStore.get().scene).toBe(sceneBefore);
    expect(designerStore.get().dirty).toBe(false);
    expect(designerStore.get().canUndo, 'not an undo entry either').toBe(false);
  });
});
