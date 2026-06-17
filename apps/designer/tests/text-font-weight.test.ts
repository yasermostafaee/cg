/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * D-044 — the plain text inspector exposes a font-weight control (UI parity with
 * ticker/sequence/clock). It is non-keyframable like font-family: it writes
 * `font.weight` via `updateElement` with NO keyframe track, and renders no diamond.
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

/** Set a <select> value the way the browser does (native setter + change event). */
function selectOption(el: HTMLSelectElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('TextStyleSection — D-044 font-weight control', () => {
  it('renders a 100–900 weight select reflecting the element font.weight', () => {
    seedScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    const c = renderStyle(elementById('t1'));
    const weight = c.querySelector<HTMLSelectElement>('select[aria-label="weight"]');
    expect(weight).not.toBeNull();
    // 9 options, 100..900.
    expect(Array.from(weight!.options).map((o) => o.value)).toEqual([
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
    ]);
    // Reflects the element's current weight (default 400).
    expect(weight!.value).toBe(
      String((elementById('t1') as { font: { weight: number } }).font.weight),
    );
  });

  it('committing a weight writes font.weight via updateElement with NO keyframe track', () => {
    seedScene();
    designerStore.addElement(defaultText('t2', 0, 0));
    const c = renderStyle(elementById('t2'));
    const weight = c.querySelector<HTMLSelectElement>('select[aria-label="weight"]')!;

    selectOption(weight, '700');

    const el = elementById('t2') as {
      font: { weight: number };
      animation?: { tracks: Record<string, unknown> };
    };
    expect(el.font.weight).toBe(700);
    // Non-keyframable (like font-family) — no track was created for it.
    expect(el.animation?.tracks['font.weight']).toBeUndefined();
  });

  it('the weight control renders no keyframe diamond (non-keyframable)', () => {
    seedScene();
    designerStore.addElement(defaultText('t3', 0, 0));
    const c = renderStyle(elementById('t3'));
    // The SelectField has no `trailing`, so the weight row carries no keyframe button.
    // (Diamonds render as buttons with a "Toggle keyframe for …" aria-label.)
    const diamonds = Array.from(c.querySelectorAll('button')).filter((b) =>
      (b.getAttribute('aria-label') ?? '').includes('font.weight'),
    );
    expect(diamonds).toHaveLength(0);
  });
});
