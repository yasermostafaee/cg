/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, VideoPlaceholderElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';
import {
  AUTO_SOURCE_ID_TITLE,
  StyleSection,
} from '../src/renderer/features/inspector/StyleSection.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * 🔴 `B-187` — the Inspector SAYS a plate's id was chosen by the tool: "auto" beside the field
 * until the author keeps it (the check) or types another. An unchanged commit — the field commits
 * on every blur — is no confirmation.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noUnsub = (): void => {
  /* no unsubscribe needed in tests */
};
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

function seedPlate(over: Partial<VideoPlaceholderElement>): void {
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

function render(): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(createElement(StyleSection, { element: plateNow(), selectedKeyframe: null })),
  );
  return container;
}

/** Re-render with the store's current plate (the Inspector re-reads the element on change). */
function rerender(): void {
  act(() =>
    root?.render(createElement(StyleSection, { element: plateNow(), selectedKeyframe: null })),
  );
}

const idInput = (c: HTMLElement): HTMLInputElement | null =>
  c.querySelector('input[aria-label="Live Source source id"]');

function commit(input: HTMLInputElement, value: string): void {
  act(() => {
    input.focus();
    input.value = value;
    input.blur();
  });
}

describe('B-187 — the "auto" mark on a tool-named plate', () => {
  it('🔴 an automatic id reads "auto", titled with why, beside a keep control', () => {
    seedPlate({ routeKey: 'live-1', routeKeyAuto: true });
    const c = render();
    expect(idInput(c)?.value).toBe('live-1');
    const mark = c.querySelector('[data-testid="live-source-auto"]');
    expect(mark?.textContent).toBe('auto');
    expect(mark?.getAttribute('title')).toBe(AUTO_SOURCE_ID_TITLE);
    expect(mark?.hasAttribute('data-cg-tag')).toBe(true); // a fact, not a button
    expect(c.querySelector('button[aria-label="Keep the automatic source id"]')).not.toBeNull();
  });

  it('KEEPING it drops the mark and keeps the name', () => {
    seedPlate({ routeKey: 'live-1', routeKeyAuto: true });
    const c = render();
    act(() =>
      c
        .querySelector<HTMLButtonElement>('button[aria-label="Keep the automatic source id"]')
        ?.click(),
    );
    expect(plateNow().routeKeyAuto).toBeUndefined();
    expect(plateNow().routeKey).toBe('live-1');
    rerender();
    expect(c.querySelector('[data-testid="live-source-auto"]')).toBeNull();
  });

  it('TYPING another id makes it the author’s', () => {
    seedPlate({ routeKey: 'live-1', routeKeyAuto: true });
    const c = render();
    const input = idInput(c);
    if (input === null) throw new Error('no source id input');
    commit(input, 'guest-1');
    expect(plateNow().routeKey).toBe('guest-1');
    expect(plateNow().routeKeyAuto).toBeUndefined();
  });

  it('🔴 an UNCHANGED commit (a focus and blur) is no confirmation — the mark stays', () => {
    seedPlate({ routeKey: 'live-1', routeKeyAuto: true });
    const c = render();
    const input = idInput(c);
    if (input === null) throw new Error('no source id input');
    commit(input, 'live-1');
    expect(plateNow().routeKeyAuto).toBe(true);
  });

  it('clearing the field unassigns the plate and drops the mark with it', () => {
    seedPlate({ routeKey: 'live-1', routeKeyAuto: true });
    const c = render();
    const input = idInput(c);
    if (input === null) throw new Error('no source id input');
    commit(input, '');
    expect(plateNow().routeKey).toBeUndefined();
    expect(plateNow().routeKeyAuto).toBeUndefined();
  });

  it('an id the AUTHOR typed shows no mark', () => {
    seedPlate({ routeKey: 'guest-1' });
    expect(render().querySelector('[data-testid="live-source-auto"]')).toBeNull();
  });
});
