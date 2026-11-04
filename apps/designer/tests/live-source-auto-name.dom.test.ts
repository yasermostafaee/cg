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
 * 🔴 `B-187` / `B-365` — the Inspector SAYS a plate's id was chosen by the tool and lets the
 * author turn that mark off and back on. Typing another id makes it wholly authored. An unchanged
 * commit — the field commits on every blur — changes neither state.
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
  it('🔴 an automatic id reads "auto" and has a checked reversible control', () => {
    seedPlate({ routeKey: 'plate-1', routeKeyAuto: true });
    const c = render();
    expect(idInput(c)?.value).toBe('plate-1');
    const mark = c.querySelector('[data-testid="live-source-auto"]');
    expect(mark?.textContent).toBe('auto');
    expect(mark?.getAttribute('title')).toBe(AUTO_SOURCE_ID_TITLE);
    expect(mark?.hasAttribute('data-cg-tag')).toBe(true);
    const auto = c.querySelector<HTMLInputElement>('input[aria-label="auto source id"]');
    const sourceId = idInput(c);
    expect(auto?.checked).toBe(true);
    expect(sourceId?.disabled).toBe(true);
    expect(
      auto !== null && sourceId !== null
        ? (auto.compareDocumentPosition(sourceId) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        : false,
    ).toBe(true);
  });

  it('B-365 — Auto can be turned off and then back on without changing the id', () => {
    seedPlate({ routeKey: 'plate-1', routeKeyAuto: true });
    const c = render();
    const auto = c.querySelector<HTMLInputElement>('input[aria-label="auto source id"]');
    if (auto === null) throw new Error('no auto checkbox');
    act(() => auto.click());
    expect(plateNow().routeKeyAuto).toBe(false);
    expect(plateNow().routeKey).toBe('plate-1');
    rerender();
    expect(c.querySelector('[data-testid="live-source-auto"]')).toBeNull();
    const sourceId = idInput(c);
    if (sourceId === null) throw new Error('source id input disappeared');
    commit(sourceId, '');
    expect(plateNow().routeKey).toBeUndefined();
    expect(plateNow().routeKeyAuto).toBe(false);
    rerender();
    const restore = c.querySelector<HTMLInputElement>('input[aria-label="auto source id"]');
    if (restore === null) throw new Error('auto checkbox disappeared');
    expect(restore.checked).toBe(false);
    act(() => restore.click());
    expect(plateNow().routeKeyAuto).toBe(true);
    expect(plateNow().routeKey).toBe('plate-1');
    rerender();
    expect(c.querySelector('[data-testid="live-source-auto"]')).not.toBeNull();
  });

  it('TYPING another id makes it the author’s', () => {
    seedPlate({ routeKey: 'plate-1', routeKeyAuto: true });
    const c = render();
    const auto = c.querySelector<HTMLInputElement>('input[aria-label="auto source id"]');
    if (auto === null) throw new Error('no auto checkbox');
    act(() => auto.click());
    rerender();
    const input = idInput(c);
    if (input === null) throw new Error('no source id input');
    expect(input.disabled).toBe(false);
    commit(input, 'guest-1');
    expect(plateNow().routeKey).toBe('guest-1');
    expect(plateNow().routeKeyAuto).toBeUndefined();
    rerender();
    expect(c.querySelector('input[aria-label="auto"]')).toBeNull();
  });

  it('an unchanged legacy manual id remains untouched and does not turn Auto back on', () => {
    seedPlate({ routeKey: 'live-1', routeKeyAuto: false });
    const c = render();
    const input = idInput(c);
    if (input === null) throw new Error('no source id input');
    commit(input, 'live-1');
    expect(plateNow().routeKeyAuto).toBe(false);
  });

  it('clearing an automatic id unassigns the plate but keeps Auto available', () => {
    seedPlate({ routeKey: 'plate-1', routeKeyAuto: true });
    const c = render();
    const auto = c.querySelector<HTMLInputElement>('input[aria-label="auto source id"]');
    if (auto === null) throw new Error('no auto checkbox');
    act(() => auto.click());
    rerender();
    const input = idInput(c);
    if (input === null) throw new Error('no source id input');
    commit(input, '');
    expect(plateNow().routeKey).toBeUndefined();
    expect(plateNow().routeKeyAuto).toBe(false);
    rerender();
    expect(c.querySelector<HTMLInputElement>('input[aria-label="auto source id"]')?.checked).toBe(
      false,
    );
  });

  it('an id the AUTHOR typed shows no mark', () => {
    seedPlate({ routeKey: 'guest-1' });
    const c = render();
    expect(c.querySelector('[data-testid="live-source-auto"]')).toBeNull();
    expect(c.querySelector('input[aria-label="auto source id"]')).toBeNull();
  });
});
