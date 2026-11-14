import * as dgram from 'node:dgram';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Locator, Page } from '@playwright/test';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  LayerProfileSchema,
  type ConnectionConfig,
  type FixedLayerBank,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { SceneSchema, type LiveRevealRect, type VideoPlaceholderElement } from '@cg/shared-schema';
import { cgCss, cgJsIife, ExporterSingleFile } from '@cg/single-file-export';
import { buildTemplateLiveSources, pack, sha256Hex, unpack } from '@cg/vcg-format';
import {
  buildBookVcg,
  buildPositionedVcg,
  buildValidVcg,
  expect,
  openVcgFileChooser,
  test,
} from './fixtures/runtime.js';

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

async function boot(withCropSource = false, textSourceRoot?: string): Promise<BridgeHandle> {
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
    ...(textSourceRoot === undefined ? {} : { textSourceRoot }),
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

test('B-444: maximizing and restoring PROGRAM leaves the same PREVIEW animation playing', async ({
  page,
}) => {
  const handle = await boot();
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const id = 'pvw-continues-behind-pgm';
  const { scene } = await unpack(await buildValidVcg(id));
  const endFrame = 4500;
  scene.frameRange.out = endFrame;
  const animated = scene.layers[0]?.children.find(({ id: elementId }) => elementId === 'el-name');
  if (animated === undefined) throw new Error('Missing animation fixture');
  animated.animation = {
    tracks: {
      opacity: {
        keyframes: [
          { frame: 0, value: 0.25, easing: 'linear' },
          { frame: endFrame, value: 1, easing: 'linear' },
        ],
      },
    },
  };
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  handle.runtime.templateImport({ ...TEMPLATE, templateId: id }, html, 1);
  expect(await handle.runtime.loadFixed({ channel: 1, layer: ROW }, id, id, {})).toMatchObject({
    accepted: true,
  });
  await openConsole(page, handle.url);
  await showMonitors(page);
  await row(page).getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(row(page)).toHaveAttribute('aria-label', /ON AIR$/);
  const baseline = engine.receivedCommands().length;

  const preview = page.getByRole('region', { name: 'PREVIEW (PVW)', exact: true });
  const program = page.getByRole('region', { name: 'PROGRAM (PGM)', exact: true });
  const initially = await program.boundingBox();
  if (initially === null) throw new Error('Missing Program monitor');
  await row(page).getByRole('button', { name: 'ON PVW', exact: true }).click();
  const play = preview.getByRole('button', { name: 'PLAY', exact: true });
  await expect(play).toBeEnabled();

  const frame = frames(page);
  await expect(frame).toHaveCount(1);
  const documentBefore = await frame.evaluateHandle(
    (element) => (element as HTMLIFrameElement).contentDocument,
  );
  const sameDocument = () =>
    frame.evaluate(
      (element, original) => (element as HTMLIFrameElement).contentDocument === original,
      documentBefore,
    );
  const body = frame.contentFrame().locator('body');
  await body.evaluate((element) => {
    const runtime = (
      element.ownerDocument.defaultView as unknown as {
        cg?: { on(event: 'play.start' | 'stop.start', listener: () => void): void };
      } | null
    )?.cg;
    if (runtime === undefined) throw new Error('Template runtime did not boot');
    for (const event of ['play.start', 'stop.start'] as const) {
      runtime.on(event, () => {
        element.setAttribute(event, String(Number(element.getAttribute(event) ?? 0) + 1));
      });
    }
  });
  const graphic = frame.contentFrame().locator('[data-cg-element-id="el-name"]');
  const opacity = () => graphic.evaluate((element) => Number(getComputedStyle(element).opacity));
  await play.click();
  await expect(body).toHaveAttribute('play.start', '1');
  await expect.poll(opacity).toBeGreaterThan(0.25);

  await page.getByRole('button', { name: 'Show PROGRAM (PGM) fullscreen' }).click();
  await expect(preview).toBeHidden();
  await expect
    .poll(async () => (await program.boundingBox())?.width ?? 0)
    .toBeGreaterThan(initially.width * 1.4);
  await expect(program.locator('[data-monitor-air-count]')).toHaveText('1 row on air');
  await expect(frame).toHaveCount(1);
  expect(await sameDocument()).toBe(true);

  await page.getByRole('button', { name: 'Exit fullscreen PROGRAM (PGM)' }).click();
  await expect(preview).toBeVisible();
  await expect
    .poll(async () => (await program.boundingBox())?.width ?? 0)
    .toBeCloseTo(initially.width, 0);
  expect(await sameDocument()).toBe(true);
  const afterRestore = await opacity();
  await expect.poll(opacity).toBeGreaterThan(afterRestore);
  await expect(body).toHaveAttribute('play.start', '1');
  expect(await body.getAttribute('stop.start')).toBeNull();
  await expect(program.locator('[data-monitor-air-count]')).toHaveText('1 row on air');
  await expect(row(page)).toHaveAttribute('aria-label', /ON AIR$/);
  expect(
    engine
      .receivedCommands()
      .slice(baseline)
      .map(({ line }) => line)
      .filter((line) => /^(CG|PLAY|LOADBG|CLEAR|MIXER) /.test(line)),
  ).toEqual([]);
});

test('D-178 / B-433 — PVW crop reaches the first Take and Update on air reframes the existing seat', async ({
  page,
}) => {
  const handle = await boot(true);
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const cropItem = 'pvw-crop-item';
  const template: TemplateInfo = {
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
  };
  const html = HTML.replace(
    '</body>',
    '<div data-cg-live-source="guest" style="position:absolute;left:720px;top:270px;width:480px;height:540px"></div></body>',
  );
  const imported = handle.runtime.templateImport(template, html, 1);
  expect(
    await handle.runtime.loadFixed({ channel: 1, layer: 59 }, cropItem, 'tpl-pvw-crop', {}),
  ).toMatchObject({ accepted: true });
  await openConsole(page, handle.url);
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Missing source picture canvas');
    context.fillStyle = '#f22';
    context.fillRect(0, 0, 80, 90);
    context.fillStyle = '#2e2';
    context.fillRect(80, 0, 80, 90);
    const jpegBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
    Object.assign(window.cg, {
      sourcePreviews: {
        pvw: async ({ sourceIds }: { sourceIds: string[] }) => ({
          frames: sourceIds.map((sourceId) => ({
            sourceId,
            signal: 'present',
            jpegBase64,
            width: 160,
            height: 90,
          })),
        }),
      },
    });
  });
  await showMonitors(page);
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const pan = pvw.getByRole('button', { name: 'Crop input in Preview', exact: true });
  const pvwPicture = pvw
    .frameLocator('iframe[data-rehearsal-frame]')
    .locator('[data-cg-live-source="guest"] [data-cg-pvw-picture-part] img');
  const readPicture = () =>
    pvwPicture.evaluate((image) => {
      const { x, y, width, height } = image.getBoundingClientRect();
      return { x, y, width, height };
    });
  const plateRow = page.getByRole('region', { name: 'Layers' }).locator('[data-layer="59"]');
  const take = plateRow.getByRole('button', { name: 'PLAY', exact: true });
  await plateRow.locator('[data-row-body]').click();
  const update = page.getByRole('button', { name: 'Apply staged edits', exact: true });
  const discard = page.getByRole('button', { name: 'Discard staged edits' });
  const resetCrop = page
    .getByRole('complementary', { name: 'Inspector' })
    .getByRole('button', { name: 'Reset crop', exact: true });
  await expect(resetCrop).toBeDisabled();
  const startPan = async () => {
    await plateRow.getByRole('button', { name: 'ON PVW', exact: true }).click();
    await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
    await pan.click();
    await expect(pvw.getByRole('button', { name: 'Pan source picture in guest' })).toBeEnabled();
  };
  const leavePreview = () => plateRow.getByRole('button', { name: 'OFF PVW', exact: true }).click();
  await startPan();
  await expect(take).toBeEnabled();
  await expect(pvwPicture).toBeVisible();
  const centeredPicture = await readPicture();
  const crop = pvw.locator('[data-pan-practice-crop]');
  const source = pvw.locator('[data-pan-practice-picture]');
  const draft = pvw.locator('[data-pan-crop-state="draft"]');
  const saved = pvw.locator('[data-pan-crop-state="saved"]');
  const wireStart = engine.receivedCommands().length;
  const readLeft = () => crop.evaluate((element) => Number.parseFloat(element.style.left));
  const dragRight = async () => {
    const [sourceBox, cropBox] = await Promise.all([source.boundingBox(), crop.boundingBox()]);
    if (sourceBox === null || cropBox === null) throw new Error('Missing crop geometry');
    const x = cropBox.x + cropBox.width / 2;
    const y = cropBox.y + cropBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + sourceBox.width / 8, y, { steps: 5 });
    await page.mouse.up();
    await expect(draft).toBeVisible();
  };
  await dragRight();
  await expect(resetCrop).toBeEnabled();
  await expect.poll(readLeft).toBeCloseTo(37.5, 0);
  expect(handle.runtime.previewPlateCrop(cropItem).targets[0]?.focus.x).toBe(0.5);

  await leavePreview();
  await expect(crop).toHaveCount(0);
  await startPan();
  await expect(draft).toBeVisible();
  await expect.poll(readLeft).toBeCloseTo(37.5, 0);
  await discard.click();
  await expect(draft).toHaveCount(0);
  await expect.poll(readLeft).toBeCloseTo(25, 0);

  await dragRight();
  await leavePreview();
  await update.click();
  await expect
    .poll(() => handle.runtime.previewPlateCrop(cropItem).targets[0]?.focus.x)
    .toBeCloseTo(0.75, 1);
  await startPan();
  await expect(saved).toBeVisible();
  await expect.poll(readLeft).toBeCloseTo(37.5, 0);
  await pan.click();
  await expect(crop).toHaveCount(0);
  await expect.poll(async () => (await readPicture()).x).toBeLessThan(centeredPicture.x - 100);
  await pan.click();
  await expect(saved).toBeVisible();
  const staged = engine
    .receivedCommands()
    .slice(wireStart)
    .map(({ line }) => line);
  expect(staged.some((line) => /(?:^| )(?:MIXER 1-60|PLAY 1-60) /.test(line))).toBe(false);

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

  await expect(plateRow).toHaveAttribute('aria-label', /ON AIR$/);
  await expect(pvw.getByRole('button', { name: 'Pan source picture in guest' })).toBeEnabled();
  const reloadWireStart = engine.receivedCommands().length;
  const revisedMarker = 'pvw-crop-revised';
  const reloaded = await page.evaluate((request) => window.cg.templates.import(request), {
    channel: 1,
    template: { ...template, name: 'PVW crop fixture revised' },
    html: html.replace(MARK, revisedMarker),
  });
  expect(reloaded).toMatchObject({ registered: true, templateId: template.templateId });
  expect(reloaded.versionId).toBeDefined();
  expect(reloaded.versionId).not.toBe(imported.versionId);
  await expect(
    pvw.frameLocator('iframe[data-rehearsal-frame]').locator('.cg-stage'),
  ).toHaveAttribute('data-mark', revisedMarker);
  // A refreshed rehearsal page has its own transport. Start it and reopen the guide.
  await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(pan).toBeEnabled();
  if ((await pan.getAttribute('aria-pressed')) !== 'true') await pan.click();
  await expect(pvw.getByRole('button', { name: 'Pan source picture in guest' })).toBeEnabled();
  await expect(saved).toBeVisible();
  const before = engine.layerState(slot);
  if (before?.fill === undefined || before.clip === undefined)
    throw new Error('Missing on-air plate geometry');
  const beforeFill = { ...before.fill };
  const beforeClip = { ...before.clip };
  const beforeResize = engine.receivedCommands().length;
  await pvw
    .getByRole('button', { name: 'Resize top left crop corner in guest' })
    .press('ArrowRight');
  await expect(draft).toBeVisible();
  expect(engine.layerState(slot)?.fill).toEqual(beforeFill);
  expect(
    engine
      .receivedCommands()
      .slice(beforeResize)
      .some(({ line }) => /MIXER 1-60 FILL /.test(line)),
  ).toBe(false);

  await page.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
  await expect
    .poll(() => engine.layerState(slot)?.fill?.width ?? 0)
    .toBeGreaterThan(beforeFill.width);
  await expect(saved).toBeVisible();
  expect(engine.layerState(slot)?.clip).toEqual(beforeClip);
  expect(engine.layerState(slot)?.opacity).toBe(1);
  const onAirUpdate = engine
    .receivedCommands()
    .slice(beforeResize)
    .map(({ line }) => line);
  expect(onAirUpdate.some((line) => /MIXER 1-60 FILL /.test(line))).toBe(true);
  expect(
    onAirUpdate.some((line) =>
      /(?:^| )(?:PLAY|LOADBG|STOP|CLEAR) 1-60\b|MIXER 1-60 (?:VOLUME|OPACITY)\b/.test(line),
    ),
  ).toBe(false);

  const appliedFill = engine.layerState(slot)?.fill;
  if (appliedFill === undefined) throw new Error('Missing applied on-air crop');
  const wireBeforeClosing = engine.receivedCommands().length;
  await pan.click();
  await expect(crop).toHaveCount(0);
  await expect(pvwPicture).toBeVisible();
  await expect
    .poll(async () => {
      const picture = await readPicture();
      return Math.max(
        Math.abs(picture.x - appliedFill.x * 1920),
        Math.abs(picture.y - appliedFill.y * 1080),
        Math.abs(picture.width - appliedFill.width * 1920),
        Math.abs(picture.height - appliedFill.height * 1080),
      );
    })
    .toBeLessThan(2);
  expect(
    engine
      .receivedCommands()
      .slice(wireBeforeClosing)
      .some(({ line }) => /(?:^| )(?:MIXER|PLAY|STOP|CLEAR) 1-60\b/.test(line)),
  ).toBe(false);

  const startReset = engine.receivedCommands().length;
  const cropCommands = () =>
    engine
      .receivedCommands()
      .slice(startReset)
      .map(({ line }) => line)
      .filter((line) =>
        /(?:^| )(?:MIXER 1-60 (?:FILL|CLIP)|(?:PLAY|STOP|CLEAR|LOADBG) 1-60)\b/.test(line),
      );
  await expect(resetCrop).toBeEnabled();
  await resetCrop.click();
  await expect(resetCrop).toBeDisabled();
  await expect.poll(async () => (await readPicture()).width).toBeCloseTo(centeredPicture.width, 0);
  expect(engine.layerState(slot)?.fill).toEqual(appliedFill);
  expect(cropCommands()).toEqual([]);

  await discard.click();
  await expect(resetCrop).toBeEnabled();
  await expect
    .poll(async () => (await readPicture()).width)
    .toBeCloseTo(appliedFill.width * 1920, 0);
  expect(cropCommands()).toEqual([]);

  await resetCrop.click();
  await page.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
  await expect
    .poll(() => engine.layerState(slot)?.fill?.width ?? 0)
    .toBeCloseTo(centeredPicture.width / 1920, 3);
  expect(cropCommands()).toEqual([expect.stringMatching(/MIXER 1-60 FILL /)]);
  expect(engine.layerState(slot)?.clip).toEqual(beforeClip);
  expect(engine.layerState(slot)?.opacity).toBe(1);
  await expect(resetCrop).toBeDisabled();
  expect(onAirUpdate.some((line) => /^CG 1-59 UPDATE /.test(line))).toBe(false);
  expect(
    engine
      .receivedCommands()
      .slice(reloadWireStart)
      .some(({ line }) =>
        /^(?:PLAY |CLEAR |CG \d+-\d+ (?:ADD|PLAY|STOP|REMOVE|CLEAR) )/.test(line),
      ),
  ).toBe(false);
});

