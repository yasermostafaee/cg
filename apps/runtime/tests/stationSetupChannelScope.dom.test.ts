// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogueChannel, StationStray } from '@cg/shared-ipc';
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

describe('e — Change channel…', () => {
  it('a station-admin changes an idle station’s channel through first-run’s own list', async () => {
    const s = stub({ auth: ADMIN });
    const dialog = await renderStationSetup({ section: 'channel' });
    const section = sectionOf(dialog, 'channel');
    await press(buttonNamed(section, /^Change channel…$/));
    // First-run's list, with nothing picked.
    const two = section.querySelector<HTMLButtonElement>('button[data-channel="2"]');
    expect(two?.getAttribute('aria-pressed')).toBe('false');
    await press(two);
    await press(buttonNamed(section, /^Use this channel$/));
    expect(s.fixedSetConfig).toHaveBeenCalledTimes(1);
    expect(s.fixedSetConfig.mock.calls[0]?.[0]).toEqual({ ...SETUP_BANK, channel: 2 });
    // Same host: nothing about the connection moves.
    expect(s.setConfig).not.toHaveBeenCalled();
  });

  it('refused while ours is on air on the current channel — the bridge’s one sentence, shown as it comes', async () => {
    const sentence = 'Something of ours is still on air on channel 1 — take it off air first.';
    const s = stub({
      auth: ADMIN,
      fixedSetConfigResult: { ok: false, reason: 'channel-change-refused', message: sentence },
    });
    const dialog = await renderStationSetup({ section: 'channel' });
    const section = sectionOf(dialog, 'channel');
    await press(buttonNamed(section, /^Change channel…$/));
    await press(section.querySelector<HTMLButtonElement>('button[data-channel="2"]'));
    await press(buttonNamed(section, /^Use this channel$/));
    expect(s.fixedSetConfig).toHaveBeenCalledTimes(1);
    expect(section.textContent).toContain(sentence);
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
