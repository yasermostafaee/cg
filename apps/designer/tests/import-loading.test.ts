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
 * D-067 — image-import loading indicator. The tile shows only once a file is
 * actually selected (the bridge's `onPicked`), so a cancelled picker shows
 * nothing; it clears on success (replaced by the thumbnail) and on error. Covers
 * the shared `useImportPending` mechanism and BOTH panels (project image + font,
 * and shared image).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = (): void => undefined;

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let onAssetsImported: ((m: AssetMeta) => void) | null = null;
let onSharedImported: ((m: AssetMeta) => void) | null = null;
// Each import stub receives the bridge's `onPicked`; call it to simulate "a file
// was selected", omit it to simulate a cancelled picker.
let assetsImport: (onPicked?: () => void) => Promise<{ asset: AssetMeta }> = () =>
  Promise.resolve({ asset: meta('x') });
let sharedImport: (onPicked?: () => void) => Promise<{ image: AssetMeta }> = () =>
  Promise.resolve({ image: meta('x') });

function installBridge(): void {
  (window as unknown as { cg: unknown }).cg = {
    assets: {
      list: () => Promise.resolve([]),
      onImported: (h: (m: AssetMeta) => void) => {
        onAssetsImported = h;
        return noop;
      },
      onCleared: () => noop,
      url: () => Promise.resolve(null),
      import: (_req: unknown, onPicked?: () => void) => assetsImport(onPicked),
      remove: () => Promise.resolve({ ok: true }),
    },
    sharedImages: {
      list: () => Promise.resolve([]),
      onImported: (h: (m: AssetMeta) => void) => {
        onSharedImported = h;
        return noop;
      },
      url: () => Promise.resolve(null),
      import: (onPicked?: () => void) => sharedImport(onPicked),
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
  if (el === undefined) throw new Error(`no button with text "${text}"`);
  return el;
}

const tiles = (): number => container!.querySelectorAll('[data-role="importing-thumb"]').length;
const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

/** Open the Project Assets add menu (opens on pointerdown) and pick a kind. */
function pickProjectKind(label: 'Image…' | 'Font…'): void {
  act(() => byLabel('Add asset').dispatchEvent(new Event('pointerdown', { bubbles: true })));
  act(() => buttonByText(label).click());
}

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  onAssetsImported = null;
  onSharedImported = null;
  assetsImport = () => Promise.resolve({ asset: meta('x') });
  sharedImport = () => Promise.resolve({ image: meta('x') });
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
    act(() => end()); // idempotent — no underflow
    expect(latest!.pending).toBe(0);
    latest = null;
  });
});

describe('SharedLibraryPanel import indicator (D-067)', () => {
  it('shows the tile after a file is selected, replaced by the thumbnail on success', async () => {
    installBridge();
    const d = deferred<{ image: AssetMeta }>();
    sharedImport = (onPicked) => {
      onPicked?.();
      return d.promise;
    };
    render(SharedLibraryPanel);
    await flush();
    expect(tiles()).toBe(0);

    act(() => byLabel('Add library image').click());
    expect(tiles()).toBe(1);

    await act(async () => {
      d.resolve({ image: meta('logo.png') });
      onSharedImported?.(meta('logo.png'));
      await Promise.resolve();
    });
    expect(tiles()).toBe(0);
    expect(container!.querySelector('[title="logo.png"]')).not.toBeNull();
  });

  it('shows NO tile when the picker is cancelled (no file selected)', async () => {
    installBridge();
    sharedImport = () => Promise.reject(new Error('No file selected')); // onPicked never fires
    render(SharedLibraryPanel);
    await flush();

    act(() => byLabel('Add library image').click());
    await flush();
    expect(tiles()).toBe(0);
  });

  it('clears the tile on error (no stuck spinner)', async () => {
    installBridge();
    const d = deferred<{ image: AssetMeta }>();
    sharedImport = (onPicked) => {
      onPicked?.();
      return d.promise;
    };
    render(SharedLibraryPanel);
    await flush();

    act(() => byLabel('Add library image').click());
    expect(tiles()).toBe(1);
    await act(async () => {
      d.reject(new Error('decode failed'));
      await Promise.resolve();
    });
    expect(tiles()).toBe(0);
  });
});

describe('ProjectAssetsPanel import indicator (D-067)', () => {
  it('image path: tile shows after selecting, replaced by the thumbnail on success', async () => {
    installBridge();
    const d = deferred<{ asset: AssetMeta }>();
    assetsImport = (onPicked) => {
      onPicked?.();
      return d.promise;
    };
    render(ProjectAssetsPanel);
    await flush();
    expect(tiles()).toBe(0);

    pickProjectKind('Image…');
    expect(tiles()).toBe(1);

    await act(async () => {
      d.resolve({ asset: meta('pic.png') });
      onAssetsImported?.(meta('pic.png'));
      await Promise.resolve();
    });
    expect(tiles()).toBe(0);
    expect(container!.querySelector('[title="pic.png"]')).not.toBeNull();
  });

  it('font path: tile shows after selecting, cleared on success', async () => {
    installBridge();
    const d = deferred<{ asset: AssetMeta }>();
    assetsImport = (onPicked) => {
      onPicked?.();
      return d.promise;
    };
    render(ProjectAssetsPanel);
    await flush();

    pickProjectKind('Font…');
    expect(tiles()).toBe(1);

    await act(async () => {
      d.resolve({ asset: meta('brand.ttf', 'font') });
      await Promise.resolve();
    });
    expect(tiles()).toBe(0);
  });

  it('shows NO tile when the picker is cancelled (no file selected)', async () => {
    installBridge();
    assetsImport = () => Promise.reject(new Error('No file selected')); // onPicked never fires
    render(ProjectAssetsPanel);
    await flush();

    pickProjectKind('Image…');
    await flush();
    expect(tiles()).toBe(0);
  });

  it('clears the tile on error (no stuck spinner)', async () => {
    installBridge();
    const d = deferred<{ asset: AssetMeta }>();
    assetsImport = (onPicked) => {
      onPicked?.();
      return d.promise;
    };
    render(ProjectAssetsPanel);
    await flush();

    pickProjectKind('Image…');
    expect(tiles()).toBe(1);
    await act(async () => {
      d.reject(new Error('decode failed'));
      await Promise.resolve();
    });
    expect(tiles()).toBe(0);
  });
});
