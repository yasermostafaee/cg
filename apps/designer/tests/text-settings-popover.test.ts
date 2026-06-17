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
 * D-048 — the "More text options" gear opens a popover housing the existing font
 * props (weight + style). It opens on click and closes on Escape / outside click
 * (the FillPopover pattern). The controls write `font.weight` / `font.style` via
 * `updateElement` (non-keyframable). Appearance/UI-parity only — no schema change.
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

function seedText(id: string): Element {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultText(id, 0, 0));
  return elementById(id);
}

function elementById(id: string): Element {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId)!;
  return scene.layers[0]!.children.find((c) => c.id === id)!;
}

function render(element: Element): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(StyleSection, { element, selectedKeyframe: null })));
  return container;
}

function clickGear(c: HTMLDivElement): void {
  const gear = c.querySelector<HTMLButtonElement>('button[aria-label="More text options"]')!;
  act(() => gear.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

const popover = (): HTMLElement | null =>
  document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Text settings"]');

describe('TextSettingsPopover — D-048', () => {
  it('the gear opens the popover with a weight and a style control', () => {
    const c = render(seedText('p1'));
    expect(popover()).toBeNull();
    clickGear(c);
    expect(popover()).not.toBeNull();
    expect(document.body.querySelector('select[aria-label="weight"]')).not.toBeNull();
    expect(document.body.querySelector('select[aria-label="font style"]')).not.toBeNull();
    // ONLY weight + style — no decoration / transform / variant controls.
    expect(document.body.querySelector('select[aria-label="font style"]')).not.toBeNull();
    expect(
      document.body.querySelector('[aria-label="text decoration"],[aria-label="text transform"]'),
    ).toBeNull();
  });

  it('reflects and commits font.style via updateElement (no keyframe track)', () => {
    const c = render(seedText('p2'));
    clickGear(c);
    const style = document.body.querySelector<HTMLSelectElement>(
      'select[aria-label="font style"]',
    )!;
    expect(style.value).toBe('normal');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(style, 'italic');
      style.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const el = elementById('p2') as {
      font: { style: string };
      animation?: { tracks: Record<string, unknown> };
    };
    expect(el.font.style).toBe('italic');
    expect(el.animation).toBeUndefined();
  });

  it('closes on Escape', () => {
    const c = render(seedText('p3'));
    clickGear(c);
    expect(popover()).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(popover()).toBeNull();
  });

  it('closes on an outside pointerdown', () => {
    const c = render(seedText('p4'));
    clickGear(c);
    expect(popover()).not.toBeNull();
    act(() => {
      // A plain bubbling Event (jsdom lacks a PointerEvent constructor); the
      // capture-phase window listener still receives it with target = body.
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(popover()).toBeNull();
  });
});
