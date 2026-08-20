// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { LayersPanel } from '../src/renderer/features/layers/LayersPanel.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';
import { connectionsStub, type Reachability } from './support/reachability.js';
import {
  onCommandError,
  onCommandSuccess,
} from '../src/renderer/features/status/commandFeedback.js';

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

/**
 * B-122 - every item here carries a SLOT, because holding a layer is now the axis
 * Clear-All counts and acts on. A slotless item holds no layer of ours and is
 * genuinely nothing to clear; a status is a belief, and beliefs are what this verb
 * stopped consulting. The layer is derived from a counter so rows do not collide.
 */
let nextLayer = 10;
function item(itemId: string, status: StackItemState['status']): StackItemState {
  return {
    itemId,
    templateId: 'tpl',
    fields: {},
    status,
    pending: false,
    slot: { channel: 1, layer: nextLayer++, server: 'primary' },
  };
}

function stubBridge(
  stack: StackItemState[],
  link: 'live' | 'disconnected' = 'live',
  reach: Reachability = 'both-up',
): { clearAll: Mock; removeAll: Mock } {
  const clearAll = vi.fn(() =>
    Promise.resolve({ ok: true, cleared: stack.length, attempted: stack.length, refused: [] }),
  );
  const removeAll = vi.fn(() => Promise.resolve({ ok: true, removed: stack.length }));
  const stub = {
    link: {
      status: () => link,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub(reach),
    templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
    // R-028 — the merged panel also reads the declared layers and the playout tab.
    fixedLayers: {
      config: () => Promise.resolve(null),
      state: () => Promise.resolve([]),
      onConfigChanged: () => () => undefined,
      onStateChanged: () => () => undefined,
    },
    // §0a — the second hop, selected BY NAME (support/reachability.ts).
    connections: connectionsStub(reach),
    // R-022 — rehearse is bridge-owned, so the panel subscribes to it on mount.
    rehearse: {
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
    },

    playoutLayers: {
      state: () => Promise.resolve([]),
      clear: () => Promise.resolve({ ok: true }),
      onStateChanged: () => () => undefined,
    },
    liveLayers: {
      state: () => Promise.resolve([]),
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
      // B-108 — the restore-skip report. A healthy session reports NOTHING,
      // which is what this panel renders for every spec not about that surface.
      onRestoreSkips: () => () => undefined,
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
  el.querySelector<HTMLButtonElement>('button[aria-label="Clear all rows holding a layer"]');
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
    expect(dialog?.textContent).toContain('Clear all 2 row(s) holding a layer?');
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

  it('B-122 — counts every row HOLDING A LAYER, not the ones that read as on air', async () => {
    stubBridge([item('a', 'on-air'), item('b', 'loaded'), item('c', 'idle')]);
    const el = await renderPanel();

    await act(async () => {
      clearAllButton(el)?.click();
      await Promise.resolve();
    });

    /*
      THREE, not one. This test asserted `1 on-air item(s)` — the dialog counting what
      the console BELIEVED was on air — and that count was the defect made visible: the
      operator was asked to confirm against precisely the values that may be wrong, on
      the one control that exists for when they are. All three rows hold a layer, so all
      three are cleared, and the dialog says so before he commits.
    */
    expect(openDialog()?.textContent).toContain('Clear all 3 row(s) holding a layer?');
  });

  /**
   * B-122's second half, and the half the OPERATOR sees.
   *
   * The old code discarded `stack.clearAll`'s result entirely, which is how a bulk verb
   * that sent nothing could still look like it had worked. Each case below is a
   * genuinely different operator situation and none of them may share a message.
   */
  describe('the report', () => {
    async function pressClearAll(
      result: { ok: boolean; cleared: number; attempted: number; refused: unknown[] },
      stack = [item('a', 'on-air'), item('b', 'on-air')],
    ): Promise<{ errors: string[]; successes: string[] }> {
      const { clearAll } = stubBridge(stack);
      clearAll.mockResolvedValue(result);
      const errors: string[] = [];
      const successes: string[] = [];
      const offError = onCommandError((m) => errors.push(m));
      const offSuccess = onCommandSuccess((m) => successes.push(m));
      try {
        const el = await renderPanel();
        await act(async () => {
          clearAllButton(el)?.click();
          await Promise.resolve();
        });
        await clickDialogButton('Clear all');
        await act(async () => {
          await Promise.resolve();
        });
        return { errors, successes };
      } finally {
        offError();
        offSuccess();
      }
    }

    it('a PARTIAL clear is an error — those graphics may still be on air', async () => {
      // Not a quieter success. A green "cleared 1" would overwrite the one fact the
      // operator needs: something did not come off. StationLayersPanel's bulk clear already
      // follows this rule; this is the same rule, one panel over.
      const { errors, successes } = await pressClearAll({
        ok: false,
        cleared: 1,
        attempted: 2,
        refused: [],
      });
      expect(errors.at(-1)).toContain('Cleared 1 of 2');
      expect(errors.at(-1)).toContain('may still be on air');
      expect(successes).toEqual([]);
    });

    it('a NO-OP is never reported as success — the exact lie B-122 was filed against', async () => {
      const { errors, successes } = await pressClearAll(
        { ok: false, cleared: 0, attempted: 0, refused: [] },
        [],
      );
      expect(successes, 'a success toast for a no-op is worse than a disabled button').toEqual([]);
      expect(errors.at(-1)).toContain('nothing was sent');
    });

    it('a COMPLETE clear says so, and names any live source it left alone', async () => {
      const { errors, successes } = await pressClearAll({
        ok: true,
        cleared: 2,
        attempted: 2,
        refused: [{ itemId: 'guest', reason: 'live-source' }],
      });
      expect(errors).toEqual([]);
      expect(successes.at(-1)).toContain('Cleared 2 row(s)');
      // A refusal is NOT a failure — a Live Source layer is not this console's to
      // clear, and calling it one would send the operator hunting a fault.
      expect(successes.at(-1)).toContain('live source layer(s)');
    });
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
    // §0a — both hops up unless this spec is about being disconnected.
    const reach: Reachability = 'both-up';
    const stub = {
      link: {
        status: () => status,
        onStatusChanged: (h: (s: 'live' | 'disconnected') => void) => {
          listeners.add(h);
          return () => listeners.delete(h);
        },
        resyncing: () => false,
        onResyncingChanged: () => () => undefined,
      },
      // §0a — the second hop, selected BY NAME (support/reachability.ts).
      connections: connectionsStub(reach),
      templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
      // R-028 — the merged panel also reads the declared layers and the playout tab.
      fixedLayers: {
        config: () => Promise.resolve(null),
        state: () => Promise.resolve([]),
        onConfigChanged: () => () => undefined,
        onStateChanged: () => () => undefined,
      },
      // R-022 — rehearse is bridge-owned, so the panel subscribes to it on mount.
      rehearse: {
        state: () => Promise.resolve([]),
        onStateChanged: () => () => undefined,
      },

      playoutLayers: {
        state: () => Promise.resolve([]),
        clear: () => Promise.resolve({ ok: true }),
        onStateChanged: () => () => undefined,
      },
      liveLayers: {
        state: () => Promise.resolve([]),
        onStateChanged: () => () => undefined,
      },
      stack: {
        snapshot: () => Promise.resolve([item('a', 'on-air')]),
        onStateChanged: () => () => undefined,
        clearAll: vi.fn(() =>
          Promise.resolve({ ok: false, cleared: 0, attempted: 0, refused: [] }),
        ),
        removeAll: vi.fn(() => Promise.resolve({ ok: true, removed: 1 })),
        take: () => Promise.resolve({ accepted: true }),
        update: () => Promise.resolve({ accepted: true }),
        out: () => Promise.resolve({ accepted: true }),
        remove: () => Promise.resolve({ accepted: true }),
        // B-108 — the restore-skip report. A healthy session reports NOTHING,
        // which is what this panel renders for every spec not about that surface.
        onRestoreSkips: () => () => undefined,
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

      CLEAR ALL NOW GOES WITH IT — this assertion is REVERSED deliberately.

      The escape-hatch rule stands where it was aimed: Clear-All is never gated on
      the STATE MODEL, on how many rows read as on air, because that model is
      exactly what may be wrong when the operator reaches for it. Reachability is a
      different question. With the bridge down the command does not leave, so the
      enabled button was not a remedy, only the appearance of one — and it costs
      the operator the seconds in which he believes the graphics are coming off.

      It returns the instant the link does, which keeps this a gate rather than a
      removal of the hatch.
    */
    expect(removeAllButton(el)?.disabled).toBe(true);
    expect(
      clearAllButton(el)?.disabled,
      'Clear-All cannot act with the bridge down — gated on reachability, never on state',
    ).toBe(true);
  });
});
