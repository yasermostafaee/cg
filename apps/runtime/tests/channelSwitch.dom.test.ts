// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultFixedLayerBank, type FixedLayerBank, type LockState } from '@cg/shared-ipc';
import { App } from '../src/renderer/App.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import { __resetChannelChoiceForTest } from '../src/renderer/features/channels/channelStore.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { clearRefusal, raiseRefusal } from '../src/renderer/features/status/refusalStore.js';
import { authStub, signedInStub } from './support/authStub.js';
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
    // §2 M — an unnamed row still reads as its REAL layer on this channel, as on the first
    // (row 90 carries no alias in the seed this bank is copied from; row 99 is `DEBATE`).
    expect(document.querySelector('[data-layer="90"]')?.textContent).toContain('Layer 90');
    expect(document.querySelector('[data-layer="59"]')?.textContent).toContain('Bed 59');

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

describe('PANIC on a two-channel station (`MULTI-CHANNEL-01` §2 C)', () => {
  beforeEach(async () => {
    await boot([1, 2]);
    // One seated plate per channel, each owned by that channel's row — the ledger the bridge
    // would publish, stated here because the mock seeds plates on channel 1 only.
    const ledger = [1, 2].map((channel) => ({
      channel,
      layer: 60,
      itemId: `item-ch${String(channel)}`,
      sourceId: 'guest-1',
      role: 'fill' as const,
      producer: `route://${String(channel)}-1`,
      held: false,
      unverified: false,
    }));
    vi.spyOn(cg.liveLayers, 'state').mockResolvedValue(ledger);
    await mount();
  });

  async function openPlates(): Promise<void> {
    const tab = [
      ...document.querySelectorAll<HTMLElement>(
        '[role="tablist"][aria-label="Layer surfaces"] [role="tab"]',
      ),
    ].find((t) => t.textContent?.includes('Live plates') === true);
    await click(tab ?? null);
  }

  const plateCoordinates = (): string[] =>
    [...document.querySelectorAll('[data-live-layer]')].map(
      (r) => r.getAttribute('data-live-layer') ?? '',
    );

  it('🔴 channel 2’s plates tab lists channel 2’s plate, and its PANIC silences channel 2 only', async () => {
    await selectChannelTab(2);
    await openPlates();
    expect(plateCoordinates(), 'channel 2’s plate, and not channel 1’s').toEqual(['2-60']);
    const silenceChannel = vi.spyOn(cg.stack, 'silenceChannelLivePlates');
    const silenceAll = vi.spyOn(cg.stack, 'silenceAllLivePlates');

    const panic = document.querySelector('[data-plate-toolbar] [data-plate-panic]');
    expect(panic?.textContent).toBe('Silence all plates · CH 2');
    await click(panic);

    expect(silenceChannel.mock.calls).toEqual([[{ channel: 2 }]]);
    expect(silenceAll).not.toHaveBeenCalled();
  });

  it('🔴 the every-channel control sits WITH THE CHANNELS, never beside the per-channel one — and goes bare', async () => {
    await openPlates();
    const every = document.querySelector('[data-every-channel-panic]');
    expect(every, 'the every-channel control is on screen').not.toBeNull();
    expect(every?.closest('[data-app-header]'), 'beside the channel strip').not.toBeNull();
    expect(every?.closest('[data-plate-toolbar]'), 'and not in the plates toolbar').toBeNull();
    // THE CONTROL for the absence above — the toolbar is there, and carries ITS channel's PANIC.
    expect(document.querySelector('[data-plate-toolbar] [data-plate-panic]')?.textContent).toBe(
      'Silence all plates · CH 1',
    );

    const silenceAll = vi.spyOn(cg.stack, 'silenceAllLivePlates');
    const silenceChannel = vi.spyOn(cg.stack, 'silenceChannelLivePlates');
    await click(every);
    expect(silenceAll).toHaveBeenCalledTimes(1);
    expect(silenceAll.mock.calls[0]?.length, 'no argument — nothing narrows it').toBe(0);
    expect(silenceChannel).not.toHaveBeenCalled();
  });
});

