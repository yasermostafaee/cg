// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { FieldValues, ListItem, ListItemField, StackItemState } from '@cg/shared-schema';
import {
  __resetDraftsForTest,
  hasStaged,
  isItemDirty,
  stagedValue,
  stageField,
} from '../src/renderer/features/inspector/draftStore.js';
import {
  __resetFromFileForTest,
  attachFileSource,
  fromFileState,
  pruneFromFile,
  updateSplitConfig,
} from '../src/renderer/features/inspector/fromFileStore.js';
import { reloadFromFile, stageFromFile } from '../src/renderer/features/inspector/fromFileOps.js';
import { onCommandError } from '../src/renderer/features/status/commandFeedback.js';
import type { TextFileSource } from '../src/renderer/features/inspector/textFileSource.js';

/**
 * R-018 — the read → transform → stage/apply orchestration, against a FAKE
 * `TextFileSource` (the reason the source is an interface). Proves: the value
 * flows through the EXISTING field-update path (`stack.update`), RELOAD
 * re-reads the file each time, a failed read KEEPS the current value (never a
 * blank crawl because a share went away) and surfaces a legible error, and a
 * reload never carries the operator's unrelated staged edits to air.
 */

afterEach(() => {
  __resetDraftsForTest();
  __resetFromFileForTest();
  vi.restoreAllMocks();
});

/** A fake source: each read() consumes the next script entry (Error → reject). */
function fakeSource(script: (string | Error)[]): TextFileSource & { reads: () => number } {
  let n = 0;
  return {
    name: 'crawl.txt',
    reads: () => n,
    read: () => {
      const next = script[Math.min(n, script.length - 1)];
      n += 1;
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? '');
    },
  };
}

function stubBridge(accepted = true): { update: Mock } {
  const update = vi.fn(() => Promise.resolve({ accepted }));
  const stub = { stack: { update } };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { update };
}

function item(fields: FieldValues = {}): StackItemState {
  return { itemId: 'item-1', templateId: 'tpl-1', fields, status: 'playing', pending: false };
}

const PATH = ['crawl'] as const;

/** A stack snapshot that HAS arrived, carrying these ids. */
const live = (...ids: string[]) => ({ ready: true as const, liveItemIds: new Set(ids) });

