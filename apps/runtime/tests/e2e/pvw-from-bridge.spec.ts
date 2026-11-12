import * as dgram from 'node:dgram';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Locator, Page } from '@playwright/test';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { LayerProfileSchema, type ConnectionConfig, type FixedLayerBank } from '@cg/shared-ipc';
import { SceneSchema, type VideoPlaceholderElement } from '@cg/shared-schema';
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
import { solidPng } from './fixtures/pictures.js';

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

test('D-178 / B-433 — PVW crop reaches the first Take and Update on air reframes the existing seat', async ({
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
    HTML.replace(
      '</body>',
      '<div data-cg-live-source="guest" style="position:absolute;left:720px;top:270px;width:480px;height:540px"></div></body>',
    ),
    1,
  );
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
          return colors.map((color) => {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const [red, green, blue] = ctx.getImageData(0, 0, 1, 1).data;
            let count = 0;
            for (let at = 0; at < pixels.length; at += 4) {
              if (pixels[at] === red && pixels[at + 1] === green && pixels[at + 2] === blue)
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
    const picture = solidPng(64, 36, [32, 116, 216]);
    const sha256 = sha256Hex(picture);
    const picturePath = `assets/image/${sha256}.png`;
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
            mime: 'image/png',
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
    await expect
      .poll(() =>
        legacyFrame.locator(bookImage).evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(64);
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
        .toBe(64);
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
  } finally {
    await air.close();
  }
});

test('R-117 Move toggles dragging while both stopped PVW templates remain outlined', async ({
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
    { id: 'lower-pvw-template', layer: 98, x: 190, y: 690 },
    { id: 'upper-pvw-template', layer: 99, x: 1120, y: 190 },
  ];
  const initial = { anchor: 'bottom-right', offset: { x: -10, y: -20 } } as const;
  for (const fixture of fixtures) {
    const { scene } = await unpack(await buildPositionedVcg(fixture.id));
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
  const lowerPage = pvw.frameLocator('iframe[data-rehearsal-frame="lower-pvw-template"]');
  const move = pvw.getByRole('button', { name: 'Move template in Preview', exact: true });
  await expect(move).toBeDisabled();
  await expect(move).toHaveAttribute('aria-pressed', 'false');
  for (const fixture of fixtures)
    await layer(fixture.layer).getByRole('button', { name: 'ON PVW', exact: true }).click();
  await layer(99).locator('[data-row-body]').click();
  await expect(lower).toBeVisible();
  await expect(upper).toBeVisible();
  await expect(lowerPage.locator('body')).toHaveClass(/\bcg-pending\b/);
  const [beforeLower, beforeUpper, previewRaster] = await Promise.all([
    lower.boundingBox(),
    upper.boundingBox(),
    pvw.locator('[data-rehearsal-checker]').boundingBox(),
  ]);
  if (beforeLower === null || beforeUpper === null || previewRaster === null)
    throw new Error('The two PVW outlines or their raster did not render');
  expect(beforeLower.x + beforeLower.width).toBeLessThan(beforeUpper.x);
  expect(beforeLower.y).toBeGreaterThan(beforeUpper.y + beforeUpper.height);
  await expect(move).toBeEnabled();
  await expect(move).toHaveAttribute('aria-pressed', 'false');
  await expect(lower).not.toHaveAttribute('data-pvw-position-editable', 'true');

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const x = inspector.getByRole('textbox', { name: 'Position offset X' });
  const y = inspector.getByRole('textbox', { name: 'Position offset Y' });
  const rowDraft = layer(98).getByText('● draft', { exact: true });
  const appliedPosition = (itemId: string) =>
    handle.runtime.stackSnapshot(1).find((item) => item.itemId === itemId)?.position;
  const programmeCommands = () =>
    engine
      .receivedCommands()
      .map(({ line }) => line)
      .filter((line) => /^(?:CG|MIXER|CLEAR) 1-9[89](?: |$)/.test(line));
  const before = programmeCommands();
  const fit = previewRaster.width / 1920;
  const startX = Math.round(beforeLower.x + beforeLower.width / 2);
  const startY = Math.round(beforeLower.y + beforeLower.height / 2);
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
  expect(programmeCommands()).toEqual(before);
  await expect(lowerPage.locator('body')).toHaveClass(/\bcg-pending\b/);

  const moved = await lower.boundingBox();
  if (moved === null) throw new Error('The moved PVW outline did not render');
  await move.click();
  await expect(move).toHaveAttribute('aria-pressed', 'false');
  await expect(lower).toBeVisible();
  await expect(lower).not.toHaveAttribute('data-pvw-position-editable', 'true');
  await drag(Math.round(moved.x + moved.width / 2), Math.round(moved.y + moved.height / 2));
  expect(await lower.boundingBox()).toEqual(moved);
  await expect(x).toHaveValue(dx);
  await expect(y).toHaveValue(dy);
  expect(appliedPosition('lower-pvw-template')).toEqual(initial);
  expect(appliedPosition('upper-pvw-template')).toEqual(initial);
  expect(programmeCommands()).toEqual(before);

  await inspector.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  await expect(inspector.getByLabel('Position has unapplied changes')).toHaveCount(0);
  await expect(rowDraft).toHaveCount(0);
  expect(appliedPosition('lower-pvw-template')).toEqual({
    anchor: initial.anchor,
    offset: { x: Number(dx), y: Number(dy) },
  });
  expect(programmeCommands()).toEqual(before);
  await pvw.getByRole('button', { name: 'PLAY all 2 rehearsing', exact: true }).click();
  await expect(lowerPage.locator('body')).not.toHaveClass(/\bcg-pending\b/);
  await pvw.getByRole('button', { name: 'STOP all 2 rehearsing', exact: true }).click();
  await expect(lowerPage.locator('body')).toHaveClass(/\bcg-pending\b/);
  await expect(lower).toBeVisible();
  await expect(upper).toBeVisible();
  await layer(98).getByRole('button', { name: 'OFF PVW', exact: true }).click();
  await expect(lower).toHaveCount(0);
  await expect(upper).toBeVisible();
});

test('D-213 Take seats two opted-in plates in the authored paint order', async ({ page }) => {
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
  scene.allowLivePlateOverlap = true;
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
    { ...plate('a-front', 740, 420, 1), operatorMove: false, operatorPlacement: 'free' },
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