test('R-024 saves and reloads a layer profile and refuses to replace an on-air row', async ({
  page,
}) => {
  const handle = await boot();
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const itemId = 'profile-original';
  const headline = 'خبر فوری از تهران';
  const position = { anchor: 'top-left', offset: { x: 30, y: -7 } } as const;
  handle.runtime.templateImport(
    {
      ...TEMPLATE,
      fields: [{ id: 'headline', label: 'Headline', type: 'text', required: false, default: '' }],
    },
    HTML,
    1,
  );
  expect(
    await handle.runtime.loadFixed({ channel: 1, layer: ROW }, itemId, TEMPLATE.templateId, {
      headline,
    }),
  ).toMatchObject({ accepted: true });
  expect(await handle.runtime.setPosition(itemId, position)).toMatchObject({ ok: true });
  const liveTemplateId = 'live-profile-template';
  const liveLayer = 59;
  handle.runtime.templateImport(
    {
      ...TEMPLATE,
      templateId: liveTemplateId,
      liveSources: {
        resolution: { width: 1920, height: 1080 },
        defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
        sources: [
          {
            elementId: 'el-guest',
            sourceId: 'guest',
            rect: { x: 0, y: 0, width: 960, height: 540 },
            dynamic: false,
          },
        ],
      },
    },
    HTML,
    1,
  );
  expect(
    await handle.runtime.loadFixed(
      { channel: 1, layer: liveLayer },
      'profile-live-layer',
      liveTemplateId,
      {},
    ),
  ).toMatchObject({ accepted: true });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
  });
  await openConsole(page, handle.url);

  const profiles = page.getByRole('button', { name: 'Layer profiles', exact: true });
  await profiles.click();
  const dialog = page.getByRole('dialog', { name: 'Layer profiles', exact: true });
  const choose = () =>
    Promise.all([
      page.waitForEvent('filechooser'),
      dialog.getByRole('button', { name: 'Choose profile…', exact: true }).click(),
    ]).then(([chooser]) => chooser);
  const save = dialog.getByRole('button', { name: 'Save profile…' });
  const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
  await expect(dialog.getByRole('status')).toHaveText('Profile download started.');
  const downloaded = await download.path();
  if (downloaded === null) throw new Error('Missing profile download');
  const profile = LayerProfileSchema.parse(JSON.parse(await readFile(downloaded, 'utf8')));
  expect(profile.items).toMatchObject([
    { layer: ROW, templateId: TEMPLATE.templateId, fields: { headline }, position },
    { layer: liveLayer, templateId: liveTemplateId, label: 'Live layer 59' },
  ]);
  expect(profile.items[0]).not.toHaveProperty('state');

  const pickerCalls: { suggestedName: string; activated: boolean }[] = [];
  let savedText: string | null = null;
  await page.exposeFunction('recordProfilePicker', (choice: (typeof pickerCalls)[number]) =>
    pickerCalls.push(choice),
  );
  await page.exposeFunction('recordProfileFile', (content: string) => {
    savedText = content;
  });
  await page.evaluate(() => {
    const probe = window as unknown as {
      recordProfilePicker(choice: { suggestedName: string; activated: boolean }): Promise<number>;
      recordProfileFile(content: string): Promise<void>;
    };
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async ({ suggestedName }: { suggestedName: string }) => {
        const call = await probe.recordProfilePicker({
          suggestedName,
          activated: navigator.userActivation.isActive,
        });
        if (call === 1) throw new DOMException('Cancelled', 'AbortError');
        let content = '';
        return {
          name: 'operator-profile.json',
          createWritable: async () => ({
            write: async (blob: Blob) => {
              content = await blob.text();
            },
            close: () => probe.recordProfileFile(content),
          }),
        };
      },
    });
  });
  await save.click();
  await expect.poll(() => pickerCalls.length).toBe(1);
  await expect(save).toBeEnabled();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('status')).toHaveCount(0);
  expect(savedText).toBeNull();

  await save.click();
  await expect(dialog.getByRole('status')).toHaveText('Saved operator-profile.json.');
  expect(pickerCalls).toEqual([
    { suggestedName: 'CG-CH1-profile.json', activated: true },
    { suggestedName: 'CG-CH1-profile.json', activated: true },
  ]);
  expect(JSON.parse(savedText ?? 'null')).toEqual(profile);

  profile.items.push({
    layer: ROW - 1,
    templateId: 'missing-template',
    label: 'قالب خبری',
    fields: {},
  });
  const file = {
    name: 'news-profile.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(profile)),
  };
  const load = dialog.getByRole('button', { name: 'Load profile', exact: true });
  const cancelled = await choose();
  await cancelled.element().dispatchEvent('cancel');
  await expect(dialog.getByRole('status')).toHaveText('File selection cancelled.');
  await expect(load).toBeDisabled();

  await (await choose()).setFiles({ ...file, buffer: Buffer.from('{}') });
  await expect(dialog.getByRole('alert')).toHaveText(
    'This is not a valid APASAI CG layer profile.',
  );
  await expect(load).toBeDisabled();

  await (await choose()).setFiles(file);
  await expect(dialog.getByText(/replace prepared layers on channel 1/)).toBeVisible();
  await page.evaluate(() => {
    const actualLoad = window.cg.stack.loadProfile;
    window.cg.stack.loadProfile = () => {
      window.cg.stack.loadProfile = actualLoad;
      return Promise.reject(new Error('Connection lost while loading the profile.'));
    };
  });
  const commandsBefore = engine.receivedCommands().length;
  await load.click();
  await expect(dialog.getByRole('alert')).toHaveText('Connection lost while loading the profile.');
  await expect(load).toBeEnabled();
  await load.click();
  await expect(dialog).toHaveCount(0);
  await expect(profiles).toBeFocused();
  const warning = page.getByRole('alert').filter({ hasText: 'Loaded 2 layers.' });
  await expect(warning.getByText(/قالب خبری.*Template is missing from this channel/)).toBeVisible();
  const loaded = handle.runtime.stackSnapshot(1).find(({ slot }) => slot?.layer === ROW);
  expect(loaded).toMatchObject({
    status: 'loaded',
    slot: { layer: ROW },
    fields: { headline },
    position,
  });
  expect(loaded?.itemId).not.toBe(itemId);
  expect(
    engine
      .receivedCommands()
      .slice(commandsBefore)
      .filter(({ line }) => /(?:^| )(?:CG|PLAY|CLEAR|MIXER)\b/.test(line)),
  ).toEqual([]);

  if (loaded === undefined) throw new Error('Missing restored layer');
  expect(await handle.runtime.take(loaded.itemId)).toMatchObject({ accepted: true });
  await profiles.click();
  await (await choose()).setFiles(file);
  await load.click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Stop the graphics on this channel before loading a profile.',
  );
  expect(handle.runtime.stackSnapshot(1).find(({ slot }) => slot?.layer === ROW)).toMatchObject({
    itemId: loaded.itemId,
    status: 'on-air',
  });
});

test('shared folder lists Bridge packages and imports through the template catalogue', async ({
  page,
}) => {
  const shared = await mkdtemp(join(tmpdir(), 'cg-shared-vcg-'));
  try {
    await mkdir(join(shared, 'خبر', 'ورزش'), { recursive: true });
    const packageId = 'tpl-shared-folder';
    await writeFile(join(shared, 'خبر', 'خبر.vcg'), await buildValidVcg(packageId));
    await writeFile(join(shared, 'خبر', 'خراب.vcg'), 'invalid package');
    await writeFile(
      join(shared, 'خبر', 'تصویر.vcg'),
      await buildValidVcg(
        'tpl-shared-embedded',
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      ),
    );
    await writeFile(join(shared, 'خبر', 'notes.txt'), 'not a template package');
    const handle = await boot(false, shared);
    await openConsole(page, handle.url);
    await page.getByRole('button', { name: 'Open templates', exact: true }).click();
    await page.getByRole('button', { name: 'Shared folder…', exact: true }).click();
    const folder = page.getByRole('dialog', { name: 'Shared template folder', exact: true });
    const up = folder.getByRole('button', { name: 'Up', exact: true });
    const location = folder.getByRole('status', { name: 'Shared folder location' });
    await expect(up).toBeDisabled();
    await expect(location).toHaveText('Shared files');
    await folder.getByRole('button', { name: 'خبر', exact: true }).click();
    await expect(up).toBeEnabled();
    await folder.getByRole('button', { name: 'ورزش', exact: true }).click();
    await expect(location).toHaveText('Shared files / خبر / ورزش');
    await expect(up).toBeEnabled();
    await up.click();
    await expect(location).toHaveText('Shared files / خبر');
    await up.click();
    await expect(location).toHaveText('Shared files');
    await expect(up).toBeDisabled();
    await folder.getByRole('button', { name: 'خبر', exact: true }).click();
    const file = folder.getByRole('button', { name: 'خبر.vcg', exact: true });
    await expect(file).toHaveAttribute('aria-pressed', 'false');
    const fileRow = folder.getByRole('row').filter({
      has: page.getByRole('button', { name: 'خبر.vcg', exact: true }),
    });
    const still = fileRow.frameLocator('iframe[title="Template thumbnail"]');
    await expect(still.locator('[data-cg-element-id="el-name"]')).toBeVisible();
    const corrupt = folder.getByRole('button', { name: 'خراب.vcg', exact: true });
    const corruptRow = folder.getByRole('row').filter({
      has: page.getByRole('button', { name: 'خراب.vcg', exact: true }),
    });
    await expect(corruptRow.locator('[data-thumbnail-state="unavailable"] svg')).toBeVisible();
    const embedded = folder.getByRole('row').filter({
      has: page.getByRole('button', { name: 'تصویر.vcg', exact: true }),
    });
    const preview = embedded.locator('img[src^="data:image/png;base64,"]');
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBe(1);
    await up.hover();
    const restingColor = await file.evaluate((entry) => getComputedStyle(entry).backgroundColor);
    const thumb = await fileRow.locator('[data-thumbnail-state="ready"]').boundingBox();
    if (thumb === null) throw new Error('The template thumbnail is missing');
    await page.mouse.click(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await up.hover();
    await expect(file).toHaveAttribute('aria-pressed', 'true');
    await expect(file).not.toHaveCSS('background-color', restingColor);
    await expect(corrupt).toHaveAttribute('aria-pressed', 'false');
    await expect(folder.getByText('notes.txt')).toHaveCount(0);
    await folder.getByRole('button', { name: 'Import package', exact: true }).click();
    await expect(folder).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          async (id) =>
            (await window.cg.templates.list({ channel: 1 })).some(
              (template) => template.templateId === id,
            ),
          packageId,
        ),
      )
      .toBe(true);
    expect(handle.runtime.stackSnapshot(1)).toHaveLength(0);
    await page.getByRole('button', { name: 'Shared folder…', exact: true }).click();
    await expect(folder.getByRole('button', { name: 'خبر.vcg', exact: true })).toBeVisible();
  } finally {
    await rm(shared, { recursive: true, force: true });
  }
});

