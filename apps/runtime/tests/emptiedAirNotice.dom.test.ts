// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { EmptiedAirNotice as Notice } from '@cg/shared-ipc';
import { EmptiedAirNotice } from '../src/renderer/features/layers/EmptiedAirNotice.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';
import { connectionsStub, type Reachability } from './support/reachability.js';

/**
 * 🔴 **`B-225` — the operator surface for "the playout server stopped carrying what you put
 * on air", and the one press.**
 *
 * The load-bearing assertions here are the ones about what does NOT happen: the strip renders
 * nothing when there is no notice, and **the restore is not sent until a person has passed a
 * confirm dialog.** The owner chose detect-and-say over restoring automatically because *an
 * unattended machine must not put a graphic on air* — a banner with a one-click path to live
 * output would hand most of that back.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  clearPortals();
  vi.restoreAllMocks();
});

function notice(over: Partial<Notice> = {}): Notice {
  return {
    at: '2026-09-06T12:00:00.000Z',
    rows: [{ itemId: 'item-1', templateId: 'lower-third', slot: { channel: 1, layer: 10 } }],
    seatsDropped: 0,
    newConnection: true,
    ...over,
  };
}

function stubBridge(
  reach: Reachability = 'both-up',
  link: 'live' | 'disconnected' = 'live',
): { restore: Mock; dismiss: Mock } {
  const restore = vi.fn(() => Promise.resolve({ restored: 1, results: [] }));
  const dismiss = vi.fn(() => Promise.resolve({ ok: true }));
  const stub = {
    // The restore emits AMCP, so the strip reads BOTH hops and the stub owes both channels
    // (the orphan banner's note: `useCasparReach` pulls `useLink` in transitively).
    link: {
      status: () => link,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub(reach),
    emptiedAir: { restore, dismiss },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { restore, dismiss };
}

async function render(value: Notice | null): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(StrictMode, null, createElement(EmptiedAirNotice, { notice: value })),
    );
  });
  return container;
}

describe('EmptiedAirNotice — presence and absence', () => {
  it('renders NOTHING when there is no notice (idle-quiet, like every other strip)', async () => {
    stubBridge();
    const el = await render(null);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).toBe('');
  });

  it('says the channel is alive and carrying nothing, and how many rows went', async () => {
    stubBridge();
    const el = await render(
      notice({
        rows: [
          { itemId: 'item-1', templateId: 'lower-third', slot: { channel: 1, layer: 10 } },
          { itemId: 'item-2', templateId: 'strap', slot: { channel: 1, layer: 11 } },
        ],
        seatsDropped: 3,
      }),
    );
    expect(el.querySelector('[aria-label="Air emptied by the playout server"]')).not.toBeNull();
    expect(el.textContent).toContain('The channel is alive and carrying nothing');
    expect(el.textContent).toContain('2 rows that were on air are gone');
    expect(el.textContent).toContain('3 live source seats went with them');
    // Each row is NAMED with its layer, so it can be found in the list below.
    expect(el.textContent).toContain('1-10 · lower-third');
    expect(el.textContent).toContain('1-11 · strap');
    // …and the console states plainly that it has done nothing.
    expect(el.textContent).toContain('Nothing has been put back');
  });

  it('🔴 claims only what was measured: no restart is asserted when the connection never dropped', async () => {
    /*
      The bridge cannot prove a restart — CasparCG publishes no boot marker, uptime or channel
      generation on any wire this system reads. `newConnection` is the honest narrowing: a
      restart necessarily kills the AMCP socket, so without one the sentence must NOT name a
      restart as the likely cause.
    */
    stubBridge();
    const dropped = await render(notice({ newConnection: true }));
    expect(dropped.textContent).toContain('most likely the playout server restarted');

    container?.remove();
    const held = await render(notice({ newConnection: false }));
    expect(held.textContent).not.toContain('restarted');
    expect(held.textContent).toContain('something else cleared these layers');
  });

  it('names each row that a press could not put back, with its reason', async () => {
    stubBridge();
    const el = await render(
      notice({
        rows: [
          {
            itemId: 'item-2',
            templateId: 'strap',
            slot: { channel: 1, layer: 11 },
            refusal: 'rehearsing',
          },
        ],
      }),
    );
    expect(el.textContent).toContain('not put back: it is on PVW');
  });
});

describe('EmptiedAirNotice — the one press', () => {
  it('🔴 sends NOTHING until a person confirms, then restores exactly the listed rows', async () => {
    const { restore } = stubBridge();
    const nativeConfirm = vi.spyOn(window, 'confirm');
    const el = await render(
      notice({
        rows: [
          { itemId: 'item-1', templateId: 'lower-third', slot: { channel: 1, layer: 10 } },
          { itemId: 'item-2', templateId: 'strap', slot: { channel: 1, layer: 11 } },
        ],
      }),
    );

    const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Put 2 rows back on air"]');
    expect(btn).not.toBeNull();

    await act(async () => {
      btn?.click();
      await Promise.resolve();
    });

    // The dialog is up and NOTHING has been sent — this is the owner's decision, measured.
    expect(openDialog()?.textContent).toContain('Put 2 rows back on air?');
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();

    await clickDialogButton('Put back on air');

    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith({ itemIds: ['item-1', 'item-2'] });
  });

  it('cancelling the dialog sends nothing at all', async () => {
    const { restore } = stubBridge();
    const el = await render(notice());

    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Put 1 row back on air"]')?.click();
      await Promise.resolve();
    });
    await clickDialogButton('Cancel');

    expect(restore).not.toHaveBeenCalled();
    expect(openDialog()).toBeNull();
  });

  it('🔴 the press is DISABLED while either hop is down — an enabled dead button is worse here than anywhere', async () => {
    /*
      The operator reaches this strip only when the console has already failed them. A press
      that cannot leave the bridge would let them believe air is coming back while black
      stays on. Both hops, exactly as the orphan Clear beside it.
    */
    const { restore } = stubBridge('caspar-down');
    const el = await render(notice());
    const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Put 1 row back on air"]');
    expect(btn?.disabled).toBe(true);
    expect(btn?.title).toContain('CasparCG cannot be reached');
    expect(restore).not.toHaveBeenCalled();
  });

  it('DISMISS is one press, needs no confirm, and sends no restore', async () => {
    /*
      Dismissing changes nothing on air, so it is not confirm-gated — the asymmetry is the
      point: the destructive-to-air direction (putting graphics up) is gated, and hiding a
      sentence is not.
    */
    const { restore, dismiss } = stubBridge();
    const el = await render(notice());

    await act(async () => {
      el.querySelector<HTMLButtonElement>(
        'button[aria-label="Dismiss the emptied-air notice"]',
      )?.click();
      await Promise.resolve();
    });

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
    expect(openDialog()).toBeNull();
  });
});
