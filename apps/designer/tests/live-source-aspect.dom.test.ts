/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, VideoPlaceholderElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { matchesAspect } from '../src/renderer/features/inspector/aspect-presets.js';

/**
 * D-147 — the Live Source Inspector's aspect picker and fit action, mounted.
 *
 * The pure arithmetic lives in `live-source-aspect.test.ts`; what is only
 * observable here is the WIRING: that `— not specified —` writes the field ABSENT
 * rather than a zero, that `Custom…` reveals the numeric input, that the fit is ONE
 * undo entry, and that the button disables itself for the two reasons it should.
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

function seedScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

function elementById(id: string): VideoPlaceholderElement {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId);
  const el = scene?.layers[0]?.children.find((c) => c.id === id);
  return el as VideoPlaceholderElement;
}

function renderStyle(element: Element): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(StyleSection, { element, selectedKeyframe: null })));
  return container;
}

/** Re-render with the element as the store now holds it (the panel's own behaviour). */
function rerender(id: string): HTMLDivElement {
  act(() =>
    root?.render(createElement(StyleSection, { element: elementById(id), selectedKeyframe: null })),
  );
  return container as HTMLDivElement;
}

const aspectSelect = (c: HTMLElement): HTMLSelectElement =>
  c.querySelector<HTMLSelectElement>('select[aria-label="aspect"]') as HTMLSelectElement;

const fitButton = (c: HTMLElement): HTMLButtonElement =>
  c.querySelector<HTMLButtonElement>(
    'button[aria-label="Fit plate to aspect"]',
  ) as HTMLButtonElement;

const customInput = (c: HTMLElement): HTMLInputElement | null =>
  c.querySelector<HTMLInputElement>(
    'input[aria-label="custom aspect"], [aria-label="custom aspect"] input',
  );

