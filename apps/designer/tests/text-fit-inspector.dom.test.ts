/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene, TextElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';
import { TextStyleSection } from '../src/renderer/features/inspector/TextStyleSection.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * 🔴 `TEXT-FIT-01` (`B-147`, owner Q8 (b)) — **SHRINK TO FIT IS A REAL CONTROL AGAIN, IN ITS ONE
 * SPELLING.** It replaces the interim "not available" fact `DESIGNER-FIX-02` shipped (Q8 (a)), which
 * this file used to pin; that requirement is superseded, not loosened — the page now performs the
 * shrink the control promises. Offered on a fixed box only; its overflow choice shows only while it
 * shrinks; no explanatory prose; a project saved with a legacy spelling opens with its intent.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

function current(): TextElement {
  const st = designerStore.get();
  const el = editSceneOf(st.scene, st.activeCompositionId)?.layers[0]?.children.find(
    (c) => c.id === 't1',
  );
  return el as TextElement;
}

function seedText(over: Partial<TextElement> | Record<string, unknown> = {}): TextElement {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'demo',
    'lower-third',
  );
  designerStore.setScene(scene, null);
  designerStore.addElement({ ...defaultText('t1', 0, 0), ...over } as Element);
  return current();
}

function render(element: TextElement): HTMLDivElement {
  if (container === null) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root?.render(createElement(TextStyleSection, { element })));
  return container;
}

/** The labelled row whose label reads `label`. */
function rowOf(c: HTMLElement, label: string): HTMLElement | null {
  const span = [...c.querySelectorAll('span')].find((n) => n.textContent === label);
  return span?.parentElement ?? null;
}

function press(row: HTMLElement | null, label: string): void {
  const button = [...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label);
  if (button === undefined) throw new Error(`no ${label} button`);
  act(() => button.click());
}

describe('TEXT-FIT-01 — Shrink to Fit in the Inspector', () => {
  it('🔴 a fixed text offers Shrink to Fit (Yes / No); Yes writes the ONE spelling', () => {
    const c = render(seedText());
    const row = rowOf(c, 'Shrink to Fit');
    expect([...(row?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual([
      'Yes',
      'No',
    ]);
    // No overflow choice until it shrinks.
    expect(rowOf(c, 'Overflow')).toBeNull();

    press(row, 'Yes');
    expect(current().fitMode).toBe('shrink-to-fit');
    expect('autoSqueeze' in current()).toBe(false);
  });

  it('while shrinking: Overflow (Clip / Ellipsis) appears, and Sizing still reads Fixed', () => {
    const c = render(seedText({ fitMode: 'shrink-to-fit' }));
    const overflow = rowOf(c, 'Overflow');
    expect([...(overflow?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual([
      'Clip',
      'Ellipsis',
    ]);
    press(overflow, 'Ellipsis');
    expect(current().overflow).toBe('ellipsis');

    // The box is the authored box: Sizing is FIXED (it used to read Auto), and pressing Fixed
    // must not switch the shrink off.
    const sizing = rowOf(render(current()), 'Sizing');
    const fixed = [...(sizing?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Fixed',
    );
    expect(fixed?.getAttribute('aria-pressed')).toBe('true');
    press(sizing, 'Fixed');
    expect(current().fitMode).toBe('shrink-to-fit');
  });

  it('an Auto box grows to its text: it offers no Shrink to Fit', () => {
    const c = render(seedText({ fitMode: 'autosize' }));
    expect(rowOf(c, 'Shrink to Fit')).toBeNull();
    expect(rowOf(c, 'Overflow')).toBeNull();
  });

  it('🔴 ABSENCE: the interim fact and its prose are gone — no "Auto Squeeze", no "not available"', () => {
    const c = render(seedText({ fitMode: 'shrink-to-fit' }));
    expect(c.textContent).not.toContain('Auto Squeeze');
    expect(c.textContent).not.toContain('not available');
    expect(c.querySelector('[data-testid="auto-squeeze-unavailable"]')).toBeNull();
    // An operator surface carries no explanatory prose: the two rows are a label and buttons.
    for (const label of ['Shrink to Fit', 'Overflow']) {
      const row = rowOf(c, label);
      expect(row?.querySelectorAll('p')).toHaveLength(0);
    }
  });

  it('🔴 a project saved with autoSqueeze: true OPENS as shrink-to-fit — the legacy key gone', () => {
    // The store's own document, saved with the legacy spelling — then opened through the load path.
    seedText();
    const saved = JSON.stringify(designerStore.get().scene);
    expect(saved.split('"fitMode":"fixed"')).toHaveLength(2); // exactly one text, so one edit
    const legacy = JSON.parse(
      saved.replace('"fitMode":"fixed"', '"autoSqueeze":true,"fitMode":"fixed"'),
    ) as Scene;
    designerStore._reset();
    designerStore.setScene(legacy, null);
    const opened = current();
    expect(opened.fitMode).toBe('shrink-to-fit');
    expect('autoSqueeze' in opened).toBe(false);
    expect(
      rowOf(render(opened), 'Shrink to Fit')?.querySelector('[aria-pressed="true"]')?.textContent,
    ).toBe('Yes');
  });

  it('the neighbouring toggles are still toggles — Text Wrap keeps its Yes / No', () => {
    const row = rowOf(render(seedText()), 'Text Wrap');
    expect([...(row?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual([
      'Yes',
      'No',
    ]);
  });
});