describe('a lock covering ONE of this console’s channels (`MULTI-CHANNEL-01` §2 F)', () => {
  let lockHandlers: ((next: LockState) => void)[] = [];
  const COVERING_CHANNEL_1: LockState = {
    engaged: true,
    channels: [1],
    reason: 'operator',
    engagedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await boot([1, 2]);
    // A principal holding BOTH channels, and a lock engaged by someone holding channel 1 only.
    (cg as unknown as { auth: unknown }).auth = authStub(signedInStub('نرگس کریمی', [1, 2]));
    lockHandlers = [];
    vi.spyOn(cg.lock, 'state').mockResolvedValue(COVERING_CHANNEL_1);
    vi.spyOn(cg.lock, 'onStateChanged').mockImplementation((handler) => {
      lockHandlers.push(handler);
      return () => undefined;
    });
    await mount();
  });

  const lockCard = (channel: number): HTMLElement | null =>
    document.querySelector(`[data-channel-lock="${String(channel)}"]`);

  const clearAllButton = (): HTMLElement | null =>
    document.querySelector('button[aria-label="Clear all rows holding a layer"]');

  it('🔴 the covered channel’s view IS the lock card, and none of its verbs is on screen', () => {
    expect(selectedTab(), 'the console opened on the covered channel').toBe('channel-1');
    expect(lockCard(1), 'its view presents as locked').not.toBeNull();
    expect(lockCard(1)?.textContent).toContain('Channel 1 locked');
    // ABSENT, not greyed and not under a scrim: the workspace is not rendered at all.
    expect(boundItems(), 'no row of the covered channel').toEqual([]);
    expect(clearAllButton(), 'no bulk verb').toBeNull();
    expect(inspector(), 'no Inspector').toBeNull();
    // The console as a whole is NOT locked — the console's lock screen is not up.
    expect(document.querySelector('[role="dialog"][aria-label="Lock screen"]')).toBeNull();
    // …and the strip says which channel is covered.
    expect(document.getElementById('channel-1')?.textContent).toContain('LOCKED');
    expect(document.getElementById('channel-2')?.textContent).not.toContain('LOCKED');
  });

  it('THE CONTROL — the uncovered channel stays live: its rows and its verbs are there', async () => {
    await selectChannelTab(2);
    expect(lockCard(2)).toBeNull();
    expect(lockCard(1), 'and no card leaks across').toBeNull();
    expect(boundItems()).toEqual(['item-ch2']);
    expect(clearAllButton()).not.toBeNull();
  });

  it('the every-channel silence is withdrawn while the lock reaches this console — it returns on release', async () => {
    expect(document.querySelector('[data-app-header]'), 'the header is up').not.toBeNull();
    expect(document.querySelector('[data-every-channel-panic]')).toBeNull();

    await act(async () => {
      for (const handler of lockHandlers) handler({ engaged: false });
      await flush();
    });
    expect(document.querySelector('[data-every-channel-panic]')).not.toBeNull();
    expect(lockCard(1), 'and the channel’s view is live again').toBeNull();
    expect(boundItems()).toEqual(['item-ch1']);
  });

  it('the card releases the lock with the PIN typed into it — Persian digits too (R-020)', async () => {
    const release = vi.spyOn(cg.lock, 'release').mockResolvedValue({ ok: true });
    const pin = lockCard(1)?.querySelector<HTMLInputElement>('input[aria-label="PIN"]') ?? null;
    if (pin === null) throw new Error('no PIN field on the channel’s lock card');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(pin, '۱۲۳۴');
      pin.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
    });
    const unlock = [...(lockCard(1)?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Unlock',
    );
    await click(unlock ?? null);
    expect(release.mock.calls).toEqual([[{ pin: '1234' }]]);
  });
});

describe('the playout tab, split by channel (`MULTI-CHANNEL-01` §2 G)', () => {
  beforeEach(async () => {
    await boot([1, 2]);
    // One reserved playout layer per channel, as the bridge publishes them for a two-bank station.
    vi.spyOn(cg.playoutLayers, 'state').mockResolvedValue([
      { channel: 1, layer: 10, observed: { kind: 'empty' } },
      { channel: 2, layer: 20, observed: { kind: 'empty' } },
    ]);
    await mount();
  });

  async function openPlayoutTab(): Promise<void> {
    const tab = [
      ...document.querySelectorAll<HTMLElement>(
        '[role="tablist"][aria-label="Layer surfaces"] [role="tab"]',
      ),
    ].find((t) => t.textContent?.includes('Station layers') === true);
    await click(tab ?? null);
  }

  const playoutRows = (): string[] =>
    [...document.querySelectorAll('[data-playout-layer]')].map(
      (r) => r.getAttribute('data-playout-layer') ?? '',
    );

  it('🔴 each channel’s playout rows are under that channel, and only there — control: the other channel', async () => {
    await openPlayoutTab();
    expect(playoutRows(), 'channel 1’s reserved layer, not channel 2’s').toEqual(['10']);
    await selectChannelTab(2);
    await openPlayoutTab();
    expect(playoutRows()).toEqual(['20']);
  });
});

