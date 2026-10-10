import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  startFakePlayout,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';
import { stopChild } from './fixtures/child-process.js';

/**
 * 🔴 `B-320` (`SIGNIN-ESCAPE-01`) — **THE OWNER'S STUCK CONSOLE, IN A REAL ENGINE.**
 *
 * CG Control `0.11.4` on the owner's PC (2026-10-10): its station record named his own PC, where a CG
 * Bridge had just been installed with no Playout behind it (`http://127.0.0.1:8080`, nothing there).
 * CG Bridge answered and advertised `auth: playout`, so the console opened on the sign-in gate — and the
 * gate had no way out: no Change, no Set up again, no ✕, and the fields locked by the check's one line,
 * `127.0.0.1 answers, but nothing listens on port 8080.`, under a card that said `192.168.21.93`.
 * Reinstalling changed nothing (the record lives in the WebView2 profile).
 *
 * This is that state, exactly: the built console served as CG Control's own page (`http://tauri.localhost`,
 * the shell's IPC global present), a station record naming a CG Bridge on ANOTHER host, and a real CG
 * Bridge (the CLI, `auth: playout`) whose Playout is its own loopback with nothing listening. The page
 * reaches it at a documentation address (`192.0.2.93`, RFC 5737) relayed here to the bridge on this
 * machine — never dialled — so CG Bridge's host is not loopback to the console, as `.93` was not.
 *
 *   - `B-320` — the gate offers `Set up again` (CG Control only): this console forgets its station and
 *     starts again on the Set up page, and a good address typed there connects.
 *
 * Nothing reaches a real station: the stuck bridge's Playout and CasparCG are on `127.0.0.2` (refused),
 * the good one's Playout is the fake on this loopback, and both bridges dial CasparCG on port 1.
 * `CG_SHOTS_DIR` set: the report's before/after pictures are written there; unset, nothing is.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');
const SHOTS = process.env['CG_SHOTS_DIR'];

const APP = 'http://tauri.localhost';
const STATION_KEY = 'cg.runtime.station.v1';
/** Where the stuck station's CG Bridge is, as the console sees it (the owner's `.93`). */
const STUCK_HOST = '192.0.2.93';
/** Where the good station's CG Bridge is (the owner's `.32`). */
const GOOD_HOST = '192.0.2.32';
/** Every request to the documentation block is refused here, never dialled (the dev host intercepts TEST-NET). */
const EXAMPLE_HTTP = /^https?:\/\/192\.0\.2\.\d{1,3}[:/]/;

const children: ChildProcess[] = [];
const stateDirs: string[] = [];
let playout: FakePlayout | null = null;

