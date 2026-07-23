// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { FieldValues, ListItem, StackItemState } from '@cg/shared-schema';
import {
  __resetDraftsForTest,
  hasStaged,
  stagedValue,
  stageField,
  valueAt,
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
});

describe('RELOAD — re-reads and re-applies through stack.update', () => {
  it('sends the split value through the normal field-update path and clears the staged entry', async () => {
    const { update } = stubBridge();
    const source = fakeSource(['a | b']);
    attachFileSource('item-1', PATH, source, { split: true, delimiter: '|' });

    const res = await reloadFromFile(item({ crawl: [] }), PATH, 'list');
    expect(res.accepted).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const sent = (update.mock.calls[0] as unknown as [{ fields: FieldValues }])[0];
    expect(valueAt(sent.fields, [...PATH])).toEqual([
      { id: 'file-1', text: 'a' },
      { id: 'file-2', text: 'b' },
    ]);
    // Accepted → this field's staged entry cleared (nothing left dirty).
    expect(hasStaged('item-1', PATH)).toBe(false);
  });

  it('RE-reads: each reload sees the file’s CURRENT content', async () => {
    const { update } = stubBridge();
    const source = fakeSource(['old', 'new']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });

    await reloadFromFile(item(), PATH, 'text');
    await reloadFromFile(item(), PATH, 'text');
    expect(source.reads()).toBe(2);
    const second = (update.mock.calls[1] as unknown as [{ fields: FieldValues }])[0];
    expect(valueAt(second.fields, [...PATH])).toBe('new');
  });

  it('a reload never carries the operator’s unrelated staged edits to air', async () => {
    const { update } = stubBridge();
    stageField('item-1', ['other'], 'DRAFT-ONLY');
    const source = fakeSource(['content']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });

    await reloadFromFile(item({ crawl: 'applied', other: 'applied-other' }), PATH, 'text');
    const sent = (update.mock.calls[0] as unknown as [{ fields: FieldValues }])[0];
    expect(valueAt(sent.fields, ['other'])).toBe('applied-other'); // NOT the draft
    expect(hasStaged('item-1', ['other'])).toBe(true); // the draft survives, still staged
  });

  it('a rejected update keeps the reloaded value STAGED (dirty), like any hand edit', async () => {
    stubBridge(false);
    const source = fakeSource(['content']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });

    const res = await reloadFromFile(item(), PATH, 'text');
    expect(res.accepted).toBe(false);
    expect(stagedValue('item-1', PATH)).toBe('content');
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
    expect(fromFileState('item-1', PATH)).toMatchObject({ split: false, delimiter: '،' });
  });

  it('pruneFromFile drops entries for items gone from the stack', () => {
    const source = fakeSource(['x']);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });
    attachFileSource('item-2', PATH, source, { split: false, delimiter: '\\n' });
    pruneFromFile(['item-2']);
    expect(fromFileState('item-1', PATH)).toBeUndefined();
    expect(fromFileState('item-2', PATH)).toBeDefined();
  });

  it('a list value from file is Persian-verbatim end to end (no digit rewrite)', async () => {
    const { update } = stubBridge();
    const content = 'دلار ۱۲۳٬۴۵۶ ریال';
    const source = fakeSource([content]);
    attachFileSource('item-1', PATH, source, { split: false, delimiter: '\\n' });

    await reloadFromFile(item(), PATH, 'list');
    const sent = (update.mock.calls[0] as unknown as [{ fields: FieldValues }])[0];
    const items = valueAt(sent.fields, [...PATH]) as ListItem[];
    expect(items[0]?.text).toBe(content);
  });
});
