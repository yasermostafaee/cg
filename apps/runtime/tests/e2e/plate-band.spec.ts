import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  startFakePlayout,
  FAKE_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';
import { stopChild } from './fixtures/child-process.js';

/**
 * 🔴 `PLATE-BAND-01` — **STATION SETUP ▸ LIVE SOURCES, ON A REAL BRIDGE LINKED TO THE PLAYOUT, READS
 * `60–79 · default` WITH NOTHING DECLARED.** The bridge is the one the installed app runs (the CLI),
 * started the way a station is — `--auth playout` naming the fake Playout, every path a scratch
 * file — and the band it computes reaches the console beside the catalogue and is drawn by a real
 * browser. The two controls are two more stations: one whose install config reserves layer 65 (no
 * default; the old line stays), and one with 70–79 DECLARED (used as declared, and not called the
 * default).
 *
 * 🔴 **ISOLATION BY EXPLICIT FLAGS** (`playout-authz.spec.ts`'s rule): every persisted path is a
 * scratch file, the CasparCG host is forced to `127.0.0.1` on port 1 where nothing answers, and every
 * listening port is ephemeral. Nothing here reaches a real Playout or CasparCG. What a take puts on the
 * wire is the bridge suite's (`plate-band.integration.test.ts`, `fake-station.integration.test.ts`).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');

let playout: FakePlayout | null = null;
let bridge: ChildProcess | null = null;
let stateDir: string | null = null;

interface Station {
  readonly bridgeUrl: string;
  /** Everything the bridge printed so far. */
  readonly boot: () => string;
}

async function startStation(config: {
  readonly reserved?: readonly { from: number; to: number }[];
  readonly declared?: { start: number; end: number };
}): Promise<Station> {
  const fake = await startFakePlayout();
  playout = fake;
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-plate-band-'));
  const scratch = (name: string): string => path.join(stateDir as string, name);
  fs.writeFileSync(
    scratch('fixed.json'),
    JSON.stringify({ banks: [{ channel: 1, start: 80, count: 4 }] }),
    'utf8',
  );
  if (config.reserved !== undefined) {
    fs.writeFileSync(scratch('reserved.json'), JSON.stringify({ ranges: config.reserved }), 'utf8');
  }
  if (config.declared !== undefined) {
    fs.writeFileSync(
      scratch('catalog.json'),
      JSON.stringify({ sources: [], layerRange: config.declared }),
      'utf8',
    );
  }
  bridge = spawn(
    process.execPath,
    [
      BRIDGE_CLI,
      '--auth',
      'playout',
      '--playout-issuer',
      fake.issuer,
      '--playout-jwks-url',
      fake.jwksUrl,
      '--playout-config-path',
      scratch('playout.json'),
      '--persist-path',
      scratch('connection.json'),
      '--fixed-layers-path',
      scratch('fixed.json'),
      '--reserved-layers-path',
      scratch('reserved.json'),
      '--source-catalog-path',
      scratch('catalog.json'),
      '--source-assignments-path',
      scratch('assignments.json'),
      '--playout-inputs-path',
      scratch('inputs.json'),
      '--bound-media-path',
      scratch('media.json'),
      '--live-layers-path',
      scratch('live.json'),
      '--audit-log-path',
      scratch('audit.ndjson'),
      '--templates-dir',
      scratch('templates'),
      '--caspar-host',
      '127.0.0.1',
      '--amcp-port',
      '1',
      '--port',
      '0',
      '--template-serve-port',
      '0',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let printed = '';
  bridge.stderr?.on('data', (chunk: Buffer) => {
    printed += chunk.toString();
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const match = /WS listening on (ws:\/\/[^\s]+)/.exec(printed);
    if (match?.[1] !== undefined && printed.includes('auth: PLAYOUT')) {
      return { bridgeUrl: match[1], boot: () => printed };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the bridge never started in auth mode; its boot output was:\n${printed}`);
}

test.afterEach(async () => {
  // Gone before its folder is: a graceful stop writes into it (`stopChild`).
  await stopChild(bridge);
  bridge = null;
  await playout?.stop();
  playout = null;
  if (stateDir !== null && fs.existsSync(stateDir)) {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  stateDir = null;
});

/** Sign in as the station-admin and open Station setup at Live sources. */
async function openLiveSources(page: Page, station: Station): Promise<Locator> {
  await page.addInitScript(
    `window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)}; window.__CG_SPLASH_DISABLED__ = true;`,
  );
  await page.goto('/');
  const user = page.locator('#cg-signin-user');
  await expect(user).toBeVisible({ timeout: 20_000 });
  await user.fill(FAKE_ADMIN.username);
  await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(user).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  await expect(setup).toBeVisible();
  await setup
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Live sources/ })
    .click();
  return setup;
}

const summary = (setup: Locator): Locator => setup.locator('.cg-setup-band-summary');

/** The band card sits under the Playout's list, below the fold: brought into view, then captured. */
async function shot(page: Page, setup: Locator, name: string): Promise<void> {
  await summary(setup).scrollIntoViewIfNeeded();
  const file = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path: file });
  await test.info().attach(name, { path: file, contentType: 'image/png' });
}

test('🔴 a Playout-linked station with nothing declared reads `60–79 · default` — and the bridge says why at boot', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const station = await startStation({});
  // The bridge's own boot line names the band in force and where it came from (ASCII by rule). It
  // is printed after the line the start waits for, so it is polled for, never read once.
  await expect
    .poll(() => station.boot())
    .toContain('plate band 60-79 by default: linked to the Playout, none declared');

  const setup = await openLiveSources(page, station);
  await expect(summary(setup)).toHaveText('Currently 60–79 · default · 20 layers.', {
    timeout: 15_000,
  });
  await expect(summary(setup)).toHaveAttribute('data-plate-band', 'default');
  // The station-admin's fields show the band in force; nothing was declared for them.
  await expect(setup.getByLabel('Live source band start layer')).toHaveValue('60');
  await expect(setup.getByLabel('Live source band end layer')).toHaveValue('79');
  await shot(page, setup, 'plate-band-1-default');
});

test('control — a station reserving layer 65 gets no default: the old line stays', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const station = await startStation({ reserved: [{ from: 65, to: 65 }] });
  await expect
    .poll(() => station.boot())
    .toContain(
      "no plate band: none declared, and this station's config claims a layer in the plate band, so no default",
    );

  const setup = await openLiveSources(page, station);
  await expect(summary(setup)).toHaveAttribute('data-plate-band', 'none', { timeout: 15_000 });
  await expect(summary(setup)).toHaveText('Nothing is declared yet; 60–79 is the usual choice.');
  await expect(setup.getByText(/· default/)).toHaveCount(0);
  await shot(page, setup, 'plate-band-2-reserved-65');
});

test('control — a DECLARED 70–79 is used as declared, and not called the default', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const station = await startStation({ declared: { start: 70, end: 79 } });
  await expect.poll(() => station.boot()).toContain('plate band 70-79 (');

  const setup = await openLiveSources(page, station);
  await expect(summary(setup)).toHaveText('Currently 70–79 · 10 layers.', { timeout: 15_000 });
  await expect(summary(setup)).toHaveAttribute('data-plate-band', 'declared');
  await shot(page, setup, 'plate-band-3-declared');
});
