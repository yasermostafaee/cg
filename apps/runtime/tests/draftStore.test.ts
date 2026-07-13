import { afterEach, describe, expect, it } from 'vitest';
import type { FieldValues, ListItem } from '@cg/shared-schema';
import {
  __resetDraftsForTest,
  buildApplyPayload,
  clearDraft,
  clearStagedMatching,
  effectiveValue,
  hasStaged,
  isFieldDirty,
  isItemDirty,
  pruneDrafts,
  snapshotDraft,
  stageField,
  stagedValue,
} from '../src/renderer/features/inspector/draftStore.js';

/**
 * R-003 — the per-item draft overlay. These prove the staging contract: edits
 * stay local, an incoming push never clobbers a draft, dirty is honest, and one
 * apply builds the complete field-set. Nothing here touches the bridge.
 */

afterEach(() => {
  __resetDraftsForTest();
});

const A = 'item-a';
const B = 'item-b';

describe('staging + effective value', () => {
  it('stages a field and reads it back; effectiveValue prefers the draft', () => {
    stageField(A, ['title'], 'draft');
    expect(hasStaged(A, ['title'])).toBe(true);
    expect(stagedValue(A, ['title'])).toBe('draft');
    expect(effectiveValue(A, ['title'], 'applied')).toBe('draft');
  });

  it('effectiveValue falls back to applied for un-staged fields', () => {
    expect(hasStaged(A, ['title'])).toBe(false);
    expect(effectiveValue(A, ['title'], 'applied')).toBe('applied');
  });

  it('overwriting a staged field keeps the latest draft', () => {
    stageField(A, ['title'], 'one');
    stageField(A, ['title'], 'two');
    expect(stagedValue(A, ['title'])).toBe('two');
  });
});

describe('dirty is honest (staged AND different from applied)', () => {
  it('a draft equal to the applied value is NOT dirty', () => {
    stageField(A, ['title'], 'same');
    expect(isFieldDirty(A, ['title'], 'same')).toBe(false);
    expect(isItemDirty(A, { title: 'same' })).toBe(false);
  });

  it('a draft differing from applied is dirty', () => {
    stageField(A, ['title'], 'new');
    expect(isFieldDirty(A, ['title'], 'old')).toBe(true);
    expect(isItemDirty(A, { title: 'old' })).toBe(true);
  });

  it('compares structured list values by structure, not identity', () => {
    const applied: ListItem[] = [{ id: 'i1', text: 'a' }];
    stageField(A, ['_ticker'], [{ id: 'i1', text: 'a' }]);
    // Same structure → not dirty even though it's a different array instance.
    expect(isFieldDirty(A, ['_ticker'], applied)).toBe(false);
    stageField(A, ['_ticker'], [{ id: 'i1', text: 'b' }]);
    expect(isFieldDirty(A, ['_ticker'], applied)).toBe(true);
  });
});

describe('a state push never clobbers a draft, and clears the marker on convergence', () => {
  it('keeps the draft value when applied changes underneath (no clobber)', () => {
    stageField(A, ['title'], 'my draft');
    // A push arrives with a new applied value:
    expect(effectiveValue(A, ['title'], 'pushed applied')).toBe('my draft');
    expect(hasStaged(A, ['title'])).toBe(true);
  });

  it('a push whose applied value equals the draft clears the DIRTY marker (draft entry lingers until apply/discard)', () => {
    stageField(A, ['title'], 'converged');
    // Before the push, applied differs → dirty.
    expect(isFieldDirty(A, ['title'], 'old')).toBe(true);
    // Push makes applied == draft → no longer dirty, but the draft still exists.
    expect(isFieldDirty(A, ['title'], 'converged')).toBe(false);
    expect(hasStaged(A, ['title'])).toBe(true);
  });
});

describe('discard + prune', () => {
  it('clearDraft drops the whole item draft', () => {
    stageField(A, ['title'], 'x');
    stageField(A, ['body'], 'y');
    clearDraft(A);
    expect(hasStaged(A, ['title'])).toBe(false);
    expect(hasStaged(A, ['body'])).toBe(false);
  });

  it('pruneDrafts drops drafts of items no longer on the stack', () => {
    stageField(A, ['title'], 'x');
    stageField(B, ['title'], 'y');
    pruneDrafts([B]); // A was removed
    expect(hasStaged(A, ['title'])).toBe(false);
    expect(hasStaged(B, ['title'])).toBe(true);
  });
});

describe('buildApplyPayload — the one atomic update', () => {
  it('overlays every staged draft on the applied field-set', () => {
    const applied: FieldValues = { title: 'old', body: 'keep', count: 1 };
    stageField(A, ['title'], 'new');
    stageField(A, ['count'], 2);
    expect(buildApplyPayload(A, applied)).toEqual({ title: 'new', body: 'keep', count: 2 });
  });

  it('returns a copy of the applied set when nothing is staged (B-048 workaround)', () => {
    const applied: FieldValues = { title: 'v' };
    const payload = buildApplyPayload(A, applied);
    expect(payload).toEqual(applied);
    expect(payload).not.toBe(applied);
  });

  it('carries a structured list draft intact', () => {
    const applied: FieldValues = { _ticker: [{ id: 'i1', text: 'a' }] };
    stageField(
      A,
      ['_ticker'],
      [
        { id: 'i1', text: 'a' },
        { id: 'i2', text: 'b\nc' },
      ],
    );
    const payload = buildApplyPayload(A, applied);
    expect(payload['_ticker']).toEqual([
      { id: 'i1', text: 'a' },
      { id: 'i2', text: 'b\nc' },
    ]);
  });
});

describe('drafts are per item', () => {
  it('staging on one item never affects another', () => {
    stageField(A, ['title'], 'a-draft');
    expect(hasStaged(B, ['title'])).toBe(false);
    expect(isItemDirty(B, { title: 'anything' })).toBe(false);
  });
});

describe('clearStagedMatching — an apply only clears what it sent (no in-flight loss)', () => {
  it('clears fields whose value equals the sent snapshot', () => {
    stageField(A, ['title'], 'sent');
    const sent = snapshotDraft(A);
    clearStagedMatching(A, sent);
    expect(hasStaged(A, ['title'])).toBe(false);
  });

  it('keeps a field staged AFTER the snapshot (typed during the in-flight round-trip)', () => {
    stageField(A, ['title'], 'sent');
    const sent = snapshotDraft(A); // apply captures only { title }
    // Operator edits a second field while the update is in flight:
    stageField(A, ['body'], 'typed later');
    clearStagedMatching(A, sent);
    expect(hasStaged(A, ['title'])).toBe(false); // sent → cleared
    expect(stagedValue(A, ['body'])).toBe('typed later'); // never sent → survives
  });

  it('keeps a field RE-EDITED to a newer value during the round-trip', () => {
    stageField(A, ['title'], 'sent');
    const sent = snapshotDraft(A);
    stageField(A, ['title'], 'newer'); // re-edited before the ack
    clearStagedMatching(A, sent);
    // The newer edit differs from the sent snapshot → it must survive.
    expect(stagedValue(A, ['title'])).toBe('newer');
  });

  it('snapshotDraft is a copy — later staging does not mutate it', () => {
    stageField(A, ['title'], 'one');
    const snap = snapshotDraft(A);
    stageField(A, ['title'], 'two');
    expect(snap['title']).toBe('one');
  });
});
