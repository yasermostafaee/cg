/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { TopToolbar } from '../src/renderer/features/shell/TopToolbar.js';
import { designerStore, useDesignerSelector } from '../src/renderer/state/store.js';

/**
 * D-127 — the open project is renamed in place on the TopToolbar name. Two entry points
 * (double-click the name, File → "Rename Project…") drive ONE inline edit; the draft is
 * local until Enter / blur commits it through `renameProject`, and Escape discards it
 * without touching the store.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

/** Mirrors App.tsx: the toolbar's `scene` prop comes from the store, so it re-renders on a rename. */
function Host(): JSX.Element {
  const scene = useDesignerSelector((s) => s.scene);
  return createElement(TopToolbar, { scene, projectPath: null });
}

function render(name = 'Original'): HTMLDivElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene(name, 'custom');
  designerStore.setScene(scene, null);
  designerStore.markSaved(); // a freshly opened project is clean

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(Host)));
  return container;
}

const nameSpan = (): HTMLElement =>
  container!.querySelector<HTMLElement>('[data-testid="project-name"]')!;
const nameInput = (): HTMLInputElement | null =>
  container!.querySelector<HTMLInputElement>('[data-testid="project-name-input"]');
const saveBtn = (): HTMLButtonElement =>
  [...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'SAVE')!;
const storedName = (): string => designerStore.get().scene!.name;

/** What App.tsx's `document.title` effect would show for the current store state. */
function tabTitle(): string {
  const { scene, dirty } = designerStore.get();
  if (scene === null) return 'cg Designer';
  return dirty ? `* ${scene.name}` : scene.name;
}

function doubleClickName(): void {
  act(() => nameSpan().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
}

function type(value: string): void {
  const input = nameInput()!;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function pressKey(key: string): void {
  act(() => nameInput()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}

function blurInput(): void {
  act(() => nameInput()!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
}

function openFileMenu(): void {
  const file = [...container!.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'File',
  )!;
  act(() => file.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function menuItem(label: string): HTMLButtonElement | undefined {
  return [...container!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) =>
    b.textContent?.startsWith(label),
  );
}

describe('D-127 — inline rename on the TopToolbar project name', () => {
  it('double-click swaps the name for a focused input seeded with the current name, selected', () => {
    render('Original');
    expect(nameInput()).toBeNull();

    doubleClickName();

    const input = nameInput()!;
    expect(input).not.toBeNull();
    expect(input.value).toBe('Original');
    expect(document.activeElement).toBe(input);
    // The text is SELECTED, so typing replaces the name.
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Original'.length);
  });

  it('Enter commits the rename — displayed name, tab title and dirty/SAVE all follow', () => {
    render('Original');
    expect(saveBtn().disabled).toBe(true);

    doubleClickName();
    type('Renamed');
    pressKey('Enter');

    expect(nameInput()).toBeNull(); // back to the plain label
    expect(storedName()).toBe('Renamed');
    expect(nameSpan().textContent).toBe('Renamed');
    expect(tabTitle()).toBe('* Renamed'); // dirty marker + the new name
    expect(saveBtn().disabled).toBe(false); // the rename made the doc dirty
  });

  it('blur commits the rename', () => {
    render('Original');
    doubleClickName();
    type('Blurred');
    blurInput();

    expect(nameInput()).toBeNull();
    expect(storedName()).toBe('Blurred');
    expect(nameSpan().textContent).toBe('Blurred');
  });

  it('Escape cancels — the previous name is restored, nothing is written', () => {
    render('Original');
    doubleClickName();
    type('Discarded');
    pressKey('Escape');

    expect(nameInput()).toBeNull();
    expect(storedName()).toBe('Original');
    expect(nameSpan().textContent).toBe('Original');
    expect(designerStore.get().canUndo).toBe(false); // no store write ⇒ no undo entry
    expect(designerStore.get().dirty).toBe(false);
  });

  it('an empty / whitespace-only commit keeps the previous name', () => {
    render('Original');
    doubleClickName();
    type('   ');
    pressKey('Enter');

    expect(storedName()).toBe('Original');
    expect(nameSpan().textContent).toBe('Original');
    expect(designerStore.get().canUndo).toBe(false);
    expect(designerStore.get().dirty).toBe(false);
  });

  it('File → "Rename Project…" activates the SAME inline edit', () => {
    render('Original');
    openFileMenu();
    const rename = menuItem('Rename Project')!;
    expect(rename).not.toBeUndefined();
    expect(rename.disabled).toBe(false);

    act(() => rename.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const input = nameInput()!;
    expect(input).not.toBeNull();
    expect(input.value).toBe('Original');
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe('Original'.length);

    // …and it commits through the same path.
    type('From The Menu');
    pressKey('Enter');
    expect(storedName()).toBe('From The Menu');
  });

  it('the File-menu entry is disabled with no project open', () => {
    render('Original');
    act(() => designerStore.closeProject());
    openFileMenu();
    expect(menuItem('Rename Project')!.disabled).toBe(true);
  });
});
