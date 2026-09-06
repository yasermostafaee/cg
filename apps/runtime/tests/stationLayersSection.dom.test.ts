// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLayerRanges } from '../src/renderer/features/stationSetup/StationLayersSection.js';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  sectionOf,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * `STATION-SETUP-02` §2 — **the reserved and live layers, READ-ONLY, with their source named.**
 *
 * Both had a CLI flag and a file and no UI. The section shows what is declared, names the
 * flag and the file, and says what the console CANNOT see — whether the ledger is being
 * persisted — rather than guessing. It is read-only by construction: no input, no button.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

describe('describeLayerRanges — the CLI flag’s own spelling', () => {
  it('collapses runs and keeps singletons', () => {
    expect(describeLayerRanges([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 105])).toBe('60–69, 105');
    expect(describeLayerRanges([7])).toBe('7');
    expect(describeLayerRanges([])).toBe('');
    expect(describeLayerRanges([3, 1, 2, 2])).toBe('1–3');
  });
});

describe('Station setup — Station layers', () => {
  it('names the reserved ranges per channel and where they come from — and offers no control', async () => {
    stationSetupStub({
      stationLayers: [
        ...Array.from({ length: 10 }, (_, i) => ({
          channel: 1,
          layer: 60 + i,
          observed: { kind: 'empty' as const },
        })),
        { channel: 1, layer: 105, observed: { kind: 'unknown' as const } },
        { channel: 2, layer: 60, observed: { kind: 'empty' as const } },
      ],
    });
    const dialog = await renderStationSetup({ section: 'station-layers' });
    const section = sectionOf(dialog, 'station-layers');
    const reserved = section.querySelector('[data-reserved-layers]');
    expect(reserved?.textContent).toContain('Channel 1: 60–69, 105');
    expect(reserved?.textContent).toContain('Channel 2: 60');
    expect(reserved?.textContent).toContain('--reserved-layers');
    expect(reserved?.textContent).toContain('bridge-reserved-layers.json');
    expect(reserved?.textContent).toContain('restart the bridge');
    // READ-ONLY by construction.
    expect(section.querySelectorAll('input, select, button, textarea').length).toBe(0);
    expect(section.textContent).toContain('Read-only');
  });

  it('says NONE when nothing is reserved, rather than hiding the section', async () => {
    stationSetupStub({ stationLayers: [] });
    const dialog = await renderStationSetup({ section: 'station-layers' });
    expect(sectionOf(dialog, 'station-layers').textContent).toContain('None declared.');
  });

  it('lists the seated live layers by coordinate, names the file and the flags, and admits what it cannot see', async () => {
    stationSetupStub({
      liveLayers: [
        {
          channel: 1,
          layer: 12,
          itemId: 'item-1',
          sourceId: 'guest-1',
          role: 'fill',
          producer: 'route://2',
          held: false,
          unverified: false,
        },
        {
          channel: 1,
          layer: 13,
          itemId: 'item-1',
          sourceId: 'guest-2',
          role: 'fill',
          producer: 'route://3',
          held: true,
          unverified: true,
        },
      ],
    });
    const dialog = await renderStationSetup({ section: 'station-layers' });
    const ledger = sectionOf(dialog, 'station-layers').querySelector('[data-live-layer-ledger]');
    expect(ledger?.textContent).toContain('2 layers seated: 1-12, 1-13');
    expect(ledger?.textContent).toContain('bridge-live-layers.json');
    expect(ledger?.textContent).toContain('--live-layers-path');
    expect(ledger?.textContent).toContain('--no-live-layers');
    expect(ledger?.textContent).toContain('the console cannot see which');
    // Golden rule 11: no row NAME is composed here — the join is the LIVE SOURCES tab's.
    expect(ledger?.textContent).not.toContain('item-1');
    expect(ledger?.textContent).toContain('LIVE SOURCES tab');
  });

  it('an empty ledger reads as nothing seated once the bridge has answered', async () => {
    stationSetupStub({ liveLayers: [] });
    const dialog = await renderStationSetup({ section: 'station-layers' });
    expect(
      sectionOf(dialog, 'station-layers').querySelector('[data-live-layer-ledger]')?.textContent,
    ).toContain('Nothing seated.');
  });
});
