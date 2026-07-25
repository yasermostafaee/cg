// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { FixedLayerBank } from '@cg/shared-ipc';
import { FixedBankConfigModal } from '../src/renderer/features/fixedLayers/FixedBankConfigModal.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';

/**
 * R-021 stage 2b (task 5.6) — the bank config modal:
 *
 *  - `channel` and `start` are READ-ONLY facts (the validator refuses changing
 *    them mid-session — no input invites a click that only rejects);
 *  - a refusal surfaces the mapped reason sentence AND the bridge's own
 *    `message` (which names the specifics);
 *  - an accepted change closes the modal (the bridge republishes itself).
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

function stubSetConfig(
  result: { ok: boolean; reason?: string; message?: string } = { ok: true },
): Mock {
  const setConfig = vi.fn(() => Promise.resolve(result));
  const stub = { fixedLayers: { setConfig } };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return setConfig;
}

async function render(onClose: () => void = () => undefined): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(StrictMode, null, createElement(FixedBankConfigModal, { bank: BANK, onClose })),
    );
  });
}

describe('FixedBankConfigModal', () => {
  it('shows channel and start as read-only facts — no input edits them', async () => {
    stubSetConfig();
    await render();
    const dialog = openDialog();
    expect(dialog?.textContent).toContain('Channel 1');
    expect(dialog?.textContent).toContain('starts at layer 70');
    expect(dialog?.textContent).toContain('cannot change mid-session');
    // The only inputs are the count spinner and one alias field per slot.
    const inputs = [...(dialog?.querySelectorAll('input') ?? [])];
    expect(inputs.map((i) => i.type).sort()).toEqual(['number', 'text', 'text']);
  });

  it('a refused change surfaces the mapped reason AND the bridge message, and stays open', async () => {
    const setConfig = stubSetConfig({
      ok: false,
      reason: 'shrink-occupied',
      message:
        'fixed bank shrink refused: slot(s) 71 still hold a resident item or retained intent',
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
    expect(refusal?.textContent).toContain('cannot shrink');
    // …and the SPECIFICS, verbatim from the bridge.
    expect(refusal?.textContent).toContain('slot(s) 71');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('an accepted change submits the edited bank and closes', async () => {
    const setConfig = stubSetConfig({ ok: true });
    const onClose = vi.fn();
    await render(onClose);
    const dialog = openDialog();

    // Grow the bank and alias the new slot's neighbour.
    const count = dialog?.querySelector<HTMLInputElement>('input[type="number"]');
    await act(async () => {
      if (count === null || count === undefined) throw new Error('no count input');
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(count, '3');
      count.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await clickDialogButton('Apply');
    await act(async () => {
      await Promise.resolve();
    });

    expect(setConfig).toHaveBeenCalledTimes(1);
    expect(setConfig).toHaveBeenCalledWith({
      channel: 1,
      start: 70,
      count: 3,
      aliases: { '70': 'CLOCK' },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cancel closes without sending anything', async () => {
    const setConfig = stubSetConfig();
    const onClose = vi.fn();
    await render(onClose);
    await clickDialogButton('Cancel');
    expect(setConfig).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
