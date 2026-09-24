// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultFixedLayerBank, type FixedLayerBank } from '@cg/shared-ipc';
import { App } from '../src/renderer/App.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import { __resetChannelChoiceForTest } from '../src/renderer/features/channels/channelStore.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §2 D — **SWITCHING CHANNELS SWITCHES EVERY PER-CHANNEL SURFACE TOGETHER**,
 * proved on the whole App over the offline mock with TWO declared banks.
 *
 * The discriminating fixture is a row on the SAME LAYER NUMBER on each channel, each named by its
 * own channel's bank: a console keyed by layer alone would show one row under both tabs and pass
 * every assertion that only counted rows.
 *
 * What is proved, each with its control in the same file:
 *   · the strip lists every declared channel and the console opens on the FIRST;
 *   · a switch moves the layer table AND both monitors to the chosen channel, and back;
 *   · a bulk verb names the channel ON SCREEN, and leaves the other channel's row as it was;
 *   · on a ONE-bank station the same press sends the verb BARE (the byte-identity rule);
 *   · the choice is SESSION state (A13): a reload opens on the first declared channel again, and
 *     nothing about the choice was written anywhere.
 */

class NoopResizeObserver {
  observe(): void {
    /* geometry is Playwright's */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** One operator row, the same number on both channels. */
const LAYER = 84;
const NAME_ON_1 = 'دسک خبر';
const NAME_ON_2 = 'میز ورزش';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let cg: RuntimeBridge;
let storage: Storage;

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

/** Poll the bridge until `pred` holds — the mock settles a take on a timer. */
async function until(pred: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!(await pred())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** The bank the mock seeds on channel 1, renamed at {@link LAYER} and moved to `channel`. */
function bankOn(seed: FixedLayerBank, channel: number, name: string): FixedLayerBank {
  return { ...seed, channel, aliases: { ...seed.aliases, [String(LAYER)]: name } };
}

/**
 * `seeded` arms the mock's channel-1 seed, whose rows are LOADED on channel 1 — so a station
 * without channel 1 boots unseeded, from the canonical default bank: the mock refuses to drop a
 * channel that still holds our air, as the bridge does (`B-269`).
 */
async function boot(channels: readonly number[], seeded = true): Promise<void> {
  (globalThis as { CG_E2E?: boolean }).CG_E2E = true;
  (globalThis as { CG_E2E_FIXED_BANK?: boolean }).CG_E2E_FIXED_BANK = seeded;
  storage = installMemoryStorage();
  cg = createMockBridge();
  window.cg = cg;
  await cg.templates.import({
    template: {
      templateId: 'tpl-sw',
      name: 'switch fixture',
      sourceFileName: 'sw.vcg',
      templateType: 'lower-third',
      fields: [{ id: 'anchor', label: 'Anchor', type: 'text', required: false, default: '' }],
    },
    html: '<!doctype html><html><body>fixture</body></html>',
  });
  const [armed] = await cg.fixedLayers.banks();
  expect(armed !== undefined, 'the seed is armed exactly when asked').toBe(seeded);
  const seed = armed ?? defaultFixedLayerBank();
  const names = new Map([
    [1, NAME_ON_1],
    [2, NAME_ON_2],
  ]);
  const res = await cg.fixedLayers.setBanks({
    banks: channels.map((c) => bankOn(seed, c, names.get(c) ?? `row on ${String(c)}`)),
  });
  expect(res.ok, 'the banks were declared').toBe(true);
  for (const channel of channels) {
    const load = await cg.fixedLayers.load({
      channel,
      layer: LAYER,
      itemId: `item-ch${String(channel)}`,
      templateId: 'tpl-sw',
      fields: {},
    });
    expect(load.accepted, `channel ${String(channel)}'s row loads`).toBe(true);
  }
}

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(App));
    await flush();
  });
  await act(flush);
  // PROGRAM and PREVIEW are part of what a switch moves, so the strip is opened.
  const show = document.querySelector<HTMLButtonElement>('button[aria-label="Show monitors"]');
  if (show !== null) await click(show);
}