describe('initial load (choose file) — stages like a hand edit', () => {
  it('whole-file mode stages ONE list item holding the entire content verbatim', async () => {
    const source = fakeSource(['خبر اول *** خبر دوم']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });
    const ok = await stageFromFile(item(), PATH, 'list');
    expect(ok).toBe(true);
    expect(stagedValue('item-1', PATH)).toEqual([{ id: 'file-1', text: 'خبر اول *** خبر دوم' }]);
  });

  it('a failed initial read stages NOTHING and records the error', async () => {
    stubBridge();
    const source = fakeSource([new Error('NotFoundError')]);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });
    const ok = await stageFromFile(item(), PATH, 'list');
    expect(ok).toBe(false);
    expect(hasStaged('item-1', PATH)).toBe(false);
    expect(fromFileState('item-1', PATH)?.error).toContain('crawl.txt');
  });

  it('stages typed Repeater rows from JSON and keeps malformed data out of the draft', async () => {
    const source = fakeSource([
      '[{"city":"Tehran","temperature":18,"icon":"sunny"}]',
      '[{"city":"Tehran","temperature":"warm"}]',
    ]);
    attachFileSource('item-1', PATH, source, {
      split: false,
      delimiter: '\\n',
      format: 'json',
    });
    const itemFields: readonly ListItemField[] = [
      { id: 'city', label: 'City', required: true, type: 'text', default: '' },
      { id: 'temperature', label: 'Temperature', required: true, type: 'number', default: 0 },
      { id: 'icon', label: 'Icon', required: false, type: 'image', accept: ['png'] },
    ];

    expect(await stageFromFile(item(), PATH, 'list', itemFields)).toBe(true);
    expect(stagedValue('item-1', PATH)).toEqual([
      {
        id: 'file-1',
        city: 'Tehran',
        temperature: 18,
        icon: { assetId: 'sunny' },
      },
    ]);
    const goodDraft = stagedValue('item-1', PATH);
    expect(await reloadFromFile(item(), PATH, 'list', itemFields)).toEqual({ accepted: false });
    expect(stagedValue('item-1', PATH)).toEqual(goodDraft);
    expect(fromFileState('item-1', PATH)?.error).toMatch(/row 1.*temperature/i);
  });

  it('keeps direct Repeater row identities stable so unchanged file data is not a draft', async () => {
    const applied: ListItem[] = [
      { id: 'authored-tehran', city: 'Tehran', temperature: 18 },
      { id: 'authored-shiraz', city: 'Shiraz', temperature: 22 },
    ];
    const source = fakeSource([
      '[{"city":"Tehran","temperature":18},{"city":"Shiraz","temperature":22}]',
    ]);
    attachFileSource('item-1', PATH, source, {
      split: false,
      delimiter: '\\n',
      format: 'json',
    });
    const itemFields: readonly ListItemField[] = [
      { id: 'city', label: 'City', required: true, type: 'text', default: '' },
      { id: 'temperature', label: 'Temperature', required: true, type: 'number', default: 0 },
    ];
    const current = item({ crawl: applied });

    expect(await stageFromFile(current, PATH, 'list', itemFields)).toBe(true);
    expect(stagedValue('item-1', PATH)).toEqual(applied);
    expect(isItemDirty('item-1', current.fields, new Map())).toBe(false);
  });

  it('keeps the authored row structure when any Repeater column is locked', async () => {
    const source = fakeSource([
      '[{"city":"Tehran","temperature":31},{"city":"Shiraz","temperature":22}]',
    ]);
    attachFileSource('item-1', PATH, source, {
      split: false,
      delimiter: '\n',
      format: 'json',
    });
    const itemFields: readonly ListItemField[] = [
      {
        id: 'city',
        label: 'City',
        required: true,
        type: 'text',
        default: '',
        operatorEditable: false,
      },
      { id: 'temperature', label: 'Temperature', required: true, type: 'number', default: 0 },
    ];
    const current = item({ crawl: [{ id: 'tehran', city: 'Tehran', temperature: 25 }] });

    expect(await stageFromFile(current, PATH, 'list', itemFields)).toBe(false);
    expect(hasStaged('item-1', PATH)).toBe(false);
    expect(fromFileState('item-1', PATH)?.error).toMatch(/must keep exactly 1 rows; found 2/iu);
  });

  it('keeps an async file read on the item that started it when selection changes', async () => {
    let finishRead: ((value: string) => void) | undefined;
    const source: TextFileSource = {
      name: 'weather.json',
      read: () =>
        new Promise<string>((resolve) => {
          finishRead = resolve;
        }),
    };
    const originalRows: ListItem[] = [{ id: 'weather-1', city: 'Tehran' }];
    const liveItem = item({ crawl: originalRows });
    attachFileSource('item-1', PATH, source, {
      split: false,
      delimiter: '\n',
      format: 'json',
    });

    const pending = stageFromFile(liveItem, PATH, 'list', [
      { id: 'city', label: 'City', required: true, type: 'text', default: '' },
    ]);
    // The bridge's live row object can be repointed while the workbook is still
    // being read. The completed read must not follow it into the newly-selected row.
    Object.assign(liveItem, {
      itemId: 'item-2',
      templateId: 'tpl-league',
      fields: { teams: [{ id: 'team-1', team: 'Persepolis' }] },
    });
    finishRead?.('[{"city":"Tehran"}]');

    await expect(pending).resolves.toBe(true);
    expect(stagedValue('item-1', PATH)).toEqual(originalRows);
    expect(hasStaged('item-2', PATH)).toBe(false);
  });
});

/**
 * RELOAD RE-READS AND STAGES. IT DOES NOT APPLY.
 *
 * These assertions are RE-EXPRESSED, not loosened, and the behaviour they
 * describe is the corrected one. Reload used to call `applyFieldValue` — the same
 * `stack.update` the Update button sends — so a button with a READ verb performed
 * a WRITE that reached the graphic on air (owner's report). Nothing on the surface
 * said so: choosing a file stages and waits, and Reload looked like that same
 * gesture repeated.
 *
 * What each old case was really protecting survives here, pointed at the staging
 * path: the split transform, that a reload genuinely RE-READS, that it touches
 * only its own field, and that a failed read changes nothing. The one assertion
 * that could not survive is "a rejected update keeps it staged" — there is no
 * update to reject any more, and the value is staged unconditionally, which is
 * strictly the safer half of what that test was guarding.
 */
