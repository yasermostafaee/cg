/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, RepeaterElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { defaultField } from '../src/renderer/features/fields/field-defaults.js';
import { defaultRepeater, defaultSequence } from '../src/renderer/state/element-defaults.js';
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

function seedWithFields(options: { sequenceOwned?: boolean } = {}): RepeaterElement {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'direct repeater data',
    'fullscreen',
  );
  designerStore.setScene(scene, null);
  const mainId = designerStore.get().activeCompositionId;
  if (mainId === null) throw new Error('main composition was not created');
  const childId = designerStore.addComposition();
  if (childId === null) throw new Error('child composition was not created');
  designerStore.addField({ ...defaultField('city', 'text'), label: 'City' });
  designerStore.addField({ ...defaultField('temperature', 'number'), label: 'Temperature' });
  const current = designerStore.get().scene;
  const child = current?.compositions?.find((composition) => composition.id === childId);
  const main = current?.compositions?.find((composition) => composition.id === mainId);
  if (current === null || child === undefined || main === undefined) {
    throw new Error('test scene is incomplete');
  }
  const repeaterElement = defaultRepeater('rep', 0, 0, child);
  const owner = {
    ...defaultSequence('weather-pages', 0, 0),
    name: 'Weather pages',
    items: [{ id: 'page-1', kind: 'composition' as const, compositionId: mainId }],
  };
  const ownerComposition = {
    id: 'owner-composition',
    name: 'Owner',
    resolution: current.resolution,
    frameRange: current.frameRange,
    editorBackdrop: 'transparent' as const,
    layers: [
      {
        id: 'owner-layer',
        name: 'Owner',
        visible: true,
        locked: false,
        blendMode: 'normal' as const,
        children: [owner],
      },
    ],
    fields: [],
    bindings: [],
  };
  const firstLayer = main.layers[0] ?? {
    id: 'main-layer',
    name: 'Main',
    visible: true,
    locked: false,
    blendMode: 'normal' as const,
    children: [],
  };
  designerStore.setScene(
    {
      ...current,
      compositions: [
        ...(current.compositions?.map((composition) =>
          composition.id === mainId
            ? {
                ...composition,
                layers: [
                  { ...firstLayer, children: [repeaterElement] },
                  ...composition.layers.slice(1),
                ],
              }
            : composition,
        ) ?? []),
        ...(options.sequenceOwned ? [ownerComposition] : []),
      ],
    },
    null,
  );
  return repeater();
}

function repeater(): RepeaterElement {
  const state = designerStore.get();
  const scene = editSceneOf(state.scene, state.activeCompositionId);
  const element = scene?.layers
    .flatMap((layer) => layer.children)
    .find((candidate) => candidate.id === 'rep');
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

describe('D-197 — Repeater entrance Inspector controls', () => {
  it('shows the shared edge list and withholds timing until an effect is chosen', async () => {
    const host = render(seed());
    await settleEffects();
    const entrance = host.querySelector<HTMLSelectElement>('select[aria-label="item entrance"]');
    const effectTime = host.querySelector<HTMLInputElement>('input[aria-label="entrance time"]');
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
      updated.querySelector<HTMLInputElement>('input[aria-label="entrance time"]')?.disabled,
    ).toBe(false);
    expect(
      updated.querySelector<HTMLInputElement>('input[aria-label="item delay"]')?.disabled,
    ).toBe(false);
  });

  it('keeps the entrance controls in their own prominent section', async () => {
    const host = render(seed());
    await settleEffects();
    expect(host.textContent).toContain('Item effects');
    expect(host.querySelector('select[aria-label="item entrance"]')).not.toBeNull();
    expect(host.querySelector('select[aria-label="item exit"]')).not.toBeNull();
  });

  it('stores independent entrance/exit times and delay in milliseconds without animation tracks', async () => {
    seed();
    designerStore.updateElement('rep', {
      itemEntrance: 'fade',
      itemTransitionMs: 750,
      itemExit: 'fade',
      itemExitTransitionMs: 250,
      itemStaggerMs: 150,
    } as Partial<Element>);
    const host = render(repeater());
    await settleEffects();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="entrance time"]')?.value).toBe(
      '0.75',
    );
    expect(host.querySelector<HTMLInputElement>('input[aria-label="exit time"]')?.value).toBe(
      '0.25',
    );
    expect(host.querySelector<HTMLInputElement>('input[aria-label="item delay"]')?.value).toBe(
      '0.15',
    );
    const tracks = Object.keys(repeater().animation?.tracks ?? {});
    expect(tracks).not.toContain('itemTransitionMs');
    expect(tracks).not.toContain('itemExitTransitionMs');
    expect(tracks).not.toContain('itemStaggerMs');
  });

  it('offers exit order separately from the effect direction and defaults to last-to-first', async () => {
    const host = render(seed());
    await settleEffects();
    const order = host.querySelector<HTMLSelectElement>('select[aria-label="exit order"]');
    expect(order?.value).toBe('reverse');
    expect([...order!.options].map((option) => option.textContent)).toEqual([
      'Last to first',
      'First to last',
    ]);
    act(() => {
      if (order === null) return;
      order.value = 'forward';
      order.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(repeater().itemExitOrder).toBe('forward');
    expect(repeater().itemEntrance).toBe('none');
    expect(repeater().itemExit).toBeUndefined();
  });
});

describe('D-180 — direct Repeater data file', () => {
  it('offers file management without requiring an outer Sequence', async () => {
    const host = render(seedWithFields());
    await settleEffects();

    const section = host.querySelector<HTMLElement>('section[aria-label="Repeater data file"]');
    expect(section?.textContent).toContain('Rows and data file');
    expect(section?.textContent).toContain('Not connected');

    act(() => {
      [...(section?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent?.trim() === 'Rows and data file…')
        ?.click();
    });
    const dialog = document.body.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Repeater data · Repeater"]',
    );
    expect(dialog?.textContent).toContain('Save and connect Excel file');
    expect(dialog?.textContent).not.toContain('File only in CG Control');
    expect(dialog?.textContent).toContain('City');
    expect(dialog?.textContent).toContain('Temperature');
  });

  it('routes a nested Repeater file source to the owning Sequence', async () => {
    const nested = seedWithFields({ sequenceOwned: true });
    const state = designerStore.get();
    const parentId = state.scene?.compositions?.find((composition) =>
      composition.layers.some((layer) =>
        layer.children.some((element) => element.id === nested.id && element.type === 'repeater'),
      ),
    )?.id;
    expect(parentId).toBe(state.activeCompositionId);
    expect(
      state.scene?.compositions
        ?.flatMap((composition) => composition.layers)
        .flatMap((layer) => layer.children)
        .some(
          (element) =>
            element.type === 'sequence' &&
            element.items.some(
              (item) => item.kind === 'composition' && item.compositionId === parentId,
            ),
        ),
    ).toBe(true);

    const host = render(nested);
    await settleEffects();

    const section = host.querySelector<HTMLElement>('section[aria-label="Repeater data file"]');
    expect(section?.textContent).toContain('Rows…');
    expect(section?.textContent).toContain('File source · Weather pages');
    expect(section?.textContent).not.toContain('Not connected');

    act(() => {
      [...(section?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent?.trim() === 'Rows…')
        ?.click();
    });
    const dialog = document.body.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Repeater data · Repeater"]',
    );
    expect(dialog?.textContent).toContain('File source · Weather pages');
    expect(dialog?.textContent).not.toContain('Save and connect');
    expect(dialog?.textContent).not.toContain('File only in CG Control');
    expect(dialog?.textContent).toContain('City');
  });
});