async function unmount(): Promise<void> {
  const r = root;
  if (r !== null) {
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
}

afterEach(async () => {
  await unmount();
  clearPortals();
  __resetChannelChoiceForTest();
  __resetDraftsForTest();
  vi.restoreAllMocks();
});

async function click(el: Element | null): Promise<void> {
  if (el === null) throw new Error('nothing to click');
  await act(async () => {
    (el as HTMLElement).click();
    await flush();
  });
}

const tabs = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Channels"] [role="tab"]'),
];

const selectedTab = (): string | undefined =>
  tabs().find((t) => t.getAttribute('aria-selected') === 'true')?.id;

async function selectChannelTab(channel: number): Promise<void> {
  await click(document.getElementById(`channel-${String(channel)}`));
}

/**
 * EVERY table row at {@link LAYER}, by the item it carries (`''` when it carries none). Counting
 * only BOUND rows was blind to the defect it is here for: the other channel's row leaks in
 * UNBOUND, because the stack items are filtered by channel separately — so a table that let every
 * channel's slots through still showed one bound row, and the planted leak passed.
 */
const boundItems = (): string[] =>
  [...document.querySelectorAll<HTMLElement>(`[data-layer="${String(LAYER)}"]`)].map(
    (r) => r.getAttribute('data-item-id') ?? '',
  );

