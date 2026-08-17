// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import type { SourceAssignments, SourceCatalog } from '@cg/shared-ipc';
import {
  __resetDraftsForTest,
  clearDraft,
  effectivePlateSource,
  isItemDirty,
  isPlateDirty,
  pruneDrafts,
  snapshotPlateDraft,
  stageField,
  stagePlateSource,
} from '../src/renderer/features/inspector/draftStore.js';
import { applyDraft } from '../src/renderer/features/inspector/applyDraft.js';
import {
  __resetSourcesForTest,
  currentSourceAssignments,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';

/**
 * D-137 / C-015 (A8) — the plate picker STAGES, through the Inspector's own
 * mechanism.
 *
 * The subject is the MECHANISM, not the styling. The assignment is
 * TEMPLATE-level, shared by every row carrying the template, so a picker that
 * committed on change would let one stray click silently change what those rows
 * do, with nothing to notice and nothing to undo. The draft IS the confirmation
 * step — and it is worth nothing unless it is the SAME draft state the rest of
 * the panel already protects.
 *
 * So each test below asks one question about that sameness: does an unapplied
 * edit stay off the wire, does Update write it, does Discard drop it, and does
 * the guard that once destroyed every staged edit on a panel remount treat this
 * one identically.
 */

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 2 } },
    { id: 'src-bbb', name: 'Baku', producer: { kind: 'route', channel: 3 } },
  ],
};

let storedAssignments: SourceAssignments = { assignments: [] };
let assignmentRefusal: { reason?: string; message?: string } | null = null;
const setAssignmentCalls: SourceAssignments[] = [];
const updateCalls: { itemId: string; fields: unknown }[] = [];

