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
import {
  aggregateKeyframeVariant,
  toggleGroupKeyframe,
  MultiKeyframeDot,
} from '../src/renderer/features/inspector/keyframe-diamond.js';
import { hasKeyframeAt } from '../src/renderer/features/timeline/keyframe-helpers.js';

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

describe('MultiSelectSection — live edit + single-undo commit (D-053)', () => {
  it('a typed edit updates EVERY selected element live on keystroke, and one boundary on blur makes it ONE undo across all', () => {
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

    // Focusing the field via click sets a leading history boundary (the scrub
    // surface's onEnd → markHistoryBoundary); simulate it so the typed burst is
    // isolated from the synchronous setup writes.
    designerStore.markHistoryBoundary();

    // D-053 — typing now updates EVERY selected element LIVE on each keystroke
    // (onChange), not visual-only-until-blur as in D-050.
    typeInto(opacity, '40');
    expect(opacity.value).toBe('40');
    expect(opacityOf('el-1')).toBeCloseTo(0.4);
    expect(opacityOf('el-2')).toBeCloseTo(0.4);

    // Blur sets the single commit boundary (the value already applied live); the
    // whole typed edit is ONE undo entry reverting both elements together.
    act(() => opacity.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(opacityOf('el-1')).toBeCloseTo(0.4);
    expect(opacityOf('el-2')).toBeCloseTo(0.4);
    designerStore.undo();
    expect(opacityOf('el-1')).toBe(1);
    expect(opacityOf('el-2')).toBe(1);
  });
});

describe('MultiSelectSection — keyframe diamonds (D-054)', () => {
  function twoShapes(): () => readonly Element[] {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('demo', 'lower-third');
    designerStore.setScene(scene, null);
    designerStore.addElement(defaultShape('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    return () =>
      editSceneOf(designerStore.get().scene, designerStore.get().activeCompositionId)!.layers[0]!
        .children;
  }

  it('aggregate variant: none → empty, some → partial, all → at-frame', () => {
    const children = twoShapes();
    const f = designerStore.get().currentFrame;
    expect(aggregateKeyframeVariant(children(), 'position.x', f)).toBe('empty');
    designerStore.upsertKeyframe('el-1', 'position.x', f, 0);
    expect(aggregateKeyframeVariant(children(), 'position.x', f)).toBe('partial');
    designerStore.upsertKeyframe('el-2', 'position.x', f, 0);
    expect(aggregateKeyframeVariant(children(), 'position.x', f)).toBe('at-frame');
  });

  it('toggleGroupKeyframe: adds to all when none, fills the missing when partial, removes all when all', () => {
    const children = twoShapes();
    const f = designerStore.get().currentFrame;
    // none → add a keyframe to every selected element (one undo entry)
    toggleGroupKeyframe(children(), 'position.x', f);
    expect(hasKeyframeAt(children()[0]!, 'position.x', f)).toBe(true);
    expect(hasKeyframeAt(children()[1]!, 'position.x', f)).toBe(true);
    designerStore.undo();
    expect(hasKeyframeAt(children()[0]!, 'position.x', f)).toBe(false);
    expect(hasKeyframeAt(children()[1]!, 'position.x', f)).toBe(false);
    // partial (only el-1 keyframed) → fill the missing el-2
    designerStore.upsertKeyframe('el-1', 'position.x', f, 0);
    toggleGroupKeyframe(children(), 'position.x', f);
    expect(hasKeyframeAt(children()[0]!, 'position.x', f)).toBe(true);
    expect(hasKeyframeAt(children()[1]!, 'position.x', f)).toBe(true);
    // all → remove the keyframe from every selected element
    toggleGroupKeyframe(children(), 'position.x', f);
    expect(hasKeyframeAt(children()[0]!, 'position.x', f)).toBe(false);
    expect(hasKeyframeAt(children()[1]!, 'position.x', f)).toBe(false);
  });

  it('MultiKeyframeDot renders only when keyframe-able for EVERY selected kind', () => {
    const shapeA = defaultShape('a', 0, 0);
    const shapeB = defaultShape('b', 0, 0);
    const text = defaultText('c', 0, 0);
    // position.x is keyframe-able for both kinds → a diamond is returned.
    expect(MultiKeyframeDot([shapeA, text], 'position.x', 0)).not.toBeUndefined();
    // fill.color is shape-only → not keyframe-able for text → hidden (undefined).
    expect(MultiKeyframeDot([shapeA, text], 'fill.color', 0)).toBeUndefined();
    // two shapes share a keyframe-able (solid) fill.color → returned.
    expect(MultiKeyframeDot([shapeA, shapeB], 'fill.color', 0)).not.toBeUndefined();
  });
});
