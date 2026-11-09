import * as dgram from 'node:dgram';
import type { Browser, Page } from '@playwright/test';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedLayerBank } from '@cg/shared-ipc';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `RELEASE-091-01` §1 (`B-288`) — **PVW RENDERS THE PAGE THE BRIDGE SERVES CASPARCG, IN A BROWSER
 * THAT NEVER IMPORTED IT.**
 *
 * The owner's PVW said "REHEARSAL UNAVAILABLE IN THIS BROWSER … Re-import it in this browser": PVW
 * read only this browser's own copy (OPFS — one profile, one origin), so a template imported on another
 * machine, in another browser or on another channel could not be rehearsed without a manual re-import.
 *
 * A real `WebSocketRuntime` against a real in-process `@cg/caspar-bridge` and a real `@cg/amcp-mock`
 * CasparCG (`retention-honesty.spec.ts`'s shape): profile A imports and loads; a FRESH profile B —
 * nothing imported there — puts the row ON PVW and renders the page. The control is profile C, whose
 * bridge answers that it holds no page: one line naming the template, no frame.
 *
 * Why the control rewrites the answer on the wire rather than deleting the file: the product protects
 * a page a row holds — its file stays while any row holds it (`R-074`) — so "the file is gone" is only
 * reachable across a bridge restart, where the store drops the listing and says `not-listed`
 * (`template-page.integration.test.ts` proves that half). What this pins is what PVW does with such an
 * answer.
 */

const BANK: FixedLayerBank = { channel: 1, start: 80, count: 20, low: { start: 50, count: 10 } };
const ROW = 99;
const MARK = 'served-by-the-bridge-5f2c';
const TEMPLATE = {
  templateId: 'tpl-pvw-bridge',
  name: 'زیرنویس خبر',
  templateType: 'lower-third',
  fields: [],
};
const HTML =
  '<!doctype html><html><head><meta charset="utf-8"><style>' +
  'html,body{width:1920px;height:1080px;margin:0;overflow:hidden;background:transparent}' +
  `.cg-stage{position:absolute;inset:0}</style></head><body><div class="cg-stage" data-mark="${MARK}"></div>` +
  '<script>window.play=function(){};window.stop=function(){};' +
  'window.update=function(){};window.next=function(){};</script></body></html>';

let bridge: BridgeHandle | null = null;
let mock: MockHandle | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
});

// A real bridge and a real mock per test: serial, as a LOAD bound (`retention-honesty.spec.ts`).
test.describe.configure({ mode: 'serial' });

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

async function boot(withCropSource = false): Promise<BridgeHandle> {
  const oscPort = await freeUdpPort();
  mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 10,
    ...(withCropSource && { channels: 2 }),
  });
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  bridge = await createBridge({
    port: 0,
    connection,
    fixedLayers: BANK,
    ...(withCropSource && {
      sourceCatalog: {
        layerRange: { start: 60, end: 79 },
        sources: [
          {
            id: 'crop-source',
            name: 'Crop source',
            format: '1080i5000',
            producer: { kind: 'route', channel: 2 },
          },
        ],
      },
      sourceAssignments: {
        assignments: [{ templateId: 'tpl-pvw-crop', plateId: 'guest', sourceId: 'crop-source' }],
      },
    }),
  });
  return bridge;
}

async function openConsole(page: Page, url: string): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(
    ([u]) => {
      const w = window as unknown as { __CG_BRIDGE_URL__: string; __CG_SPLASH_DISABLED__: boolean };
      w.__CG_BRIDGE_URL__ = u as string;
      w.__CG_SPLASH_DISABLED__ = true;
    },
    [url],
  );
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Bridge link' })).not.toContainText('DISCONNECTED');
}

async function showMonitors(page: Page): Promise<void> {
  const show = page.getByRole('button', { name: 'Show monitors' });
  if (await show.count()) await show.first().click();
  await expect(page.getByRole('button', { name: 'Hide monitors' })).toBeVisible();
}

