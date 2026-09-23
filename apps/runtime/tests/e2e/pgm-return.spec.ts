import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { ConsoleHttpServer, createBridge, pgmPort, type BridgeHandle } from '@cg/caspar-bridge';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import {
  startFakePgmFeed,
  type FakePgmFeed,
} from '../../../../tools/caspar-bridge/tests/support/fake-pgm-feed.js';
import { disableSplash, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `C-016` / `PGM-RETURN-01` — **THE PROGRAM MONITOR SHOWS WHAT IS ON AIR**, end to end: a
 * real browser, the real console served by the bridge's own console server (the origin CG
 * Control opens, which is where the relay lives), a real in-process bridge, and a fake Playout
 * feed reproducing the Playout team's wire byte for byte.
 *
 * The fake listens on the RULE port for channel 1 — `pgmPort(1)`, 9250 — and the bridge is given
 * no port seam, so these specs prove the port rule through the whole chain rather than around it.
 * A runner where 9250 is taken cannot run this file, and it fails saying so rather than passing.
 *
 * Maps the change's scenarios: the live picture appears; a stalled feed hides the picture and
 * says so, and resumed frames clear it; no feed reads "No return signal"; hiding the monitors
 * releases the return, and the hidden boot state pulls nothing; two consoles on one channel share
 * one upstream. Serial: each test holds the one rule port.
 */

test.describe.configure({ mode: 'serial' });

const here = path.dirname(fileURLToPath(import.meta.url));
/** The built console — the same `dist` CG Control's sidecar serves. */
const CONSOLE_DIR = path.resolve(here, '../../dist');

let feed: FakePgmFeed | null = null;
let bridge: BridgeHandle | null = null;
let consoleServer: ConsoleHttpServer | null = null;

test.afterEach(async () => {
  await consoleServer?.stop();
  consoleServer = null;
  await bridge?.close();
  bridge = null;
  await feed?.stop();
  feed = null;
});

async function startFeed(): Promise<FakePgmFeed> {
  try {
    feed = await startFakePgmFeed({ port: pgmPort(1) });
  } catch (err) {
    throw new Error(
      `the fake Playout feed could not take ${String(pgmPort(1))} (channel 1's rule port) — ` +
        `this runner cannot run the PROGRAM return spec: ${String(err)}`,
    );
  }
  return feed;
}

/** A real bridge (auth off: the relay reads server A's host) and the console on its own origin. */
async function startStation(): Promise<string> {
  bridge = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    // Channel 1 is the channel on screen.
    fixedLayers: defaultFixedLayerBank(),
  });
  consoleServer = new ConsoleHttpServer();
  await consoleServer.start({ dir: CONSOLE_DIR, port: 0, pgmRelay: bridge.pgmReturn });
  return consoleServer.url;
}