test.afterEach(async () => {
  for (const child of children.splice(0)) await stopChild(child);
  await playout?.stop();
  playout = null;
  for (const dir of stateDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A port on `host` that nothing listens on: bound, read, and closed again. */
async function deadPort(host: string): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/**
 * The CG Bridge CLI in `auth: 'playout'` mode with every persisted path in a scratch folder, its WS on
 * this loopback; `playout` is its Playout flags. CasparCG is port 1 (nothing). Its URL.
 */
async function startBridge(playoutFlags: readonly string[]): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-escape-'));
  stateDirs.push(dir);
  const scratch = (name: string): string => path.join(dir, name);
  const child = spawn(
    process.execPath,
    [
      BRIDGE_CLI,
      '--auth',
      'playout',
      ...playoutFlags,
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
  children.push(child);
  let boot = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    boot += chunk.toString();
  });
  // Both lines: the URL, then the auth mode — a bridge with no gate would make this file vacuous.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const match = /WS listening on (ws:\/\/[^\s]+)/.exec(boot);
    if (match?.[1] !== undefined && boot.includes('auth: PLAYOUT')) return match[1];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the bridge never started in auth mode; its boot output was:\n${boot}`);
}

/**
 * The page's socket to `ws://<host>:5280` carried, frame for frame, to the real bridge at `target` —
 * so the console believes CG Bridge is on `host`, and nothing is dialled there.
 */
async function relay(page: Page, host: string, target: string): Promise<void> {
  await page.routeWebSocket(new RegExp(`^ws://${host.replace(/\./g, '\\.')}:5280/?$`), (ws) => {
    const upstream = new WebSocket(target);
    const waiting: string[] = [];
    upstream.addEventListener('open', () => {
      for (const frame of waiting.splice(0)) upstream.send(frame);
    });
    upstream.addEventListener('message', (event) => ws.send(String(event.data)));
    upstream.addEventListener('close', () => ws.close());
    upstream.addEventListener('error', () => ws.close());
    ws.onMessage((frame) => {
      const text = String(frame);
      if (upstream.readyState === WebSocket.OPEN) upstream.send(text);
      else waiting.push(text);
    });
    ws.onClose(() => upstream.close());
  });
}

/**
 * The built console as CG Control's own page, with `station` as its record on the FIRST load only (a
 * reload is the console's own). Every socket but the relayed ones is closed, never dialled.
 */
async function asCgControl(page: Page, station: { playoutAddress: string }): Promise<void> {
  const base = test.info().project.use.baseURL;
  if (typeof base !== 'string') throw new Error('the suite names no baseURL');
  await page.route(`${APP}/**`, async (route) => {
    const url = new URL(route.request().url());
    try {
      const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    } catch (err) {
      // A request of a page that Set up again or Connect has just reloaded.
      if (!/has been closed|has been disposed/.test(String(err))) throw err;
    }
  });
  await page.route(EXAMPLE_HTTP, (route) => route.abort('connectionrefused'));
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.addInitScript(
    ({ key, record }) => {
      (window as unknown as { __CG_SPLASH_DISABLED__: boolean }).__CG_SPLASH_DISABLED__ = true;
      // The shell's IPC global, as CG Control's webview has it; no command is answered but the one read.
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
        invoke: (command: string) =>
          command === 'keyboard_language'
            ? Promise.resolve('latin')
            : Promise.reject(new Error(`no ${command} in this test`)),
      };
      if (sessionStorage.getItem('e2e.seeded') === null) {
        sessionStorage.setItem('e2e.seeded', '1');
        localStorage.setItem(key, record);
      }
    },
    { key: STATION_KEY, record: JSON.stringify(station) },
  );
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
}

test('🔴 B-320 — stuck on a CG Bridge whose Playout does not answer: the gate offers Set up again, and a good address connects', async ({
  page,
}) => {
  // The stuck station: CG Bridge's own Playout is its loopback, and nothing listens there.
  const silent = await deadPort('127.0.0.2');
  const stuck = await startBridge(['--playout-address', `http://127.0.0.2:${String(silent)}`]);
  // The good station: a Playout that answers, behind its own CG Bridge.
  playout = await startFakePlayout();
  const good = await startBridge([
    '--playout-issuer',
    playout.issuer,
    '--playout-jwks-url',
    playout.jwksUrl,
  ]);
  const goodPort = new URL(playout.baseUrl).port;

  await page.setViewportSize({ width: 1400, height: 860 });
  await asCgControl(page, { playoutAddress: `http://${STUCK_HOST}:8080` });
  // Registered after the catch-all, so they win for their hosts.
  await relay(page, STUCK_HOST, stuck);
  await relay(page, GOOD_HOST, good);
  await page.goto(`${APP}/`);

  // ── the owner's picture 4: the gate, the card naming the station's host, the fields locked ──
  const gate = page.getByRole('dialog', { name: 'Playout sign-in' });
  await expect(gate).toBeVisible({ timeout: 30_000 });
  await expect(gate.locator('[data-playout-address]')).toHaveText(
    `http://${STUCK_HOST}:${String(silent)}`,
  );
  const line = gate.locator('[data-check="api"]');
  await expect(line).toHaveAttribute('data-status', 'fail', { timeout: 30_000 });
  await expect(page.locator('#cg-signin-user')).toBeDisabled();
  await shot(page, 'signin-escape-1-gate.png');

  // B-320 — the way out, inside CG Control, without a word of explanation.
  const again = gate.getByRole('button', { name: 'Set up again' });
  await expect(again).toBeVisible();
  // Measured in a real engine (golden rule 12c): under the way through, and inside the card.
  const [cardBox, submitBox, againBox] = await Promise.all([
    gate.boundingBox(),
    gate.getByRole('button', { name: 'Sign in', exact: true }).boundingBox(),
    again.boundingBox(),
  ]);
  if (cardBox === null || submitBox === null || againBox === null) {
    throw new Error('the card and its two controls need a box');
  }
  expect(againBox.y, 'Set up again sits under Sign in').toBeGreaterThanOrEqual(
    submitBox.y + submitBox.height,
  );
  expect(againBox.y + againBox.height, 'Set up again stays inside the card').toBeLessThanOrEqual(
    cardBox.y + cardBox.height,
  );
  // A2 — the gate's focus trap is unchanged: Tab past its last control stays on the card.
  await again.focus();
  await page.keyboard.press('Tab');
  expect(await gate.evaluate((card) => card.contains(document.activeElement))).toBe(true);
  await again.click();

  const setUp = page.locator('[data-playout-address-gate]');
  await expect(setUp.getByRole('dialog', { name: 'Set up CG Control' })).toBeVisible({
    timeout: 30_000,
  });
  expect(await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)).toBeNull();
  await shot(page, 'signin-escape-2-set-up.png');

  // …and a good address connects: the Playout's IP alone, as an operator types it.
  await setUp.getByLabel('Playout address').fill(GOOD_HOST);
  await setUp.getByRole('button', { name: 'Connect' }).click();
  await expect(setUp).toHaveCount(0, { timeout: 30_000 });
  expect(
    JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)) ?? 'null'),
  ).toEqual({ playoutAddress: `http://${GOOD_HOST}:8080` });

  // Connected to the good CG Bridge: its gate, its Playout on the card, and a sign-in that can work.
  const next = page.getByRole('dialog', { name: 'Playout sign-in' });
  await expect(next.locator('[data-playout-address]')).toHaveText(
    `http://${GOOD_HOST}:${goodPort}`,
    { timeout: 30_000 },
  );
  await expect(next.locator('[data-check="api"]')).toHaveAttribute('data-status', 'pass', {
    timeout: 30_000,
  });
  await expect(page.locator('#cg-signin-user')).toBeEnabled();
  await shot(page, 'signin-escape-3-connected.png');
});
