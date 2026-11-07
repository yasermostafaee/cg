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

const posterButton = (c: HTMLElement): HTMLButtonElement | null =>
  c.querySelector('button[aria-label="poster"]');

function click(button: HTMLButtonElement): void {
  act(() => button.click());
}

describe('D-137 — the poster picker', () => {
  it('🔴 offers "bars" and the PICTURES — the project’s and the shared library’s, never a font', async () => {
    seedPlate();
    const trigger = posterButton(await render());
    expect(trigger?.textContent).toContain('Bars');
    if (trigger === null) throw new Error('no poster picker');
    click(trigger);
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.textContent).toContain('Bars');
    expect(dialog?.querySelector('button[title="studio (project)"]')).not.toBeNull();
    expect(dialog?.querySelector('button[title="brand (shared)"]')).not.toBeNull();
    expect(dialog?.textContent).not.toContain('Vazir');
  });

  it('choosing a picture writes posterAssetId; choosing "bars" clears it', async () => {
    seedPlate();
    const container = await render();
    const trigger = posterButton(container);
    if (trigger === null) throw new Error('no poster picker');
    click(trigger);
    const projectPicture = document.querySelector<HTMLButtonElement>(
      '[role="dialog"] button[title="studio (project)"]',
    );
    if (projectPicture === null) throw new Error('no project picture choice');
    click(projectPicture);
    expect(plateNow().posterAssetId).toBe('img-1');
    const selectedTrigger = posterButton(container);
    if (selectedTrigger === null) throw new Error('no selected poster picker');
    click(selectedTrigger);
    const bars = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (button) => button.textContent?.includes('Bars'),
    );
    if (bars === undefined) throw new Error('no bars choice');
    click(bars);
    expect(plateNow().posterAssetId).toBeUndefined();
  });

  it('a stored poster that resolves to neither list is shown as itself, missing', async () => {
    seedPlate({ posterAssetId: 'gone' });
    const trigger = posterButton(await render());
    expect(trigger?.textContent).toContain('gone (missing)');
    if (trigger === null) throw new Error('no poster picker');
    click(trigger);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('gone (missing)');
  });
});
