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
  effectivePosition,
  positionDraftOf,
  pruneDrafts,
  snapshotDraft,
  stageField,
  stagePosition,
  stagedValue,
} from '../src/renderer/features/inspector/draftStore.js';

/**
 * B-139 — an item that declares NO plates, said explicitly.
 *
 * `isItemDirty`'s plate baseline is required precisely so a caller cannot omit it
 * and get a different question answered. These field-only cases must therefore
 * STATE that there are no plates rather than leave it out — which is the whole
 * distinction the fix draws, and a test that omitted it would document a call
 * shape the API no longer allows.
 */
const NO_PLATES: ReadonlyMap<string, string | null> = new Map();

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

/** A stack snapshot that HAS arrived, carrying these ids. */
const live = (...ids: string[]) => ({ ready: true as const, liveItemIds: new Set(ids) });

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
    expect(isItemDirty(A, { title: 'same' }, NO_PLATES)).toBe(false);
  });

  it('a draft differing from applied is dirty', () => {
    stageField(A, ['title'], 'new');
    expect(isFieldDirty(A, ['title'], 'old')).toBe(true);
    expect(isItemDirty(A, { title: 'old' }, NO_PLATES)).toBe(true);
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
    pruneDrafts(live(B)); // A was removed
    expect(hasStaged(A, ['title'])).toBe(false);
    expect(hasStaged(B, ['title'])).toBe(true);
  });

  /**
   * THE GUARD. A snapshot that has not arrived is not an empty stack, and a prune
   * that cannot tell what is on the stack has no business deleting anything.
   *
   * This is the unit-level half of the fullscreen data-loss bug: the effect that
   * used to run this lived in `LayersPanel`, which `App` unmounts on either
   * fullscreen path, so it re-ran on remount against the bootstrap `[]` and
   * deleted every staged edit. The call site moved to `App`; this guard is kept
   * anyway, because the failure mode is silent destruction of typed work with no
   * undo — the one case that earns defence in depth.
   */
  it('pruneDrafts deletes NOTHING when the snapshot has not arrived', () => {
    stageField(A, ['title'], 'x');
    stageField(B, ['title'], 'y');
    pruneDrafts({ ready: false });
    expect(hasStaged(A, ['title'])).toBe(true);
    expect(hasStaged(B, ['title'])).toBe(true);
  });

  it('a READY snapshot that is genuinely empty still prunes — the guard is not an off switch', () => {
    stageField(A, ['title'], 'x');
    pruneDrafts(live());
    expect(hasStaged(A, ['title'])).toBe(false);
  });
});

/**
 * `RUNTIME-REDESIGN-01` PHASE 5 — the POSITION draft lives in the store, per item, so a
 * selection round trip cannot lose it (it used to be `PositionPicker`'s own `useState`,
 * keyed by item and therefore remounted — and emptied — on every selection change).
 */
