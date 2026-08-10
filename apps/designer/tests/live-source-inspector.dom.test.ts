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

const live = (): Element => defaultLiveSource('live-1', 100, 100, 'guest-1');
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
    expect(text).toMatch(/composited behind it/i);
  });
});

/** Tear the current render down so a single test can render a second element cleanly. */
function afterRender(): void {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
}
