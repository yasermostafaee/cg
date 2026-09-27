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
import { cssColour } from './fixtures/runtime.js';

/**
 * 🔴 `UI-POLISH-01` G — **ON AIR OR NOT, IN A REAL BROWSER, FROM A REAL BRIDGE READING THE FAKE
 * PLAYOUT'S D4.** `output` alone gives the colour; the playlist is a neutral tag; `unknown`, and a
 * Playout we cannot reach, give no dot at all.
 *
 * Paint is not a jsdom fact (golden rule 12), so every colour here is read from the engine: the
 * dot's fill and ring, the PROGRAM head's ink, the tag's ink. The wiring is `channelAir.dom.test.ts`;
 * the bridge's cadence and parsing are `station-channels-discovery.integration.test.ts`.
 *
 * 🔴 **ISOLATION BY EXPLICIT FLAGS** (`playout-authz.spec.ts`'s rule): every persisted path is a
 * scratch file, the CasparCG host is forced to `127.0.0.1` on port 1 where nothing answers, and
 * every listening port is ephemeral. Nothing here reaches a real Playout or CasparCG.
 *
 * The station declares channels 1 and 2 (the fake's catalogue: 1 on air and playing, 2 off and
 * stopped), and the station-admin is granted both — the real `cg-admin`'s shape.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');

let playout: FakePlayout | null = null;
let bridge: ChildProcess | null = null;
let stateDir: string | null = null;

async function startStation(): Promise<{ bridgeUrl: string; fake: FakePlayout }> {
  const both = [
    { host: '127.0.0.1', channel: 1 },
    { host: '127.0.0.1', channel: 2 },
  ];
  const fake = await startFakePlayout({ grants: { admin: both } });
  playout = fake;
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-air-'));
  const scratch = (name: string): string => path.join(stateDir as string, name);
  fs.writeFileSync(
    scratch('fixed.json'),
    JSON.stringify({
      banks: [
        { channel: 1, start: 80, count: 4 },
        { channel: 2, start: 80, count: 4 },
      ],
    }),
    'utf8',
  );
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
  let boot = '';
  bridge.stderr?.on('data', (chunk: Buffer) => {
    boot += chunk.toString();
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const match = /WS listening on (ws:\/\/[^\s]+)/.exec(boot);
    if (match?.[1] !== undefined && boot.includes('auth: PLAYOUT')) {
      return { bridgeUrl: match[1], fake };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the bridge never started in auth mode; its boot output was:\n${boot}`);
}

test.afterEach(async () => {
  bridge?.kill('SIGINT');
  bridge = null;
  await playout?.stop();
  playout = null;
  if (stateDir !== null && fs.existsSync(stateDir)) {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  stateDir = null;
});

async function open(page: Page): Promise<FakePlayout> {
  const { bridgeUrl, fake } = await startStation();
  await page.addInitScript(
    `window.__CG_BRIDGE_URL__ = ${JSON.stringify(bridgeUrl)}; window.__CG_SPLASH_DISABLED__ = true;`,
  );
  await page.goto('/');
  const user = page.locator('#cg-signin-user');
  await expect(user).toBeVisible({ timeout: 20_000 });
  await user.fill(FAKE_ADMIN.username);
  await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(user).toHaveCount(0, { timeout: 20_000 });
  // The names arrive with the sign-in's D4 read: the instrument is live before anything is judged.
  await expect(tab(page, 1)).toContainText('آپاسای', { timeout: 20_000 });
  return fake;
}

const strip = (page: Page): Locator => page.getByRole('tablist', { name: 'Channels' });
const tab = (page: Page, channel: number): Locator =>
  strip(page).locator(`#channel-${String(channel)}`);
const dot = (scope: Locator): Locator => scope.locator('[data-output-dot]');
const headTags = (page: Page): Locator => page.getByTestId('monitor-head-tag');
/** A change on the fake reaches the console at the bridge's next read: ≤ 5 s floor + 1 s tick. */
const NEXT_READ = { timeout: 15_000 };

