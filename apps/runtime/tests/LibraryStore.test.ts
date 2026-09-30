import { describe, expect, it } from 'vitest';
import { MemoryWorkspace } from '@cg/storage';
import type { TemplateInfo } from '@cg/shared-ipc';
import { LibraryStore } from '../src/platform/library/LibraryStore.js';

/**
 * B-085 — this console's copy of the template library, pinned off any socket: record/list/get,
 * persistence across a simulated reload (a second store over the SAME workspace), and the delete
 * semantics per channel.
 *
 * 🔴 `CENTRAL-BRIDGE-01` (`B-294`): it is a DISPLAY copy now. The library is CG Bridge's; this
 * store is written only after the bridge accepted an import or a removal, and nothing sends it.
 * Its offline guarded removal (R-005 against a last-known stack) is gone with the offline
 * removal itself — the bridge decides a removal, where the true stack is.
 */

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  name: 'Lower Third',
  templateType: 'lower-third',
  fields: [],
};

describe('LibraryStore', () => {
  it('records a template and lists / gets it, with its page', async () => {
    const store = new LibraryStore(new MemoryWorkspace());
    const res = await store.import(TEMPLATE, '<html>v1</html>');

    expect(res).toEqual({ registered: true, templateId: 'lower-third' });
    expect(store.list()).toEqual([TEMPLATE]);
    expect(store.get('lower-third')).toEqual(TEMPLATE);
    expect(store.get('missing')).toBeNull();
    // The offline PVW page.
    expect(store.html('lower-third')).toBe('<html>v1</html>');
  });

  it('a re-import replaces the prior entry (metadata + html)', async () => {
    const store = new LibraryStore(new MemoryWorkspace());
    await store.import(TEMPLATE, '<html>v1</html>');
    await store.import({ ...TEMPLATE, name: 'Renamed' }, '<html>v2</html>');

    expect(store.list()).toHaveLength(1);
    expect(store.get('lower-third')?.name).toBe('Renamed');
    expect(store.html('lower-third')).toBe('<html>v2</html>');
  });

  it('SURVIVES a reload: a fresh store over the same workspace re-hydrates the library', async () => {
    const ws = new MemoryWorkspace();
    const first = new LibraryStore(ws);
    await first.import(TEMPLATE, '<html>persisted</html>');
    await first.import({ ...TEMPLATE, templateId: 'ticker', name: 'Ticker' }, '<html>t</html>');

    // A page reload = a brand-new store instance reading the same persisted files.
    const reloaded = new LibraryStore(ws);
    await reloaded.hydrate();

    expect(
      reloaded
        .list()
        .map((t) => t.templateId)
        .sort(),
    ).toEqual(['lower-third', 'ticker']);
    expect(reloaded.get('lower-third')?.name).toBe('Lower Third');
    expect(reloaded.html('lower-third')).toBe('<html>persisted</html>');
  });

  it('persists ids that are not filename-safe (percent-encoded on disk, round-tripped)', async () => {
    const ws = new MemoryWorkspace();
    const weird = 'a/b c:d?e'; // IdSchema is z.string().min(1) — any non-empty string
    const first = new LibraryStore(ws);
    await first.import({ ...TEMPLATE, templateId: weird }, '<html>w</html>');

    const reloaded = new LibraryStore(ws);
    await reloaded.hydrate();
    expect(reloaded.get(weird)?.templateId).toBe(weird);
    expect(reloaded.html(weird)).toBe('<html>w</html>');
  });

  it('delete drops the entry unconditionally and persistently', async () => {
    const ws = new MemoryWorkspace();
    const store = new LibraryStore(ws);
    await store.import(TEMPLATE, '<html/>');
    await store.delete('lower-third');

    const reloaded = new LibraryStore(ws);
    await reloaded.hydrate();
    expect(reloaded.list()).toEqual([]);
  });

  it('hydrate skips a corrupt/partial record instead of throwing', async () => {
    const ws = new MemoryWorkspace();
    const good = new LibraryStore(ws);
    await good.import(TEMPLATE, '<html/>');
    // Simulate a half-written file at a library path.
    await ws.writeText('library/broken.json', '{ this is not valid json');

    const reloaded = new LibraryStore(ws);
    await expect(reloaded.hydrate()).resolves.toBeUndefined();
    expect(reloaded.list()).toEqual([TEMPLATE]);
  });
});

/**
 * 🔴 `CHANNEL-TEMPLATES-01` — THIS BROWSER'S COPY, PER CHANNEL. Each channel has its own list, so
 * an import records the channel it was made on; a record written before the lists answers for any
 * channel that has none of its own.
 */
