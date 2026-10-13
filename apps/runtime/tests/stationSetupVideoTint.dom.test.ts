// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSettingsState } from '@cg/shared-ipc';
import { clearPortals } from './support/dialog.js';
import {
  SETUP_RASTER,
  renderStationSetup,
  sectionOf,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `MODAL-TRUTH-01` (owner, 2026-09-22) — **THE VIDEO-FORMAT CARD IS TINTED ONLY WHILE
 * THERE IS A READING TO TINT.** «بهتره وقتی متصل نیست سبز نباشه».
 *
 * The owner opened Station setup on a station with no bridge: `not read yet`, `not
 * configured`, `nothing — this channel has no stored settings` and `No health reading from
 * the bridge yet`, every one of them inside a GREEN card. The tint was adopted by
 * `SETTINGS-MATCH-02` with the note _"it claims nothing about air"_, and that clause was
 * the thing that was wrong: green is this console's settled ink for a thing that is up, and
 * a card does not get to opt out of a vocabulary the whole surface shares. Same family as
 * the two defects this session fixed beside it — a surface asserting a state that is not in
 * force.
 *
 * ⚠ **This spec asserts the STATE, not the paint.** jsdom does not load `controls.css` at
 * all here, so a background read in it would measure nothing (golden rule 12c). What the
 * component decides is the attribute; that the attribute decides the PAINT is measured in
 * Chromium, in `tests/e2e/station-setup-video-tint.spec.ts`. Neither half is a proxy for
 * the other and neither is vacuous.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

/** A raster state whose channel has STORED settings but has never been read back. */
const NEVER_READ: ChannelSettingsState = {
  settings: SETUP_RASTER.settings,
  observed: [],
};

/** A channel the server HAS answered for, with a mode this build cannot map. */
const READ_BUT_UNMAPPABLE: ChannelSettingsState = {
  settings: SETUP_RASTER.settings,
  observed: [{ channel: 1, mode: 'something-new', raster: null }],
};

function card(dialog: HTMLElement): HTMLElement {
  const el = sectionOf(dialog, 'channel').querySelector<HTMLElement>('[data-raster-channel]');
  if (el === null) throw new Error('the video format card is not rendered');
  return el;
}

describe('MODAL-TRUTH-01 — the video-format card claims nothing while nothing has been read', () => {
  it('NOT READ — the card is not tinted, and it says so in its own words', async () => {
    stationSetupStub({ raster: NEVER_READ });
    const dialog = await renderStationSetup({ section: 'channel' });

    expect(card(dialog).getAttribute('data-video-read')).toBe('no');
    // The state the attribute is about, read off the same card, so the two cannot drift.
    expect(card(dialog).textContent).toContain('not read yet');
  });

  it('READ — the card is tinted', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'channel' });

    expect(card(dialog).getAttribute('data-video-read')).toBe('yes');
    expect(card(dialog).textContent).not.toContain('not read yet');
  });

  it('READ BUT UNMAPPABLE — still a reading, so still tinted', async () => {
    /*
      The server ANSWERED; this build cannot map the token it sent. That is a real reply
      being reported, and the mode line says exactly that — so the card has a subject and
      keeps its tint. Pinned because the obvious mis-spelling of this predicate is
      `observed?.raster !== null`, which would blank the card on a station that is
      perfectly well connected.
    */
    stationSetupStub({ raster: READ_BUT_UNMAPPABLE });
    const dialog = await renderStationSetup({ section: 'channel' });

    expect(card(dialog).getAttribute('data-video-read')).toBe('yes');
    expect(card(dialog).textContent).toContain('a mode this build cannot map');
  });

  it('the predicate is the SERVER reading, not the link health', async () => {
    /*
      Golden rule 8 — probe the axis you intend to judge. `health` answers whether the
      bridge link is up, which is a different question from whether THIS channel has been
      read. A card tinted off `health` would be green on a healthy link whose channel read
      had not arrived, which is the defect with an extra step.
    */
    stationSetupStub({ raster: NEVER_READ, health: null });
    let dialog = await renderStationSetup({ section: 'channel' });
    expect(card(dialog).getAttribute('data-video-read')).toBe('no');

    await unmountStationSetup();
    clearPortals();

    stationSetupStub({
      raster: NEVER_READ,
      health: {
        primary: { label: 'A', state: 'healthy', amcpAxisOk: true, outputs: [] },
        active: 'A',
      } as never,
    });
    dialog = await renderStationSetup({ section: 'channel' });
    // A healthy LINK does not make an unread channel green.
    expect(card(dialog).getAttribute('data-video-read')).toBe('no');
  });
});