describe('RELOAD — re-reads and STAGES, exactly like choosing the file did', () => {
  it('stages the split value and sends NOTHING to the bridge', async () => {
    const { update } = stubBridge();
    const source = fakeSource(['a | b']);
    attachFileSource('item-1', PATH, source, { split: true, delimiter: '|' });

    const res = await reloadFromFile(item({ crawl: [] }), PATH, 'list');
    expect(res.accepted).toBe(true);
    // THE ASSERTION THIS SUITE EXISTS FOR NOW: no write reached air.
    expect(update).not.toHaveBeenCalled();
    // …and the transform still ran, so the staged value is the split one.
    expect(stagedValue('item-1', PATH)).toEqual([
      { id: 'file-1', text: 'a' },
      { id: 'file-2', text: 'b' },
    ]);
    // It is DIRTY afterwards — the operator commits it with Update.
    expect(hasStaged('item-1', PATH)).toBe(true);
  });

  it('RE-reads: each reload sees the file’s CURRENT content', async () => {
    const { update } = stubBridge();
    const source = fakeSource(['old', 'new']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });

    await reloadFromFile(item(), PATH, 'text');
    await reloadFromFile(item(), PATH, 'text');
    expect(source.reads()).toBe(2);
    // The SECOND read is what is staged — a reload that returned a cached value
    // would make the button a no-op, which is the other way to break it.
    expect(stagedValue('item-1', PATH)).toBe('new');
    expect(update).not.toHaveBeenCalled();
  });

  it('a reload touches only its OWN field — an unrelated draft is left alone', async () => {
    const { update } = stubBridge();
    stageField('item-1', ['other'], 'DRAFT-ONLY');
    const source = fakeSource(['content']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });

    await reloadFromFile(item({ crawl: 'applied', other: 'applied-other' }), PATH, 'text');
    // The sibling draft survives untouched, and — the point of the original
    // assertion — it is still not on air, because nothing went to air at all.
    expect(stagedValue('item-1', ['other'])).toBe('DRAFT-ONLY');
    expect(hasStaged('item-1', ['other'])).toBe(true);
    expect(stagedValue('item-1', PATH)).toBe('content');
    expect(update).not.toHaveBeenCalled();
  });

  it('a reload while the bridge would REFUSE still stages — editing is never gated', async () => {
    // The offline surface's whole point: an operator can go on preparing with the
    // playout machine unreachable, and the edit reaches air when they press Update.
    // Reload is an edit, so it must work here too.
    const { update } = stubBridge(false);
    const source = fakeSource(['content']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });

    const res = await reloadFromFile(item(), PATH, 'text');
    expect(res.accepted).toBe(true);
    expect(stagedValue('item-1', PATH)).toBe('content');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('missing/unreadable file at reload — the current value is KEPT', () => {
  it('applies nothing, records a legible error on the field, and toasts it', async () => {
    const { update } = stubBridge();
    const errors: string[] = [];
    const off = onCommandError((m) => errors.push(m));
    const source = fakeSource([new Error('share unavailable')]);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });

    const res = await reloadFromFile(item({ crawl: 'ON-AIR VALUE' }), PATH, 'text');
    off();

    expect(res.accepted).toBe(false);
    expect(update).not.toHaveBeenCalled(); // the on-air value was never touched
    expect(hasStaged('item-1', PATH)).toBe(false);
    const recorded = fromFileState('item-1', PATH)?.error ?? '';
    expect(recorded).toContain('crawl.txt');
    expect(recorded).toContain('current value is kept');
    expect(errors.some((m) => m.includes('crawl.txt'))).toBe(true);
  });

  it('the next successful reload clears the recorded error', async () => {
    stubBridge();
    const source = fakeSource([new Error('gone'), 'back again']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });

    await reloadFromFile(item(), PATH, 'text');
    expect(fromFileState('item-1', PATH)?.error).not.toBeNull();
    await reloadFromFile(item(), PATH, 'text');
    expect(fromFileState('item-1', PATH)?.error).toBeNull();
  });
});

describe('store housekeeping', () => {
  it('split config updates apply to the attached entry', () => {
    const source = fakeSource(['x']);
    attachFileSource('item-1', PATH, source, { split: true, delimiter: '\\n' });
    updateSplitConfig('item-1', PATH, { split: false });
    updateSplitConfig('item-1', PATH, { delimiter: '،' });
    updateSplitConfig('item-1', PATH, { format: 'csv' });
    expect(fromFileState('item-1', PATH)).toMatchObject({
      split: false,
      delimiter: '،',
      format: 'csv',
    });
  });

  it('pruneFromFile drops entries for items gone from the stack', () => {
    const source = fakeSource(['x']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });
    attachFileSource('item-2', PATH, source, { split: false, delimiter: '\\n' });
    pruneFromFile(live('item-2'));
    expect(fromFileState('item-1', PATH)).toBeUndefined();
    expect(fromFileState('item-2', PATH)).toBeDefined();
  });

  /**
   * `pruneFromFile` rode the SAME pass as `pruneDrafts`, so it lost file
   * attachments on exactly the remounts that lost the drafts. A different store
   * and a different loss, one mechanism — asserted separately for that reason.
   */
  it('pruneFromFile deletes NOTHING when the snapshot has not arrived', () => {
    const source = fakeSource(['x']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });
    attachFileSource('item-2', PATH, source, { split: false, delimiter: '\\n' });
    pruneFromFile({ ready: false });
    expect(fromFileState('item-1', PATH)).toBeDefined();
    expect(fromFileState('item-2', PATH)).toBeDefined();
  });

  it('a list value from file is Persian-verbatim end to end (no digit rewrite)', async () => {
    const { update } = stubBridge();
    const content = 'دلار ۱۲۳٬۴۵۶ ریال';
    const source = fakeSource([content]);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });

    await reloadFromFile(item(), PATH, 'list');
    // RE-EXPRESSED onto the staged value: reload stages rather than applying, so
    // the staged entry is where the file's bytes land. The CLAIM is unchanged and
    // is the one that matters — Persian digits survive verbatim, with no
    // normalisation anywhere on the path from the file to the value.
    const items = stagedValue('item-1', PATH) as ListItem[];
    expect(items[0]?.text).toBe(content);
    expect(update).not.toHaveBeenCalled();
  });
});
