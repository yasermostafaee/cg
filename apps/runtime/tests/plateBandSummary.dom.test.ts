// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConsoleSourceCatalog } from '@cg/shared-ipc';
import { act } from 'react-dom/test-utils';
import { signedInStub } from './support/authStub.js';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  sectionOf,
  stationSetupStub,
  unmountStationSetup,
  type StationSetupStub,
} from './support/stationSetup.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';

/**
 * 🔴 `PLATE-BAND-01` — **STATION SETUP ▸ LIVE SOURCES SHOWS THE BAND IN FORCE, AND SAYS `default` WHEN
 * IT IS THE COMPUTED ONE.** A Playout-linked station with no band declared seats its plates in 60–79,
 * so that is what the tab reads — `60–79 · default` — never "nothing is declared" beside a take that
 * works. A declared band reads as before; with none in force the old line stays.
 *
 * The band is the bridge's to decide (`plateBandInForce`); the console reads what it is told, beside
 * the catalogue (`plateBand`). What renders is a jsdom fact here and a browser fact in
 * `e2e/plate-band.spec.ts`, which reads it off a real linked bridge.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

const OPERATOR = signedInStub('علی رضایی', [1], ['operator', 'viewer']);
const ADMIN = signedInStub('زهرا موسوی', [1], ['station-admin', 'operator', 'viewer']);

const INPUTS = [
  { id: 'in-studio-1', name: 'Studio 1', producer: { kind: 'ndi' as const, source: 'PC (Cam 1)' } },
];

async function open(
  catalog: ConsoleSourceCatalog,
  auth = OPERATOR,
): Promise<{ pane: HTMLElement; stub: StationSetupStub }> {
  const stub = stationSetupStub({ auth, catalog });
  __resetSourcesForTest();
  initSources(window.cg);
  const dialog = await renderStationSetup({ section: 'sources' });
  return { pane: sectionOf(dialog, 'sources'), stub };
}

const summary = (pane: HTMLElement): HTMLElement | null =>
  pane.querySelector<HTMLElement>('.cg-setup-band-summary');

describe('the band in force, as the tab reads it', () => {
  it('🔴 a Playout-linked station with no band declared reads `60–79 · default`', async () => {
    const { pane } = await open({
      sources: INPUTS,
      plateBand: { range: { start: 60, end: 79 }, origin: 'default' },
    });
    expect(summary(pane)?.textContent).toBe('Currently 60–79 · default · 20 layers.');
    expect(summary(pane)?.getAttribute('data-plate-band')).toBe('default');
    // It is a fact, not an invitation to declare one.
    expect(pane.textContent).not.toContain('Nothing is declared yet');
  });

  it('control — a DECLARED band reads as declared, with no `default`', async () => {
    const { pane } = await open({
      sources: INPUTS,
      layerRange: { start: 70, end: 79 },
      plateBand: { range: { start: 70, end: 79 }, origin: 'declared' },
    });
    expect(summary(pane)?.textContent).toBe('Currently 70–79 · 10 layers.');
    expect(summary(pane)?.getAttribute('data-plate-band')).toBe('declared');
    expect(summary(pane)?.textContent).not.toContain('default');
  });

  it('control — no band in force (not linked, or a layer of it reserved) keeps the old line', async () => {
    const { pane } = await open({ sources: INPUTS });
    expect(summary(pane)?.textContent).toBe('Nothing is declared yet; 60–79 is the usual choice.');
    expect(summary(pane)?.getAttribute('data-plate-band')).toBe('none');
  });

  it('a bridge from before `PLATE-BAND-01` (no `plateBand`) is read by its declared band', async () => {
    const { pane } = await open({ sources: INPUTS, layerRange: { start: 60, end: 79 } });
    expect(summary(pane)?.textContent).toBe('Currently 60–79 · 20 layers.');
  });
});

describe('a station-admin and the default', () => {
  it('the fields show the band in force — and only a press of Apply band DECLARES it', async () => {
    const { pane, stub } = await open(
      { sources: INPUTS, plateBand: { range: { start: 60, end: 79 }, origin: 'default' } },
      ADMIN,
    );
    const start = pane.querySelector<HTMLInputElement>(
      'input[aria-label="Live source band start layer"]',
    );
    const end = pane.querySelector<HTMLInputElement>(
      'input[aria-label="Live source band end layer"]',
    );
    expect(start?.value).toBe('60');
    expect(end?.value).toBe('79');
    // Nothing is written on its own: opening the tab sends nothing.
    expect(stub.sourcesSetConfig).not.toHaveBeenCalled();

    const apply = [...pane.querySelectorAll('button')].find((b) => b.textContent === 'Apply band');
    expect(apply, 'the admin has Apply band').toBeDefined();
    await act(async () => {
      apply?.click();
      // The commit awaits the bridge's answer, then adopts it: let both settle.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(stub.sourcesSetConfig).toHaveBeenCalledWith({ layerRange: { start: 60, end: 79 } });
    // Accepted, it is DECLARED now — the tab stops calling it the default.
    expect(summary(pane)?.textContent).toBe('Currently 60–79 · 20 layers.');
    expect(summary(pane)?.getAttribute('data-plate-band')).toBe('declared');
  });
});
