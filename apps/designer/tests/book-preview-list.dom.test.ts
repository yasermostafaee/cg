/** @vitest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ListItem } from '@cg/shared-schema';
import { ListItemsEditor } from '../src/renderer/features/fields/ListItemsEditor.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.6 (the owner, 2026-10-21) — **A BOOK'S PICTURES ARE NEVER EMPTY TEXT
 * BOXES IN THE PREVIEW.** A book of four pictures and one text page, given a Data key: the Preview's
 * data form drew FIVE text boxes, four of them empty. The form hands a sequence's list to this editor
 * in its plain (multi-line, dwell) form, which knew a picture only in the Inspector's form — so a
 * picture's missing text was a box to type in. A picture is its picture and its name; only a text
 * page takes text.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

// The bridge's two asset calls a page thumbnail makes (a test DOM cannot scale: the URL is used).
beforeAll(() => {
  Object.defineProperty(window, 'cg', {
    configurable: true,
    value: {
      assets: {
        url: (id: string) => Promise.resolve(`blob:asset-${id}`),
        onCleared: () => () => undefined,
      },
    },
  });
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

const book: ListItem[] = [
  { id: 'p1', kind: 'image', assetId: 'a1', name: 'cat 1.png' },
  { id: 'p2', kind: 'image', assetId: 'a2', name: 'cat 2.png' },
  { id: 'note', text: 'test1' },
];

function mount(onChange = vi.fn()): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // The Preview's sequence-bound list: multi-line text, the per-item dwell (PreviewFieldForm).
  act(() =>
    root?.render(
      createElement(ListItemsEditor, {
        items: book,
        label: 't1',
        onChange,
        multiline: true,
        showDwell: true,
      }),
    ),
  );
  return container;
}

describe('1.6 — a book in the Preview’s data form', () => {
  it('🔴 a picture is shown as its picture and name; only the text page is a text box', () => {
    const host = mount();
    const boxes = [
      ...host.querySelectorAll('textarea, input[type="text"]:not([placeholder="dwell"])'),
    ];
    expect(boxes.map((b) => (b as HTMLTextAreaElement).value)).toEqual(['test1']);
    expect(boxes[0]?.getAttribute('aria-label')).toBe('t1 item 3');
    const pictures = [...host.querySelectorAll('[data-list-picture]')];
    expect(pictures.map((p) => p.getAttribute('aria-label'))).toEqual([
      't1 item 1 picture',
      't1 item 2 picture',
    ]);
    expect(pictures.map((p) => p.textContent)).toEqual(['cat 1.png', 'cat 2.png']);
  });

  it('a picture shows its thumbnail', async () => {
    const host = mount();
    await act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    expect(
      [...host.querySelectorAll('[data-list-picture] img')].map((img) => img.getAttribute('src')),
    ).toEqual(['blob:asset-a1', 'blob:asset-a2']);
  });

  it('a picture keeps its dwell and its move and remove controls', () => {
    const onChange = vi.fn();
    const host = mount(onChange);
    expect(host.querySelectorAll('[aria-label="t1 item 1 dwell"]').length).toBe(1);
    const remove = host.querySelector<HTMLButtonElement>('[aria-label="Remove t1 item 1"]');
    act(() => remove?.click());
    expect((onChange.mock.calls[0]?.[0] as ListItem[]).map((i) => i.id)).toEqual(['p2', 'note']);
  });
});
