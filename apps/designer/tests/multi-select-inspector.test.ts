/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import {
  defaultLiveSource,
  defaultShape,
  defaultText,
} from '../src/renderer/state/element-defaults.js';
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

const noUnsub = (): void => {
  /* no unsubscribe needed in tests */
};
const pendingList = (): Promise<never> => new Promise<never>(() => undefined);
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: pendingList,
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: pendingList,
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

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

function select(c: HTMLDivElement, label: string): HTMLSelectElement | null {
  return c.querySelector(`select[aria-label="${label}"]`);
}

function choose(el: HTMLSelectElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
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

  it('B-359 — with any selected Live Source aspect-locked, Scale is visible but disabled', () => {
    const c = render([defaultLiveSource('live-a', 0, 0), defaultLiveSource('live-b', 640, 0)]);
    const scaleX = input(c, 'Scale X');
    const scaleY = input(c, 'Scale Y');
    expect(scaleX?.disabled).toBe(true);
    expect(scaleY?.disabled).toBe(true);
    expect(scaleX?.title).toContain('aspect locked');
  });

  it('B-359 — a locked Live Source also disables Scale in a mixed-kind selection', () => {
    const c = render([defaultLiveSource('live-a', 0, 0), defaultShape('shape', 640, 0)]);
    expect(input(c, 'Scale X')?.disabled).toBe(true);
    expect(input(c, 'Scale Y')?.disabled).toBe(true);
  });

  it('B-359 — freeing every selected Live Source restores the shared Scale controls', () => {
    designerStore.setAspectLock('live-a', false);
    designerStore.setAspectLock('live-b', false);
    const c = render([defaultLiveSource('live-a', 0, 0), defaultLiveSource('live-b', 640, 0)]);
    expect(input(c, 'Scale X')?.disabled).toBe(false);
    expect(input(c, 'Scale Y')?.disabled).toBe(false);
  });

  it('D-167 — homogeneous Live Sources expose appearance controls; a mixed-kind selection does not', () => {
    const live = [defaultLiveSource('live-a', 0, 0), defaultLiveSource('live-b', 640, 0)];
    const c = render(live);
    expect(select(c, 'aspect')).not.toBeNull();
    expect(
      c.querySelector('button[aria-label="Keep aspect while resizing selected plates"]'),
    ).not.toBeNull();
    expect(select(c, 'fit')).not.toBeNull();
    expect(c.querySelector('button[aria-label="poster"]')).not.toBeNull();
    expect(input(c, 'stroke width')).not.toBeNull();
    expect(c.querySelector('input[aria-label="stroke hex value"]')).not.toBeNull();

    act(() =>
      root!.render(
        createElement(MultiSelectSection, { elements: [live[0]!, defaultShape('shape', 0, 0)] }),
      ),
    );
    expect(select(c, 'aspect')).toBeNull();
    expect(select(c, 'fit')).toBeNull();
    expect(c.querySelector('button[aria-label="poster"]')).toBeNull();
  });

  it('D-167 — a mixed fit is inert until chosen, then updates all plates in one undo entry', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('demo', 'lower-third');
    designerStore.setScene(scene, null);
    designerStore.addElement({ ...defaultLiveSource('live-a', 0, 0), fitMode: 'contain' });
    designerStore.addElement({ ...defaultLiveSource('live-b', 640, 0), fitMode: 'cover' });
    const layer = () =>
      editSceneOf(designerStore.get().scene, designerStore.get().activeCompositionId)!.layers[0]!;
    const c = render(layer().children);
    const fit = select(c, 'fit')!;
    expect(fit.value).toBe('__cg_mixed__');
    expect(layer().children.map((element) => (element as { fitMode?: string }).fitMode)).toEqual([
      'contain',
      'cover',
    ]);

    choose(fit, 'cover');
    expect(layer().children.map((element) => (element as { fitMode?: string }).fitMode)).toEqual([
      'cover',
      'cover',
    ]);
    designerStore.undo();
    expect(layer().children.map((element) => (element as { fitMode?: string }).fitMode)).toEqual([
      'contain',
      'cover',
    ]);
  });

  it('D-167 — stroke width preserves each colour and repairs each plate to its own aspect', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('demo', 'lower-third');
    designerStore.setScene(scene, null);
    const a = defaultLiveSource('live-a', 0, 0);
    const b = defaultLiveSource('live-b', 640, 0);
    designerStore.addElement({
      ...a,
      expectedAspect: 16 / 9,
      stroke: { color: '#ff0000', width: 2 },
      transform: { ...a.transform, size: { w: 640, h: 300 } },
    });
    designerStore.addElement({
      ...b,
      expectedAspect: 1,
      stroke: { color: '#0000ff', width: 4 },
      transform: { ...b.transform, size: { w: 500, h: 360 } },
    });
    const layer = () =>
      editSceneOf(designerStore.get().scene, designerStore.get().activeCompositionId)!.layers[0]!;
    const c = render(layer().children);
    const width = input(c, 'stroke width')!;
    expect(width.value).toBe('');
    expect(width.placeholder).toBe('—');

    designerStore.markHistoryBoundary();
    typeInto(width, '7');
    act(() => width.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    const framed = layer().children as readonly ReturnType<typeof defaultLiveSource>[];
    expect(framed.map((element) => element.stroke?.width)).toEqual([7, 7]);
    expect(framed.map((element) => element.stroke?.color)).toEqual(['#ff0000', '#0000ff']);
    designerStore.undo();
    expect(
      (layer().children as readonly ReturnType<typeof defaultLiveSource>[]).map(
        (element) => element.stroke?.width,
      ),
    ).toEqual([2, 4]);

    const repair = c.querySelector<HTMLButtonElement>(
      'button[aria-label="Repair selected plates to aspect"]',
    )!;
    act(() => repair.click());
    const repaired = layer().children as readonly ReturnType<typeof defaultLiveSource>[];
    expect(repaired[0]!.transform.size.w / repaired[0]!.transform.size.h).toBeCloseTo(16 / 9);
    expect(repaired[1]!.transform.size.w / repaired[1]!.transform.size.h).toBeCloseTo(1);
  });
});

