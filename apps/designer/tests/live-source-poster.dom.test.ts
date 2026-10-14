/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetMeta, Element, VideoPlaceholderElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * ⭐ `D-137` — the Live Source POSTER is settable. The runtime draws `posterAssetId` in place of the
 * bars while authoring, and until now nothing in the Designer could write it.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noUnsub = (): void => {
  /* no unsubscribe needed in tests */
};
const asset = (assetId: string, kind: AssetMeta['kind'], filename: string): AssetMeta =>
  ({ assetId, kind, filename, sha256: assetId, bytes: 1 }) as unknown as AssetMeta;
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: () =>
      Promise.resolve([
        asset('img-1', 'image', 'studio.png'),
        asset('font-1', 'font', 'Vazir.woff2'),
      ]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: () => Promise.resolve([{ assetId: 'logo-1', filename: 'brand.png' }]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

function seedPlate(over: Partial<VideoPlaceholderElement> = {}): void {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'demo',
    'lower-third',
  );
  designerStore.setScene(scene, null);
  designerStore.addElement({ ...defaultLiveSource('p1', 100, 100), ...over } as Element);
}

function plateNow(): VideoPlaceholderElement {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)?.layers[0]?.children.find(
    (c) => c.id === 'p1',
  ) as VideoPlaceholderElement;
}

async function render(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(createElement(StyleSection, { element: plateNow(), selectedKeyframe: null })),
  );
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return container;
}

const posterSelect = (c: HTMLElement): HTMLSelectElement | null =>
  c.querySelector('select[aria-label="poster"]');

function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('D-137 — the poster picker', () => {
  it('🔴 offers "bars" and the PICTURES — the project’s and the shared library’s, never a font', async () => {
    seedPlate();
    const select = posterSelect(await render());
    expect([...(select?.options ?? [])].map((o) => o.value)).toEqual(['', 'img-1', 'logo-1']);
    expect([...(select?.options ?? [])].map((o) => o.textContent)).toEqual([
      'bars',
      'studio (project)',
      'brand (shared)',
    ]);
    expect(select?.value).toBe('');
  });

  it('choosing a picture writes posterAssetId; choosing "bars" clears it', async () => {
    seedPlate();
    const select = posterSelect(await render());
    if (select === null) throw new Error('no poster select');
    choose(select, 'img-1');
    expect(plateNow().posterAssetId).toBe('img-1');
    choose(select, '');
    expect(plateNow().posterAssetId).toBeUndefined();
  });

  it('a stored poster that resolves to neither list is shown as itself, missing', async () => {
    seedPlate({ posterAssetId: 'gone' });
    const select = posterSelect(await render());
    expect(select?.value).toBe('gone');
    expect([...(select?.options ?? [])].find((o) => o.value === 'gone')?.textContent).toBe(
      'gone (missing)',
    );
  });
});
