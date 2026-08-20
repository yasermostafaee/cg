// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { FixedLayerBank, FixedSlotState } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { FixedBankConfigModal } from '../src/renderer/features/fixedLayers/FixedBankConfigModal.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';

/**
 * R-021 stage 2b / R-028 — the bank config modal:
 *
 *  - `channel`, `start` AND `count` are READ-ONLY facts (R-028: the ceiling is
 *    fixed at install — no input invites a click that only rejects);
 *  - each candidate layer carries a visibility tick + an alias input;
 *  - a refusal surfaces the mapped reason sentence AND the bridge's own
 *    `message` (which names the layer / both ranges);
 *  - an accepted change closes the modal (the bridge republishes itself);
 *  - R-028 (2.4) — an occupied row offers "Remove…" behind the row's own
 *    confirm gate, stating ON AIR explicitly when the item is.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const BANK: FixedLayerBank = { channel: 1, start: 70, count: 2, aliases: { '70': 'CLOCK' } };

function slot(layer: number, binding: FixedSlotState['binding'] = null): FixedSlotState {
  return { channel: 1, layer, observed: { kind: 'unknown' }, binding };
}

function stubBridge(
  result: { ok: boolean; reason?: string; message?: string } = { ok: true },
  stack: StackItemState[] = [],
): { setConfig: Mock; remove: Mock } {
  const setConfig = vi.fn(() => Promise.resolve(result));
  const remove = vi.fn(() => Promise.resolve({ accepted: true }));
  const stub = {
    fixedLayers: { setConfig },
    stack: {
      snapshot: () => Promise.resolve(stack),
      onStateChanged: () => () => undefined,
      remove,
    },
    link: {
      status: () => 'live',
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { setConfig, remove };
}

async function render(
  onClose: () => void = () => undefined,
  slots: FixedSlotState[] = [slot(70), slot(71)],
): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(FixedBankConfigModal, { bank: BANK, slots, onClose }),
      ),
    );
  });
}

/** All open dialogs, outermost first — the confirm gate stacks a second one. */
function allDialogs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
}

describe('FixedBankConfigModal', () => {
  it('R-028 — channel, start AND count are read-only facts; the inputs are per-layer ticks + aliases', async () => {
    stubBridge();
    await render();
    const dialog = openDialog();
    expect(dialog?.textContent).toContain('Channel 1');
    expect(dialog?.textContent).toContain('layers 70–71');
    expect(dialog?.textContent).toContain('fixed at install');
    // No count spinner any more — the ceiling never changes mid-session. Per
    // layer: one visibility checkbox and one alias field.
    const inputs = [...(dialog?.querySelectorAll('input') ?? [])];
    expect(inputs.map((i) => i.type).sort()).toEqual(['checkbox', 'checkbox', 'text', 'text']);
  });

  it('a refused change surfaces the mapped reason AND the bridge message, and stays open', async () => {
    const { setConfig } = stubBridge({
      ok: false,
      reason: 'untick-occupied',
      message: 'cannot hide layer 71: it is OCCUPIED (an item or producer is on it)',
    });
    const onClose = vi.fn();
    await render(onClose);

    await clickDialogButton('Apply');
    await act(async () => {
      await Promise.resolve();
    });

    expect(setConfig).toHaveBeenCalledTimes(1);
    const refusal = openDialog()?.querySelector('[role="alert"]');
    expect(refusal).not.toBeNull();
    // The RULE, in operator wording (from the FIXED_LAYERS_SET_CONFIG_REASONS map)…
    expect(refusal?.textContent).toContain('occupied');
    expect(refusal?.textContent).toContain('remove its template first');
    // …and the SPECIFICS, verbatim from the bridge.
    expect(refusal?.textContent).toContain('layer 71');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('an accepted change submits ticks + aliases with the UNCHANGED ceiling, and closes', async () => {
    const { setConfig } = stubBridge({ ok: true });
    const onClose = vi.fn();
    await render(onClose);
    const dialog = openDialog();

    // Untick layer 71 — the only kind of live change R-028 allows besides aliases.
    const tick = dialog?.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="Show layer 71"]',
    );
    await act(async () => {
      if (tick === null || tick === undefined) throw new Error('no visibility tick for 71');
      tick.click();
      await Promise.resolve();
    });

    await clickDialogButton('Apply');
    await act(async () => {
      await Promise.resolve();
    });

    expect(setConfig).toHaveBeenCalledTimes(1);
    expect(setConfig).toHaveBeenCalledWith({
      channel: 1,
      start: 70,
      count: 2, // NEVER edited here — the ceiling is fixed at install
      aliases: { '70': 'CLOCK' },
      visibility: { '71': false },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cancel closes without sending anything', async () => {
    const { setConfig } = stubBridge();
    const onClose = vi.fn();
    await render(onClose);
    await clickDialogButton('Cancel');
    expect(setConfig).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('R-028 (2.4) — Remove… on an occupied row confirms, states ON AIR, and removal implies clear', async () => {
    const onAirItem: StackItemState = {
      itemId: 'item-1',
      templateId: 'tpl-1',
      fields: {},
      status: 'playing',
      pending: false,
    };
    const { remove } = stubBridge({ ok: true }, [onAirItem]);
    await render(
      () => undefined,
      [
        slot(70, {
          itemId: 'item-1',
          templateType: 'clock',
          templateId: 'tpl-1',
          templateName: 'ساعت اذان',
        }),
        slot(71),
      ],
    );

    // The occupied row names its template and offers the gate.
    const dialog = openDialog();
    expect(dialog?.textContent).toContain('ساعت اذان');
    const removeButton = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Remove…',
    );
    expect(removeButton).toBeDefined();
    await act(async () => {
      removeButton?.click();
      await Promise.resolve();
    });

    // The confirm dialog is a SECOND portalled dialog, and it says ON AIR in words.
    const confirm = allDialogs().at(-1);
    expect(confirm?.textContent).toContain('ساعت اذان');
    expect(confirm?.textContent).toContain('ON AIR');
    expect(confirm?.textContent).toContain('CLEARS layer 70');

    // Nothing sent until confirmed…
    expect(remove).not.toHaveBeenCalled();
    const act2 = [...(confirm?.querySelectorAll('button') ?? [])].find((b) =>
      b.textContent?.startsWith('Remove and clear'),
    );
    await act(async () => {
      act2?.click();
      await Promise.resolve();
    });
    // …then removal (which implies clear on the bridge) fires for the bound item.
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith({ itemId: 'item-1' });
  });

  it('R-028 (2.4) — an item the stack cannot verify FAILS CLOSED: the dialog says MAY BE ON AIR, never "off air"', async () => {
    // The stack snapshot does NOT contain the bound item (stale/loading) —
    // the destructive dialog must not promise the graphic is off air.
    stubBridge({ ok: true }, []);
    await render(
      () => undefined,
      [slot(70, { itemId: 'item-ghost', templateType: 'clock', templateName: 'ساعت' }), slot(71)],
    );
    const removeButton = [...(openDialog()?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Remove…',
    );
    await act(async () => {
      removeButton?.click();
      await Promise.resolve();
    });
    const confirm = allDialogs().at(-1);
    expect(confirm?.textContent).toContain('MAY BE ON AIR');
    expect(confirm?.textContent).toContain('CLEARS layer 70');
  });
});
