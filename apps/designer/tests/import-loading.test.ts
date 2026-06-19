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
 * D-067 — image-import loading indicator. Verifies the shared `useImportPending`
 * mechanism (clears on resolve AND reject) and that BOTH asset panels show the
 * loading tile while an import is pending, replaced by the real thumbnail on
 * success and cleared on error.
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

function meta(filename: string): AssetMeta {
  return {
    assetId: filename,
    kind: 'image',
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
let assetsImport: () => Promise<{ asset: AssetMeta }> = () => Promise.resolve({ asset: meta('x') });
let sharedImport: () => Promise<{ image: AssetMeta }> = () => Promise.resolve({ image: meta('x') });

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
      import: () => assetsImport(),
      remove: () => Promise.resolve({ ok: true }),
    },
    sharedImages: {
      list: () => Promise.resolve([]),
      onImported: (h: (m: AssetMeta) => void) => {
        onSharedImported = h;
        return noop;
      },
      url: () => Promise.resolve(null),
      import: () => sharedImport(),
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

const importingTiles = (): number =>
  container!.querySelectorAll('[data-role="importing-thumb"]').length;
const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

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

  it('pending goes 1 then 0 on resolve, and 1 then 0 on reject (no stuck spinner)', async () => {
    render(Probe);
    expect(latest!.pending).toBe(0);

    const ok = deferred<number>();
    let tracked!: Promise<number>;
    act(() => {
      tracked = latest!.track(ok.promise);
    });
    expect(latest!.pending).toBe(1);
    await act(async () => {
      ok.resolve(1);
      await tracked;
    });
    expect(latest!.pending).toBe(0);

    const bad = deferred<number>();
    let trackedBad!: Promise<number>;
    act(() => {
      trackedBad = latest!.track(bad.promise);
    });
    expect(latest!.pending).toBe(1);
    await act(async () => {
      bad.reject(new Error('cancelled'));
      await trackedBad.catch(() => undefined);
    });
    expect(latest!.pending).toBe(0);
    latest = null;
  });
});

describe('SharedLibraryPanel import indicator (D-067)', () => {
  it('shows the tile while pending, replaced by the thumbnail on success', async () => {
    installBridge();
    const d = deferred<{ image: AssetMeta }>();
    sharedImport = () => d.promise;
    render(SharedLibraryPanel);
    await flush();
    expect(importingTiles()).toBe(0);

    act(() => byLabel('Add library image').click());
    expect(importingTiles()).toBe(1);

    await act(async () => {
      d.resolve({ image: meta('logo.png') });
      onSharedImported?.(meta('logo.png'));
      await Promise.resolve();
    });
    expect(importingTiles()).toBe(0);
    // The real thumbnail (a button titled with the filename) has taken over.
    expect(container!.querySelector('[title="logo.png"]')).not.toBeNull();
  });

  it('clears the tile on error (no stuck spinner)', async () => {
    installBridge();
    const d = deferred<{ image: AssetMeta }>();
    sharedImport = () => d.promise;
    render(SharedLibraryPanel);
    await flush();

    act(() => byLabel('Add library image').click());
    expect(importingTiles()).toBe(1);

    await act(async () => {
      d.reject(new Error('cancelled'));
      await Promise.resolve();
    });
    expect(importingTiles()).toBe(0);
  });
});

describe('ProjectAssetsPanel import indicator (D-067)', () => {
  it('shows the tile while pending, replaced by the thumbnail on success', async () => {
    installBridge();
    const d = deferred<{ asset: AssetMeta }>();
    assetsImport = () => d.promise;
    render(ProjectAssetsPanel);
    await flush();
    expect(importingTiles()).toBe(0);

    // Open the add menu (opens on pointerdown), then choose "Image…".
    act(() => byLabel('Add asset').dispatchEvent(new Event('pointerdown', { bubbles: true })));
    act(() => buttonByText('Image…').click());
    expect(importingTiles()).toBe(1);

    await act(async () => {
      d.resolve({ asset: meta('pic.png') });
      onAssetsImported?.(meta('pic.png'));
      await Promise.resolve();
    });
    expect(importingTiles()).toBe(0);
    expect(container!.querySelector('[title="pic.png"]')).not.toBeNull();
  });

  it('clears the tile on error (no stuck spinner)', async () => {
    installBridge();
    const d = deferred<{ asset: AssetMeta }>();
    assetsImport = () => d.promise;
    render(ProjectAssetsPanel);
    await flush();

    act(() => byLabel('Add asset').dispatchEvent(new Event('pointerdown', { bubbles: true })));
    act(() => buttonByText('Image…').click());
    expect(importingTiles()).toBe(1);

    await act(async () => {
      d.reject(new Error('cancelled'));
      await Promise.resolve();
    });
    expect(importingTiles()).toBe(0);
  });
});
