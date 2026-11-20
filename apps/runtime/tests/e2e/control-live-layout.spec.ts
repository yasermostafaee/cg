import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { SourceCatalog } from '@cg/shared-ipc';
import { controlLiveLayoutFocusLookId, type Scene } from '@cg/shared-schema';
import { pack, sha256Hex } from '@cg/vcg-format';
import { expect, test, type Locator, type Page } from '@playwright/test';

const inputNames = ['Studio camera', 'Guest line 1', 'Guest line 2'];
const catalog: SourceCatalog = {
  sources: inputNames.map((name, index) => ({
    id: `feed-${index + 1}`,
    name,
    format: '1080p2500',
    producer: { kind: 'decklink', device: index + 1 },
  })),
  layerRange: { start: 60, end: 79 },
};

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

async function setInput(page: Page, editor: Locator, index: number, title: string): Promise<void> {
  await editor.getByRole('button', { name: `Edit plate ${index + 1}`, exact: true }).click();
  await editor.getByRole('combobox', { name: 'Plate input' }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a source' });
  await chooser
    .locator('[data-picker-input]')
    .filter({ hasText: inputNames[index]! })
    .first()
    .click();
  await chooser.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(chooser).toBeHidden();
  await editor.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
}

function fieldAppearance(field: Locator): Promise<string[]> {
  return field.evaluate((node) => {
    const style = getComputedStyle(node);
    return [style.backgroundColor, style.borderRadius, style.fontSize, style.height];
  });
}

function frameGraphic(): Promise<Uint8Array> {
  const date = '2026-01-01T00:00:00.000Z';
  const scene: Scene = {
    schemaVersion: 1,
    id: 'test-frame-graphic',
    name: 'Studio logo',
    templateType: 'custom',
    resolution: { width: 320, height: 180 },
    frameRate: 25,
    frameRange: { in: 0, out: 1 },
    editorBackdrop: 'transparent',
    safeAreas: { action: 3, title: 5 },
    layers: [
      {
        id: 'art',
        name: 'Art',
        locked: false,
        visible: true,
        blendMode: 'normal',
        children: [
          {
            type: 'shape',
            shape: 'rect',
            id: 'frame-graphic-accent',
            name: 'Accent',
            transform: {
              position: { x: 10, y: 10 },
              size: { w: 300, h: 22 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            fill: { kind: 'solid', color: '#ffbf60' },
            zIndex: 0,
            visible: true,
            locked: false,
            opacity: 1,
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: date, updatedAt: date },
  };
  return pack({
    scene,
    manifestExtras: {
      id: scene.id,
      name: scene.name,
      authoring: { designerVersion: '1.2.7', createdAt: date, exportedAt: date },
      compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
      fontDeps: [],
      assetIndex: [],
    },
    indexHtml: '<!doctype html><html><body></body></html>',
    cgJs: '',
    cgCss: '',
  });
}

test('per-plate fallback previews survive save and reopen with an independent on-air toggle', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const directory = testInfo.outputPath('bridge');
  fs.mkdirSync(directory, { recursive: true });
  const oscPort = await freeUdpPort();
  const engine = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 15,
    channels: 1,
  });
  let bridge: BridgeHandle | undefined;
  try {
    bridge = await createBridge({
      port: 0,
      connection: {
        servers: { A: { host: '127.0.0.1', amcpPort: engine.amcpPort, oscPort } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
      fixedLayers: { channel: 1, start: 80, count: 4, low: { start: 50, count: 10 } },
      sourceCatalog: catalog,
      stackPath: path.join(directory, 'stack.json'),
      templatesDir: path.join(directory, 'templates'),
    });
    const runtime = bridge.runtime;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(bridge.url)};`);
    await page.goto('/');
    await page.getByRole('button', { name: 'New live layout', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'New live layout' });
    const background = (dialog: Locator) =>
      dialog.getByRole('region', { name: 'Fallback background' });
    const onAir = (dialog: Locator) =>
      background(dialog).getByRole('checkbox', { name: 'Show fallback on air', exact: true });
    const fallback = (dialog: Locator, plate: number) =>
      dialog.locator(`[data-frame-number="${plate}"] [data-layout-plate-fallback]`);
    const editPlate = async (dialog: Locator, plate: number): Promise<void> => {
      await dialog.getByRole('button', { name: `Edit plate ${plate}`, exact: true }).click();
      if (!(await background(dialog).isVisible())) {
        await dialog.getByText('Advanced plate controls', { exact: true }).click();
      }
    };

    await editor.getByRole('textbox', { name: 'Layout name' }).fill('Fallback test');
    const add = editor.getByRole('button', { name: 'Add plate', exact: true });
    await add.click();
    await add.click();
    await editor.getByRole('button', { name: 'Add preset', exact: true }).click();
    await editPlate(editor, 1);

    const borderWidth = editor.getByLabel('Border width (px)', { exact: true });
    const plateBorder = (plate: number) =>
      editor.locator(`[data-frame-number="${plate}"] .cg-live-layout-shot-border`);
    await expect(borderWidth).toHaveValue('0');
    await borderWidth.scrollIntoViewIfNeeded();
    const widthBox = (await borderWidth.boundingBox())!;
    await page.mouse.move(widthBox.x + widthBox.width / 2, widthBox.y + widthBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(widthBox.x + widthBox.width / 2 + 15, widthBox.y + widthBox.height / 2);
    await page.mouse.up();
    await expect(borderWidth).toHaveValue('15');
    await expect(plateBorder(1)).toBeVisible();
    await editPlate(editor, 2);
    await expect(borderWidth).toHaveValue('0');
    await expect(plateBorder(2)).toHaveCount(0);
    await borderWidth.fill('8');
    await expect(plateBorder(2)).toBeVisible();
    await editPlate(editor, 1);
    await expect(borderWidth).toHaveValue('15');

    const inputFit = editor.getByLabel('Plate input fit', { exact: true });
    const cropX = editor.getByLabel('Crop X (%)', { exact: true });
    await inputFit.selectOption('cover');
    await cropX.fill('35');
    await editPlate(editor, 2);
    await expect(inputFit).toHaveValue('');
    await inputFit.selectOption('cover');
    await expect(cropX).toHaveValue('50');
    await inputFit.selectOption('');
    await editPlate(editor, 1);
    await expect(cropX).toHaveValue('35');
    await inputFit.selectOption('');

    await expect(onAir(editor)).not.toBeChecked();
    await expect(fallback(editor, 1)).toHaveCount(0);
    await background(editor).getByRole('button', { name: 'Bars', exact: true }).click();
    await expect(fallback(editor, 1)).toHaveAttribute('data-layout-plate-fallback', 'bars');
    await expect(fallback(editor, 1)).toHaveCSS('background-image', /linear-gradient/);
    await background(editor).getByRole('button', { name: 'Solid colour', exact: true }).click();
    await background(editor).getByLabel('Fallback colour').fill('#316A72');
    const borderSwatch = (await editor.getByLabel('Border color', { exact: true }).boundingBox())!;
    const fallbackSwatch = (await background(editor).getByLabel('Fallback colour').boundingBox())!;
    expect(borderSwatch.width).toBeLessThanOrEqual(48);
    expect(fallbackSwatch.width).toBeLessThanOrEqual(48);
    const platePanel = editor.getByRole('complementary', { name: 'Plates', exact: true });
    expect(await platePanel.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
    await expect(onAir(editor)).toBeChecked();
    await onAir(editor).uncheck();
    await expect(fallback(editor, 1)).toHaveCSS('background-color', 'rgb(49, 106, 114)');
    await editor.getByRole('button', { name: 'Add mask window', exact: true }).click();
    await expect(fallback(editor, 1)).toHaveCSS('clip-path', /url/);
    await expect(fallback(editor, 1).locator('clipPath rect')).toHaveAttribute('width', '0.5');

    await editPlate(editor, 2);
    const { poster, backdrop } = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 1024;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#DC7010';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const poster = canvas.toDataURL('image/png').split(',')[1]!;
      canvas.width = 32;
      canvas.height = 18;
      context.fillStyle = '#182c49';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return { poster, backdrop: canvas.toDataURL('image/png').split(',')[1]! };
    });
    await background(editor)
      .getByLabel('Fallback image file')
      .setInputFiles({
        name: 'plate-poster.png',
        mimeType: 'image/png',
        buffer: Buffer.from(poster, 'base64'),
      });
    const fallbackImageButton = (dialog: Locator) =>
      background(dialog).getByRole('button', { name: 'Image…', exact: true });
    const fallbackThumbnail = fallbackImageButton(editor).locator('img');
    await expect(fallbackImageButton(editor)).toHaveAttribute('title', 'plate-poster.png');
    await expect(fallbackThumbnail).toBeVisible();
    await expect(fallbackThumbnail).toHaveJSProperty('naturalWidth', 1280);
    await expect(background(editor).getByText('plate-poster.png', { exact: true })).toHaveCount(0);
    const chooseBackground = (dialog: Locator) =>
      dialog.getByRole('button', { name: 'Choose background image or video' });
    const backgroundMedia = editor.getByLabel('Background media file', { exact: true });
    await backgroundMedia.setInputFiles(
      fileURLToPath(new URL('./fixtures/seek-safe-64x64.webm', import.meta.url)),
    );
    await expect(chooseBackground(editor)).toHaveAttribute('title', 'seek-safe-64x64.webm');
    const videoThumbnail = chooseBackground(editor).locator('video');
    await expect(videoThumbnail).toBeVisible();
    await expect(videoThumbnail).toHaveJSProperty('videoWidth', 64);
    await expect(videoThumbnail).toHaveJSProperty('paused', true);
    await expect(editor.locator('[data-layout-preview] > video')).toHaveJSProperty(
      'videoWidth',
      64,
    );
    await backgroundMedia.setInputFiles({
      name: 'layout-poster.png',
      mimeType: 'image/png',
      buffer: Buffer.from(backdrop, 'base64'),
    });
    await expect(videoThumbnail).toHaveCount(0);
    const backgroundThumbnail = chooseBackground(editor).locator('img');
    await expect(backgroundThumbnail).toBeVisible();
    await expect(backgroundThumbnail).toHaveJSProperty('naturalWidth', 32);
    await expect(onAir(editor)).toBeChecked();
    await expect(fallback(editor, 2).locator('img')).toHaveJSProperty('naturalWidth', 1280);
    // First save a package in the older format, before the embedded PNG was generated.
    await page.evaluate(() => {
      const encode = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        if (this.width === 320 && this.height === 180) {
          HTMLCanvasElement.prototype.toDataURL = encode;
          return 'data:,';
        }
        return encode.apply(this, args);
      };
    });
    await editor.getByRole('button', { name: 'Save layout', exact: true }).click();
    await expect(editor).toBeHidden();

    const stored = runtime.templateList(1).find(({ name }) => name === 'Fallback test');
    expect(stored?.controlLiveLayout?.frames[0]).toMatchObject({
      border: { width: 15 },
      fallback: { kind: 'color', color: '#316a72' },
      showFallback: false,
    });
    expect(stored?.controlLiveLayout?.frames[1]?.border?.width).toBe(8);
    expect(stored?.controlLiveLayout?.frames[1]?.fallback).toEqual({
      kind: 'image',
      name: 'plate-poster.png',
      mime: 'image/png',
    });
    expect(stored?.liveSources?.looks?.[0]?.fallbacks).toEqual([
      stored?.controlLiveLayout?.frames[1]?.id,
    ]);

    await page.getByRole('button', { name: 'Open templates', exact: true }).click();
    const library = page.getByRole('dialog', { name: 'Templates · CH 1' });
    await library.getByRole('button', { name: 'Select Fallback test', exact: true }).click();
    const detail = library.locator('[data-template-thumbnail="detail"]');
    const still = detail.frameLocator('iframe[title="Template thumbnail"]');
    const storedPoster = still.locator('[data-cg-live-fallback] img').filter({ visible: true });
    await expect(storedPoster).toHaveJSProperty('naturalWidth', 225);
    await library.getByRole('button', { name: 'Edit layout', exact: true }).click();
    const restored = page.getByRole('dialog', { name: 'Edit live layout' });
    await editPlate(restored, 1);
    await expect(onAir(restored)).not.toBeChecked();
    await expect(fallback(restored, 1)).toHaveCSS('background-color', 'rgb(49, 106, 114)');
    await expect(fallback(restored, 1)).toHaveCSS('clip-path', /url/);
    await editPlate(restored, 2);
    await expect(onAir(restored)).toBeChecked();
    await expect(fallbackImageButton(restored)).toHaveAttribute('title', 'plate-poster.png');
    await expect(fallbackImageButton(restored).locator('img')).toBeVisible();
    await expect(chooseBackground(restored)).toHaveAttribute('title', 'layout-poster.png');
    await expect(chooseBackground(restored).locator('img')).toBeVisible();
    await expect(fallback(restored, 2).locator('img')).toHaveJSProperty('naturalWidth', 1280);
    await restored
      .getByRole('textbox', { name: 'Layout name', exact: true })
      .fill('Embedded preview');
    await restored.getByRole('button', { name: 'Save layout', exact: true }).click();
    await expect(restored).toBeHidden();
    if (!(await library.isVisible()))
      await page.getByRole('button', { name: 'Open templates', exact: true }).click();
    await library.getByRole('button', { name: 'Select Embedded preview', exact: true }).click();
    const embedded = detail.locator('img');
    await expect(embedded).toHaveJSProperty('naturalWidth', 320);
    expect(
      await embedded.evaluate((image: HTMLImageElement) => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        return data.some(
          (red, i) => i % 4 === 0 && red === 220 && data[i + 1] === 112 && data[i + 2] === 16,
        );
      }),
    ).toBe(true);
  } finally {
    await bridge?.close();
    await engine.stop();
  }
});

test('R-120 authors, focuses, returns and prepares a second layout while the first is on air', async ({
  page,
}) => {
  test.setTimeout(80_000);
  page.setDefaultTimeout(12_000);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-control-layout-'));
  let mock: MockHandle | undefined;
  let bridge: BridgeHandle | undefined;
  try {
    const oscPort = await freeUdpPort();
    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 15, channels: 1 });
    const engine = mock;
    bridge = await createBridge({
      port: 0,
      connection: {
        servers: { A: { host: '127.0.0.1', amcpPort: engine.amcpPort, oscPort } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
      fixedLayers: { channel: 1, start: 80, count: 4, low: { start: 50, count: 10 } },
      sourceCatalog: catalog,
      stackPath: path.join(directory, 'stack.json'),
      templatesDir: path.join(directory, 'templates'),
    });
    const runtime = bridge.runtime;
    runtime.templateImport(
      {
        templateId: 'designer-graphics',
        name: 'Designer graphics',
        templateType: 'custom',
        fields: [],
      },
      '<!doctype html><body>Designer graphics</body>',
      1,
    );

    await page.setViewportSize({ width: 1440, height: 1000 });
    // Operator-selected broadcast effects are rehearsed even when UI motion is reduced.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(bridge.url)};`);
    await page.goto('/');
    const layers = page.getByRole('region', { name: 'Layers' });
    await expect(layers.getByRole('button', { name: 'New live layout' })).toBeVisible();
    // Live camera snapshots are reads, and the rest of the app and wire use the actual Bridge.
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext('2d')!;
      const colors = ['#abbfe9', '#da8649', '#54a776'];
      const snapshots = colors.map((color, index) => {
        canvas.height = index === 2 ? 240 : 180;
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        return {
          jpegBase64: canvas.toDataURL('image/jpeg').split(',')[1]!,
          width: canvas.width,
          height: canvas.height,
        };
      });
      const pictureFrames = (sourceIds: readonly string[], passive: boolean) => ({
        frames: sourceIds.map((sourceId) => {
          const index = Number(sourceId.split('-').at(-1)) - 1;
          const snapshot = snapshots[passive && index === 0 ? 1 : index];
          return {
            sourceId,
            ...snapshot,
            signal: 'present' as const,
          };
        }),
      });
      const stalled = () => document.body.hasAttribute('data-test-pvw-lease-stalled');
      window.cg.sourcePreviews.pvw = ({ sourceIds }) =>
        Promise.resolve(stalled() ? { frames: [] } : pictureFrames(sourceIds, false));
      window.cg.sourcePreviews.thumbnails = ({ sourceIds }) =>
        Promise.resolve(stalled() ? pictureFrames(sourceIds, true) : { frames: [] });
    });
    await layers.getByRole('button', { name: 'New live layout' }).click();
    const editor = page.getByRole('dialog', { name: 'New live layout' });
    const stage = editor.locator('[data-layout-preview]');
    const saveLayout = editor.getByRole('button', { name: 'Save layout', exact: true });
    const startPreset = editor.getByRole('button', { name: 'Start with this preset', exact: true });
    const addFrame = editor.getByRole('button', { name: 'Add plate', exact: true });
    const addPreset = editor.getByRole('button', { name: 'Add preset', exact: true });
    await expect(editor.getByRole('button', { name: /^Edit plate / })).toHaveCount(0);
    await expect(editor.locator('.cg-live-layout-preset-choice')).toHaveCount(0);
    await expect(startPreset).toBeDisabled();
    await expect(saveLayout).toBeDisabled();
    expect((await editor.boundingBox())?.width ?? 0).toBeGreaterThan(1080);
    expect((await editor.boundingBox())?.height ?? 0).toBeGreaterThan(900);
    expect((await stage.boundingBox())?.width ?? 0).toBeGreaterThan(640);
    await page.setViewportSize({ width: 600, height: 540 });
    await stage.scrollIntoViewIfNeeded();
    const narrow = await stage.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const scroll = node.closest('[data-modal-body]')?.getBoundingClientRect();
      return {
        ratio: rect.width / rect.height,
        visible:
          scroll !== undefined &&
          rect.top >= scroll.top - 1 &&
          rect.bottom <= scroll.bottom + 1 &&
          rect.left >= scroll.left &&
          rect.right <= scroll.right,
      };
    });
    expect(narrow.visible).toBe(true);
    expect(narrow.ratio).toBeCloseTo(16 / 9, 1);
    await expect(editor.getByRole('button', { name: 'Save layout' })).toBeInViewport();
    await page.setViewportSize({ width: 1440, height: 1000 });
    const layoutName = editor.getByRole('textbox', { name: 'Layout name' });
    await layoutName.fill('Studio panel');
    await addPreset.click();
    await expect(startPreset).toBeDisabled();
    await expect(saveLayout).toBeDisabled();
    await editor.getByRole('button', { name: 'Delete preset', exact: true }).click();
    await addFrame.click();
    await addFrame.click();
    await expect(saveLayout).toBeDisabled();
    await addPreset.click();
    await expect(saveLayout).toBeEnabled();
    await expect(startPreset).toBeDisabled();
    const startWidth = (await startPreset.boundingBox())!.width;
    await addFrame.click();
    await addFrame.click();
    await editor.getByRole('button', { name: 'Delete plate' }).click();
    await expect(editor.getByRole('button', { name: 'Edit plate 4', exact: true })).toHaveCount(0);
    await expect(editor.locator('.cg-live-layout-preview-controls')).toHaveCSS(
      'overflow-y',
      'visible',
    );
    const workspace = editor.locator('.cg-live-layout-workspace');
    const sidebarBounds = () =>
      workspace.evaluate((node) => {
        const sidebar = node.querySelector<HTMLElement>('.cg-live-layout-frames')!;
        const parent = node.closest('[data-modal-body]')!;
        return {
          top: sidebar.getBoundingClientRect().top,
          footerGap: parent.getBoundingClientRect().bottom - sidebar.getBoundingClientRect().bottom,
        };
      });
    const sidebarAtStart = await sidebarBounds();
    expect(sidebarAtStart.footerGap).toBeGreaterThanOrEqual(0);
    expect(sidebarAtStart.footerGap).toBeLessThan(24);
    await editor.getByText('Layout effects', { exact: true }).scrollIntoViewIfNeeded();
    expect(await sidebarBounds()).toEqual(sidebarAtStart);
    await workspace.getByRole('region', { name: 'Layout preview' }).evaluate((node) => {
      node.scrollTop = 0;
    });
    for (const number of [1, 2, 3]) {
      await expect(
        editor.getByRole('button', { name: `Focus plate ${String(number)}`, exact: true }),
      ).toBeVisible();
    }
    await setInput(page, editor, 0, 'مجری برنامه 4۵٦');
    await setInput(page, editor, 1, 'سارا احمدی');
    await setInput(page, editor, 2, 'علی نظری 1۲٣');
    const verticalMeter = '[data-source-audio-meter][data-input-meter-orientation="vertical"]';
    const previewMeters = stage.locator(`[data-layout-preview-shot] ${verticalMeter}`);
    const meterToggle = editor.getByRole('button', { name: 'VU meters', exact: true });
    const rightMeter = editor
      .getByRole('button', { name: 'Edit plate 3', exact: true })
      .locator(verticalMeter);
    const sourceCombo = editor.getByRole('combobox', { name: 'Plate input' });
    const comboMeter = sourceCombo.locator(verticalMeter);
    await expect(meterToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(meterToggle).toHaveText('');
    await expect(meterToggle.locator('svg')).toHaveCount(1);
    await expect(previewMeters).toHaveCount(0);
    for (const meter of [rightMeter, comboMeter]) {
      await expect(meter.locator('[data-input-meter-channel="L"]')).toBeVisible();
      await expect(meter.locator('[data-input-meter-channel="R"]')).toBeVisible();
    }
    await expect(sourceCombo.locator('[data-input-thumbnail]')).toHaveCount(0);
    const gap = await rightMeter.evaluate((node) => {
      const picture = node.previousElementSibling?.getBoundingClientRect();
      if (picture === undefined) throw new Error('Plate meter has no adjacent picture');
      return node.getBoundingClientRect().left - picture.right;
    });
    expect(Math.abs(gap)).toBeLessThan(0.5);
    await meterToggle.click();
    await expect(meterToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(previewMeters).toHaveCount(3);
    for (const frameMeter of await previewMeters.all()) {
      await expect(frameMeter.locator('[data-input-meter-channel="L"]')).toBeVisible();
      await expect(frameMeter.locator('[data-input-meter-channel="R"]')).toBeVisible();
      const shot = await frameMeter.evaluate((node) => {
        const bounds = node.closest('[data-layout-preview-shot]')?.getBoundingClientRect();
        if (bounds === undefined) throw new Error('Preview meter has no frame');
        const meter = node.getBoundingClientRect();
        return {
          height: bounds.height,
          outerHeight: meter.height,
          gap: bounds.right - meter.right,
        };
      });
      expect(Math.abs(shot.outerHeight - shot.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(shot.gap)).toBeLessThan(0.5);
    }
    await meterToggle.click();
    await expect(meterToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(previewMeters).toHaveCount(0);
    const frame1 = editor.getByRole('button', { name: 'Edit plate 1', exact: true });
    const frame2 = editor.getByRole('button', { name: 'Edit plate 2', exact: true });
    await frame1.click();
    await editor.getByRole('textbox', { name: 'Title', exact: true }).focus();
    await expect(frame1).toHaveAttribute('aria-pressed', 'true');
    await expect(frame2).toHaveAttribute('aria-pressed', 'false');
    await expect(frame1.locator('.cg-live-layout-selection-mark')).toBeVisible();
    await expect(frame2.locator('.cg-live-layout-selection-mark')).toBeHidden();
    expect(await fieldAppearance(frame1)).not.toEqual(await fieldAppearance(frame2));
    await expect(stage.locator('[data-frame-number="1"][data-editing]')).toBeVisible();
    await expect(editor.getByRole('checkbox', { name: 'Plate 2 in preset' })).toBeChecked();
    await editor.getByText('Title style', { exact: true }).click();
    await expect(editor.getByLabel('Box width (%)', { exact: true })).toHaveValue('100');
    await expect(editor.getByLabel('Box height (%)', { exact: true })).toHaveValue('12');
    await expect(editor.getByRole('combobox', { name: 'Title font', exact: true })).toHaveValue(
      'Exo 2',
    );
    await editor.getByLabel('Box width (%)', { exact: true }).fill('70');
    await editor.getByLabel('Box height (%)', { exact: true }).fill('13');
    await editor.getByLabel('Title padding (px)', { exact: true }).fill('18');
    await editor.getByLabel('Text vertical offset (px)', { exact: true }).fill('-5');
    await editor.getByLabel('Horizontal alignment', { exact: true }).selectOption('center');
    await editor.getByLabel('Vertical alignment', { exact: true }).selectOption('bottom');
    await editor.getByLabel('Title color', { exact: true }).fill('#dce9f1');
    await editor.getByRole('checkbox', { name: 'Text wrap', exact: true }).check();
    const previewTitle = (frameNumber: number) =>
      stage.locator(`[data-frame-number="${String(frameNumber)}"] .cg-live-layout-shot-title`);
    const digits = editor.getByRole('combobox', { name: 'Digits', exact: true });
    await expect(digits).toBeHidden();
    await editor.getByText('Advanced', { exact: true }).click();
    await digits.selectOption('latin');
    await expect(previewTitle(1)).toContainText('456');
    await digits.selectOption('persian');
    await expect(previewTitle(1)).toContainText('۴۵۶');
    await expect(previewTitle(3)).toContainText('۱۲۳');
    for (const frameNumber of [1, 2]) {
      const title = previewTitle(frameNumber);
      await expect(title).toHaveCSS('color', 'rgb(220, 233, 241)');
      await expect(title).toHaveCSS('text-align', 'center');
      await expect(title).toHaveCSS('justify-content', 'end');
      await expect(title).toHaveCSS('white-space', 'normal');
      const geometry = await title.evaluate((element) => {
        const { width, height } = element.getBoundingClientRect();
        const frame = element.parentElement!.getBoundingClientRect();
        return { width: width / frame.width, height: height / frame.height };
      });
      expect(geometry.width).toBeCloseTo(0.7, 2);
      expect(geometry.height).toBeCloseTo(0.13, 2);
      const offset = await title
        .locator(':scope > span')
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).top));
      expect(offset).toBeLessThan(0);
    }
    await editor.getByLabel('Add title font file').setInputFiles({
      name: 'Panel Font.woff2',
      mimeType: 'font/woff2',
      buffer: fs.readFileSync(
        new URL('../../public/fonts/vazirmatn/vazirmatn-arabic-700-normal.woff2', import.meta.url),
      ),
    });
    const font = editor.getByRole('combobox', { name: 'Title font', exact: true });
    await expect(font).toHaveValue(/^asset-/);
    const uploadedFamily = await font.inputValue();
    await expect
      .poll(() =>
        page.evaluate(
          (family) =>
            [...document.fonts].some(
              (registered) => registered.family === family && registered.status === 'loaded',
            ),
          uploadedFamily,
        ),
      )
      .toBe(true);
    await editor
      .getByRole('group', { name: 'Title style scope' })
      .getByRole('button', { name: 'Plate 1', exact: true })
      .click();
    await expect(editor.getByLabel('Title padding (px)', { exact: true })).toHaveValue('18');
    await editor.getByLabel('Title X (%)', { exact: true }).fill('30');
    await editor.getByLabel('Title Y (%)', { exact: true }).fill('65');
    await editor.getByLabel('Title size (%)', { exact: true }).fill('6');
    await editor.getByLabel('Title font', { exact: true }).selectOption('Exo 2');
    await editor.getByLabel('Title background', { exact: true }).fill('#392822');
    await editor.getByLabel('Title background opacity (%)', { exact: true }).fill('60');
    await expect(digits).toBeHidden();
    await editor.getByText('Advanced', { exact: true }).click();
    await expect(digits).toHaveValue('persian');
    await digits.selectOption('arabic-indic');
    await expect(previewTitle(1)).toContainText('٤٥٦');
    await expect(previewTitle(3)).toContainText('۱۲۳');
    await expect(previewTitle(1)).toHaveCSS('background-color', 'rgba(57, 40, 34, 0.6)');
    await expect(previewTitle(2)).not.toHaveCSS('background-color', 'rgba(57, 40, 34, 0.6)');
    expect(await fieldAppearance(editor.getByLabel('Title size (%)', { exact: true }))).toEqual(
      await fieldAppearance(layoutName),
    );
    await editor.getByRole('textbox', { name: 'Preset name' }).fill('Three-up');
    await editor.getByRole('button', { name: 'Grid · fuller top' }).click();
    const horizontalGap = editor.getByLabel('Horizontal gap', { exact: true });
    const verticalGap = editor.getByLabel('Vertical gap', { exact: true });
    expect(await fieldAppearance(horizontalGap)).toEqual(await fieldAppearance(layoutName));
    await horizontalGap.fill('48');
    await horizontalGap.press('Tab');
    await verticalGap.fill('36');
    await verticalGap.press('Tab');
    await editor.getByRole('button', { name: 'Add preset' }).click();
    await expect(startPreset).toBeEnabled();
    expect((await startPreset.boundingBox())!.width).toBeCloseTo(startWidth, 1);
    await editor.getByRole('textbox', { name: 'Preset name' }).fill('Interview');
    await editor.getByRole('checkbox', { name: 'Plate 3 in preset' }).uncheck();
    const positionPicker = editor.getByRole('group', { name: 'Position in preset', exact: true });
    await frame2.click();
    await positionPicker.getByRole('button', { name: 'Position 1', exact: true }).click();
    await horizontalGap.fill('12');
    await horizontalGap.press('Tab');
    await editor.getByRole('button', { name: 'Add preset' }).click();
    await editor.getByRole('button', { name: 'Delete preset' }).click();
    const threeUp = editor.getByRole('button', { name: 'Three-up', exact: true });
    const interview = editor.getByRole('button', { name: 'Interview', exact: true });
    await threeUp.click();
    await editor.getByRole('textbox', { name: 'Preset name' }).focus();
    await expect(threeUp).toHaveAttribute('aria-pressed', 'true');
    await expect(interview).toHaveAttribute('aria-pressed', 'false');
    await expect(threeUp.locator('.cg-live-layout-selection-mark')).toBeVisible();
    await expect(interview.locator('.cg-live-layout-selection-mark')).toBeHidden();
    expect(await fieldAppearance(threeUp)).not.toEqual(await fieldAppearance(interview));
    await expect(editor.getByRole('checkbox', { name: 'Plate 3 in preset' })).toBeChecked();
    await expect(horizontalGap).toHaveValue('48');
    await expect(verticalGap).toHaveValue('36');
    await frame2.click();
    await positionPicker.getByRole('button', { name: 'Position 3', exact: true }).click();
    await expect(stage.locator('[data-frame-number="2"]')).toHaveAttribute(
      'data-preset-position',
      '3',
    );
    await expect(stage.locator('[data-frame-number="3"]')).toHaveAttribute(
      'data-preset-position',
      '2',
    );
    await positionPicker.getByRole('button', { name: 'Position 2', exact: true }).click();
    await frame1.click();
    const png = await page.evaluate(
      () => document.createElement('canvas').toDataURL('image/png').split(',')[1]!,
    );
    await editor.getByLabel('Background media file').setInputFiles({
      name: 'panel.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
    const backgroundImageButton = (dialog: Locator) =>
      dialog.getByRole('button', { name: 'Choose background image or video' });
    await expect(backgroundImageButton(editor)).toHaveAttribute('title', 'panel.png');
    await expect(backgroundImageButton(editor).locator('img')).toBeVisible();
    await editor.getByText('Layout effects', { exact: true }).click();
    await editor.getByRole('combobox', { name: 'Motion', exact: true }).selectOption('linear');
    await editor.getByLabel('Focus duration (ms)', { exact: true }).fill('1000');
    const departingPlates = editor.getByRole('combobox', { name: 'Departing plates' });
    await departingPlates.selectOption('up');
    await interview.click();
    const sharedShot = stage.locator('[data-layout-preview-shot][data-frame-number="1"]');
    await expect
      .poll(() =>
        sharedShot.evaluate((node) =>
          node.getAnimations().some(({ effect }) => {
            if (!(effect instanceof KeyframeEffect)) return false;
            const keys = effect.getKeyframes();
            return keys[0]?.left !== keys.at(-1)?.left || keys[0]?.top !== keys.at(-1)?.top;
          }),
        ),
      )
      .toBe(true);
    const departingShot = stage.locator('[data-layout-preview-shot][data-frame-number="3"]');
    const departure = await departingShot.evaluate((node) => {
      const effect = node.getAnimations()[0]?.effect;
      if (!(effect instanceof KeyframeEffect)) throw new Error('Missing plate exit transition');
      const keys = effect.getKeyframes();
      return {
        upward:
          Number.parseFloat(String(keys.at(-1)?.['top'])) <
          Number.parseFloat(String(keys[0]?.['top'])),
        opacity: Number(keys.at(-1)?.['opacity']),
      };
    });
    expect(departure).toEqual({ upward: true, opacity: 0 });
    await expect(sharedShot.locator('img')).toBeVisible();
    const arrivingPlates = editor.getByRole('combobox', { name: 'Arriving plates' });
    await arrivingPlates.selectOption('down');
    await expect(departingPlates).toHaveValue('up');
    await threeUp.click();
    const presetArrival = await departingShot.evaluate((node) => {
      const effect = node.getAnimations()[0]?.effect;
      if (!(effect instanceof KeyframeEffect)) throw new Error('Missing plate entrance');
      const keys = effect.getKeyframes();
      return {
        fromBelow:
          Number.parseFloat(String(keys[0]?.['top'])) >
          Number.parseFloat(String(keys.at(-1)?.['top'])),
        opacity: Number(keys[0]?.['opacity']),
      };
    });
    expect(presetArrival).toEqual({ fromBelow: true, opacity: 0 });
    await departingPlates.selectOption('');
    await arrivingPlates.selectOption('');
    const soloEffect = editor
      .getByRole('group', { name: 'Switch focused plate' })
      .getByLabel('Effect');
    await expect(soloEffect.getByRole('option', { name: 'Cut', exact: true })).toHaveCount(1);
    await expect(soloEffect.getByRole('option', { name: 'Fade', exact: true })).toHaveCount(1);
    await soloEffect.selectOption('push');
    expect(
      await fieldAppearance(editor.getByLabel('Switch duration (ms)', { exact: true })),
    ).toEqual(await fieldAppearance(layoutName));
    await editor.getByLabel('Switch duration (ms)', { exact: true }).fill('1000');
    const editorStage = editor.locator('[data-layout-preview]');
    await editor.getByRole('button', { name: 'Focus plate 1', exact: true }).click();
    const focusedTitle = editorStage.locator(
      '[data-layout-preview-shot][data-frame-number="1"] .cg-live-layout-shot-title',
    );
    await expect(focusedTitle).toBeVisible();
    await editor.getByRole('checkbox', { name: 'Show title in Focus' }).uncheck();
    await expect(focusedTitle).toHaveCount(0);
    await editor.getByRole('button', { name: 'Focus plate 2', exact: true }).click();
    const arrival = editorStage.locator('[data-layout-preview-shot][aria-hidden="false"]');
    await expect
      .poll(() =>
        arrival.evaluate((node) =>
          node
            .getAnimations()
            .some(
              ({ effect }) =>
                effect instanceof KeyframeEffect &&
                effect.getKeyframes().some(({ transform }) => String(transform).includes('100%')),
            ),
        ),
      )
      .toBe(true);
    await editor.getByRole('button', { name: 'Return to Three-up' }).click();
    await expect(focusedTitle).toBeVisible();

    await editor.getByRole('button', { name: 'Edit plate 3', exact: true }).click();
    await expect(
      editor.getByRole('group', { name: 'Plate input fit across presets', exact: true }),
    ).toBeHidden();
    await editor.getByText('Advanced plate controls', { exact: true }).click();
    const plateAppearance = editor.getByRole('group', { name: 'Plate appearance', exact: true });
    const operatorPermissions = editor.getByRole('group', {
      name: 'Operator permissions in CG Control',
      exact: true,
    });
    await expect(plateAppearance.getByLabel('Plate aspect ratio', { exact: true })).toBeVisible();
    await expect(plateAppearance.getByLabel('Plate input fit', { exact: true })).toBeVisible();
    const thirdShot = editorStage.locator('[data-layout-preview-shot][data-frame-number="3"]');
    await editor.getByLabel('Border color', { exact: true }).fill('#fec352');
    await editor.getByLabel('Border width (px)', { exact: true }).fill('18');
    await expect(editor.getByLabel('Border radius (px)', { exact: true })).toHaveCount(0);
    const authoredBorder = thirdShot.locator('.cg-live-layout-shot-border');
    await expect(authoredBorder).toHaveCSS('border-top-color', 'rgb(254, 195, 82)');
    await expect(authoredBorder).toHaveCSS('border-top-left-radius', '0px');
    const borderInPreset = plateAppearance.getByLabel('Show border in preset', { exact: true });
    const borderInFocus = plateAppearance.getByLabel('Show border in Focus', { exact: true });
    await expect(borderInPreset).toBeChecked();
    await expect(borderInFocus).toBeChecked();
    await borderInPreset.uncheck();
    await expect(authoredBorder).toHaveCount(0);
    await borderInPreset.check();
    await borderInFocus.uncheck();
    await thirdShot.getByRole('button', { name: /^Focus plate 3/ }).click();
    await expect(authoredBorder).toHaveCount(0);
    await editor.getByRole('button', { name: /^Return to / }).click();
    await expect(authoredBorder).toBeVisible();
    await borderInFocus.check();
    await expect(thirdShot).toHaveCSS('outline-offset', '2px');
    await expect(thirdShot).toHaveCSS('outline-style', 'solid');
    const pictureClip = thirdShot.locator('.cg-live-layout-shot-source');
    await expect(pictureClip).toHaveCSS('overflow', 'hidden');
    await expect(pictureClip).toHaveCSS('border-top-left-radius', '0px');
    const pictureWindows = thirdShot.locator('.cg-live-layout-shot-picture');
    const windowRatios = (window: Locator) =>
      window.evaluate((node) => {
        const clip = node.getBoundingClientRect();
        const frame = node.parentElement!.getBoundingClientRect();
        return [clip.width / frame.width, clip.height / frame.height].map((value) =>
          Math.round(value * 100),
        );
      });
    await expect.poll(() => windowRatios(pictureWindows)).toEqual([75, 100]);
    await plateAppearance.getByRole('button', { name: 'Crop edges', exact: true }).click();
    await expect.poll(() => windowRatios(pictureWindows)).toEqual([100, 100]);
    await expect(
      operatorPermissions.getByRole('button', { name: 'Locked', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await operatorPermissions.getByRole('button', { name: 'Keep aspect', exact: true }).click();
    const move = operatorPermissions.getByRole('checkbox', { name: 'Move plate', exact: true });
    const operatorCrop = operatorPermissions.getByRole('checkbox', {
      name: 'Crop input',
      exact: true,
    });
    await expect(move).not.toBeChecked();
    await expect(operatorCrop).toBeChecked();
    await operatorCrop.uncheck();
    await expect(pictureWindows).toHaveCount(1);
    await operatorCrop.check();
    await move.check();
    await editor.getByRole('button', { name: 'Add mask window', exact: true }).click();
    await expect(operatorCrop).toBeDisabled();
    await expect(editor.getByRole('region', { name: 'Plate crop', exact: true })).toHaveCount(0);
    await expect.poll(() => windowRatios(pictureWindows)).toEqual([50, 50]);
    const maskEdit = editor.getByRole('button', { name: 'Edit mask in preview', exact: true });
    await maskEdit.click();
    const maskWindow = thirdShot.locator('[data-layout-mask-window="1"]');
    await expect(maskWindow.getByRole('button', { name: /Resize mask window 1 from/ })).toHaveCount(
      8,
    );
    await expect
      .poll(() =>
        thirdShot.evaluate((node) =>
          node.getAnimations().some(({ playState }) => playState === 'running'),
        ),
      )
      .toBe(false);
    const bounds = (await thirdShot.boundingBox())!;
    const dragMask = async (target: Locator, dx: number, dy: number) => {
      await target.hover();
      const box = (await target.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 3 });
      await page.mouse.up();
    };
    const maskX = editor.getByLabel('Mask X (%)', { exact: true });
    const maskY = editor.getByLabel('Mask Y (%)', { exact: true });
    const maskWidth = editor.getByLabel('Mask width (%)', { exact: true });
    const maskHeight = editor.getByLabel('Mask height (%)', { exact: true });
    await dragMask(maskWindow, bounds.width * 0.1, -bounds.height * 0.05);
    await expect.poll(async () => Number(await maskX.inputValue())).toBeCloseTo(35, 0);
    await expect.poll(async () => Number(await maskY.inputValue())).toBeCloseTo(20, 0);
    const right = maskWindow.getByRole('button', {
      name: 'Resize mask window 1 from right',
      exact: true,
    });
    await dragMask(right, bounds.width * 0.1, 15);
    await expect.poll(async () => Number(await maskWidth.inputValue())).toBeCloseTo(60, 0);
    await expect(maskHeight).toHaveValue('50');
    const topLeft = maskWindow.getByRole('button', {
      name: 'Resize mask window 1 from top left',
      exact: true,
    });
    await topLeft.press('Shift+ArrowUp');
    await expect.poll(async () => Number(await maskY.inputValue())).toBeLessThan(20);
    await maskX.fill('25');
    await maskY.fill('25');
    await maskWidth.fill('50');
    await maskHeight.fill('50');
    await maskEdit.click();
    await expect(maskWindow).toBeHidden();
    await editor.getByRole('button', { name: 'Show outside', exact: true }).click();
    await expect(pictureWindows).toHaveCount(4);
    await editor.getByRole('button', { name: 'Show inside', exact: true }).click();
    await operatorPermissions.getByRole('checkbox', { name: 'Allow mask editing' }).check();
    await editor.getByRole('button', { name: 'Focus plate 3', exact: true }).click();
    await expect(thirdShot).toHaveAttribute('aria-hidden', 'false');
    await expect.poll(() => windowRatios(pictureWindows)).toEqual([50, 50]);
    await editor.getByRole('button', { name: 'Return to Three-up' }).click();
    await editor.getByRole('textbox', { name: 'Focus label', exact: true }).fill('خبرخوان');
    await expect(thirdShot.getByRole('button', { name: /Focus plate 3.*خبرخوان/ })).toBeVisible();
    const additionalText = editor.getByText('Additional text', { exact: true }).locator('..');
    await additionalText.getByText('Additional text', { exact: true }).click();
    await additionalText.getByRole('button', { name: 'Add text', exact: true }).click();
    await additionalText.getByRole('textbox', { name: 'Text 2', exact: true }).fill('سطر دوم 7۸٩');
    await additionalText.getByText('Text style', { exact: true }).click();
    const textScope = additionalText.getByRole('group', { name: 'Text style scope' });
    await expect(textScope.getByRole('button', { name: 'All plates' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await additionalText.getByLabel('Title Y (%)', { exact: true }).fill('59');
    await textScope.getByRole('button', { name: 'Plate 3', exact: true }).click();
    await expect(additionalText.getByLabel('Title Y (%)', { exact: true })).toHaveValue('59');
    await additionalText.getByLabel('Title Y (%)', { exact: true }).fill('43');
    await expect(thirdShot).toContainText('سطر دوم ۷۸۹');
    await expect(thirdShot).toContainText('علی نظری ۱۲۳');
    await editor.getByRole('button', { name: 'Add preset', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Preset name' }).fill('Studio solo');
    await editor.getByRole('checkbox', { name: 'Plate 2 in preset' }).uncheck();
    await editor.getByRole('checkbox', { name: 'Plate 3 in preset' }).uncheck();
    await editor.getByRole('button', { name: 'Edit plate 1', exact: true }).click();
    const soloFocusTitle = editor.getByRole('checkbox', { name: 'Show title in Focus' });
    await expect(editor.getByRole('checkbox', { name: 'Show title in preset' })).toBeChecked();
    await soloFocusTitle.check();
    await expect(focusedTitle).toBeVisible();
    await soloFocusTitle.uncheck();
    await expect(focusedTitle).toHaveCount(0);
    await editor.getByRole('button', { name: 'Three-up', exact: true }).click();
    await expect(focusedTitle).toBeVisible();
    await editor.getByRole('button', { name: 'Edit plate 3', exact: true }).click();
    await editor.getByText('Plate graphics', { exact: true }).click();
    const [graphicPicker] = await Promise.all([
      page.waitForEvent('filechooser'),
      editor.getByRole('button', { name: 'Add .vcg graphic', exact: true }).click(),
    ]);
    await graphicPicker.setFiles({
      name: 'studio-logo.vcg',
      mimeType: 'application/zip',
      buffer: Buffer.from(await frameGraphic()),
    });
    const frameArt = thirdShot.locator('[data-layout-frame-graphic]');
    await expect(frameArt.locator('[data-cg-element-id="frame-graphic-accent"]')).toBeVisible();
    await editor.getByRole('button', { name: 'Align to mask', exact: true }).click();
    await expect(editor.getByLabel('Graphic X (%)', { exact: true })).toHaveValue('25');
    await expect(editor.getByLabel('Graphic width (%)', { exact: true })).toHaveValue('50');
    await interview.click();
    await editor.getByRole('checkbox', { name: 'Plate 3 in preset' }).check();
    await expect(frameArt.locator('[data-cg-element-id="frame-graphic-accent"]')).toBeVisible();
    await editor.getByRole('button', { name: /Focus plate 3.*خبرخوان/ }).click();
    await expect(frameArt.locator('[data-cg-element-id="frame-graphic-accent"]')).toBeVisible();
    await editor.getByRole('button', { name: 'Return to Interview' }).click();
    await editor.getByRole('checkbox', { name: 'Plate 3 in preset' }).uncheck();
    await threeUp.click();
    await expect(frameArt.locator('[data-cg-element-id="frame-graphic-accent"]')).toBeVisible();
    await editor.getByRole('button', { name: 'Save layout' }).click();
    await expect(editor).toBeHidden();

    const listed = runtime.templateList(1).find(({ name }) => name === 'Studio panel');
    expect(listed?.controlLiveLayout?.presets.map(({ name }) => name)).toEqual([
      'Three-up',
      'Interview',
      'Studio solo',
    ]);
    expect(listed?.controlLiveLayout?.presets[0]?.arrangement).toBe('grid-top');
    expect(listed?.controlLiveLayout?.presets[0]).toMatchObject({
      horizontalGap: 48,
      verticalGap: 36,
    });
    expect(listed?.controlLiveLayout?.presets[1]?.frameIds).toHaveLength(2);
    expect(listed?.controlLiveLayout?.presets[1]?.horizontalGap).toBe(12);
    expect(listed?.controlLiveLayout?.background.kind).toBe('image');
    if (listed?.controlLiveLayout === undefined || listed.controlLiveLayoutSource === undefined) {
      throw new Error('The authored layout package was not retained');
    }
    const authored = listed.controlLiveLayout;
    expect(authored.frameAttachments).toMatchObject([
      {
        name: 'Studio logo',
        frameId: authored.frames[2]?.id,
        rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      },
    ]);
    expect(authored.presets[1]?.frameIds).toEqual([authored.frames[1]?.id, authored.frames[0]?.id]);
    expect(authored.frames[2]?.focusAlias).toBe('خبرخوان');
    expect(authored.additionalTextStyles).toMatchObject([{ yPercent: 59 }]);
    expect(authored.frames[2]?.additionalTexts).toMatchObject([
      { text: 'سطر دوم 7۸٩', style: { yPercent: 43 } },
    ]);
    expect(authored.titleStyle).toMatchObject({
      widthPercent: 70,
      heightPercent: 13,
      padding: 18,
      textOffsetY: -5,
      align: 'center',
      verticalAlign: 'bottom',
      color: '#dce9f1',
      wrap: true,
      fontFamily: uploadedFamily,
      digits: 'persian',
    });
    expect(authored.fonts?.map(({ name }) => name)).toEqual(['Panel Font.woff2']);
    expect(authored.frames[1]?.titleStyle).toBeUndefined();
    expect(authored.frames[2]).toMatchObject({
      fitMode: 'cover',
      operatorMove: true,
      operatorPlacement: 'proportional',
      liveMask: { mode: 'inside', rects: [{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }] },
      allowOperatorMaskEdit: true,
    });
    expect(authored.presets[0]?.hiddenFocusTitles).toContain(authored.frames[0]?.id);
    expect(authored.frames[0]?.titleStyle).toMatchObject({
      xPercent: 30,
      yPercent: 65,
      sizePercent: 6,
      fontFamily: 'Exo 2',
      digits: 'arabic-indic',
    });
    expect(authored.frames[0]?.titleStyle?.backgroundColor?.toLowerCase()).toContain('#392822');
    const origin = authored.defaultPresetId;
    const solo = authored.presets.find(({ name }) => name === 'Studio solo');
    if (solo === undefined) throw new Error('The authored one-frame preset was not retained');
    const focus = (index: number) =>
      controlLiveLayoutFocusLookId(origin, authored.frames[index]!.id);
    expect(runtime.templateSourceGet(listed.controlLiveLayoutSource).ok).toBe(true);
    await page.evaluate(
      async ({ templateId }) => {
        await window.cg.fixedLayers.load({
          channel: 1,
          layer: 59,
          templateId,
          itemId: 'panel',
          fields: {},
        });
      },
      { templateId: listed.templateId },
    );
    const row = layers.locator('[data-layer="59"]');
    await row.getByRole('button', { name: /^ON PVW/ }).click();
    await page.getByRole('button', { name: 'Show monitors' }).click();
    const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
    const localFocus = page.getByRole('group', { name: 'Preview Focus', exact: true });
    await expect(localFocus).toBeVisible();
    await expect(
      localFocus.getByRole('button', { name: /Focus plate 3 in Preview.*خبرخوان/ }),
    ).toBeVisible();
    await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
    await expect(pvw.locator(`[data-live-plate-overlay] ${verticalMeter}`)).toHaveCount(3);
    const authoredPlate = pvw.locator(`[data-live-plate="${authored.frames[0]!.id}"]`);
    await expect(authoredPlate).toHaveAttribute('aria-label', /مجری برنامه/);
    await expect(authoredPlate).not.toHaveAttribute(
      'aria-label',
      new RegExp(authored.frames[0]!.id),
    );
    await expect(authoredPlate).not.toContainText(authored.frames[0]!.id);
    const previewFrame = page.frameLocator('iframe[data-rehearsal-frame="panel"]');
    const studioPicture = previewFrame
      .locator('[data-cg-pvw-picture-part][data-source-id="feed-1"]')
      .first()
      .locator('img');
    await expect(studioPicture).toBeVisible();
    const originalStudioPicture = await studioPicture.getAttribute('src');
    await page.evaluate(() => document.body.setAttribute('data-test-pvw-lease-stalled', ''));
    await expect
      .poll(
        async () => {
          const src = await studioPicture.evaluateAll(
            (images) => images[0]?.getAttribute('src') ?? null,
          );
          return src !== null && src !== originalStudioPicture;
        },
        { timeout: 10_000 },
      )
      .toBe(true);
    await page.evaluate(() => document.body.removeAttribute('data-test-pvw-lease-stalled'));
    await expect(studioPicture).toHaveAttribute('src', originalStudioPicture!);
    const maskedPvwPicture = previewFrame.locator(
      '[data-cg-pvw-picture-part][data-source-id="feed-3"]',
    );
    await expect.poll(() => windowRatios(maskedPvwPicture)).toEqual([50, 50]);
    const title = previewFrame
      .locator(`[data-cg-element-id="${authored.frames[0]!.id}-title"]`)
      .filter({ visible: true })
      .first();
    await expect(title).toHaveCSS('font-family', /Exo 2/);
    await expect(title).toContainText('٤٥٦');
    await expect(
      previewFrame.getByText('سطر دوم ۷۸۹', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      previewFrame.locator('[data-cg-element-id="frame-graphic-accent"]').filter({ visible: true }),
    ).toBeVisible();
    await row.click();
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    const previewPreset = (id: string) => inspector.locator(`[data-look-tab="${id}"]`);
    await previewPreset(solo.id).click();
    const oneFrameLook = previewFrame.locator(`[data-cg-element-id="layout-look-${solo.id}"]`);
    await expect(oneFrameLook).toBeVisible();
    await expect(
      oneFrameLook.locator(`[data-cg-element-id="${authored.frames[0]!.id}-title"]`),
    ).toHaveAttribute('data-cg-instance-hidden-text', '');
    await expect(title).toHaveCount(0);
    await previewPreset(origin).click();
    await expect(title).toBeVisible();
    const previewStart = engine.receivedCommands().length;
    await localFocus.getByRole('button', { name: 'Focus plate 1 in Preview' }).click();
    await expect(localFocus.getByRole('button', { name: 'Return to Three-up' })).toBeVisible();
    await expect(
      previewFrame.locator(`[data-cg-element-id="layout-look-${focus(0)}"]`),
    ).toBeVisible();
    const hiddenTitle = previewFrame
      .locator(`[data-cg-element-id="layout-look-${focus(0)}"]`)
      .locator(`[data-cg-element-id="${authored.frames[0]!.id}-title"]`);
    await expect(hiddenTitle).toHaveAttribute('data-cg-instance-hidden-text', '');
    await expect(hiddenTitle).toBeHidden();
    await localFocus.getByRole('button', { name: 'Focus plate 2 in Preview' }).click();
    await expect(previewFrame.locator('[data-cg-pvw-focus-switch="push"]').first()).toBeVisible();
    await expect(
      localFocus.getByRole('button', { name: 'Focus plate 2 in Preview' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(previewFrame.locator('[data-cg-pvw-focus-switch="push"]')).toHaveCount(0);
    await localFocus.getByRole('button', { name: /Focus plate 3 in Preview/ }).click();
    const push = previewFrame.locator('[data-cg-pvw-focus-switch="push"]');
    const graphic = '[data-cg-element-id="frame-graphic-accent"]';
    const thirdPlateBorder = `[data-cg-element-id="${authored.frames[2]!.id}-border"]`;
    const incoming = push.locator('[data-cg-pvw-focus-plane="incoming"]');
    await Promise.all([
      expect(incoming.locator(graphic)).toBeVisible(),
      expect(incoming.locator(thirdPlateBorder)).toBeVisible(),
    ]);
    await expect(push).toHaveCount(0);
    const focusedBorder = previewFrame.locator(thirdPlateBorder).filter({ visible: true });
    await expect(focusedBorder).toHaveCSS('border-top-left-radius', '0px');
    await localFocus.getByRole('button', { name: 'Focus plate 2 in Preview' }).click();
    const outgoing = push.locator('[data-cg-pvw-focus-plane="outgoing"]');
    await Promise.all([
      expect(outgoing.locator(graphic)).toBeVisible(),
      expect(outgoing.locator(thirdPlateBorder)).toBeVisible(),
    ]);
    await expect(push).toHaveCount(0);
    await expect(previewFrame.locator(graphic).filter({ visible: true })).toHaveCount(0);
    await localFocus.getByRole('button', { name: 'Return to Three-up' }).click();
    await expect(localFocus.getByRole('button', { name: 'Return to Three-up' })).toHaveCount(0);
    // Bridge can still be restoring default volumes to the fixed rows after connection.
    expect(
      engine
        .receivedCommands()
        .slice(previewStart)
        .filter(
          ({ line }) =>
            /^(?:CG|PLAY|CLEAR|MIXER 1-(?:5[0-9]|6[0-9]|7[0-9])) /.test(line) &&
            !/^MIXER 1-5[0-9] VOLUME 1$/.test(line),
        ),
    ).toEqual([]);

    await row.getByRole('button', { name: /^PLAY/ }).click();
    await expect(row.getByText('ON AIR', { exact: true })).toBeVisible({ timeout: 12_000 });
    const programme = row.getByRole('group', { name: 'Programme Focus', exact: true });
    await expect(
      programme.getByRole('button', { name: /Focus plate 3 in Programme.*خبرخوان/ }),
    ).toBeVisible();
    const presetType = await row.locator(`[data-look-id="${origin}"]`).evaluate((button) => {
      const style = getComputedStyle(button);
      return { size: style.fontSize, weight: style.fontWeight };
    });
    for (const group of [localFocus, programme]) {
      const button = group.getByRole('button', { name: /Focus plate 3 .*خبرخوان/ });
      await expect(button).toHaveCSS('font-size', presetType.size);
      await expect(button).toHaveCSS('font-weight', presetType.weight);
    }
    const active = () => runtime.activeLookId('panel');
    const seats = () =>
      runtime
        .liveLayers()
        .get('panel')
        ?.map(({ slot, fill, clip, producer }) => ({ slot, fill, clip, producer }))
        .sort((left, right) => left.slot.layer - right.slot.layer);
    await expect.poll(() => seats()?.length).toBe(3);
    const initial = seats();
    const wireStart = engine.receivedCommands().length;
    await programme.getByRole('button', { name: 'Focus plate 1 in Programme' }).click();
    await expect.poll(active).toBe(focus(0));
    await expect(localFocus.getByRole('button', { name: 'Return to Three-up' })).toHaveCount(0);
    await programme.getByRole('button', { name: 'Focus plate 2 in Programme' }).click();
    await expect.poll(active).toBe(focus(1));
    await programme.getByRole('button', { name: 'Return to Three-up' }).click();
    await expect.poll(active).toBe(origin);
    expect(seats()).toEqual(initial);
    const focusCommands = engine
      .receivedCommands()
      .slice(wireStart)
      .map(({ line }) => line);
    expect(focusCommands.some((line) => / FILL .* \d+ linear DEFER$/.test(line))).toBe(true);
    expect(
      focusCommands.filter((line) => /^(?:PLAY|CLEAR) 1-(?:6[0-9]|7[0-9])\b/.test(line)),
    ).toEqual([]);

    const inputEffect = inspector.getByRole('combobox', { name: 'Input transition' });
    await expect(inputEffect.locator('option:checked')).toHaveText('Layout default (Push)');
    await inputEffect.selectOption('slide-over');
    await localFocus.getByRole('button', { name: /Focus plate 3 in Preview/ }).click();
    await expect(
      previewFrame.locator(`[data-cg-element-id="layout-look-${focus(2)}"]`),
    ).toBeVisible();
    await localFocus.getByRole('button', { name: 'Focus plate 2 in Preview' }).click();
    const slide = previewFrame.locator('[data-cg-pvw-focus-switch="slide-over"]');
    const covered = slide.locator('[data-cg-pvw-focus-plane="outgoing"]');
    await expect(covered.locator(graphic)).toBeVisible();
    const coversOldGraphic = await covered.evaluate((node) =>
      node.getAnimations().some((animation) => {
        const effect = animation.effect;
        return (
          effect instanceof KeyframeEffect &&
          effect.getKeyframes().some((frame) => typeof frame['clipPath'] === 'string')
        );
      }),
    );
    expect(coversOldGraphic).toBe(true);
    await expect(slide).toHaveCount(0);
    await expect(previewFrame.locator(graphic).filter({ visible: true })).toHaveCount(0);
    await localFocus.getByRole('button', { name: 'Return to Three-up' }).click();
    await inputEffect.selectOption('fade');
    await localFocus.getByRole('button', { name: 'Focus plate 1 in Preview' }).click();
    await expect(
      previewFrame.locator(`[data-cg-element-id="layout-look-${focus(0)}"]`),
    ).toBeVisible();
    await expect(
      localFocus.getByRole('button', { name: 'Focus plate 1 in Preview' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await localFocus.getByRole('button', { name: 'Focus plate 2 in Preview' }).click();
    await expect(previewFrame.locator('[data-cg-pvw-focus-switch="fade"]')).toBeVisible();
    await expect(previewFrame.locator('[data-cg-pvw-focus-switch="fade"]')).toHaveCount(0);
    await localFocus.getByRole('button', { name: 'Return to Three-up' }).click();

    await programme.getByRole('button', { name: 'Focus plate 1 in Programme' }).click();
    await expect.poll(active).toBe(focus(0));
    const fadeStart = engine.receivedCommands().length;
    await programme.getByRole('button', { name: 'Focus plate 2 in Programme' }).click();
    await expect.poll(active).toBe(focus(1));
    expect(
      engine
        .receivedCommands()
        .slice(fadeStart)
        .some(({ line }) => / OPACITY (?:0|1) 25 linear DEFER$/.test(line)),
    ).toBe(true);
    await programme.getByRole('button', { name: 'Return to Three-up' }).click();
    await expect.poll(active).toBe(origin);

    const presetEffect = inspector
      .getByRole('group', { name: 'Preset effect', exact: true })
      .getByRole('combobox', { name: 'Motion', exact: true });
    await expect(presetEffect.locator('option:checked')).toHaveText('Layout default (Linear)');
    await presetEffect.selectOption('cut');
    const presetStart = engine.receivedCommands().length;
    await row.locator(`[data-look-id="${solo.id}"]`).click();
    await expect.poll(active).toBe(solo.id);
    await row.locator(`[data-look-id="${origin}"]`).click();
    await expect.poll(active).toBe(origin);
    await programme.getByRole('button', { name: 'Focus plate 1 in Programme' }).click();
    await expect.poll(active).toBe(focus(0));
    expect(
      engine
        .receivedCommands()
        .slice(presetStart)
        .some(({ line }) => / (?:FILL|CLIP) .* [1-9]\d* linear DEFER$/.test(line)),
    ).toBe(false);
    await programme.getByRole('button', { name: 'Return to Three-up' }).click();
    await expect.poll(active).toBe(origin);

    await page.getByRole('button', { name: 'Open templates', exact: true }).click();
    const library = page.getByRole('dialog', { name: 'Templates · CH 1' });
    await expect(
      library.getByRole('button', { name: 'Select Designer graphics', exact: true }),
    ).toBeVisible();
    await library.getByRole('button', { name: 'Select Studio panel', exact: true }).click();
    await library.getByRole('button', { name: 'Edit layout' }).click();
    const lockedEdit = page.getByRole('dialog', { name: 'Edit live layout' });
    await lockedEdit.getByRole('textbox', { name: 'Layout name' }).fill('Unsaved change');
    await lockedEdit.getByRole('button', { name: 'Save layout' }).click();
    await expect(lockedEdit.getByText(/Duplicate .+ while it is on air/i)).toBeVisible();
    await lockedEdit.getByRole('button', { name: 'Cancel', exact: true }).click();
    await library.getByRole('button', { name: 'Duplicate layout' }).click();
    const copy = page.getByRole('dialog', { name: 'Duplicate live layout' });
    await expect(copy.getByRole('textbox', { name: 'Layout name' })).toHaveValue(
      'Studio panel copy',
    );
    await expect(backgroundImageButton(copy)).toHaveAttribute('title', 'panel.png');
    await expect(backgroundImageButton(copy).locator('img')).toBeVisible();
    await copy.getByText('Title style', { exact: true }).click();
    await expect(copy.getByLabel('Box width (%)', { exact: true })).toHaveValue('70');
    await expect(copy.getByLabel('Text vertical offset (px)', { exact: true })).toHaveValue('-5');
    await expect(copy.getByRole('combobox', { name: 'Title font', exact: true })).toHaveValue(
      uploadedFamily,
    );
    await copy.getByText('Advanced', { exact: true }).click();
    await expect(copy.getByRole('combobox', { name: 'Digits', exact: true })).toHaveValue(
      'persian',
    );
    await copy.getByRole('button', { name: 'Edit plate 3', exact: true }).click();
    await expect(copy.getByRole('textbox', { name: 'Focus label', exact: true })).toHaveValue(
      'خبرخوان',
    );
    await copy.getByText('Additional text', { exact: true }).click();
    await expect(copy.getByRole('textbox', { name: 'Text 2', exact: true })).toHaveValue(
      'سطر دوم 7۸٩',
    );
    const noBackground = (dialog: Locator) =>
      dialog
        .getByRole('group', { name: 'Background', exact: true })
        .getByRole('button', { name: 'None', exact: true });
    const copiedStage = copy.locator('[data-layout-preview]');
    const aspect = (target: Locator) =>
      target.evaluate((node) => {
        const { width, height } = node.getBoundingClientRect();
        return width / height;
      });
    const copiedPlate = (number: number) =>
      copiedStage.locator(`[data-layout-preview-shot][data-frame-number="${number}"]`);
    const presetAspect = copy.getByLabel('Preset plate aspect ratio', { exact: true });
    const presetFit = copy.getByLabel('Preset input fit', { exact: true });
    await copy.getByRole('button', { name: 'Three-up', exact: true }).click();
    await presetAspect.selectOption({ label: '3:4' });
    await presetFit.selectOption('cover');
    for (const number of [1, 2, 3]) {
      await expect.poll(() => aspect(copiedPlate(number))).toBeCloseTo(0.75, 2);
    }
    const portraitImage = copiedPlate(1).locator('.cg-live-layout-shot-picture img');
    const imageOverflow = (target: Locator) =>
      target.evaluate((node) => {
        const image = node.getBoundingClientRect();
        const box = node.parentElement!.getBoundingClientRect();
        return [box.left - image.left, image.right - box.right] as const;
      });
    const [croppedLeft, croppedRight] = await imageOverflow(portraitImage);
    expect(croppedLeft).toBeGreaterThan(0);
    expect(croppedRight).toBeGreaterThan(0);
    expect(croppedLeft).toBeCloseTo(croppedRight, 1);
    const defaultCropX = copy.getByLabel('Default crop X (%)', { exact: true });
    await expect(defaultCropX).toHaveValue('50');
    await defaultCropX.fill('25');
    await expect
      .poll(async () => {
        const [left, right] = await imageOverflow(portraitImage);
        return left / (left + right);
      })
      .toBeCloseTo(0.25, 2);
    await copy.getByRole('button', { name: 'Edit plate 1', exact: true }).click();
    await copy.getByText('Advanced plate controls', { exact: true }).click();
    const editCrop = copy.getByRole('button', { name: 'Edit crop in preview', exact: true });
    await editCrop.click();
    const cropDrag = copiedPlate(1).getByRole('button', { name: /^Adjust crop for / });
    await dragMask(cropDrag, -16, 0);
    const plateCropX = copy.getByLabel('Crop X (%)', { exact: true });
    await expect.poll(async () => Number(await plateCropX.inputValue())).toBeGreaterThan(25);
    await plateCropX.fill('75');
    await expect
      .poll(async () => {
        const [left, right] = await imageOverflow(portraitImage);
        return left / (left + right);
      })
      .toBeCloseTo(0.75, 2);
    await editCrop.click();
    await copy.getByRole('button', { name: 'Edit plate 2', exact: true }).click();
    await copy.getByLabel('Plate aspect ratio', { exact: true }).selectOption({ label: '4:3' });
    await copy.getByLabel('Plate input fit', { exact: true }).selectOption('contain');
    await expect.poll(() => aspect(copiedPlate(2))).toBeCloseTo(4 / 3, 2);
    await expect.poll(() => aspect(copiedPlate(1))).toBeCloseTo(0.75, 2);
    await copy.getByRole('button', { name: 'Studio solo', exact: true }).click();
    await presetAspect.selectOption({ label: '16:9' });
    await presetFit.selectOption('contain');
    await expect.poll(() => aspect(copiedPlate(1))).toBeCloseTo(16 / 9, 2);
    await expect.poll(() => imageOverflow(portraitImage)).toEqual([0, 0]);
    await copy.getByRole('button', { name: 'Three-up', exact: true }).click();
    await expect.poll(() => aspect(copiedPlate(1))).toBeCloseTo(0.75, 2);
    await copy.getByRole('button', { name: 'Studio solo', exact: true }).click();
    const cropMotion = await copiedPlate(1).evaluate((shot) => {
      const animation = shot.getAnimations()[0];
      const image = shot.querySelector('img');
      if (animation?.effect == null || image === null) throw new Error('Missing crop transition');
      const duration = Number(animation.effect.getComputedTiming().duration);
      animation.pause();
      const sample = (time: number) => {
        animation.currentTime = time;
        const { width, height } = image.getBoundingClientRect();
        return {
          fit: Number(getComputedStyle(shot).getPropertyValue('--cg-shot-contain')),
          aspect: width / height,
        };
      };
      const samples = [sample(0), sample(duration / 2), sample(duration * 0.9)];
      animation.cancel();
      return samples;
    });
    expect(cropMotion[0]?.fit).toBe(0);
    expect(cropMotion[1]?.fit).toBeGreaterThan(0);
    expect(cropMotion[1]?.fit).toBeLessThan(1);
    expect(cropMotion[2]?.fit).toBeGreaterThan(cropMotion[1]!.fit);
    for (const { aspect: imageAspect } of cropMotion) expect(imageAspect).toBeCloseTo(16 / 9, 2);
    await copy.getByRole('button', { name: 'Three-up', exact: true }).click();
    await noBackground(copy).click();
    await expect(noBackground(copy)).toHaveAttribute('aria-pressed', 'true');
    await expect(backgroundImageButton(copy).locator('img')).toHaveCount(0);
    await expect(copiedStage).toHaveAttribute('data-transparent-background', '');
    await expect(copiedStage).toHaveCSS('background-image', /gradient/);
    await expect(copiedStage.locator(':scope > img, :scope > video')).toHaveCount(0);
    await copy.getByRole('textbox', { name: 'Layout name' }).fill('Next programme');
    const beforeSave = engine.receivedCommands().length;
    await copy.getByRole('button', { name: 'Save layout' }).click();
    await expect(copy).toBeHidden();
    await expect
      .poll(() => runtime.templateList(1).find(({ name }) => name === 'Next programme')?.templateId)
      .toBeDefined();
    const nextTemplate = runtime.templateList(1).find(({ name }) => name === 'Next programme');
    if (nextTemplate === undefined) throw new Error('The second live layout was not saved');
    expect(nextTemplate.templateId).not.toBe(listed.templateId);
    expect(nextTemplate.controlLiveLayout?.background).toEqual({ kind: 'none' });
    const nextLayout = nextTemplate.controlLiveLayout!;
    const thirdUp = nextLayout.presets.find(({ name }) => name === 'Three-up');
    expect(thirdUp).toMatchObject({
      plateAspectRatio: 0.75,
      plateFitMode: 'cover',
      plateCropFocus: { x: 0.25, y: 0.5 },
      plateOverrides: {
        [nextLayout.frames[0]!.id]: { cropFocus: { x: 0.75, y: 0.5 } },
        [nextLayout.frames[1]!.id]: { aspectRatio: 4 / 3, fitMode: 'contain' },
      },
    });
    expect(nextLayout.presets.find(({ name }) => name === 'Studio solo')).toMatchObject({
      plateAspectRatio: 16 / 9,
      plateFitMode: 'contain',
    });
    expect(runtime.templateGet(listed.templateId, 1)?.controlLiveLayoutSource).toBe(
      listed.controlLiveLayoutSource,
    );
    expect(active()).toBe(origin);
    expect(
      engine
        .receivedCommands()
        .slice(beforeSave)
        .filter(({ line }) => /^(?:CG|PLAY|CLEAR|MIXER) /.test(line)),
    ).toEqual([]);
    await library.getByRole('button', { name: 'Select Next programme', exact: true }).click();
    await page.evaluate(() => {
      Object.defineProperties(window, {
        showSaveFilePicker: { value: undefined, configurable: true },
        showOpenFilePicker: { value: undefined, configurable: true },
      });
    });
    const [exported] = await Promise.all([
      page.waitForEvent('download'),
      library.getByRole('button', { name: 'Export .vcg', exact: true }).click(),
    ]);
    expect(exported.suggestedFilename()).toMatch(/\.vcg$/i);
    const exportedPath = await exported.path();
    if (exportedPath === null) throw new Error('Missing layout download');
    const exportedBytes = fs.readFileSync(exportedPath);
    expect(sha256Hex(exportedBytes)).toBe(nextTemplate.controlLiveLayoutSource);
    expect(runtime.templateRemove(nextTemplate.templateId, 1).ok).toBe(true);
    const again = library.getByRole('button', { name: 'Select Next programme', exact: true });
    await expect(again).toHaveCount(0);
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      library.getByRole('button', { name: 'Import a .vcg', exact: true }).click(),
    ]);
    await fileChooser.setFiles({
      name: exported.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: exportedBytes,
    });
    await expect(again).toBeVisible();
    expect(runtime.templateGet(nextTemplate.templateId, 1)?.controlLiveLayout).toEqual(nextLayout);
    await again.click();
    await library.getByRole('button', { name: 'Edit layout', exact: true }).click();
    await expect(noBackground(lockedEdit)).toHaveAttribute('aria-pressed', 'true');
    await expect(lockedEdit.locator('[data-layout-preview]')).toHaveAttribute(
      'data-transparent-background',
      '',
    );
    await expect(backgroundImageButton(lockedEdit).locator('img')).toHaveCount(0);
    await lockedEdit.getByRole('button', { name: 'Cancel', exact: true }).click();
    await library.getByRole('button', { name: 'Close', exact: true }).first().click();

    const loaded = await page.evaluate(
      (templateId) =>
        window.cg.fixedLayers.load({
          channel: 1,
          layer: 58,
          itemId: 'transparent-panel',
          templateId,
          fields: {},
        }),
      nextTemplate.templateId,
    );
    expect(loaded).toMatchObject({ accepted: true });
    await layers
      .locator('[data-layer="58"]')
      .getByRole('button', { name: /^ON PVW/ })
      .click();
    await pvw.getByRole('button', { name: 'PLAY all 2 rehearsing', exact: true }).click();
    const transparentFrame = pvw.frameLocator('iframe[data-rehearsal-frame="transparent-panel"]');
    const transparentPicture = transparentFrame
      .locator('[data-cg-pvw-picture-part][data-source-id="feed-1"]')
      .first();
    await expect(transparentPicture).toBeVisible();
    await expect.poll(() => aspect(transparentPicture)).toBeCloseTo(0.75, 2);
    const portraitFrameId = nextLayout.frames[2]!.id;
    const portraitBorder = transparentFrame
      .locator(`[data-cg-element-id="${portraitFrameId}-border"]`)
      .filter({ visible: true });
    await expect(portraitBorder).toBeVisible();
    const borderEdges = await portraitBorder.evaluate((node) => {
      if (!(node instanceof HTMLElement)) throw new Error('Expected an HTML plate border');
      const { width, height } = node.getBoundingClientRect();
      const x = width / node.offsetWidth;
      const y = height / node.offsetHeight;
      const style = getComputedStyle(node);
      return {
        left: Number.parseFloat(style.borderLeftWidth) * x,
        right: Number.parseFloat(style.borderRightWidth) * x,
        top: Number.parseFloat(style.borderTopWidth) * y,
      };
    });
    expect(borderEdges.top).toBeGreaterThan(0);
    expect(Math.abs(borderEdges.left - borderEdges.top)).toBeLessThan(0.5);
    expect(Math.abs(borderEdges.right - borderEdges.top)).toBeLessThan(0.5);
    await expect(portraitBorder).toHaveCSS('border-top-left-radius', '0px');
    const portraitClip = transparentFrame
      .locator(`[data-cg-element-id="${portraitFrameId}-plate"]`)
      .filter({ visible: true });
    await expect(portraitClip).toHaveCSS('overflow', 'hidden');
    await expect(portraitClip).toHaveCSS('border-top-left-radius', '0px');
    await expect(transparentFrame.locator('body')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(
      transparentFrame.locator(
        '[data-cg-element-id="background-color"], [data-cg-element-id="background-media"]',
      ),
    ).toHaveCount(0);
  } finally {
    await bridge?.close();
    await mock?.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
