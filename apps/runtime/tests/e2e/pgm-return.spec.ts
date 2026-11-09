import path from 'node:path';
import { createSocket } from 'node:dgram';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { ConsoleHttpServer, createBridge, pgmPort, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import {
  startFakePgmFeed,
  type FakePgmFeed,
} from '../../../../tools/caspar-bridge/tests/support/fake-pgm-feed.js';
import { disableSplash, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `C-016` / `PGM-RETURN-01` — **THE PROGRAM MONITOR SHOWS WHAT IS ON AIR**, end to end: a
 * real browser, the real built console, a real in-process bridge, and a fake Playout feed
 * reproducing the Playout team's wire byte for byte.
 *
 * `CENTRAL-BRIDGE-01` (D9) — the picture's ONE door is the bridge's control port: the console asks
 * for a ticket over its socket and its `<img>` opens `/pgm/<n>?ticket=…` there. The console is
 * served here by a listener with NO relay at all, so every frame below came through that door.
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

/*
  🔴 `B-305` — **THIS FILE'S OWN LOOPBACK ADDRESS, THE RULE PORT KEPT.** Two other specs show the
  monitors for channel 1 at `127.0.0.1` with no port seam — `channel-air.spec` (a CLI bridge) and
  `pvw-from-bridge.spec` — so they dial `127.0.0.1:9250`. With this file's fake feed there too, a parallel
  run handed it a second reader and `a stall is not a reconnect` read 2. The station and its feed live on
  `127.0.0.3` instead (as `dev-station.spec` keeps to `127.0.0.2`): still port 9250, still no seam, so the
  port rule is proved through the whole chain — and nothing else on this machine dials here.
*/
const STATION_HOST = '127.0.0.3';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The built console — the same `dist` CG Control bundles. */
const CONSOLE_DIR = path.resolve(here, '../../dist');

let feed: FakePgmFeed | null = null;
let bridge: BridgeHandle | null = null;
let consoleServer: ConsoleHttpServer | null = null;
let engine: MockHandle | null = null;

test.afterEach(async () => {
  await consoleServer?.stop();
  consoleServer = null;
  await bridge?.close();
  bridge = null;
  await feed?.stop();
  feed = null;
  await engine?.stop();
  engine = null;
});

async function startFeed(): Promise<FakePgmFeed> {
  try {
    feed = await startFakePgmFeed({ host: STATION_HOST, port: pgmPort(1) });
  } catch (err) {
    throw new Error(
      `the fake Playout feed could not take ${STATION_HOST}:${String(pgmPort(1))} (channel 1's rule port) — ` +
        `this runner cannot run the PROGRAM return spec: ${String(err)}`,
    );
  }
  return feed;
}

/**
 * A real bridge (auth off: the relay reads server A's host) and the console on its own origin,
 * served with no relay — the picture can only come from the bridge's control port.
 */
async function startStation(
  enginePorts?: { amcpPort: number; oscPort: number },
  sourceFormat: 'PAL' | '1080i5000' = '1080i5000',
): Promise<string> {
  bridge = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: STATION_HOST, ...(enginePorts ?? { amcpPort: 1, oscPort: 0 }) } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    // Channel 1 is the channel on screen.
    fixedLayers: defaultFixedLayerBank(),
    ...(enginePorts !== undefined && {
      sourceCatalog: {
        layerRange: { start: 60, end: 79 },
        sources: [
          {
            id: 'input-2',
            name: 'Input 2',
            format: sourceFormat,
            producer: { kind: 'route' as const, channel: 2 },
          },
        ],
      },
      sourceAssignments: {
        assignments: [{ templateId: 'pan-live', plateId: 'plate-1', sourceId: 'input-2' }],
      },
    }),
  });
  consoleServer = new ConsoleHttpServer();
  await consoleServer.start({ dir: CONSOLE_DIR, port: 0 });
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
    // …through the one door: the bridge's control port, with the ticket the socket was given.
    const src = await picture(page).getAttribute('src');
    expect(src ?? '').toMatch(
      new RegExp(
        `^http://127\\.0\\.0\\.1:${String((bridge as BridgeHandle).port)}/pgm/1\\?ticket=`,
      ),
    );
    expect(f.openCount()).toBe(1);
    // …and the one request the Playout saw is the exact one, with nothing after it.
    expect(f.connections[0]?.received.toString('latin1')).toBe(
      `GET / HTTP/1.1\r\nHost: ${STATION_HOST}\r\n\r\n`,
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

  async function openPanFixture(page: Page, axis: 'horizontal' | 'vertical'): Promise<MockHandle> {
    const vertical = axis === 'vertical';
    await startFeed();
    const oscPort = await new Promise<number>((resolve, reject) => {
      const socket = createSocket('udp4');
      socket.once('error', reject);
      socket.bind(0, '127.0.0.1', () => {
        const { port } = socket.address();
        socket.close(() => resolve(port));
      });
    });
    engine = await createMock({
      host: STATION_HOST,
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      channels: 2,
      oscHz: 20,
    });
    const url = await startStation(
      { amcpPort: engine.amcpPort, oscPort },
      vertical ? 'PAL' : '1080i5000',
    );
    const runtime = (bridge as BridgeHandle | null)?.runtime;
    if (runtime === undefined) throw new Error('Station did not start');
    await runtime.whenServerHealthy(15_000);
    runtime.templateImport(
      {
        templateId: 'pan-live',
        name: 'Pan live',
        templateType: 'custom',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
          sources: [
            {
              elementId: 'plate-el',
              sourceId: 'plate-1',
              dynamic: false,
              fitMode: 'cover',
              rect: vertical
                ? { x: 480, y: 270, width: 960, height: 540 }
                : { x: 720, y: 270, width: 480, height: 540 },
            },
          ],
        },
      },
      '<!doctype html><script>window.play=window.update=()=>{};</script>',
    );
    expect(
      await runtime.loadFixed({ channel: 1, layer: 59 }, 'pan-row', 'pan-live', {}),
    ).toMatchObject({ accepted: true });
    expect(await runtime.take('pan-row')).toMatchObject({ accepted: true });
    await openConsole(page, url);
    await page.getByRole('region', { name: 'Layers' }).locator('[data-layer="59"]').click();
    await page.getByRole('button', { name: 'Show monitors' }).click();
    await expect(strip(page)).toHaveAttribute('data-pgm-signal', 'live', { timeout: 10_000 });
    return engine;
  }

  test('D-178 — dragging the picture on PGM pans only the selected cover input', async ({
    page,
  }) => {
    const engine = await openPanFixture(page, 'horizontal');
    const pan = page.getByRole('button', { name: 'Pan live input' });
    await expect(pan).not.toHaveClass(/\bis-on\b/);
    await pan.click();
    await expect(pan).toHaveAttribute('aria-pressed', 'true');
    await expect(pan).toHaveClass(/\bis-on\b/);
    await page.mouse.move(0, 0);
    await expect(pan).toHaveCSS(
      'background-color',
      await pan.evaluate((element) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--r-accent)';
        element.append(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return accent;
      }),
    );
    const hit = page.getByRole('button', { name: 'Pan Plate 1', exact: true });
    await expect(hit).toHaveCSS('border-top-width', '3px');
    await expect(hit).not.toHaveCSS('box-shadow', 'none');
    const slot = { channel: 1, layer: 60 };
    const before = engine.layerState(slot);
    expect(before?.fill?.x).toBeCloseTo(0.25);
    const cropMap = page.locator('[data-pgm-crop-map]');
    const cropWindow = cropMap.locator('[data-pgm-crop-window]');
    const sourceX = () => cropWindow.evaluate((element) => Number.parseFloat(element.style.left));
    await expect(cropMap).toHaveAttribute('data-pgm-crop-map', 'current');
    expect(await sourceX()).toBeCloseTo(25);
    await hit.hover();
    const box = await hit.boundingBox();
    if (box === null) throw new Error('Crop target has no screen bounds');
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
    await expect(cropMap).toHaveAttribute('data-pgm-crop-map', 'draft');
    expect(await sourceX()).toBeCloseTo(15, 0);
    expect(engine.layerState(slot)).toEqual(before);
    await page.mouse.up();
    await expect.poll(() => engine?.layerState(slot)?.fill?.x).toBeCloseTo(0.3, 2);
    await expect(cropMap).toHaveAttribute('data-pgm-crop-map', 'current');
    expect(await sourceX()).toBeCloseTo(15, 0);
    await page.getByRole('button', { name: 'Center crop for Plate 1' }).click();
    await expect.poll(() => engine?.layerState(slot)?.fill?.x).toBeCloseTo(0.25, 2);
    await expect.poll(sourceX).toBeCloseTo(25);

    const cropHandle = page.getByRole('button', { name: 'Move crop window for Plate 1' });
    await cropHandle.hover();
    const mapBox = await cropMap.boundingBox();
    const handleBox = await cropHandle.boundingBox();
    if (mapBox === null || handleBox === null) throw new Error('Missing draggable crop map');
    expect(mapBox.width / mapBox.height).toBeCloseTo(16 / 9, 1);
    expect(handleBox.width / handleBox.height).toBeCloseTo(480 / 540, 1);
    const centerX = handleBox.x + handleBox.width / 2;
    const centerY = handleBox.y + handleBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + mapBox.width * 0.1, centerY, { steps: 5 });
    await expect(cropMap).toHaveAttribute('data-pgm-crop-map', 'draft');
    expect(Math.abs((await sourceX()) - 35)).toBeLessThan(1);
    expect(engine.layerState(slot)?.fill?.x).toBeCloseTo(0.25);
    await page.mouse.up();
    await expect.poll(() => engine?.layerState(slot)?.fill?.x).toBeCloseTo(0.2, 2);
    await expect(cropMap).toHaveAttribute('data-pgm-crop-map', 'current');
    expect(Math.abs((await sourceX()) - 35)).toBeLessThan(1);

    expect(engine.layerState(slot)?.clip).toEqual(before?.clip);
    expect(engine.layerState(slot)?.volume).toBe(before?.volume);
    await pan.click();
    await expect(pan).toHaveAttribute('aria-pressed', 'false');
    await expect(pan).not.toHaveClass(/\bis-on\b/);
    await expect(cropMap).toHaveCount(0);
    await expect(hit).toHaveCount(0);
  });

  test('D-178 — a 4:3 PGM input can pan vertically in a 16:9 plate', async ({ page }) => {
    const engine = await openPanFixture(page, 'vertical');
    const slot = { channel: 1, layer: 60 };
    const before = engine.layerState(slot);
    expect(before?.fill?.y).toBeCloseTo(1 / 6);

    await page.getByRole('button', { name: 'Pan live input' }).click();
    const hit = page.getByRole('button', { name: 'Pan Plate 1', exact: true });
    const cropMap = page.locator('[data-pgm-crop-map]');
    const cropHandle = page.getByRole('button', { name: 'Move crop window for Plate 1' });
    const sourceY = () =>
      cropMap.locator('[data-pgm-crop-window]').evaluate((el) => Number.parseFloat(el.style.top));
    await expect(cropHandle).toHaveAttribute('data-crop-axis', 'vertical');
    await expect(hit).toHaveCSS('cursor', 'ns-resize');
    await expect.poll(sourceY).toBeCloseTo(12.5);
    await hit.hover();
    const box = await hit.boundingBox();
    if (box === null) throw new Error('Crop target has no screen bounds');
    const x = box.x + box.width * 0.65;
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height * 0.5);
    await expect(cropMap).toHaveAttribute('data-pgm-crop-map', 'current');
    await page.mouse.move(x, box.y + box.height * 0.6, { steps: 5 });
    await expect(cropMap).toHaveAttribute('data-pgm-crop-map', 'draft');
    await expect.poll(sourceY).toBeCloseTo(5, 0);
    expect(engine.layerState(slot)).toEqual(before);
    await page.mouse.up();
    await expect.poll(() => engine.layerState(slot)?.fill?.y).toBeCloseTo(1 / 6 + 0.05, 2);
    await expect(cropMap).toHaveAttribute('data-pgm-crop-map', 'current');

    await page.getByRole('button', { name: 'Center crop for Plate 1' }).click();
    await expect.poll(sourceY).toBeCloseTo(12.5);
    await cropHandle.hover();
    const mapBox = await cropMap.boundingBox();
    const handleBox = await cropHandle.boundingBox();
    if (mapBox === null || handleBox === null) throw new Error('Missing draggable crop map');
    expect(mapBox.width / mapBox.height).toBeCloseTo(4 / 3, 1);
    expect(handleBox.width / handleBox.height).toBeCloseTo(16 / 9, 1);
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2 + mapBox.height * 0.06,
      { steps: 5 },
    );
    await expect(cropMap).toHaveAttribute('data-pgm-crop-map', 'draft');
    await expect.poll(sourceY).toBeCloseTo(18.5, 0);
    await page.mouse.up();
    await expect.poll(() => engine.layerState(slot)?.fill?.y).toBeCloseTo(1 / 6 - 0.04, 2);
    const after = engine.layerState(slot);
    expect(after?.fill).toMatchObject({
      x: before?.fill?.x,
      width: before?.fill?.width,
      height: before?.fill?.height,
    });
    expect(after?.clip).toEqual(before?.clip);
    expect(after?.volume).toBe(before?.volume);
  });
});
