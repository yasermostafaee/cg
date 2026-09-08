// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSettingsState, ConnectionHealth } from '@cg/shared-ipc';
import {
  __resetChannelChoiceForTest,
  selectChannel,
} from '../src/renderer/features/channels/channelStore.js';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  sectionOf,
  selectSetupTab,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` Phase 7 (`PROMPT.md` §7) — **per-channel settings and state are
 * separated by channel id; station-wide settings keep their real scope.**
 *
 * The Channel tab REPORTS one channel — the one the console's channel strip has selected — and
 * nothing of another channel's leaks into it: not its raster verdict, not its outputs. The
 * station-wide tabs (Servers, Live sources, Text file delimiters) do not change with the
 * selection, because a server, a catalogue and a delimiter list are the STATION's.
 *
 * RED FIRST against the shipped `ChannelSection`, which mapped EVERY entry of
 * `channelSettings.settings` into the tab and passed the whole health snapshot to the outputs
 * section: with two channels declared, channel 1's MATCH and channel 2's MISMATCH stood in one
 * pane under a title that named neither, and selecting a channel changed nothing.
 *
 * ⚠ No persisted key, file or schema is touched to make this true; the selection is session
 * state (`channelStore`) and the two inputs are channels the bridge already publishes.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  __resetChannelChoiceForTest();
  vi.restoreAllMocks();
});

/** Channel 1 agrees with its server; channel 2 is contradicted by it. */
const TWO_CHANNELS: ChannelSettingsState = {
  settings: [
    { channel: 1, raster: { width: 1920, height: 1080 } },
    { channel: 2, raster: { width: 1920, height: 1080 } },
  ],
  observed: [
    { channel: 1, mode: '1080p5000', raster: { width: 1920, height: 1080 } },
    { channel: 2, mode: '720p5000', raster: { width: 1280, height: 720 } },
  ],
};

/** Channel 1's outputs all run; channel 2 has lost its DeckLink. */
const TWO_CHANNEL_HEALTH = {
  primary: {
    label: 'A',
    state: 'healthy',
    amcpAxisOk: true,
    outputs: [
      {
        channel: 1,
        declared: [{ kind: 'decklink', device: '23487013' }, { kind: 'screen' }],
        running: [
          { port: 23487313, kind: 'decklink' },
          { port: 600, kind: 'screen' },
        ],
        missing: [],
        observedAt: '2026-09-08T10:00:00.000Z',
      },
      {
        channel: 2,
        declared: [{ kind: 'decklink', device: '23487014' }, { kind: 'screen' }],
        running: [{ port: 600, kind: 'screen' }],
        missing: [{ kind: 'decklink', declared: 1, running: 0, devices: ['23487014'] }],
        observedAt: '2026-09-08T10:00:00.000Z',
      },
    ],
  },
  currentPrimary: 'A',
  strategy: 'mirror-sync',
} as ConnectionHealth;

describe('§7 — the Channel tab is keyed to the selected channel, and only that channel', () => {
  it('🔴 with channel 2 selected, channel 2’s raster verdict and outputs are shown and channel 1’s are not', async () => {
    stationSetupStub({ raster: TWO_CHANNELS, health: TWO_CHANNEL_HEALTH });
    selectChannel(2);
    const dialog = await renderStationSetup({ section: 'channel' });
    const section = sectionOf(dialog, 'channel');

    expect(section.querySelector('[data-raster-channel="2"]')).not.toBeNull();
    expect(section.querySelector('[data-raster-channel="1"]')).toBeNull();
    expect(
      section.querySelector('[data-raster-verdict]')?.getAttribute('data-raster-verdict'),
    ).toBe('mismatch');

    const outputs = section.querySelector('section[aria-label="Program outputs"]');
    expect(outputs?.textContent).toContain('Channel 2 on server A');
    expect(outputs?.textContent).not.toContain('Channel 1 on server A');
    expect(outputs?.querySelector('[data-severity="air"]')?.textContent).toContain(
      'decklink (device 23487014)',
    );

    // The dialog says which channel it is scoped to, under its title.
    expect(dialog.querySelector('[data-modal-subtitle]')?.textContent).toContain('Channel 2');
  });

  it('🔴 with channel 1 selected, the same dialog shows channel 1 and says nothing of channel 2', async () => {
    stationSetupStub({ raster: TWO_CHANNELS, health: TWO_CHANNEL_HEALTH });
    selectChannel(1);
    const dialog = await renderStationSetup({ section: 'channel' });
    const section = sectionOf(dialog, 'channel');

    expect(section.querySelector('[data-raster-channel="1"]')).not.toBeNull();
    expect(section.querySelector('[data-raster-channel="2"]')).toBeNull();
    expect(
      section.querySelector('[data-raster-verdict]')?.getAttribute('data-raster-verdict'),
    ).toBe('match');
    expect(section.textContent).not.toContain('MISMATCH');

    const outputs = section.querySelector('section[aria-label="Program outputs"]');
    expect(outputs?.textContent).toContain('Channel 1 on server A');
    expect(outputs?.textContent).not.toContain('Channel 2 on server A');
    expect(outputs?.querySelector('[data-severity="air"]')).toBeNull();
    expect(dialog.querySelector('[data-modal-subtitle]')?.textContent).toContain('Channel 1');
  });

  it('with no choice made, the tab follows the bank’s channel — the console’s channel authority today', async () => {
    stationSetupStub({ raster: TWO_CHANNELS, health: TWO_CHANNEL_HEALTH });
    const dialog = await renderStationSetup({ section: 'channel' });
    const section = sectionOf(dialog, 'channel');
    // The stub's bank declares channel 1.
    expect(section.querySelector('[data-raster-channel="1"]')).not.toBeNull();
    expect(section.querySelector('[data-raster-channel="2"]')).toBeNull();
  });

  it('a selected channel with no stored settings is reported as such, not as another channel’s', async () => {
    stationSetupStub({
      raster: TWO_CHANNELS,
      health: TWO_CHANNEL_HEALTH,
      bank: { channel: 3, low: { start: 1, count: 9 }, start: 70, count: 2 },
    });
    selectChannel(3);
    const dialog = await renderStationSetup({ section: 'channel' });
    const section = sectionOf(dialog, 'channel');
    expect(section.querySelector('[data-raster-channel="3"]')).not.toBeNull();
    expect(section.querySelector('[data-raster-channel="1"]')).toBeNull();
    expect(
      section.querySelector('[data-raster-verdict]')?.getAttribute('data-raster-verdict'),
    ).toBe('unconfigured');
  });
});

describe('§7 — station-wide sections keep their real scope: the selection does not touch them', () => {
  interface StationWide {
    serversHost: string;
    servers: string;
    sources: string;
    delimiters: string;
  }

  async function stationWideText(channel: number): Promise<StationWide> {
    stationSetupStub({ raster: TWO_CHANNELS, health: TWO_CHANNEL_HEALTH });
    selectChannel(channel);
    const dialog = await renderStationSetup({ section: 'servers' });
    const servers = sectionOf(dialog, 'servers');
    const out: StationWide = {
      serversHost:
        servers.querySelector<HTMLInputElement>('input[aria-label="Primary host"]')?.value ?? '',
      servers: servers.textContent ?? '',
      sources: (await selectSetupTab(dialog, 'sources')).textContent ?? '',
      delimiters: (await selectSetupTab(dialog, 'delimiters')).textContent ?? '',
    };
    await unmountStationSetup();
    clearPortals();
    __resetChannelChoiceForTest();
    return out;
  }

  it('Servers, Live sources and Text file delimiters render IDENTICALLY under channel 1 and channel 2', async () => {
    const one = await stationWideText(1);
    const two = await stationWideText(2);
    expect(one.serversHost).toBe('127.0.0.1');
    expect(two).toEqual(one);
    // POSITIVE CONTROL: the comparison is over real content, not two empty strings.
    expect(one.servers.length).toBeGreaterThan(100);
    expect(one.sources.length).toBeGreaterThan(50);
    expect(one.delimiters.length).toBeGreaterThan(50);
  });
});