describe('MultiSelectSection — live edit + single-undo commit (D-053)', () => {
  it('B-360 — auto layout changes every selected Live Source in one undo entry', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('demo', 'lower-third');
    designerStore.setScene(scene, null);
    designerStore.addElement(defaultLiveSource('live-1', 10, 20));
    designerStore.addElement(defaultLiveSource('live-2', 30, 40));
    designerStore.addElement(defaultLiveSource('live-3', 50, 60));
    const layer = () =>
      editSceneOf(designerStore.get().scene, designerStore.get().activeCompositionId)!.layers[0]!;
    const before = layer().children.map((element) => ({ ...element.transform.position }));
    const c = render(layer().children);
    const button = Array.from(c.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.includes('More frames on top') === true,
    );
    expect(button).toBeDefined();

    act(() => button!.click());
    const arranged = layer().children;
    expect(arranged[0]!.transform.position).not.toEqual(before[0]);
    expect(arranged[0]!.transform.size.w / arranged[0]!.transform.size.h).toBeCloseTo(16 / 9);
    expect(arranged[0]!.transform.position.y).toBeCloseTo(arranged[1]!.transform.position.y);
    expect(arranged[2]!.transform.position.y).toBeGreaterThan(arranged[0]!.transform.position.y);

    designerStore.undo();
    expect(layer().children.map((element) => element.transform.position)).toEqual(before);
  });

  it('B-360 — a one-row portrait layout hides controls that cannot change it', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('demo', 'lower-third');
    designerStore.setScene(scene, null);
    for (const id of ['portrait-1', 'portrait-2', 'portrait-3']) {
      designerStore.addElement({ ...defaultLiveSource(id, 0, 0), expectedAspect: 9 / 16 });
    }
    const children = editSceneOf(
      designerStore.get().scene,
      designerStore.get().activeCompositionId,
    )!.layers[0]!.children;
    const c = render(children);

    expect(input(c, 'horizontal gap')).not.toBeNull();
    expect(input(c, 'vertical gap')).toBeNull();
    expect(c.textContent).not.toContain('More frames on top');
    expect(c.textContent).not.toContain('More frames on bottom');
    expect(c.textContent).toContain('Arrange evenly');
  });

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
