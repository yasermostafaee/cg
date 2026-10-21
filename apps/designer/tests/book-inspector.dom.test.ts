/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element as SceneElement, Scene, SequenceElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultSequence } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { DynamicDataSection } from '../src/renderer/features/inspector/DynamicDataSection.js';

/**
 * 🔴 `B-353` — what the Designer's Inspector says about a BOOK: a book set to advance auto is told
 * that CG Control's page count cannot follow it (RUN-NEXT-VERSION-02 1.1.4), and a page list offers no
 * "Allow file source" — the text-file grant whose tick dropped the owner's book's mark.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noUnsub = (): void => undefined;
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

function projected(): Scene {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId);
  if (scene === null) throw new Error('no active composition');
  return scene;
}

function sequence(): SequenceElement {
  const el = projected().layers[0]?.children.find((c) => c.id === 'sq');
  if (el?.type !== 'sequence') throw new Error('no sequence');
  return el;
}

/** A sequence `sq` holding two pictures — a book, as `Add folder…` makes it (advance manual). */
function seedBook(): void {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'book',
    'lower-third',
  );
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultSequence('sq', 0, 0));
  designerStore.addSequencePictures('sq', [
    { assetId: 'a1', name: 'p1.jpg' },
    { assetId: 'a2', name: 'p2.jpg' },
  ]);
}

function render(node: ReturnType<typeof createElement>): HTMLDivElement {
  if (container === null) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root?.render(node));
  return container;
}

const autoLine = (host: ParentNode): Element | null =>
  host.querySelector('[data-testid="book-auto-advance"]');

describe('🔴 B-353 — a book set to advance auto is told what CG Control can follow', () => {
  it('manual (what Add folder… sets) says nothing', () => {
    seedBook();
    const host = render(
      createElement(StyleSection, { element: sequence(), selectedKeyframe: null }),
    );
    expect(sequence().advance).toBe('manual');
    expect(autoLine(host)).toBeNull();
  });

  it('auto says that the page count falls behind, with the dwell, and what to set', () => {
    seedBook();
    designerStore.updateElement('sq', { advance: 'auto' } as Partial<SceneElement>);
    const host = render(
      createElement(StyleSection, { element: sequence(), selectedKeyframe: null }),
    );
    const line = autoLine(host);
    expect(line?.textContent).toContain('every 5 s');
    expect(line?.textContent).toContain('page number falls behind');
    expect(line?.textContent).toContain('Set advance to manual');
  });

  it('a picture sequence the operator does not step, or a text sequence, says nothing', () => {
    seedBook();
    designerStore.updateElement('sq', {
      advance: 'auto',
      operatorSteps: false,
    } as Partial<SceneElement>);
    let host = render(createElement(StyleSection, { element: sequence(), selectedKeyframe: null }));
    expect(autoLine(host)).toBeNull();
    designerStore.updateElement('sq', { operatorSteps: undefined } as Partial<SceneElement>);
    designerStore.setSequenceItems('sq', [{ id: 't', text: 'خبر' }]);
    host = render(createElement(StyleSection, { element: sequence(), selectedKeyframe: null }));
    expect(sequence().advance).toBe('auto');
    expect(autoLine(host)).toBeNull();
  });
});

describe('BOOK-EXPORT §11 — no button inside a button in the Sequence Inspector', () => {
  it('the Items section’s `i` sits beside its toggle, never inside it (validateDOMNesting)', () => {
    seedBook();
    let host = render(createElement(StyleSection, { element: sequence(), selectedKeyframe: null }));
    expect(host.querySelectorAll('button button')).toHaveLength(0);
    designerStore.setSequenceItems('sq', [{ id: 't', text: 'خبر' }]);
    host = render(createElement(StyleSection, { element: sequence(), selectedKeyframe: null }));
    expect(host.querySelectorAll('button')).not.toHaveLength(0);
    expect(host.querySelectorAll('button button')).toHaveLength(0);
  });
});

describe('🔴 B-353 — a page list offers no text-file grant', () => {
  it('a book’s Data key shows where its pages come from, and no "Allow file source"', () => {
    seedBook();
    designerStore.setElementDataKey('sq', 'a1');
    const host = render(
      createElement(DynamicDataSection, { element: sequence(), scene: projected() }),
    );
    expect(host.querySelector('input[aria-label="Allow file source"]')).toBeNull();
    expect(host.querySelector('[data-testid="page-list-hint"]')?.textContent).toContain(
      'Load folder…',
    );
  });

  it('🔴 1.6 — a composition item is the one thing that removes the key, and the section says so', () => {
    seedBook();
    designerStore.setSequenceItems('sq', [
      ...sequence().items,
      { id: 'c', kind: 'composition', compositionId: 'comp-x' },
    ] as never);
    const host = render(
      createElement(DynamicDataSection, { element: sequence(), scene: projected() }),
    );
    // With no key the section opens folded, as the author finds it.
    act(() => {
      host.querySelector<HTMLButtonElement>('[aria-label="Toggle Dynamic / Data"]')?.click();
    });
    expect(host.querySelector('[data-testid="sequence-composition-lock"]')?.textContent).toBe(
      'A sequence with a composition item has no Data key and is not a book in CG Control.',
    );
  });

  it('a TEXT list keeps its grant', () => {
    seedBook();
    designerStore.setSequenceItems('sq', [{ id: 't', text: 'خبر' }]);
    designerStore.setElementDataKey('sq', 'rundown');
    const host = render(
      createElement(DynamicDataSection, { element: sequence(), scene: projected() }),
    );
    expect(host.querySelector('input[aria-label="Allow file source"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="page-list-hint"]')).toBeNull();
  });
});
