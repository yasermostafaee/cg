import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { ConsoleHttpServer, createBridge, pgmPort, type BridgeHandle } from '@cg/caspar-bridge';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import {
  startFakePgmFeed,
  type FakePgmFeed,
} from '../../../../tools/caspar-bridge/tests/support/fake-pgm-feed.js';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `FIELD-FIXES-01` H — **THE DEV STATION, THROUGH VITE.** On `pnpm dev:station` the console is
 * served by Vite's dev server — a DEVELOPMENT build — and the picture reaches it through Vite's
 * `/pgm/` proxy (`vite.config.ts`, `CG_BRIDGE_CONSOLE`) to the bridge's own console listener and
 * its relay: the path this spec drives, end to end, in a real browser. The C-016 spec
 * (`pgm-return.spec.ts`) loads the BUILT console from the bridge's listener directly, which is the
 * installed app's path and never this one — and a production build never showed the defect: the
 * picture's `<img>` lost its `src` to React StrictMode's second mount (`MonitorPanel.tsx`).
 *
 * Vite is started as the launcher starts it (`viteEnv`, `tools/dev-station`): the listener to
 * relay to, and the one console host a `localhost` page is sent to.
 *
 * Every address is chosen so a running dev station on this machine is untouched: Vite and the
 * listener on ephemeral ports, and the relay's target — server A's host, auth off — on 127.0.0.2,
 * where the fake feed takes channel 2's RULE port (`pgmPort(2)`, 9251).
 */

test.describe.configure({ mode: 'serial' });

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(here, '../..');
/** The bridge's listener serves a console of its own; the page here is Vite's. */
const CONSOLE_DIR = path.join(RUNTIME, 'dist');
const FEED_HOST = '127.0.0.2';
const CHANNEL = 2;

let feed: FakePgmFeed | null = null;
let bridge: BridgeHandle | null = null;
let listener: ConsoleHttpServer | null = null;
let vite: ViteDevServer | null = null;

test.afterEach(async () => {
  await vite?.close();
  vite = null;
  await listener?.stop();
  listener = null;
  await bridge?.close();
  bridge = null;
  await feed?.stop();
  feed = null;
});

/** The dev station, as `pnpm dev:station` composes it: bridge, its listener, and Vite in front. */
async function startDevStation(): Promise<string> {
  feed = await startFakePgmFeed({ host: FEED_HOST, port: pgmPort(CHANNEL) });
  bridge = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: FEED_HOST, amcpPort: 1, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    fixedLayers: { ...defaultFixedLayerBank(), channel: CHANNEL },
  });
  listener = new ConsoleHttpServer();
  await listener.start({ dir: CONSOLE_DIR, port: 0, pgmRelay: bridge.pgmReturn });
  // The runtime's OWN Vite config, reading the two variables exactly as the launcher sets them.
  process.env.CG_BRIDGE_CONSOLE = listener.url;
  process.env.CG_CONSOLE_HOST = '127.0.0.1';
  try {
    vite = await createServer({
      root: RUNTIME,
      configFile: path.join(RUNTIME, 'vite.config.ts'),
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
    });
  } finally {
    delete process.env.CG_BRIDGE_CONSOLE;
    delete process.env.CG_CONSOLE_HOST;
  }
  await vite.listen();
  const address = vite.httpServer?.address();
  if (address === null || address === undefined || typeof address === 'string') {
    throw new Error('Vite reported no port');
  }
  return `http://127.0.0.1:${String(address.port)}`;
}

async function openConsole(page: Page, origin: string): Promise<void> {
  const ws = (bridge as BridgeHandle).url;
  await page.addInitScript(
    ([u]) => {
      (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = u as string;
    },
    [ws],
  );
  await page.goto(`${origin}/`);
  await expect(page.getByRole('status', { name: 'Bridge link' })).toContainText(
    /BRIDGE (LIVE|ONLY)/,
    { timeout: 60_000 },
  );
}

const strip = (page: Page) => page.locator('[data-monitor-pgm-strip]');
const picture = (page: Page) => page.locator('[data-pgm-picture]');

test('🔴 through Vite’s dev server, channel 2’s programme return arrives and keeps arriving — control: the feed stopped reads "No return signal"', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const origin = await startDevStation();
  await openConsole(page, origin);

  await page.getByRole('button', { name: 'Show monitors' }).click();
  await expect(strip(page)).toHaveAttribute('data-pgm-signal', 'live', { timeout: 15_000 });
  await expect(picture(page)).toBeVisible();
  await expect
    .poll(() => picture(page).evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(64);
  // …and it KEEPS arriving: the relay calls a feed stalled when frames stop, so live seconds later
  // is frames still crossing Vite's proxy.
  await page.waitForTimeout(3000);
  await expect(strip(page)).toHaveAttribute('data-pgm-signal', 'live');
  expect(feed?.openCount(), 'one upstream, read through the relay').toBe(1);

  // CONTROL — the feed goes away: the pane says so, and shows no picture.
  await feed?.stop();
  feed = null;
  await expect(strip(page)).toContainText('No return signal', { timeout: 15_000 });
  await expect(picture(page)).toBeHidden();
});

test('🔴 a page opened at localhost is sent to 127.0.0.1, the origin the Playout admits — control: 127.0.0.1 is served directly', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const origin = await startDevStation();
  const port = new URL(origin).port;

  const sent = await page.goto(`http://localhost:${port}/?from=bookmark`);
  expect(page.url()).toBe(`http://127.0.0.1:${port}/?from=bookmark`);
  const first = sent?.request().redirectedFrom();
  expect(first?.url()).toBe(`http://localhost:${port}/?from=bookmark`);
  expect((await first?.response())?.status()).toBe(307);

  // CONTROL — the one origin itself: no redirect, the page itself.
  const direct = await page.goto(`http://127.0.0.1:${port}/`);
  expect(direct?.request().redirectedFrom()).toBeNull();
  expect(direct?.status()).toBe(200);
});
