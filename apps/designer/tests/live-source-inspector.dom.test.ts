/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultLiveSource, defaultShape } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { activeLayersOf } from '../src/renderer/state/scene-doc.js';
import { TransformSection } from '../src/renderer/features/inspector/TransformSection.js';

/**
 * D-137 — the Live Source Inspector offers NOTHING it cannot honour.
 *
 * Every assertion here is a CONTRAST against a `shape`, deliberately. Asserting only
 * the absence would stay green against a regression that stripped keyframes,
 * rotation, opacity or filters from EVERY element kind — which is a far worse bug
 * than the one this guards, and would look identical to a passing test.
 *
 * What is removed and why (`live-source-multibox` design.md §6, `tasks.md` 1.8b):
 * the plate's rect is composed once at import and sent as a static, axis-aligned
 * `MIXER FILL` / `CLIP`, and the element paints zero pixels on air. So a keyframe
 * desyncs the hole from the picture, a rotation declares a bounding box larger than
 * the frame drawn, and opacity/filters reach nothing at all.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noUnsub = (): void => {
  /* no unsubscribe needed in tests */
};
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

/** The full right inspector for one element — Transform + Style, as `ElementInspector` composes it. */
function render(el: Element): HTMLDivElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'custom');
  designerStore.setScene(scene, null);
  /*
    The element is placed INTO the scene through the store's own `addElement`, not
    merely handed to the sections.

    The presence/absence tests below would pass either way; a WRITE test would not.
    Every Inspector row commits through `updateElement`, which resolves the id against
    the ACTIVE document and silently no-ops when it is not there — so a store-reading
    test on a scene without the element would fail for a reason that has nothing to do
    with the control, which is exactly the false negative those tests exist to rule
    out. `addElement` is used rather than a hand-built layer because `setScene` runs
    `ensureCompositions`: a fresh project's content lives in a COMPOSITION and
    `scene.layers` is empty, so an element pushed onto the root layers never arrives.
  */
  designerStore.addElement(el);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(
        Fragment,
        null,
        createElement(TransformSection, { element: el, selectedKeyframe: null }),
        createElement(StyleSection, { element: el, selectedKeyframe: null }),
      ),
    ),
  );
  // CollapseSection mounts children only when expanded — open everything so the
  // absence assertions are about the Inspector and not about a shut drawer.
  for (let i = 0; i < 20; i++) {
    const collapsed = container.querySelector<HTMLElement>('[aria-expanded="false"]');
    if (collapsed === null) break;
    act(() => {
      collapsed.click();
    });
  }
  return container;
}

