/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetMeta } from '@cg/shared-ipc';
import { useImportPending } from '../src/renderer/features/assets/useImportPending.js';
import { ProjectAssetsPanel } from '../src/renderer/features/assets/ProjectAssetsPanel.js';
import { SharedLibraryPanel } from '../src/renderer/features/sharedLibrary/SharedLibraryPanel.js';
import { designerStore } from '../src/renderer/state/store.js';

/**
 * D-067 (add-import-multiselect-prepend) — the pick→store seam. A loading tile is
 * shown per picked file (only after a real selection; cancel shows none), each
 * import is independent (one failing clears only its tile), and fresh imports are
 * prepended (a multi-file batch lands at the top in selection order). Covers the
 * shared `useImportPending` mechanism and both asset panels.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = (): void => undefined;

function meta(filename: string, kind: AssetMeta['kind'] = 'image'): AssetMeta {
  return {
    assetId: filename,
    kind,
    filename,
    sha256: 'a'.repeat(64),
    byteSize: 4,
    workingPath: `x/${filename}`,
  };
}
const fileNamed = (name: string): File => ({ name }) as unknown as File;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let onAssetsImported: ((m: AssetMeta) => void) | null = null;
let onSharedImported: ((m: AssetMeta) => void) | null = null;
let assetsList: AssetMeta[] = [];
let sharedList: AssetMeta[] = [];
let assetsPick: () => Promise<File[]> = () => Promise.resolve([]);
let sharedPick: () => Promise<File[]> = () => Promise.resolve([]);
// store resolves with the meta and fires onImported (the real store emits `imported`);
// a name in `failNames` makes that file's store reject.
let failNames = new Set<string>();
// When true, store() stays pending forever — lets a test observe the loading tiles
// mid-import (the sequential loop holds on the first pending store).
let holdStores = false;
// Every filename store() is CALLED with — lets a test assert that type-rejected files
// (B-021) never reach store at all.
let storedNames: string[] = [];

function storeImpl(panel: 'assets' | 'shared', file: File): Promise<unknown> {
  storedNames.push(file.name);
  if (failNames.has(file.name)) return Promise.reject(new Error(`fail ${file.name}`));
  if (holdStores) return new Promise<never>(() => undefined);
  const m = meta(file.name);
  return Promise.resolve().then(() => {
    if (panel === 'assets') onAssetsImported?.(m);
    else onSharedImported?.(m);
    return panel === 'assets' ? { asset: m } : { image: m };
  });
}

function installBridge(): void {
  (window as unknown as { cg: unknown }).cg = {
    assets: {
      list: () => Promise.resolve(assetsList),
      onImported: (h: (m: AssetMeta) => void) => {
        onAssetsImported = h;
        return noop;
      },
      onCleared: () => noop,
      url: () => Promise.resolve(null),
      pick: () => assetsPick(),
      store: (file: File) => storeImpl('assets', file),
      remove: () => Promise.resolve({ ok: true }),
    },
    sharedImages: {
      list: () => Promise.resolve(sharedList),
      onImported: (h: (m: AssetMeta) => void) => {
        onSharedImported = h;
        return noop;
      },
      url: () => Promise.resolve(null),
      pick: () => sharedPick(),
      store: (file: File) => storeImpl('shared', file),
      remove: () => Promise.resolve({ ok: true }),
    },
  };
}

function render(element: Parameters<typeof createElement>[0]): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(element)));
}
function byLabel(label: string): HTMLElement {
  const el = container!.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (el === null) throw new Error(`no element with aria-label="${label}"`);
  return el;
}
function buttonByText(text: string): HTMLElement {
  const el = [...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (el === undefined) throw new Error(`no button "${text}"`);
  return el;
}
const tiles = (): number => container!.querySelectorAll('[data-role="importing-thumb"]').length;
/** Current app toast message (where the skipped-files notice is routed), or null. */
function noticeText(): string | null {
  return designerStore.get().notice;
}
/** Visible thumbnail filenames in DOM order (the real thumbs carry title=filename). */
function thumbTitles(role: 'shared' | 'assets'): string[] {
  const sel = role === 'shared' ? '[data-role="shared-library-grid"]' : '[data-role="assets-grid"]';
  return [...(container!.querySelector(sel)?.querySelectorAll('[title]') ?? [])].map(
    (e) => e.getAttribute('title') ?? '',
  );
}
/** Drain microtasks + the sequential store loop. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  onAssetsImported = null;
  onSharedImported = null;
  assetsList = [];
  sharedList = [];
  assetsPick = () => Promise.resolve([]);
  sharedPick = () => Promise.resolve([]);
  failNames = new Set<string>();
  holdStores = false;
  storedNames = [];
  designerStore._reset();
});

describe('useImportPending (D-067)', () => {
  let latest: ReturnType<typeof useImportPending> | null = null;
  function Probe(): null {
    latest = useImportPending();
    return null;
  }
  it('begin() increments; end() decrements and is idempotent', () => {
    render(Probe);
    expect(latest!.pending).toBe(0);
    let end!: () => void;
    act(() => {
      end = latest!.begin();
    });
    expect(latest!.pending).toBe(1);
    act(() => end());
    expect(latest!.pending).toBe(0);
    act(() => end());
    expect(latest!.pending).toBe(0);
    latest = null;
  });
});

describe('SharedLibraryPanel import (D-067 multiselect + prepend)', () => {
  it('cancelling the picker shows no loading tile', async () => {
    installBridge();
    sharedPick = () => Promise.resolve([]); // cancelled
    render(SharedLibraryPanel);
    await settle();
    act(() => byLabel('Add library image').click());
    await settle();
    expect(tiles()).toBe(0);
  });

  it('multi-select shows one loading tile per picked file', async () => {
    installBridge();
    holdStores = true; // keep imports pending so the tiles are observable
    sharedPick = () =>
      Promise.resolve([fileNamed('a.png'), fileNamed('b.png'), fileNamed('c.png')]);
    render(SharedLibraryPanel);
    await settle();
    act(() => byLabel('Add library image').click());
    await settle();
    expect(tiles()).toBe(3);
  });

  it('multi-select imports all and prepends them in selection order', async () => {
    installBridge();
    sharedPick = () =>
      Promise.resolve([fileNamed('a.png'), fileNamed('b.png'), fileNamed('c.png')]);
    render(SharedLibraryPanel);
    await settle();
    act(() => byLabel('Add library image').click());
    await settle();
    expect(tiles()).toBe(0);
    expect(thumbTitles('shared')).toEqual(['a.png', 'b.png', 'c.png']); // top, selection order
  });

  it('multi-select: one failing import clears its tile; the others still import', async () => {
    installBridge();
    failNames = new Set(['b.png']);
    sharedPick = () =>
      Promise.resolve([fileNamed('a.png'), fileNamed('b.png'), fileNamed('c.png')]);
    render(SharedLibraryPanel);
    await settle();

    act(() => byLabel('Add library image').click());
    await settle();
    expect(tiles()).toBe(0); // every tile cleared, including the failed one
    expect(thumbTitles('shared')).toEqual(['a.png', 'c.png']); // b skipped, others imported
  });

  it('a freshly imported image is prepended above existing items', async () => {
    installBridge();
    sharedList = [meta('old.png')];
    sharedPick = () => Promise.resolve([fileNamed('new.png')]);
    render(SharedLibraryPanel);
    await settle();
    expect(thumbTitles('shared')).toEqual(['old.png']);

    act(() => byLabel('Add library image').click());
    await settle();
    expect(thumbTitles('shared')).toEqual(['new.png', 'old.png']); // newest on top
  });

  it('re-importing an existing image moves it to the top (not skipped)', async () => {
    installBridge();
    sharedList = [meta('a.png'), meta('b.png')]; // store oldest→newest
    sharedPick = () => Promise.resolve([fileNamed('a.png')]); // re-pick the older one
    render(SharedLibraryPanel);
    await settle();
    expect(thumbTitles('shared')).toEqual(['b.png', 'a.png']); // newest-first display

    act(() => byLabel('Add library image').click());
    await settle();
    expect(thumbTitles('shared')).toEqual(['a.png', 'b.png']); // re-imported 'a' moved to top
  });
});

describe('ProjectAssetsPanel import (D-067)', () => {
  function pickKind(label: 'Image…' | 'Font…'): void {
    act(() => byLabel('Add asset').dispatchEvent(new Event('pointerdown', { bubbles: true })));
    act(() => buttonByText(label).click());
  }

  it('image path shows a loading tile while importing', async () => {
    installBridge();
    holdStores = true;
    assetsPick = () => Promise.resolve([fileNamed('pic.png')]);
    render(ProjectAssetsPanel);
    await settle();
    pickKind('Image…');
    await settle();
    expect(tiles()).toBe(1);
  });

  it('image path: a freshly imported asset lands at the top', async () => {
    installBridge();
    assetsList = [meta('existing.png')];
    assetsPick = () => Promise.resolve([fileNamed('pic.png')]);
    render(ProjectAssetsPanel);
    await settle();
    pickKind('Image…');
    await settle();
    expect(tiles()).toBe(0);
    expect(thumbTitles('assets')[0]).toBe('pic.png'); // freshly imported on top
  });

  it('cancelling shows no tile', async () => {
    installBridge();
    assetsPick = () => Promise.resolve([]);
    render(ProjectAssetsPanel);
    await settle();
    pickKind('Image…');
    await settle();
    expect(tiles()).toBe(0);
  });

  it('font path also shows a loading tile', async () => {
    installBridge();
    holdStores = true;
    assetsPick = () => Promise.resolve([fileNamed('brand.ttf')]);
    render(ProjectAssetsPanel);
    await settle();
    pickKind('Font…');
    await settle();
    expect(tiles()).toBe(1);
  });
});

/**
 * B-021 — `accept` is a bypassable picker hint ("All files" lets the operator pick a
 * pdf/mp3/mp4), so the SELECTION is validated after pick(): unsupported files are
 * rejected BEFORE store (no store call, no tile, no broken thumbnail) and reported via
 * the app's existing toast (`designerStore.showNotice` → `notice`); valid files in the
 * same batch still import + prepend.
 */
