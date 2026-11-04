/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import type { Element, LottieElement } from '@cg/shared-schema';

/**
 * D-176 — a marker-less Lottie has one truthful timing path: Follow composition. Existing manual
 * and marker phases stay editable/attachable, but the Inspector no longer invents midpoint marks.
 */

const CLIP = { ip: 0, op: 60, fr: 30, w: 100, h: 100, layers: [] };

vi.mock('../src/renderer/features/assets/lottieAssetCache.js', () => ({
  get: (assetId: string) => (assetId === 'asset-a' ? CLIP : undefined),
  getAll: () => ({ 'asset-a': CLIP }),
  getForScene: () => ({ 'asset-a': CLIP }),
  subscribe: () => () => undefined,
  prime: () => Promise.resolve(),
  primeScene: () => Promise.resolve(),
  clearAll: () => undefined,
}));

const { designerStore, editSceneOf } = await import('../src/renderer/state/store.js');
const { defaultLottie } = await import('../src/renderer/state/element-defaults.js');
const { ProjectStore } = await import('../src/platform/ProjectStore.js');
const { StyleSection } = await import('../src/renderer/features/inspector/StyleSection.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noUnsub = (): void => undefined;
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  designerStore._reset();
});

function render(element: Element): void {
  act(() => {
    root.render(
      createElement(StyleSection, { element, currentFrame: 0, selectedKeyframe: null } as never),
    );
  });
}

function elById(id: string): LottieElement {
  const st = designerStore.get();
  const layer = editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!;
  return layer.children.find((c) => c.id === id) as LottieElement;
}

const button = (pattern: RegExp): HTMLButtonElement | null =>
  [...host.querySelectorAll('button')].find((b) => pattern.test(b.textContent ?? '')) ?? null;

describe('D-176 — marker-less Lottie timing authoring', () => {
  it('offers Follow composition as the only phase-authoring action', () => {
    const element = defaultLottie('lot', 0, 0, 'asset-a');
    designerStore.addElement(element as unknown as Element);
    render(element as unknown as Element);

    expect(button(/follow composition/i)).not.toBeNull();
    expect(button(/add phase markers/i)).toBeNull();
    expect(host.textContent).toContain('No phase markers');
  });

  it('does not write guessed phase data merely by rendering', () => {
    const element = defaultLottie('lot', 0, 0, 'asset-a');
    designerStore.addElement(element as unknown as Element);
    const before = JSON.stringify(elById('lot'));
    render(element as unknown as Element);

    expect(JSON.stringify(elById('lot'))).toBe(before);
    expect(elById('lot').phases).toBeUndefined();
  });

  it('keeps existing manual phase inputs editable and attachable', () => {
    const element = defaultLottie('lot', 0, 0, 'asset-a', {
      phases: { introEnd: 10, outroStart: 50, source: 'manual' },
    });
    designerStore.addElement(element as unknown as Element);
    render(element as unknown as Element);

    expect(host.querySelector('input[aria-label="intro end"]')).not.toBeNull();
    expect(host.querySelector('input[aria-label="outro start"]')).not.toBeNull();
    expect(button(/follow composition/i)).not.toBeNull();
    expect(button(/add phase markers/i)).toBeNull();
  });
});