const rowFor = (itemId: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-item-id="${itemId}"]`);

/** Every monitor head's channel, PROGRAM and PREVIEW alike. */
const monitorChannels = (): string[] =>
  [...document.querySelectorAll('.cg-monitor-ch')].map((el) => el.textContent ?? '');

const inspector = (): HTMLElement | null => document.querySelector('[aria-label="Inspector"]');

/** The `CH n` the bulk verbs carry in front of themselves (`CONSOLE-MATCH-03` §2). */
const bulkTarget = (): string | null | undefined =>
  document.querySelector('[data-bulk-target]')?.textContent;

/** Every key in the stand-in store — its entries, which `Object.keys` would not list. */
const storedKeys = (): string[] =>
  Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? '').sort();

async function statusOf(itemId: string): Promise<string | undefined> {
  return (await cg.stack.snapshot()).find((i) => i.itemId === itemId)?.status;
}

describe('two declared channels (`MULTI-CHANNEL-01` §2 D)', () => {
  beforeEach(async () => {
    await boot([1, 2]);
    await mount();
  });

  it('the strip lists every declared channel, and the console opens on the first', () => {
    expect(tabs().map((t) => t.id)).toEqual(['channel-1', 'channel-2']);
    expect(selectedTab()).toBe('channel-1');
    // The table is channel 1's: its row, and not channel 2's on the same layer number.
    expect(boundItems()).toEqual(['item-ch1']);
    expect(rowFor('item-ch1')?.textContent).toContain(NAME_ON_1);
    // The instrument is live: both monitor heads are there and name the channel.
    expect(monitorChannels()).toEqual(['CH 1', 'CH 1']);
  });

  it('🔴 a switch moves the table AND both monitors to the chosen channel — and back', async () => {
    await selectChannelTab(2);
    expect(selectedTab()).toBe('channel-2');
    expect(boundItems(), 'channel 2’s row, and channel 1’s is gone').toEqual(['item-ch2']);
    // Named from ITS channel's bank — the same layer number reads a different name.
    expect(rowFor('item-ch2')?.textContent).toContain(NAME_ON_2);
    expect(rowFor('item-ch2')?.textContent).not.toContain(NAME_ON_1);
    expect(monitorChannels()).toEqual(['CH 2', 'CH 2']);
    // …and the scope the bulk verbs state in front of themselves.
    expect(bulkTarget()).toBe('CH 2');

    // The round trip — a switch is a scope change, so coming back finds channel 1 as it was.
    await selectChannelTab(1);
    expect(boundItems()).toEqual(['item-ch1']);
    expect(rowFor('item-ch1')?.textContent).toContain(NAME_ON_1);
    expect(monitorChannels()).toEqual(['CH 1', 'CH 1']);
    expect(bulkTarget()).toBe('CH 1');
  });

  it('🔴 the Inspector is the channel’s too: a channel-1 row is not edited under channel 2’s tab', async () => {
    await click(rowFor('item-ch1')?.querySelector('[data-row-body]') ?? null);
    expect(rowFor('item-ch1')?.getAttribute('aria-pressed'), 'the row is selected').toBe('true');
    expect(inspector(), 'and its Inspector opened').not.toBeNull();

    await selectChannelTab(2);
    expect(inspector(), 'channel 1’s row is not open under channel 2').toBeNull();

    // A switch is a scope change: coming back finds the selection as it was.
    await selectChannelTab(1);
    expect(rowFor('item-ch1')?.getAttribute('aria-pressed')).toBe('true');
    expect(inspector()).not.toBeNull();
  });

  it('🔴 CLEAR ALL on channel 2 names channel 2, and channel 1’s row stays on air', async () => {
    for (const itemId of ['item-ch1', 'item-ch2']) {
      expect((await cg.stack.take({ itemId })).accepted, `${itemId} takes`).toBe(true);
    }
    await until(
      async () =>
        (await statusOf('item-ch1')) === 'on-air' && (await statusOf('item-ch2')) === 'on-air',
      'both rows on air',
    );
    const clearAll = vi.spyOn(cg.stack, 'clearAll');

    await selectChannelTab(2);
    await click(document.querySelector('button[aria-label="Clear all rows holding a layer"]'));
    expect(openDialog(), 'the confirm opened').not.toBeNull();
    await clickDialogButton('Clear all');
    await act(flush);

    expect(clearAll.mock.calls).toEqual([[{ channel: 2 }]]);
    await until(async () => (await statusOf('item-ch2')) !== 'on-air', 'channel 2 to clear');
    // …and the other channel's row is exactly where it was.
    expect(await statusOf('item-ch1')).toBe('on-air');
  });

  it('THE CONTROL — the same press on channel 1 names channel 1', async () => {
    const clearAll = vi.spyOn(cg.stack, 'clearAll');
    await click(document.querySelector('button[aria-label="Clear all rows holding a layer"]'));
    await clickDialogButton('Clear all');
    await act(flush);
    expect(clearAll.mock.calls).toEqual([[{ channel: 1 }]]);
  });

  it('🔴 A13 — a reload opens on the first declared channel again, and the choice was written nowhere', async () => {
    // The instrument: the store the app would write to IS this one, so "no new key" can fail.
    expect(globalThis.localStorage).toBe(storage);
    const keysBefore = storedKeys();
    await selectChannelTab(2);
    expect(selectedTab(), 'the choice was made').toBe('channel-2');
    expect(storedKeys(), 'the choice is session state').toEqual(keysBefore);

    // A reload: the page's modules start over; the bridge — another process — does not.
    await unmount();
    __resetChannelChoiceForTest();
    await mount();

    expect(selectedTab()).toBe('channel-1');
    expect(boundItems()).toEqual(['item-ch1']);
  });
});

describe('the first declared channel is the lowest DECLARED, not channel 1', () => {
  it('a station on channels 2 and 3 opens on 2', async () => {
    await boot([2, 3], false);
    await mount();
    expect(tabs().map((t) => t.id)).toEqual(['channel-2', 'channel-3']);
    expect(selectedTab()).toBe('channel-2');
    expect(boundItems()).toEqual(['item-ch2']);
  });
});

describe('ONE declared channel — the verb is sent exactly as it always was', () => {
  it('🔴 CLEAR ALL goes out BARE: no scope on a station with nothing to scope between', async () => {
    await boot([1]);
    await mount();
    expect(tabs().map((t) => t.id)).toEqual(['channel-1']);
    const clearAll = vi.spyOn(cg.stack, 'clearAll');
    await click(document.querySelector('button[aria-label="Clear all rows holding a layer"]'));
    await clickDialogButton('Clear all');
    await act(flush);
    // One call, and NO argument at all — not `undefined`, not `{}`. The count is read directly:
    // an equality matcher may read `[undefined]` as `[]`.
    expect(clearAll.mock.calls).toHaveLength(1);
    expect(clearAll.mock.calls[0]?.length).toBe(0);
  });
});
