import { describe, expect, it } from 'vitest';
import { MemoryWorkspace } from '@cg/storage';
import type { TemplateInfo } from '@cg/shared-ipc';
import { LibraryStore } from '../src/platform/library/LibraryStore.js';

/**
 * B-085 — the browser-local template library is the source of truth. These pin the
 * pure persistence + index behavior off any socket: import/list/get, persistence
 * across a simulated reload (a second store over the SAME workspace), and the
 * R-005 refuse-while-referenced guard on the offline remove path.
 */

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  name: 'Lower Third',
  templateType: 'lower-third',
  fields: [],
};

describe('LibraryStore', () => {
  it('registers a template locally and lists / gets it', async () => {
    const store = new LibraryStore(new MemoryWorkspace());
    const res = await store.import(TEMPLATE, '<html>v1</html>');

    expect(res).toEqual({ registered: true, templateId: 'lower-third' });
    expect(store.list()).toEqual([TEMPLATE]);
    expect(store.get('lower-third')).toEqual(TEMPLATE);
    expect(store.get('missing')).toBeNull();
    // The delivery/reconcile set carries the HTML.
    expect(store.entries()).toEqual([{ template: TEMPLATE, html: '<html>v1</html>' }]);
  });

  it('a re-import replaces the prior entry (metadata + html)', async () => {
    const store = new LibraryStore(new MemoryWorkspace());
    await store.import(TEMPLATE, '<html>v1</html>');
    await store.import({ ...TEMPLATE, name: 'Renamed' }, '<html>v2</html>');

    expect(store.list()).toHaveLength(1);
    expect(store.get('lower-third')?.name).toBe('Renamed');
    expect(store.entries()[0]?.html).toBe('<html>v2</html>');
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
    expect(reloaded.entries().find((e) => e.template.templateId === 'lower-third')?.html).toBe(
      '<html>persisted</html>',
    );
  });

  it('persists ids that are not filename-safe (percent-encoded on disk, round-tripped)', async () => {
    const ws = new MemoryWorkspace();
    const weird = 'a/b c:d?e'; // IdSchema is z.string().min(1) — any non-empty string
    const first = new LibraryStore(ws);
    await first.import({ ...TEMPLATE, templateId: weird }, '<html>w</html>');

    const reloaded = new LibraryStore(ws);
    await reloaded.hydrate();
    expect(reloaded.get(weird)?.templateId).toBe(weird);
    expect(reloaded.entries()[0]?.html).toBe('<html>w</html>');
  });

  it('remove: unreferenced → ok and gone; referenced → in-use refusal; unknown → unknown-template', async () => {
    const store = new LibraryStore(new MemoryWorkspace());
    await store.import(TEMPLATE, '<html/>');

    // Referenced by 2 stack items → refused, still present.
    const refused = await store.remove('lower-third', 2);
    expect(refused).toMatchObject({ ok: false, reason: 'in-use' });
    expect(refused.message).toContain('2 stack item(s)');
    expect(store.has('lower-third')).toBe(true);

    // Unknown id → distinct reason, never a silent success.
    expect(await store.remove('nope', 0)).toMatchObject({ ok: false, reason: 'unknown-template' });

    // Unreferenced → removed, and it does not survive a reload.
    expect(await store.remove('lower-third', 0)).toEqual({ ok: true });
    expect(store.has('lower-third')).toBe(false);
    expect(store.list()).toEqual([]);
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
