/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PathElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { pathFromScenePoints } from '../src/renderer/state/element-defaults.js';
import { PathEditor } from '../src/renderer/features/canvas/PathEditor.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * D-123 — the anchor context menu wires right-click → menu → the EXISTING
 * `removeAnchor` (keyboard-delete semantics: re-stitch; below 2 anchors deletes
 * the element; one undo entry), with Esc-owned dismissal and keyboard focus.
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

const corner = (id: string, x: number, y: number) => ({ id, x, y, smooth: false });

function seedPath(points: [string, number, number][]): PathElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
  designerStore.addElement(
    pathFromScenePoints(
      'p1',
      points.map(([id, x, y]) => corner(id, x, y)),
      true,
    ),
  );
  return livePath()!;
}

function livePath(): PathElement | null {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId);
  for (const layer of doc?.layers ?? []) {
    for (const el of layer.children) if (el.type === 'path') return el as PathElement;
  }
  return null;
}

function render(element: PathElement): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(PathEditor, { element, scale: 1 })));
}

function rightClickAnchor(id: string): void {
  const rect = document.querySelector(`[data-cg-anchor="${id}"]`)!;
  act(() =>
    rect.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    ),
  );
}

const menu = (): HTMLElement | null =>
  document.body.querySelector<HTMLElement>('[role="menu"][aria-label="Anchor actions"]');
const deleteItem = (): HTMLButtonElement | null =>
  document.body.querySelector<HTMLButtonElement>(
    'button[role="menuitem"][aria-label="Delete point"]',
  );

describe('anchor context menu (D-123)', () => {
  it('right-click opens the menu with focus on Delete point; selecting it removes THAT anchor', () => {
    render(
      seedPath([
        ['a', 0, 0],
        ['b', 100, 0],
        ['c', 50, 100],
      ]),
    );
    expect(menu()).toBeNull();
    rightClickAnchor('b');

    expect(menu()).not.toBeNull();
    const item = deleteItem();
    expect(item).not.toBeNull();
    expect(document.activeElement).toBe(item); // focus moved into the menu

    act(() => item!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(livePath()?.points.map((p) => p.id)).toEqual(['a', 'c']); // re-stitched
    expect(menu()).toBeNull(); // selection closed it
  });

  it('deleting below 2 anchors removes the whole element (same branch as keyboard delete)', () => {
    render(
      seedPath([
        ['a', 0, 0],
        ['b', 100, 0],
      ]),
    );
    rightClickAnchor('a');
    act(() => deleteItem()!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(livePath()).toBeNull();
  });

  it('Esc closes the menu without acting, owning the event (stopped in capture)', () => {
    render(
      seedPath([
        ['a', 0, 0],
        ['b', 100, 0],
        ['c', 50, 100],
      ]),
    );
    designerStore.setSelection(['p1']);
    // A bubble-phase window listener standing in for the canvas Esc handling —
    // the menu's capture-phase stop must keep it from ever firing.
    let leaked = false;
    const spy = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') leaked = true;
    };
    window.addEventListener('keydown', spy);
    rightClickAnchor('a');
    expect(menu()).not.toBeNull();

    // Esc targets the FOCUSED menu item (as it does live): the menu's
    // capture-phase window listener runs on the way down, the spy would only
    // run on the bubble back up — and must never be reached.
    act(() =>
      deleteItem()!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    );
    expect(menu()).toBeNull();
    expect(leaked).toBe(false); // Esc owned by the menu — never reached bubble phase
    expect(livePath()?.points).toHaveLength(3); // nothing deleted
    expect(designerStore.get().selection.has('p1')).toBe(true);
    window.removeEventListener('keydown', spy);
  });

  it('a wheel scroll dismisses the menu without acting', () => {
    render(
      seedPath([
        ['a', 0, 0],
        ['b', 100, 0],
        ['c', 50, 100],
      ]),
    );
    rightClickAnchor('c');
    expect(menu()).not.toBeNull();
    act(() => window.dispatchEvent(new WheelEvent('wheel')));
    expect(menu()).toBeNull();
    expect(livePath()?.points).toHaveLength(3);
  });

  it('ArrowDown keeps focus cycling within the menu (single item wraps to itself)', () => {
    render(
      seedPath([
        ['a', 0, 0],
        ['b', 100, 0],
        ['c', 50, 100],
      ]),
    );
    rightClickAnchor('a');
    const item = deleteItem()!;
    act(() =>
      item.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      ),
    );
    expect(document.activeElement).toBe(item);
  });
});