async function shot(page: Page, name: string): Promise<void> {
  const file = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path: file });
  await test.info().attach(name, { path: file, contentType: 'image/png' });
}

test('G — the dot and the PROGRAM head follow `output`; the playlist is a neutral tag; unknown and unreachable give no dot', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fake = await open(page);
  const onAir = await cssColour(page, 'var(--r-onair)');

  // ON AIR (channel 1): a FILLED disc in the air green. OFF (channel 2): a hollow neutral RING.
  await expect(dot(tab(page, 1))).toHaveAttribute('data-output-dot', 'on-air');
  await expect(dot(tab(page, 1))).toHaveCSS('background-color', onAir);
  await expect(dot(tab(page, 2))).toHaveAttribute('data-output-dot', 'off');
  await expect(dot(tab(page, 2))).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(dot(tab(page, 2))).toHaveCSS('border-top-style', 'solid');
  await expect(dot(tab(page, 2))).toHaveCSS(
    'border-top-color',
    await cssColour(page, 'var(--r-text-muted)'),
  );
  // Its words, for a screen reader and on hover.
  await expect(dot(tab(page, 2))).toHaveAttribute('aria-label', 'Off air · Playlist stopped');

  // THE PROGRAM HEAD — green only while ON AIR.
  const show = page.getByRole('button', { name: 'Show monitors' });
  if (await show.count()) await show.first().click();
  const head = page.locator('.cg-monitor-label--pgm');
  await expect(head).toHaveAttribute('data-output', 'on-air');
  await expect(head).toHaveCSS('color', onAir);
  await expect(headTags(page)).toHaveText(['Playing']);
  await shot(page, 'g-1-channel-1-on-air');

  // Channel 2 — OFF: a neutral head, the playlist's tag beside it, in neutral ink.
  await tab(page, 2).click();
  await expect(head).toHaveAttribute('data-output', 'off');
  await expect(head).not.toHaveCSS('color', onAir);
  await expect(headTags(page)).toHaveText(['Playlist stopped']);
  await expect(headTags(page).first()).not.toHaveCSS('color', onAir);
  await shot(page, 'g-2-channel-2-off');

  // 🔴 THE OWNER'S MULTI-BOX CASE — the output goes ON AIR while the playlist stays STOPPED.
  fake.setChannelState(2, { output: 'on-air' });
  await expect(head).toHaveAttribute('data-output', 'on-air', NEXT_READ);
  await expect(head).toHaveCSS('color', onAir);
  await expect(dot(tab(page, 2))).toHaveCSS('background-color', onAir);
  await expect(headTags(page)).toHaveText(['Playlist stopped']);
  // The tag sits RIGHT AFTER the word it qualifies — not spread across the head bar.
  const gap = await page.evaluate(() => {
    const word = document.querySelector('.cg-monitor-label--pgm')?.getBoundingClientRect();
    const tag = document.querySelector('[data-testid="monitor-head-tag"]')?.getBoundingClientRect();
    return word === undefined || tag === undefined ? Number.NaN : tag.left - word.right;
  });
  expect(gap, 'the tag drifted away from PROGRAM').toBeGreaterThanOrEqual(0);
  expect(gap, 'the tag drifted away from PROGRAM').toBeLessThanOrEqual(16);
  await shot(page, 'g-3-multi-box-on-air-playlist-stopped');

  // Only the PLAYLIST changes — to a word outside the table: the tag moves, no colour does.
  fake.setChannelState(2, { playlist: 'rehearsal' });
  await expect(headTags(page)).toHaveText(['rehearsal'], NEXT_READ);
  await expect(head).toHaveCSS('color', onAir);
  await expect(dot(tab(page, 2))).toHaveAttribute('data-output-dot', 'on-air');

  // UNKNOWN: no dot, a neutral head, and the `Output unknown` tag.
  fake.setChannelState(2, { output: 'unknown' });
  await expect(dot(tab(page, 2))).toHaveCount(0, NEXT_READ);
  await expect(head).toHaveAttribute('data-output', 'unknown');
  await expect(head).not.toHaveCSS('color', onAir);
  await expect(headTags(page)).toHaveText(['Output unknown', 'rehearsal']);
  // CONTROL — the instrument still sees the other channel's dot.
  await expect(dot(tab(page, 1))).toHaveCount(1);

  // A PLAYOUT WE CANNOT REACH: no dot anywhere — never a grey ring. (Channel 1 had one above.)
  await fake.goOffline();
  await expect(strip(page).locator('[data-output-dot]')).toHaveCount(0, NEXT_READ);
  await expect(head).not.toHaveCSS('color', onAir);
  await expect(headTags(page)).toHaveText(['Output unknown']);
});

