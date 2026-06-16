/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultShape, defaultText } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * D-043 — the non-keyframable `inset` toggle (and the keyframable `spread` row) live ONLY
 * in StyleSection's two "Box Shadow" sections (shape + text box), never in a "Text Shadow"
 * section. `inset` is not a registry descriptor (boolean + non-animatable); it writes
 * `el.shadow.inset` directly via `updateElement`, mirroring the per-corner radius toggle.
 */

// React's act() needs this flag set for createRoot rendering under Vitest.
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

function seedScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

function elementById(id: string): Element {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId)!;
  return scene.layers[0]!.children.find((c) => c.id === id)!;
}

function renderStyle(element: Element): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(StyleSection, { element, selectedKeyframe: null })));
  return container;
}

/** Expand a CollapseSection (children only render when expanded). */
function expandSection(c: HTMLElement, title: string): void {
  const btn = c.querySelector<HTMLButtonElement>(`button[aria-label="Toggle ${title}"]`);
  if (btn === null) throw new Error(`no toggle button for section "${title}"`);
  act(() => {
    btn.click();
  });
}

/** Find a <button> by exact text (the TogglePair renders Outset/Inset buttons). */
function buttonByText(c: HTMLElement, text: string): HTMLButtonElement | null {
  return Array.from(c.querySelectorAll('button')).find((b) => b.textContent === text) ?? null;
}

describe('StyleSection — D-043 box-shadow Spread + Inset (Box Shadow sections only)', () => {
  it('shape Box Shadow shows the Spread row + Inset toggle; toggling Inset writes el.shadow.inset', () => {
    seedScene();
    designerStore.addElement(defaultShape('s1', 0, 0));
    const c = renderStyle(elementById('s1'));
    expandSection(c, 'Box Shadow');

    // The keyframable Spread row renders (like Blur).
    expect(c.querySelector('input[aria-label="spread"]')).not.toBeNull();
    // The Outset/Inset toggle renders (Outset default).
    expect(buttonByText(c, 'Outset')).not.toBeNull();
    const insetBtn = buttonByText(c, 'Inset');
    expect(insetBtn).not.toBeNull();

    // Toggling Inset writes el.shadow.inset = true via updateElement (static, no keyframe).
    act(() => {
      insetBtn!.click();
    });
    const el = elementById('s1') as { shadow?: { inset?: boolean } };
    expect(el.shadow?.inset).toBe(true);
  });

  it('text Box Shadow shows the Spread row + Inset toggle, and writes el.shadow.inset', () => {
    seedScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    const c = renderStyle(elementById('t1'));
    expandSection(c, 'Box Shadow');

    expect(c.querySelector('input[aria-label="spread"]')).not.toBeNull();
    const insetBtn = buttonByText(c, 'Inset');
    expect(insetBtn).not.toBeNull();
    act(() => {
      insetBtn!.click();
    });
    const el = elementById('t1') as { shadow?: { inset?: boolean } };
    expect(el.shadow?.inset).toBe(true);
  });

  it('the text "Text Shadow" section shows NO Spread row and NO Inset toggle', () => {
    seedScene();
    designerStore.addElement(defaultText('t2', 0, 0));
    const c = renderStyle(elementById('t2'));
    // Expand ONLY the Text Shadow section (Box Shadow stays collapsed → not rendered),
    // so the absence query is unambiguous.
    expandSection(c, 'Text Shadow');

    expect(c.querySelector('input[aria-label="spread"]')).toBeNull();
    expect(buttonByText(c, 'Inset')).toBeNull();
    expect(buttonByText(c, 'Outset')).toBeNull();
  });
});
