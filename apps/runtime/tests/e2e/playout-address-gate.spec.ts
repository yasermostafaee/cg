import { expect, test, type Page } from '@playwright/test';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 C (D8) — **CG CONTROL'S FIRST QUESTION, IN A REAL ENGINE.**
 *
 * CG Control bundles its console and serves it on `http://tauri.localhost`; it finds CG Bridge on
 * the Playout's host, port 5280. So a fresh install has nowhere to connect until it is told where
 * the Playout is — and asks that ONE thing (`PlayoutAddressGate`), before anything else renders.
 * Given it, the console saves it (`cg.runtime.station.v1`), starts again, and dials CG Bridge on
 * that host; with nothing answering there it says so in one line, with the reason.
 *
 * The built console is served here at CG Control's own origin (`page.route` over the preview
 * server), so the page believes it is the app's — the only place the gate appears. Nothing leaves
 * this machine: the address is a documentation one (RFC 5737), every socket the console opens is
 * recorded and closed by `routeWebSocket` (never dialled), and every HTTP request to that host is
 * refused here — the dev host intercepts TEST-NET, so an un-routed probe would be a real connect.
 */

const APP = 'http://tauri.localhost';
/** A documentation address: what is typed, never a real Playout's, and never dialled. */
const EXAMPLE = '192.0.2.20';
/** Every request to the documentation block (192.0.2.0/24) is refused here, never dialled. */
const EXAMPLE_HTTP = /^https?:\/\/192\.0\.2\.\d{1,3}[:/]/;
const STATION_KEY = 'cg.runtime.station.v1';

/** Open the built console as CG Control's own page; every socket it opens lands in `dialed`. */
async function asCgControl(page: Page, dialed: string[]): Promise<void> {
  const base = test.info().project.use.baseURL;
  if (typeof base !== 'string') throw new Error('the suite names no baseURL');
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
  await page.route(EXAMPLE_HTTP, (route) => route.abort('connectionrefused'));
  await page.routeWebSocket(/.*/, (ws) => {
    dialed.push(ws.url());
    ws.close();
  });
  await page.addInitScript(() => {
    (window as unknown as { __CG_SPLASH_DISABLED__: boolean }).__CG_SPLASH_DISABLED__ = true;
    // The shell's IPC global, as CG Control's webview has it: its one read-only command answers,
    // and nothing else is ever asked here (no sign-in is made).
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: (command: string) =>
        command === 'keyboard_language'
          ? Promise.resolve('latin')
          : Promise.reject(new Error(`no ${command} in this test`)),
    };
  });
  await page.goto(`${APP}/`);
}

test('🔴 a fresh CG Control asks ONE question; given the Playout, it connects to CG Bridge on that host — and says why nothing answers', async ({
  page,
}) => {
  const dialed: string[] = [];
  await asCgControl(page, dialed);

  const gate = page.locator('[data-playout-address-gate]');
  await expect(gate.getByRole('dialog', { name: 'Set up CG Control' })).toBeVisible({
    timeout: 20_000,
  });
  // The one question, and nothing else: no bridge link, no socket opened — nowhere to connect yet.
  await expect(page.getByRole('status', { name: 'Bridge link' })).toHaveCount(0);
  expect(dialed).toEqual([]);
  const connect = gate.getByRole('button', { name: 'Connect' });
  await expect(connect).toBeDisabled();

  // Typed as an operator types it: the host alone.
  await gate.getByLabel('Playout address').fill(EXAMPLE);
  await connect.click();

  // Saved, normalised — and the console started again aimed at CG Bridge on the Playout's host.
  await expect
    .poll(() => dialed.some((url) => url.replace(/\/$/, '') === `ws://${EXAMPLE}:5280`), {
      timeout: 20_000,
    })
    .toBe(true);
  expect(
    JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)) ?? 'null'),
  ).toEqual({ playoutAddress: `http://${EXAMPLE}:8080` });
  await expect(gate).toHaveCount(0);

  // Nothing answers there: the one line names WHERE it looked, and why nothing came back.
  const banner = page.getByRole('alert', { name: 'Bridge disconnected' });
  await expect(banner).toContainText(`CG Bridge not reachable at ${EXAMPLE}:5280`, {
    timeout: 20_000,
  });
  await expect(banner).toContainText('nothing is listening on port 5280 there', {
    timeout: 20_000,
  });

  // The way back: this console forgets its station and asks again.
  await banner.getByRole('button', { name: 'Set up again' }).click();
  await expect(gate.getByRole('dialog', { name: 'Set up CG Control' })).toBeVisible({
    timeout: 20_000,
  });
  expect(await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)).toBeNull();
});

test('a separate server: CG Bridge’s own address, typed beside the Playout’s, is where the console connects', async ({
  page,
}) => {
  const dialed: string[] = [];
  await asCgControl(page, dialed);
  const gate = page.locator('[data-playout-address-gate]');
  await expect(gate).toBeVisible({ timeout: 20_000 });
  await gate.getByLabel('Playout address').fill(EXAMPLE);
  await gate.getByLabel('CG Bridge address').fill('192.0.2.30:5281');
  await gate.getByRole('button', { name: 'Connect' }).click();

  await expect
    .poll(() => dialed.some((url) => url.replace(/\/$/, '') === 'ws://192.0.2.30:5281'), {
      timeout: 20_000,
    })
    .toBe(true);
  // Never the Playout's host: CG Bridge is not there.
  expect(dialed.some((url) => url.includes(EXAMPLE))).toBe(false);
  expect(
    JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)) ?? 'null'),
  ).toEqual({ playoutAddress: `http://${EXAMPLE}:8080`, bridgeAddress: '192.0.2.30:5281' });
  await expect(page.getByRole('alert', { name: 'Bridge disconnected' })).toContainText(
    'CG Bridge not reachable at 192.0.2.30:5281',
    { timeout: 20_000 },
  );
});

test('CONTROL — an address that is not a Playout’s is refused in one line: nothing saved, nothing dialled', async ({
  page,
}) => {
  const dialed: string[] = [];
  await asCgControl(page, dialed);
  const gate = page.locator('[data-playout-address-gate]');
  await expect(gate).toBeVisible({ timeout: 20_000 });

  await gate.getByLabel('Playout address').fill(`ftp://${EXAMPLE}`);
  await gate.getByRole('button', { name: 'Connect' }).click();
  await expect(gate.getByRole('status')).toHaveText('That is not a Playout address.');
  // Still the gate, the same page: nothing saved, and no socket opened.
  await expect(gate).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)).toBeNull();
  expect(dialed).toEqual([]);
});
