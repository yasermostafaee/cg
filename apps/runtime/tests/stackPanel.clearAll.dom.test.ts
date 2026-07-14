// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { StackPanel } from '../src/renderer/features/stack/StackPanel.js';

/**
 * The stack header's Clear-All, beside Remove-All.
 *
 * The two must stay visibly distinct, because confusing them is expensive in opposite
 * directions: Remove-All empties the list (recovering costs a re-import and re-typing every
 * field), Clear-All only takes the graphics off air and leaves the rows idle and re-takeable.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function item(itemId: string, status: StackItemState['status']): StackItemState {
  return { itemId, templateId: 'tpl', fields: {}, status, pending: false };
}

function stubBridge(stack: StackItemState[]): { clearAll: Mock; removeAll: Mock } {
  const clearAll = vi.fn(() => Promise.resolve({ ok: true, cleared: 0 }));
  const removeAll = vi.fn(() => Promise.resolve({ ok: true, removed: stack.length }));
  const stub = {
    link: { status: () => 'live' as const, onStatusChanged: () => () => undefined },
    templates: { list: () => Promise.resolve([]) },
    stack: {
      snapshot: () => Promise.resolve(stack),
      onStateChanged: () => () => undefined,
      clearAll,
      removeAll,
      take: () => Promise.resolve({ accepted: true }),
      update: () => Promise.resolve({ accepted: true }),
      out: () => Promise.resolve({ accepted: true }),
      remove: () => Promise.resolve({ accepted: true }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { clearAll, removeAll };
}

async function renderPanel(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(StackPanel, { onSelectionChange: () => undefined }),
      ),
    );
    await Promise.resolve();
  });
  return container;
}

const clearAllButton = (el: HTMLElement): HTMLButtonElement | null =>
  el.querySelector<HTMLButtonElement>('button[aria-label="Clear all on-air items"]');
const removeAllButton = (el: HTMLElement): HTMLButtonElement | null =>
  el.querySelector<HTMLButtonElement>('button[aria-label="Remove all items"]');

describe('StackPanel Clear-All', () => {
  it('confirming clears air — and does NOT remove anything', async () => {
    const { clearAll, removeAll } = stubBridge([item('a', 'on-air'), item('b', 'on-air')]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const el = await renderPanel();

    await act(async () => {
      clearAllButton(el)?.click();
      await Promise.resolve();
    });

    expect(confirm).toHaveBeenCalledWith(
      'Clear all 2 on-air item(s)? They come off air and stay on the stack, idle.',
    );
    expect(clearAll).toHaveBeenCalledTimes(1);
    // The whole point: clearing is not removing.
    expect(removeAll).not.toHaveBeenCalled();
  });

  it('cancelling the confirm clears nothing', async () => {
    const { clearAll } = stubBridge([item('a', 'on-air')]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const el = await renderPanel();

    await act(async () => {
      clearAllButton(el)?.click();
    });

    expect(clearAll).not.toHaveBeenCalled();
  });

  it('is hidden when nothing is on air — there would be nothing to clear', async () => {
    // Remove-All still shows: the rows exist and can be dropped, they are just not on air.
    stubBridge([item('a', 'loaded'), item('b', 'idle')]);
    const el = await renderPanel();

    expect(clearAllButton(el)).toBeNull();
    expect(removeAllButton(el)).not.toBeNull();
  });

  it('counts only the on-air items, not the whole stack', async () => {
    stubBridge([item('a', 'on-air'), item('b', 'loaded'), item('c', 'idle')]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const el = await renderPanel();

    await act(async () => {
      clearAllButton(el)?.click();
    });

    // One on air out of three rows — a `loaded` item was ADDed but never PLAYed.
    expect(confirm).toHaveBeenCalledWith(
      'Clear all 1 on-air item(s)? They come off air and stay on the stack, idle.',
    );
  });

  it('offers both actions, distinctly, when items are on air', async () => {
    stubBridge([item('a', 'on-air')]);
    const el = await renderPanel();

    expect(clearAllButton(el)?.textContent).toBe('CLEAR ALL');
    expect(removeAllButton(el)?.textContent).toBe('REMOVE ALL');
  });

  it('colours each bulk action like its per-item counterpart', async () => {
    // The clear family shares one treatment, the remove family another — and the destructive
    // one (it drops the rows) is the red. Remove-All used to wear the same amber as Clear,
    // which made the irreversible action look like the reversible one.
    stubBridge([item('a', 'on-air')]);
    const el = await renderPanel();

    expect(clearAllButton(el)?.className).toContain('cg-btn--caution'); // as the row's CLEAR
    expect(removeAllButton(el)?.className).toContain('cg-btn--danger'); // as the row's REMOVE
    expect(removeAllButton(el)?.className).not.toContain('cg-btn--caution');
  });

  it('sits both bulk actions together in one group, not spread across the header', async () => {
    stubBridge([item('a', 'on-air')]);
    const el = await renderPanel();

    // Same parent: the header is `space-between`, so loose siblings would strand Clear-All in
    // the middle of the header and push Remove-All to the far edge.
    expect(clearAllButton(el)?.parentElement).toBe(removeAllButton(el)?.parentElement);
  });
});
