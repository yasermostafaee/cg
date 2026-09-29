import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  FAKE_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
  startFakePlayout,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B3 — **THE INSTALL GUIDE'S SCREENSHOTS OF CG CONTROL, TAKEN FROM THE REAL
 * CONSOLE**: first-run's Playout address, its sign-in and its channel choice, as `first-run.spec.ts`
 * drives them — a real bridge started as CG Control starts it, the fake Playout, the AMCP mock.
 *
 * It runs only when `CG_GUIDE_SHOTS` names a folder, and writes its PNGs there
 * (`docs/release/<version>/img/`, then built into the guide by `tools/release`); otherwise it is
 * skipped, so the suite pays nothing for it.
 *
 * NO REAL ADDRESS, TOKEN OR PASSWORD in any picture: the address shown is a documentation address
 * (RFC 5737) typed for the picture before anything is checked; the password is masked by its field;
 * each picture is one section of the dialog, so the check's lines (which name the fake's loopback
 * address) and the serve address (this machine's own LAN address) are in none of them.
 */

const OUT = process.env.CG_GUIDE_SHOTS;
test.skip(OUT === undefined || OUT === '', 'only when building the install guide (CG_GUIDE_SHOTS)');
test.describe.configure({ mode: 'serial' });
// Two device pixels per CSS pixel: the pictures are printed small, and stay sharp.
test.use({ deviceScaleFactor: 2 });

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');
/** A documentation address (RFC 5737): what the picture shows typed, never a real Playout's. */
const EXAMPLE_PLAYOUT = '192.0.2.20';

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

test.afterEach(async () => {
  await stopBridge();
  await playout?.stop();
  await amcp?.stop();
  playout = null;
  amcp = null;
  if (stateHome !== null) fs.rmSync(stateHome, { recursive: true, force: true });
  stateHome = null;
});

test('B3 — CG Control’s first run: the Playout address, the sign-in, the channel', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const out = OUT as string;
  fs.mkdirSync(out, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 860 });

  playout = await startFakePlayout({ sealOnLoopback: false });
  const fake = playout;
  amcp = await createMock({
    amcpPort: 5250,
    oscPort: 0,
    disableOsc: true,
    admit: (ip) => fake.isTrusted(ip),
  });
  stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-guide-shots-'));
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
  await page.goto('/');

  // ── 1 · the Playout address, typed and not yet checked ─────────────────────
  const firstRun = page.getByRole('dialog', { name: 'Set up CG Control' });
  await expect(firstRun).toHaveAttribute('data-first-run', 'target', { timeout: 20_000 });
  const addressField = firstRun.getByLabel('Playout address');
  await addressField.fill(EXAMPLE_PLAYOUT);
  // The dialog's element is its full-window backdrop: the picture is its card, clipped around the
  // heading, the field and Check with the card's own margin.
  const heading = await firstRun.getByRole('heading', { name: 'Set up CG Control' }).boundingBox();
  const field = await addressField.boundingBox();
  const check = await firstRun.getByRole('button', { name: 'Check' }).boundingBox();
  if (heading === null || field === null || check === null) {
    throw new Error('the heading, the field and Check render');
  }
  const pad = 24;
  const left = Math.min(heading.x, field.x) - pad;
  const top = heading.y - pad;
  await page.screenshot({
    path: path.join(out, '1-playout-address.png'),
    clip: {
      x: left,
      y: top,
      width: check.x + check.width + pad - left,
      height: field.y + field.height + pad - top,
    },
  });

  // The real (fake) Playout, checked and connected — no picture of the check's lines.
  await addressField.fill(fake.baseUrl.replace(/^http:\/\//, ''));
  await firstRun.getByRole('button', { name: 'Check' }).click();
  await expect(firstRun.locator('[data-check="api"]')).toHaveAttribute('data-status', 'pass', {
    timeout: 20_000,
  });
  await firstRun.getByRole('button', { name: 'Connect' }).click();
  await expect(firstRun).toHaveAttribute('data-first-run', 'channel', { timeout: 30_000 });

  // ── 2 · the sign-in, as cg-admin (the password masked by its field) ────────
  const signIn = firstRun.getByRole('region', { name: 'Sign in' });
  await firstRun.locator('#cg-first-run-user').fill(FAKE_ADMIN.username);
  await firstRun.locator('#cg-first-run-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await expect(firstRun.locator('#cg-first-run-pass')).toHaveAttribute('type', 'password');
  await signIn.screenshot({ path: path.join(out, '2-sign-in.png') });
  await firstRun.getByRole('button', { name: 'Sign in' }).click();

  // ── 3 · the channel, picked ──────────────────────────────────────────────
  const programme = firstRun.getByRole('checkbox', { name: /آپاسای/ });
  await expect(programme).toBeVisible({ timeout: 30_000 });
  await programme.click();
  await page.mouse.move(5, 5);
  await expect(programme).toBeChecked();
  const channel = firstRun.getByRole('region', { name: 'Channel' });
  await page.waitForTimeout(400);
  await channel.screenshot({ path: path.join(out, '3-channel.png') });

  for (const name of ['1-playout-address.png', '2-sign-in.png', '3-channel.png']) {
    expect(fs.statSync(path.join(out, name)).size, name).toBeGreaterThan(1000);
  }
});
