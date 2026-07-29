// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';

/**
 * R-010 — the StackPanel header's Remove-All: confirm-gated (accept → one
 * stack.removeAll call; cancel → none), hidden on an empty stack.
 *
 * The gate is now the app's own modal, not `window.confirm` — so these drive the dialog's
 * real buttons, and assert that no native dialog is reached for at all.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  clearPortals();
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

function stubBridge(
  stack: StackItemState[],
  link: 'live' | 'disconnected' = 'live',
): { removeAll: Mock } {
  const removeAll = vi.fn(() => Promise.resolve({ ok: true, removed: stack.length }));
  const stub = {
    // R-006 — StackRow + the header bulk actions mirror the connection refusal.
    link: { status: () => link, onStatusChanged: () => () => undefined },
    // R-004 — the panel joins each row against the registry to label its template.
    templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
    // R-028 — the merged panel also reads the declared layers and the playout tab.
    fixedLayers: {
      config: () => Promise.resolve(null),
      state: () => Promise.resolve([]),
      onConfigChanged: () => () => undefined,
      onStateChanged: () => () => undefined,
    },
    playoutLayers: {
      state: () => Promise.resolve([]),
      clear: () => Promise.resolve({ ok: true }),
      onStateChanged: () => () => undefined,
    },
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
        createElement(LayersPanel, {
          onSelectionChange: () => undefined,
          selectedId: null,
          layout: {
            inspectorPx: 320,
            focus: 'none' as const,
            narrow: false,
            setInspectorPx: () => undefined,
            setFocus: () => undefined,
            reset: () => undefined,
            customized: false,
          },
          inspectorOpen: false,
          onToggleInspector: () => undefined,
          onUpdate: () => Promise.resolve({ accepted: true }),
        }),
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
  it('confirming in the modal calls stack.removeAll once', async () => {
    const { removeAll } = stubBridge(items(3));
    const confirmSpy = vi.spyOn(window, 'confirm');
    const el = await renderPanel();
    const btn = removeAllButton(el);
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(false); // enabled while the link is live

    await act(async () => {
      btn?.click();
      await Promise.resolve();
    });

    // The app's own dialog, naming the consequence — not the browser's.
    const dialog = openDialog();
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('This clears anything on air');
    expect(dialog?.textContent).toContain('3 item(s)');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(removeAll).not.toHaveBeenCalled();

    await clickDialogButton('Remove all');

    expect(removeAll).toHaveBeenCalledTimes(1);
    expect(openDialog()).toBeNull();
  });

  it('cancelling the modal removes nothing', async () => {
    const { removeAll } = stubBridge(items(2));
    const el = await renderPanel();

    await act(async () => {
      removeAllButton(el)?.click();
      await Promise.resolve();
    });
    await clickDialogButton('Cancel');

    expect(removeAll).not.toHaveBeenCalled();
    expect(openDialog()).toBeNull();
  });

  it('is hidden when the stack is empty (nothing to destroy)', async () => {
    stubBridge([]);
    const el = await renderPanel();
    expect(removeAllButton(el)).toBeNull();
  });

  it('is DISABLED while the CasparCG link is down — the stack is bridge-owned', async () => {
    // Was-live-then-dropped: the snapshot persists (useBridgeSnapshot keeps its last value while
    // disconnected), so the button stays SHOWN but disabled — it can no more reach CasparCG
    // than the per-item PLAY/UPDATE/CLEAR/REMOVE can.
    const listeners = new Set<(s: 'live' | 'disconnected') => void>();
    let status: 'live' | 'disconnected' = 'live';
    const removeAll = vi.fn(() => Promise.resolve({ ok: true, removed: 2 }));
    const stub = {
      link: {
        status: () => status,
        onStatusChanged: (h: (s: 'live' | 'disconnected') => void) => {
          listeners.add(h);
          return () => listeners.delete(h);
        },
      },
      templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
      // R-028 — the merged panel also reads the declared layers and the playout tab.
      fixedLayers: {
        config: () => Promise.resolve(null),
        state: () => Promise.resolve([]),
        onConfigChanged: () => () => undefined,
        onStateChanged: () => () => undefined,
      },
      playoutLayers: {
        state: () => Promise.resolve([]),
        clear: () => Promise.resolve({ ok: true }),
        onStateChanged: () => () => undefined,
      },
      stack: {
        snapshot: () => Promise.resolve(items(2)),
        onStateChanged: () => () => undefined,
        removeAll,
        take: () => Promise.resolve({ accepted: true }),
        update: () => Promise.resolve({ accepted: true }),
        out: () => Promise.resolve({ accepted: true }),
        remove: () => Promise.resolve({ accepted: true }),
      },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;
    const el = await renderPanel();
    expect(removeAllButton(el)?.disabled).toBe(false); // enabled while live

    await act(async () => {
      status = 'disconnected';
      for (const h of listeners) h('disconnected');
      await Promise.resolve();
    });

    const btn = removeAllButton(el);
    expect(btn).not.toBeNull(); // still shown — items persist across the drop
    expect(btn?.disabled).toBe(true);
  });
});