const row = (page: Page) => page.locator(`[data-layer="${String(ROW)}"]`).first();
const frames = (page: Page) => page.locator('iframe[data-rehearsal-frame]');

/** A second browser PROFILE: a fresh context shares no storage with the first. */
async function freshProfile(browser: Browser, page: Page): Promise<Page> {
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  return context.newPage();
}

test('🔴 a template imported in profile A is rehearsed in a fresh profile B, from the bridge — control: a bridge with no page gives B one line, no frame', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const handle = await boot();

  // ── Profile A: the import and the load, through the console's own doors.
  await openConsole(page, handle.url);
  await page.evaluate(
    async ([tpl, html, layer]) => {
      const w = window as unknown as {
        cg: {
          templates: { import: (r: unknown) => Promise<unknown> };
          fixedLayers: { load: (r: unknown) => Promise<unknown> };
        };
      };
      await w.cg.templates.import({ template: tpl, html, channel: 1 });
      await w.cg.fixedLayers.load({
        channel: 1,
        layer,
        itemId: 'item-pvw-bridge',
        templateId: 'tpl-pvw-bridge',
        fields: {},
      });
    },
    [TEMPLATE, HTML, ROW] as const,
  );
  await expect(row(page)).toHaveAttribute('data-item-id', 'item-pvw-bridge');

  // ── Profile B: never imported anything. PVW renders the bridge's page.
  const b = await freshProfile(browser, page);
  await openConsole(b, handle.url);
  await expect(row(b)).toHaveAttribute('data-item-id', 'item-pvw-bridge');
  await showMonitors(b);
  await row(b).getByRole('button', { name: 'ON PVW', exact: true }).click();
  await expect(frames(b)).toHaveCount(1);
  await expect
    .poll(() =>
      frames(b)
        .first()
        .evaluate(
          (el) =>
            (el as HTMLIFrameElement).contentDocument
              ?.querySelector('.cg-stage')
              ?.getAttribute('data-mark') ?? null,
        ),
    )
    .toBe(MARK);
  await expect(b.locator('[data-pvw-missing]')).toHaveCount(0);

  // ── CONTROL — profile C, whose bridge answers that it holds no page for the template.
  const c = await freshProfile(browser, page);
  const port = new URL(handle.url).port;
  await c.context().routeWebSocket(new RegExp(`^ws://127\\.0\\.0\\.1:${port}`), (ws) => {
    const server = ws.connectToServer();
    const pageRequests = new Set<string>();
    ws.onMessage((message) => {
      try {
        const frame = JSON.parse(String(message)) as {
          type?: string;
          id?: string;
          channel?: string;
        };
        if (
          frame.type === 'request' &&
          frame.channel === 'templates.page' &&
          frame.id !== undefined
        ) {
          pageRequests.add(frame.id);
        }
      } catch {
        /* not a frame of ours */
      }
      server.send(message);
    });
    server.onMessage((message) => {
      try {
        const frame = JSON.parse(String(message)) as { type?: string; id?: string };
        if (frame.type === 'response' && frame.id !== undefined && pageRequests.has(frame.id)) {
          ws.send(JSON.stringify({ ...frame, payload: { ok: false, reason: 'no-file' } }));
          return;
        }
      } catch {
        /* forward as it came */
      }
      ws.send(message);
    });
  });
  await openConsole(c, handle.url);
  await showMonitors(c);
  // The row is rehearsing already (B put it ON PVW; rehearse state is the bridge's).
  const line = c.locator('[data-pvw-missing="no-file"]');
  await expect(line).toBeVisible();
  await expect(line).toContainText('The bridge holds no page for');
  await expect(line.locator('bdi')).toHaveText('زیرنویس خبر');
  await expect(frames(c)).toHaveCount(0);
  await expect(c.getByText(/re-import it in this browser/i)).toHaveCount(0);

  await b.context().close();
  await c.context().close();
});