describe('the position draft — kept per item, swept by prune, DROPPED by Discard', () => {
  const DRAFT = { anchor: 'top-left' as const, x: '42', y: '-7' };
  /** What the row has APPLIED, for the dirty comparison. */
  const APPLIED_POSITION = { anchor: 'center' as const, offset: { x: 10, y: -20 } };

  it('stages and reads back, per item', () => {
    stagePosition(A, DRAFT);
    expect(positionDraftOf(A)).toEqual(DRAFT);
    expect(positionDraftOf(B)).toBeUndefined();
  });

  it('keeps the offsets AS TYPED — an in-progress "-" is not flattened to 0', () => {
    stagePosition(A, { anchor: 'center', x: '-', y: '1.' });
    expect(positionDraftOf(A)).toEqual({ anchor: 'center', x: '-', y: '1.' });
  });

  /**
   * 🔴 **REVERSED BY THE OWNER, 2026-09-14 — and the assertion is INVERTED rather than
   * deleted, because the behaviour it pinned is exactly the behaviour that changed.**
   *
   * It read: _"is NOT dropped by clearDraft (Discard) and does NOT make the item dirty —
   * UPDATE does not send it"_, and that was correct while `Apply position` was the position's
   * own control. «دکمه apply position فقط یه مرحله اضافیه و همون دکمه update باید
   * پوزیشن رو هم اعمال کنه و همچنین discard هم روش کار کنه.»
   *
   * ⚠ The OLD test's own reasoning is what demands the new one: it existed so a chip could
   * never point at an edit UPDATE would not send. UPDATE sends the position now, so the same
   * rule inverts — a position that survived a Discard, or that left the bar reporting itself
   * clean, would be the unapplied edit nobody can see.
   */
  it('🔴 IS dropped by clearDraft (Discard) and DOES make the item dirty — UPDATE sends it now', () => {
    stagePosition(A, DRAFT);
    stageField(A, ['title'], 'x');
    // Dirty BEFORE the discard, and dirty BECAUSE of the position: the field is staged as
    // `'x'` against an applied `'x'`, so only the position can be making this true.
    expect(isItemDirty(A, { title: 'x' }, NO_PLATES, undefined, APPLIED_POSITION)).toBe(true);

    clearDraft(A);
    expect(hasStaged(A, ['title'])).toBe(false);
    expect(positionDraftOf(A)).toBeUndefined();
    expect(isItemDirty(A, { title: 'x' }, NO_PLATES, undefined, APPLIED_POSITION)).toBe(false);
  });

  /**
   * ⚠ **A POSITION EQUAL TO THE APPLIED ONE IS NOT DIRTY**, and the comparison is on the
   * VALUES a send would carry rather than on the typed strings. Without this, a box the
   * operator typed and retyped back — or left as `-0` — would demand an UPDATE that changes
   * nothing, which is how a dirty mark stops meaning anything.
   */
  it('a staged position identical to the applied one leaves the item clean', () => {
    stagePosition(A, { anchor: APPLIED_POSITION.anchor, x: '10', y: '-20' });
    expect(isItemDirty(A, {}, NO_PLATES, undefined, APPLIED_POSITION)).toBe(false);
    stagePosition(A, { anchor: APPLIED_POSITION.anchor, x: '11', y: '-20' });
    expect(isItemDirty(A, {}, NO_PLATES, undefined, APPLIED_POSITION)).toBe(true);
  });

  /**
   * …and a half-typed box is not a move. `'-'`, `'1.'` and `''` are in-progress states the
   * store keeps AS TYPED (the test above pins that); what a send carries for them is `0`, so
   * that is what the dirty test has to compare, or the panel reports a move the wire would
   * not make.
   */
  it('an in-progress offset compares as the number a send would carry', () => {
    stagePosition(A, { anchor: APPLIED_POSITION.anchor, x: '', y: '-20' });
    // `''` sends 0, and applied x is 10 — a real difference.
    expect(isItemDirty(A, {}, NO_PLATES, undefined, APPLIED_POSITION)).toBe(true);
    stagePosition(A, { anchor: APPLIED_POSITION.anchor, x: '10', y: '-' });
    // `'-'` sends 0, and applied y is -20 — also a real difference, from the other box.
    expect(isItemDirty(A, {}, NO_PLATES, undefined, APPLIED_POSITION)).toBe(true);
  });

  /**
   * 🔴 PVW SEES THE STAGED MOVE, the air path does not — owner, 2026-09-14: the preview
   * must follow the boxes with no UPDATE in between. `effectivePosition` is the position half
   * of `buildApplyPayload` and exists for that one caller.
   */
  it('effectivePosition overlays the staged move, and is the applied value without one', () => {
    expect(effectivePosition(A, APPLIED_POSITION)).toEqual(APPLIED_POSITION);
    stagePosition(A, { anchor: 'bottom-right', x: '5', y: '' });
    expect(effectivePosition(A, APPLIED_POSITION)).toEqual({
      anchor: 'bottom-right',
      offset: { x: 5, y: 0 },
    });
  });

  it('is swept by pruneDrafts once the row has left the stack, and only then', () => {
    stagePosition(A, DRAFT);
    stagePosition(B, DRAFT);
    pruneDrafts({ ready: false });
    expect(positionDraftOf(A)).toEqual(DRAFT);
    pruneDrafts(live(B));
    expect(positionDraftOf(A)).toBeUndefined();
    expect(positionDraftOf(B)).toEqual(DRAFT);
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
    expect(isItemDirty(B, { title: 'anything' }, NO_PLATES)).toBe(false);
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
