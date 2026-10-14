/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, TextElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';
import {
  AUTO_SQUEEZE_UNAVAILABLE,
  TextStyleSection,
} from '../src/renderer/features/inspector/TextStyleSection.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * 🔴 `B-147` interim (owner, Q8 (a)) — Auto Squeeze is NOT BUILT, so the Inspector says so as a
 * FACT: no toggle that promises a shrink nothing performs, and no disabled control either (golden
 * rule 13 — a fact is not a missing permission). Asserted as an ABSENCE too, because that is the
 * direction it regresses in: the next person "restores" the toggle and nothing else fails.
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

function seedText(over: Partial<TextElement> = {}): TextElement {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'demo',
    'lower-third',
  );
  designerStore.setScene(scene, null);
  designerStore.addElement({ ...defaultText('t1', 0, 0), ...over } as Element);
  const st = designerStore.get();
  const el = editSceneOf(st.scene, st.activeCompositionId)?.layers[0]?.children.find(
    (c) => c.id === 't1',
  );
  return el as TextElement;
}

function render(element: TextElement): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(TextStyleSection, { element })));
  return container;
}

/** The labelled row whose label reads `label`. */
function rowOf(c: HTMLElement, label: string): HTMLElement | null {
  const span = [...c.querySelectorAll('span')].find((n) => n.textContent === label);
  return span?.parentElement ?? null;
}

describe('B-147 interim — Auto Squeeze is a fact, not a control', () => {
  it('🔴 the row reads "not available", with the reason as its title', () => {
    const c = render(seedText());
    const fact = c.querySelector('[data-testid="auto-squeeze-unavailable"]');
    expect(fact?.textContent).toBe('not available');
    expect(fact?.getAttribute('title')).toBe(AUTO_SQUEEZE_UNAVAILABLE);
    expect(AUTO_SQUEEZE_UNAVAILABLE).toBe(
      'Not built yet: on air the text keeps its size and may overflow its box.',
    );
    // A Tag — the non-interactive mark — not a span someone styled to look like one.
    expect(fact?.hasAttribute('data-cg-tag')).toBe(true);
  });

  it('🔴 ABSENCE: the row holds no button, no disabled control, nothing focusable', () => {
    const row = rowOf(render(seedText()), 'Auto Squeeze');
    expect(row).not.toBeNull();
    expect(
      row?.querySelectorAll('button, input, select, [role="button"], [tabindex]'),
    ).toHaveLength(0);
    expect(row?.textContent).not.toMatch(/Yes|No/);
  });

  it('a value saved before is KEPT in the element — only the control is gone', () => {
    const el = seedText({ autoSqueeze: true } as Partial<TextElement>);
    expect(el.autoSqueeze).toBe(true);
    const c = render(el);
    expect(c.querySelector('[data-testid="auto-squeeze-unavailable"]')?.textContent).toBe(
      'not available',
    );
    const st = designerStore.get();
    const after = editSceneOf(st.scene, st.activeCompositionId)?.layers[0]?.children.find(
      (n) => n.id === 't1',
    ) as TextElement | undefined;
    expect(after?.autoSqueeze).toBe(true);
  });

  it('the neighbouring toggles are still toggles — Text Wrap keeps its Yes / No', () => {
    const row = rowOf(render(seedText()), 'Text Wrap');
    expect([...(row?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual([
      'Yes',
      'No',
    ]);
  });
});
