// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTE_NO_LAYER_REASON, type SourceCatalog } from '@cg/shared-ipc';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  sectionOf,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.C — **STATION SETUP ▸ LIVE SOURCES LISTS THE PLAYOUT'S INPUTS, READ-ONLY.**
 *
 * This file used to drive the catalogue editor's Add dialog (C-025's fifth producer kind, and §5's
 * per-kind address parts). The editor went with §1.F — the sources are the Playout's — so what is
 * pinned now is the list that replaced it:
 *
 *   - each input's NAME, its KIND in three words (`SDI` for a `route` or a `decklink`, `NDI`,
 *     `Stream`) and its format — the one place the kind is shown;
 *   - NEVER an address: no URL (one can carry credentials, §1.E), no device, no NDI name;
 *   - `Unusable` marked, with the reason on hover;
 *   - the time of the last successful read, or that there has been none;
 *   - media NOT listed here, and inputs the Playout no longer lists not listed either.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  __resetSourcesForTest();
  vi.restoreAllMocks();
});

const PLAYOUT: SourceCatalog = {
  sources: [
    {
      id: 'in-studio1',
      name: 'Studio 1',
      origin: 'input',
      format: '1080i5000',
      producer: { kind: 'ndi', source: 'STUDIO-PC (Cam 1)' },
    },
    {
      id: 'in-newscam',
      name: 'دوربین خبر',
      origin: 'input',
      format: 'AUTO',
      producer: { kind: 'stream', url: 'rtsp://***@10.0.0.21/live' },
    },
    {
      // `ROUTE-PLATES-01` — a Playout route: an ordinary input now the gate is gone.
      id: 'in-input3',
      name: 'ورودی ۳',
      origin: 'input',
      producer: { kind: 'route', channel: 9, layer: 12 },
      channels: [1, 2],
    },
    {
      // v1.3 rule 3 — a route with no layer: listed, and unusable.
      id: 'in-nolayer',
      name: 'No layer',
      origin: 'input',
      producer: { kind: 'route', channel: 9 },
      status: 'unusable',
      reason: ROUTE_NO_LAYER_REASON,
    },
    {
      id: 'in-gone',
      name: 'Studio 5',
      origin: 'input',
      producer: { kind: 'ndi', source: 'OLD (Cam)' },
      status: 'unavailable',
      departed: true,
      reason: "Not in the Playout's input list.",
    },
    {
      id: 'md-m-studio1',
      name: 'Studio 1 clip',
      origin: 'media',
      producer: { kind: 'media', file: 'C:/Apasai CIaB/Promo/Studio 1.mov' },
      media: { lastBoundAt: '2026-09-27T08:00:00.000Z' },
    },
  ],
  layerRange: { start: 60, end: 69 },
  inputsReadAt: '2026-09-27T08:00:00.000Z',
};

async function renderSources(catalog: SourceCatalog): Promise<HTMLElement> {
  stationSetupStub({ catalog });
  // The catalogue is a module store `App` initialises; the dialog alone reads it.
  __resetSourcesForTest();
  initSources(window.cg);
  const dialog = await renderStationSetup({ section: 'sources' });
  return sectionOf(dialog, 'sources');
}

describe('§2.C — the Playout’s inputs, read-only', () => {
  it('lists each input by NAME, KIND and format, in the Playout’s order — and nothing else', async () => {
    const section = await renderSources(PLAYOUT);
    const rows = [...section.querySelectorAll<HTMLElement>('[data-source-input]')];
    expect(rows.map((r) => r.querySelector('.cg-resource__name')?.textContent)).toEqual([
      'Studio 1',
      'دوربین خبر',
      'ورودی ۳',
      'No layer',
    ]);
    expect(rows.map((r) => r.querySelector('[data-source-kind]')?.textContent)).toEqual([
      'NDI',
      'Stream',
      'SDI',
      'SDI',
    ]);
    expect(rows[0]?.textContent).toContain('1080i5000');
    // Media are not listed here, and neither is an input the Playout no longer lists.
    expect(section.textContent).not.toContain('Studio 1 clip');
    expect(section.textContent).not.toContain('Studio 5');
  });

  it('🔴 never shows an address: no URL, no NDI name, no path', async () => {
    const section = await renderSources(PLAYOUT);
    for (const address of ['rtsp://', '10.0.0.21', 'STUDIO-PC', 'C:/Apasai']) {
      expect(section.textContent, address).not.toContain(address);
    }
    // Control: the names ARE on screen, so the absence is not a blank pane.
    expect(section.textContent).toContain('دوربین خبر');
  });

  it('marks an unusable input, with its reason on hover', async () => {
    const section = await renderSources(PLAYOUT);
    const route = section.querySelector('[data-source-unusable]');
    expect(route?.textContent).toContain('Unusable');
    expect(route?.textContent).toContain('No layer');
    expect(route?.querySelector('[title]')?.getAttribute('title')).toBe(ROUTE_NO_LAYER_REASON);
    // `ROUTE-PLATES-01` — and a Playout route WITH a layer is not unusable any more.
    expect(section.querySelectorAll('[data-source-unusable]')).toHaveLength(1);
    // Control: a usable input carries no such mark.
    const ndi = section.querySelector('[data-source-input]');
    expect(ndi?.textContent).not.toContain('Unusable');
  });

  it('says when the list was last read — and that it has not been, on a fresh station', async () => {
    const section = await renderSources(PLAYOUT);
    expect(section.querySelector('[data-sources-read]')?.textContent).toMatch(/^Last read /);
    await unmountStationSetup();
    const fresh = await renderSources({ sources: [] });
    expect(fresh.querySelector('[data-sources-read]')?.textContent).toBe('Not read yet');
    expect(fresh.querySelector('[data-sources-empty]')?.textContent).toBe(
      'No inputs from the Playout.',
    );
  });
});
