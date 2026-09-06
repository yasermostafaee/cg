// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { FixedLayerBank, EmptiedAirNotice as Notice, TemplateInfo } from '@cg/shared-ipc';
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

/**
 * The station's own bank. Layer 9 is a BED and the operator has aliased it, layer 99 is an
 * operator row and likewise; `90` is left unaliased so the `Layer N` fallback is exercised
 * against a REAL bank rather than against an empty one.
 *
 * ⚠ The bed's alias goes in `low.aliases`, not in `bank.aliases` — each half carries its
 * own, and `layerAlias` dispatches on `isLowBankLayer`. Writing it in the top half here
 * silently produced `Bed 1` while the spec asked for «لوگوی اصلی», which is the fixture
 * making the same mistake the product is careful not to.
 */
const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 30,
  aliases: { '99': 'زیرنویس اصلی' },
  low: { start: 1, count: 9, aliases: { '9': 'لوگوی اصلی' } },
};

/** The template whose UUID the notice was printing at the operator on 2026-09-06. */
const TEMPLATE: TemplateInfo = {
  templateId: 'e506e319-6e68-4603-a5f4-290b21616250',
  name: 'comp1',
  sourceFileName: '3ghab.vcg',
  templateType: 'custom',
  fields: [],
};

function stubBridge(
  reach: Reachability = 'both-up',
  link: 'live' | 'disconnected' = 'live',
  naming: { bank?: FixedLayerBank | null; templates?: readonly TemplateInfo[] } = {},
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
    // The strip names its rows the way the operator does, so it owes the two snapshots
    // that carry those names: the declared bank (aliases) and the registry (templates).
    fixedLayers: {
      config: () => Promise.resolve(naming.bank === undefined ? BANK : naming.bank),
      onConfigChanged: () => () => undefined,
    },
    templates: {
      list: () => Promise.resolve([...(naming.templates ?? [TEMPLATE])]),
      onChanged: () => () => undefined,
    },
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

/**
 * 🔴 **`B-232` — THE NOTICE SPOKE IN IDS.**
 *
 * Measured on the plant 2026-09-06: the strip listed its rows as
 * `1-9 · e506e319-6e68-4603-a5f4-290b21616250` — a channel-layer and a raw template UUID.
 * The operator knows those rows as «لوگوی اصلی» and «زیرنویس اصلی», the NAME column two
 * panels below, and has never typed a UUID.
 *
 * These specs assert the RULE, not one string: the operator's words carry the line, the
 * layer number survives as a quiet secondary because `R-028` says an operator may need it
 * to clear that layer by hand, and the ids move to the `title`.
 */
describe('EmptiedAirNotice — the rows are named in the operator’s words', () => {
  /*
    THE INCIDENT, ASSERTED ON THE RENDERED TEXT AND NOTHING ELSE. No selector, no
    attribute — just the sentence the operator read on the plant, so this spec fails on
    the STRING rather than on a missing test hook and cannot be satisfied by markup.
  */
  it('🔴 does not print a raw id at the operator — the 2026-09-06 line, verbatim', async () => {
    stubBridge();
    const el = await render(
      notice({
        rows: [
          { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 9 } },
        ],
      }),
    );
    expect(el.textContent).not.toContain('1-9 · e506e319-6e68-4603-a5f4-290b21616250');
    expect(el.textContent).not.toContain('e506e319');
    expect(el.textContent).toContain('لوگوی اصلی');
  });

  it('🔴 puts the ROW NAME first and the TEMPLATE NAME second, and prints no UUID', async () => {
    stubBridge();
    const el = await render(
      notice({
        rows: [
          { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 9 } },
        ],
      }),
    );
    const line = el.querySelector<HTMLElement>('[data-emptied-row]');
    expect(line).not.toBeNull();
    expect(line?.textContent).toContain('لوگوی اصلی');
    expect(line?.textContent).toContain('3ghab');
    expect(line?.textContent?.indexOf('لوگوی اصلی')).toBeLessThan(
      line?.textContent?.indexOf('3ghab') ?? -1,
    );
    // THE DEFECT: not one character of the UUID is on the line the operator reads.
    expect(line?.textContent).not.toContain('e506e319');
    expect(el.textContent).not.toContain(TEMPLATE.templateId);
  });

  it('🔴 keeps the real LAYER NUMBER visible — R-028: he may need it to clear that layer by hand', async () => {
    stubBridge();
    const el = await render(
      notice({
        rows: [
          { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 9 } },
        ],
      }),
    );
    // Visible text, not a tooltip: a hover is not available to someone reaching for the
    // number in order to type it into a hand-cleared CLEAR.
    const layer = el.querySelector<HTMLElement>('[data-emptied-layer]');
    expect(layer?.textContent).toBe('1-9');
  });

  it('falls back to the default row name when the operator has aliased nothing', async () => {
    stubBridge();
    const el = await render(
      notice({
        rows: [
          { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 90 } },
        ],
      }),
    );
    expect(el.querySelector('[data-emptied-row]')?.textContent).toContain('Layer 10');
  });

  it('isolates each name, so a Persian row name cannot displace the rest of the line', async () => {
    /*
      ⚠ NOT filed from an incident — a precaution, under the repo's standing rule that
      mixed RTL/LTR is tested rather than assumed. «زیرنویس اصلی» begins with a strong RTL
      character; the ` · ` separator and the trailing coordinate are NEUTRALS, and joined
      into one text node their placement resolves against their surroundings instead of
      being the author's choice.

      jsdom computes no bidi, so this asserts the MECHANISM — each name in its own
      `<bdi>`, separators outside them — exactly as `modalPrimitive.dom.test.ts` asserts
      the message region's placement rather than its geometry. A visual assertion here
      would return zeros and pass for the broken markup too.
    */
    stubBridge();
    const el = await render(
      notice({
        rows: [
          { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 99 } },
        ],
      }),
    );
    const line = el.querySelector<HTMLElement>('[data-emptied-row]');
    const isolates = [...(line?.querySelectorAll('bdi') ?? [])].map((b) => b.textContent);
    expect(isolates).toEqual(['زیرنویس اصلی', '3ghab']);
    // The separator is BETWEEN the isolates, never inside one — otherwise it travels
    // with the name's run and the fix is undone.
    for (const b of isolates) expect(b).not.toContain('·');
    // And the line itself stays LTR chrome: `dir="auto"` here would flip the English
    // clauses and the layer chip along with the name.
    expect(line?.getAttribute('dir')).toBeNull();
  });

  it('keeps both ids on the line’s title, so nothing forensic is lost', async () => {
    stubBridge();
    const el = await render(
      notice({
        rows: [
          { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 9 } },
        ],
      }),
    );
    const title = el.querySelector<HTMLElement>('[data-emptied-row]')?.title ?? '';
    expect(title).toContain(TEMPLATE.templateId);
    expect(title).toContain('item-1');
  });

  it('says a layer is NOT one of the station’s rows rather than inventing a name for it', async () => {
    stubBridge();
    const el = await render(
      notice({
        rows: [
          { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 60 } },
        ],
      }),
    );
    const line = el.querySelector<HTMLElement>('[data-emptied-row]');
    expect(line?.textContent).toContain('layer 60 (not a row)');
    // The place already carries the number, so the secondary chip does not repeat it.
    expect(el.querySelector('[data-emptied-layer]')).toBeNull();
  });

  it('names what it can when the registry no longer holds the template', async () => {
    stubBridge('both-up', 'live', { templates: [] });
    const el = await render(
      notice({
        rows: [
          { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 9 } },
        ],
      }),
    );
    const line = el.querySelector<HTMLElement>('[data-emptied-row]');
    expect(line?.textContent).toContain('لوگوی اصلی');
    expect(line?.textContent).not.toContain('e506e319');
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
