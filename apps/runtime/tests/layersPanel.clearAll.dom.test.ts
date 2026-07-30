// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
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

  it('stays PRESENT and enabled when nothing reads as on air — it is the escape hatch', async () => {
    stubBridge([item('a', 'loaded'), item('b', 'idle')]);
    const el = await renderPanel();

    /*
      Clear-All used to be HIDDEN here, on the reasoning that there would be nothing
      to clear. Owner decision reversed that, and the reasoning is the same asymmetry
      the row's CLEAR follows: the statuses saying "nothing is on air" are exactly
      what might be wrong, so they may not be what withholds the remedy. If the state
      model is confused, the operator must still be able to take everything off.

      Its weight comes from the confirm gate, not from being hidden — always
      AVAILABLE is not always IMMEDIATE.
    */
    const clear = clearAllButton(el);
    expect(clear).not.toBeNull();
    expect(clear?.disabled).toBe(false);
    // Remove-All is present too, and enabled: the rows exist and can be dropped.
    expect(removeAllButton(el)).not.toBeNull();
    expect(removeAllButton(el)?.disabled).toBe(false);
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

  it('renders every bulk action NEUTRAL — colour belongs to state, not affordances', async () => {
    stubBridge([item('a', 'on-air')]);
    const el = await renderPanel();

    /*
      These used to be amber (Clear) and red (Remove), matching their per-row
      counterparts. Owner decision moved the row verbs to neutral and then extended
      the same rule here: three permanently-coloured buttons above the list were
      competing with the one ROW actually wearing the air colour, which is the first
      thing a control room needs to find. Their distinctness now comes from their
      icons, their words and their confirm gates.

      Asserted as the exact neutral class plus the ABSENCE of every state hue, so
      re-introducing colour on any of them fails here rather than being noticed on
      air months later.
    */
    for (const button of [clearAllButton(el), removeAllButton(el)]) {
      // `--neutral`, the neutral TEXT variant — not `--verb`, which carries the row
      // verb's icon-only geometry (`padding: 0`, square, full-width) and squashed
      // these labels against their borders when it was first reused here.
      expect(button?.classList.contains('cg-btn--neutral')).toBe(true);
      expect(button?.classList.contains('cg-btn--verb')).toBe(false);
      for (const hue of [
        'cg-btn--caution',
        'cg-btn--caution-strong',
        'cg-btn--danger',
        'cg-btn--play',
      ]) {
        expect(button?.classList.contains(hue), `${hue} must not be on a bulk verb`).toBe(false);
      }
    }
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

    /*
      Remove-All follows R-006 and goes disabled: it is a bridge round-trip like any
      other, and refusing it costs nothing — the rows stay exactly as they are.

      Clear-All does NOT, and that exemption is the point of this assertion. A WRONG
      `linkDown` is precisely the bug the escape hatch exists for, and the two costs
      are not comparable: enabling it when the bridge really is dead costs one failed
      request and a toast, while disabling it when the flag is wrong leaves every
      on-air graphic with nothing that can take it off. It keeps its tooltip so the
      operator knows what to expect before pressing.
    */
    expect(removeAllButton(el)?.disabled).toBe(true);
    expect(
      clearAllButton(el)?.disabled,
      'Clear-All is the escape hatch and must survive a dead link',
    ).toBe(false);
  });
});
