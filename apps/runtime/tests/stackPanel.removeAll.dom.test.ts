// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { StackPanel } from '../src/renderer/features/stack/StackPanel.js';

/**
 * R-010 — the StackPanel header's Remove-All: confirm-gated (accept → one
 * stack.removeAll call; cancel → none), hidden on an empty stack.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function items(n: number): StackItemState[] {
  return Array.from({ length: n }, (_, i) => ({
    itemId: `item-${String(i)}`,
    templateId: 'tpl',
    fields: {},
    status: 'idle' as const,
    pending: false,
  }));
}

function stubBridge(stack: StackItemState[]): { removeAll: Mock } {
  const removeAll = vi.fn(() => Promise.resolve({ ok: true, removed: stack.length }));
  const stub = {
    stack: {
      snapshot: () => Promise.resolve(stack),
      onStateChanged: () => () => undefined,
      removeAll,
      take: () => Promise.resolve({ accepted: true }),
      update: () => Promise.resolve({ accepted: true }),
      out: () => Promise.resolve({ accepted: true }),
      remove: () => Promise.resolve({ accepted: true }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { removeAll };
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

function removeAllButton(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>('button[aria-label="Remove all items"]');
}

describe('StackPanel Remove-All — R-010', () => {
  it('accepting the confirm calls stack.removeAll once', async () => {
    const { removeAll } = stubBridge(items(3));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const el = await renderPanel();
    const btn = removeAllButton(el);
    expect(btn).not.toBeNull();
    await act(async () => {
      btn?.click();
    });
    expect(confirmSpy).toHaveBeenCalledWith('Remove all 3 item(s)? This clears anything on air.');
    expect(removeAll).toHaveBeenCalledTimes(1);
  });

  it('cancelling the confirm removes nothing', async () => {
    const { removeAll } = stubBridge(items(2));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const el = await renderPanel();
    await act(async () => {
      removeAllButton(el)?.click();
    });
    expect(removeAll).not.toHaveBeenCalled();
  });

  it('is hidden when the stack is empty (nothing to destroy)', async () => {
    stubBridge([]);
    const el = await renderPanel();
    expect(removeAllButton(el)).toBeNull();
  });
});
