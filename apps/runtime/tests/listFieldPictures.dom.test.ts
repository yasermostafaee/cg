/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  ListFieldEditor,
  PICTURE_LIST_SENTENCE,
} from '../src/renderer/features/inspector/ListFieldEditor.js';

/**
 * 🔴 `B-353` (RUN-NEXT-VERSION-02 1.1.5) — **NEVER A BLANK TEXT BOX FOR A PICTURE.** The owner's book
 * reached the generic list editor and showed six EMPTY boxes; an Update from them would have
 * replaced his pages with empty text. A list of pictures is named, read only, and stages nothing.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

function render(value: unknown, onStage = vi.fn()): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root?.render(createElement(ListFieldEditor, { fieldId: 'a1', value: value as never, onStage })),
  );
  return host;
}

const PAGES = [1, 2, 3].map((n) => ({
  id: `page-mv9wduov-${String(n)}`,
  kind: 'image',
  assetId: `asset-${String(n)}`,
  name: `MRN (${String(n)}).jpg`,
}));

describe('🔴 B-353 — a list of pictures in the generic editor', () => {
  it('names each picture, read only, with the one sentence — no text box, no Add item', () => {
    const onStage = vi.fn();
    const el = render(PAGES, onStage);
    expect(el.querySelectorAll('textarea')).toHaveLength(0);
    expect(el.querySelector('[aria-label="Add a1 item"]')).toBeNull();
    expect(el.querySelector('[data-testid="list-pictures"]')?.textContent).toBe(
      PICTURE_LIST_SENTENCE,
    );
    expect([...el.querySelectorAll('li bdi')].map((b) => b.textContent)).toEqual([
      'MRN (1).jpg',
      'MRN (2).jpg',
      'MRN (3).jpg',
    ]);
    expect(onStage).not.toHaveBeenCalled();
  });

  it('a list of text is still edited as text', () => {
    const el = render([{ id: 't1', text: 'خبر' }]);
    expect(el.querySelectorAll('textarea')).toHaveLength(1);
    expect(el.querySelector('[data-testid="list-pictures"]')).toBeNull();
  });
});