test('R-108 imported Templates show row thumbnails and the larger selected preview', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const shared = await mkdtemp(join(tmpdir(), 'cg-catalogue-preview-'));
  const embeddedId = 'tpl-catalogue-embedded';
  const legacyId = 'tpl-catalogue-legacy';
  const oldEntryId = 'tpl-catalogue-no-package';
  const rowThumb = '[data-template-thumbnail="row"]';
  const detailThumb = '[data-template-thumbnail="detail"]';
  const pngImage = 'img[src^="data:image/png;base64,"]';
  const stillFrame = 'iframe[title="Template thumbnail"]';
  const catalogue = (console: Page) => console.getByRole('dialog', { name: /Templates · CH 1/ });
  const openCatalogue = (console: Page) =>
    console.getByRole('button', { name: 'Open templates', exact: true }).click();
  const entry = (console: Page, id: string) =>
    catalogue(console).locator(`[data-template-id="${id}"]`);
  const details = (console: Page) =>
    catalogue(console).getByRole('complementary', { name: 'Template details' });
  const select = (console: Page, id: string) =>
    entry(console, id)
      .getByRole('button', { name: /^Select / })
      .click();
  const checkPreviewPixels = async (
    console: Page,
    preview: Locator,
    artwork?: { color: string; minimum: number },
  ) => {
    const colors = await preview.evaluate((element) =>
      ['--r-checker-a', '--r-checker-b'].map((name) =>
        getComputedStyle(element).getPropertyValue(name).trim(),
      ),
    );
    const png = await preview.screenshot();
    const counts = await console.evaluate(
      async ({ colors, image }) => {
        const bytes = Uint8Array.from(atob(image), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        try {
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (ctx === null) throw new Error('Cannot decode preview pixels');
          ctx.drawImage(bitmap, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          return colors.map((color, index) => {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const [red, green, blue] = ctx.getImageData(0, 0, 1, 1).data;
            let count = 0;
            const tolerance = index < 2 ? 0 : 3;
            for (let at = 0; at < pixels.length; at += 4) {
              if (
                Math.abs((pixels[at] ?? 0) - (red ?? 0)) <= tolerance &&
                Math.abs((pixels[at + 1] ?? 0) - (green ?? 0)) <= tolerance &&
                Math.abs((pixels[at + 2] ?? 0) - (blue ?? 0)) <= tolerance
              )
                count++;
            }
            return count;
          });
        } finally {
          bitmap.close();
        }
      },
      {
        colors: artwork === undefined ? colors : [...colors, artwork.color],
        image: png.toString('base64'),
      },
    );
    const [dark, light, visibleArtwork] = counts;
    expect(dark).toBeGreaterThan(100);
    expect(light).toBeGreaterThan(100);
    if (artwork !== undefined) expect(visibleArtwork).toBeGreaterThanOrEqual(artwork.minimum);
  };
  const whiteArtwork = { color: '#ffffff', minimum: 100 };
  const bookArtwork = { color: '#2074d8', minimum: 100 };

  try {
    const embeddedPng = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Cannot make a transparent preview fixture');
      context.fillStyle = '#ffffff';
      context.fillRect(80, 40, 160, 100);
      return canvas.toDataURL('image/png').split(',')[1] ?? '';
    });
    await writeFile(
      join(shared, 'embedded.vcg'),
      await buildValidVcg(embeddedId, Buffer.from(embeddedPng, 'base64')),
    );
    const legacySource = await unpack(await buildBookVcg(legacyId));
    const sequence = legacySource.scene.layers[0]?.children.find(({ type }) => type === 'sequence');
    const pages = legacySource.scene.fields.find(({ id }) => id === 'pages');
    if (sequence === undefined || pages?.type !== 'list')
      throw new Error('Book fixture is missing');
    sequence.transform.position = { x: 900, y: 660 };
    sequence.transform.size = { w: 800, h: 360 };
    // Match the dimensions and MIME of the owner's retained 87-page Quran VCG.
    const picture = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 2040;
        canvas.height = 980;
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('Cannot make a legacy JPEG fixture');
        context.fillStyle = '#2074d8';
        context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg').split(',')[1] ?? '';
      }),
      'base64',
    );
    const sha256 = sha256Hex(picture);
    const picturePath = `assets/image/${sha256}.jpg`;
    const assetId = 'bound-preview-picture';
    pages.default = [
      { id: 'preview-title', text: 'Opening title' },
      { id: 'preview-picture', kind: 'image', assetId },
    ];
    const legacyPackage = await pack({
      scene: legacySource.scene,
      manifestExtras: {
        ...legacySource.manifest,
        assetIndex: [
          {
            id: assetId,
            path: picturePath,
            kind: 'image',
            bytes: picture.length,
            sha256,
            mime: 'image/jpeg',
          },
        ],
      },
      indexHtml: '<!doctype html><html><body>Legacy book</body></html>',
      cgJs: '/* CG Control builds the served page */',
      cgCss: '/* CG Control builds the served page */',
      assets: new Map([[picturePath, picture]]),
    });
    await writeFile(join(shared, 'legacy.vcg'), legacyPackage);
    const handle = await boot(false, shared);
    await openConsole(page, handle.url);
    await openCatalogue(page);
    await catalogue(page).getByRole('button', { name: 'Shared folder…', exact: true }).click();
    const folder = page.getByRole('dialog', { name: 'Shared template folder', exact: true });
    const sharedLegacy = folder.getByRole('row').filter({
      has: page.getByRole('button', { name: 'legacy.vcg', exact: true }),
    });
    const legacyPreview = sharedLegacy.locator(stillFrame);
    const legacyFrame = sharedLegacy.frameLocator(stillFrame);
    const legacyCaption = legacyFrame.locator('[data-cg-element-id="el-name"]');
    const bookImage = `img[data-cg-asset-id="${assetId}"]`;
    await expect(legacyCaption).toBeVisible();
    await expect(legacyFrame.locator(bookImage)).toHaveAttribute('src', /^data:image\/jpeg/);
    await expect
      .poll(() =>
        legacyFrame.locator(bookImage).evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(2040);
    expect(
      await legacyPreview.evaluate((frame) => {
        const slot = frame.parentElement;
        return [frame.clientWidth, frame.clientHeight, slot?.clientWidth, slot?.clientHeight];
      }),
    ).toEqual([80, 45, 80, 45]);
    const [caption, frame] = await Promise.all([
      legacyCaption.boundingBox(),
      legacyPreview.boundingBox(),
    ]);
    if (caption === null || frame === null)
      throw new Error('The shared preview has no drawable box');
    expect(caption.y + caption.height).toBeLessThanOrEqual(frame.y + frame.height);
    await checkPreviewPixels(page, legacyPreview, bookArtwork);
    await folder.getByRole('button', { name: 'embedded.vcg', exact: true }).click();
    await expect
      .poll(() => folder.locator(pngImage).evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBe(320);
    await checkPreviewPixels(page, folder.locator(pngImage), whiteArtwork);
    await folder.getByRole('button', { name: 'Import package', exact: true }).click();
    await expect(folder).toHaveCount(0);
    await expect(entry(page, embeddedId)).toBeVisible();

    const chooser = await openVcgFileChooser(page, catalogue(page));
    await chooser.setFiles({
      name: 'legacy.vcg',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(legacyPackage),
    });
    await expect(entry(page, legacyId)).toBeVisible();
    expect(handle.runtime.stackSnapshot(1)).toHaveLength(0);

    // A fresh console has neither import in its local browser storage.
    handle.runtime.templateImport({ ...TEMPLATE, templateId: oldEntryId }, HTML, 1);
    const fresh = await freshProfile(browser, page);
    try {
      await openConsole(fresh, handle.url);
      await openCatalogue(fresh);
      const embedded = entry(fresh, embeddedId).locator(rowThumb);
      const legacy = entry(fresh, legacyId).locator(rowThumb);
      const detail = details(fresh).locator(detailThumb);
      const image = embedded.locator(pngImage);
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
        .toBe(320);
      await checkPreviewPixels(fresh, image, whiteArtwork);
      await expect(
        legacy.frameLocator(stillFrame).locator('[data-cg-element-id="el-name"]'),
      ).toBeVisible();
      await expect(entry(fresh, oldEntryId).locator(`${rowThumb} svg`)).toBeVisible();

      await select(fresh, embeddedId);
      await expect(detail.locator(pngImage)).toBeVisible();
      await expect(detail.locator(pngImage)).toHaveCSS('object-fit', 'contain');
      await checkPreviewPixels(fresh, detail.locator(pngImage), whiteArtwork);
      const [rowBox, detailBox] = await Promise.all([embedded.boundingBox(), detail.boundingBox()]);
      if (rowBox === null || detailBox === null) throw new Error('A preview slot has no box');
      expect(detailBox.width).toBeGreaterThan(rowBox.width);
      expect(detailBox.height).toBeGreaterThan(rowBox.height);

      await select(fresh, legacyId);
      await expect(detail.locator(pngImage)).toHaveCount(0);
      await expect(
        detail.frameLocator(stillFrame).locator('[data-cg-element-id="el-name"]'),
      ).toBeVisible();
      await expect
        .poll(() =>
          detail
            .frameLocator(stillFrame)
            .locator(bookImage)
            .evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBe(2040);
      await checkPreviewPixels(fresh, detail.locator(stillFrame), bookArtwork);
      await select(fresh, oldEntryId);
      await expect(detail.locator('img, iframe')).toHaveCount(0);
      await expect(detail.locator('svg')).toBeVisible();
    } finally {
      await fresh.context().close();
    }

    // Same-version Bridge without the optional route leaves the catalogue usable.
    const older = await freshProfile(browser, page);
    try {
      const port = new URL(handle.url).port;
      const capabilityRequests = new Set<string>();
      let thumbnailRequests = 0;
      await older
        .context()
        .routeWebSocket(new RegExp(`^ws://127\\.0\\.0\\.1:${port}`), (socket) => {
          const server = socket.connectToServer();
          socket.onMessage((message) => {
            const frame = JSON.parse(String(message)) as {
              type: string;
              channel?: string;
              id: string;
            };
            if (frame.type === 'request') {
              if (frame.channel === 'bridge.capabilities') capabilityRequests.add(frame.id);
              if (frame.channel === 'templates.thumbnail') thumbnailRequests++;
            }
            server.send(message);
          });
          server.onMessage((message) => {
            const frame = JSON.parse(String(message)) as {
              type: string;
              id: string;
              payload: { channels?: string[]; templateThumbnails?: boolean };
            };
            if (frame.type === 'response' && capabilityRequests.delete(frame.id)) {
              delete frame.payload.templateThumbnails;
              frame.payload.channels =
                frame.payload.channels?.filter((ch) => ch !== 'templates.thumbnail') ?? [];
              socket.send(JSON.stringify(frame));
            } else {
              socket.send(message);
            }
          });
        });
      await openConsole(older, handle.url);
      await openCatalogue(older);
      await expect(entry(older, embeddedId).locator(`${rowThumb} svg`)).toBeVisible();
      await expect(entry(older, legacyId).locator(`${rowThumb} svg`)).toBeVisible();
      await select(older, embeddedId);
      await expect(details(older).getByText('embedded', { exact: true })).toBeVisible();
      await expect(details(older).locator(detailThumb)).toHaveCount(0);
      await expect(catalogue(older).locator(`${rowThumb} img, ${rowThumb} iframe`)).toHaveCount(0);
      await expect(older.locator('[data-bridge-skew-banner]')).toHaveCount(0);
      expect(thumbnailRequests).toBe(0);
    } finally {
      await older.context().close();
    }
  } finally {
    await rm(shared, { recursive: true, force: true });
  }
});

test('R-108 shared folder imports remember the source for single and bulk Reload', async ({
  page,
}) => {
  const shared = await mkdtemp(join(tmpdir(), 'cg-shared-reload-'));
  try {
    await mkdir(join(shared, 'خبر'));
    const packageId = 'tpl-shared-reload';
    const source = join(shared, 'خبر', 'تیتر.vcg');
    await writeFile(source, await buildValidVcg(packageId));
    const handle = await boot(false, shared);
    handle.runtime.templateImport({ ...TEMPLATE, templateId: packageId }, HTML, 1);
    await openConsole(page, handle.url);
    const open = page.getByRole('button', { name: 'Open templates', exact: true });
    const templates = page.getByRole('dialog', { name: /Templates · CH 1/ });
    const reload = templates.locator(`[data-template-reload="${packageId}"]`);
    const reloadAll = templates.getByRole('button', { name: 'Reload all', exact: true });
    await open.click();
    await expect(reload).toBeDisabled();
    await templates.getByRole('button', { name: 'Shared folder…', exact: true }).click();
    const folder = page.getByRole('dialog', { name: 'Shared template folder', exact: true });
    await folder.getByRole('button', { name: 'خبر', exact: true }).click();
    await folder.getByRole('button', { name: 'تیتر.vcg', exact: true }).click();
    await folder.getByRole('button', { name: 'Import package', exact: true }).click();
    await templates.getByRole('button', { name: /^Update / }).click();
    await expect(reload).toBeEnabled();

    await page.reload();
    await open.click();
    await expect(reload).toBeEnabled();
    await expect(reloadAll).toBeEnabled();
    const itemId = 'shared-source-bound';
    expect(
      await handle.runtime.loadFixed({ channel: 1, layer: ROW }, itemId, packageId, {
        anchor: 'متن اپراتور',
      }),
    ).toMatchObject({ accepted: true });

    await writeFile(source, await buildPositionedVcg(packageId));
    await reload.click();
    await templates.getByRole('button', { name: 'Reload and keep current data' }).click();
    await expect.poll(() => handle.runtime.templateGet(packageId, 1)?.name).toBe('e2e-positioned');
    expect(handle.runtime.stackSnapshot(1)[0]).toMatchObject({
      itemId,
      templateId: packageId,
      fields: { anchor: 'متن اپراتور' },
    });

    await writeFile(source, await buildValidVcg(packageId));
    await reloadAll.click();
    await templates.getByRole('button', { name: 'Reload and use file defaults' }).click();
    await expect.poll(() => handle.runtime.stackSnapshot(1)[0]?.fields.anchor).toBe('سارا نادری');
    expect(handle.runtime.stackSnapshot(1)[0]?.itemId).toBe(itemId);
    expect(handle.runtime.templateList(1).map(({ templateId }) => templateId)).toEqual([packageId]);
  } finally {
    await rm(shared, { recursive: true, force: true });
  }
});

test('R-117 previews draft fields while Play and Update control the same programme row', async ({
  page,
}) => {
  const handle = await boot();
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const itemId = 'independent-pvw-item';
  const templateId = 'tpl-independent-pvw';
  handle.runtime.templateImport(
    {
      ...TEMPLATE,
      templateId,
      name: 'Independent PVW',
      fields: [{ id: 'headline', label: 'Headline', type: 'text', required: false, default: '' }],
    },
    '<!doctype html><html><body><div id="headline"></div><script>' +
      'window.play=function(){};window.stop=function(){};window.next=function(){};' +
      'window.update=function(json){document.querySelector("#headline").textContent=JSON.parse(json).headline;};' +
      '</script></body></html>',
    1,
  );
  expect(
    await handle.runtime.loadFixed({ channel: 1, layer: ROW }, itemId, templateId, {
      headline: 'Applied headline',
    }),
  ).toMatchObject({ accepted: true });
  await openConsole(page, handle.url);
  await showMonitors(page);
  const layer = row(page);
  const play = layer.getByRole('button', { name: 'PLAY', exact: true });
  const onPvw = layer.getByRole('button', { name: 'ON PVW', exact: true });
  const offPvw = layer.getByRole('button', { name: 'OFF PVW', exact: true });
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const rendered = pvw.frameLocator('iframe[data-rehearsal-frame]').locator('#headline');
  const commands = () =>
    engine
      .receivedCommands()
      .map(({ line }) => line)
      .filter((line) => new RegExp(`(?:CG|MIXER|CLEAR) 1-${String(ROW)}(?: |$)`).test(line));

  await layer.locator('[data-row-body]').click();
  const field = page
    .getByRole('complementary', { name: 'Inspector' })
    .getByRole('textbox', { name: /^headline$/i });
  await expect(field).toHaveValue('Applied headline');
  const beforePvw = commands();
  await onPvw.click();
  await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
  await field.fill('Draft headline');
  await expect(rendered).toHaveText('Draft headline');
  expect(commands()).toEqual(beforePvw);
  await expect(play).toBeEnabled();

  await play.click();
  await expect(layer).toHaveAttribute('aria-label', /ON AIR$/);
  await expect(offPvw).toBeVisible();
  await expect(rendered).toHaveText('Draft headline');
  const take = commands().slice(beforePvw.length);
  expect(take.some((line) => line.includes('Applied headline'))).toBe(true);
  expect(take.some((line) => line.includes('Draft headline'))).toBe(false);

  const beforeToggle = commands();
  await offPvw.click();
  await expect(onPvw).toBeEnabled();
  await onPvw.click();
  await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(rendered).toHaveText('Draft headline');
  await expect(layer).toHaveAttribute('aria-label', /ON AIR$/);
  await field.fill('Second draft');
  await expect(rendered).toHaveText('Second draft');
  expect(commands()).toEqual(beforeToggle);

  await page
    .getByRole('button', { name: 'Apply staged edits to the on-air row', exact: true })
    .click();
  await expect
    .poll(() =>
      commands()
        .slice(beforeToggle.length)
        .some((line) => line.includes('Second draft')),
    )
    .toBe(true);
  await layer.getByRole('button', { name: 'STOP', exact: true }).click();
  await expect(layer).not.toHaveAttribute('aria-label', /ON AIR$/);
  await expect(offPvw).toBeVisible();
  await expect(rendered).toHaveText('Second draft');
});

