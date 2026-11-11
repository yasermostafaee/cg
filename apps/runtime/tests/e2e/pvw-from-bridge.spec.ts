import * as dgram from 'node:dgram';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { LayerProfileSchema, type ConnectionConfig, type FixedLayerBank } from '@cg/shared-ipc';
import { cgCss, cgJsIife, ExporterSingleFile } from '@cg/single-file-export';
import { buildTemplateLiveSources, unpack } from '@cg/vcg-format';
import { buildPositionedVcg, buildValidVcg, expect, test } from './fixtures/runtime.js';

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
  const pan = pvw.getByRole('button', { name: 'Pan preview input', exact: true });
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
});

test('R-024 saves and reloads prepared layers and refuses to replace an on-air row', async ({
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
  await openConsole(page, handle.url);

  await page.getByRole('button', { name: 'Layer profiles', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Layer profiles', exact: true });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Save profile…' }).click(),
  ]);
  const downloaded = await download.path();
  if (downloaded === null) throw new Error('Missing profile download');
  const profile = LayerProfileSchema.parse(JSON.parse(await readFile(downloaded, 'utf8')));
  expect(profile.items).toMatchObject([
    { layer: ROW, templateId: TEMPLATE.templateId, fields: { headline }, position },
  ]);
  expect(profile.items[0]).not.toHaveProperty('state');
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
  await dialog.locator('input[type=file]').setInputFiles(file);
  await expect(dialog.getByText(/replace prepared layers on channel 1/)).toBeVisible();
  const load = dialog.getByRole('button', { name: 'Load profile', exact: true });
  const commandsBefore = engine.receivedCommands().length;
  await load.click();
  await expect(dialog.getByRole('status')).toHaveText('Loaded 1 layer.');
  await expect(dialog.getByText(/قالب خبری.*Template is missing from this channel/)).toBeVisible();
  const [loaded] = handle.runtime.stackSnapshot(1);
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
  await dialog.locator('input[type=file]').setInputFiles(file);
  await load.click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Stop the graphics on this channel before loading a profile.',
  );
  expect(handle.runtime.stackSnapshot(1)[0]).toMatchObject({
    itemId: loaded.itemId,
    status: 'on-air',
  });
});

test('shared folder lists Bridge packages and imports through the template catalogue', async ({
  page,
}) => {
  const shared = await mkdtemp(join(tmpdir(), 'cg-shared-vcg-'));
  try {
    await mkdir(join(shared, 'خبر'));
    const packageId = 'tpl-shared-folder';
    await writeFile(join(shared, 'خبر', 'خبر.vcg'), await buildValidVcg(packageId));
    await writeFile(join(shared, 'خبر', 'notes.txt'), 'not a template package');
    const handle = await boot(false, shared);
    await openConsole(page, handle.url);
    await page.getByRole('button', { name: 'Open templates', exact: true }).click();
    await page.getByRole('button', { name: 'Shared folder…', exact: true }).click();
    const folder = page.getByRole('dialog', { name: 'Shared template folder', exact: true });
    await folder.getByRole('button', { name: 'خبر', exact: true }).click();
    await folder.getByRole('button', { name: 'خبر.vcg', exact: true }).click();
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
  await layer.locator('[data-row-body]').click();
  await layer.getByRole('button', { name: 'ON PVW', exact: true }).click();
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
  await layer.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(layer).toHaveAttribute('aria-label', /ON AIR$/);
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const x = inspector.getByRole('textbox', { name: 'Position offset X', exact: true });
  await expect(x).toBeEnabled();

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
    await inspector.getByRole('textbox', { name: 'Position offset Y', exact: true }).fill('40');
    await inspector.getByRole('textbox', { name: 'anchor', exact: true }).fill('Draft text');
    const previewStage = pvw.frameLocator('iframe[data-rehearsal-frame]').locator('.cg-stage');
    const moved = 'matrix(1, 0, 0, 1, 320, 40)';
    await expect(previewStage).toHaveCSS('transform', moved);
    expect(wire()).toEqual(before);
    await expect(airStage).toHaveCSS('transform', initialPosition);
    await inspector.getByRole('button', { name: 'Apply staged edits to the on-air row' }).click();
    await expect(inspector.getByLabel('Position has unapplied changes')).toHaveCount(0);

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
  } finally {
    await air.close();
  }
});

test('R-117 outlines both stopped PVW templates and dragging one stages only its Position', async ({
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
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + moveX, startY + moveY, { steps: 4 });
  await page.mouse.up();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByText('lower-pvw-template', { exact: true })).toBeVisible();
  const dx = String(initial.offset.x + Math.round(moveX / fit));
  const dy = String(initial.offset.y + Math.round(moveY / fit));
  await expect(inspector.getByRole('textbox', { name: 'Position offset X' })).toHaveValue(dx);
  await expect(inspector.getByRole('textbox', { name: 'Position offset Y' })).toHaveValue(dy);
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

  await inspector.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  await expect(inspector.getByLabel('Position has unapplied changes')).toHaveCount(0);
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
