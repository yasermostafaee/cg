import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AUTH_STATION_NOT_SET_UP } from '@cg/shared-ipc';
import {
  FAKE_ADMIN,
  FAKE_OPERATOR,
  FAKE_PLAYOUT_PASSWORD,
  startFakePlayout,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';

/**
 * 🔴 `DESKTOP-APPS-01` §2E / §5 — **FIRST-RUN, END TO END**, against a real bridge started as CG
 * Control starts it (`--first-run`, `--state-home`), the fake Playout, and the AMCP mock on the
 * standard port — with `DESKTOP-APPS-01-A` folded in: only the ADDRESS is typed, and the issuer is
 * learned from the station-admin's sign-in.
 *
 * The desktop shell's one door (`set_playout_address`) is played by the harness, exactly as the
 * shell does it: run the bridge CLI's one-shot `--set-playout-address`, then restart the bridge.
 * The console calls it through `window.__TAURI_INTERNALS__.invoke`, which the harness provides —
 * the console under test is byte-for-byte the one CG Control serves.
 *
 * ⚠ The mock takes TCP 5250 because first-run writes the standard port; a runner where 5250 is
 * taken cannot run this spec, and it says so rather than passing.
 *
 * `DESKTOP-APPS-01-B` — the AMCP mock admits only what the fake Playout has TRUSTED, as a Playout
 * 2.8.54's firewall does: so the check's AMCP line says "waiting for sign-in" before the station
 * admin signs in, turns OK after, and only then do the channels appear.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');

let playout: FakePlayout | null = null;
let amcp: MockHandle | null = null;
let bridge: ChildProcess | null = null;
let stateHome: string | null = null;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

/** Start the bridge the way CG Control does, and wait until it says which auth mode it is in. */
async function startBridge(port: number): Promise<void> {
  const child = spawn(
    process.execPath,
    [
      BRIDGE_CLI,
      '--state-home',
      stateHome as string,
      '--first-run',
      '--port',
      String(port),
      '--template-serve-port',
      '0',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  bridge = child;
  let boot = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    boot += chunk.toString();
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (/WS listening on/.test(boot) && /auth: (PLAYOUT|OFF)/.test(boot)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the bridge never started; its boot output was:\n${boot}`);
}

async function stopBridge(): Promise<void> {
  const child = bridge;
  bridge = null;
  if (child === null || child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGINT');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function stationFile(name: string): unknown {
  const file = path.join(stateHome as string, '.cg-runtime', name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

test.afterEach(async () => {
  await stopBridge();
  await playout?.stop();
  await amcp?.stop();
  playout = null;
  amcp = null;
  if (stateHome !== null) fs.rmSync(stateHome, { recursive: true, force: true });
  stateHome = null;
});

test('first-run: the address, the check, a station-admin sign-in, the channel — and the station is set up', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Each step's screen, attached to the report — the surface is new and is judged by eye too.
  const shot = async (name: string): Promise<void> => {
    await test.info().attach(name, { body: await page.screenshot(), contentType: 'image/png' });
  };
  // `-01-C` C8 — a FRESH Playout: its automatic slot is unused, so the first station-admin's D9
  // read lets this machine in. (Everything here is loopback, which the real Playout would treat as
  // sealing the slot; `sealOnLoopback: false` is this suite's stand-in for a LAN address.)
  playout = await startFakePlayout({ sealOnLoopback: false });
  const fake = playout;
  amcp = await createMock({
    amcpPort: 5250,
    oscPort: 0,
    disableOsc: true,
    // Refused until the fake Playout's allow list holds this machine.
    admit: (ip) => fake.isTrusted(ip),
  }).catch((err: unknown) => {
    throw new Error(
      `the AMCP mock could not take TCP 5250 (first-run writes the standard port): ${String(err)}`,
    );
  });
  stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-first-run-'));
  const port = await freePort();
  await startBridge(port);

  // CG Control's door, played by the harness exactly as the shell plays it.
  await page.exposeFunction('__cgSetPlayoutAddress', async (address: string): Promise<string> => {
    const written = spawnSync(
      process.execPath,
      [BRIDGE_CLI, '--state-home', stateHome as string, '--set-playout-address', address],
      { encoding: 'utf8' },
    );
    if (written.status !== 0) throw new Error(written.stderr);
    await stopBridge();
    await startBridge(port);
    return written.stderr.trim();
  });
  await page.addInitScript(
    `window.__CG_BRIDGE_URL__ = ${JSON.stringify(`ws://127.0.0.1:${String(port)}`)};` +
      'window.__CG_SPLASH_DISABLED__ = true;' +
      'window.__TAURI_INTERNALS__ = { invoke: (command, args) => command === "set_playout_address"' +
      ' ? window.__cgSetPlayoutAddress(args.address) : Promise.reject(new Error("unknown command")) };',
  );
  await page.goto('/');

  // ── 1 · the one field, and the check ────────────────────────────────────────
  const firstRun = page.getByRole('dialog', { name: 'Set up CG Control' });
  await expect(firstRun).toHaveAttribute('data-first-run', 'target', { timeout: 20_000 });
  // C3 — typed as the owner typed his: no scheme. The field shows the address actually checked.
  const addressField = firstRun.getByLabel('Playout address');
  await addressField.fill(playout.baseUrl.replace(/^http:\/\//, ''));
  await firstRun.getByRole('button', { name: 'Check' }).click();
  await expect(addressField).toHaveValue(playout.baseUrl);
  await expect(firstRun.locator('[data-check="api"]')).toHaveAttribute('data-status', 'pass', {
    timeout: 20_000,
  });
  await expect(firstRun.locator('[data-check="cors"]')).toHaveAttribute('data-status', 'pass');
  // B2 — before any station admin has signed in, AMCP is not judged: it waits, neutral.
  const amcpLine = firstRun.locator('[data-check="amcp"]');
  await expect(amcpLine).toHaveAttribute('data-status', 'wait');
  await expect(amcpLine).toHaveText('CasparCG on 127.0.0.1: waiting for sign-in.');
  // …and it really was refused — the mock turned this machine away (the instrument is live).
  expect(amcp?.refusedConnections ?? 0).toBeGreaterThan(0);
  await shot('1-address-and-check');

  await firstRun.getByRole('button', { name: 'Connect' }).click();
  await expect(firstRun).toHaveAttribute('data-first-run', 'channel', { timeout: 30_000 });
  // Only the address was written — no issuer was typed or stored.
  expect(stationFile('bridge-playout.json')).toEqual({
    auth: 'playout',
    playout: { address: playout.baseUrl },
  });

  // ── 2 · sign in: before adoption, only a station-admin is accepted ─────────
  const signIn = async (username: string): Promise<void> => {
    await firstRun.locator('#cg-first-run-user').fill(username);
    await firstRun.locator('#cg-first-run-pass').fill(FAKE_PLAYOUT_PASSWORD);
    await firstRun.getByRole('button', { name: 'Sign in' }).click();
  };
  await signIn(FAKE_OPERATOR.username);
  await expect(firstRun.getByText(AUTH_STATION_NOT_SET_UP)).toBeVisible({ timeout: 20_000 });
  await shot('2-sign-in-refused-before-adoption');
  expect(
    (stationFile('bridge-playout.json') as { playout: { issuer?: string } }).playout.issuer,
  ).toBeUndefined();

  // C5 — the refused operator reached no D9: nothing is allowed, nothing pending, nothing sealed.
  expect(fake.trustedSources).toEqual([]);
  expect(fake.sealed).toBe(false);

  await signIn(FAKE_ADMIN.username);
  // C4 — the station admin's sign-in reads D9 at once, which lets this machine in; the check
  // runs again and AMCP is OK…
  await expect(amcpLine).toHaveAttribute('data-status', 'pass', { timeout: 30_000 });
  await expect(amcpLine).toContainText('answered VERSION: 2.3.2');
  expect(fake.trustedSources).toEqual(['127.0.0.1']);
  await shot('2b-signed-in-amcp-ok');
  // ── 3 · …and only then the Playout's channels, in this account's grant ─────
  const programme = firstRun.getByRole('button', { name: /آپاسای/ });
  await expect(programme).toBeVisible({ timeout: 20_000 });
  // The fake admin's grant names channel 1 only; channel 2 is in the catalogue and not offered.
  await expect(firstRun.getByRole('button', { name: /کانال دوم/ })).toHaveCount(0);
  // The issuer was learned from that sign-in, and persisted.
  expect(
    (stationFile('bridge-playout.json') as { playout: { issuer?: string } }).playout.issuer,
  ).toBe(playout.issuer);
  await programme.click();

  // ── 4 · the serve address is detected; the station is written ─────────────
  await expect(firstRun.locator('#cg-first-run-serve')).not.toHaveValue('', { timeout: 20_000 });
  await shot('3-channel-and-serve-address');
  await firstRun.getByRole('button', { name: 'Use this channel' }).click();
  await expect(firstRun).toHaveCount(0, { timeout: 20_000 });

  expect(stationFile('bridge-fixed-layers.json')).toMatchObject({
    channel: 1,
    start: 80,
    count: 20,
  });
  expect(stationFile('bridge-connection.json')).toMatchObject({
    servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
  });
});

/*
  🔴 `DESKTOP-APPS-01-D` i — **RIGHT AFTER FIRST-RUN THE CONTROLS ARE THERE, WITH NO RELOAD.**

  The owner's channel-2 set-up on the installed build: the tab read `کانال دوم (تست CG) · READ
  ONLY` and the Layers tab had no controls until a reload. First-run writes the connection and then
  the bank; the permitted channels were pushed on the first and not on the second, so the console
  kept the bank-less answer (channel 1). The station admin here holds channels 1 AND 2 — the real
  `cg-admin`'s grant — so only the DECLARED channel decides, which is the case that failed.
*/
test('first-run on channel 2: the Layers tab is operable at once, with no reload — control: an operator without the grant is READ ONLY', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  playout = await startFakePlayout({
    sealOnLoopback: false,
    grants: {
      admin: [
        { host: '127.0.0.1', channel: 1 },
        { host: '127.0.0.1', channel: 2 },
      ],
    },
  });
  const fake = playout;
  amcp = await createMock({
    amcpPort: 5250,
    oscPort: 0,
    disableOsc: true,
    admit: (ip) => fake.isTrusted(ip),
  }).catch((err: unknown) => {
    throw new Error(`the AMCP mock could not take TCP 5250: ${String(err)}`);
  });
  stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-first-run-'));
  const port = await freePort();
  await startBridge(port);
  await page.exposeFunction('__cgSetPlayoutAddress', async (address: string): Promise<string> => {
    const written = spawnSync(
      process.execPath,
      [BRIDGE_CLI, '--state-home', stateHome as string, '--set-playout-address', address],
      { encoding: 'utf8' },
    );
    if (written.status !== 0) throw new Error(written.stderr);
    await stopBridge();
    await startBridge(port);
    return written.stderr.trim();
  });
  const bridgeUrl = `window.__CG_BRIDGE_URL__ = ${JSON.stringify(`ws://127.0.0.1:${String(port)}`)};`;
  await page.addInitScript(
    bridgeUrl +
      'window.__CG_SPLASH_DISABLED__ = true;' +
      'window.__TAURI_INTERNALS__ = { invoke: (command, args) => command === "set_playout_address"' +
      ' ? window.__cgSetPlayoutAddress(args.address) : Promise.reject(new Error("unknown command")) };',
  );
  await page.goto('/');

  const firstRun = page.getByRole('dialog', { name: 'Set up CG Control' });
  await expect(firstRun).toHaveAttribute('data-first-run', 'target', { timeout: 20_000 });
  await firstRun.getByLabel('Playout address').fill(playout.baseUrl);
  await firstRun.getByRole('button', { name: 'Check' }).click();
  await expect(firstRun.locator('[data-check="cors"]')).toHaveAttribute('data-status', 'pass', {
    timeout: 20_000,
  });
  await firstRun.getByRole('button', { name: 'Connect' }).click();
  await expect(firstRun).toHaveAttribute('data-first-run', 'channel', { timeout: 30_000 });

  // The page from here on must be the SAME page: a mark that a reload would wipe.
  await page.evaluate(() => {
    (window as unknown as { cgNoReload?: number }).cgNoReload = 1;
  });
  await firstRun.locator('#cg-first-run-user').fill(FAKE_ADMIN.username);
  await firstRun.locator('#cg-first-run-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await firstRun.getByRole('button', { name: 'Sign in' }).click();
  const channelTwo = firstRun.getByRole('button', { name: /کانال دوم/ });
  await expect(channelTwo).toBeVisible({ timeout: 30_000 });
  await channelTwo.click();
  await expect(firstRun.locator('#cg-first-run-serve')).not.toHaveValue('', { timeout: 20_000 });
  await firstRun.getByRole('button', { name: 'Use this channel' }).click();
  await expect(firstRun).toHaveCount(0, { timeout: 20_000 });
  expect(stationFile('bridge-fixed-layers.json')).toMatchObject({ channel: 2 });

  // 🔴 The property: operable NOW — no READ ONLY, the rows and their verbs — and no reload.
  const strip = page.getByRole('tablist', { name: 'Channels' });
  await expect(strip.getByRole('tab').first()).toContainText('کانال دوم', { timeout: 20_000 });
  await expect(strip.getByRole('tab').first()).not.toContainText('READ ONLY');
  await expect(page.getByLabel('Operating state')).toHaveCount(0);
  const row = page.locator('[data-layer="99"]').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByRole('button', { name: 'LOAD' })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { cgNoReload?: number }).cgNoReload)).toBe(
    1,
  );

  // CONTROL — the same station, an operator whose grant is channel 1 only: READ ONLY, once.
  // A fresh context shares nothing with the admin's page — no stored session, no retained stack.
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const view = await other.newPage();
    await view.addInitScript(bridgeUrl + 'window.__CG_SPLASH_DISABLED__ = true;');
    await view.goto('/');
    const user = view.locator('#cg-signin-user');
    await expect(user).toBeVisible({ timeout: 20_000 });
    await user.fill(FAKE_OPERATOR.username);
    await view.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
    await view.getByRole('button', { name: 'ورود' }).click();
    await expect(user).toHaveCount(0, { timeout: 20_000 });
    await expect(
      view.getByRole('tablist', { name: 'Channels' }).getByRole('tab').first(),
    ).toContainText('READ ONLY', { timeout: 20_000 });
  } finally {
    await other.close();
  }
});

test('CONTROL — a bridge that is not an installed station never shows first-run', async ({
  page,
}) => {
  stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-first-run-'));
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [
      BRIDGE_CLI,
      '--state-home',
      stateHome,
      '--port',
      String(port),
      '--template-serve-port',
      '0',
      '--amcp-port',
      '1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  bridge = child;
  let boot = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    boot += chunk.toString();
  });
  await expect.poll(() => /WS listening on/.test(boot), { timeout: 30_000 }).toBe(true);
  await page.addInitScript(
    `window.__CG_BRIDGE_URL__ = ${JSON.stringify(`ws://127.0.0.1:${String(port)}`)};` +
      'window.__CG_SPLASH_DISABLED__ = true;',
  );
  await page.goto('/');
  // Positive control: the console is up and talking to this bridge (its bank shows).
  await expect(page.getByText(/CHANNEL 1/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('dialog', { name: 'Set up CG Control' })).toHaveCount(0);
});
