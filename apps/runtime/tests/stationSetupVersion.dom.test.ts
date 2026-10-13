// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B1 — **CG CONTROL NAMES ITS RELEASE IN ONE LINE**: Station setup's rail,
 * under the station it is pointed at. Neither app showed a version before this release (the splash
 * foot prints `sha · date`), so the line goes where the prompt's rule puts it.
 *
 * The version is read from this app's own `package.json` — the same file the build stamp reads — so
 * the spec fails the moment the line and the manifest could disagree.
 */

const MANIFEST_VERSION =
  // `process.cwd()`, as this suite's other jsdom specs read files: under jsdom `import.meta.url`
  // is not a `file:` URL.
  (
    JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version;

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
});

describe('CLIENT-TEST-RELEASE-01 B1 — the version line in Station setup', () => {
  it('the rail’s foot reads "Version <the manifest’s version>", on every section', async () => {
    stationSetupStub();
    for (const section of ['channel', 'servers'] as const) {
      const dialog = await renderStationSetup({ section });
      const line = dialog.querySelector<HTMLElement>('[data-testid="app-version"]');
      expect(line, section).not.toBeNull();
      expect(line?.textContent).toBe(`Version ${MANIFEST_VERSION}`);
      // Positive control: it sits in the rail's foot, beside the station card.
      expect(line?.closest('.cg-rail-foot')?.querySelector('[data-rail-station]')).not.toBeNull();
      await unmountStationSetup();
      clearPortals();
    }
  });

  it('the exact build is in its title — version · sha · date', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup();
    const title = dialog.querySelector('[data-testid="app-version"]')?.getAttribute('title') ?? '';
    expect(title).toMatch(
      new RegExp(`^${MANIFEST_VERSION.replaceAll('.', '\\.')} · [0-9a-z]+ · \\d{4}-\\d{2}-\\d{2}$`),
    );
  });

  it('it is a FACT, not a control: a Tag — not focusable, no button role', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup();
    const line = dialog.querySelector<HTMLElement>('[data-testid="app-version"]');
    expect(line?.hasAttribute('data-cg-tag')).toBe(true);
    expect(line?.tagName).toBe('SPAN');
    expect(line?.getAttribute('role')).toBeNull();
    expect(line?.tabIndex).toBe(-1);
  });
});
