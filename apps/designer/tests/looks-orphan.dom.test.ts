/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { LooksSection } from '../src/renderer/features/inspector/LooksSection.js';
import { CompositionsPanel } from '../src/renderer/features/compositions/CompositionsPanel.js';
import { registeredLookCompositionIds } from '../src/renderer/state/slices/looks.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  designerStore._reset();
});

function fresh(): string | null {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('looks', 'custom');
  designerStore.setScene(scene, null);
  designerStore.createLookGroup();
  return designerStore.get().activeCompositionId;
}

function render(component: ComponentType<Record<string, never>>): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root?.render(createElement(component)));
  return host;
}

describe('Look management lives in the Compositions panel', () => {
  it('does not label ordinary compositions as default before a Look exists', () => {
    fresh();
    designerStore.addComposition();
    designerStore.addComposition();
    const panel = render(CompositionsPanel);

    expect(panel.querySelectorAll('[data-composition-kind="look"]')).toHaveLength(0);
    expect(
      [...panel.querySelectorAll('[data-composition-kind="composition"]')].every(
        (row) => !row.textContent?.includes('default'),
      ),
    ).toBe(true);
  });

  it('an empty group adds no permanent explanatory block to the Inspector', () => {
    fresh();
    designerStore.addLook();
    const scene = designerStore.get().scene;
    if (scene === null) throw new Error('no scene');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(createElement(LooksSection, { scene })));

    expect(host.textContent).toBe('');
    expect(host.querySelector('[aria-label^="Edit contents of"]')).toBeNull();
    expect(host.querySelector('[aria-label^="Remove look"]')).toBeNull();
  });

  it('adds Looks from their own lower section and keeps later compositions above them', () => {
    fresh();
    designerStore.addLook();
    designerStore.addComposition();
    const panel = render(CompositionsPanel);

    const kinds = [...panel.querySelectorAll<HTMLElement>('[data-composition-kind]')].map(
      (row) => row.dataset.compositionKind,
    );
    expect(kinds.at(-1)).toBe('look');
    expect(kinds.slice(0, -1)).not.toContain('look');
    expect(panel.querySelector('[aria-label="Presets"]')).not.toBeNull();
    expect(panel.querySelector('[data-composition-kind="look"]')?.textContent).toContain(
      'preset-1',
    );
    expect(panel.querySelector<HTMLButtonElement>('button[title="Add Preset"]')).not.toBeNull();
    expect(panel.querySelector<HTMLButtonElement>('button[title="Add Preset"]')?.textContent).toBe(
      '',
    );
    expect(panel.querySelector('[data-composition-kind="look"]')?.textContent).not.toContain(
      'default',
    );
    expect(
      [...panel.querySelectorAll('[data-composition-kind="composition"]')].every(
        (row) => !row.textContent?.includes('default'),
      ),
    ).toBe(true);
  });

  it('an empty group can be removed directly from the Looks header', () => {
    fresh();
    const panel = render(CompositionsPanel);
    const remove = panel.querySelector<HTMLButtonElement>(
      '[aria-label="Delete multi-frame group"]',
    );
    expect(remove).not.toBeNull();

    act(() => remove?.click());

    expect(panel.querySelector('[aria-label="Presets"]')).toBeNull();
  });

  it('Show Preset navigates back to the group home and activates that Preset', () => {
    const homeId = fresh();
    designerStore.addLook();
    const scene = designerStore.get().scene;
    if (scene === null) throw new Error('no scene');
    const lookCompositionId = [...registeredLookCompositionIds(scene)][0];
    if (lookCompositionId === undefined) throw new Error('no Look composition');
    designerStore.setActiveComposition(lookCompositionId);
    const panel = render(CompositionsPanel);
    const lookRow = panel.querySelector<HTMLElement>('[data-composition-kind="look"]');

    act(() =>
      lookRow?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    const show = [...(panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].find(
      (button) => button.textContent === 'Show Preset on composition',
    );
    expect(show).toBeDefined();

    act(() => show?.click());

    expect(designerStore.get().activeCompositionId).toBe(homeId);
    expect(designerStore.get().activeLookId).toBe('look-1');
  });

  it('warns before removing a non-empty group and deletes all Look compositions on confirm', () => {
    fresh();
    designerStore.addLook();
    designerStore.addLook();
    const panel = render(CompositionsPanel);
    const remove = panel.querySelector<HTMLButtonElement>(
      '[aria-label="Delete multi-frame group"]',
    );

    act(() => remove?.click());

    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Delete multi-frame group?"]',
    );
    expect(dialog?.textContent).toMatch(/delete 2 Presets/i);
    expect(panel.querySelectorAll('[data-composition-kind="look"]')).toHaveLength(2);

    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Delete all',
    );
    act(() => confirm?.click());

    expect(panel.querySelector('[aria-label="Presets"]')).toBeNull();
    expect(panel.querySelectorAll('[data-composition-kind="look"]')).toHaveLength(0);
    expect(designerStore.get().noticeTone).toBe('neutral');
  });
});
