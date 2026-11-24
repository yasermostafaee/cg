import { createSocket } from 'node:dgram';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { createBridge } from '@cg/caspar-bridge';
import {
  readCgControl,
  SceneSchema,
  upcomingProgramMediaHash,
  upcomingProgramMediaPath,
} from '@cg/shared-schema';
import { pack, sha256Hex } from '@cg/vcg-format';
import type { FileChooser, Locator, Page } from '@playwright/test';
import { expect, RuntimeApp, test } from './fixtures/runtime.js';
import { solidPng } from './fixtures/pictures.js';

const TEMPLATE = 'tpl-e2e-upcoming-programs';
const ELEMENT = 'e2e-upcoming-programs';
const LAYER = 99;
const SLOT = { channel: 1, layer: LAYER };
const PHOTO = 'evening-news.png';
const WEBM = 'seek-safe-64x64.webm';
const MP4 = 'upcoming-h264-aac-64x64.mp4';
const WEBM_PATH = fileURLToPath(new URL(`./fixtures/${WEBM}`, import.meta.url));
const MP4_PATH = fileURLToPath(new URL(`./fixtures/${MP4}`, import.meta.url));
const DISPLAY_TITLE = 'گزارش شب';
const DISPLAY_TIME = 'بعد از ساعت ۲';