function pick(c: HTMLElement, value: string): void {
  const select = aspectSelect(c);
  act(() => {
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

function seedLiveSource(over: Partial<VideoPlaceholderElement> = {}): string {
  seedScene();
  designerStore.addElement({ ...defaultLiveSource('ls1', 100, 100), ...over } as Element);
  return 'ls1';
}

describe('D-147 — the picker shows the stored number as a NAMED preset', () => {
  it('a new element shows 16:9, with the decimal beside it', () => {
    const id = seedLiveSource();
    const c = renderStyle(elementById(id));
    expect(aspectSelect(c).value).toBe('16:9');
    const selected = aspectSelect(c).selectedOptions[0];
    expect(selected?.textContent).toContain('16:9');
    expect(selected?.textContent).toContain('1.78');
  });

  it('an OFF-preset stored number shows as Custom, and reveals the numeric input', () => {
    const id = seedLiveSource({ expectedAspect: 1.85 });
    const c = renderStyle(elementById(id));
    expect(aspectSelect(c).value).toBe('custom');
    expect(customInput(c)).not.toBeNull();
  });

  it('picking a preset writes THAT number and nothing else', () => {
    const id = seedLiveSource();
    const c = renderStyle(elementById(id));
    pick(c, '4:3');
    expect(elementById(id).expectedAspect).toBeCloseTo(4 / 3, 6);
    // The plate's geometry is untouched: the picker declares, it does not resize.
    expect(elementById(id).transform.size).toEqual({ w: 640, h: 360 });
  });

  it('picking Custom… reveals the input WITHOUT changing a stored value', () => {
    const id = seedLiveSource();
    const c = renderStyle(elementById(id));
    pick(c, 'custom');
    rerender(id);
    expect(customInput(c)).not.toBeNull();
    // 16/9 was already stored and is left alone — Custom is a disclosure, not an edit.
    expect(elementById(id).expectedAspect).toBeCloseTo(16 / 9, 6);
  });
});

/**
 * ⭐ `C-028` — the FIT MODE control's WIRING.
 *
 * The fitted geometry itself is pinned across the package boundary in
 * `packages/template-runtime/tests/live-fit-two-axis.test.ts`. What is only observable
 * HERE is what the control does to the scene: that it writes the element (not local
 * state), that it is one ordinary undoable edit, and that an absent value reads as
 * `contain` without the schema being made to store it.
 */
describe('C-028 — the fit mode is written to the ELEMENT', () => {
  const fitSelect = (c: HTMLElement): HTMLSelectElement =>
    c.querySelector<HTMLSelectElement>('select[aria-label="fit"]') as HTMLSelectElement;

  const pickFit = (c: HTMLElement, value: string): void => {
    const select = fitSelect(c);
    act(() => {
      select.value = value;
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
  };

  it('a plate with NO stored mode reads `contain`, and stores nothing', () => {
    const id = seedLiveSource();
    const c = renderStyle(elementById(id));
    expect(fitSelect(c).value).toBe('contain');
    // 🔴 Reading the default must not WRITE it. A control that wrote `contain` on mount
    // would put a value in every scene that opens, which is a diff on a file nobody
    // edited — and would make "absent" unreachable for any plate ever opened.
    expect(elementById(id).fitMode).toBeUndefined();
  });

  it('picking a mode writes THAT mode, and touches nothing else', () => {
    const id = seedLiveSource();
    const c = renderStyle(elementById(id));
    pickFit(c, 'cover');
    expect(elementById(id).fitMode).toBe('cover');
    // The picker declares how the picture sits IN the box; it never moves the box.
    expect(elementById(id).transform.size).toEqual({ w: 640, h: 360 });
    expect(elementById(id).expectedAspect).toBeCloseTo(16 / 9, 6);
  });

  it('the stored mode reads back into the control', () => {
    const id = seedLiveSource({ fitMode: 'cover' });
    const c = renderStyle(elementById(id));
    expect(fitSelect(c).value).toBe('cover');
  });

  it('🔴 it is ONE undoable element edit — not local component state', () => {
    // The failure this catches is a control wired to `useState`: it reads correctly for
    // as long as it stays mounted and silently loses the value the moment it does not.
    // Driven here rather than in the E2E because the store coalesces writes within
    // 300 ms into a single history entry, so an E2E undo assertion would be measuring
    // Playwright's action latency against that window (the same reason D-147's fit
    // undo assertion lives in this file).
    const id = seedLiveSource();
    const c = renderStyle(elementById(id));
    designerStore.markHistoryBoundary();
    pickFit(c, 'cover');
    expect(elementById(id).fitMode).toBe('cover');

    act(() => designerStore.undo());
    expect(elementById(id).fitMode).toBeUndefined();
  });
});

describe('D-147 — “not specified” writes the field ABSENT', () => {
  it('picking it removes the value, and it reloads as absent', () => {
    const id = seedLiveSource();
    const c = renderStyle(elementById(id));
    pick(c, 'unspecified');
    // ABSENT — not 0, not a sentinel. Under design.md §3 the bridge REFUSES a take
    // on an expectedAspect that disagrees with the mapping; a sentinel number would
    // be an assertion the author explicitly declined to make.
    expect(elementById(id).expectedAspect).toBeUndefined();
    rerender(id);
    expect(aspectSelect(c).value).toBe('unspecified');
    expect(customInput(c)).toBeNull();
  });

  it('the fit action is DISABLED, with a title naming the reason', () => {
    const id = seedLiveSource({ expectedAspect: undefined });
    const c = renderStyle(elementById(id));
    expect(fitButton(c).disabled).toBe(true);
    expect(fitButton(c).title).toMatch(/not specified|Pick an aspect/i);
  });
});

describe('D-147 — the fit action', () => {
  it('is DISABLED when the plate already matches, and says so', () => {
    // 640×360 at scale 1 already renders 16:9.
    const id = seedLiveSource();
    const c = renderStyle(elementById(id));
    expect(fitButton(c).disabled).toBe(true);
    expect(fitButton(c).title).toMatch(/already/i);
  });

  it('resizes to the selected aspect, preserving X, Y and W', () => {
    const id = seedLiveSource();
    const before = elementById(id).transform;
    const c = renderStyle(elementById(id));
    pick(c, '4:3');
    rerender(id);
    expect(fitButton(c).disabled).toBe(false);
    act(() => fitButton(c).click());
    const after = elementById(id).transform;
    expect(after.position).toEqual(before.position);
    expect(after.size.w).toBe(before.size.w);
    expect(after.size.h).toBeCloseTo(480, 6);
    expect(matchesAspect(after, 4 / 3)).toBe(true);
    // `scale` is untouched — the action is about size.
    expect(after.scale).toEqual(before.scale);
  });

  it('is ONE undo entry for the whole action', () => {
    const id = seedLiveSource();
    const c = renderStyle(elementById(id));
    pick(c, '4:3');
    rerender(id);
    // The store COALESCES writes within 300 ms into one history entry, so a test
    // that just clicks would undo the setup along with the action and prove nothing.
    // Close the setup burst first — the same boundary a real gesture's pointerup
    // marks — so the next undo can only be the fit.
    designerStore.markHistoryBoundary();
    const sizeBefore = elementById(id).transform.size;
    act(() => fitButton(c).click());
    expect(elementById(id).transform.size.h).toBeCloseTo(480, 6);
    // A SINGLE undo puts the plate back and leaves the element (and its 4:3 pick)
    // standing. Writing size in two steps would need two undos.
    act(() => designerStore.undo());
    expect(elementById(id)).toBeDefined();
    expect(elementById(id).transform.size).toEqual(sizeBefore);
    expect(elementById(id).expectedAspect).toBeCloseTo(4 / 3, 6);
  });

  it('the tooltip says which side it preserved', () => {
    const id = seedLiveSource();
    const c = renderStyle(elementById(id));
    pick(c, '4:3');
    rerender(id);
    expect(fitButton(c).title).toMatch(/keeps X, Y and W/);
  });

  it('near the bottom edge it flips to preserving H, and the tooltip says why', () => {
    // A wide, low plate parked near the bottom: fitting 9:16 by height would run
    // off the frame, which is a preflight ERROR for a Live Source — so the action
    // must not create the very error it exists to help avoid.
    const id = seedLiveSource({
      transform: {
        position: { x: 100, y: 900 },
        size: { w: 640, h: 120 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
    } as Partial<VideoPlaceholderElement>);
    const c = renderStyle(elementById(id));
    pick(c, '9:16');
    rerender(id);
    expect(fitButton(c).title).toMatch(/keeps X, Y and H/);
    act(() => fitButton(c).click());
    const after = elementById(id).transform;
    expect(after.size.h).toBe(120);
    expect(after.position.y + after.size.h).toBeLessThanOrEqual(1080);
    expect(matchesAspect(after, 9 / 16)).toBe(true);
  });
});
