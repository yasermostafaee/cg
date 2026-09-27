import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROUTE_NOT_SUPPORTED_YET } from '@cg/shared-ipc';
import { MockRuntime } from '../src/platform/MockRuntime.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §1.G parity — **THE OFFLINE CONSOLE'S SOURCES ARE A SEEDED PLAYOUT, BUILT BY
 * THE ONE BUILDER.**
 *
 * Auth off has no Playout: the mock's two lists come from `window.CG_E2E_PLAYOUT_SOURCES` (an e2e
 * arms it; nothing in the console fills it), and they go through `buildPlayoutSourceCatalog` — the
 * function the bridge's reader calls — so the offline console cannot come to read one answer two
 * ways. Without a seed it has no sources at all, and never invents one.
 */

class MemoryStorage {
  #items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.#items.set(key, value);
  }
  removeItem(key: string): void {
    this.#items.delete(key);
  }
  clear(): void {
    this.#items.clear();
  }
}

interface SeedHost {
  CG_E2E_PLAYOUT_SOURCES?: unknown;
  localStorage?: MemoryStorage;
}

/** The page's globals, as the mock reads them: the seed, and a storage that works in Node. */
const host = globalThis as unknown as SeedHost;

const SEED = {
  inputs: {
    epoch: 'epoch-1',
    inputs: [
      {
        id: 'li-studio1',
        name: 'Studio 1',
        producer: { kind: 'ndi', source: 'STUDIO-PC (Cam 1)' },
      },
      {
        id: 'li-newscam',
        name: 'دوربین خبر',
        producer: { kind: 'stream', url: 'rtsp://cam:secret@10.0.0.21/live' },
      },
      { id: 'li-input3', name: 'ورودی ۳', producer: { kind: 'route', channel: 9, layer: 12 } },
    ],
  },
  departed: [
    { id: 'li-studio5', name: 'Studio 5', producer: { kind: 'ndi', source: 'OLD (Cam)' } },
  ],
  media: [
    {
      id: 'm-kelip',
      name: 'کلیپ معرفی',
      clip: 'C:/Media/kelip.mp4',
      type: 'video',
      durationMs: 30_000,
    },
    {
      id: 'm-khabar',
      name: 'خبر ۱۴۰۵',
      clip: 'C:/Media/khabar.mp4',
      type: 'video',
      durationMs: 60_000,
    },
    {
      id: 'm-audio',
      name: 'Bed music',
      clip: 'C:/Media/bed.wav',
      type: 'audio',
      durationMs: 60_000,
    },
    { id: 'm-studio1', name: 'Studio 1', clip: 'C:/Media/studio1.mov', type: 'video' },
  ],
};

beforeEach(() => {
  host.localStorage = new MemoryStorage();
});

afterEach(() => {
  delete host.CG_E2E_PLAYOUT_SOURCES;
  delete host.localStorage;
});

describe('without a seed there is no Playout', () => {
  it('no inputs, no media, no invented source', () => {
    const rt = new MockRuntime();
    expect(rt.sourceCatalog().sources).toEqual([]);
    expect(rt.searchMedia({ q: '' })).toMatchObject({ ok: true, items: [], total: 0 });
  });
});