async function buildUpcomingVcg(prepared: boolean): Promise<Uint8Array> {
  const picture = solidPng(32, 18, [30, 160, 95]);
  const sha256 = sha256Hex(picture);
  const path = `assets/image/${sha256}.png`;
  const video = readFileSync(WEBM_PATH);
  const videoSha256 = sha256Hex(video);
  const videoPath = `assets/video/${videoSha256}.webm`;
  const scene = SceneSchema.parse({
    schemaVersion: 1,
    id: 'e2e-upcoming-scene',
    name: 'Next on the channel',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 25 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'layer-upcoming',
        name: 'Graphics',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: ELEMENT,
            name: 'Upcoming Programs',
            type: 'upcomingPrograms',
            transform: {
              position: { x: 150, y: 300 },
              size: { w: 1280, h: 480 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            layout: 'carousel',
            visibleCards: 2,
            showAirtime: true,
            advance: 'manual',
            cardStyle: { media: { visible: true }, carousel: { focusPosition: 'start' } },
            dataSource: prepared ? 'prepared' : 'rehearsal',
            sampleItems: prepared
              ? [
                  {
                    id: 'designer-news',
                    title: 'Designer News',
                    airtime: '20:00',
                    mediaAssetId: 'designer-video',
                    mediaKind: 'video',
                    posterAssetId: 'designer-photo',
                  },
                ]
              : [],
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-11-25T00:00:00.000Z', updatedAt: '2026-11-25T00:00:00.000Z' },
  });
  return pack({
    scene,
    manifestExtras: {
      id: TEMPLATE,
      name: scene.name,
      authoring: {
        designerVersion: '1.2.13',
        createdAt: '2026-11-25T00:00:00.000Z',
        exportedAt: '2026-11-25T00:00:00.000Z',
      },
      compatibility: { minRuntimeVersion: '1.2.13', minCasparCGVersion: '2.3.0' },
      fontDeps: [],
      assetIndex: prepared
        ? [
            {
              id: 'designer-photo',
              kind: 'image',
              path,
              filename: 'designer.png',
              mime: 'image/png',
              bytes: picture.length,
              sha256,
            },
            {
              id: 'designer-video',
              kind: 'video',
              path: videoPath,
              filename: 'designer.webm',
              mime: 'video/webm',
              bytes: video.length,
              sha256: videoSha256,
            },
          ]
        : [],
    },
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
    ...(prepared && {
      assets: new Map([
        [path, picture],
        [videoPath, video],
      ]),
    }),
  });
}

async function freeOscPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

async function pickFile(
  page: Page,
  program: Locator,
  file: Parameters<FileChooser['setFiles']>[0],
): Promise<void> {
  await program.getByRole('button', { name: 'Image or video' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose program media' });
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Browse…', exact: true }).click();
  await (await chooser).setFiles(file);
}

function latestProgramTake(engine: MockHandle) {
  for (const message of [engine.lastCgUpdate(SLOT), engine.lastCgAdd(SLOT)]) {
    if (message?.data === undefined || message.data === null) continue;
    const control = readCgControl(JSON.parse(message.data));
    if (control?.take !== undefined) return { control, data: message.data };
  }
  return undefined;
}

test('CG Control previews a prepared MP4 before Take and plays its WebM from the served graphic', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const oscPort = await freeOscPort();
  const engine = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10 });
  try {
    const bridge = await createBridge({
      port: 0,
      fixedLayers: { channel: 1, start: 80, count: 20, low: { start: 50, count: 10 } },
      connection: {
        servers: { A: { host: '127.0.0.1', amcpPort: engine.amcpPort, oscPort } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
    });
    try {
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.addInitScript((url) => {
        (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = url;
      }, bridge.url);
      const app = new RuntimeApp(page);
      await app.goto();
      await app.showMonitors();
      await app.importVcg('upcoming.vcg', await buildUpcomingVcg(true), LAYER);
      const layer = app.layerRow(LAYER);
      await expect(layer).toHaveAttribute('aria-pressed', 'true');
      const programs = app.inspector.getByRole('region', { name: 'Upcoming Programs' });
      const first = programs.getByRole('group', { name: 'Program 1', exact: true });
      const second = programs.getByRole('group', { name: 'Program 2', exact: true });
      const take = layer.getByRole('button', { name: 'PLAY', exact: true });
      const draftChip = app.inspector.getByLabel('unapplied edits');
      await expect(first.getByRole('textbox', { name: 'Title' })).toHaveValue('Designer News');
      const firstMedia = first.getByRole('button', { name: 'Image or video' });
      await expect(firstMedia).toContainText('designer.webm');
      await firstMedia.click();
      const authoredPicker = page.getByRole('dialog', { name: 'Choose program media' });
      for (const name of ['designer.png', 'designer.webm']) {
        const thumbnail = authoredPicker.getByRole('button', { name, exact: true }).locator('img');
        await expect(thumbnail).toBeVisible();
        await expect
          .poll(() =>
            thumbnail.evaluate((image) =>
              image instanceof HTMLImageElement ? image.naturalWidth : 0,
            ),
          )
          .toBe(32);
      }
      await expect(authoredPicker.getByRole('button', { name: /^Remove upload/ })).toHaveCount(0);
      await authoredPicker.getByText('Close', { exact: true }).click();
      await layer.getByRole('button', { name: 'ON PVW', exact: true }).click();
      await page
        .locator('[data-pvw-controls]')
        .getByRole('button', { name: 'PLAY', exact: true })
        .click();
      const preview = page.frameLocator('iframe[data-rehearsal-frame]');
      await expect(preview.locator('[data-cg-upcoming-title]')).toHaveText('Designer News');

      await programs.getByRole('button', { name: 'Add program' }).click();
      await second.getByRole('textbox', { name: 'Title' }).fill('City Window');
      await first.getByRole('textbox', { name: 'Title' }).fill(DISPLAY_TITLE);
      await first.getByRole('textbox', { name: 'Display time' }).fill(DISPLAY_TIME);
      await pickFile(page, second, {
        name: PHOTO,
        mimeType: 'image/png',
        buffer: solidPng(64, 36, [180, 38, 65]),
      });
      await expect(second.getByRole('button', { name: 'Image or video' })).toContainText(PHOTO);

      const accidentalName = 'accidental.png';
      const accidental = solidPng(32, 18, [28, 40, 230]);
      await pickFile(page, first, {
        name: accidentalName,
        mimeType: 'image/png',
        buffer: accidental,
      });
      await expect(firstMedia).toContainText(accidentalName);
      await firstMedia.click();
      const removalPicker = page.getByRole('dialog', { name: 'Choose program media' });
      const removeAccidental = removalPicker.getByRole('button', {
        name: 'Remove upload accidental.png',
      });
      await removeAccidental.click();
      const confirmation = page.getByRole('dialog', { name: 'Remove uploaded media?' });
      await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(removeAccidental).toBeVisible();
      await removeAccidental.click();
      await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(removeAccidental).toHaveCount(0);
      await removalPicker.getByText('Close', { exact: true }).click();
      await expect(firstMedia).toContainText('designer.webm');
      await expect(first.getByRole('textbox', { name: 'Title' })).toHaveValue(DISPLAY_TITLE);
      await expect(first.getByRole('textbox', { name: 'Display time' })).toHaveValue(DISPLAY_TIME);
      expect(
        await page.evaluate(
          async (sha256) => (await window.cg.upcomingMedia.get({ sha256 })).kind,
          sha256Hex(accidental),
        ),
      ).toBe('missing');

      await pickFile(page, first, WEBM_PATH);
      await expect(firstMedia).toContainText(WEBM);
      const originalWebmHash = sha256Hex(readFileSync(WEBM_PATH));
      const storedWebm = await page.evaluate(async (sha256) => {
        const media = await window.cg.upcomingMedia.get({ sha256 });
        return media.kind === 'media' ? media.mime : null;
      }, originalWebmHash);
      expect(storedWebm).toBe('video/webm');

      await pickFile(page, first, MP4_PATH);
      await expect(firstMedia).toContainText(MP4, { timeout: 25_000 });
      await expect(preview.locator('[data-cg-upcoming-title]')).toHaveText([
        DISPLAY_TITLE,
        'City Window',
      ]);
      await expect(preview.locator('[data-cg-upcoming-airtime]')).toHaveText(DISPLAY_TIME);
      const still = preview.locator('[data-cg-upcoming-card]:not([data-cg-upcoming-focus]) img');
      const video = preview.locator('[data-cg-upcoming-focus] video');
      await expect
        .poll(() => still.evaluate((node: HTMLImageElement) => node.naturalWidth))
        .toBe(64);
      await expect
        .poll(() =>
          video.evaluate(
            (node: HTMLVideoElement, hash) =>
              node.currentSrc.startsWith('data:video/webm;base64,') &&
              node.dataset['cgAssetId'] !== `upcoming-media:${hash}`,
            originalWebmHash,
          ),
        )
        .toBe(true);
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeGreaterThan(0);
      await expect(preview.locator('[data-cg-upcoming-card] video')).toHaveCount(1);
      const stagedVideo = await video.getAttribute('data-cg-asset-id');
      if (stagedVideo === null) throw new Error('Preview has no uploaded video ID');
      const preparedHash = upcomingProgramMediaHash(stagedVideo);
      expect(preparedHash).toBeDefined();
      expect(preparedHash).not.toBe(sha256Hex(readFileSync(MP4_PATH)));

      await pickFile(page, first, {
        name: 'unreadable.mp4',
        mimeType: 'video/mp4',
        buffer: Buffer.from('invalid video'),
      });
      const picker = page.getByRole('dialog', { name: 'Choose program media' });
      await expect(picker.getByText('Could not import program media.')).toBeVisible();
      await picker.getByText('Close', { exact: true }).click();
      await expect(firstMedia).toContainText(MP4);
      await expect(video).toHaveAttribute('data-cg-asset-id', stagedVideo);

      await layer.getByRole('button', { name: 'OFF PVW', exact: true }).click();
      await expect(draftChip).toBeVisible();
      await take.click();
      await expect(app.error).toContainText('Apply the upcoming programs before Take.');
      expect(latestProgramTake(engine)).toBeUndefined();
      await expect(layer).not.toHaveAttribute('aria-label', /ON AIR$/);
      await app.applyEdits();
      await expect(draftChip).toHaveCount(0);
      expect(latestProgramTake(engine)).toBeUndefined();
      await expect(layer).not.toHaveAttribute('aria-label', /ON AIR$/);

      await firstMedia.click();
      const protectedPicker = page.getByRole('dialog', { name: 'Choose program media' });
      await protectedPicker.getByRole('button', { name: 'Remove upload ' + MP4 }).click();
      await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(protectedPicker.getByText('This upload is in use by a program.')).toBeVisible();
      await protectedPicker.getByText('Close', { exact: true }).click();
      await expect(firstMedia).toContainText(MP4);

      await app.loadTemplate(TEMPLATE, LAYER - 1);
      await expect(app.layerRow(LAYER - 1)).toHaveAttribute('aria-pressed', 'true');
      await expect(first.getByRole('textbox', { name: 'Title' })).toHaveValue('Designer News');
      await expect(second).toHaveCount(0);
      await app.selectLayerRow(LAYER);
      await expect(layer).toHaveAttribute('aria-pressed', 'true');
      await expect(first.getByRole('textbox', { name: 'Title' })).toHaveValue(DISPLAY_TITLE);
      await expect(second.getByRole('textbox', { name: 'Title' })).toHaveValue('City Window');
      await first.getByRole('textbox', { name: 'Title' }).fill('Discard this revision');
      await app.discardEdits();
      await expect(first.getByRole('textbox', { name: 'Title' })).toHaveValue(DISPLAY_TITLE);
      await take.click();
      await expect(layer).toHaveAttribute('aria-label', /ON AIR$/);
      const aired = latestProgramTake(engine);
      expect(aired?.control.upcomingPrograms?.[ELEMENT]).toMatchObject([
        {
          id: 'designer-news',
          title: DISPLAY_TITLE,
          airtime: DISPLAY_TIME,
          mediaKind: 'video',
          mediaAssetId: stagedVideo,
          posterAssetId: expect.stringMatching(/^upcoming-media:/),
        },
        {
          title: 'City Window',
          mediaKind: 'image',
          mediaAssetId: expect.stringMatching(/^upcoming-media:/),
        },
      ]);
      const add = engine.lastCgAdd(SLOT);
      if (add === undefined || aired === undefined || preparedHash === undefined) {
        throw new Error('Take did not deliver the served graphic and its prepared video');
      }
      const air = await page.context().newPage();
      try {
        await air.goto(add.template);
        await air.waitForFunction(
          () => typeof (window as unknown as { play?: unknown }).play === 'function',
        );
        const mediaUrl = new URL(upcomingProgramMediaPath(preparedHash), add.template).href;
        const requestedVideo = air.waitForResponse(
          (response) =>
            response.url() === mediaUrl && response.request().resourceType() === 'media',
        );
        await air.evaluate((payload) => {
          const producer = window as unknown as {
            update: (value: string) => void;
            play: () => void;
          };
          producer.update(payload);
          producer.play();
        }, aired.data);
        const mediaResponse = await requestedVideo;
        expect(mediaResponse.status()).toBe(206);
        expect(mediaResponse.headers()['content-type']).toBe('video/webm');
        expect(mediaResponse.headers()['content-range']).toMatch(/^bytes 0-\d+\/\d+$/);
        const airVideo = air.locator('[data-cg-upcoming-focus] video');
        await expect(airVideo).toHaveJSProperty('muted', true);
        await expect
          .poll(() => airVideo.evaluate((node: HTMLVideoElement) => node.currentTime))
          .toBeGreaterThan(0);
        const uploaded = await air.request.get(mediaUrl);
        await expect(uploaded).toBeOK();
        const bytes = await uploaded.body();
        expect(sha256Hex(bytes)).toBe(preparedHash);
        expect(bytes.includes(Buffer.from('V_VP8'))).toBe(true);
        expect(bytes.includes(Buffer.from('A_OPUS'))).toBe(true);
      } finally {
        await air.close();
      }
    } finally {
      await bridge.close();
    }
  } finally {
    await engine.stop();
  }
});

for (const locale of [
  {
    id: 'fa',
    region: 'برنامه‌های بعدی',
    add: 'افزودن برنامه',
    time: 'زمان نمایشی',
    media: 'تصویر یا ویدئو',
    chooser: 'انتخاب رسانهٔ برنامه',
    close: 'بستن',
    move: /به پایین/,
    remove: /حذف برنامه/,
  },
  {
    id: 'ar',
    region: 'البرامج القادمة',
    add: 'إضافة برنامج',
    time: 'وقت العرض',
    media: 'صورة أو فيديو',
    chooser: 'اختيار وسائط البرنامج',
    close: 'إغلاق',
    move: /إلى أسفل/,
    remove: /إزالة البرنامج/,
  },
] as const) {
  test(`an empty Upcoming Programs list is editable in ${locale.id} RTL`, async ({ app }) => {
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    const layer = await app.importVcg('upcoming.vcg', await buildUpcomingVcg(false));
    await app.selectLayerRow(layer);
    await app.openStationSetupAt('General');
    await page.locator('#cg-interface-language').selectOption(locale.id);
    await page.getByRole('dialog').getByRole('button', { name: locale.close, exact: true }).click();
    const programs = page.getByRole('region', { name: locale.region });
    await expect(programs).toHaveCSS('direction', 'rtl');
    await expect(programs.getByRole('group')).toHaveCount(0);
    const add = programs.getByRole('button', { name: locale.add, exact: true });
    await add.click();
    await add.click();
    await add.click();
    const rows = programs.getByRole('group');
    await expect(rows).toHaveCount(3);
    await rows.first().getByRole('textbox', { name: locale.time }).fill(DISPLAY_TIME);
    await expect(rows.first().getByRole('textbox', { name: locale.time })).toHaveValue(
      DISPLAY_TIME,
    );
    await rows.first().getByRole('button', { name: locale.media, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: locale.chooser });
    await expect(dialog).toHaveCSS('direction', 'rtl');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await rows.first().getByRole('button', { name: locale.move }).click();
    await expect(rows.nth(1).getByRole('textbox', { name: locale.time })).toHaveValue(DISPLAY_TIME);
    await rows.first().getByRole('button', { name: locale.remove }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.first().getByRole('textbox', { name: locale.time })).toHaveValue(
      DISPLAY_TIME,
    );
    expect(await programs.evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
      await programs.evaluate((node) => node.clientWidth),
    );
  });
}