/** Type into an input the way the browser does (native setter + input event). */
function typeInto(el: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Every property the rendered inspector offers a keyframe diamond for. */
function diamondProps(c: HTMLDivElement): string[] {
  return Array.from(c.querySelectorAll('[aria-label^="Toggle keyframe for "]'))
    .map(
      (el) => /^Toggle keyframe for (.+) at frame/.exec(el.getAttribute('aria-label') ?? '')?.[1],
    )
    .filter((p): p is string => p !== undefined);
}

/** The titles of the collapsible sections the inspector rendered. */
const sectionTitles = (c: HTMLDivElement): string[] =>
  Array.from(c.querySelectorAll('[aria-expanded]')).map((el) => (el.textContent ?? '').trim());

const labels = (c: HTMLDivElement): string[] =>
  Array.from(c.querySelectorAll('[aria-label]'))
    .map((el) => el.getAttribute('aria-label') ?? '')
    .filter((l) => l !== '');

// `B-183` — `defaultLiveSource` no longer takes a `routeKey`; a new plate is UNASSIGNED. The
// source is set here explicitly because these tests are about which CONTROLS the Inspector
// offers, and an unassigned plate would change the `source` row out from under them.
const live = (stroke?: { width: number; color: string }): Element =>
  ({
    ...defaultLiveSource('live-1', 100, 100),
    routeKey: 'guest-1',
    ...(stroke === undefined ? {} : { stroke }),
  }) as Element;
const shape = (): Element => defaultShape('sh-1', 100, 100);

describe('D-137 — the Live Source Inspector offers no affordance it cannot honour', () => {
  it('offers NO keyframe diamond on any transform field — while a shape offers several', () => {
    expect(diamondProps(render(live()))).toEqual([]);
    afterRender();
    // The contrast: the same harness, the same sections, a different kind.
    expect(diamondProps(render(shape())).length).toBeGreaterThan(0);
  });

  it('offers NO rotation field — while a shape does', () => {
    expect(labels(render(live()))).not.toContain('Rotation');
    afterRender();
    expect(labels(render(shape()))).toContain('Rotation');
  });

  it('offers NO opacity field — while a shape does', () => {
    expect(labels(render(live()))).not.toContain('Opacity');
    afterRender();
    expect(labels(render(shape()))).toContain('Opacity');
  });

  it('renders NO Filter SECTION — while a shape does', () => {
    // Asserted on the section HEADER, not on the word: the Live Source hint
    // legitimately contains "Filters", explaining why there is no section.
    expect(sectionTitles(render(live()))).not.toContain('Filter');
    afterRender();
    expect(sectionTitles(render(shape()))).toContain('Filter');
  });

  it('offers NO key id control — fill+key is the MAPPING’s, not the scene’s', () => {
    const c = render(live());
    expect(labels(c)).not.toContain('Live Source key source id');
    expect(c.textContent ?? '').not.toMatch(/key id/i);
  });

  it('KEEPS position, size and the static scale — those describe the hole', () => {
    // The flattener composes scale into the declared scene-px rect, so a static
    // scale genuinely moves the live box. Removing these would remove the contract.
    const l = labels(render(live()));
    for (const field of ['X position', 'Y position', 'Width', 'Height', 'Scale X', 'Scale Y']) {
      expect(l).toContain(field);
    }
  });

  it('KEEPS the source id and the aspect picker', () => {
    const l = labels(render(live()));
    expect(l).toContain('Live Source source id');
    expect(render(live()).textContent ?? '').toMatch(/aspect/i);
  });

  it('SAYS WHY, once — the author should not learn this from a preflight error', () => {
    const text = render(live()).textContent ?? '';
    expect(text).toMatch(/static and axis-aligned/i);
    // The hint was amended when the plate gained a frame (§9a.1): it used to say the
    // element paints nothing on air, which stopped being true. It now says the HOLE
    // paints nothing and the frame is the exception — and names where the frame sits.
    expect(text).toMatch(/composited on a layer behind it/i);
    expect(text).toMatch(/entirely/i);
  });

  /**
   * ⭐ §9a.1 / task 1.5e — the FRAME is the one thing this kind CAN honour, so it is
   * the one addition to an Inspector otherwise defined by subtraction.
   *
   * 🔴 **The write path is asserted, not assumed.** "Extend the list, forget the
   * mutator" is a failure this repo has shipped twice — a D-107 checkbox that clicked
   * and wrote nothing, and B-051's Path Style stroke rows that no-oped because `path`
   * was missing from `writeStaticAnimatable`'s box-kind guard. Both looked like React
   * bugs. A row that renders proves nothing; these tests read the STORE back.
   */
  describe('§9a.1 — the Frame section', () => {
    const frameSection = (c: HTMLDivElement): HTMLInputElement => {
      const el = c.querySelector<HTMLInputElement>('[aria-label="stroke width"]');
      if (el === null) throw new Error('no stroke width control in the Live Source Inspector');
      return el;
    };
    /*
      Read through `activeLayersOf`, not `scene.layers[0]`: `setScene` runs
      `ensureCompositions`, which migrates root layers into a composition and leaves
      `scene.layers` EMPTY. Reading the raw field would make every write below look
      like a no-op — the same false negative the harness note above is about, one
      level down, and the reason these tests read the STORE rather than the DOM.
    */
    const storedStroke = (): { width: number; color: string } | undefined => {
      const scene = designerStore.get().scene;
      if (scene === null) return undefined;
      const el = activeLayersOf(scene)[0]?.children[0] as
        | { stroke?: { width: number; color: string } }
        | undefined;
      return el?.stroke;
    };

    it('is OFFERED — a frame is paint OUTSIDE the hole, so it is honourable', () => {
      const l = labels(render(live()));
      expect(l).toContain('stroke width');
      expect(l).toContain('stroke hex value');
      expect(sectionTitles(render(live()))).toContain('Frame');
    });

    it('carries NO keyframe diamond — the plate stays static (1.8b), frame included', () => {
      // The frame COULD animate in principle: it is template-layer paint, not the
      // hole. It deliberately does not, because 1.8b removed every diamond from this
      // kind under one rule and the punch mechanism is not chosen yet. Withholding is
      // a subtraction that can be widened later without touching a stored scene.
      expect(diamondProps(render(live()))).toEqual([]);
    });

    it('WRITES the width to the scene — the row is not inert', () => {
      typeInto(frameSection(render(live())), '8');
      expect(storedStroke()?.width).toBe(8);
      // A first width edit writes the colour the swatch was ALREADY showing, so what
      // the author saw is what the scene holds.
      expect(storedStroke()?.color).toBe('#ffffff');
    });

    it('a width of 0 KEEPS the stroke object and its colour — zero is not "unset"', () => {
      // Seeded WITH a frame, so dialling it to zero is a real transition rather than
      // a no-op commit. (These sections render against a static `element` prop and
      // are never re-rendered from the store, so a two-step edit has to start from
      // authored state; the round trip THROUGH zero and back is driven in the
      // Playwright spec, where the Inspector really does re-render.)
      typeInto(frameSection(render(live({ width: 8, color: '#00ff00' }))), '0');
      // The falsy-zero trap: nothing may read the 0 as absent and drop the key, or
      // the colour is lost the moment the author dials the frame off.
      expect(storedStroke()).toEqual({ width: 0, color: '#00ff00' });
    });

    it('WRITES the colour, and keeps the width it was already carrying', () => {
      const c = render(live({ width: 6, color: '#00ff00' }));
      const hex = c.querySelector<HTMLInputElement>('[aria-label="stroke hex value"]');
      if (hex === null) throw new Error('no stroke hex control');
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(hex, 'FF8800');
        hex.dispatchEvent(new Event('input', { bubbles: true }));
        // `focusout`, not `blur`: React attaches its onBlur to the bubbling
        // `focusout`, and a non-bubbling `blur` never reaches the handler — a
        // dispatch that looks right and commits nothing.
        hex.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      });
      // Normalised on commit, and the width it was already carrying is untouched:
      // the two rows edit ONE object and neither may clobber the other's field.
      expect(storedStroke()).toEqual({ width: 6, color: '#FF8800' });
    });
  });
});

/** Tear the current render down so a single test can render a second element cleanly. */
function afterRender(): void {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
}
