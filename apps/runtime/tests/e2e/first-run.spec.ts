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

/*
  `DESKTOP-APPS-01-D` i — SERIAL: two tests here take the AMCP mock onto TCP 5250 (first-run
  writes the standard port), and the suite runs `fullyParallel`, so two workers would race for it.
*/
test.describe.configure({ mode: 'serial' });

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');

let playout: FakePlayout | null = null;
let amcp: MockHandle | null = null;
let bridge: ChildProcess | null = null;
let stateHome: string | null = null;
let silent: (() => Promise<void>) | null = null;

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

/**
 * Start the bridge the way CG Control does, and wait until it says which auth mode it is in.
 * `extra` is appended to the command line.
 */
async function startBridge(port: number, extra: readonly string[] = []): Promise<void> {
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
      ...extra,
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
  await silent?.();
  playout = null;
  amcp = null;
  silent = null;
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
  /*
    `DELTA-MULTI-CHANNEL-01-A` A8 — A PICKED CHIP LOOKS PICKED. It wore nothing but `aria-pressed`:
    the chips are `secondary` Buttons and `.is-on` paints no secondary. Measured here, in a browser,
    because paint is not a jsdom fact (golden rule 12). The fill is the console's one "chosen, not
    on air" treatment, `--r-look-btn-sel-bg` #2e4e67. Polled: `.cg-btn` transitions its background.
  */
  const fill = (): Promise<string> =>
    programme.evaluate((b) => getComputedStyle(b).backgroundColor);
  const PICKED = 'rgb(46, 78, 103)';
  expect(await fill(), 'CONTROL — unpicked, the chip is not in the picked fill').not.toBe(PICKED);
  await programme.click();
  await page.mouse.move(5, 5);
  await expect(programme).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(fill, { timeout: 4000 }).toBe(PICKED);

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
  /*
    `FIELD-FIXES-01` I — CONTROL for the five-row default: this mock sends NO OSC, so the channel's
    occupancy is unknown, and the new bank hides nothing — unknown is never hidden.
  */
  const persisted = stationFile('bridge-fixed-layers.json') as {
    visibility?: Record<string, boolean>;
    low?: { visibility?: Record<string, boolean> };
  };
  expect(Object.values(persisted.visibility ?? {})).toHaveLength(20);
  expect(Object.values(persisted.visibility ?? {}).every(Boolean)).toBe(true);
  expect(Object.values(persisted.low?.visibility ?? {}).every(Boolean)).toBe(true);
  expect(stationFile('bridge-connection.json')).toMatchObject({
    servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
  });
});

/**
 * `FIELD-FIXES-01` — where the silent Playout listens. A test that needs no CasparCG dials nothing on
 * this machine's standard port: here the check's one AMCP probe goes to 127.0.0.2:5250, where
 * nothing is (CI's 127.0.0.1:5250 was as empty); the bridge's server is port 1, its OSC ephemeral.
 */
const SILENT_HOST = '127.0.0.2';

/**
 * A Playout that is OFF as the owner met it: the connection opens and nothing ever replies. Each
 * check against it lasts the full line bound, which is the window a re-check is watched in.
 *
 * On {@link SILENT_HOST}, not 127.0.0.1: the check probes CasparCG at the Playout's own host on the
 * standard port, and on a developer's machine 127.0.0.1:5250 is a running dev station's.
 */
async function startSilentPlayout(): Promise<number> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, SILENT_HOST, resolve));
  silent = async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  return (server.address() as net.AddressInfo).port;
}