test('D-178 — a saved PVW crop survives leaving Preview and is applied in the first Take FILL', async ({
  page,
}) => {
  const handle = await boot(true);
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const cropItem = 'pvw-crop-item';
  handle.runtime.templateImport(
    {
      templateId: 'tpl-pvw-crop',
      name: 'PVW crop fixture',
      templateType: 'custom',
      fields: [],
      liveSources: {
        resolution: { width: 1920, height: 1080 },
        defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
        sources: [
          {
            elementId: 'guest-el',
            sourceId: 'guest',
            dynamic: false,
            fitMode: 'cover',
            rect: { x: 720, y: 270, width: 480, height: 540 },
          },
        ],
      },
    },
    HTML,
    1,
  );
  expect(
    await handle.runtime.loadFixed({ channel: 1, layer: 59 }, cropItem, 'tpl-pvw-crop', {}),
  ).toMatchObject({ accepted: true });
  await openConsole(page, handle.url);
  await showMonitors(page);
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const plateRow = page.getByRole('region', { name: 'Layers' }).locator('[data-layer="59"]');
  const take = plateRow.getByRole('button', { name: 'PLAY', exact: true });
  await plateRow.getByRole('button', { name: 'ON PVW', exact: true }).click();
  await expect(take).toBeDisabled();
  await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
  const pan = pvw.getByRole('button', { name: 'Pan preview input', exact: true });
  await pan.click();
  const crop = pvw.locator('[data-pan-practice-crop]');
  const source = pvw.locator('[data-pan-practice-picture]');
  const saved = pvw.locator('[data-pan-crop-state="saved"]');
  await expect(pvw.getByRole('button', { name: 'Pan crop guide in guest' })).toBeVisible();
  const [sourceBox, cropBox] = await Promise.all([source.boundingBox(), crop.boundingBox()]);
  if (sourceBox === null || cropBox === null) throw new Error('Missing crop geometry');
  const x = cropBox.x + cropBox.width / 2;
  const y = cropBox.y + cropBox.height / 2;
  const wireStart = engine.receivedCommands().length;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + sourceBox.width / 8, y, { steps: 5 });
  await page.mouse.up();
  await expect(saved).toBeVisible();
  const readLeft = () => crop.evaluate((element) => Number.parseFloat(element.style.left));
  await expect.poll(readLeft).toBeCloseTo(37.5, 0);

  await pan.click();
  await expect(crop).toHaveCount(0);
  await pan.click();
  await expect(pvw.getByRole('button', { name: 'Pan crop guide in guest' })).toBeVisible();
  await expect(saved).toBeVisible();
  await expect.poll(readLeft).toBeCloseTo(37.5, 0);
  const staged = engine
    .receivedCommands()
    .slice(wireStart)
    .map(({ line }) => line);
  expect(staged.some((line) => /(?:^| )(?:MIXER 1-60|PLAY 1-60) /.test(line))).toBe(false);

  await plateRow.getByRole('button', { name: 'OFF PVW', exact: true }).click();
  await take.click();
  const slot = { channel: 1, layer: 60 };
  await expect.poll(() => engine.layerState(slot)?.fill?.x).toBeCloseTo(0.1875, 2);
  await expect.poll(() => engine.layerState(slot)?.opacity).toBe(1);
  const wire = engine
    .receivedCommands()
    .slice(wireStart)
    .map(({ line }) => line);
  const fill = wire.findIndex((line) => /(?:^| )MIXER 1-60 FILL /.test(line));
  const play = wire.findIndex((line) => /(?:^| )PLAY 1-60 /.test(line));
  const reveal = wire.findIndex((line) => /(?:^| )MIXER 1-60 OPACITY 1(?: |$)/.test(line));
  expect(fill).toBeGreaterThanOrEqual(0);
  const xSent = /FILL ([\d.]+)/.exec(wire[fill] ?? '')?.[1];
  expect(Number(xSent)).toBeCloseTo(0.1875, 2);
  expect(play).toBeGreaterThan(fill);
  expect(reveal).toBeGreaterThan(play);
});