describe('with a seed, the one builder decides', () => {
  it('inputs are `in-<id>`, in the Playout’s order; the route is gated; one that left is kept, unavailable', () => {
    host.CG_E2E_PLAYOUT_SOURCES = SEED;
    const sources = new MockRuntime().sourceCatalog().sources;
    expect(sources.map((s) => s.id)).toEqual([
      'in-li-studio1',
      'in-li-newscam',
      'in-li-input3',
      'in-li-studio5',
    ]);
    expect(sources.find((s) => s.id === 'in-li-input3')).toMatchObject({
      status: 'unusable',
      reason: ROUTE_NOT_SUPPORTED_YET,
    });
    expect(sources.find((s) => s.id === 'in-li-studio5')).toMatchObject({
      status: 'unavailable',
      departed: true,
    });
  });

  it('a media search normalises as the Playout does, pages, and never offers audio', () => {
    host.CG_E2E_PLAYOUT_SOURCES = SEED;
    const rt = new MockRuntime();
    const kelip = rt.searchMedia({ q: 'كليپ' });
    expect(kelip.ok && kelip.items.map((i) => i.name)).toEqual(['کلیپ معرفی']);
    const khabar = rt.searchMedia({ q: 'خبر 1405' });
    expect(khabar.ok && khabar.items.map((i) => i.id)).toEqual(['md-m-khabar']);
    const all = rt.searchMedia({ q: '', limit: 2 });
    if (!all.ok) throw new Error('search failed');
    expect(all.total).toBe(3); // audio is not a plate's
    expect(all.items).toHaveLength(2);
    const next = rt.searchMedia({ q: '', limit: 2, cursor: all.nextCursor ?? undefined });
    expect(next.ok && next.items).toHaveLength(1);
    // A cursor is valid only with the query that made it.
    expect(rt.searchMedia({ q: 'Studio', cursor: all.nextCursor ?? undefined })).toMatchObject({
      ok: false,
      reason: 'playout-refused',
    });
    // Items never carry a path.
    expect(JSON.stringify(all)).not.toContain('C:/');
  });

  it('binding a media id binds it from the mock’s OWN library, and the catalogue then carries it', () => {
    host.CG_E2E_PLAYOUT_SOURCES = SEED;
    const rt = new MockRuntime();
    expect(
      rt.setSourceAssignments({
        assignments: [{ templateId: 't', plateId: 'guest-1', sourceId: 'md-m-studio1' }],
      }),
    ).toEqual({ ok: true });
    const media = rt.sourceCatalog().sources.find((s) => s.id === 'md-m-studio1');
    expect(media).toMatchObject({
      origin: 'media',
      name: 'Studio 1',
      producer: { kind: 'media', file: 'C:/Media/studio1.mov' },
    });
    // Control: an id the library does not have cannot be bound.
    expect(
      rt.setSourceAssignments({
        assignments: [{ templateId: 't', plateId: 'guest-1', sourceId: 'md-m-nope' }],
      }),
    ).toMatchObject({ ok: false, reason: 'source-unusable' });
  });

  it('an unusable or departed entry cannot be NEWLY bound; one already bound stays', () => {
    host.CG_E2E_PLAYOUT_SOURCES = SEED;
    const rt = new MockRuntime();
    expect(
      rt.setSourceAssignments({
        assignments: [{ templateId: 't', plateId: 'guest-1', sourceId: 'in-li-input3' }],
      }),
    ).toMatchObject({ ok: false, reason: 'source-unusable' });
    // A binding to Studio 5 written before it left (the store as the page reloaded it)…
    localStorage.setItem(
      'cg-runtime:source-assignments',
      JSON.stringify({
        assignments: [{ templateId: 't', plateId: 'guest-1', sourceId: 'in-li-studio5' }],
      }),
    );
    // …is KEPT on read (never pruned), and an edit elsewhere does not trip over it.
    expect(rt.sourceAssignments().assignments).toHaveLength(1);
    expect(
      rt.setSourceAssignments({
        assignments: [
          { templateId: 't', plateId: 'guest-1', sourceId: 'in-li-studio5' },
          { templateId: 't', plateId: 'guest-2', sourceId: 'in-li-studio1' },
        ],
      }),
    ).toEqual({ ok: true });
  });

  it('`sources.set-config` carries the band only, and a hand-made entry in the stored file is ignored', () => {
    host.CG_E2E_PLAYOUT_SOURCES = SEED;
    localStorage.setItem(
      'cg-runtime:source-catalog',
      JSON.stringify({
        sources: [
          { id: 'src-old', name: 'Old hand-made', producer: { kind: 'route', channel: 2 } },
        ],
      }),
    );
    const rt = new MockRuntime();
    expect(rt.sourceCatalog().sources.some((s) => s.id === 'src-old')).toBe(false);
    expect(rt.setSourceBand({ layerRange: { start: 60, end: 69 } })).toEqual({ ok: true });
    expect(rt.sourceCatalog().layerRange).toEqual({ start: 60, end: 69 });
    // P-031 — the stored entry is not migrated, and not deleted either.
    const stored = JSON.parse(localStorage.getItem('cg-runtime:source-catalog') ?? '{}') as {
      sources: { id: string }[];
    };
    expect(stored.sources.map((s) => s.id)).toEqual(['src-old']);
  });

  it('§1.E — the console never HOLDS a stream password: read and pushed, both redacted', async () => {
    host.CG_E2E_PLAYOUT_SOURCES = SEED;
    // Control: the mock itself holds the whole URL — it is what a take would play.
    expect(JSON.stringify(new MockRuntime().sourceCatalog())).toContain('cam:secret@');
    const bridge = createMockBridge();
    const pushed: string[] = [];
    const off = bridge.sources.onConfigChanged((c) => pushed.push(JSON.stringify(c)));
    const read = JSON.stringify(await bridge.sources.config());
    expect(read).toContain('rtsp://***@10.0.0.21/live');
    expect(read).not.toContain('secret');
    // A change pushes the catalogue again (here, the band), redacted the same way.
    expect(await bridge.sources.setConfig({ layerRange: { start: 60, end: 69 } })).toEqual({
      ok: true,
    });
    off();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toContain('rtsp://***@10.0.0.21/live');
    expect(pushed[0]).not.toContain('secret');
  });

  it('🔴 the ROW doors bind as the bridge does: update and swap refuse what cannot be bound, and bind media first', async () => {
    host.CG_E2E_PLAYOUT_SOURCES = SEED;
    const cg = createMockBridge();
    const rect = { x: 0, y: 0, width: 960, height: 540 };
    await cg.templates.import({
      template: {
        templateId: 't',
        templateType: 'debate',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
          sources: [{ elementId: 'e1', sourceId: 'l-1', rect, dynamic: false }],
          looks: [{ id: 'two', name: '2-box', entered: { mode: 'cut' }, rects: { 'l-1': rect } }],
          defaultLookId: 'two',
        },
      } as never,
      html: '<!doctype html><html><body>t</body></html>',
    });
    await cg.stack.load({ itemId: 'item-1', templateId: 't', fields: {} });
    const update = (sourceId: string) =>
      cg.stack.update({
        itemId: 'item-1',
        fields: {},
        mergeMode: 'merge',
        lookBindings: { two: { 'l-1': sourceId } },
      });
    // The route gate, and an id the catalogue does not hold: the WHOLE update is refused.
    expect(await update('in-li-input3')).toMatchObject({
      accepted: false,
      errorCode: 'source-unusable',
    });
    expect(await update('src-handmade')).toMatchObject({
      accepted: false,
      errorCode: 'unknown-source',
    });
    // A media item is bound from the mock's own library, and the catalogue then carries it.
    expect(await update('md-m-kelip')).toMatchObject({ accepted: true });
    expect((await cg.sources.config()).sources.some((s) => s.id === 'md-m-kelip')).toBe(true);
    // The swap is a new binding: the same rule, the same sentences…
    expect(
      await cg.stack.swapLiveSource({ itemId: 'item-1', plateId: 'l-1', sourceId: 'in-li-input3' }),
    ).toMatchObject({ ok: false, reason: 'source-unusable' });
    expect(
      await cg.stack.swapLiveSource({ itemId: 'item-1', plateId: 'l-1', sourceId: 'src-handmade' }),
    ).toEqual({
      ok: false,
      reason: 'unknown-source',
      message: 'That source is not one the Playout offers. Choose another.',
    });
    // …and control: a camera the Playout offers is swapped in.
    expect(
      await cg.stack.swapLiveSource({
        itemId: 'item-1',
        plateId: 'l-1',
        sourceId: 'in-li-studio1',
      }),
    ).toMatchObject({ ok: true });
  });

  it('a Playout that does not answer says so', () => {
    host.CG_E2E_PLAYOUT_SOURCES = { ...SEED, down: true };
    expect(new MockRuntime().searchMedia({ q: '' })).toEqual({
      ok: false,
      reason: 'playout-unreachable',
      message: 'The Playout did not answer.',
    });
  });
});
