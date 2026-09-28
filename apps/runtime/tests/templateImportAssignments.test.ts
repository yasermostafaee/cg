// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { unassignedPlateIds, type SourceAssignments } from '@cg/shared-ipc';
import {
  __resetCarriedOverForTest,
  __resetSourcesForTest,
  assignmentsWereCarriedOver,
  currentSourceAssignments,
  initSources,
  noteAssignmentsCarriedOver,
} from '../src/renderer/features/sources/sourceStore.js';

/**
 * A9 — a re-import KEEPS its bindings — the useful case is an author fixing something and
 * re-exporting, with the operator not re-binding every plate — **but it must SAY so.** The owner
 * met it as a silent restore, which is indistinguishable from the product having invented them.
 *
 * 🔴 `CHANNEL-TEMPLATES-01` decision 2 (the owner, 2026-09-28) — **A TEMPLATE ACTION NEVER WRITES
 * SOURCE DEFAULTS.** A re-import keeps a channel's defaults for every plate that still exists, and a
 * default for a plate the new version no longer declares is IGNORED, never deleted; removing a
 * template from a channel leaves its defaults where they are. These used to be station-wide
 * `sources.set-assignments` writes — dropping a gone plate's default, and wiping a deleted
 * template's, on every channel at once — which is what refused a channel's own operator a
 * re-import or a removal of a template another channel also used (`PLATE-BAND-01`'s found item).
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

describe('a re-import keeps its channel’s defaults, writes nothing, and says what it carried over', () => {
  it('keeps every default whose plate the new version still declares — and is told so', async () => {
    await seed([
      { channel: 2, templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
      { channel: 2, templateId: 'tpl-1', plateId: 'guest-2', sourceId: 'src-bbb' },
    ]);

    noteAssignmentsCarriedOver('tpl-1', ['guest-1', 'guest-2'], 2);

    // Nothing written: a no-op write would be a push every other console has to process.
    expect(setCalls).toEqual([]);
    expect(currentSourceAssignments().assignments).toHaveLength(2);
    // …and the operator is TOLD, on the channel it happened on.
    expect(assignmentsWereCarriedOver('tpl-1', 2)).toBe(true);
    // Control: another channel's import carried nothing over.
    expect(assignmentsWereCarriedOver('tpl-1', 1)).toBe(false);
  });

  it('says nothing for a FIRST import — there is nothing carried over', async () => {
    noteAssignmentsCarriedOver('tpl-1', ['guest-1'], 2);
    expect(setCalls).toEqual([]);
    expect(assignmentsWereCarriedOver('tpl-1', 2)).toBe(false);
  });

  it('🔴 a default for a plate the new version no longer declares is IGNORED, never deleted', async () => {
    const start: SourceAssignments['assignments'] = [
      { channel: 2, templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
      { channel: 2, templateId: 'tpl-1', plateId: 'guest-3', sourceId: 'src-bbb' },
    ];
    await seed(start);

    // The re-exported template dropped `guest-3` and gained `guest-2`.
    noteAssignmentsCarriedOver('tpl-1', ['guest-1', 'guest-2'], 2);

    // NOTHING is written — the gone plate's default stays exactly where it was…
    expect(setCalls).toEqual([]);
    expect(currentSourceAssignments().assignments).toEqual(start);
    // …and nothing reads it: the readers ask for the plates the template DECLARES, so the new
    // plate reads unassigned and the gone one is simply not asked about.
    expect(
      unassignedPlateIds(currentSourceAssignments(), 2, 'tpl-1', ['guest-1', 'guest-2']),
    ).toEqual(['guest-2']);
    // Something survived, so it is still a carry-over.
    expect(assignmentsWereCarriedOver('tpl-1', 2)).toBe(true);
  });

  it('declaring no plates at all carries nothing over — and still writes nothing', async () => {
    await seed([{ channel: 2, templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' }]);
    noteAssignmentsCarriedOver('tpl-1', [], 2);
    expect(setCalls).toEqual([]);
    expect(currentSourceAssignments().assignments).toHaveLength(1);
    expect(assignmentsWereCarriedOver('tpl-1', 2)).toBe(false);
  });

  it('another channel’s defaults for the same template are never touched, and never carried', async () => {
    const start: SourceAssignments['assignments'] = [
      { channel: 1, templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' },
    ];
    await seed(start);
    noteAssignmentsCarriedOver('tpl-1', ['guest-1'], 2);
    expect(setCalls).toEqual([]);
    expect(currentSourceAssignments().assignments).toEqual(start);
    // CH 2 has none of its own for the plate, so nothing was carried over THERE.
    expect(assignmentsWereCarriedOver('tpl-1', 2)).toBe(false);
  });
});
