/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultShape, defaultText } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';

// React's act() needs this flag set for createRoot rendering under Vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The text inspector mounts pickers that read the asset bridges on mount; stub
// minimal, empty libraries so StyleSection renders without a real bridge.
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
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

/** Render the Style inspector for one element with every CollapseSection expanded. */
function renderStyle(el: Element): HTMLDivElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'custom');
  designerStore.setScene(scene, null);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(StyleSection, { element: el, selectedKeyframe: null })));
  // CollapseSection only mounts its children when expanded.
  for (let i = 0; i < 20; i++) {
    const collapsed = container.querySelector<HTMLElement>('[aria-expanded="false"]');
    if (collapsed === null) break;
    act(() => collapsed.click());
  }
  return container;
}

const CORNERS = ['top left', 'top right', 'bottom right', 'bottom left'] as const;

const input = (c: HTMLDivElement, ariaLabel: string): HTMLInputElement | null =>
  c.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);

/** The corner input elements, keyed by their spatial corner name. */
const cornerInput = (c: HTMLDivElement, corner: (typeof CORNERS)[number]): HTMLInputElement => {
  const el = input(c, `${corner} radius`);
  if (el === null) throw new Error(`no input for "${corner} radius"`);
  return el;
};

/** The single uniform↔per-corner toggle (its aria-label states the mode it switches TO). */
const toggle = (c: HTMLDivElement): HTMLElement => {
  const el = c.querySelector<HTMLElement>(
    '[aria-label="Use per-corner border radius"], [aria-label="Use a single border radius"]',
  );
  if (el === null) throw new Error('no radius toggle');
  return el;
};

/** The keyframe diamond inside a corner's segment, if the segment renders one. */
const diamondIn = (seg: Element_ | null): HTMLElement | null =>
  seg?.querySelector<HTMLElement>('[aria-label^="Toggle keyframe for "]') ?? null;
type Element_ = globalThis.Element;

const perCornerShape = (corners: [number, number, number, number]): Element =>
  ({ ...defaultShape('s', 0, 0), cornerRadius: corners }) as Element;