test('R-117 drafts Position in PVW and moves the resident page on Update on air', async ({
  page,
}) => {
  const handle = await boot();
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const itemId = 'live-position-item';
  const templateId = 'tpl-live-position';
  const { scene } = await unpack(await buildPositionedVcg(templateId));
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  handle.runtime.templateImport(
    {
      ...TEMPLATE,
      templateId,
      name: 'Live Position',
      liveSources: buildTemplateLiveSources(scene),
      fields: [{ id: 'anchor', label: 'Anchor text', type: 'text', required: false, default: '' }],
    },
    html,
    1,
  );
  const slot = { channel: 1, layer: ROW };
  expect(
    await handle.runtime.loadFixed(slot, itemId, templateId, { anchor: 'Applied text' }),
  ).toMatchObject({ accepted: true });
  await openConsole(page, handle.url);
  await showMonitors(page);
  const layer = row(page);
  const rowDraft = layer.getByText('● draft', { exact: true });
  await layer.locator('[data-row-body]').click();
  await layer.getByRole('button', { name: 'ON PVW', exact: true }).click();
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
  await layer.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(layer).toHaveAttribute('aria-label', /ON AIR$/);
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const x = inspector.getByRole('textbox', { name: 'Position offset X', exact: true });
  const y = inspector.getByRole('textbox', { name: 'Position offset Y', exact: true });
  const reset = inspector.getByRole('button', { name: 'Reset position', exact: true });
  await expect(x).toBeEnabled();
  await expect(reset).toBeDisabled();
  await expect(rowDraft).toHaveCount(0);

  const add = engine.lastCgAdd(slot);
  if (add === undefined || !add.template.startsWith('http') || add.data === null)
    throw new Error('The managed programme page was not served on Take');
  const air = await page.context().newPage();
  try {
    await air.setViewportSize({ width: 1920, height: 1080 });
    await air.goto(add.template);
    await air.waitForFunction(
      () => typeof (window as unknown as { update?: unknown }).update === 'function',
    );
    const updateAir = (data: string): Promise<void> =>
      air.evaluate(
        (payload) => (window as unknown as { update: (value: string) => void }).update(payload),
        data,
      );
    await updateAir(add.data);
    const airStage = air.locator('.cg-stage');
    const initialPosition = await airStage.evaluate((stage) => getComputedStyle(stage).transform);
    const wire = () =>
      engine
        .receivedCommands()
        .map(({ line }) => line)
        .filter((line) => /^(CG|MIXER|CLEAR) 1-99(?: |$)/.test(line));
    const before = wire();
    await inspector.getByRole('button', { name: 'Anchor top-left', exact: true }).click();
    await x.fill('320');
    await y.fill('40');
    await expect(rowDraft).toBeVisible();
    await expect(rowDraft).toHaveCSS('margin-inline-start', '8px');
    await inspector.getByRole('textbox', { name: 'anchor', exact: true }).fill('Draft text');
    const previewStage = pvw.frameLocator('iframe[data-rehearsal-frame]').locator('.cg-stage');
    const moved = 'matrix(1, 0, 0, 1, 320, 40)';
    await expect(previewStage).toHaveCSS('transform', moved);
    expect(wire()).toEqual(before);
    await expect(airStage).toHaveCSS('transform', initialPosition);
    await inspector.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
    await expect(inspector.getByLabel('Position has unapplied changes')).toHaveCount(0);
    await expect(rowDraft).toHaveCount(0);

    const applied = wire().slice(before.length);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatch(/^CG 1-99 UPDATE /);
    const data = engine.lastCgUpdate(slot)?.data;
    if (data == null) throw new Error('The on-air update was not decoded');
    expect(JSON.parse(data)).toMatchObject({
      anchor: 'Draft text',
      __cg: { position: { anchor: 'top-left', offset: { x: 320, y: 40 } } },
    });
    await updateAir(data);
    await expect(airStage).toHaveCSS('transform', moved);
    await expect(airStage.locator('[data-cg-element-id="el-name"]')).toContainText('Draft text');
    await expect(layer).toHaveAttribute('aria-label', /ON AIR$/);

    // Audio can reassert its settled level after the earlier programme update.
    const positionWire = () => wire().filter((line) => !line.startsWith('MIXER 1-99 VOLUME '));
    const beforeReset = positionWire();
    await reset.click();
    await expect(inspector.getByRole('button', { name: 'Anchor bottom-right' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(x).toHaveValue('-10');
    await expect(y).toHaveValue('-20');
    await expect(rowDraft).toBeVisible();
    await expect(previewStage).toHaveCSS('transform', initialPosition);
    await expect(airStage).toHaveCSS('transform', moved);
    expect(positionWire()).toEqual(beforeReset);

    await inspector.getByRole('button', { name: 'Discard staged edits' }).click();
    await expect(previewStage).toHaveCSS('transform', moved);
    await expect(x).toHaveValue('320');
    await expect(rowDraft).toHaveCount(0);
    expect(positionWire()).toEqual(beforeReset);

    await reset.click();
    await expect(rowDraft).toBeVisible();
    await layer.scrollIntoViewIfNeeded();
    await layer.click({ button: 'right' });
    const updateRow = page.getByRole('menu').getByRole('menuitem', { name: 'UPDATE', exact: true });
    await expect(updateRow).toBeEnabled();
    await updateRow.click();
    await expect(inspector.getByLabel('Position has unapplied changes')).toHaveCount(0);
    await expect(rowDraft).toHaveCount(0);
    expect(positionWire().slice(beforeReset.length)).toEqual([
      expect.stringMatching(/^CG 1-99 UPDATE /),
    ]);
    const resetData = engine.lastCgUpdate(slot)?.data;
    if (resetData == null) throw new Error('The on-air reset was not decoded');
    expect(JSON.parse(resetData)).toMatchObject({
      __cg: { position: { anchor: 'bottom-right', offset: { x: -10, y: -20 } } },
    });
    await updateAir(resetData);
    await expect(airStage).toHaveCSS('transform', initialPosition);
    await expect(airStage.locator('[data-cg-element-id="el-name"]')).toContainText('Draft text');
  } finally {
    await air.close();
  }
});

test('Frames drafts the authored box and whole-template Position moves the retained live seat', async ({
  page,
}) => {
  const handle = await boot(true);
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const itemId = 'editable-live-frame';
  const templateId = 'tpl-pvw-crop';
  const { scene: base } = await unpack(await buildPositionedVcg(templateId));
  const layer = base.layers[0];
  const title = layer?.children.find((element) => element.type === 'text');
  if (layer === undefined || title === undefined) throw new Error('Missing test title');
  const transform = (x: number, y: number, w: number, h: number) => ({
    ...title.transform,
    position: { x, y },
    size: { w, h },
    anchor: { x: 0, y: 0 },
  });
  const scene = SceneSchema.parse({
    ...base,
    layers: [
      {
        ...layer,
        children: [
          {
            id: 'live-box',
            name: 'Live box',
            type: 'composition',
            compositionId: 'live-box-doc',
            transform: transform(600, 350, 400, 300),
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
          },
        ],
      },
    ],
    compositions: [
      {
        id: 'live-box-doc',
        name: 'Live box',
        resolution: { width: 400, height: 300 },
        frameRange: base.frameRange,
        editorBackdrop: 'transparent',
        fields: [],
        bindings: [],
        layers: [
          {
            ...layer,
            id: 'live-box-layer',
            children: [
              {
                id: 'live-guest',
                name: 'Guest',
                type: 'video-placeholder',
                routeKey: 'guest',
                operatorPlacement: 'proportional',
                fitMode: 'cover',
                transform: transform(0, 0, 400, 300),
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
              },
              {
                ...title,
                id: 'live-title',
                liveForeground: false,
                transform: transform(20, 220, 180, 42),
                zIndex: 1,
              },
            ],
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
  });
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  handle.runtime.templateImport(
    { ...TEMPLATE, templateId, liveSources: buildTemplateLiveSources(scene) },
    html,
    1,
  );
  const slot = { channel: 1, layer: 59 };
  expect(await handle.runtime.loadFixed(slot, itemId, templateId, {})).toMatchObject({
    accepted: true,
  });
  await openConsole(page, handle.url);
  await showMonitors(page);
  const plateRow = page.getByRole('region', { name: 'Layers' }).locator('[data-layer="59"]');
  await plateRow.locator('[data-row-body]').click();
  const frameEffect = page.getByRole('group', { name: 'Frame effect' });
  await expect(frameEffect).toHaveCount(0);
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const pan = pvw.getByRole('button', { name: 'Crop input in Preview', exact: true });
  await expect(pan).toHaveCount(0);
  await plateRow.getByRole('button', { name: 'ON PVW', exact: true }).click();
  await expect(pan).toBeDisabled();
  const tools = pvw.locator('[data-monitor-move], [data-monitor-pan], [data-monitor-frames]');
  await expect(tools).toHaveText(['Move template', 'Crop input', 'Edit frames']);
  const labels = tools.locator('.cg-pvw-tool-label');
  const header = pvw.locator('.cg-panel-header--monitor');
  const headerLayout = () =>
    header.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll('button')].map((button) =>
        button.getBoundingClientRect(),
      );
      return {
        height: box.height,
        singleRow: buttons.every(({ top }) => Math.abs(top - (buttons[0]?.top ?? top)) < 1),
        inside: buttons.every(({ left, right }) => left >= box.left && right <= box.right),
        distinct: buttons.every(({ right }, index) => right <= (buttons[index + 1]?.left ?? right)),
      };
    });
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
  await expect(labels.first()).toBeVisible();
  const full = await headerLayout();
  expect(full).toMatchObject({ singleRow: true, inside: true, distinct: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
  await expect(labels.first()).toBeHidden();
  await expect(tools.locator('svg')).toHaveCount(3);
  expect(await headerLayout()).toEqual(full);

  await pvw.getByRole('button', { name: 'Show PREVIEW (PVW) fullscreen' }).click();
  await pvw.getByRole('button', { name: 'Monitor, selected layer and Inspector' }).click();
  await page.setViewportSize({ width: 620, height: 900 });
  await expect(page.locator('[data-monitor-inspector-companion]')).toBeVisible();
  await expect(labels.first()).toBeHidden();
  await expect(pvw.getByRole('button', { name: 'Exit fullscreen PREVIEW (PVW)' })).toBeVisible();
  expect(await headerLayout()).toEqual(full);
  await page.setViewportSize({ width: 1600, height: 900 });
  await pvw.getByRole('button', { name: 'Exit fullscreen PREVIEW (PVW)' }).click();
  await expect(labels.first()).toBeVisible();
  const moveTemplate = pvw.getByRole('button', { name: 'Move template in Preview', exact: true });
  await moveTemplate.click();
  await expect(moveTemplate).toHaveAttribute('aria-pressed', 'true');
  const framesButton = pvw.getByRole('button', { name: 'Edit frames in Preview', exact: true });
  const framesIcon = framesButton.locator('svg.lucide-frame[aria-hidden="true"]');
  await expect(framesIcon).toBeVisible();
  await expect(framesIcon).toHaveAttribute('width', '13');
  await expect(framesButton).toHaveText('Edit frames');
  await framesButton.click();
  await expect(framesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(moveTemplate).toHaveAttribute('aria-pressed', 'false');
  const move = pvw.getByRole('button', { name: 'Move frame for Crop source' });
  const resize = pvw.getByRole('button', { name: 'Resize Crop source from bottom right' });
  const artwork = pvw
    .frameLocator('iframe[data-rehearsal-frame]')
    .locator('[data-cg-frame-artwork="live-box"]');
  const plate = artwork.locator('[data-cg-element-id="live-guest"]');
  const renderedTitle = artwork.locator('[data-cg-element-id="live-title"]');
  await expect(move).toBeVisible();
  const readBox = async () => {
    const [picture, caption] = await Promise.all([
      plate.boundingBox(),
      renderedTitle.boundingBox(),
    ]);
    if (picture === null || caption === null) throw new Error('Frame and title should both render');
    return { picture, caption };
  };
  const original = await readBox();
  const before = engine.receivedCommands().filter(({ line }) => /^(CG|MIXER) /.test(line));
  const dragControl = async (control: typeof move, dx: number, dy: number) => {
    const bounds = await control.boundingBox();
    if (bounds === null) throw new Error('Missing frame placement control');
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
  };
  await dragControl(move, 25, 0);
  await expect.poll(async () => (await readBox()).picture.x).toBeGreaterThan(original.picture.x);
  const moved = await readBox();
  expect(moved.caption.x - original.caption.x).toBeCloseTo(moved.picture.x - original.picture.x, 1);
  await page.getByRole('button', { name: 'Discard staged edits' }).click();
  await expect.poll(async () => (await readBox()).picture.x).toBeCloseTo(original.picture.x, 1);

  await dragControl(resize, 22, 7);
  await expect
    .poll(async () => (await readBox()).picture.width)
    .toBeGreaterThan(original.picture.width);
  const resized = (await readBox()).picture;
  expect(resized.width / resized.height).toBeCloseTo(4 / 3, 2);
  await page.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  await expect
    .poll(
      () =>
        handle.runtime.stackSnapshot().find((item) => item.itemId === itemId)?.framePlacements?.[0]
          ?.rect.width ?? 0,
    )
    .toBeGreaterThan(400);
  expect(engine.receivedCommands().filter(({ line }) => /^(CG|MIXER) /.test(line))).toEqual(before);
  await plateRow.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(plateRow).toHaveAttribute('aria-label', /ON AIR$/);
  const add = engine.lastCgAdd(slot);
  expect(JSON.parse(add?.data ?? '{}')).toMatchObject({
    __cg: { framePlacements: [{ frameKey: 'live-box/live-guest' }] },
  });
  if (add === undefined || add.data === null) throw new Error('Frame page is missing on Take');
  const air = await page.context().newPage();
  try {
    await air.setViewportSize({ width: 1920, height: 1080 });
    await air.goto(add.template);
    await air.waitForFunction(
      () => typeof (window as unknown as { update?: unknown }).update === 'function',
    );
    const tellAir = (data: string) =>
      air.evaluate(
        (payload) => (window as unknown as { update: (value: string) => void }).update(payload),
        data,
      );
    await tellAir(add.data);
    const airTitle = air.locator('[data-cg-element-id="live-title"]');
    const beforeAir = await airTitle.boundingBox();
    if (beforeAir === null) throw new Error('The programme page has no title');

    await expect(move).toBeVisible();
    const liveStart = engine.receivedCommands().length;
    await dragControl(move, 25, 0);
    expect((await airTitle.boundingBox())?.x).toBeCloseTo(beforeAir.x, 1);
    await page.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
    await expect
      .poll(() =>
        engine
          .receivedCommands()
          .slice(liveStart)
          .some(({ line }) => line === 'MIXER 1 COMMIT'),
      )
      .toBe(true);
    const wire = engine
      .receivedCommands()
      .slice(liveStart)
      .map(({ line }) => line);
    expect(wire).toContainEqual(expect.stringMatching(/^MIXER 1-\d+ FILL .* DEFER$/));
    expect(wire).toContainEqual(expect.stringMatching(/^MIXER 1-\d+ CLIP .* DEFER$/));
    expect(wire.some((line) => /^(?:PLAY |CG \d+-\d+ (?:ADD|PLAY) )/.test(line))).toBe(false);
    const liveData = engine.lastCgUpdate(slot)?.data;
    if (liveData == null) throw new Error('The programme page did not receive a frame update');
    await tellAir(liveData);
    await expect
      .poll(async () => (await airTitle.boundingBox())?.x ?? 0)
      .toBeGreaterThan(beforeAir.x);

    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    const offsetX = inspector.getByRole('textbox', { name: 'Position offset X' });
    const offsetY = inspector.getByRole('textbox', { name: 'Position offset Y' });
    const rowDraft = plateRow.getByText('● draft', { exact: true });
    await expect(offsetX).toBeEnabled();
    await expect(offsetY).toBeEnabled();
    await expect(rowDraft).toHaveCount(0);
    const dx = 120;
    const dy = 54;
    const x = Number(await offsetX.inputValue()) + dx;
    const y = Number(await offsetY.inputValue()) + dy;
    const previousPreview = await readBox();
    const previousAir = await airTitle.boundingBox();
    if (previousAir === null) throw new Error('The programme title is missing before Position');

    const start = engine.receivedCommands().length;
    const positionWire = () =>
      engine
        .receivedCommands()
        .slice(start)
        .map(({ line }) => line)
        .filter((line) =>
          /^(CG |PLAY |LOADBG |CLEAR |MIXER 1 COMMIT|MIXER 1-\d+ (FILL|CLIP) )/.test(line),
        );
    await offsetX.fill(String(x));
    await offsetY.fill(String(y));
    await expect(rowDraft).toBeVisible();
    await expect
      .poll(async () => (await readBox()).caption.x)
      .toBeGreaterThan(previousPreview.caption.x);
    const previewAfter = await readBox();
    expect(previewAfter.caption.x - previousPreview.caption.x).toBeCloseTo(
      previewAfter.picture.x - previousPreview.picture.x,
      1,
    );
    expect(positionWire()).toEqual([]);
    expect(await airTitle.boundingBox()).toEqual(previousAir);

    await inspector.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
    await expect(rowDraft).toHaveCount(0);
    const applied = positionWire();
    expect(applied).toEqual([
      expect.stringMatching(/^MIXER 1-\d+ FILL .* DEFER$/),
      expect.stringMatching(/^MIXER 1-\d+ CLIP .* DEFER$/),
      expect.stringMatching(/^CG 1-59 UPDATE /),
      'MIXER 1 COMMIT',
    ]);
    for (const mixer of ['FILL', 'CLIP']) {
      const geometry = (commands: string[]) => {
        const parts = commands.find((command) => command.includes(` ${mixer} `))?.split(' ');
        if (parts === undefined) throw new Error(`Missing ${mixer} geometry`);
        return {
          seat: parts[1],
          x: Number(parts[3]),
          y: Number(parts[4]),
          size: parts.slice(5, 7),
        };
      };
      const before = geometry(wire);
      const after = geometry(applied);
      expect(after.seat).toBe(before.seat);
      expect(after.size).toEqual(before.size);
      expect(after.x - before.x).toBeCloseTo(dx / 1920, 4);
      expect(after.y - before.y).toBeCloseTo(dy / 1080, 4);
    }
    const positionData = engine.lastCgUpdate(slot)?.data;
    if (positionData == null) throw new Error('The programme page did not receive Position');
    expect(JSON.parse(positionData)).toMatchObject({ __cg: { position: { offset: { x, y } } } });
    await tellAir(positionData);
    await expect
      .poll(async () => (await airTitle.boundingBox())?.x ?? 0)
      .toBeCloseTo(previousAir.x + dx, 1);
    await expect(plateRow).toHaveAttribute('aria-label', /ON AIR$/);

    const reset = inspector.getByRole('button', { name: 'Reset frames', exact: true });
    const airPlate = air.locator('[data-cg-element-id="live-guest"]');
    const changedFrame = await readBox();
    const changedAir = await airPlate.boundingBox();
    if (changedAir === null) throw new Error('The programme frame is missing before Reset frames');
    const appliedRow = () => handle.runtime.stackSnapshot(1).find((item) => item.itemId === itemId);
    const appliedPosition = appliedRow()?.position;
    const beforeReset = positionWire();
    await expect(reset).toBeEnabled();
    await reset.click();
    await expect(rowDraft).toBeVisible();
    await expect
      .poll(async () => (await readBox()).picture.width)
      .toBeCloseTo(original.picture.width, 1);
    expect(positionWire()).toEqual(beforeReset);
    expect(await airPlate.boundingBox()).toEqual(changedAir);

    await inspector.getByRole('button', { name: 'Discard staged edits', exact: true }).click();
    await expect
      .poll(async () => (await readBox()).picture.width)
      .toBeCloseTo(changedFrame.picture.width, 1);
    await expect(rowDraft).toHaveCount(0);
    expect(positionWire()).toEqual(beforeReset);

    await reset.click();
    await inspector.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
    await expect(rowDraft).toHaveCount(0);
    expect(appliedRow()?.framePlacements ?? []).toHaveLength(0);
    expect(appliedRow()?.position).toEqual(appliedPosition);
    await expect(offsetX).toHaveValue(String(x));
    await expect(offsetY).toHaveValue(String(y));
    expect(positionWire().slice(beforeReset.length)).toEqual([
      expect.stringMatching(/^MIXER 1-\d+ FILL .* DEFER$/),
      expect.stringMatching(/^MIXER 1-\d+ CLIP .* DEFER$/),
      expect.stringMatching(/^CG 1-59 UPDATE /),
      'MIXER 1 COMMIT',
    ]);
    const resetData = engine.lastCgUpdate(slot)?.data;
    if (resetData == null) throw new Error('The programme page did not receive Reset frames');
    await tellAir(resetData);
    await expect.poll(async () => (await airPlate.boundingBox())?.width ?? 0).toBeCloseTo(400, 1);
    await expect(plateRow).toHaveAttribute('aria-label', /ON AIR$/);

    const motion = frameEffect.getByRole('combobox', { name: 'Motion' });
    const fade = frameEffect.getByRole('checkbox', { name: 'Fade' });
    const duration = frameEffect.getByRole('textbox', { name: 'Duration (ms)' });
    await expect(motion).toHaveValue('cut');
    await expect(fade).not.toBeChecked();
    await expect(duration).toHaveCount(0);
    const effectStart = engine.receivedCommands().length;
    const effectWire = () =>
      engine
        .receivedCommands()
        .slice(effectStart)
        .map(({ line }) => line)
        .filter((line) => /^(CG |PLAY |CLEAR |MIXER )/.test(line));
    await motion.selectOption('ease-in-out');
    await fade.check();
    await expect(duration).toHaveValue('400');
    await duration.fill('۵۰۰');
    await expect(duration).toHaveValue('500');
    await expect(rowDraft).toHaveCount(0);
    const beforeEffect = await readBox();
    await dragControl(move, 30, 0);
    await expect
      .poll(async () => (await readBox()).picture.x)
      .toBeGreaterThan(beforeEffect.picture.x);
    await expect(rowDraft).toBeVisible();
    expect(effectWire()).toEqual([]);
    await inspector.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
    await expect(rowDraft).toHaveCount(0);
    expect(effectWire()).toContainEqual(expect.stringMatching(/^CG 1-59 UPDATE .*frameTransition/));
    for (const tween of ['easeinquad', 'easeoutquad']) {
      expect(effectWire()).toContainEqual(
        expect.stringMatching(new RegExp(`^MIXER 1-\\d+ FILL .* \\d+ ${tween} DEFER$`, 'i')),
      );
    }
    expect(effectWire()).toContainEqual(expect.stringMatching(/^MIXER 1-\d+ OPACITY .* DEFER$/));
    expect(
      effectWire().some((line) => /^(PLAY |CLEAR |CG \d+-\d+ (?:ADD|PLAY|STOP) )/.test(line)),
    ).toBe(false);
  } finally {
    await air.close();
  }
});

test('R-117 PVW outlines use authored stages and Move grabs graphics independently', async ({
  page,
}) => {
  const handle = await boot();
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const exporter = new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  });
  const fixtures = [
    { id: 'lower-pvw-template', layer: 98, width: 1920, height: 1080, x: 190, y: 690 },
    { id: 'upper-pvw-template', layer: 99, width: 420, height: 136, x: 10, y: 10 },
    { id: 'coincident-pvw-template', layer: 97, width: 1920, height: 1080, x: 1120, y: 190 },
  ];
  const initial = { anchor: 'bottom-right', offset: { x: -10, y: -20 } } as const;
  for (const fixture of fixtures) {
    const { scene } = await unpack(await buildPositionedVcg(fixture.id));
    scene.resolution = { width: fixture.width, height: fixture.height };
    const layer = scene.layers[0]!;
    for (const [index, element] of layer.children.entries()) {
      element.transform.position = { x: fixture.x + index * 40, y: fixture.y + index * 40 };
    }
    const { html } = await exporter.produce(scene);
    handle.runtime.templateImport(
      {
        ...TEMPLATE,
        templateId: fixture.id,
        name: fixture.id,
        liveSources: buildTemplateLiveSources(scene),
      },
      html,
      1,
    );
    expect(
      await handle.runtime.loadFixed({ channel: 1, layer: fixture.layer }, fixture.id, fixture.id, {
        anchor: 'News',
      }),
    ).toMatchObject({ accepted: true });
    expect(await handle.runtime.setPosition(fixture.id, initial)).toEqual({ ok: true });
  }
  await openConsole(page, handle.url);
  await showMonitors(page);
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const layer = (n: number) =>
    page.getByRole('region', { name: 'Layers' }).locator(`[data-layer="${n}"]`);
  const lower = pvw.locator('[data-pvw-template-outline="lower-pvw-template"]');
  const upper = pvw.locator('[data-pvw-template-outline="upper-pvw-template"]');
  const coincident = pvw.locator('[data-pvw-template-outline="coincident-pvw-template"]');
  const lowerPage = pvw.frameLocator('iframe[data-rehearsal-frame="lower-pvw-template"]');
  const move = pvw.getByRole('button', { name: 'Move template in Preview', exact: true });
  await expect(move).toBeDisabled();
  await expect(move).toHaveAttribute('aria-pressed', 'false');
  for (const fixture of fixtures)
    await layer(fixture.layer).getByRole('button', { name: 'ON PVW', exact: true }).click();
  await layer(99).locator('[data-row-body]').click();
  await expect(lower).toBeVisible();
  await expect(upper).toBeVisible();
  await expect(coincident).toBeVisible();
  await expect(lowerPage.locator('body')).toHaveClass(/\bcg-pending\b/);
  const [beforeLower, beforeUpper, previewRaster] = await Promise.all([
    lower.boundingBox(),
    upper.boundingBox(),
    pvw.locator('[data-rehearsal-checker]').boundingBox(),
  ]);
  if (beforeLower === null || beforeUpper === null || previewRaster === null)
    throw new Error('The PVW outlines or their raster did not render');
  const fit = previewRaster.width / 1920;
  expect(beforeLower.width).toBeCloseTo(previewRaster.width, 1);
  expect(beforeLower.height).toBeCloseTo(previewRaster.height, 1);
  expect(beforeLower.x).toBeCloseTo(previewRaster.x - 10 * fit, 1);
  expect(beforeLower.y).toBeCloseTo(previewRaster.y - 20 * fit, 1);
  expect(beforeUpper.width).toBeCloseTo(420 * fit, 1);
  expect(beforeUpper.height).toBeCloseTo(136 * fit, 1);
  expect(await coincident.boundingBox()).toEqual(beforeLower);
  await expect(move).toBeEnabled();
  await expect(move).toHaveAttribute('aria-pressed', 'false');
  await expect(lower).not.toHaveAttribute('data-pvw-position-editable', 'true');

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const grip = (id: string) => pvw.locator(`[data-pvw-template-grip="${id}"]`);
  await grip('coincident-pvw-template').click();
  await expect(inspector.getByText('coincident-pvw-template', { exact: true })).toBeVisible();
  await grip('lower-pvw-template').click();
  await expect(inspector.getByText('lower-pvw-template', { exact: true })).toBeVisible();
  await grip('upper-pvw-template').click();
  await expect(inspector.getByText('upper-pvw-template', { exact: true })).toBeVisible();

  const x = inspector.getByRole('textbox', { name: 'Position offset X' });
  const y = inspector.getByRole('textbox', { name: 'Position offset Y' });
  const rowDraft = layer(98).getByText('● draft', { exact: true });
  const appliedPosition = (itemId: string) =>
    handle.runtime.stackSnapshot(1).find((item) => item.itemId === itemId)?.position;
  const programmeCommands = () =>
    engine
      .receivedCommands()
      .map(({ line }) => line)
      .filter((line) => /^(?:CG|MIXER|CLEAR) 1-9[789](?: |$)/.test(line));
  const before = programmeCommands();
  const startX = Math.round(beforeLower.x + 280 * fit);
  const startY = Math.round(beforeLower.y + 770 * fit);
  const moveX = Math.round(170 * fit);
  const moveY = Math.round(-75 * fit);
  const drag = async (fromX: number, fromY: number): Promise<void> => {
    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(fromX + moveX, fromY + moveY, { steps: 4 });
    await page.mouse.up();
  };

  await drag(startX, startY);
  expect(await lower.boundingBox()).toEqual(beforeLower);
  expect(await upper.boundingBox()).toEqual(beforeUpper);
  await expect(inspector.getByLabel('Position has unapplied changes')).toHaveCount(0);
  await expect(rowDraft).toHaveCount(0);
  expect(appliedPosition('lower-pvw-template')).toEqual(initial);
  expect(programmeCommands()).toEqual(before);

  await move.click();
  await expect(move).toHaveAttribute('aria-pressed', 'true');
  await expect(lower).toHaveAttribute('data-pvw-position-editable', 'true');
  await drag(startX, startY);
  await expect(inspector.getByText('lower-pvw-template', { exact: true })).toBeVisible();
  const dx = String(initial.offset.x + Math.round(moveX / fit));
  const dy = String(initial.offset.y + Math.round(moveY / fit));
  await expect(x).toHaveValue(dx);
  await expect(y).toHaveValue(dy);
  await expect(rowDraft).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Anchor bottom-right' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(async () => Math.abs((await lower.boundingBox())!.x - beforeLower.x - moveX))
    .toBeLessThan(2);
  expect(await upper.boundingBox()).toEqual(beforeUpper);
  expect(await coincident.boundingBox()).toEqual(beforeLower);
  expect(programmeCommands()).toEqual(before);
  await expect(lowerPage.locator('body')).toHaveClass(/\bcg-pending\b/);

  const moved = await lower.boundingBox();
  if (moved === null) throw new Error('The moved PVW outline did not render');
  await move.click();
  await expect(move).toHaveAttribute('aria-pressed', 'false');
  await expect(lower).toBeVisible();
  await expect(lower).not.toHaveAttribute('data-pvw-position-editable', 'true');
  await drag(startX + moveX, startY + moveY);
  expect(await lower.boundingBox()).toEqual(moved);
  await expect(x).toHaveValue(dx);
  await expect(y).toHaveValue(dy);
  expect(appliedPosition('lower-pvw-template')).toEqual(initial);
  expect(appliedPosition('upper-pvw-template')).toEqual(initial);
  expect(appliedPosition('coincident-pvw-template')).toEqual(initial);
  expect(programmeCommands()).toEqual(before);

  await inspector.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  await expect(inspector.getByLabel('Position has unapplied changes')).toHaveCount(0);
  await expect(rowDraft).toHaveCount(0);
  expect(appliedPosition('lower-pvw-template')).toEqual({
    anchor: initial.anchor,
    offset: { x: Number(dx), y: Number(dy) },
  });
  expect(programmeCommands()).toEqual(before);
  await pvw.getByRole('button', { name: 'PLAY all 3 rehearsing', exact: true }).click();
  await expect(lowerPage.locator('body')).not.toHaveClass(/\bcg-pending\b/);
  await pvw.getByRole('button', { name: 'STOP all 3 rehearsing', exact: true }).click();
  await expect(lowerPage.locator('body')).toHaveClass(/\bcg-pending\b/);
  await expect(lower).toBeVisible();
  await expect(upper).toBeVisible();
  await expect(coincident).toBeVisible();
  await layer(98).getByRole('button', { name: 'OFF PVW', exact: true }).click();
  await expect(lower).toHaveCount(0);
  await expect(upper).toBeVisible();
});

test('Exported Sequence fits resting descenders and clips the vertical Push', async ({ page }) => {
  const handle = await boot();
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const id = 'sequence-descenders';
  const { scene: base } = await unpack(await buildPositionedVcg(id));
  const layer = base.layers[0];
  if (layer === undefined) throw new Error('The fixture layer is missing');
  const first = 'بپ یتپ';
  const second = 'یپ پتب';
  const font = await readFile(
    new URL('../../public/fonts/vazirmatn/vazirmatn-arabic-400-normal.woff2', import.meta.url),
  );
  // Keep the bundled glyphs and reproduce the custom face's uneven baseline with CSS metrics.
  const fontsCss =
    '@font-face{font-family:SequenceProbe;ascent-override:135%;descent-override:0%;line-gap-override:0%;' +
    `src:url(data:font/woff2;base64,${font.toString('base64')}) format("woff2")}`;
  const scene = SceneSchema.parse({
    ...base,
    defaultPosition: undefined,
    fonts: [],
    fields: [],
    bindings: [],
    layers: [
      {
        ...layer,
        children: [
          {
            id: 'sequence-host',
            name: 'Sequence',
            type: 'sequence',
            transform: {
              position: { x: 1000, y: 950 },
              size: { w: 700, h: 45 },
              anchor: { x: 0, y: 0 },
              scale: { x: 1, y: 1 },
              rotation: 0,
            },
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            font: {
              family: 'SequenceProbe',
              weight: 400,
              style: 'normal',
              size: 32,
              lineHeight: 1.4,
              letterSpacing: 0,
            },
            color: '#ff00ff',
            align: 'start',
            verticalAlign: 'middle',
            direction: 'rtl',
            items: [
              { id: 'first', text: first },
              { id: 'second', text: second },
            ],
            advance: 'manual',
            transitionIn: 'bottom',
            transitionOut: 'top',
            transitionTiming: 'simultaneous',
            transitionMs: 2_000,
          },
        ],
      },
    ],
  });
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss,
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  handle.runtime.templateImport({ ...TEMPLATE, templateId: id, name: id }, html, 1);
  const slot = { channel: 1, layer: ROW };
  expect(await handle.runtime.loadFixed(slot, id, id, {})).toMatchObject({ accepted: true });
  await openConsole(page, handle.url);
  await row(page).getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(row(page)).toHaveAttribute('aria-label', /ON AIR$/);
  const add = engine.lastCgAdd(slot);
  if (add === undefined || !add.template.startsWith('http') || add.data === null)
    throw new Error('The programme page was not served on Take');

  const air = await page.context().newPage();
  try {
    await air.setViewportSize({ width: 1920, height: 1080 });
    await air.clock.install();
    await air.goto(add.template);
    await expect(air.locator('html')).toHaveAttribute('data-cg-ready', '1');
    expect(
      await air.evaluate(async () => (await document.fonts.load('32px SequenceProbe')).length),
    ).toBe(1);
    await air.clock.pauseAt(Date.now() + 10_000);
    await air.evaluate((data) => {
      (window as unknown as { play: (value: string) => void }).play(data);
    }, add.data);
    await air.clock.runFor(2_200);
    await expect(air.locator('body')).not.toHaveClass(/\bcg-pending\b/);

    const host = air.locator('[data-cg-element-id="sequence-host"]');
    await expect(host).toBeVisible();
    const items = host.locator('[data-cg-sequence-item]');
    const hostBox = await host.boundingBox();
    if (hostBox === null) throw new Error('The sequence box did not render');
    const pad = 50;
    const clip = {
      x: hostBox.x + hostBox.width - 160,
      y: hostBox.y - pad,
      width: 160,
      height: hostBox.height + 2 * pad,
    };
    const readInk = async () => {
      const png = await air.screenshot({ clip, scale: 'css' });
      return air.evaluate(
        async ({ encoded, clipTop, clipBottom }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx === null) throw new Error('Cannot read programme pixels');
          ctx.drawImage(image, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const count = { inside: 0, outside: 0 };
          for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
              const i = (y * canvas.width + x) * 4;
              const [red, green, blue] = pixels.subarray(i, i + 3);
              if ((green ?? 255) < 150 && (red ?? 0) > 220 && (blue ?? 0) > 220) {
                if (y >= clipTop && y < clipBottom) count.inside++;
                else count.outside++;
              }
            }
          }
          return count;
        },
        { encoded: png.toString('base64'), clipTop: pad, clipBottom: pad + hostBox.height },
      );
    };
    const unclippedInk = async () => {
      await host.evaluate((node) => (node.style.overflow = 'visible'));
      try {
        return await readInk();
      } finally {
        await host.evaluate((node) => (node.style.overflow = 'hidden'));
      }
    };
    const expectFullRestingInk = async (text: string) => {
      await expect(items).toHaveText([text]);
      const visible = await readInk();
      expect(visible.inside).toBeGreaterThan(100);
      expect(visible.outside).toBe(0);
      expect(await unclippedInk()).toEqual(visible);
    };

    await expectFullRestingInk(first);
    await air.evaluate(() => (window as unknown as { next: () => void }).next());
    await air.clock.runFor(1_000);
    await expect(items).toHaveText([first, second]);
    const pushing = await readInk();
    expect(pushing.inside).toBeGreaterThan(100);
    expect(pushing.outside).toBe(0);
    expect((await unclippedInk()).outside).toBeGreaterThan(100);
    await air.clock.runFor(1_100);
    await expectFullRestingInk(second);
  } finally {
    await air.close();
  }
});

test('Auto layout stages both frame boxes and keeps each styled title with its input', async ({
  page,
}) => {
  const handle = await boot(true);
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const templateId = 'tpl-auto-layout';
  const itemId = 'auto-layout-item';
  const { scene: base } = await unpack(await buildPositionedVcg(templateId));
  const layer = base.layers[0];
  const title = layer?.children.find((element) => element.type === 'text');
  if (layer === undefined || title === undefined) throw new Error('Missing test title');
  const transform = (x: number, y: number, w: number, h: number) => ({
    ...title.transform,
    position: { x, y },
    size: { w, h },
    anchor: { x: 0, y: 0 },
  });
  const plates = ['first', 'second'] as const;
  const node = { opacity: 1, visible: true, locked: false, zIndex: 0 };
  const scene = SceneSchema.parse({
    ...base,
    allowOperatorAutoLayout: true,
    fields: [],
    bindings: [],
    layers: [
      {
        ...layer,
        children: plates.map((id, index) => ({
          ...node,
          id: `box-${id}`,
          name: `Box ${id}`,
          type: 'composition',
          compositionId: `doc-${id}`,
          transform: transform(200 + index * 650, 220 + index * 30, 480, 270),
        })),
      },
    ],
    compositions: plates.map((id) => ({
      id: `doc-${id}`,
      name: `Box ${id}`,
      resolution: { width: 480, height: 270 },
      frameRange: base.frameRange,
      editorBackdrop: 'transparent',
      layers: [
        {
          ...layer,
          id: `layer-${id}`,
          children: [
            {
              ...node,
              id: `plate-${id}`,
              name: `Plate ${id}`,
              type: 'video-placeholder',
              routeKey: id,
              operatorMove: true,
              operatorPlacement: 'proportional',
              transform: transform(0, 0, 480, 270),
            },
            {
              ...title,
              id: `title-${id}`,
              text: id === 'first' ? 'Studio One' : 'Studio Two',
              direction: 'ltr',
              align: 'start',
              fitMode: 'fixed',
              backgroundColor: '#123456',
              padding: { top: 8, right: 12, bottom: 8, left: 12 },
              liveForeground: false,
              transform: transform(20, 190, 230, 52),
              zIndex: 1,
            },
          ],
        },
      ],
    })),
  });
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  const template = { ...TEMPLATE, templateId, liveSources: buildTemplateLiveSources(scene) };
  const originalImport = handle.runtime.templateImport(template, html, 1);
  const slot = { channel: 1, layer: 59 };
  expect(
    handle.runtime.setSourceCatalog({
      layerRange: { start: 60, end: 79 },
      sources: plates.map((id) => ({
        id: `source-${id}`,
        name: id,
        format: '1080i5000',
        producer: { kind: 'ndi', source: `AUTO-LAYOUT (${id})` },
      })),
    }),
  ).toMatchObject({ ok: true });
  expect(
    handle.runtime.setSourceAssignments({
      assignments: plates.map((plateId) => ({
        templateId,
        plateId,
        sourceId: `source-${plateId}`,
      })),
    }),
  ).toMatchObject({ ok: true });
  expect(await handle.runtime.loadFixed(slot, itemId, templateId, {})).toMatchObject({
    accepted: true,
  });
  await openConsole(page, handle.url);
  await showMonitors(page);
  const row = page.getByRole('region', { name: 'Layers' }).locator('[data-layer="59"]');
  await row.locator('[data-row-body]').click();
  await row.getByRole('button', { name: 'ON PVW', exact: true }).click();
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const frame = pvw.frameLocator('iframe[data-rehearsal-frame]');
  const read = () =>
    frame.locator('.cg-stage').evaluate((stage) => {
      const at = (id: string) => {
        const node = stage.querySelector(`[data-cg-element-id="${id}"]`);
        if (node === null) throw new Error(`Missing frame artwork ${id}`);
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        a: at('plate-first'),
        b: at('plate-second'),
        titleA: at('title-first'),
        titleB: at('title-second'),
      };
    });
  await expect(frame.locator('[data-cg-element-id="title-first"]')).toHaveText('Studio One');
  const original = await read();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const layout = inspector
    .locator('details')
    .filter({ has: page.getByText('Auto layout', { exact: true }) });
  await layout.locator('summary').click();
  const arrangement = layout.getByRole('combobox', { name: 'Arrangement' });
  const verticalGap = layout.getByRole('textbox', { name: 'Vertical gap (px)' });
  const stackedGap = async () => {
    const { a, b } = await read();
    return Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
  };
  await arrangement.selectOption('vertical');
  await expect.poll(stackedGap).toBeCloseTo(27, 1);
  await expect(row.getByText('● draft', { exact: true })).toBeVisible();
  await verticalGap.fill('36');
  await expect.poll(stackedGap).toBeCloseTo(36, 1);
  const programmeCommands = () =>
    engine.receivedCommands().filter(({ line }) => /^(CG|MIXER) /.test(line));
  const before = programmeCommands();
  const arrange = layout.getByRole('button', { name: 'Arrange frames' });
  await layout.getByRole('button', { name: 'Swap frame order' }).click();
  await expect.poll(async () => (await read()).a.y).toBeGreaterThan((await read()).b.y);
  const staged = await read();
  expect(staged.a.x).toBeCloseTo(staged.b.x, 2);
  await expect(row.getByText('● draft', { exact: true })).toBeVisible();
  expect(staged.a.width / staged.a.height).toBeCloseTo(16 / 9, 3);
  for (const [box, caption] of [
    [staged.a, staged.titleA],
    [staged.b, staged.titleB],
  ] as const) {
    expect((caption.x - box.x) / box.width).toBeCloseTo(20 / 480, 3);
    expect((caption.y - box.y) / box.height).toBeCloseTo(190 / 270, 3);
  }
  await expect(frame.locator('[data-cg-element-id="title-first"]')).toHaveCSS(
    'background-color',
    'rgb(18, 52, 86)',
  );
  await expect(frame.locator('[data-cg-element-id="title-second"]')).toHaveCSS(
    'padding-left',
    '12px',
  );
  expect(programmeCommands()).toEqual(before);
  await inspector.getByRole('button', { name: 'Discard staged edits' }).click();
  await expect.poll(async () => (await read()).a.x).toBeCloseTo(original.a.x, 2);
  await arrange.click();
  await inspector.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  const saved = () =>
    handle.runtime.stackSnapshot().find((item) => item.itemId === itemId)?.framePlacements;
  await expect.poll(() => saved()?.length).toBe(2);
  expect(programmeCommands()).toEqual(before);
  await row.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(row).toHaveAttribute('aria-label', /ON AIR$/);
  const resident = engine.lastCgAdd(slot);
  if (resident?.data == null) throw new Error('Missing resident programme page');
  expect(JSON.parse(resident.data)).toMatchObject({
    __cg: { framePlacements: saved() },
  });
  await expect
    .poll(() => programmeCommands().some(({ line }) => line.includes('\\"plates\\"')))
    .toBe(true);
  const beforeSwap = programmeCommands();
  const wireStart = engine.receivedCommands().length;
  const sourceGeometry = () =>
    [60, 61].map((layer) => engine.layerState({ channel: 1, layer })?.clip);
  const beforeSourceGeometry = sourceGeometry();
  const swap = layout.getByRole('button', { name: 'Swap frame order' });
  await expect(swap).toBeEnabled();
  const revisionName = 'Studio layout · revised';
  const revisedTitle = 'Studio One revised';
  const revised = await page.evaluate((request) => window.cg.templates.import(request), {
    channel: 1,
    template: { ...template, name: revisionName },
    html: html.replace('Studio One', revisedTitle),
  });
  expect(revised).toMatchObject({ registered: true, templateId });
  expect(revised.versionId).toBeDefined();
  expect(revised.versionId).not.toBe(originalImport.versionId);
  await expect(row.getByText(revisionName, { exact: true })).toBeVisible();
  await expect(frame.locator('[data-cg-element-id="title-first"]')).toHaveText(revisedTitle);
  await expect(swap).toBeEnabled();
  expect(programmeCommands()).toEqual(beforeSwap);
  const savedBeforeGap = saved();
  await arrangement.selectOption('horizontal');
  await expect
    .poll(async () => {
      const { a, b } = await read();
      return Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
    })
    .toBeCloseTo(27, 1);
  expect(saved()).toEqual(savedBeforeGap);
  expect(sourceGeometry()).toEqual(beforeSourceGeometry);
  expect(programmeCommands()).toEqual(beforeSwap);
  await arrangement.selectOption('vertical');
  await expect.poll(stackedGap).toBeCloseTo(36, 1);
  await verticalGap.fill('۴۸');
  await expect(verticalGap).toHaveValue('48');
  await expect.poll(stackedGap).toBeCloseTo(48, 1);
  for (const incomplete of ['', '40.']) {
    await verticalGap.fill(incomplete);
    await expect.poll(stackedGap).toBeCloseTo(48, 1);
  }
  await verticalGap.fill('9999');
  await expect(layout.getByRole('status')).toBeVisible();
  await expect.poll(stackedGap).toBeCloseTo(48, 1);
  await verticalGap.fill('48');
  await verticalGap.blur();
  const field = await verticalGap.boundingBox();
  if (field === null) throw new Error('The gap input is not laid out');
  const dragX = field.x + field.width / 2;
  const dragY = field.y + field.height / 2;
  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  try {
    await page.mouse.move(dragX + 24, dragY, { steps: 4 });
    await expect(verticalGap).toHaveValue('72');
    await expect.poll(stackedGap).toBeCloseTo(72, 1);
  } finally {
    await page.mouse.up();
  }
  expect(saved()).toEqual(savedBeforeGap);
  expect(programmeCommands()).toEqual(beforeSwap);
  await swap.click();
  await expect.poll(async () => (await read()).a.y).toBeLessThan((await read()).b.y);
  expect(programmeCommands()).toEqual(beforeSwap);
  await inspector.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
  await expect
    .poll(() => {
      const [first, second] = plates.map((id) =>
        saved()?.find(({ frameKey }) => frameKey.endsWith(`/plate-${id}`)),
      );
      return first !== undefined && second !== undefined && first.rect.y < second.rect.y;
    })
    .toBe(true);
  expect(
    programmeCommands()
      .slice(beforeSwap.length)
      .filter(({ line }) => line.startsWith('CG 1-59 UPDATE'))
      .map(({ line }) => line),
  ).toEqual([expect.stringContaining('framePlacements')]);
  expect(
    engine
      .receivedCommands()
      .slice(wireStart)
      .some(({ line }) =>
        /^(?:PLAY |CLEAR |CG \d+-\d+ (?:ADD|PLAY|STOP|REMOVE|CLEAR) )/.test(line),
      ),
  ).toBe(false);
  expect(sourceGeometry()).not.toEqual(beforeSourceGeometry);
  const updated = engine.lastCgUpdate(slot)?.data;
  if (updated == null) throw new Error('The resident page received no placement update');
  const air = await page.context().newPage();
  try {
    await air.setViewportSize({ width: 1920, height: 1080 });
    await air.goto(resident.template);
    await air.waitForFunction(
      () => typeof (window as unknown as { update?: unknown }).update === 'function',
    );
    const tellAir = (data: string) =>
      air.evaluate(
        (payload) => (window as unknown as { update: (value: string) => void }).update(payload),
        data,
      );
    const airFrame = (id: string) => air.locator(`[data-cg-element-id="plate-${id}"]`);
    const firstY = async () => (await airFrame('first').boundingBox())?.y ?? NaN;
    const secondY = async () => (await airFrame('second').boundingBox())?.y ?? NaN;
    await expect(air.locator('[data-cg-element-id="title-first"]')).toHaveText('Studio One');
    await tellAir(resident.data);
    await expect.poll(async () => (await firstY()) - (await secondY())).toBeGreaterThan(0);
    await tellAir(updated);
    await expect.poll(async () => (await firstY()) - (await secondY())).toBeLessThan(0);
    const firstBox = await airFrame('first').boundingBox();
    if (firstBox === null) throw new Error('The resident page has no first frame');
    expect((await secondY()) - firstBox.y - firstBox.height).toBeCloseTo(72, 1);
  } finally {
    await air.close();
  }
});

test('Auto layout follows the active preset permission and retains separate controls and drafts', async ({
  page,
}) => {
  const handle = await boot(true);
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const templateId = 'tpl-preset-auto-layout';
  const itemId = 'preset-auto-layout-item';
  const { scene: base } = await unpack(await buildPositionedVcg(templateId));
  const layer = base.layers[0];
  if (layer === undefined) throw new Error('Missing test layer');
  const transform = (x: number, y: number, w: number, h: number) => ({
    position: { x, y },
    size: { w, h },
    anchor: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
  });
  const presets = [
    { id: 'solo', name: 'Solo', count: 1 },
    { id: 'pair', name: 'Pair', count: 2, allowOperatorAutoLayout: true },
    { id: 'manual-pair', name: 'Manual pair', count: 2, allowOperatorAutoLayout: false },
    { id: 'locked-pair', name: 'Locked pair', count: 2 },
    { id: 'triple', name: 'Triple', count: 3 },
    { id: 'quad', name: 'Quad', count: 4 },
  ];
  const plates = ['one', 'two', 'three', 'four'];
  const node = { opacity: 1, visible: true, locked: false, zIndex: 0 };
  const scene = SceneSchema.parse({
    ...base,
    allowOperatorAutoLayout: true,
    fields: [],
    bindings: [],
    lookGroups: [
      {
        id: 'layout-presets',
        defaultLookId: 'pair',
        looks: presets.map(({ id, name, allowOperatorAutoLayout }) => ({
          id,
          name,
          instanceId: `instance-${id}`,
          allowOperatorAutoLayout,
        })),
      },
    ],
    layers: [
      {
        ...layer,
        children: presets.map(({ id, name }) => ({
          ...node,
          id: `instance-${id}`,
          name,
          type: 'composition',
          compositionId: `doc-${id}`,
          transform: transform(0, 0, 1920, 1080),
        })),
      },
    ],
    compositions: presets.map(({ id, name, count }) => ({
      id: `doc-${id}`,
      name,
      resolution: base.resolution,
      frameRange: base.frameRange,
      editorBackdrop: 'transparent',
      layers: [
        {
          ...layer,
          id: `layer-${id}`,
          children: plates.slice(0, count).map((plate, index) => ({
            ...node,
            id: `plate-${id}-${plate}`,
            name: plate,
            type: 'video-placeholder',
            routeKey: plate,
            ...(id !== 'locked-pair' && {
              operatorMove: true,
              operatorPlacement: 'proportional',
            }),
            transform: transform(140 + (index % 2) * 600, 100 + index * 90, 480, 270),
          })),
        },
      ],
    })),
  });
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  handle.runtime.templateImport(
    { ...TEMPLATE, templateId, liveSources: buildTemplateLiveSources(scene) },
    html,
    1,
  );
  expect(
    handle.runtime.setSourceCatalog({
      layerRange: { start: 60, end: 79 },
      sources: plates.map((id) => ({
        id: `source-${id}`,
        name: id,
        format: '1080i5000',
        producer: { kind: 'ndi', source: `PRESET (${id})` },
      })),
    }),
  ).toMatchObject({ ok: true });
  expect(
    handle.runtime.setSourceAssignments({
      assignments: plates.map((plateId) => ({
        templateId,
        plateId,
        sourceId: `source-${plateId}`,
      })),
    }),
  ).toMatchObject({ ok: true });
  expect(
    await handle.runtime.loadFixed({ channel: 1, layer: 59 }, itemId, templateId, {}),
  ).toMatchObject({
    accepted: true,
  });

  await openConsole(page, handle.url);
  await showMonitors(page);
  const row = page.getByRole('region', { name: 'Layers' }).locator('[data-layer="59"]');
  await row.locator('[data-row-body]').click();
  await row.getByRole('button', { name: 'ON PVW', exact: true }).click();
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
  const preview = pvw.frameLocator('iframe[data-rehearsal-frame]');
  const visiblePlates = preview.locator('[data-cg-live-source]:visible');
  const read = () =>
    visiblePlates.evaluateAll((nodes) =>
      nodes.map((plate) => {
        const { x, y, width, height } = plate.getBoundingClientRect();
        return { id: plate.getAttribute('data-cg-live-source'), x, y, width, height };
      }),
    );
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const layout = inspector
    .locator('details')
    .filter({ has: page.getByText('Auto layout', { exact: true }) });
  const arrangement = layout.getByRole('combobox', { name: 'Arrangement' });
  const verticalGap = layout.getByRole('textbox', { name: 'Vertical gap (px)' });
  const horizontalGap = layout.getByRole('textbox', { name: 'Horizontal gap (px)' });
  const swap = layout.getByRole('button', { name: 'Swap frame order' });
  const arrange = layout.getByRole('button', { name: 'Arrange frames' });
  const stackItem = () => handle.runtime.stackSnapshot().find((item) => item.itemId === itemId);
  const choosePreset = async (id: string, count: number): Promise<void> => {
    await row.locator(`[data-look-id="${id}"]`).click();
    await expect.poll(() => stackItem()?.activeLookId).toBe(id);
    await expect(visiblePlates).toHaveCount(count);
  };
  const openLayout = async (): Promise<void> => {
    const summary = layout.locator('summary');
    await expect(summary).toBeVisible();
    if ((await layout.getAttribute('open')) === null) await summary.click();
  };
  const verticalOrder = async () =>
    (await read()).sort((a, b) => a.y - b.y || a.x - b.x).map(({ id }) => id);

  await expect(visiblePlates).toHaveCount(2);
  await openLayout();
  await expect(arrangement.locator('option')).toHaveText(['Side by side', 'Top and bottom']);
  await arrangement.selectOption('vertical');
  await verticalGap.fill('60');
  await swap.click();
  await expect.poll(verticalOrder).toEqual(['two', 'one']);
  const pairDraft = await read();
  await expect(row.getByText('● draft', { exact: true })).toBeVisible();

  const refusal = inspector.getByText(/^Auto layout unavailable\./);
  await choosePreset('manual-pair', 2);
  await expect(layout).toHaveCount(0);
  await expect(refusal).toHaveCount(0);
  await expect(
    pvw.getByRole('button', { name: 'Edit frames in Preview', exact: true }),
  ).toBeEnabled();

  await choosePreset('solo', 1);
  await expect(layout).toHaveCount(0);
  await expect(refusal).toHaveCount(0);
  await choosePreset('locked-pair', 2);
  await expect(layout).toHaveCount(0);
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText('enable Allow move and unlock Resize');
  await choosePreset('triple', 3);
  await expect(refusal).toHaveCount(0);
  await openLayout();
  await expect(arrangement.locator('option')).toHaveText([
    'More frames on top',
    'More frames on bottom',
  ]);
  await arrangement.selectOption('more-bottom');
  await expect
    .poll(async () => {
      const [top, lowerLeft, lowerRight] = await read();
      return (
        top !== undefined &&
        lowerLeft !== undefined &&
        lowerRight !== undefined &&
        top.y < lowerLeft.y &&
        Math.abs(lowerLeft.y - lowerRight.y) < 0.1
      );
    })
    .toBe(true);
  await horizontalGap.fill('54');
  await expect
    .poll(async () => {
      const [, lowerLeft, lowerRight] = await read();
      return lowerLeft === undefined || lowerRight === undefined
        ? NaN
        : lowerRight.x - lowerLeft.x - lowerLeft.width;
    })
    .toBeCloseTo(54, 1);
  const tripleDraft = await read();

  await choosePreset('quad', 4);
  await openLayout();
  await expect(arrangement).toHaveCount(0);
  await expect(horizontalGap).toHaveValue('27');
  await expect(verticalGap).toHaveValue('27');
  await arrange.click();
  await expect
    .poll(async () => {
      const [a, b, c, d] = await read();
      return (
        a !== undefined &&
        b !== undefined &&
        c !== undefined &&
        d !== undefined &&
        Math.abs(a.y - b.y) < 0.1 &&
        Math.abs(c.y - d.y) < 0.1 &&
        a.y < c.y
      );
    })
    .toBe(true);

  await choosePreset('pair', 2);
  await expect.poll(read).toEqual(pairDraft);
  await openLayout();
  await expect(arrangement).toHaveValue('vertical');
  await expect(verticalGap).toHaveValue('60');
  await swap.click();
  await expect.poll(verticalOrder).toEqual(['one', 'two']);
  await choosePreset('triple', 3);
  await expect.poll(read).toEqual(tripleDraft);
  await openLayout();
  await expect(arrangement).toHaveValue('more-bottom');
  await expect(horizontalGap).toHaveValue('54');

  const sent = () => engine.receivedCommands().filter(({ line }) => /^(CG|MIXER|PLAY) /.test(line));
  const beforeUpdate = sent();
  await inspector.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  await expect
    .poll(() => {
      const placements = stackItem()?.framePlacements ?? [];
      return presets.map(({ id }) => placements.filter(({ lookId }) => lookId === id).length);
    })
    .toEqual([0, 2, 0, 0, 3, 4]);
  expect(sent()).toEqual(beforeUpdate);
});

test('D-213 Take seats a masked foreground plate above the lower plate by default', async ({
  page,
}) => {
  const handle = await boot(true);
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const templateId = 'tpl-overlap-paint-order';
  const itemId = 'overlap-paint-order';
  const { scene } = await unpack(await buildPositionedVcg(templateId));
  const layer = scene.layers[0];
  const transform = layer?.children[0]?.transform;
  if (layer === undefined || transform === undefined) throw new Error('Missing template fixture');
  scene.defaultPosition = undefined;
  scene.fields = [];
  scene.bindings = [];
  const plate = (id: string, x: number, y: number, zIndex: number): VideoPlaceholderElement => ({
    id,
    name: id,
    type: 'video-placeholder',
    routeKey: id,
    transform: {
      ...transform,
      position: { x, y },
      size: { w: 400, h: 300 },
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex,
  });
  // The source ids sort in the opposite direction to the authored order.
  layer.children = [
    { ...plate('z-back', 600, 350, 0), operatorMove: true },
    {
      ...plate('a-front', 740, 420, 1),
      operatorMove: false,
      operatorPlacement: 'free',
      liveMask: { mode: 'inside', rects: [{ x: 0.1, y: 0.2, width: 0.8, height: 0.4 }] },
    },
  ];
  const liveSources = buildTemplateLiveSources(scene);
  expect(liveSources.platePaintOrder).toEqual(['z-back', 'a-front']);
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  expect(
    handle.runtime.setSourceCatalog({
      layerRange: { start: 60, end: 79 },
      sources: [
        {
          id: 'front-source',
          name: 'Front source',
          format: '1080i5000',
          producer: { kind: 'ndi', source: 'OVERLAP-TEST (Front)' },
        },
        {
          id: 'back-source',
          name: 'Back source',
          format: '1080i5000',
          producer: { kind: 'route', channel: 2 },
        },
      ],
    }),
  ).toMatchObject({ ok: true });
  handle.runtime.templateImport({ ...TEMPLATE, templateId, liveSources }, html, 1);
  expect(
    handle.runtime.setSourceAssignments({
      assignments: [
        { templateId, plateId: 'a-front', sourceId: 'front-source' },
        { templateId, plateId: 'z-back', sourceId: 'back-source' },
      ],
    }),
  ).toMatchObject({ ok: true });
  expect(
    await handle.runtime.loadFixed({ channel: 1, layer: 59 }, itemId, templateId, {}),
  ).toMatchObject({ accepted: true });
  await openConsole(page, handle.url);
  const row = page.getByRole('region', { name: 'Layers' }).locator('[data-layer="59"]');
  await showMonitors(page);
  await row.locator('[data-row-body]').click();
  await row.getByRole('button', { name: 'ON PVW', exact: true }).click();
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await pvw.getByRole('button', { name: 'Edit frames in Preview', exact: true }).click();
  const backMove = pvw.getByRole('button', { name: 'Move frame for Back source' });
  const frontResize = pvw.getByRole('button', { name: 'Resize Front source from bottom right' });
  await expect(backMove).toBeVisible();
  await expect(frontResize).toBeVisible();
  await expect(pvw.getByRole('button', { name: /Resize Back source/ })).toHaveCount(0);
  await expect(pvw.getByRole('button', { name: 'Move frame for Front source' })).toHaveCount(0);
  const frontOutline = frontResize.locator('..');
  await frontOutline.hover();
  await expect(frontOutline).toHaveCSS('cursor', 'default');
  await expect(backMove.locator('..')).toHaveCSS('cursor', 'move');
  const frontBox = await frontOutline.boundingBox();
  if (frontBox === null) throw new Error('Resize-only frame has no visible bounds');
  const frontCenter = { x: frontBox.x + frontBox.width / 2, y: frontBox.y + frontBox.height / 2 };
  await page.mouse.move(frontCenter.x, frontCenter.y);
  await page.mouse.down();
  await page.mouse.move(frontCenter.x + 12, frontCenter.y + 8);
  await expect(frontOutline).toHaveCSS('cursor', 'default');
  await page.mouse.up();
  expect(await frontOutline.boundingBox()).toEqual(frontBox);
  await frontResize.hover();
  await expect(frontResize).toHaveCSS('cursor', 'nwse-resize');
  const preserveRatio = inspector.getByRole('checkbox', {
    name: 'Preserve frame aspect ratio',
    exact: true,
  });
  await expect(preserveRatio).toBeChecked();
  await preserveRatio.uncheck();
  const frontFrame = pvw
    .frameLocator('iframe[data-rehearsal-frame]')
    .locator('[data-cg-element-id="a-front"]');
  const size = () =>
    frontFrame.evaluate((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    });
  const authored = await size();
  await frontResize.press('Shift+ArrowRight');
  await expect.poll(async () => (await size()).width).toBeGreaterThan(authored.width);
  expect((await size()).height).toBeCloseTo(authored.height, 2);
  await inspector.getByRole('button', { name: 'Discard staged edits' }).click();
  await expect.poll(async () => (await size()).width).toBeCloseTo(authored.width, 2);

  const start = engine.receivedCommands().length;
  await row.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(row).toHaveAttribute('aria-label', /ON AIR$/);

  const wire = engine
    .receivedCommands()
    .slice(start)
    .map(({ line }) => line);
  const back = wire.find((line) => /^PLAY 1-\d+ .*route:\/\/2/.test(line));
  const front = wire.find((line) => /^PLAY 1-\d+ .*OVERLAP-TEST \(Front\)/.test(line));
  const layerOf = (command: string | undefined) => Number(command?.match(/^PLAY 1-(\d+) /)?.[1]);
  expect(layerOf(back)).toBeGreaterThanOrEqual(60);
  expect(layerOf(front)).toBeGreaterThan(layerOf(back));
  expect(layerOf(front)).toBeLessThanOrEqual(79);
  expect(wire).toContain(
    `MIXER 1-${String(layerOf(front))} CLIP 0.40625 0.444444 0.166667 0.111111 DEFER`,
  );
});

test('Edit masks drafts authored windows in PVW and updates the existing on-air seats', async ({
  page,
}) => {
  const handle = await boot(true);
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const templateId = 'tpl-operator-masks';
  const itemId = 'operator-masks-item';
  const { scene } = await unpack(await buildPositionedVcg(templateId));
  const layer = scene.layers[0];
  const transform = layer?.children[0]?.transform;
  if (layer === undefined || transform === undefined) throw new Error('Missing template fixture');
  const plate = (id: string, x: number, zIndex: number): VideoPlaceholderElement => ({
    id,
    name: id,
    type: 'video-placeholder',
    routeKey: id,
    transform: {
      ...transform,
      position: { x, y: 220 },
      size: { w: 800, h: 450 },
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex,
  });
  const maskRect = { x: 0.1, y: 0.18, width: 0.35, height: 0.5 };
  const revealRect = { x: 0.09, y: 0.2, width: 0.3, height: 0.42 };
  scene.allowLivePlateOverlap = true;
  scene.fields = [];
  scene.bindings = [];
  layer.children = [
    {
      ...plate('lower', 140, 0),
      allowOperatorMaskEdit: true,
      liveMask: { mode: 'inside', rects: [maskRect] },
    },
    {
      ...plate('upper', 530, 1),
      allowOperatorMaskEdit: true,
      operatorMove: true,
      revealMask: { targetSourceId: 'lower', rect: revealRect },
    },
  ];
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  const ids = ['lower', 'upper'];
  expect(
    handle.runtime.setSourceCatalog({
      layerRange: { start: 60, end: 79 },
      sources: ids.map((id) => ({
        id: `source-${id}`,
        name: id,
        format: '1080i5000',
        producer: { kind: 'ndi', source: `MASK-TEST (${id})` },
      })),
    }),
  ).toMatchObject({ ok: true });
  handle.runtime.templateImport(
    { ...TEMPLATE, templateId, liveSources: buildTemplateLiveSources(scene) },
    html,
    1,
  );
  expect(
    handle.runtime.setSourceAssignments({
      assignments: ids.map((plateId) => ({ templateId, plateId, sourceId: `source-${plateId}` })),
    }),
  ).toMatchObject({ ok: true });
  const slot = { channel: 1, layer: 59 };
  expect(await handle.runtime.loadFixed(slot, itemId, templateId, {})).toMatchObject({
    accepted: true,
  });
  await openConsole(page, handle.url);
  await showMonitors(page);
  const row = page.getByRole('region', { name: 'Layers' }).locator('[data-layer="59"]');
  await row.locator('[data-row-body]').click();
  await row.getByRole('button', { name: 'ON PVW', exact: true }).click();
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const editFrames = pvw.getByRole('button', { name: 'Edit frames in Preview' });
  const editMasks = pvw.getByRole('button', { name: 'Edit masks in Preview' });
  await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
  await editFrames.click();
  await expect(pvw.getByRole('button', { name: 'Move frame for upper' })).toBeVisible();
  await editMasks.click();
  await expect(editFrames).toHaveAttribute('aria-pressed', 'false');
  await expect(pvw.getByRole('button', { name: 'Move frame for upper' })).toHaveCount(0);
  const mask = pvw.locator('[data-mask-placement="mask"]');
  const reveal = pvw.locator('[data-mask-placement="reveal"]');
  await expect(mask).toBeVisible();
  await expect(reveal).toBeVisible();
  const clip = pvw
    .frameLocator('iframe[data-rehearsal-frame]')
    .locator('[data-cg-editable-mask] rect');
  await expect(clip).toHaveAttribute('x', String(maskRect.x));
  const maskBox = await mask.boundingBox();
  if (maskBox === null) throw new Error('Missing Preview mask bounds');
  const label = pvw.locator('[data-live-plate="lower"] [data-live-plate-label]');
  const expectLabelInMask = async () => {
    const [labelBox, maskBounds] = await Promise.all([label.boundingBox(), mask.boundingBox()]);
    if (labelBox === null || maskBounds === null) throw new Error('Missing plate label or mask');
    expect(labelBox.x + labelBox.width / 2).toBeCloseTo(maskBounds.x + maskBounds.width / 2, 0);
    expect(labelBox.y + labelBox.height / 2).toBeCloseTo(maskBounds.y + maskBounds.height / 2, 0);
  };
  // The live label uses the same draft as the guide, also after the operator moves it.
  const dragMask = async () => {
    const x = maskBox.x + maskBox.width / 2;
    const y = maskBox.y + maskBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 18, y + 4, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await mask.boundingBox())?.x).toBeCloseTo(maskBox.x + 18, 0);
    await expect.poll(async () => Number(await clip.getAttribute('x'))).toBeGreaterThan(maskRect.x);
    await expectLabelInMask();
  };
  const programmeCommands = () =>
    engine
      .receivedCommands()
      .filter(({ line }) =>
        /^(?:CG |PLAY |CLEAR |MIXER 1(?: COMMIT$|-\d+ (?:CLIP|FILL|OPACITY) ))/.test(line),
      );
  const saved = () =>
    handle.runtime.stackSnapshot().find((item) => item.itemId === itemId)?.maskPlacements;
  const before = programmeCommands();
  await dragMask();
  await expect(row.getByText('● draft', { exact: true })).toBeVisible();
  expect(saved()).toBeUndefined();
  expect(programmeCommands()).toEqual(before);
  await inspector.getByRole('button', { name: 'Discard staged edits' }).click();
  await expect(clip).toHaveAttribute('x', String(maskRect.x));
  await expect.poll(async () => (await mask.boundingBox())?.x).toBeCloseTo(maskBox.x, 0);
  await dragMask();
  await inspector.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  await expect.poll(() => saved()?.[0]?.kind).toBe('mask');
  expect(programmeCommands()).toEqual(before);

  await row.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(row).toHaveAttribute('aria-label', /ON AIR$/);
  const carried = () => {
    const updated = engine.lastCgUpdate(slot)?.data;
    const added = engine.lastCgAdd(slot)?.data;
    return [updated, added].map((payload) =>
      payload == null ? undefined : JSON.parse(payload).__cg?.maskPlacements,
    );
  };
  await expect.poll(carried).toContainEqual(saved());
  await expect(editMasks).toHaveAttribute('aria-pressed', 'true');
  const resize = pvw.getByRole('button', { name: 'Resize reveal 1 for upper from bottom right' });
  const originalReveal = await reveal.boundingBox();
  const corner = await resize.boundingBox();
  if (originalReveal === null || corner === null) throw new Error('Missing reveal resize handle');
  const onAir = programmeCommands();
  const x = corner.x + corner.width / 2;
  const y = corner.y + corner.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y - 10, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => (await reveal.boundingBox())?.width)
    .toBeGreaterThan(originalReveal.width);
  await expect
    .poll(async () => (await reveal.boundingBox())?.height)
    .toBeLessThan(originalReveal.height);
  await expect(row.getByText('● draft', { exact: true })).toBeVisible();
  expect(saved()).toHaveLength(1);
  expect(programmeCommands()).toEqual(onAir);
  await inspector.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
  await expect.poll(() => saved()?.length).toBe(2);
  await expect(row.getByText('● draft', { exact: true })).toHaveCount(0);
  const update = programmeCommands()
    .slice(onAir.length)
    .map(({ line }) => line);
  expect(update.filter((line) => line.startsWith('CG 1-59 UPDATE'))).toEqual([
    expect.stringContaining('maskPlacements'),
  ]);
  expect(update).toContain('MIXER 1 COMMIT');
  expect(
    update.some((line) =>
      /^(?:PLAY |CLEAR |CG \d+-\d+ (?:ADD|PLAY|STOP|REMOVE|CLEAR) )/.test(line),
    ),
  ).toBe(false);
  expect(carried()).toContainEqual(saved());
});

test('B-443 shares one authored plate mask across its presets through PVW and Update on air', async ({
  page,
}) => {
  const handle = await boot(true);
  const engine = mock;
  if (engine === null) throw new Error('Test engine is unavailable');
  await handle.runtime.whenServerHealthy(15_000);
  const templateId = 'tpl-shared-mask';
  const itemId = 'shared-mask-item';
  const { scene: base } = await unpack(await buildPositionedVcg(templateId));
  const layer = base.layers[0];
  if (layer === undefined) throw new Error('Missing test layer');
  const authored = { x: 0.18, y: 0.2, width: 0.45, height: 0.4 };
  const node = { visible: true, locked: false, opacity: 1, zIndex: 0 };
  const transform = (x: number, y: number, w: number, h: number) => ({
    position: { x, y },
    size: { w, h },
    anchor: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
  });
  const plate = (id: string) => ({
    ...node,
    id,
    name: id,
    type: 'video-placeholder',
    routeKey: 'plate-4',
    transform: transform(0, 0, 640, 360),
    allowOperatorMaskEdit: true,
    liveMask: { mode: 'inside', rects: [authored] },
  });
  const presets = [
    { id: 'first', x: 130, w: 640, h: 360 },
    { id: 'second', x: 620, w: 960, h: 540 },
    { id: 'separate', x: 510, w: 640, h: 360 },
  ];
  const scene = SceneSchema.parse({
    ...base,
    defaultPosition: undefined,
    fields: [],
    bindings: [],
    lookGroups: [
      {
        id: 'mask-presets',
        defaultLookId: 'first',
        looks: presets.map(({ id }) => ({ id, name: id, instanceId: 'instance-' + id })),
      },
    ],
    layers: [
      {
        ...layer,
        children: presets.map(({ id }) => ({
          ...node,
          id: 'instance-' + id,
          name: id,
          type: 'composition',
          compositionId: 'comp-' + id,
          transform: transform(0, 0, 1920, 1080),
        })),
      },
    ],
    compositions: [
      ...presets.map(({ id, x, w, h }) => ({
        id: 'comp-' + id,
        name: id,
        resolution: base.resolution,
        frameRange: base.frameRange,
        editorBackdrop: 'transparent',
        layers: [
          {
            ...layer,
            id: 'layer-' + id,
            children: [
              {
                ...node,
                id: 'plate-instance-' + id,
                name: id,
                type: 'composition',
                compositionId: id === 'separate' ? 'independent-plate' : 'shared-plate',
                transform: transform(x, 230, w, h),
              },
            ],
          },
        ],
      })),
      ...['shared-plate', 'independent-plate'].map((id) => ({
        id,
        name: id,
        resolution: { width: 640, height: 360 },
        frameRange: base.frameRange,
        editorBackdrop: 'transparent',
        layers: [{ ...layer, id: 'layer-' + id, children: [plate('authored-' + id)] }],
      })),
    ],
  });
  const liveSources = buildTemplateLiveSources(scene);
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  handle.runtime.templateImport({ ...TEMPLATE, templateId, liveSources }, html, 1);
  expect(
    handle.runtime.setSourceCatalog({
      layerRange: { start: 60, end: 79 },
      sources: [
        {
          id: 'shared-mask-input',
          name: 'Studio',
          format: '1080i5000',
          producer: { kind: 'ndi', source: 'MASK-TEST (Studio)' },
        },
      ],
    }),
  ).toMatchObject({ ok: true });
  expect(
    handle.runtime.setSourceAssignments({
      assignments: [{ templateId, plateId: 'plate-4', sourceId: 'shared-mask-input' }],
    }),
  ).toMatchObject({ ok: true });
  const slot = { channel: 1, layer: 59 };
  expect(await handle.runtime.loadFixed(slot, itemId, templateId, {})).toMatchObject({
    accepted: true,
  });
  const state = () => handle.runtime.stackSnapshot().find((item) => item.itemId === itemId);
  const saved = () => state()?.maskPlacements ?? [];
  const written = () =>
    engine.receivedCommands().filter(({ line }) => /^(CG|MIXER|PLAY|CLEAR) /.test(line));

  await openConsole(page, handle.url);
  await showMonitors(page);
  const row = page.getByRole('region', { name: 'Layers' }).locator('[data-layer="59"]');
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await row.locator('[data-row-body]').click();
  await row.getByRole('button', { name: 'ON PVW', exact: true }).click();
  await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
  await pvw.getByRole('button', { name: 'Edit masks in Preview' }).click();
  const guide = pvw.locator('[data-mask-plate="plate-4"]');
  const rect = async (clip: Locator): Promise<LiveRevealRect> =>
    clip.evaluate((node) => ({
      x: Number(node.getAttribute('x')),
      y: Number(node.getAttribute('y')),
      width: Number(node.getAttribute('width')),
      height: Number(node.getAttribute('height')),
    }));
  // Clip IDs are instance-scoped. Read the active plate's fallback after each preset change.
  const activeClip = pvw
    .frameLocator('iframe[data-rehearsal-frame]')
    .locator('[data-cg-live-source="plate-4"]:visible [data-cg-editable-mask] rect');
  const switchPreset = async (id: string) => {
    const tab = row.locator('[data-look-id="' + id + '"]');
    await tab.click();
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => state()?.activeLookId).toBe(id);
    await expect(activeClip).toHaveCount(1);
  };
  const move = pvw.getByRole('button', { name: 'Move mask 1 for Studio' });
  const resize = pvw.getByRole('button', { name: 'Resize mask 1 for Studio from bottom right' });

  await expect.poll(() => rect(activeClip)).toEqual(authored);
  const firstWidth = (await guide.boundingBox())?.width ?? 0;
  const offAir = written();
  await move.press('Shift+ArrowRight');
  await expect.poll(async () => (await rect(activeClip)).x).toBeGreaterThan(authored.x);
  const draft = await rect(activeClip);
  await switchPreset('second');
  await expect.poll(() => rect(activeClip)).toEqual(draft);
  expect((await guide.boundingBox())?.width).toBeGreaterThan(firstWidth);
  await switchPreset('separate');
  await expect.poll(() => rect(activeClip)).toEqual(authored);
  expect(saved()).toEqual([]);
  expect(written()).toEqual(offAir);
  await inspector.getByRole('button', { name: 'Discard staged edits' }).click();
  await switchPreset('first');
  await expect.poll(() => rect(activeClip)).toEqual(authored);
  await switchPreset('second');
  await expect.poll(() => rect(activeClip)).toEqual(authored);
  await resize.press('Shift+ArrowRight');
  await expect.poll(async () => (await rect(activeClip)).width).toBeGreaterThan(authored.width);
  const resized = await rect(activeClip);
  await inspector.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  await expect
    .poll(() =>
      saved()
        .map(({ lookId, rect }) => [lookId, rect])
        .sort(),
    )
    .toEqual([
      ['first', resized],
      ['second', resized],
    ]);
  expect(written()).toEqual(offAir);
  await row.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(row).toHaveAttribute('aria-label', /ON AIR$/);
  const beforeDraft = written();
  await move.press('Shift+ArrowDown');
  await expect.poll(async () => (await rect(activeClip)).y).toBeGreaterThan(resized.y);
  const moved = await rect(activeClip);
  expect(written()).toEqual(beforeDraft);
  await inspector.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
  await expect.poll(() => saved().map(({ rect }) => rect)).toEqual([moved, moved]);
  await expect(row.getByText('● draft', { exact: true })).toHaveCount(0);
  const updated = written()
    .slice(beforeDraft.length)
    .map(({ line }) => line);
  expect(updated).toContainEqual(expect.stringContaining('maskPlacements'));
  expect(updated).toContain('MIXER 1 COMMIT');
  expect(updated.some((line) => /^(PLAY|CLEAR) |^CG .* (ADD|PLAY|STOP|REMOVE) /.test(line))).toBe(
    false,
  );

  await switchPreset('first');
  await expect.poll(() => rect(activeClip)).toEqual(moved);
  const firstCut = written()
    .slice(beforeDraft.length)
    .map(({ line }) => line);
  const payloads = firstCut.filter((line) => line.includes('maskPlacements'));
  expect(payloads.at(-1)).toContain('first');
  expect(payloads.at(-1)).toContain('second');
  await switchPreset('separate');
  await expect.poll(() => rect(activeClip)).toEqual(authored);
});

test('R-108 — a reloaded package refreshes the already-bound row in PVW', async ({ page }) => {
  const handle = await boot();
  await openConsole(page, handle.url);
  const itemId = 'item-pvw-reload';
  const register = (html: string) =>
    page.evaluate(
      ({ template, html }) => window.cg.templates.import({ template, html, channel: 1 }),
      { template: TEMPLATE, html },
    );
  await register(HTML);
  await page.evaluate(
    ({ itemId, layer, templateId }) =>
      window.cg.fixedLayers.load({ channel: 1, layer, itemId, templateId, fields: {} }),
    { itemId, layer: ROW, templateId: TEMPLATE.templateId },
  );
  await expect(row(page)).toHaveAttribute('data-item-id', itemId);
  await showMonitors(page);
  await row(page).getByRole('button', { name: 'ON PVW', exact: true }).click();
  const stage = page.frameLocator('iframe[data-rehearsal-frame]').locator('.cg-stage');
  await expect(stage).toHaveAttribute('data-mark', MARK);

  await register(HTML.replace(MARK, 'reloaded-v2'));
  await expect(stage).toHaveAttribute('data-mark', 'reloaded-v2');
  await expect(row(page)).toHaveAttribute('data-item-id', itemId);
});