async function openConsole(page: Page, url: string): Promise<void> {
  const ws = (bridge as BridgeHandle).url;
  await page.addInitScript(
    ([u]) => {
      (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = u as string;
    },
    [ws],
  );
  await page.goto(`${url}/`);
  /*
    The LINK to the bridge, not CasparCG's health: the relay and the pane depend on the first
    alone. The station here has no CasparCG, so the pill settles on `BRIDGE ONLY — NO CASPARCG`.
    ⚠ The first spelling waited for `BRIDGE LIVE` and passed on Windows only because a refused
    connect takes seconds there, leaving the pill on LIVE long enough; on Linux the refusal is
    instant and CI run 35921029508 failed at this line.
  */
  await expect(page.getByRole('status', { name: 'Bridge link' })).toContainText(
    /BRIDGE (LIVE|ONLY)/,
  );
}

const strip = (page: Page) => page.locator('[data-monitor-pgm-strip]');
const picture = (page: Page) => page.locator('[data-pgm-picture]');

test.describe('C-016 — the PROGRAM monitor shows the programme return', () => {
  /*
    The owner's path in ONE station boot — the runtime suite's CI budget is shared (P-038), so the
    live and stall scenarios ride one page rather than paying for two.
  */
  test('hidden pulls nothing; SHOW MONITORS shows the live picture; a stall hides it; hiding releases it within 2 s', async ({
    page,
  }) => {
    const f = await startFeed();
    await openConsole(page, await startStation());

    // The boot state: monitors hidden, and so nothing is pulled from the Playout.
    await page.waitForTimeout(1500);
    expect(f.connections, 'the hidden boot state pulls nothing').toHaveLength(0);

    // The positive control — the owner's press.
    await page.getByRole('button', { name: 'Show monitors' }).click();
    await expect(strip(page)).toHaveAttribute('data-pgm-signal', 'live', { timeout: 10_000 });
    await expect(strip(page)).toContainText('Return signal');
    await expect(strip(page)).not.toContainText('No return signal');
    await expect(strip(page)).toContainText('on air');
    await expect(picture(page)).toBeVisible();
    // The relayed bytes decode as the fake's own JPEG: 64 × 36.
    await expect
      .poll(() => picture(page).evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(64);
    expect(f.openCount()).toBe(1);
    // …and the one request the Playout saw is the exact one, with nothing after it.
    expect(f.connections[0]?.received.toString('latin1')).toBe(
      'GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n',
    );

    // A stall: the picture is hidden and the pane says so — never a frozen frame as if live.
    f.pause();
    await expect(strip(page)).toHaveAttribute('data-pgm-signal', 'stalled', { timeout: 6000 });
    await expect(strip(page)).toContainText('Return feed stalled');
    await expect(page.locator('[data-pgm-screen]')).toContainText('Return feed stalled');
    await expect(picture(page)).toBeHidden();
    expect(f.openCount(), 'a stall is not a reconnect').toBe(1);

    // The positive control: frames resume, the notice clears, the picture returns.
    f.resume();
    await expect(strip(page)).toHaveAttribute('data-pgm-signal', 'live', { timeout: 6000 });
    await expect(strip(page)).not.toContainText('stalled');
    await expect(picture(page)).toBeVisible();

    const hiddenAt = Date.now();
    await page.getByRole('button', { name: 'Hide monitors' }).click();
    await expect.poll(() => f.openCount(), { timeout: 6000 }).toBe(0);
    const closedAfter = (f.connections[0]?.closedAt ?? Number.POSITIVE_INFINITY) - hiddenAt;
    expect(closedAfter, `the feed closed ${String(closedAfter)} ms after hiding`).toBeLessThan(
      2000,
    );
    expect(f.connections).toHaveLength(1);
  });

  test('no feed reads "No return signal", and the picture appears when the feed comes up', async ({
    page,
  }) => {
    // The station runs, and the Playout's feed is not there.
    await openConsole(page, await startStation());
    await page.getByRole('button', { name: 'Show monitors' }).click();
    await page.waitForTimeout(1500);
    await expect(strip(page)).toHaveAttribute('data-pgm-signal', 'none');
    await expect(strip(page)).toContainText('No return signal');
    await expect(page.locator('[data-pgm-screen]')).toContainText('No return signal');
    await expect(picture(page)).toBeHidden();

    // The positive control: the feed comes up, and the relay's backoff finds it.
    const f = await startFeed();
    await expect(strip(page)).toHaveAttribute('data-pgm-signal', 'live', { timeout: 15_000 });
    await expect(picture(page)).toBeVisible();
    expect(f.openCount()).toBe(1);
  });

  test('two consoles on one channel share ONE connection to the Playout', async ({
    page,
    context,
  }) => {
    const f = await startFeed();
    const url = await startStation();
    await openConsole(page, url);
    await page.getByRole('button', { name: 'Show monitors' }).click();
    await expect(strip(page)).toHaveAttribute('data-pgm-signal', 'live', { timeout: 10_000 });

    const second = await context.newPage();
    // The auto `splashDisabled` fixture arms `page` only; a second page would sit out the hold.
    await disableSplash(second);
    await openConsole(second, url);
    await second.getByRole('button', { name: 'Show monitors' }).click();
    await expect(strip(second)).toHaveAttribute('data-pgm-signal', 'live', { timeout: 10_000 });
    await expect(picture(second)).toBeVisible();
    // Both consoles are watching, and the Playout sees one reader.
    expect(f.connections).toHaveLength(1);
    expect(f.openCount()).toBe(1);

    // One console hides: the other still watches, so the one upstream stays.
    await page.getByRole('button', { name: 'Hide monitors' }).click();
    await page.waitForTimeout(2500);
    expect(f.openCount()).toBe(1);
    await expect(strip(second)).toHaveAttribute('data-pgm-signal', 'live');

    // The last one hides: released.
    await second.getByRole('button', { name: 'Hide monitors' }).click();
    await expect.poll(() => f.openCount(), { timeout: 6000 }).toBe(0);
  });
});
