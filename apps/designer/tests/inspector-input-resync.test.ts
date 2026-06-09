/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Scene, TextElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';
import { DynamicDataSection } from '../src/renderer/features/inspector/DynamicDataSection.js';

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

/** The active composition projected onto a Scene (what the inspector receives). */
function projected(): Scene {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId);
  if (scene === null) throw new Error('no active composition');
  return scene;
}

function textEl(id: string): TextElement {
  const el = projected().layers[0]?.children.find((c) => c.id === id);
  if (el === undefined || el.type !== 'text') throw new Error(`no text element ${id}`);
  return el;
}

/** A project with two empty-data-key text elements in one composition. */
function setupTwoTextElements(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultText('a', 0, 0));
  designerStore.addElement(defaultText('b', 0, 0));
}

function renderFor(el: TextElement): void {
  act(() => root!.render(createElement(DynamicDataSection, { element: el, scene: projected() })));
}

function dataKeyInput(): HTMLInputElement {
  const i = container!.querySelector<HTMLInputElement>('input[aria-label="Data key"]');
  if (i === null) throw new Error('Data key input not in the DOM');
  return i;
}

/** The "Dynamic / Data" section is collapsed for an element with no key — open it. */
function expandSection(): void {
  const btn = container!.querySelector<HTMLButtonElement>(
    'button[aria-label="Toggle Dynamic / Data"]',
  );
  if (btn !== null) act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

/** Type into an uncontrolled input the way the browser does (native setter + input event). */
function typeInto(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('B-009 — inspector inputs reflect the currently-selected element', () => {
  it("typing a data key on A then selecting B shows B's value, and A's value is still saved", () => {
    setupTwoTextElements();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Element A selected; its Data key is empty.
    renderFor(textEl('a'));
    expandSection();
    expect(dataKeyInput().value).toBe('');

    // Type an UNCOMMITTED draft into A's data-key input.
    typeInto(dataKeyInput(), 'keyA');
    expect(dataKeyInput().value).toBe('keyA');

    // Selecting B blurs A's input first; that commit must still save to A.
    act(() => dataKeyInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    const bound = projected().bindings.find(
      (b) =>
        b.target.kind === 'text' &&
        b.target.elementId === 'a' &&
        b.target.placeholder === undefined,
    );
    expect(bound?.fieldId).toBe('keyA'); // A's value saved

    // Now select B — the input must show B's OWN (empty) value, not A's draft.
    renderFor(textEl('b'));
    expect(dataKeyInput().value).toBe('');
  });
});
