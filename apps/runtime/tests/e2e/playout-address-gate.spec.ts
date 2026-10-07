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
      /*
        The page closed — or Connect RELOADED it — with this request in flight: the request belongs
        to a page that is gone. Playwright says it two ways (`has been closed`; `Fetch response has
        been disposed`, met once in four local runs on 2026-10-03, at the reload). Anything else is
        real.
      */
      if (!/has been closed|has been disposed/.test(String(err))) throw err;
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

/**
 * 🔴 `B-317` — CG Bridge at `hostPort` ANSWERS the gate's probe: the FIRST socket there gets its
 * `bridge.capabilities` answered; every later one is closed, so the console that then connects meets
 * nobody (as {@link asCgControl}'s sockets do). Registered after that catch-all, so it wins here.
 */
async function bridgeAnswersOnce(page: Page, hostPort: string, dialed: string[]): Promise<void> {
  let answered = false;
  await page.routeWebSocket(`ws://${hostPort}/`, (ws) => {
    dialed.push(ws.url());
    if (answered) {
      ws.close();
      return;
    }
    answered = true;
    ws.onMessage((message) => {
      const frame = JSON.parse(String(message)) as { type?: string; id?: string; channel?: string };
      if (frame.type === 'request' && frame.channel === 'bridge.capabilities') {
        ws.send(
          JSON.stringify({
            type: 'response',
            id: frame.id,
            payload: { channels: [], bridgeVersion: '0.0.0' },
          }),
        );
      }
    });
  });
}

const bare = (urls: readonly string[]): string[] => urls.map((u) => u.replace(/\/$/, ''));

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

  /*
    🔴 `B-317` — nothing answers there yet: Connect asks once (its probe is the one socket) and says
    WHERE it looked; it saves nothing and the gate stays — the owner was left in a NOT CONNECTED he could
    only escape by setting up again.
  */
  await connect.click();
  await expect(gate.getByRole('status')).toHaveText(
    `CG Bridge is not answering at ${EXAMPLE}:5280.`,
    { timeout: 20_000 },
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)).toBeNull();
  expect(bare(dialed)).toEqual([`ws://${EXAMPLE}:5280`]);

  // CONTROL — CG Bridge answers there now: the same Connect saves and connects.
  await bridgeAnswersOnce(page, `${EXAMPLE}:5280`, dialed);
  await connect.click();

  /*
    Saved, normalised — and the console started again aimed at CG Bridge on the Playout's host: the
    THIRD socket there (the refused probe, the answered probe, then the console's own after the reload).
  */
  await expect(gate).toHaveCount(0, { timeout: 20_000 });
  await expect
    .poll(() => bare(dialed).filter((url) => url === `ws://${EXAMPLE}:5280`).length, {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(3);
  expect(
    JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)) ?? 'null'),
  ).toEqual({ playoutAddress: `http://${EXAMPLE}:8080` });

  // Its socket is closed here (never dialled): the one line names WHERE it looked.
  const banner = page.getByRole('alert', { name: 'Bridge disconnected' });
  await expect(banner).toContainText(`CG Bridge not reachable at ${EXAMPLE}:5280`, {
    timeout: 20_000,
  });

  // The way back: this console forgets its station and asks again.
  await banner.getByRole('button', { name: 'Set up again' }).click();
  await expect(gate.getByRole('dialog', { name: 'Set up CG Control' })).toBeVisible({
    timeout: 20_000,
  });
  expect(await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)).toBeNull();
});

test('🔴 R-080 + R-082 — the question says CG Bridge may stay empty, on the one sign-in card: the mark, the name, the version', async ({
  page,
}) => {
  const dialed: string[] = [];
  await asCgControl(page, dialed);
  const gate = page.locator('[data-playout-address-gate]');
  const card = gate.getByRole('dialog', { name: 'Set up CG Control' });
  await expect(card).toBeVisible({ timeout: 20_000 });

  // R-080 — empty, `Found automatically`, and ONE hint line under the field.
  const bridge = gate.getByLabel('CG Bridge address');
  await expect(bridge).toHaveValue('');
  await expect(bridge).toHaveAttribute('placeholder', 'Found automatically');
  const hint = gate.locator('[data-bridge-address-hint]');
  await expect(hint).toHaveText('Leave empty unless CG Bridge runs on a separate server.');
  const [fieldBox, hintBox] = [await bridge.boundingBox(), await hint.boundingBox()];
  if (fieldBox === null || hintBox === null) throw new Error('the field and its hint need a box');
  expect(hintBox.y, 'the hint sits UNDER its field').toBeGreaterThanOrEqual(
    fieldBox.y + fieldBox.height,
  );

  /*
    R-082 — measured in a real engine (golden rule 12c): the APASAI mark is DRAWN (a box, not an
    empty span), its bars are relit for the dark ground from the splash's token, and the card says
    the product and this build's version. The ground is the splash's.
  */
  const mark = card.locator('[data-apasai-mark] svg');
  const markBox = await mark.boundingBox();
  expect(markBox?.height ?? 0, 'the mark is drawn').toBeGreaterThan(20);
  const bars = await card
    .locator('[data-apasai-mark] .apasai-bars')
    .evaluate((g) => getComputedStyle(g).fill);
  expect(bars).toBe('rgb(238, 243, 249)'); // --r-splash-logo-bars
  await expect(card.locator('[data-signin-brand]')).toContainText('CG Control');
  await expect(card.locator('[data-app-version]')).toHaveText(/^Version \d+\.\d+\.\d+/);
  const ground = await gate.evaluate((g) => getComputedStyle(g).backgroundColor);
  expect(ground).toBe('rgb(26, 33, 45)'); // --r-splash-bg
  expect(dialed).toEqual([]);
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
  // `B-317` — CG Bridge answers on the separate server (and only there).
  await bridgeAnswersOnce(page, '192.0.2.30:5281', dialed);
  await gate.getByRole('button', { name: 'Connect' }).click();

  /*
    Saved, and the console started again aimed at CG Bridge there: the gate gone, and the SECOND socket
    there (the answered probe, then the console's own after the reload). Waiting on the first alone read
    the record mid-reload ("Execution context was destroyed", the Linux run on `77451b5e`).
  */
  await expect(gate).toHaveCount(0, { timeout: 20_000 });
  await expect
    .poll(() => bare(dialed).filter((url) => url === 'ws://192.0.2.30:5281').length, {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(2);
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
