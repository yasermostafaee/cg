import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  startFakePlayout,
  FAKE_BOTH_CHANNELS_OPERATOR,
  FAKE_CATALOGUE,
  FAKE_CHANNEL_TWO_OPERATOR,
  FAKE_OPERATOR,
  FAKE_VIEWER,
  FAKE_PLAYOUT_PASSWORD,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';

/**
 * 🔴 `C-038` / `R-066` bullets 3 and 4 — **THE READ-ONLY CONSOLE, IN A REAL BROWSER.**
 *
 * ── WHY THIS EXISTS AND THE DOM SPECS DO NOT REPLACE IT ─────────────────────
 *
 * Golden rule 12: a green gate is no evidence about anything that renders, and jsdom has no
 * layout at all. `viewerReadOnly.dom.test.ts` proves the WIRING — that the strip marks a
 * channel, that `layerRowActions` returns an empty list, that one pill is rendered. What it
 * cannot prove is that a real operator, looking at a real page served from the real `dist/`,
 * sees a console with no verbs on it and a sentence saying why.
 *
 * ⚠ It also closes the gap the same session's `playout-auth-reload.spec.ts` was written for:
 * a page load re-runs `main.tsx`, re-reads storage, re-creates the runtime and opens a NEW
 * socket. The permitted-channel list arrives on that socket's `auth` reply, so "the strip is
 * right after a reload" is a claim only a reload can make.
 *
 * 🔴 **ISOLATION IS ASSERTED BY EXPLICIT FLAGS, NEVER BY THEIR ABSENCE.** Every persisted
 * path is a scratch file, the CasparCG host is forced to `127.0.0.1` on a port nothing
 * answers, and both listening ports are ephemeral. `PLAYOUT-AUTH-01` breached this once by
 * omitting `--caspar-host`, where `R-010`'s file precedence then supplied a real address.
 * The full flag list is in `startStation` below and nothing here may rely on a default.
 *
 * The fake Playout generates its ES256 key in memory at start and writes nothing to disk.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');

let playout: FakePlayout | null = null;
let bridge: ChildProcess | null = null;
let stateDir: string | null = null;

async function startStation(bankChannel = 1): Promise<{ bridgeUrl: string }> {
  playout = await startFakePlayout();
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-authz-'));
  const scratch = (name: string): string => path.join(stateDir as string, name);

  /*
    🔴 **THE BANK IS SEEDED, because a station with no bank has NO ROWS — and a spec asserting
    "no verbs" against a table with no rows would pass having measured nothing.**

    Found by running it: the first draft asserted an empty verb block and went green for the
    viewer AND red for the operator, because `[data-verb-block]` did not exist at all. That is
    the vacuous-pass shape this repo keeps meeting, caught here only because the positive
    control was written beside the assertion rather than after it.

    The band is 80-99 as of the 2026-09-14 re-cut — 70 is refused, loudly and by name.
    Channel 1 so it matches `FAKE_OPERATOR`'s grant (`127.0.0.1`, channel 1) and does NOT match
    `FAKE_VIEWER`, who is granted nothing.
  */
  fs.writeFileSync(
    scratch('fixed.json'),
    JSON.stringify({ channel: bankChannel, start: 80, count: 4 }),
    'utf8',
  );

  bridge = spawn(
    process.execPath,
    [
      BRIDGE_CLI,
      '--auth',
      'playout',
      '--playout-issuer',
      playout.issuer,
      '--playout-jwks-url',
      playout.jwksUrl,
      // Every persisted path, named. None of these may fall back to `~/.cg-runtime`.
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
      '--live-layers-path',
      scratch('live.json'),
      '--audit-log-path',
      scratch('audit.ndjson'),
      '--templates-dir',
      scratch('templates'),
      // 🔴 The host and the port, forced. Nothing answers on 127.0.0.1:1.
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

  /*
    ⚠ Waits for BOTH lines. `auth: PLAYOUT` IS the positive control: a bridge that came up
    without a gate would make every assertion below vacuous, and it says which mode it is in
    itself. Stopping at the URL could read `boot` before the mode line existed.
  */
  const deadline = Date.now() + 30_000;
  let url: string | null = null;
  while (Date.now() < deadline) {
    const match = /WS listening on (ws:\/\/[^\s]+)/.exec(boot);
    if (match?.[1] !== undefined && boot.includes('auth: PLAYOUT')) {
      url = match[1];
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (url === null) {
    throw new Error(`the bridge never started in auth mode; its boot output was:\n${boot}`);
  }
  return { bridgeUrl: url };
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

/** Sign in through the real form, as the real operator would. */
async function signIn(page: Page, username: string): Promise<void> {
  const user = page.locator('#cg-signin-user');
  await expect(user).toBeVisible({ timeout: 20_000 });
  await user.fill(username);
  await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(user).toHaveCount(0, { timeout: 20_000 });
}

/*
  🔴 **WHAT THESE SPECS ASSERT ON, AND WHY IT IS NOT THE ROW VERBS.**

  The obvious assertion is `[data-verb-block]` holding no buttons. It cannot be made here: the
  layer ROWS come from `fixedLayers.state`, which needs a reachable CasparCG, and §0.3 forbids
  this suite from reaching one — the AMCP port is deliberately `127.0.0.1:1`, where nothing
  answers. Probed rather than assumed: signed in as the operator, against a station with a
  declared bank, the panel reads _"The layer list was refused"_ and there are ZERO verb blocks
  for EITHER principal. A spec asserting "no verbs" there would have passed for the viewer
  having measured nothing at all.

  So these assert on the BULK verbs, which live in the panel bar and render without CasparCG —
  measured present for the operator and absent for the viewer — plus the read-only pill and the
  channel strip. The row verbs are covered by `viewerReadOnly.dom.test.ts` at
  `layerRowActions`, the ONE list every row reads, which needs no server at all.

  ⭐ That split is the honest one: the browser proves what only a browser can (the controls are
  gone from a real page, the pill renders once, the strip marks the right tab), and the unit
  proves what needs no browser.
*/

test('🔴 a VIEWER gets a console with no verbs, and one sentence saying why', async ({ page }) => {
  const station = await startStation();
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`);
  await page.goto('/');
  await signIn(page, FAKE_VIEWER.username);

  await expect(page.getByLabel('Sign-in state')).toContainText(FAKE_VIEWER.name);

  /*
    🔴 **THE FACT, SAID ONCE.** Not "somewhere on the page" — exactly one, because `R-066`
    bullet 4 says once and a console repeating it per control would be the noise the rule
    exists to prevent.
  */
  const readOnly = page.getByLabel('Operating state');
  await expect(readOnly).toHaveCount(1, { timeout: 20_000 });
  await expect(readOnly).toContainText('READ ONLY');

  /*
    🔴 **ABSENT, NOT DISABLED**, measured in a real engine. `toHaveCount(0)` is the assertion
    golden rule 13 asks for: a disabled button is still IN the DOM, so a check for "no ENABLED
    verbs" would pass against a console full of greyed-out controls — the exact outcome the
    rule forbids.
  */
  await expect(page.getByRole('button', { name: 'Stop all on-air items' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove all items' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manual failover' })).toHaveCount(0);
  // …and the lock, which a viewer must not be able to engage against an operator.
  await expect(page.getByRole('button', { name: 'Lock' })).toHaveCount(0);

  /*
    ⭐ The channel is SHOWN and marked, never hidden. A viewer is granted no channels, so the
    bank's own channel survives the narrowing read-only — the half of bullet 3 that keeps an
    operator from mistaking "not mine" for "not there".
  */
  const strip = page.getByRole('tablist', { name: 'Channels' });
  await expect(strip.getByRole('tab')).toHaveCount(1);
  await expect(strip.getByRole('tab').first()).toContainText('READ ONLY');
});

test('🔴 an OPERATOR on the same station keeps every verb — the positive control', async ({
  page,
}) => {
  const station = await startStation();
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`);
  await page.goto('/');
  await signIn(page, FAKE_OPERATOR.username);

  await expect(page.getByLabel('Sign-in state')).toContainText(FAKE_OPERATOR.name);

  /*
    ⚠ **THIS SPEC IS WHY THE ONE ABOVE MEANS ANYTHING.** Without it, "no verbs" would also be
    what a console broken for any other reason looks like — a failed boot, a render error, a
    station with nothing declared. The same page, the same station, a different principal.
  */
  await expect(page.getByLabel('Operating state')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop all on-air items' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remove all items' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Manual failover' })).toHaveCount(1);

  // …and the granted channel is NOT marked.
  const strip = page.getByRole('tablist', { name: 'Channels' });
  await expect(strip.getByRole('tab').first()).not.toContainText('READ ONLY');
});

/*
  🔴 `B-257` — **A LOCK COVERS THE ENGAGER'S CHANNELS, AND A CONSOLE IT DOES NOT REACH DOES NOT
  PRESENT ITSELF AS LOCKED.**

  Two browser contexts, because the token is held per console: `cg-op1` (channel 1, the
  station's declared channel) and `cg-op-ch2` (channel 2 only). The wire half — channel 2's
  PANIC passing the lock, its CLEAR on channel 2 refused by the STATION (channel 2 is not this
  station's, `CHANNEL-AUTHORITY-01`) and never by the lock, a second channel-1 principal still
  meeting the lock, and channel 2 refused on channel 1 by PERMISSION — is
  `lock-scope.integration.test.ts`. This proves what only a real page can: the lock screen is up
  on one console and absent on the other.

  ⭐ Every absence on the second page has its control on the FIRST page, with the same locator:
  the lock screen and the LOCKED chip are shown there, so the instrument was live.
*/
test('🔴 B-257 — channel 1 locks its own console, and channel 2’s console is not locked', async ({
  page,
  browser,
}) => {
  const station = await startStation();
  const init = `window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`;
  await page.addInitScript(init);
  await page.goto('/');
  await signIn(page, FAKE_OPERATOR.username);

  const otherContext = await browser.newContext();
  try {
    const two = await otherContext.newPage();
    await two.addInitScript(init);
    await two.goto(`${new URL(page.url()).origin}/`);
    await signIn(two, FAKE_CHANNEL_TWO_OPERATOR.username);
    await expect(two.getByLabel('Sign-in state')).toContainText(FAKE_CHANNEL_TWO_OPERATOR.name);

    // Control — before any lock, channel 2's operator holds the role and is offered the engage.
    const engageTwo = two.locator('footer').getByRole('button', { name: /Lock/ });
    await expect(engageTwo).toHaveCount(1);

    await page.locator('footer').getByRole('button', { name: /Lock/ }).click();
    await page.getByLabel(/^Lock PIN \(/).fill('1234');
    const again = page.getByLabel('Lock PIN again');
    await again.fill('1234');
    await again.press('Enter');

    // Positive control — the engager's console IS locked, read with the locators used below.
    await expect(page.getByRole('dialog', { name: 'Lock screen' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('footer').getByText('LOCKED', { exact: true })).toHaveCount(1);

    // FIRST, proof this page HEARD the lock: its engage goes absent (the bridge holds one lock at
    // a time). Without this, the two absences below could be read before the publish arrived and
    // would pass having measured nothing.
    await expect(engageTwo).toHaveCount(0, { timeout: 20_000 });
    // THE FIX — having heard it, the console the lock does not reach reads as not locked.
    await expect(two.getByRole('dialog', { name: 'Lock screen' })).toHaveCount(0);
    await expect(two.locator('footer').getByText('LOCKED', { exact: true })).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});

/*
  🔴 `C-039` / `CHANNEL-AUTHORITY-01` — **THE STRIP NAMES THE STATION'S CHANNEL FROM THE PLAYOUT'S
  CATALOGUE, AND NEVER OFFERS THE PLAYOUT'S PROGRAMME CHANNEL.**

  The station is on CHANNEL 2 here, the shape of the test Playout: its catalogue (the fake's D4,
  `FAKE_CATALOGUE`) names channel 2 for CG and channel 1 as its own programme output. The bridge
  reads the catalogue with the signed-in console's bearer the moment it signs in, and pushes the
  answer; the strip is read off a real page served from `dist/`.

  ⭐ Each absence is read beside its control on the same page: the strip that has no programme
  channel is shown to carry the declared channel, under the catalogue's name.
*/
const PROGRAMME_NAME = FAKE_CATALOGUE.find((r) => r.casparChannel === 1)?.name ?? '';
const OURS_NAME = FAKE_CATALOGUE.find((r) => r.casparChannel === 2)?.name ?? '';

test('🔴 C-039 — channel 2 is shown under the Playout’s catalogue name, not CHANNEL 2', async ({
  page,
}) => {
  const station = await startStation(2);
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`);
  await page.goto('/');
  await signIn(page, FAKE_CHANNEL_TWO_OPERATOR.username);

  const strip = page.getByRole('tablist', { name: 'Channels' });
  const tab = strip.getByRole('tab');
  await expect(tab).toHaveCount(1, { timeout: 20_000 });
  await expect(tab.first()).toHaveText(OURS_NAME, { timeout: 20_000 });
  // The name is isolated, and the number it replaced is on the title (golden rule 11).
  await expect(tab.first().locator('bdi')).toHaveText(OURS_NAME);
  await expect(tab.first()).toHaveAttribute('title', 'Channel 2');
  await expect(tab.first()).not.toContainText('CHANNEL');
});

test('🔴 C-039 — a principal granted channels 1 AND 2 is offered channel 2 only', async ({
  page,
}) => {
  const station = await startStation(2);
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`);
  await page.goto('/');
  await signIn(page, FAKE_BOTH_CHANNELS_OPERATOR.username);
  await expect(page.getByLabel('Sign-in state')).toContainText(FAKE_BOTH_CHANNELS_OPERATOR.name);

  const strip = page.getByRole('tablist', { name: 'Channels' });
  // Control FIRST — the catalogue arrived: the declared channel carries its name.
  await expect(strip.getByRole('tab').first()).toHaveText(OURS_NAME, { timeout: 20_000 });
  // …and the Playout's programme channel, which this principal IS granted, has no tab.
  await expect(strip.getByRole('tab')).toHaveCount(1);
  await expect(strip).not.toContainText(PROGRAMME_NAME);
  await expect(strip).not.toContainText('CHANNEL 1');
});

test('🔴 the channel strip survives a RELOAD still scoped to the principal', async ({ page }) => {
  const station = await startStation();
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`);
  await page.goto('/');
  await signIn(page, FAKE_VIEWER.username);

  const strip = page.getByRole('tablist', { name: 'Channels' });
  await expect(strip.getByRole('tab').first()).toContainText('READ ONLY', { timeout: 20_000 });

  /*
    🔴 **THE RELOAD IS THE POINT.** `permittedChannels` arrives on the socket's `auth` reply,
    and a reload re-runs `main.tsx`, re-reads storage, re-creates the runtime and opens a NEW
    socket. A spec that never reloaded could not tell a strip that is right from one that was
    right ONCE — which is the lesson `playout-auth-reload.spec.ts` was written for.
  */
  for (let reload = 1; reload <= 3; reload += 1) {
    await page.reload();
    await expect(page.getByLabel('Sign-in state')).toContainText(FAKE_VIEWER.name, {
      timeout: 20_000,
    });
    await expect(
      strip.getByRole('tab').first(),
      `reload ${String(reload)} lost the read-only mark`,
    ).toContainText('READ ONLY');
    await expect(page.getByLabel('Operating state')).toHaveCount(1);
  }
});
