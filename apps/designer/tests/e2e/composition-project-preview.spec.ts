import type { Locator } from '@playwright/test';
import {
  outputLetterbox,
  outputScale,
  outputTranslate,
  type Position,
  type Raster,
  type Scene,
} from '@cg/shared-schema';
import { packProject } from '@cg/vcg-format';
import { expect, test, type DesignerApp } from './fixtures/designer.js';

async function setNumber(input: Locator, value: number): Promise<void> {
  await input.fill(String(value));
  await input.press('Enter');
}

async function resizeComposition(app: DesignerApp, resolution: Raster): Promise<void> {
  await app.deselect();
  await setNumber(
    app.inspector.getByRole('spinbutton', { name: 'Composition width' }),
    resolution.width,
  );
  await setNumber(
    app.inspector.getByRole('spinbutton', { name: 'Composition height' }),
    resolution.height,
  );
}

async function expectOutputPicture(
  app: DesignerApp,
  raster: Raster,
  resolution: Raster,
  position: Position,
): Promise<void> {
  const project = app.previewDialog.locator('[data-preview-output-frame]');
  await expect(project).toHaveCSS('width', `${String(raster.width)}px`);
  await expect(project).toHaveCSS('height', `${String(raster.height)}px`);
  await expect(project).toHaveCSS('background-color', 'rgb(61, 66, 83)');
  await expect(project).not.toHaveCSS('background-image', 'none');
  const composition = app.previewDialog.locator('iframe');
  await expect(composition).toHaveCSS('transform-origin', '0px 0px');
  const nativeStage = app.previewFrame.locator('.cg-stage');
  await expect
    .poll(() => nativeStage.evaluate((node: HTMLElement) => node.offsetWidth))
    .toBe(resolution.width);
  await expect
    .poll(() => nativeStage.evaluate((node: HTMLElement) => node.offsetHeight))
    .toBe(resolution.height);
  for (const tag of ['html', 'body']) {
    await expect(app.previewFrame.locator(tag)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(app.previewFrame.locator(tag)).toHaveCSS('background-image', 'none');
  }
  const scale = outputScale(raster);
  const pad = outputLetterbox(raster);
  const translation = outputTranslate({ resolution }, position);
  await expect
    .poll(async () => {
      const available = await app.previewDialog
        .locator('[data-preview-stage]')
        .evaluate((node) => ({
          x: node.getBoundingClientRect().x + node.clientLeft,
          y: node.getBoundingClientRect().y + node.clientTop,
          width: node.clientWidth,
          height: node.clientHeight,
        }));
      const [frame, iframe] = await Promise.all([project.boundingBox(), composition.boundingBox()]);
      if (frame === null || iframe === null) return Infinity;
      const fit = Math.min(available.width / raster.width, available.height / raster.height);
      const expected = {
        x: available.x + (available.width - raster.width * fit) / 2,
        y: available.y + (available.height - raster.height * fit) / 2,
        width: raster.width * fit,
        height: raster.height * fit,
      };
      const picture = {
        x: frame.x + (pad.x + translation.x * scale) * fit,
        y: frame.y + (pad.y + translation.y * scale) * fit,
        width: resolution.width * scale * fit,
        height: resolution.height * scale * fit,
      };
      return Math.max(
        ...(['x', 'y', 'width', 'height'] as const).flatMap((key) => [
          Math.abs(frame[key] - expected[key]),
          Math.abs(iframe[key] - picture[key]),
        ]),
      );
    })
    .toBeLessThan(0.75);
}

/** A computed transparent background can still paint white across an iframe colour-scheme boundary. */
async function expectTransparentPreviewPaint(app: DesignerApp): Promise<void> {
  const bounds = await app.previewDialog.locator('iframe').boundingBox();
  if (bounds === null) throw new Error('Missing composition picture');
  // Well outside the authored text at x=100, so this must show the project checker through the iframe.
  const point = { x: bounds.x + bounds.width * 0.85, y: bounds.y + bounds.height * 0.5 };
  const screenshot = await app.page.screenshot({ scale: 'css', animations: 'disabled' });
  const pixel = await app.page.evaluate(
    async ({ dataUrl, point }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Missing screenshot decoder');
      context.drawImage(image, 0, 0);
      return [...context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data];
    },
    { dataUrl: `data:image/png;base64,${screenshot.toString('base64')}`, point },
  );
  // The existing two checker tones, including their anti-aliased mixture.
  for (const [channel, min, max] of [
    [0, 61, 91],
    [1, 66, 96],
    [2, 83, 117],
  ]) {
    expect(pixel[channel]).toBeGreaterThanOrEqual(min);
    expect(pixel[channel]).toBeLessThanOrEqual(max);
  }
}

test('Composition Preview fits one project checkerboard and places the lower-third without stretching its stage', async ({
  app,
  page,
}, testInfo) => {
  await app.newProject('Lower-third output preview');
  await app.addTextElement({ x: 100, y: 40 });
  await app.setDataKey('headline');
  const resolution = { width: 1920, height: 190 };
  await resizeComposition(app, resolution);
  await page.getByRole('button', { name: 'Configure safe guides', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Safe guides', exact: true });
  // The preview-scoped export strips this metadata: the Host must read the root project.
  const raster = { width: 1280, height: 720 };
  await setNumber(settings.getByRole('spinbutton', { name: 'Project output width' }), raster.width);
  await setNumber(
    settings.getByRole('spinbutton', { name: 'Project output height' }),
    raster.height,
  );
  await settings
    .getByRole('combobox', { name: 'Composition output anchor' })
    .selectOption('bottom-center');
  await settings.getByRole('button', { name: 'Close safe guide settings', exact: true }).click();
  await app.openPreviewModal();
  await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/);
  const position: Position = { anchor: 'bottom-center', offset: { x: 0, y: 0 } };
  await expectOutputPicture(app, raster, resolution, position);
  await app.setPreviewField('headline', 'خبر فوری');
  await app.play();
  await expect(app.previewFrame.getByText('خبر فوری', { exact: true })).toBeVisible();
  await app.pause();
  await expect(
    app.previewDialog.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expectOutputPicture(app, raster, resolution, position);
  await expectTransparentPreviewPaint(app);
  await page.screenshot({ path: testInfo.outputPath('project-preview-lower-third.png') });
  await app.play();
  await app.stop();
  await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/);
  await expectOutputPicture(app, raster, resolution, position);
  await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Configure safe guides', exact: true }).click();
  const squarePixelRaster = { width: 1440, height: 1080 };
  await setNumber(
    settings.getByRole('spinbutton', { name: 'Project output width' }),
    squarePixelRaster.width,
  );
  await setNumber(
    settings.getByRole('spinbutton', { name: 'Project output height' }),
    squarePixelRaster.height,
  );
  await settings.getByRole('button', { name: 'Close safe guide settings', exact: true }).click();
  await app.openPreviewModal();
  await expectOutputPicture(app, squarePixelRaster, resolution, position);
});

test('a legacy cropped project defaults to full-HD Preview and keeps tiny centered or authored placements', async ({
  app,
  page,
}, testInfo) => {
  const resolution = { width: 100, height: 100 };
  const scene: Scene = {
    schemaVersion: 1,
    id: 'legacy-cropped-preview',
    name: 'Legacy cropped preview',
    templateType: 'custom',
    resolution: { width: 1920, height: 190 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [
      {
        id: 'tiny',
        name: 'Tiny',
        resolution,
        frameRange: { in: 0, out: 50 },
        editorBackdrop: 'transparent',
        layers: [],
      },
    ],
    metadata: { createdAt: '2026-11-18T00:00:00.000Z', updatedAt: '2026-11-18T00:00:00.000Z' },
  };
  const bytes = await packProject({
    scene,
    index: [],
    files: new Map(),
    savedAt: '2026-11-18T00:00:00.000Z',
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'Legacy cropped preview.cgproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(bytes),
  });
  await app.expectStudio();
  await app.addRectangle({ x: 20, y: 20 });
  await app.openPreviewModal();
  const raster = { width: 1920, height: 1080 };
  await expectOutputPicture(app, raster, resolution, { anchor: 'center', offset: { x: 0, y: 0 } });
  await app.play();
  await expect(app.previewFrame.locator('[data-cg-element-id]').first()).toBeVisible();
  await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Configure safe guides', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Safe guides', exact: true });
  await settings
    .getByRole('combobox', { name: 'Composition output anchor' })
    .selectOption('top-right');
  await setNumber(settings.getByRole('spinbutton', { name: 'Composition output X' }), 1795);
  await setNumber(settings.getByRole('spinbutton', { name: 'Composition output Y' }), 35);
  await settings.getByRole('button', { name: 'Close safe guide settings', exact: true }).click();
  await app.openPreviewModal();
  await expectOutputPicture(app, raster, resolution, {
    anchor: 'top-right',
    offset: { x: -25, y: 35 },
  });
  await page.screenshot({ path: testInfo.outputPath('project-preview-tiny-logo.png') });
});
