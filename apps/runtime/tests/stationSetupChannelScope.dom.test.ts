// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CatalogueChannel,
  FixedLayerBank,
  FixedSlotState,
  StationStray,
} from '@cg/shared-ipc';
import {
  __resetChannelChoiceForTest,
  selectChannel,
} from '../src/renderer/features/channels/channelStore.js';
import { firstRunBank } from '../src/renderer/features/firstRun/firstRunStation.js';
import { signedInStub, setupStub } from './support/authStub.js';
import { clearPortals } from './support/dialog.js';
import {
  SETUP_BANK,
  renderStationSetup,
  sectionOf,
  settleSetup,
  stationSetupStub,
  unmountStationSetup,
  type StationSetupStubOptions,
} from './support/stationSetup.js';

/**
 * 🔴 `DESKTOP-APPS-01-D` e / j — **STATION SETUP'S TWO CHANNEL-SCOPE CONTROLS.**
 *
 * e — the owner's installed station, set up on the Playout's programme channel by mistake, had no
 *     way back that did not need a file edit. **Change channel…** is first-run's own list, for a
 *     station-admin; the bridge refuses while anything of ours is on air on the current channel,
 *     in one sentence, and the console shows it as it comes.
 * j — an item of ours on a channel this station does not declare is shown HERE and nowhere else,
 *     with its channel, layer and template, and one action: take it off air.
 *
 * Both are ABSENT for a principal who is not a station-admin (golden rule 13) — not greyed.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

const ADMIN = signedInStub('زهرا موسوی', [1], ['station-admin', 'operator', 'viewer']);
const OPERATOR = signedInStub('علی رضایی', [1], ['operator', 'viewer']);
const ROWS: CatalogueChannel[] = [
  { id: 'apasai', name: 'آپاسای', casparHost: '127.0.0.1', casparChannel: 1 },
  { id: 'cg', name: 'کانال دوم (تست CG)', casparHost: '127.0.0.1', casparChannel: 2 },
];
const LOGO: StationStray = {
  itemId: 'logo-ch1',
  templateId: '1280f613-a367-405e-aa3b-a2a17dd1d63a',
  templateName: 'ارم روی انتن',
  casparChannel: 1,
  layer: 99,
  observed: 'producer',
};

function stub(options: StationSetupStubOptions): ReturnType<typeof stationSetupStub> {
  const s = stationSetupStub(options);
  (window.cg as unknown as { setup: unknown }).setup = {
    ...setupStub(),
    catalogue: () => Promise.resolve({ rows: ROWS }),
    channelOccupancy: () => Promise.resolve({ state: 'empty', layers: [] }),
  };
  return s;
}

async function press(button: HTMLButtonElement | null | undefined): Promise<void> {
  expect(button, 'the button exists').toBeTruthy();
  await act(async () => {
    button?.click();
  });
  await settleSetup();
}

const buttonNamed = (root: ParentNode, name: RegExp): HTMLButtonElement | undefined =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    name.test(b.textContent ?? ''),
  );

const rowOf = (section: HTMLElement, channel: number): HTMLButtonElement | null =>
  section.querySelector<HTMLButtonElement>(`button[data-channel="${String(channel)}"]`);

describe('e / M — Change channel… edits the station’s channel SET', () => {
  it('it opens on the station’s own set — channel 1 pressed, channel 2 not', async () => {
    stub({ auth: ADMIN });
    const section = sectionOf(await renderStationSetup({ section: 'channel' }), 'channel');
    await press(buttonNamed(section, /^Change channel…$/));
    expect(rowOf(section, 1)?.getAttribute('aria-pressed')).toBe('true');
    expect(rowOf(section, 2)?.getAttribute('aria-pressed')).toBe('false');
    // The set as it stands changes nothing, so there is nothing to press yet.
    expect(buttonNamed(section, /^Use this channel$/)?.disabled).toBe(true);
  });

  it('REPLACE — one channel for another carries the station’s bank to it, through the door it always used', async () => {
    const s = stub({ auth: ADMIN });
    const section = sectionOf(await renderStationSetup({ section: 'channel' }), 'channel');
    await press(buttonNamed(section, /^Change channel…$/));
    await press(rowOf(section, 1));
    await press(rowOf(section, 2));
    await press(buttonNamed(section, /^Use this channel$/));
    expect(s.fixedSetConfig).toHaveBeenCalledTimes(1);
    expect(s.fixedSetConfig.mock.calls[0]?.[0]).toEqual({ ...SETUP_BANK, channel: 2 });
    expect(s.fixedSetBanks).not.toHaveBeenCalled();
    // Same host: nothing about the connection moves.
    expect(s.setConfig).not.toHaveBeenCalled();
  });

  it('ADD — the station keeps channel 1 as it is and gains channel 2, in one write', async () => {
    const s = stub({ auth: ADMIN });
    const section = sectionOf(await renderStationSetup({ section: 'channel' }), 'channel');
    await press(buttonNamed(section, /^Change channel…$/));
    await press(rowOf(section, 2));
    await press(buttonNamed(section, /^Use these 2 channels$/));
    expect(s.fixedSetBanks).toHaveBeenCalledTimes(1);
    expect(s.fixedSetBanks.mock.calls[0]?.[0]).toEqual({
      banks: [SETUP_BANK, firstRunBank(2)],
    });
    expect(s.fixedSetConfig).not.toHaveBeenCalled();
  });

  it('REMOVE — leaving one channel of two keeps that channel’s own bank, untouched', async () => {
    const two = { ...SETUP_BANK, channel: 2, aliases: { '70': 'ساعت' } };
    const s = stub({ auth: ADMIN, banks: [SETUP_BANK, two] });
    const section = sectionOf(await renderStationSetup({ section: 'channel' }), 'channel');
    await press(buttonNamed(section, /^Change channel…$/));
    expect(rowOf(section, 2)?.getAttribute('aria-pressed')).toBe('true');
    await press(rowOf(section, 1));
    await press(buttonNamed(section, /^Use this channel$/));
    expect(s.fixedSetConfig.mock.calls).toEqual([[two]]);
  });

  it('a declared channel the Playout’s list does not name is still on screen, as its number — and can leave the set', async () => {
    const three = { ...SETUP_BANK, channel: 3 };
    const s = stub({ auth: ADMIN, banks: [SETUP_BANK, three] });
    const section = sectionOf(await renderStationSetup({ section: 'channel' }), 'channel');
    await press(buttonNamed(section, /^Change channel…$/));
    const row = rowOf(section, 3);
    expect(row?.textContent).toBe('CH 3');
    expect(row?.getAttribute('aria-pressed')).toBe('true');
    await press(row);
    await press(buttonNamed(section, /^Use this channel$/));
    expect(s.fixedSetConfig.mock.calls).toEqual([[SETUP_BANK]]);
  });

  it('refused while ours is on air on a channel leaving the set — the bridge’s one sentence, shown as it comes', async () => {
    const sentence = 'Something of ours is still on air on channel 1 — take it off air first.';
    const s = stub({
      auth: ADMIN,
      fixedSetConfigResult: { ok: false, reason: 'channel-change-refused', message: sentence },
    });
    const dialog = await renderStationSetup({ section: 'channel' });
    const section = sectionOf(dialog, 'channel');
    await press(buttonNamed(section, /^Change channel…$/));
    await press(rowOf(section, 1));
    await press(rowOf(section, 2));
    await press(buttonNamed(section, /^Use this channel$/));
    expect(s.fixedSetConfig).toHaveBeenCalledTimes(1);
    expect(section.textContent).toContain(sentence);
  });

  it('the card states the station’s set', async () => {
    stub({ auth: ADMIN, banks: [SETUP_BANK, { ...SETUP_BANK, channel: 2 }] });
    const section = sectionOf(await renderStationSetup({ section: 'channel' }), 'channel');
    expect(section.querySelector('[data-change-channel]')?.textContent).toContain('CH 1 · CH 2');
  });

  it('absent for an operator — control: present for the station-admin', async () => {
    stub({ auth: OPERATOR, strays: [LOGO] });
    const dialog = await renderStationSetup({ section: 'channel' });
    const section = sectionOf(dialog, 'channel');
    expect(section.querySelector('[data-change-channel]')).toBeNull();
    expect(buttonNamed(section, /Change channel/)).toBeUndefined();
    expect(section.querySelector('[data-strays]')).toBeNull();

    await unmountStationSetup();
    stub({ auth: ADMIN, strays: [LOGO] });
    const again = sectionOf(await renderStationSetup({ section: 'channel' }), 'channel');
    expect(again.querySelector('[data-change-channel]')).not.toBeNull();
    expect(again.querySelector('[data-strays]')).not.toBeNull();
  });
});

describe('M — the Channel pane says what is true for the principal reading it', () => {
  const head = (dialog: HTMLElement): { legend: string; tag: string } => {
    const section = sectionOf(dialog, 'channel');
    return {
      legend: section.querySelector('.cg-setup-description')?.textContent ?? '',
      tag: section.querySelector('[data-section-commit]')?.textContent ?? '',
    };
  };

  it('a station-admin reads that Change channel… sets the channels — not "read-only"', async () => {
    stub({ auth: ADMIN });
    const { legend, tag } = head(await renderStationSetup({ section: 'channel' }));
    expect(legend).toBe('Reported by the server. Change channel… sets the channels.');
    expect(tag).toBe('Apply separately');
    expect(legend).not.toMatch(/read-only/i);
  });

  it('control — anyone else reads the pane as read-only, which for them it is', async () => {
    stub({ auth: OPERATOR });
    const { legend, tag } = head(await renderStationSetup({ section: 'channel' }));
    expect(legend).toBe('Read-only — reported by the server, not set here.');
    expect(tag).toBe('Read only');
  });
});

describe('H — the subtitle names the channel as the Playout does (`MULTI-CHANNEL-01` §2 H)', () => {
  function discovered(name: string | null): void {
    (window.cg as unknown as { stationChannels: unknown }).stationChannels = {
      list: () =>
        Promise.resolve({
          channels: [
            {
              channel: 1,
              named: name === null ? null : { id: 'news', name },
              declared: true,
              sources: ['bank'],
            },
          ],
        }),
      onChanged: () => () => undefined,
    };
  }

  it('the catalogue’s name follows the number, in its own isolate', async () => {
    stub({ auth: ADMIN });
    discovered('خبر سراسری');
    const dialog = await renderStationSetup({ section: 'channel' });
    const name = dialog.querySelector('[data-setup-channel-name]');
    expect(name?.tagName).toBe('BDI');
    expect(name?.textContent).toBe('خبر سراسری');
    expect(name?.parentElement?.textContent).toMatch(/^Channel 1 · خبر سراسری/);
  });

  it('control — with no catalogue name the line is exactly what it was', async () => {
    stub({ auth: ADMIN });
    discovered(null);
    const dialog = await renderStationSetup({ section: 'channel' });
    expect(dialog.querySelector('[data-setup-channel-name]')).toBeNull();
    expect(dialog.textContent).toContain('Channel 1');
  });
});

/*
  🔴 `DELTA-MULTI-CHANNEL-01-A` A7 — **STATION SETUP FOLLOWS THE CHANNEL ON SCREEN**, opened on one
  and switched while open. The channel can move under an open dialog: Change channel… taking the
  channel on screen out of the set moves the console to the lowest declared channel. The channel's
  own panes follow it — the subtitle, the Layers pane and its rows — and an unapplied edit made for
  one channel never lands on the other.
*/
describe('A7 — Station setup follows the channel on screen', () => {
  const BOTH = signedInStub('زهرا موسوی', [1, 2], ['station-admin', 'operator', 'viewer']);
  const CH1: FixedLayerBank = { ...SETUP_BANK, channel: 1, aliases: { '70': 'LOGO-ONE' } };
  const CH2: FixedLayerBank = { ...SETUP_BANK, channel: 2, aliases: { '70': 'CLOCK-TWO' } };
  const empty = (channel: number, layer: number): FixedSlotState => ({
    channel,
    layer,
    observed: { kind: 'empty' },
    binding: null,
  });

  afterEach(() => {
    __resetChannelChoiceForTest();
  });

  const subtitle = (dialog: HTMLElement): string =>
    dialog.querySelector('[data-modal-subtitle]')?.textContent ?? '';
  const names = (dialog: HTMLElement): string[] =>
    [
      ...sectionOf(dialog, 'candidate-layers').querySelectorAll<HTMLInputElement>(
        'input[type="text"]',
      ),
    ]
      .map((i) => i.value)
      .filter((v) => v !== '');
  const showTick = (dialog: HTMLElement, layer: number): HTMLInputElement | null =>
    sectionOf(dialog, 'candidate-layers').querySelector<HTMLInputElement>(
      `input[type="checkbox"][aria-label="Show layer ${String(layer)}"]`,
    );

  it('opens on the channel on screen and follows a switch while open — subtitle, Layers pane, rows; an edit made for channel 2 never lands on channel 1', async () => {
    const s = stub({
      auth: BOTH,
      banks: [CH1, CH2],
      slots: [empty(1, 70), empty(1, 71), empty(2, 70), empty(2, 71)],
    });
    selectChannel(2);
    const dialog = await renderStationSetup({ section: 'candidate-layers' });

    // Opened on channel 2: its subtitle, its bank, its row names.
    expect(subtitle(dialog)).toMatch(/^Channel 2\b/);
    expect(sectionOf(dialog, 'candidate-layers').textContent).toContain('Channel 2');
    expect(names(dialog)).toContain('CLOCK-TWO');
    expect(names(dialog)).not.toContain('LOGO-ONE');
    // An unapplied edit on channel 2 — CONTROL: the instrument sees a draft when there is one.
    await act(async () => {
      showTick(dialog, 71)?.click();
    });
    await settleSetup();
    expect(showTick(dialog, 71)?.checked).toBe(false);

    // The channel moves under the open dialog.
    await act(async () => {
      selectChannel(1);
    });
    await settleSetup();

    expect(subtitle(dialog)).toMatch(/^Channel 1\b/);
    expect(sectionOf(dialog, 'candidate-layers').textContent).toContain('Channel 1');
    expect(names(dialog)).toContain('LOGO-ONE');
    expect(names(dialog)).not.toContain('CLOCK-TWO');
    // Channel 2's draft did not follow onto channel 1…
    expect(showTick(dialog, 71)?.checked).toBe(true);
    // …and applying here writes channel 1 as it is, and channel 2 as it is — nothing hidden anywhere.
    await press(buttonNamed(dialog, /^Apply layers$/));
    expect(s.fixedSetBanks).toHaveBeenCalledTimes(1);
    expect(s.fixedSetBanks.mock.calls[0]?.[0]).toEqual({ banks: [CH1, CH2] });
  });
});