/*
  🔴 `CHECK-RERUN-01` — **A RE-CHECK STARTS CLEAN, AND ONE FAULT IS SAID ONCE.** The owner's dialog,
  2026-09-24, with the Playout off: pressed Check twice, and under "Checking…" the last run's ticks
  and crosses stayed as though current; "No answer from … on port 8080." twice (the API line and
  CORS); and AMCP "waiting for sign-in" when no sign-in could work. The control for the AMCP half is
  the first test above: with the Playout ON and AMCP refused, the line DOES wait for sign-in.
*/
test('CHECK-RERUN-01: the Playout off — said once, CORS not checked, AMCP its own result; a re-check starts clean', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const apiPort = await startSilentPlayout();
  stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-first-run-'));
  const port = await freePort();
  await startBridge(port, ['--amcp-port', '1', '--osc-port', '0']);
  await page.addInitScript(
    `window.__CG_BRIDGE_URL__ = ${JSON.stringify(`ws://127.0.0.1:${String(port)}`)};` +
      'window.__CG_SPLASH_DISABLED__ = true;',
  );
  await page.goto('/');

  const firstRun = page.getByRole('dialog', { name: 'Set up CG Control' });
  await expect(firstRun).toHaveAttribute('data-first-run', 'target', { timeout: 20_000 });
  await firstRun.getByLabel('Playout address').fill(`${SILENT_HOST}:${String(apiPort)}`);
  const checkButton = firstRun.getByRole('button', { name: /^Check/ });
  await checkButton.click();

  const lines = firstRun.locator('[data-check]');
  const apiLine = firstRun.locator('[data-check="api"]');
  const corsLine = firstRun.locator('[data-check="cors"]');
  const amcpLine = firstRun.locator('[data-check="amcp"]');
  await expect(apiLine).toHaveAttribute('data-status', 'fail', { timeout: 20_000 });
  // B — the no-answer is said ONCE, on the API line; CORS is not checked, and names why.
  await expect(apiLine).toContainText(`on port ${String(apiPort)}`);
  await expect(corsLine).toHaveAttribute('data-status', 'skip');
  await expect(corsLine).toHaveText(
    'Sign-in from this console: not checked — the Playout does not answer.',
  );
  await expect(lines.filter({ hasText: `on port ${String(apiPort)}` })).toHaveCount(1);
  // B — AMCP is what it found, never a wait for a sign-in that cannot happen.
  await expect(amcpLine).not.toHaveAttribute('data-status', 'wait');
  await expect(amcpLine).not.toContainText('sign-in');
  await test.info().attach('check-rerun-1-playout-off', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // A — pressed again: every line at once to its subject, checking; no verdict of the last run.
  await checkButton.click();
  await expect(lines).toHaveCount(7);
  for (const id of ['proxy', 'route', 'amcp', 'api', 'cors', 'ports', 'topology']) {
    await expect(firstRun.locator(`[data-check="${id}"]`)).toHaveAttribute(
      'data-status',
      'checking',
    );
  }
  await expect(firstRun.locator('[data-check]:not([data-status="checking"])')).toHaveCount(0);
  await expect(apiLine).toHaveText(`The Playout on port ${String(apiPort)}`);
  await expect(checkButton).toHaveText('Checking…');
  await expect(checkButton).toBeDisabled();
  await test.info().attach('check-rerun-2-checking', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  // CONTROL — the new run's own results then fill the lines in.
  await expect(apiLine).toHaveAttribute('data-status', 'fail', { timeout: 20_000 });
  await expect(corsLine).toHaveAttribute('data-status', 'skip');
  await expect(checkButton).toHaveText('Check');
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
    await view.getByRole('button', { name: 'Sign in', exact: true }).click();
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

/*
  🔴 `FIELD-FIXES-01` I — **A NEW STATION SHOWS FIVE ROWS PER BAND, NOT THIRTY**, with the beds in
  sight at 1920 × 1080. First-run reads each channel before declaring it; a channel the tap reads
  gets templates 99–95 and beds 59–55 shown and the rest hidden — except a row whose layer already
  carries a producer (here a leftover on 2-90), which stays shown. OSC is ON here, on the standard
  port first-run writes, so the tap can read; the cases above run blind, and the station they set
  up shows every row, which is the unknown-is-never-hidden control.
*/
test('FIELD-FIXES-01 I — first-run on two channels shows five rows per band on each; a row already carrying something stays shown', async ({
  page,
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
    oscPort: 6250,
    oscHost: '127.0.0.1',
    oscHz: 20,
    channels: 2,
    admit: (ip) => fake.isTrusted(ip),
  }).catch((err: unknown) => {
    throw new Error(`the AMCP mock could not take TCP 5250 / OSC 6250: ${String(err)}`);
  });
  // A producer already on 2-90 before this station exists — a previous install's graphic, or
  // anyone's. Seeded through a raw client, with admission opened for it and closed again.
  const mock = amcp;
  mock.setAdmission(null);
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect(mock.amcpPort, '127.0.0.1', () => {
      socket.write('PLAY 2-90 "leftover"\r\n');
    });
    socket.once('data', () => {
      socket.end();
      resolve();
    });
    socket.once('error', reject);
  });
  mock.setAdmission((ip) => fake.isTrusted(ip));

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
  await page.addInitScript(
    `window.__CG_BRIDGE_URL__ = ${JSON.stringify(`ws://127.0.0.1:${String(port)}`)};` +
      'window.__CG_SPLASH_DISABLED__ = true;' +
      'window.__TAURI_INTERNALS__ = { invoke: (command, args) => command === "set_playout_address"' +
      ' ? window.__cgSetPlayoutAddress(args.address) : Promise.reject(new Error("unknown command")) };',
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
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
  await firstRun.locator('#cg-first-run-user').fill(FAKE_ADMIN.username);
  await firstRun.locator('#cg-first-run-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await firstRun.getByRole('button', { name: 'Sign in' }).click();
  const channelOne = firstRun.getByRole('button', { name: /آپاسای/ });
  const channelTwo = firstRun.getByRole('button', { name: /کانال دوم/ });
  await expect(channelTwo).toBeVisible({ timeout: 30_000 });
  await channelOne.click();
  await channelTwo.click();
  await expect(firstRun.locator('#cg-first-run-serve')).not.toHaveValue('', { timeout: 20_000 });
  await firstRun.getByRole('button', { name: 'Use these channels', exact: true }).click();
  /*
    The leftover on 2-90 is another system's content on a channel joining the set: first-run warns
    once, naming it, and "…anyway" declares. The warning is also this test's proof that the tap is
    HEARING: an occupancy read that came back unknown warns of nothing, and the bank below would
    then show every row. Waited for, never probed — `isVisible` does not wait, and read at once
    after the press it met "Setting up…" and skipped the second press (CI run 36258166170).
  */
  await expect(firstRun.locator('[data-channel-on-air="2"]')).toContainText('layer 90', {
    timeout: 20_000,
  });
  await expect(firstRun.locator('[data-channel-on-air="1"]')).toHaveCount(0);
  await firstRun.getByRole('button', { name: 'Use these channels anyway', exact: true }).click();
  await expect(firstRun).toHaveCount(0, { timeout: 30_000 });

  const layers = page.getByRole('region', { name: 'Layers' });
  const shown = async (): Promise<number[]> =>
    (
      await layers
        .locator('[data-layer]')
        .evaluateAll((rows) => rows.map((r) => Number(r.getAttribute('data-layer'))))
    ).sort((a, b) => b - a);
  const strip = page.getByRole('tablist', { name: 'Channels' });

  // Channel 1 — read empty: templates 99–95 and beds 59–55, nothing else.
  await strip.getByRole('tab', { name: /آپاسای/ }).click();
  await expect.poll(shown, { timeout: 20_000 }).toEqual([99, 98, 97, 96, 95, 59, 58, 57, 56, 55]);
  // …and five and five fit at 1920 × 1080: the beds are in sight, the list does not scroll.
  await expect(layers.locator('[data-layer="55"]')).toBeInViewport();
  const scroll = await layers.locator('[data-layer="99"]').evaluate((row) => {
    let el: HTMLElement | null = row.parentElement;
    while (el !== null && getComputedStyle(el).overflowY !== 'auto') el = el.parentElement;
    return el === null ? null : { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  expect(scroll, 'the list has a scroll container').not.toBeNull();
  expect(scroll?.scrollHeight ?? 1).toBeLessThanOrEqual(scroll?.clientHeight ?? 0);

  // CONTROL — channel 2: the same five and five, AND row 90, which carried a producer at the read.
  await strip.getByRole('tab', { name: /کانال دوم/ }).click();
  await expect
    .poll(shown, { timeout: 20_000 })
    .toEqual([99, 98, 97, 96, 95, 90, 59, 58, 57, 56, 55]);
});
