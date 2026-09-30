import { spawn, type ChildProcess } from 'node:child_process';
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
import { stopChild } from './fixtures/child-process.js';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B3 — **THE INSTALL GUIDE'S SCREENSHOTS OF CG CONTROL, TAKEN FROM THE REAL
 * CONSOLE**: CG Control's first question (the Playout's address), then first-run's sign-in and its
 * channel choice, as `playout-address-gate.spec.ts` and `first-run.spec.ts` drive them.
 *
 * `CENTRAL-BRIDGE-01` — picture 1 is CG Control's own Playout-address gate, which only its own page
 * (`http://tauri.localhost`) shows: the built console is served there by `page.route`, on a page of
 * its own whose every socket is recorded and closed, never dialled. Pictures 2 and 3 are first-run
 * against a real bridge given its Playout as CG Bridge's configuration gives it, the fake Playout,
 * and the AMCP mock.
 *
 * It runs only when `CG_GUIDE_SHOTS` names a folder, and writes its PNGs there
 * (`docs/release/<version>/img/`, then built into the guide by `tools/release`); otherwise it is
 * skipped, so the suite pays nothing for it.
 *
 * NO REAL ADDRESS, TOKEN OR PASSWORD in any picture: the address shown is a documentation address
 * (RFC 5737), typed for the picture and never dialled; the password is masked by its field; each
 * picture is one section of a dialog, so the check's lines (which name the fake's loopback address)
 * and the serve address (this machine's own LAN address) are in none of them.
 */

const OUT = process.env.CG_GUIDE_SHOTS;
test.skip(OUT === undefined || OUT === '', 'only when building the install guide (CG_GUIDE_SHOTS)');
test.describe.configure({ mode: 'serial' });
// Two device pixels per CSS pixel: the pictures are printed small, and stay sharp.
test.use({ deviceScaleFactor: 2 });

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');
/** CG Control's own origin: the page it bundles its console on. */
const APP = 'http://tauri.localhost';
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

async function startBridge(port: number, playoutAddress: string): Promise<void> {
  const child = spawn(
    process.execPath,
    [
      BRIDGE_CLI,
      '--state-home',
      stateHome as string,
      '--first-run',
      // The address alone leaves auth OFF and the address unread (`first-run.spec.ts` met it).
      '--auth',
      'playout',
      '--playout-address',
      playoutAddress,
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
  await stopChild(child);
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

/*
  Two tests, because they need different things of the machine: picture 1 binds and dials nothing,
  and runs anywhere; pictures 2 and 3 take the AMCP mock onto TCP 5250 (first-run writes the
  standard port), which a machine running its own CasparCG does not have free — and there the
  station they set up would dial that core. Run the second only where 5250 is free.
*/
test('B3 — CG Control’s first question: the Playout’s address, typed', async ({ page }) => {
  const out = OUT as string;
  fs.mkdirSync(out, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 860 });
  const base = test.info().project.use.baseURL as string;
  await page.route(`${APP}/**`, async (route) => {
    const url = new URL(route.request().url());
    try {
      const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    } catch (err) {
      // The page closed with this request in flight — the test is over. Anything else is real.
      if (!/has been closed/.test(String(err))) throw err;
    }
  });
  // Nothing is dialled from this page: no socket, and no request to the example address.
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route(/^https?:\/\/192\.0\.2\.20[:/]/, (route) => route.abort('connectionrefused'));
  await page.addInitScript(() => {
    (window as unknown as { __CG_SPLASH_DISABLED__: boolean }).__CG_SPLASH_DISABLED__ = true;
  });
  await page.goto(`${APP}/`);
  const gate = page.locator('[data-playout-address-gate]');
  await gate.getByLabel('Playout address').fill(EXAMPLE_PLAYOUT);
  await expect(gate.getByRole('button', { name: 'Connect' })).toBeEnabled();
  // The card alone: its title, the field and Connect.
  await gate
    .getByRole('dialog', { name: 'Set up CG Control' })
    .screenshot({ path: path.join(out, '1-playout-address.png') });
  expect(fs.statSync(path.join(out, '1-playout-address.png')).size).toBeGreaterThan(1000);
});

test('B3 — first-run’s sign-in and channel (the AMCP mock on TCP 5250)', async ({ page }) => {
  test.setTimeout(120_000);
  const out = OUT as string;
  fs.mkdirSync(out, { recursive: true });

  // ── 2 · first-run's sign-in, as cg-admin (the password masked by its field) ──
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
  await startBridge(port, fake.baseUrl);
  await page.addInitScript(
    `window.__CG_BRIDGE_URL__ = ${JSON.stringify(`ws://127.0.0.1:${String(port)}`)};` +
      'window.__CG_SPLASH_DISABLED__ = true;',
  );
  await page.goto('/');

  const firstRun = page.getByRole('dialog', { name: 'Set up CG Control' });
  await expect(firstRun).toHaveAttribute('data-first-run', 'channel', { timeout: 20_000 });
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

  for (const name of ['2-sign-in.png', '3-channel.png']) {
    expect(fs.statSync(path.join(out, name)).size, name).toBeGreaterThan(1000);
  }
});