describe('j — On air on another channel', () => {
  it('shows the logo left on channel 1 — template, channel, layer — and takes exactly that layer off air after one confirmation', async () => {
    const s = stub({ auth: ADMIN, strays: [LOGO] });
    const dialog = await renderStationSetup({ section: 'channel' });
    const card = sectionOf(dialog, 'channel').querySelector<HTMLElement>('[data-strays]');
    const row = card?.querySelector('[data-stray="1-99"]');
    expect(row?.textContent).toContain('ارم روی انتن · CH 1 · layer 99');
    // Never offered to load again: the one action is taking it off air.
    expect([...(card?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual([
      'Take off air',
    ]);

    await press(buttonNamed(card ?? document, /^Take off air$/));
    const confirmDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) =>
      (d.textContent ?? '').includes('off air on channel 1, layer 99?'),
    );
    expect(confirmDialog, 'the one-line confirmation').toBeTruthy();
    expect(s.takeOffAir).not.toHaveBeenCalled();
    await press(buttonNamed(confirmDialog ?? document, /^Take off air$/));
    expect(s.takeOffAir).toHaveBeenCalledTimes(1);
    expect(s.takeOffAir.mock.calls[0]?.[0]).toEqual({ casparChannel: 1, layer: 99 });
  });

  it('control — with no stray the card is absent', async () => {
    stub({ auth: ADMIN, strays: [] });
    const dialog = await renderStationSetup({ section: 'channel' });
    expect(sectionOf(dialog, 'channel').querySelector('[data-strays]')).toBeNull();
  });
});
