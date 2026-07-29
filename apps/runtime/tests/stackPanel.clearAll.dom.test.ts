// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { StackPanel } from '../src/renderer/features/stack/StackPanel.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';

/**
 * The stack header's Clear-All, beside Remove-All.
 *
 * The two must stay visibly distinct, because confusing them is expensive in opposite
 * directions: Remove-All empties the list (recovering costs a re-import and re-typing every
 * field), Clear-All only takes the graphics off air and leaves the rows idle and re-takeable.
 *
 * The gate is the app's own modal, not `window.confirm` — so these drive the dialog's real
 * buttons, and assert that no native dialog is reached for at all.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  clearPortals();
  vi.restoreAllMocks();
});

function item(itemId: string, status: StackItemState['status']): StackItemState {
  return { itemId, templateId: 'tpl', fields: {}, status, pending: false };
}

function stubBridge(
  stack: StackItemState[],
  link: 'live' | 'disconnected' = 'live',
): { clearAll: Mock; removeAll: Mock } {
  const clearAll = vi.fn(() => Promise.resolve({ ok: true, cleared: 0 }));
  const removeAll = vi.fn(() => Promise.resolve({ ok: true, removed: stack.length }));
  const stub = {
    link: { status: () => link, onStatusChanged: () => () => undefined },
    templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
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
    const confirmSpy = vi.spyOn(window, 'confirm');
    const el = await renderPanel();

    await act(async () => {
      clearAllButton(el)?.click();
      await Promise.resolve();
    });

    // The app's own dialog, saying what clearing costs — and what it does not cost.
    const dialog = openDialog();
    expect(dialog?.textContent).toContain('2 on-air item(s)');
    expect(dialog?.textContent).toContain('stay on the stack');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(clearAll).not.toHaveBeenCalled();

    await clickDialogButton('Clear all');

    expect(clearAll).toHaveBeenCalledTimes(1);
    // The whole point: clearing is not removing.
    expect(removeAll).not.toHaveBeenCalled();
    expect(openDialog()).toBeNull();
  });

  it('cancelling the modal clears nothing', async () => {
    const { clearAll } = stubBridge([item('a', 'on-air')]);
    const el = await renderPanel();

    await act(async () => {
      clearAllButton(el)?.click();
      await Promise.resolve();
    });
    await clickDialogButton('Cancel');

    expect(clearAll).not.toHaveBeenCalled();
    expect(openDialog()).toBeNull();
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
    const el = await renderPanel();

    await act(async () => {
      clearAllButton(el)?.click();
      await Promise.resolve();
    });

    // One on air out of three rows — a `loaded` item was ADDed but never PLAYed.
    expect(openDialog()?.textContent).toContain('1 on-air item(s)');
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

    // C-012 — the row's CLEAR is the FILLED amber (STOP took the outlined one), so the
    // bulk action follows it. Asserted as an exact class, not a substring: with both
    // `cg-btn--caution` and `cg-btn--caution-strong` in the vocabulary, a `toContain`
    // would pass for either and stop distinguishing STOP's treatment from CLEAR's.
    expect(clearAllButton(el)?.classList.contains('cg-btn--caution-strong')).toBe(true);
    expect(clearAllButton(el)?.classList.contains('cg-btn--caution')).toBe(false);
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

  it('both bulk actions are enabled while live and DISABLED while the link is down', async () => {
    // Was-live-then-dropped: the on-air snapshot persists across the drop (useBridgeSnapshot
    // keeps its last value while disconnected), so both stay SHOWN but disabled — the stack is
    // bridge-owned, so a bulk action can no more reach CasparCG than a per-item one can.
    const listeners = new Set<(s: 'live' | 'disconnected') => void>();
    let status: 'live' | 'disconnected' = 'live';
    const stub = {
      link: {
        status: () => status,
        onStatusChanged: (h: (s: 'live' | 'disconnected') => void) => {
          listeners.add(h);
          return () => listeners.delete(h);
        },
      },
      templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
      stack: {
        snapshot: () => Promise.resolve([item('a', 'on-air')]),
        onStateChanged: () => () => undefined,
        clearAll: vi.fn(() => Promise.resolve({ ok: true, cleared: 0 })),
        removeAll: vi.fn(() => Promise.resolve({ ok: true, removed: 1 })),
        take: () => Promise.resolve({ accepted: true }),
        update: () => Promise.resolve({ accepted: true }),
        out: () => Promise.resolve({ accepted: true }),
        remove: () => Promise.resolve({ accepted: true }),
      },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;
    const el = await renderPanel();
    expect(clearAllButton(el)?.disabled).toBe(false);
    expect(removeAllButton(el)?.disabled).toBe(false);

    await act(async () => {
      status = 'disconnected';
      for (const h of listeners) h('disconnected');
      await Promise.resolve();
    });

    expect(clearAllButton(el)?.disabled).toBe(true);
    expect(removeAllButton(el)?.disabled).toBe(true);
  });
});