function installBridge(): void {
  const stub = {
    sources: {
      config: () => Promise.resolve(CATALOG),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      assignments: () => Promise.resolve(storedAssignments),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: (req: SourceAssignments) => {
        setAssignmentCalls.push(req);
        if (assignmentRefusal !== null) return Promise.resolve({ ok: false, ...assignmentRefusal });
        storedAssignments = req;
        return Promise.resolve({ ok: true });
      },
    },
    stack: {
      update: (req: { itemId: string; fields: unknown }) => {
        updateCalls.push(req);
        return Promise.resolve({ accepted: true });
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

function item(itemId = 'item-1', templateId = 'tpl-two-box'): StackItemState {
  return { itemId, templateId, fields: { title: 'hello' }, status: 'loaded', pending: false };
}

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(async () => {
  storedAssignments = { assignments: [] };
  assignmentRefusal = null;
  setAssignmentCalls.length = 0;
  updateCalls.length = 0;
  __resetDraftsForTest();
  __resetSourcesForTest();
  installBridge();
  initSources(window.cg);
  await settle();
  vi.restoreAllMocks();
});

describe('an unapplied plate edit stays off the wire', () => {
  it('stages locally and reaches NOTHING until Update', () => {
    stagePlateSource('item-1', 'guest-1', 'src-aaa');
    expect(effectivePlateSource('item-1', 'guest-1', null)).toBe('src-aaa');
    expect(isPlateDirty('item-1', 'guest-1', null)).toBe(true);
    // The bridge has not been told, and neither has any other row: the assignment
    // in force is still empty.
    expect(setAssignmentCalls).toEqual([]);
    expect(currentSourceAssignments()).toEqual({ assignments: [] });
  });

  it('renders draft-over-applied, so a push cannot clobber it', () => {
    stagePlateSource('item-1', 'guest-1', 'src-bbb');
    // Another console applied `src-aaa` meanwhile. The operator's own unapplied
    // choice is what they keep looking at — the field rule, unchanged.
    expect(effectivePlateSource('item-1', 'guest-1', 'src-aaa')).toBe('src-bbb');
    expect(isPlateDirty('item-1', 'guest-1', 'src-aaa')).toBe(true);
  });

  it('counts toward the ITEM being dirty, so Update and Discard are live', () => {
    // The commit bar reads ONE predicate. A plate draft the bar could not see
    // would be an edit with no way to apply it and no way to abandon it.
    expect(isItemDirty('item-1', item().fields, new Map())).toBe(false);
    stagePlateSource('item-1', 'guest-1', 'src-aaa');
    expect(isItemDirty('item-1', item().fields, new Map([['guest-1', null]]))).toBe(true);
    // …and clean again once the applied value catches up with the draft.
    expect(isItemDirty('item-1', item().fields, new Map([['guest-1', 'src-aaa']]))).toBe(false);
  });

  /**
   * B-139 — THE THREE TRANSITIONS, against a REAL baseline.
   *
   * These are the reproduction, and two of them were RED before the fix. The row
   * used to omit `isItemDirty`'s plate baseline, so every plate was compared
   * against `''` and the predicate degenerated to `staged !== ''`: re-picking the
   * saved source read dirty, and staging _not assigned_ read clean.
   *
   * The baseline here is what `appliedPlateSources` returns for a plate whose
   * saved assignment is `src-aaa` — the same map both surfaces now receive, which
   * is the point: one question, one answer, both surfaces.
   */
  describe('B-139 — the three transitions agree, whatever the order', () => {
    const SAVED_A: ReadonlyMap<string, string | null> = new Map([['guest-1', 'src-aaa']]);

    const toDifferentSource = (): void => stagePlateSource('item-1', 'guest-1', 'src-bbb');
    const backToSaved = (): void => stagePlateSource('item-1', 'guest-1', 'src-aaa');
    const toUnassigned = (): void => stagePlateSource('item-1', 'guest-1', '');

    it('a DIFFERENT source is dirty', () => {
      toDifferentSource();
      expect(isItemDirty('item-1', item().fields, SAVED_A)).toBe(true);
      expect(isPlateDirty('item-1', 'guest-1', 'src-aaa')).toBe(true);
    });

    it('back to the SAVED source is CLEAN — the false positive', () => {
      backToSaved();
      expect(isItemDirty('item-1', item().fields, SAVED_A)).toBe(false);
      expect(isPlateDirty('item-1', 'guest-1', 'src-aaa')).toBe(false);
    });

    it('NOT ASSIGNED is DIRTY — the false negative, and the one that disabled UPDATE', () => {
      toUnassigned();
      expect(isItemDirty('item-1', item().fields, SAVED_A)).toBe(true);
      expect(isPlateDirty('item-1', 'guest-1', 'src-aaa')).toBe(true);
    });

    /*
      Order-independence is a PROPERTY of the fix, not a fourth case: dirtiness is
      a comparison against the applied value, so it cannot depend on how the
      operator arrived at the staged one. Every permutation is driven here rather
      than asserting the claim once, because "the order makes no difference" was
      part of the original report.
    */
    const STEPS = [
      ['toDifferentSource', toDifferentSource, true],
      ['backToSaved', backToSaved, false],
      ['toUnassigned', toUnassigned, true],
    ] as const;

    for (const [firstName, first] of STEPS) {
      for (const [lastName, last, expected] of STEPS) {
        if (firstName === lastName) continue;
        it(`${firstName} then ${lastName} ⇒ ${String(expected)}, the same as ${lastName} alone`, () => {
          first();
          last();
          expect(isItemDirty('item-1', item().fields, SAVED_A)).toBe(expected);
        });
      }
    }
  });

  it('un-assigning is an EDIT, not an absence', () => {
    // `''` has to be a staged value in its own right: otherwise clearing a plate
    // that has a source would be indistinguishable from never touching it.
    stagePlateSource('item-1', 'guest-1', '');
    expect(isPlateDirty('item-1', 'guest-1', 'src-aaa')).toBe(true);
    expect(effectivePlateSource('item-1', 'guest-1', 'src-aaa')).toBe('');
  });
});

describe('Update writes it, through the same apply the fields use', () => {
  it('sends the assignment AND the field payload from one action', async () => {
    stageField('item-1', ['title'], 'edited');
    stagePlateSource('item-1', 'guest-1', 'src-aaa');

    const res = await applyDraft(item());
    expect(res.accepted).toBe(true);

    // TEMPLATE-level: the payload is the assignments in force with this
    // template's staged plates overlaid, keyed by templateId and not by item.
    expect(setAssignmentCalls).toEqual([
      { assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' }] },
    ]);
    expect(updateCalls[0]?.fields).toMatchObject({ title: 'edited' });
    // Both staged entries clear on acceptance.
    expect(snapshotPlateDraft('item-1').size).toBe(0);
    expect(isItemDirty('item-1', { title: 'edited' }, new Map([['guest-1', 'src-aaa']]))).toBe(
      false,
    );
  });

  it('preserves OTHER templates assignments rather than replacing the whole set', async () => {
    storedAssignments = {
      assignments: [{ templateId: 'tpl-other', plateId: 'guest-1', sourceId: 'src-bbb' }],
    };
    __resetSourcesForTest();
    initSources(window.cg);
    await settle();

    stagePlateSource('item-1', 'guest-1', 'src-aaa');
    await applyDraft(item());

    expect(setAssignmentCalls[0]?.assignments).toEqual([
      { templateId: 'tpl-other', plateId: 'guest-1', sourceId: 'src-bbb' },
      { templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' },
    ]);
  });

  it('an emptied plate REMOVES the entry rather than writing a blank one', async () => {
    storedAssignments = {
      assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' }],
    };
    __resetSourcesForTest();
    initSources(window.cg);
    await settle();

    stagePlateSource('item-1', 'guest-1', '');
    await applyDraft(item());
    // An assignment naming nothing is a state nothing downstream can read.
    expect(setAssignmentCalls[0]?.assignments).toEqual([]);
  });

  it('a REFUSED assignment keeps its draft and reports the apply as not accepted', async () => {
    assignmentRefusal = { reason: 'unknown-source', message: 'no such source' };
    stagePlateSource('item-1', 'guest-1', 'src-aaa');

    const res = await applyDraft(item());
    expect(res.accepted).toBe(false);
    // Staged, exactly as a rejected field update keeps its drafts — there is no
    // other copy of this edit anywhere.
    expect(snapshotPlateDraft('item-1').get('guest-1')).toBe('src-aaa');
  });

  it('an item with NO plate draft never calls the assignments channel', async () => {
    stageField('item-1', ['title'], 'edited');
    await applyDraft(item());
    expect(setAssignmentCalls).toEqual([]);
  });
});

describe('it inherits the protections, not just the appearance', () => {
  it('Discard drops it, from the same call that drops the fields', () => {
    stageField('item-1', ['title'], 'edited');
    stagePlateSource('item-1', 'guest-1', 'src-aaa');
    clearDraft('item-1');
    expect(snapshotPlateDraft('item-1').size).toBe(0);
    expect(isItemDirty('item-1', item().fields, new Map([['guest-1', null]]))).toBe(false);
  });

  it('SURVIVES a selection switch — drafts are keyed by item', () => {
    stagePlateSource('item-1', 'guest-1', 'src-aaa');
    stagePlateSource('item-2', 'guest-1', 'src-bbb');
    // Selecting another row and coming back is not an event this store hears at
    // all, which is exactly why it survives one.
    expect(effectivePlateSource('item-1', 'guest-1', null)).toBe('src-aaa');
    expect(effectivePlateSource('item-2', 'guest-1', null)).toBe('src-bbb');
  });

  it('🔴 the round-trip prune FAILS CLOSED for it, exactly as for the fields', () => {
    // The recorded defect: a panel/fullscreen remount ran the prune against the
    // bootstrap snapshot — `[]`, because nothing had arrived — and deleted every
    // staged edit with no undo. A plate draft must not reintroduce it.
    stagePlateSource('item-1', 'guest-1', 'src-aaa');
    pruneDrafts({ ready: false });
    expect(effectivePlateSource('item-1', 'guest-1', null)).toBe('src-aaa');
  });

  it('…and IS dropped once the stack can prove the item has left', () => {
    stagePlateSource('item-1', 'guest-1', 'src-aaa');
    pruneDrafts({ ready: true, liveItemIds: new Set(['item-2']) });
    expect(effectivePlateSource('item-1', 'guest-1', null)).toBe('');
  });
});
