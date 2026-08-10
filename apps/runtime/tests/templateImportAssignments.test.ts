// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { SourceAssignments } from '@cg/shared-ipc';
import {
  __resetCarriedOverForTest,
  __resetSourcesForTest,
  assignmentsWereCarriedOver,
  currentSourceAssignments,
  forgetTemplateAssignments,
  initSources,
  reconcileAssignmentsForImport,
} from '../src/renderer/features/sources/sourceStore.js';

/**
 * A9 — ASSIGNMENTS ARE OWNED BY THE LIBRARY ENTRY.
 *
 * Three rules, and each exists because the state it prevents is invisible:
 *
 *  1. **Deleting the entry deletes its bindings.** Otherwise there is state on
 *     this machine with nothing left that refers to it, and a later import of the
 *     same id silently inherits bindings nobody chose to keep.
 *  2. **A re-import KEEPS its bindings** — the useful case is an author fixing
 *     something and re-exporting, with the operator not re-binding every plate —
 *     **but it must SAY so.** The owner met it as a silent restore, which is
 *     indistinguishable from the product having invented the bindings.
 *  3. 🔴 **A plate id the new version no longer declares is DROPPED.** A dangling
 *     record can later match a plate it was never meant for — the author re-uses
 *     `guest-1` for a different box and a binding nobody made comes back on air.
 */

let stored: SourceAssignments = { assignments: [] };
const setCalls: SourceAssignments[] = [];

function installBridge(): void {
  const stub = {
    sources: {
      config: () => Promise.resolve({ sources: [] }),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      assignments: () => Promise.resolve(stored),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: (req: SourceAssignments) => {
        setCalls.push(req);
        stored = req;
        return Promise.resolve({ ok: true });
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function seed(assignments: SourceAssignments['assignments']): Promise<void> {
  stored = { assignments };
  __resetSourcesForTest();
  __resetCarriedOverForTest();
  installBridge();
  initSources(window.cg);
  await Promise.resolve();
  await Promise.resolve();
  setCalls.length = 0;
}

beforeEach(async () => {
  await seed([]);
});

describe('a re-import keeps its bindings, and says that it did', () => {
  it('keeps every binding whose plate the new version still declares', async () => {
    await seed([
      { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
      { templateId: 'tpl-1', plateId: 'guest-2', sourceId: 'src-bbb' },
    ]);

    const dropped = await reconcileAssignmentsForImport('tpl-1', ['guest-1', 'guest-2']);

    expect(dropped).toEqual([]);
    // Nothing written: there was nothing to change, and a no-op write would be a
    // push every other console has to process for no reason.
    expect(setCalls).toEqual([]);
    expect(currentSourceAssignments().assignments).toHaveLength(2);
    // …and the operator is TOLD, because they did nothing to produce it.
    expect(assignmentsWereCarriedOver('tpl-1')).toBe(true);
  });

  it('says nothing for a FIRST import — there is nothing carried over', async () => {
    const dropped = await reconcileAssignmentsForImport('tpl-1', ['guest-1']);
    expect(dropped).toEqual([]);
    expect(assignmentsWereCarriedOver('tpl-1')).toBe(false);
  });

  it('🔴 DROPS a binding for a plate the new version no longer declares', async () => {
    await seed([
      { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
      { templateId: 'tpl-1', plateId: 'guest-3', sourceId: 'src-bbb' },
    ]);

    // The re-exported template dropped `guest-3` and gained `guest-2`.
    const dropped = await reconcileAssignmentsForImport('tpl-1', ['guest-1', 'guest-2']);

    expect(dropped).toEqual(['guest-3']);
    expect(currentSourceAssignments().assignments).toEqual([
      { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
    ]);
    // A plate the new version declares and the old did not simply reads as
    // unassigned — which is the ordinary state of a plate nobody has bound.
    expect(currentSourceAssignments().assignments.some((a) => a.plateId === 'guest-2')).toBe(false);
    // Something survived, so it is still a carry-over.
    expect(assignmentsWereCarriedOver('tpl-1')).toBe(true);
  });

  it('drops EVERY binding when the new version declares no plates at all', async () => {
    await seed([{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' }]);
    const dropped = await reconcileAssignmentsForImport('tpl-1', []);
    expect(dropped).toEqual(['guest-1']);
    expect(currentSourceAssignments().assignments).toEqual([]);
    // Nothing survived, so there is nothing to announce as carried over.
    expect(assignmentsWereCarriedOver('tpl-1')).toBe(false);
  });

  it('never touches ANOTHER template bindings', async () => {
    await seed([
      { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
      { templateId: 'tpl-2', plateId: 'guest-1', sourceId: 'src-bbb' },
    ]);
    await reconcileAssignmentsForImport('tpl-1', []);
    expect(currentSourceAssignments().assignments).toEqual([
      { templateId: 'tpl-2', plateId: 'guest-1', sourceId: 'src-bbb' },
    ]);
    expect(assignmentsWereCarriedOver('tpl-2')).toBe(false);
  });
});

describe('deleting the library entry deletes its bindings', () => {
  it('drops exactly that template bindings, and writes once', async () => {
    await seed([
      { templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
      { templateId: 'tpl-2', plateId: 'guest-1', sourceId: 'src-bbb' },
    ]);

    const refusal = await forgetTemplateAssignments('tpl-1');

    expect(refusal).toBeNull();
    expect(setCalls).toEqual([
      { assignments: [{ templateId: 'tpl-2', plateId: 'guest-1', sourceId: 'src-bbb' }] },
    ]);
  });

  it('writes NOTHING when the template had no bindings', async () => {
    await seed([{ templateId: 'tpl-2', plateId: 'guest-1', sourceId: 'src-bbb' }]);
    expect(await forgetTemplateAssignments('tpl-1')).toBeNull();
    expect(setCalls).toEqual([]);
  });
});