describe('D-055 / D-058 — border-radius control layout (structure, not pixels)', () => {
  it('uniform mode: ONE radius field + its diamond, no corner inputs, toggle offers per-corner', () => {
    const c = renderStyle(defaultShape('s', 0, 0)); // no cornerRadius ⇒ uniform
    expect(input(c, 'radius')).not.toBeNull();
    for (const corner of CORNERS) expect(input(c, `${corner} radius`)).toBeNull();
    expect(
      c.querySelector('[aria-label^="Toggle keyframe for cornerRadius at frame"]'),
    ).not.toBeNull();
    // D-055 — a single right-edge toggle, NOT a separate wide bar in a bottom row.
    expect(toggle(c).getAttribute('aria-label')).toBe('Use per-corner border radius');
  });

  it('D-058 — per-corner mode lays the four inputs out in TWO rows: tl/tr over bl/br', () => {
    const c = renderStyle(perCornerShape([8, 16, 24, 32]));

    // Each corner input sits in a `cg-input-group` row; there must be exactly TWO,
    // grouping the corners by spatial position — NOT one flat row of four.
    const rowOf = (corner: (typeof CORNERS)[number]): Element_ | null =>
      cornerInput(c, corner).closest('.cg-input-group');
    const topRow = rowOf('top left');
    const bottomRow = rowOf('bottom left');
    expect(topRow).not.toBeNull();
    expect(bottomRow).not.toBeNull();
    expect(topRow).not.toBe(bottomRow);

    // Top row = top-left, top-right. Bottom row = bottom-left, bottom-right.
    expect(rowOf('top right')).toBe(topRow);
    expect(rowOf('bottom right')).toBe(bottomRow);

    const labelsIn = (row: Element_): string[] =>
      Array.from(row.querySelectorAll('input')).map((i) => i.getAttribute('aria-label') ?? '');
    expect(labelsIn(topRow!)).toEqual(['top left radius', 'top right radius']);
    expect(labelsIn(bottomRow!)).toEqual(['bottom left radius', 'bottom right radius']);

    // The uniform field is gone in per-corner mode.
    expect(input(c, 'radius')).toBeNull();
  });

  it('D-058 — each corner input carries its OWN keyframe diamond, bound to that corner', () => {
    const c = renderStyle(perCornerShape([8, 16, 24, 32]));
    const props: Record<(typeof CORNERS)[number], string> = {
      'top left': 'cornerRadius.tl',
      'top right': 'cornerRadius.tr',
      'bottom right': 'cornerRadius.br',
      'bottom left': 'cornerRadius.bl',
    };
    for (const corner of CORNERS) {
      const seg = cornerInput(c, corner).closest('.cg-seg');
      const diamond = diamondIn(seg);
      expect(diamond, `${corner} has no diamond`).not.toBeNull();
      expect(diamond!.getAttribute('aria-label')).toContain(`for ${props[corner]} at frame`);
    }
  });

  it('D-055 — no corner glyph inside the inputs: each cell is icon + value-free, input-first', () => {
    const c = renderStyle(perCornerShape([8, 16, 24, 32]));
    for (const corner of CORNERS) {
      const el = cornerInput(c, corner);
      const seg = el.closest('.cg-seg');
      // The input is the FIRST child of its segment — nothing (no corner icon span)
      // precedes it; only the trailing diamond follows.
      expect(seg?.firstElementChild, `${corner} has a leading icon in its cell`).toBe(el);
    }
  });

  it('D-058 — a 2- or 3-digit corner value round-trips in full (the single row clipped it)', () => {
    const c = renderStyle(perCornerShape([128, 64, 8, 999]));
    expect(cornerInput(c, 'top left').value).toBe('128');
    expect(cornerInput(c, 'top right').value).toBe('64');
    expect(cornerInput(c, 'bottom left').value).toBe('999');
  });

  it('D-055 — ONE toggle whose icon changes shape with the mode (uniform ⇄ per-corner)', () => {
    const uniform = renderStyle(defaultShape('s', 0, 0));
    const uniformToggle = toggle(uniform);
    const uniformIcon = uniformToggle.querySelector('svg')?.outerHTML;
    expect(uniformIcon).toBeDefined();
    expect(uniformToggle.getAttribute('title')).toBe('Per-corner radius');
    // Exactly one toggle — the old design added a second, full-width bar.
    expect(uniform.querySelectorAll('[aria-label$="border radius"]')).toHaveLength(1);

    const perCorner = renderStyle(perCornerShape([8, 16, 24, 32]));
    const perCornerToggle = toggle(perCorner);
    const perCornerIcon = perCornerToggle.querySelector('svg')?.outerHTML;
    expect(perCornerToggle.getAttribute('aria-label')).toBe('Use a single border radius');
    expect(perCornerToggle.getAttribute('title')).toBe('Single radius');
    // The icon reflects the CURRENT mode, so the two modes must not render the same glyph.
    expect(perCornerIcon).not.toBe(uniformIcon);
  });

  it('the same two-row per-corner layout applies to TEXT (D-056 left radius on shape + text)', () => {
    const text = { ...defaultText('t', 0, 0), cornerRadius: [8, 16, 24, 32] } as Element;
    const c = renderStyle(text);
    const topRow = cornerInput(c, 'top left').closest('.cg-input-group');
    const bottomRow = cornerInput(c, 'bottom left').closest('.cg-input-group');
    expect(topRow).not.toBeNull();
    expect(topRow).not.toBe(bottomRow);
    expect(cornerInput(c, 'top right').closest('.cg-input-group')).toBe(topRow);
    expect(cornerInput(c, 'bottom right').closest('.cg-input-group')).toBe(bottomRow);
    for (const corner of CORNERS) {
      expect(diamondIn(cornerInput(c, corner).closest('.cg-seg'))).not.toBeNull();
    }
  });
});
