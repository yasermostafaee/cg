// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { STATION_SETUP_SECTIONS } from '../src/renderer/features/stationSetup/sections.js';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  selectSetupTab,
  setSetupInput,
  stationSetupStub,
  tabOf,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * `STATION-CHROME-01` §2 — **THE RAIL IS WHAT MAKES TABS SAFE HERE, so it is what this
 * file measures.**
 *
 * The previous build refused tabs, and its reason was right: _"a tab hides the section a
 * refusal came from"_. It is not enough to answer that with "each tab owns its footer" —
 * that fixes WHERE a refusal is rendered and says nothing about the operator who is on
 * another tab and does not know there is one. The rail is the other half:
 *
 *   · a BLOCKED section carries an amber dot, from every tab;
 *   · a section with UNAPPLIED CHANGES carries a sky one;
 *   · pressing it lands on the sentence that says why.
 *
 * And the defect the scroll actually had, which is the negative half and the reason this
 * change is an improvement rather than a trade: `Apply is blocked for Servers…` must NOT be
 * in front of an operator who is editing delimiters.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

const onAir = (id: string): StackItemState =>
  ({
    id,
    templateId: 't',
    layer: 70,
    status: 'on-air',
    fields: {},
  }) as unknown as StackItemState;

describe('§2 — the rail: nothing is hidden, and no refusal stands in front of another section', () => {
  it('the rail lists every section, in the owner’s order, under its group', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'channel' });
    // The FIRST span is the visible label; a tab may also carry a visually-hidden status
    // sentence beside its dot, which is not what the operator reads off the rail.
    const labels = [...dialog.querySelectorAll('[role="tab"]')].map(
      (t) => t.querySelector('span')?.textContent,
    );
    expect(labels).toEqual([
      'Channel',
      'Servers',
      'Live sources',
      'Text file delimiters',
      'Layers',
    ]);
    // …and the ids behind them are the deep-link ids, unchanged.
    expect([...dialog.querySelectorAll('[role="tab"]')].map((t) => t.id)).toEqual(
      STATION_SETUP_SECTIONS.map((s) => `station-${s.id}`),
    );
    expect(dialog.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe(
      'vertical',
    );
  });

  /*
    ⚠ `SETTINGS-POLISH-04` §4 — THE ELEMENT MOVED, THE CLAIM DID NOT. The standing on-air block
    is `[data-setup-notice]` in the pane's flow now, not `[data-modal-message]` above the footer
    (see `SetupNotice.tsx` for why a BLOCK is not an EVENT). What this test is about — the
    sentence is on Servers and only on Servers — is unchanged, so only the selector moves.
  */
  it('🔴 THE SCROLL’S DEFECT, GONE: the Servers block is not in front of the delimiters', async () => {
    stationSetupStub({ items: [onAir('a'), onAir('b')] });
    const dialog = await renderStationSetup({ section: 'servers' });
    // On SERVERS the operator sees it, in full, in that section's own column.
    expect(dialog.querySelector('[data-setup-notice]')?.textContent).toContain(
      'Server changes are paused while on air',
    );

    // …and on DELIMITERS he does not. This is the whole complaint, as an assertion.
    await selectSetupTab(dialog, 'delimiters');
    expect(dialog.querySelector('[data-setup-notice]')?.textContent ?? '').not.toContain(
      'Server changes are paused while on air',
    );

    // But nothing is HIDDEN: the rail still says Servers is blocked, from here.
    expect(tabOf(dialog, 'servers').querySelector('[data-tab-badge="warn"]')).not.toBeNull();
    // …and it says so to a screen reader too — the signal never depends on colour.
    expect(tabOf(dialog, 'servers').textContent).toContain('Servers is blocked');

    // …and one press lands on the sentence.
    await selectSetupTab(dialog, 'servers');
    expect(dialog.querySelector('[data-setup-notice]')?.textContent).toContain(
      'Server changes are paused while on air',
    );
  });

  it('POSITIVE CONTROL: with nothing on air, no section carries a blocked dot', async () => {
    // Without this, the dot assertions above would pass against a rail that always shows
    // one — the failure mode a presence check has and an absence check does not.
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'channel' });
    expect(dialog.querySelectorAll('[data-tab-badge="warn"]')).toHaveLength(0);
    expect(dialog.querySelectorAll('[data-tab-badge="edited"]')).toHaveLength(0);
  });

  it('a section with UNAPPLIED CHANGES marks itself in the rail, in the sky and not the amber', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'servers' });
    expect(dialog.querySelectorAll('[data-tab-badge]')).toHaveLength(0);

    await setSetupInput(dialog, 'Primary host', '192.168.21.114');
    expect(tabOf(dialog, 'servers').querySelector('[data-tab-badge="edited"]')).not.toBeNull();
    expect(tabOf(dialog, 'servers').textContent).toContain('Servers has unapplied changes');
    // AMBER is "you are blocked" and must not be spent on "you have typed something".
    expect(tabOf(dialog, 'servers').querySelector('[data-tab-badge="warn"]')).toBeNull();

    // …and it stays visible from another tab, which is the point of putting it in the rail.
    await selectSetupTab(dialog, 'channel');
    expect(tabOf(dialog, 'servers').querySelector('[data-tab-badge="edited"]')).not.toBeNull();
  });

  it('BLOCKED beats EDITED — one dot per row, and it is the more urgent fact', async () => {
    stationSetupStub({ items: [onAir('a')] });
    const dialog = await renderStationSetup({ section: 'servers' });
    await setSetupInput(dialog, 'Primary host', '192.168.21.114');
    const badges = tabOf(dialog, 'servers').querySelectorAll('[data-tab-badge]');
    expect(badges).toHaveLength(1);
    expect(badges[0]?.getAttribute('data-tab-badge')).toBe('warn');
  });

  it('only ONE section is mounted — a tab is a switch, not a scroll', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'channel' });
    expect(dialog.querySelectorAll('[data-station-section]')).toHaveLength(1);
    await selectSetupTab(dialog, 'sources');
    expect(dialog.querySelectorAll('[data-station-section]')).toHaveLength(1);
    expect(
      dialog.querySelector('[data-station-section]')?.getAttribute('data-station-section'),
    ).toBe('sources');
  });

  it('STATION LAYERS is gone from settings — §3, and the rail is where that is provable', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'channel' });
    expect([...dialog.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).not.toContain(
      'Station layers',
    );
    // …and neither is the raster a tab of its own any more: it is inside Channel, read-only.
    expect([...dialog.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).not.toContain(
      'Channel raster',
    );
  });
});