test('G — `unlicensed`: the amber mark AFTER the name and the dot BEFORE it, and the line in that channel’s view only', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const fake = await open(page);
  fake.setChannelState(2, { playlist: 'unlicensed' });

  // On channel 1's view: channel 2's tab carries BOTH its dot and the amber mark, in that order.
  const two = tab(page, 2);
  await expect(two.locator('[data-tab-signal="warning"]')).toHaveCount(1, NEXT_READ);
  await expect(dot(two)).toHaveAttribute('data-output-dot', 'off');
  const order = await two.evaluate((el) =>
    [...el.querySelectorAll('[data-output-dot], bdi, [data-tab-signal]')].map((n) =>
      n.hasAttribute('data-output-dot') ? 'dot' : n.tagName === 'BDI' ? 'name' : 'mark',
    ),
  );
  expect(order).toEqual(['dot', 'name', 'mark']);
  // Both READ: the dot and the mark are separate boxes, neither covering the other.
  const boxes = await two.evaluate((el) => {
    const r = (sel: string): DOMRect | undefined => el.querySelector(sel)?.getBoundingClientRect();
    const d = r('[data-output-dot]');
    const m = r('[data-tab-signal]');
    return {
      dotRight: d?.right ?? 0,
      dotW: d?.width ?? 0,
      markLeft: m?.left ?? 0,
      markW: m?.width ?? 0,
    };
  });
  expect(boxes.dotW).toBeGreaterThan(0);
  expect(boxes.markW).toBeGreaterThan(0);
  expect(boxes.markLeft).toBeGreaterThan(boxes.dotRight);
  // The other channel's view shows ONLY the mark — not the line.
  await expect(page.locator('[data-unlicensed-line]')).toHaveCount(0);
  await strip(page).screenshot({ path: test.info().outputPath('g-4-tab-dot-and-mark.png') });
  await test.info().attach('g-4-tab-dot-and-mark', {
    path: test.info().outputPath('g-4-tab-dot-and-mark.png'),
    contentType: 'image/png',
  });

  // CONTROL — channel 2's own view carries the one line.
  await two.click();
  await expect(page.locator('[data-unlicensed-line]')).toContainText(
    'Unlicensed in the Playout — this channel is cleared every minute.',
  );
  await shot(page, 'g-5-unlicensed-line');
});

test('G — Change channel… rows and Station setup’s subtitle carry the dot before the name', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await open(page);
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  await expect(setup).toBeVisible();
  // The subtitle: channel 1 is selected and on air.
  await expect(setup.locator('[data-output-dot]').first()).toHaveAttribute(
    'data-output-dot',
    'on-air',
  );
  await setup
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Channel/ })
    .click();
  await setup.getByRole('button', { name: 'Change channel…' }).click();
  const row = (channel: number): Locator =>
    setup.locator(`.cg-channel-row[data-channel="${String(channel)}"]`);
  await expect(dot(row(1))).toHaveAttribute('data-output-dot', 'on-air', { timeout: 20_000 });
  await expect(dot(row(2))).toHaveAttribute('data-output-dot', 'off');
  await expect(dot(row(1))).toHaveCSS('background-color', await cssColour(page, 'var(--r-onair)'));
  await shot(page, 'g-6-change-channel-rows');
});
