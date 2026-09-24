// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StationChannels } from '@cg/shared-ipc';
import { ChannelStrip } from '../src/renderer/features/channels/ChannelStrip.js';
import { __resetChannelChoiceForTest } from '../src/renderer/features/channels/channelStore.js';
import type { AuthSessionState } from '../src/shared/runtime-bridge.js';
import { signedInStub } from './support/authStub.js';
import { stationSetupStub } from './support/stationSetup.js';

/**
 * 🔴 `C-039` — **THE STRIP SHOWS THE PLAYOUT'S NAME FOR THE CHANNEL THIS STATION OPERATES, AND NO
 * TAB AT ALL FOR THE PLAYOUT'S OWN PROGRAMME CHANNEL.**
 *
 * The station is on channel 2. The discovery answer names channel 2 AND channel 1 — the catalogue
 * lists both — and says channel 1 is not declared. The principal is `cg-op2`-shaped (granted both).
 *
 * ⚠ **The name is Persian, in its own `<bdi>`, with the chrome outside it** — golden rule 11, and
 * the reason `TabSpec.label` now takes markup. The number it replaced is on the tab's `title`.
 *
 * 🔴 Every absence here has its control in the same render: the strip that does not show channel
 * 1 is shown to show channel 2 under the catalogue's name.
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
  __resetChannelChoiceForTest();
  vi.restoreAllMocks();
});

const BANK_ON_TWO = { channel: 2, low: { start: 50, count: 9 }, start: 70, count: 4 };
const RASTER_ON_TWO = {
  settings: [{ channel: 2, raster: { width: 1920, height: 1080 } }],
  observed: [],
};

const DISCOVERED: StationChannels = {
  channels: [
    {
      channel: 1,
      named: { id: 'apasai', name: 'آپاسای' },
      declared: false,
      permitted: true,
      sources: ['catalogue'],
    },
    {
      channel: 2,
      named: { id: 'cg-test2', name: 'کانال دوم (تست CG)' },
      declared: true,
      permitted: true,
      sources: ['catalogue', 'bank', 'channel-settings'],
    },
  ],
};

async function render(discovered: StationChannels, auth?: AuthSessionState): Promise<HTMLElement> {
  stationSetupStub({ bank: BANK_ON_TWO, raster: RASTER_ON_TWO, ...(auth ? { auth } : {}) });
  (
    window as unknown as {
      cg: { stationChannels: { list: () => Promise<StationChannels>; onChanged: unknown } };
    }
  ).cg.stationChannels = {
    list: () => Promise.resolve(discovered),
    onChanged: () => () => undefined,
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(ChannelStrip, null)));
  });
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  return container;
}

const tabs = (el: HTMLElement): HTMLButtonElement[] => [
  ...el.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Channels"] [role="tab"]'),
];

describe('the channel strip, fed by the discovery call', () => {
  it('channel 2 carries the catalogue’s name, isolated, with its number on the title', async () => {
    const el = await render(DISCOVERED, signedInStub('نرگس کریمی', [2]));
    const [tab, ...rest] = tabs(el);
    expect(rest, 'more than one tab — the catalogue-only channel got one').toEqual([]);
    expect(tab?.textContent).toBe('کانال دوم (تست CG)');
    expect(tab?.textContent).not.toContain('CHANNEL');
    // The name is operator data in its OWN isolate; nothing else is inside it.
    expect(tab?.querySelector('bdi')?.textContent).toBe('کانال دوم (تست CG)');
    // Golden rule 11's relocation: the channel number is not lost.
    expect(tab?.title).toBe('Channel 2');
  });

  it('the Playout’s programme channel has no tab — control: the declared channel has one', async () => {
    const el = await render(DISCOVERED, signedInStub('نرگس کریمی', [2]));
    const labels = tabs(el).map((t) => t.textContent);
    expect(labels, 'the strip is empty — the instrument is dead').toContain('کانال دوم (تست CG)');
    expect(labels.some((l) => l?.includes('آپاسای') === true)).toBe(false);
    expect(tabs(el).map((t) => t.id)).toEqual(['channel-2']);
  });

  it('a read-only channel keeps its suffix OUTSIDE the isolate', async () => {
    // A viewer: granted nothing, so the bank's channel survives read-only.
    const el = await render(DISCOVERED, signedInStub('مریم کاظمی', [], ['viewer']));
    const [tab] = tabs(el);
    expect(tab?.textContent).toBe('کانال دوم (تست CG) · READ ONLY');
    expect(tab?.querySelector('bdi')?.textContent).toBe('کانال دوم (تست CG)');
  });

  it('`MULTI-CHANNEL-01` — two declared channels, each tab under ITS OWN catalogue name', async () => {
    const el = await render({
      channels: [
        {
          channel: 1,
          named: { id: 'news', name: 'خبر سراسری' },
          declared: true,
          permitted: true,
          sources: ['catalogue', 'bank'],
        },
        {
          channel: 2,
          named: { id: 'cg-test2', name: 'کانال دوم (تست CG)' },
          declared: true,
          permitted: true,
          sources: ['catalogue', 'bank', 'channel-settings'],
        },
      ],
    });
    expect(tabs(el).map((t) => t.id)).toEqual(['channel-1', 'channel-2']);
    expect(tabs(el).map((t) => t.querySelector('bdi')?.textContent)).toEqual([
      'خبر سراسری',
      'کانال دوم (تست CG)',
    ]);
    // Each number relocated to its own tab — a name is never borrowed across channels.
    expect(tabs(el).map((t) => t.title)).toEqual(['Channel 1', 'Channel 2']);
  });

  it('with no catalogue name the label is exactly what it was — CHANNEL 2', async () => {
    const el = await render({
      channels: [
        { channel: 2, named: null, declared: true, sources: ['bank', 'channel-settings'] },
      ],
    });
    const [tab] = tabs(el);
    expect(tab?.textContent).toBe('CHANNEL 2');
    expect(tab?.querySelector('bdi')).toBeNull();
    expect(tab?.hasAttribute('title')).toBe(false);
  });
});
