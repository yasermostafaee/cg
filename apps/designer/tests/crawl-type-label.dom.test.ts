// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { LibraryPanel } from '../src/renderer/features/library/LibraryPanel.js';

vi.mock('../src/renderer/state/store.js', () => ({ designerStore: { setScene: vi.fn() } }));

it('labels the existing template option Crawl but sends the unchanged ticker kind when selected', async () => {
  const previous = window.cg;
  const create = vi.fn().mockResolvedValue({ scene: null, path: null });
  window.cg = {
    projects: {
      recent: () => Promise.resolve([]),
      starters: () => Promise.resolve([]),
      onActiveChanged: () => () => undefined,
      create,
    },
  } as unknown as typeof window.cg;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(LibraryPanel)));
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Template type"]');
    const crawl = [...(select?.options ?? [])].find((option) => option.textContent === 'Crawl');
    expect(crawl?.value).toBe('ticker');
    if (select === null) throw new Error('Missing template type select');
    await act(async () => {
      select.value = 'ticker';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Create')
        ?.click();
    });
    expect(create).toHaveBeenCalledWith({ name: 'Untitled', templateType: 'ticker' });
  } finally {
    act(() => root.unmount());
    window.cg = previous;
    vi.unstubAllGlobals();
  }
});