describe('post-pick file-type validation (B-021)', () => {
  it('shared library: all-unsupported selection → no store, no tile, only a notice', async () => {
    installBridge();
    sharedPick = () =>
      Promise.resolve([fileNamed('a.pdf'), fileNamed('b.mp3'), fileNamed('c.mp4')]);
    render(SharedLibraryPanel);
    await settle();
    act(() => byLabel('Add library image').click());
    await settle();
    expect(storedNames).toEqual([]); // nothing reached the store
    expect(tiles()).toBe(0); // no loading/broken tiles
    const notice = noticeText();
    expect(notice).toContain('a.pdf');
    expect(notice).toContain('b.mp3');
    expect(notice).toContain('c.mp4');
  });

  it('shared library: mixed batch → valid imports + prepends, unsupported skipped + noticed', async () => {
    installBridge();
    sharedList = [meta('old.png')];
    sharedPick = () =>
      Promise.resolve([fileNamed('logo.png'), fileNamed('doc.pdf'), fileNamed('song.mp3')]);
    render(SharedLibraryPanel);
    await settle();
    act(() => byLabel('Add library image').click());
    await settle();
    expect(storedNames).toEqual(['logo.png']); // only the image was stored
    expect(tiles()).toBe(0);
    expect(thumbTitles('shared')).toEqual(['logo.png', 'old.png']); // valid prepended, no broken tile
    const notice = noticeText();
    expect(notice).toContain('doc.pdf');
    expect(notice).toContain('song.mp3');
    expect(notice).not.toContain('logo.png'); // the valid file is not in the skip notice
  });

  it('project assets, Image…: a pdf alongside an image is skipped + noticed', async () => {
    installBridge();
    assetsPick = () => Promise.resolve([fileNamed('pic.png'), fileNamed('manual.pdf')]);
    render(ProjectAssetsPanel);
    await settle();
    act(() => byLabel('Add asset').dispatchEvent(new Event('pointerdown', { bubbles: true })));
    act(() => buttonByText('Image…').click());
    await settle();
    expect(storedNames).toEqual(['pic.png']);
    expect(tiles()).toBe(0);
    expect(thumbTitles('assets')[0]).toBe('pic.png');
    expect(noticeText()).toContain('manual.pdf');
  });

  it('project assets, Font…: a non-font is skipped + noticed, the font still imports', async () => {
    installBridge();
    assetsPick = () => Promise.resolve([fileNamed('brand.ttf'), fileNamed('evil.exe')]);
    render(ProjectAssetsPanel);
    await settle();
    act(() => byLabel('Add asset').dispatchEvent(new Event('pointerdown', { bubbles: true })));
    act(() => buttonByText('Font…').click());
    await settle();
    expect(storedNames).toEqual(['brand.ttf']);
    expect(tiles()).toBe(0);
    expect(noticeText()).toContain('evil.exe');
    expect(noticeText()).not.toContain('brand.ttf');
  });
});
