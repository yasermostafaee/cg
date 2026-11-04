/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, RepeaterElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { defaultRepeater } from '../src/renderer/state/element-defaults.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

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

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

function seed(): RepeaterElement {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'repeater entrance',
    'lower-third',
  );
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultRepeater('rep', 0, 0, { id: 'row-card', fields: [] }));
  return repeater();
}

function repeater(): RepeaterElement {
  const state = designerStore.get();
  const scene = editSceneOf(state.scene, state.activeCompositionId);
  const element = scene?.layers[0]?.children.find((candidate) => candidate.id === 'rep');
  if (element?.type !== 'repeater') throw new Error('no repeater');
  return element;
}

function render(element: RepeaterElement): HTMLDivElement {
  container ??= document.createElement('div');
  if (!container.isConnected) document.body.appendChild(container);
  root ??= createRoot(container);
  act(() => root?.render(createElement(StyleSection, { element, selectedKeyframe: null })));
  return container;
}

async function settleEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('D-181 — Repeater entrance Inspector controls', () => {
  it('shows the shared edge list and withholds timing until an effect is chosen', async () => {
    const host = render(seed());
    await settleEffects();
    const entrance = host.querySelector<HTMLSelectElement>('select[aria-label="item entrance"]');
    const effectTime = host.querySelector<HTMLInputElement>('input[aria-label="effect time"]');
    const itemDelay = host.querySelector<HTMLInputElement>('input[aria-label="item delay"]');
    expect(entrance?.value).toBe('none');
    expect([...entrance!.options].map((option) => option.value)).toContain('fade-right');
    expect(effectTime?.disabled).toBe(true);
    expect(itemDelay?.disabled).toBe(true);

    act(() => {
      if (entrance === null) return;
      entrance.value = 'fade-right';
      entrance.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(repeater().itemEntrance).toBe('fade-right');

    const updated = render(repeater());
    await settleEffects();
    expect(
      updated.querySelector<HTMLInputElement>('input[aria-label="effect time"]')?.disabled,
    ).toBe(false);
    expect(
      updated.querySelector<HTMLInputElement>('input[aria-label="item delay"]')?.disabled,
    ).toBe(false);
  });

  it('stores effect time and delay in milliseconds without animation tracks', async () => {
    seed();
    designerStore.updateElement('rep', {
      itemEntrance: 'fade',
      itemTransitionMs: 750,
      itemStaggerMs: 150,
    } as Partial<Element>);
    const host = render(repeater());
    await settleEffects();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="effect time"]')?.value).toBe(
      '0.75',
    );
    expect(host.querySelector<HTMLInputElement>('input[aria-label="item delay"]')?.value).toBe(
      '0.15',
    );
    const tracks = Object.keys(repeater().animation?.tracks ?? {});
    expect(tracks).not.toContain('itemTransitionMs');
    expect(tracks).not.toContain('itemStaggerMs');
  });
});
