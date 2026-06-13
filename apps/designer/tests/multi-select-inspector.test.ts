/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultShape, defaultText } from '../src/renderer/state/element-defaults.js';
import { MultiSelectSection } from '../src/renderer/features/inspector/MultiSelectSection.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

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

function render(elements: readonly Element[]): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(MultiSelectSection, { elements })));
  return container;
}

function input(c: HTMLDivElement, label: string): HTMLInputElement | null {
  return c.querySelector(`input[aria-label="${label}"]`);
}

/** Type into an input the way the browser does (native setter + input event). */
function typeInto(el: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('MultiSelectSection — single-inspector parity (D-049)', () => {
  it('groups transform props under Transform and renders the same number primitive with units (opacity %)', () => {
    const c = render([defaultShape('a', 10, 20), defaultShape('b', 10, 20)]);
    // Grouped under a Transform section, not a flat list.
    expect(c.textContent).toContain('Transform');
    // Same horizontal-drag number primitive as single (type=number inputs), one
    // per transform property, in the single-inspector order.
    expect(input(c, 'X position')?.type).toBe('number');
    expect(input(c, 'Y position')).not.toBeNull();
    expect(input(c, 'Width')).not.toBeNull();
    expect(input(c, 'Height')).not.toBeNull();
    expect(input(c, 'Rotation')).not.toBeNull();
    // Opacity carries its unit and shows the percent value (1.0 → 100%), exactly
    // like the single inspector — not the raw 0–1 the D-041 flat editor showed.
    const opacity = input(c, 'Opacity');
    expect(opacity?.value).toBe('100');
    expect(c.textContent).toContain('%');
  });

  it('a differing property shows the neutral mixed state through the same primitive (no coercion)', () => {
    const c = render([defaultShape('a', 10, 20), defaultShape('b', 999, 20)]);
    const x = input(c, 'X position');
    expect(x).not.toBeNull();
    expect(x?.value).toBe(''); // mixed → no value coerced onto the differing shapes
    expect(x?.placeholder).toBe('—');
    // An agreeing sibling property still shows its value.
    expect(input(c, 'Y position')?.value).toBe('20');
  });

  it('a mixed-kind selection (text + shape) shows the shared transform set but no fill control', () => {
    const c = render([defaultShape('a', 10, 20), defaultText('b', 30, 40)]);
    expect(input(c, 'Opacity')).not.toBeNull(); // transform is shared
    // Fill is shape-only, so it is NOT shared → no FillField swatch.
    expect(c.querySelector('[aria-label="fill fill"]')).toBeNull();
  });

  it('a homogeneous shape selection exposes the shared fill control', () => {
    const c = render([defaultShape('a', 0, 0), defaultShape('b', 0, 0)]);
    expect(c.querySelector('[aria-label="fill fill"]')).not.toBeNull();
  });

  it('two shapes render the FULL shape sections — stroke, border radius, drop shadow, filter (D-050)', () => {
    const c = render([defaultShape('a', 0, 0), defaultShape('b', 0, 0)]);
    // Scale now appears under Transform; stroke under the pinned Path Style.
    expect(input(c, 'Scale X')).not.toBeNull();
    expect(input(c, 'stroke width')).not.toBeNull();
    // The other sections render their (collapsible) section title.
    expect(c.querySelector('button[aria-label="Toggle Border Radius"]')).not.toBeNull();
    expect(c.querySelector('button[aria-label="Toggle Drop Shadow"]')).not.toBeNull();
    expect(c.querySelector('button[aria-label="Toggle Filter"]')).not.toBeNull();
  });
});

describe('MultiSelectSection — single-undo commit (D-050)', () => {
  it('a typed edit is visual-only until blur, then commits ONE undo across all selected', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('demo', 'lower-third');
    designerStore.setScene(scene, null);
    designerStore.addElement(defaultShape('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    const layer = () =>
      editSceneOf(designerStore.get().scene, designerStore.get().activeCompositionId)!.layers[0]!;
    const opacityOf = (id: string): number => layer().children.find((c) => c.id === id)!.opacity;

    const c = render(layer().children);
    const opacity = input(c, 'Opacity')!;
    expect(opacity.value).toBe('100');

    // Typing updates the field but NOT the elements / history (deferred onChange).
    typeInto(opacity, '40');
    expect(opacity.value).toBe('40');
    expect(opacityOf('el-1')).toBe(1);
    expect(opacityOf('el-2')).toBe(1);

    // Blur commits ONCE → both elements become 0.4; a single undo reverts both.
    act(() => opacity.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(opacityOf('el-1')).toBeCloseTo(0.4);
    expect(opacityOf('el-2')).toBeCloseTo(0.4);
    designerStore.undo();
    expect(opacityOf('el-1')).toBe(1);
    expect(opacityOf('el-2')).toBe(1);
  });
});
