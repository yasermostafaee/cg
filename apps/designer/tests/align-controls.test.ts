/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element } from '@cg/shared-schema';
import { AnimatablePropertySchema } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import {
  defaultClock,
  defaultSequence,
  defaultText,
  defaultTicker,
} from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * D-045 — alignment is unified onto ONE shared button-group (the text group is the model):
 * clock/sequence replace their `align` dropdown with the button-group AND gain a vertical
 * group; the ticker gains a vertical group only (no horizontal — it is a crawl). align and
 * verticalAlign are NON-keyframable everywhere (write via updateElement, no track/diamond).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// D-039ext — the ticker inspector mounts the separator picker, which reads the
// `window.cg.assets` + `window.cg.sharedImages` bridges on mount. Stub minimal,
// empty libraries so the inspector renders without a real bridge.
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

function seedScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

function elementById(id: string): Element {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId)!;
  return scene.layers[0]!.children.find((c) => c.id === id)!;
}

function renderStyle(element: Element): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(StyleSection, { element, selectedKeyframe: null })));
  return container;
}

function clickButton(c: HTMLElement, label: string): void {
  const btn = c.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (btn === null) throw new Error(`no button labelled "${label}"`);
  act(() => {
    btn.click();
  });
}

const hGroup = (c: HTMLElement): Element | null =>
  c.querySelector('[role="group"][aria-label="Horizontal alignment"]');
const vGroup = (c: HTMLElement): Element | null =>
  c.querySelector('[role="group"][aria-label="Vertical alignment"]');

describe('D-045 — non-keyframable: align / verticalAlign are not AnimatableProperties', () => {
  it('neither align nor verticalAlign is a member of AnimatablePropertySchema', () => {
    expect(AnimatablePropertySchema.safeParse('align').success).toBe(false);
    expect(AnimatablePropertySchema.safeParse('verticalAlign').success).toBe(false);
  });
});

describe('D-045 — clock/sequence: shared H button-group (not a dropdown) + V group', () => {
  for (const make of [defaultClock, defaultSequence]) {
    const kind = make === defaultClock ? 'clock' : 'sequence';
    it(`${kind}: renders the H + V button-groups, NOT an align dropdown`, () => {
      seedScene();
      designerStore.addElement(make('e1', 0, 0));
      const c = renderStyle(elementById('e1'));
      expect(hGroup(c)).not.toBeNull();
      expect(vGroup(c)).not.toBeNull();
      // The old dropdown is gone.
      expect(c.querySelector('select[aria-label="align"]')).toBeNull();
    });

    it(`${kind}: committing H/V writes element.align / element.verticalAlign with no track`, () => {
      seedScene();
      designerStore.addElement(make('e2', 0, 0));
      const c = renderStyle(elementById('e2'));
      clickButton(c, 'Align end');
      clickButton(c, 'Vertical top');
      const el = elementById('e2') as {
        align: string;
        verticalAlign?: string;
        animation?: { tracks: Record<string, unknown> };
      };
      expect(el.align).toBe('end');
      expect(el.verticalAlign).toBe('top');
      // Non-keyframable — no tracks created.
      expect(el.animation?.tracks['align']).toBeUndefined();
      expect(el.animation?.tracks['verticalAlign']).toBeUndefined();
    });
  }
});

describe('D-045 — ticker: vertical group only (a crawl has no horizontal align)', () => {
  it('renders the V group and NO H group, and committing writes verticalAlign', () => {
    seedScene();
    designerStore.addElement(defaultTicker('tk', 0, 0));
    const c = renderStyle(elementById('tk'));
    expect(vGroup(c)).not.toBeNull();
    expect(hGroup(c)).toBeNull();
    clickButton(c, 'Vertical bottom');
    const el = elementById('tk') as {
      verticalAlign?: string;
      animation?: { tracks: Record<string, unknown> };
    };
    expect(el.verticalAlign).toBe('bottom');
    expect(el.animation?.tracks['verticalAlign']).toBeUndefined();
  });
});

describe('D-045 — text keeps both groups (refactor is behaviour-preserving)', () => {
  it('renders the H + V button-groups and commits align / verticalAlign', () => {
    seedScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    const c = renderStyle(elementById('t1'));
    expect(hGroup(c)).not.toBeNull();
    expect(vGroup(c)).not.toBeNull();
    clickButton(c, 'Align center');
    clickButton(c, 'Vertical middle');
    const el = elementById('t1') as { align: string; verticalAlign?: string };
    expect(el.align).toBe('center');
    expect(el.verticalAlign).toBe('middle');
  });
});