describe('a channel’s messages stay in its view (`MULTI-CHANNEL-01` §2 L)', () => {
  const since = new Date().toISOString();
  const ORPHAN_ON_2 = { channel: 2, layer: 40, producer: 'html', since };

  afterEach(() => {
    clearRefusal();
  });

  const markOn = (channel: number): string | null | undefined =>
    document
      .getElementById(`channel-${String(channel)}`)
      ?.querySelector('[data-tab-signal]')
      ?.getAttribute('data-tab-signal');

  const orphanBanner = (): Element | null =>
    document.querySelector('[role="alert"][aria-label="Orphaned on-air layers"]');

  it('🔴 foreign content on channel 2 is absent from channel 1’s view; channel 2’s tab carries the amber mark — control: it is in channel 2’s view', async () => {
    await boot([1, 2]);
    vi.spyOn(cg.layers, 'orphans').mockResolvedValue([ORPHAN_ON_2]);
    await mount();
    expect(selectedTab()).toBe('channel-1');
    expect(orphanBanner(), 'no text about channel 2 in channel 1’s view').toBeNull();
    expect(markOn(2)).toBe('warning');
    expect(markOn(1), 'and channel 1 is not marked for it').toBeUndefined();

    await selectChannelTab(2);
    expect(orphanBanner(), 'the notice is in its own channel’s view').not.toBeNull();
  });

  it('🔴 an ALARM on channel 2 marks its tab RED, and its banner is only in channel 2’s view', async () => {
    await boot([1, 2]);
    vi.spyOn(cg.channelSettings, 'get').mockResolvedValue({
      settings: [
        { channel: 1, raster: { width: 1920, height: 1080 } },
        { channel: 2, raster: { width: 1920, height: 1080 } },
      ],
      observed: [
        { channel: 1, mode: '1080p5000', raster: { width: 1920, height: 1080 } },
        { channel: 2, mode: '720p5000', raster: { width: 1280, height: 720 } },
      ],
    });
    await mount();
    const rasterBanner = (): Element | null =>
      document.querySelector('[role="alert"][aria-label="Channel raster mismatch"]');
    expect(rasterBanner()).toBeNull();
    expect(markOn(2)).toBe('alarm');
    await selectChannelTab(2);
    expect(rasterBanner()?.textContent).toContain('Channel 2');
  });

  it('🔴 a refusal raised on channel 2 stays in channel 2’s view — control: it is there when the operator comes back', async () => {
    await boot([1, 2]);
    await mount();
    await selectChannelTab(2);
    await act(async () => {
      raiseRefusal('The bridge refused that on channel 2.');
      await flush();
    });
    expect(document.querySelector('[data-refusal]')?.textContent).toContain('channel 2');

    await selectChannelTab(1);
    expect(document.querySelector('[data-refusal]'), 'not in channel 1’s view').toBeNull();
    expect(markOn(2)).toBe('warning');

    await selectChannelTab(2);
    expect(document.querySelector('[data-refusal]')).not.toBeNull();
  });

  it('CONTROL — one declared channel: the notice shows and no tab is marked, exactly as before', async () => {
    await boot([1]);
    vi.spyOn(cg.layers, 'orphans').mockResolvedValue([{ ...ORPHAN_ON_2, channel: 1 }]);
    await mount();
    expect(orphanBanner()).not.toBeNull();
    expect(document.querySelector('[data-tab-signal]')).toBeNull();
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

  it('🔴 no every-channel control on a one-channel station — its one PANIC already is that verb', async () => {
    await boot([1]);
    await mount();
    // The instrument: the header is on screen, so its missing control is a real absence.
    expect(document.querySelector('[data-app-header]')).not.toBeNull();
    expect(document.querySelector('[data-every-channel-panic]')).toBeNull();
  });
});