describe('LibraryStore — per channel', () => {
  const V2: TemplateInfo = { ...TEMPLATE, name: 'Lower Third v2' };

  it('an import on CH 2 is CH 2’s: CH 1 does not list it — and each channel keeps its own version', async () => {
    const store = new LibraryStore(new MemoryWorkspace());
    await store.import(TEMPLATE, '<html>v1</html>', 1);
    await store.import(V2, '<html>v2</html>', 2);

    expect(store.get('lower-third', 1)?.name).toBe('Lower Third');
    expect(store.get('lower-third', 2)?.name).toBe('Lower Third v2');
    expect(store.html('lower-third', 1)).toBe('<html>v1</html>');
    expect(store.html('lower-third', 2)).toBe('<html>v2</html>');
    // Control: a channel neither import named lists nothing.
    expect(store.list(3)).toEqual([]);
  });

  it('a pre-channel record answers for every channel with none of its own, and survives a reload', async () => {
    const ws = new MemoryWorkspace();
    // Written exactly as a store from before the lists wrote it: no channel.
    await ws.writeJson('library/lower-third.json', {
      template: TEMPLATE,
      html: '<html>old</html>',
    });
    await ws.writeJson('library/2@lower-third.json', {
      template: V2,
      html: '<html>v2</html>',
      channel: 2,
    });
    const store = new LibraryStore(ws);
    await store.hydrate();

    expect(store.html('lower-third', 1)).toBe('<html>old</html>');
    expect(store.html('lower-third', 2)).toBe('<html>v2</html>');
  });

  it('a removal from CH 2 leaves CH 1’s own record as it was', async () => {
    const ws = new MemoryWorkspace();
    const store = new LibraryStore(ws);
    await store.import(TEMPLATE, '<html>v1</html>', 1);
    await store.import(V2, '<html>v2</html>', 2);

    await store.delete('lower-third', 2);
    expect(store.has('lower-third', 2)).toBe(false);
    expect(store.html('lower-third', 1)).toBe('<html>v1</html>');
    const reloaded = new LibraryStore(ws);
    await reloaded.hydrate();
    expect(reloaded.has('lower-third', 2)).toBe(false);
    expect(reloaded.html('lower-third', 1)).toBe('<html>v1</html>');
  });

  it('a removal from CH 2 hides a pre-channel record on CH 2 ONLY — CH 1 still lists it and still has its page, across a reload', async () => {
    const ws = new MemoryWorkspace();
    // The upgrade case: the only copy is the one written before the lists, answering for all.
    await ws.writeJson('library/lower-third.json', {
      template: TEMPLATE,
      html: '<html>old</html>',
    });
    const store = new LibraryStore(ws);
    await store.hydrate();

    await store.delete('lower-third', 2);
    expect(store.has('lower-third', 2)).toBe(false);
    expect(store.list(2)).toEqual([]);
    expect(store.html('lower-third', 2)).toBeNull();
    // CH 1 — and any other channel — is exactly as it was: listed, and PVW still has the page.
    expect(store.list(1)).toEqual([TEMPLATE]);
    expect(store.html('lower-third', 1)).toBe('<html>old</html>');
    expect(store.html('lower-third', 3)).toBe('<html>old</html>');

    const reloaded = new LibraryStore(ws);
    await reloaded.hydrate();
    expect(reloaded.has('lower-third', 2)).toBe(false);
    expect(reloaded.html('lower-third', 1)).toBe('<html>old</html>');

    // CH 2 imports it again: its own record answers there; a second removal hides it again, and
    // CH 1 is still untouched.
    await reloaded.import(V2, '<html>v2</html>', 2);
    expect(reloaded.html('lower-third', 2)).toBe('<html>v2</html>');
    await reloaded.delete('lower-third', 2);
    expect(reloaded.has('lower-third', 2)).toBe(false);
    expect(reloaded.html('lower-third', 1)).toBe('<html>old</html>');
  });

  it('control: a removal naming NO channel deletes the pre-channel record outright', async () => {
    const ws = new MemoryWorkspace();
    await ws.writeJson('library/lower-third.json', {
      template: TEMPLATE,
      html: '<html>old</html>',
    });
    const store = new LibraryStore(ws);
    await store.hydrate();

    await store.delete('lower-third');
    expect(store.has('lower-third', 1)).toBe(false);
    const reloaded = new LibraryStore(ws);
    await reloaded.hydrate();
    expect(reloaded.has('lower-third', 1)).toBe(false);
    expect(reloaded.list()).toEqual([]);
  });
});
