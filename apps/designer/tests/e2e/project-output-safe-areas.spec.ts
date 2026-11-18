import type { Download, Locator, Page } from '@playwright/test';
import { outputTranslate, type Position, type Raster } from '@cg/shared-schema';
import { readProjectDocument, unpack } from '@cg/vcg-format';
import { expect, test, type DesignerApp } from './fixtures/designer.js';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function bytesOf(download: Download): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  return new Uint8Array(Buffer.concat(chunks));
}

async function setNumber(field: Locator, value: number): Promise<void> {
  await field.fill(String(value));
  await field.press('Enter');
}

async function resizeComposition(app: DesignerApp, width: number, height: number): Promise<void> {
  await app.deselect();
  await setNumber(app.inspector.getByRole('spinbutton', { name: 'Composition width' }), width);
  await setNumber(app.inspector.getByRole('spinbutton', { name: 'Composition height' }), height);
  const stage = app.canvasFrame.locator('.cg-stage');
  await expect.poll(() => stage.evaluate((node: HTMLElement) => node.offsetWidth)).toBe(width);
  await expect.poll(() => stage.evaluate((node: HTMLElement) => node.offsetHeight)).toBe(height);
}

async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Configure safe guides', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Safe guides', exact: true });
  await expect(settings).toBeVisible();
  return settings;
}

async function closeSettings(settings: Locator): Promise<void> {
  await settings.getByRole('button', { name: 'Close safe guide settings', exact: true }).click();
}

async function enableSafeAreas(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Safe areas', exact: true });
  if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

/** SVG geometry, excluding the extra painted extent of a non-scaling stroke. */
async function pageRect(rect: Locator): Promise<Rect> {
  return rect.evaluate((node) => {
    if (!(node instanceof SVGGraphicsElement)) throw new Error('Missing SVG geometry');
    const matrix = node.getScreenCTM();
    if (matrix === null) throw new Error('SVG has no screen transform');
    const bounds = node.getBBox();
    const start = new DOMPoint(bounds.x, bounds.y).matrixTransform(matrix);
    const end = new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height).matrixTransform(
      matrix,
    );
    return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
  });
}

function outputRect(resolution: Raster, raster: Raster, position: Position): Rect {
  return { ...outputTranslate({ resolution }, position, raster), ...resolution };
}

async function expectProjectFrame(page: Page, raster: Raster): Promise<void> {
  const guides = page.locator('[data-safe-area-guides]');
  await expect(guides).toHaveAttribute('viewBox', `0 0 ${raster.width} ${raster.height}`);
  const frame = guides.locator('[data-project-output-frame]');
  for (const [key, expected] of Object.entries({ x: 0, y: 0, ...raster }))
    await expect.poll(async () => Number(await frame.getAttribute(key))).toBe(expected);
}

async function expectCompositionFrame(
  app: DesignerApp,
  resolution: Raster,
  raster: Raster,
  position: Position,
): Promise<void> {
  const frame = app.page.locator('[data-composition-output-frame]');
  for (const [key, expected] of Object.entries(outputRect(resolution, raster, position)))
    await expect.poll(async () => Number(await frame.getAttribute(key))).toBeCloseTo(expected, 2);
  // Both views must describe the same composition after real iframe/canvas transforms.
  await expect
    .poll(async () => {
      const [outline, composition] = await Promise.all([
        pageRect(frame),
        app.canvasFrame.locator('.cg-stage').boundingBox(),
      ]);
      if (composition === null) return Infinity;
      return Math.max(
        ...(['x', 'y', 'width', 'height'] as const).map((key) =>
          Math.abs(outline[key] - composition[key]),
        ),
      );
    })
    .toBeLessThan(0.75);
}

async function expectProjectFits(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const picture = await pageRect(page.locator('[data-project-output-frame]'));
      const viewport = await page.getByTestId('canvas-viewport').boundingBox();
      if (viewport === null) return Infinity;
      return Math.max(
        viewport.x - picture.x,
        viewport.y - picture.y,
        picture.x + picture.width - viewport.x - viewport.width,
        picture.y + picture.height - viewport.y - viewport.height,
      );
    })
    .toBeLessThanOrEqual(1);
}

async function exportTemplate(page: Page): Promise<Awaited<ReturnType<typeof unpack>>> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .vcg' }).click();
  return unpack(await bytesOf(await download));
}

test('a lower-third keeps its own raster inside a separately sized and saved project output frame', async ({
  app,
  page,
}, testInfo) => {
  // Capture the real .cgproj download, as the existing project-package regression does.
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
    } catch {
      /* ignore */
    }
  });
  await app.goto();
  await app.newProject('Project frame lower-third');
  await app.addRectangle({ x: 20, y: 20 });
  await resizeComposition(app, 1920, 190);
  let settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Bottom center', exact: true }).click();
  await expect(settings.getByRole('spinbutton', { name: 'Composition output X' })).toHaveValue('0');
  await expect(settings.getByRole('spinbutton', { name: 'Composition output Y' })).toHaveValue(
    '890',
  );
  await closeSettings(settings);
  await enableSafeAreas(page);
  await expectProjectFrame(page, { width: 1920, height: 1080 });
  await expectCompositionFrame(
    app,
    { width: 1920, height: 190 },
    { width: 1920, height: 1080 },
    { anchor: 'bottom-center', offset: { x: 0, y: 0 } },
  );
  await expectProjectFits(page);

  const saving = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SAVE', exact: true }).click();
  const saved = await bytesOf(await saving);
  const project = await readProjectDocument(saved);
  expect(project.scene).toMatchObject({ outputRaster: { width: 1920, height: 1080 } });
  expect(project.scene.compositions).toHaveLength(1);
  expect(project.scene.compositions?.[0]).toMatchObject({
    resolution: { width: 1920, height: 190 },
    defaultPosition: { anchor: 'bottom-center', offset: { x: 0, y: 0 } },
  });

  await app.goto();
  await app.newProject('Empty reopening host');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /^Open/ }).click();
  await (
    await chooser
  ).setFiles({
    name: 'Project frame lower-third.cgproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(saved),
  });
  await expect(page).toHaveTitle(/Project frame lower-third/);
  await enableSafeAreas(page);
  await expectProjectFrame(page, { width: 1920, height: 1080 });
  await expectCompositionFrame(
    app,
    { width: 1920, height: 190 },
    { width: 1920, height: 1080 },
    { anchor: 'bottom-center', offset: { x: 0, y: 0 } },
  );
  const before = await exportTemplate(page);
  expect(before.manifest.resolution).toEqual({ width: 1920, height: 190 });
  expect(before.scene).toMatchObject({
    resolution: { width: 1920, height: 190 },
    defaultPosition: { anchor: 'bottom-center', offset: { x: 0, y: 0 } },
  });
  const rawTemplate = before.files.get('template.json');
  expect(rawTemplate).toBeDefined();
  expect(JSON.parse(new TextDecoder().decode(rawTemplate))).not.toHaveProperty('outputRaster');

  settings = await openSettings(page);
  await settings.getByRole('radio', { name: '4:3', exact: true }).click();
  await settings.getByRole('checkbox', { name: 'Show this frame', exact: true }).check();
  await closeSettings(settings);
  await expect(page.locator('[data-guide-reference="4:3"]')).toBeVisible();
  expect((await exportTemplate(page)).scene).toEqual(before.scene);
  await expect(app.canvasFrame.locator('[data-safe-area-guides]')).toHaveCount(0);
  for (const [name, bytes] of before.files) {
    if (!name.endsWith('.html')) continue;
    const html = new TextDecoder().decode(bytes);
    expect(html).not.toContain('data-safe-area-guides');
    expect(html).not.toContain('data-project-output-frame');
  }
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('project-output-lower-third.png') });
});

test('a tiny top-right composition follows output pixels while project Fit and custom guides stay independent', async ({
  app,
  page,
}, testInfo) => {
  await app.newProject('Project frame logo');
  await resizeComposition(app, 100, 100);
  let settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Top right', exact: true }).click();
  await expect(settings.getByRole('spinbutton', { name: 'Composition output X' })).toHaveValue(
    '1820',
  );
  await expect(settings.getByRole('spinbutton', { name: 'Composition output Y' })).toHaveValue('0');
  await setNumber(settings.getByRole('spinbutton', { name: 'Composition output X' }), 1795);
  await setNumber(settings.getByRole('spinbutton', { name: 'Composition output Y' }), 35);
  await settings.getByRole('radio', { name: '4:3', exact: true }).click();
  await settings.getByRole('checkbox', { name: 'Show this frame', exact: true }).check();
  await closeSettings(settings);
  await enableSafeAreas(page);
  const position: Position = { anchor: 'top-right', offset: { x: -25, y: 35 } };
  await expectProjectFrame(page, { width: 1920, height: 1080 });
  await expectCompositionFrame(
    app,
    { width: 100, height: 100 },
    { width: 1920, height: 1080 },
    position,
  );
  await expectProjectFits(page);
  await expect(page.locator('[data-guide-reference="4:3"]')).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expectCompositionFrame(
    app,
    { width: 100, height: 100 },
    { width: 1920, height: 1080 },
    position,
  );
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect
    .poll(async () => {
      const projectAtCompFit = await pageRect(page.locator('[data-project-output-frame]'));
      const viewport = await page.getByTestId('canvas-viewport').boundingBox();
      return viewport === null ? -Infinity : projectAtCompFit.width - viewport.width;
    })
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Fit project frame', exact: true }).click();
  await expectProjectFits(page);
  await page.screenshot({ path: testInfo.outputPath('project-output-top-right-logo.png') });

  // Placement is authored project state: finish a normal Save before leaving it.
  await page.getByRole('button', { name: 'SAVE', exact: true }).click();
  await expect(page).toHaveTitle('Project frame logo');
  await app.goto();
  await app.newProject('Another project keeps only the guide preferences');
  await expect(page.getByRole('button', { name: 'Safe areas', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  settings = await openSettings(page);
  await expect(settings.getByLabel('Project output resolution')).toHaveText('1920×1080');
  await expect(settings.getByRole('spinbutton', { name: /^Project output/ })).toHaveCount(0);
  await expect(settings.getByRole('button', { name: 'Center', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(settings.getByRole('radio', { name: '4:3', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await closeSettings(settings);
  await enableSafeAreas(page);
  await expect(page.locator('[data-guide-reference="4:3"]')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});

test('an HD project uses 1280×720 independently of its composition and keeps custom guide ratios', async ({
  app,
  page,
}, testInfo) => {
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('HD project guides');
  await dialog.getByRole('combobox', { name: 'Resolution preset' }).selectOption('hd');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await app.expectStudio();
  await enableSafeAreas(page);
  await expectProjectFrame(page, { width: 1280, height: 720 });

  await expectCompositionFrame(
    app,
    { width: 1280, height: 720 },
    { width: 1280, height: 720 },
    { anchor: 'center', offset: { x: 0, y: 0 } },
  );
  const graphics = page.locator('[data-safe-area="graphics"]');
  for (const [key, value] of Object.entries({ x: 64, y: 36, width: 1152, height: 648 })) {
    await expect(graphics).toHaveAttribute(key, String(value));
  }

  await resizeComposition(app, 100, 100);
  await app.addRectangle({ x: 15, y: 15 });
  await expectProjectFrame(page, { width: 1280, height: 720 });
  await expect(page.getByTitle('Project output resolution')).toHaveText('Project 1280×720');
  await expect(page.getByTitle('Composition resolution')).toHaveText('Comp 100×100');
  const settings = await openSettings(page);
  await expect(settings.getByLabel('Project output resolution')).toHaveText('1280×720');
  await expect(settings.getByRole('spinbutton', { name: /^Project output/ })).toHaveCount(0);
  await settings.getByRole('radio', { name: '3:4', exact: true }).click();
  await settings.getByRole('checkbox', { name: 'Show this frame', exact: true }).check();
  const guide = page.locator('[data-guide-frame="custom"][data-guide-percent="100"]');
  await expect(guide).toHaveAttribute('x', '370');
  await expect(guide).toHaveAttribute('width', '540');

  await setNumber(settings.getByRole('spinbutton', { name: 'Custom guide ratio width' }), 9);
  await setNumber(settings.getByRole('spinbutton', { name: 'Custom guide ratio height' }), 16);
  await settings.getByRole('radio', { name: '4:3', exact: true }).click();
  await expect(guide).toBeVisible();
  await settings.getByRole('radio', { name: '9:16', exact: true }).click();
  await expect(guide).toHaveAttribute('x', '437.5');
  await expect(guide).toHaveAttribute('width', '405');
  await expect(guide).toHaveAttribute('height', '720');
  const center = settings.getByRole('button', { name: 'Center', exact: true });
  const x = settings.getByRole('spinbutton', { name: 'Composition output X' });
  const y = settings.getByRole('spinbutton', { name: 'Composition output Y' });
  await center.click();
  await expect(x).toHaveValue('590');
  await expect(y).toHaveValue('310');
  const xBox = await x.boundingBox();
  if (xBox === null) throw new Error('Output X field is missing');
  await page.mouse.move(xBox.x + xBox.width / 2, xBox.y + xBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(xBox.x + xBox.width / 2 + 20, xBox.y + xBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(x).toHaveValue('610');
  await expect(center).toHaveAttribute('aria-pressed', 'false');
  await setNumber(y, 350);
  await center.click();
  await expect(x).toHaveValue('590');
  await expect(y).toHaveValue('310');
  await expect(center).toHaveAttribute('aria-pressed', 'true');

  const topRight = settings.getByRole('button', { name: 'Top right', exact: true });
  await topRight.click();
  await expect(x).toHaveValue('1180');
  await expect(y).toHaveValue('0');
  await setNumber(x, 1170);
  await expect(topRight).toHaveAttribute('aria-pressed', 'false');
  await setNumber(settings.getByRole('spinbutton', { name: 'Composition output Y' }), 42);
  await closeSettings(settings);
  const placement = page.locator('[data-composition-output-frame]');
  await expect.poll(async () => Number(await placement.getAttribute('x'))).toBeCloseTo(1170);
  await expect.poll(async () => Number(await placement.getAttribute('y'))).toBeCloseTo(42);
  await page.screenshot({ path: testInfo.outputPath('project-hd-custom-guides.png') });

  await app.openPreviewModal();
  const previewOutput = app.previewDialog.locator('[data-preview-output-frame]');
  await expect(previewOutput).toHaveCSS('width', '1280px');
  await expect(previewOutput).toHaveCSS('height', '720px');
  await expect(previewOutput).not.toHaveCSS('background-image', 'none');
  await app.play();
  await page.screenshot({ path: testInfo.outputPath('project-hd-placement-preview.png') });
  await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
  const exported = await exportTemplate(page);
  expect(exported.manifest.resolution).toEqual({ width: 100, height: 100 });
  expect(exported.scene).toMatchObject({ outputReference: { width: 1280, height: 720 } });
  expect(exported.scene).not.toHaveProperty('outputRaster');

  await page.getByRole('button', { name: 'SAVE', exact: true }).click();
  await expect(page).toHaveTitle('HD project guides');
  await app.goto();
  await app.newProject('Full HD project with the same guide profile');
  await enableSafeAreas(page);
  await expectProjectFrame(page, { width: 1920, height: 1080 });
  await expect(guide).toHaveAttribute('x', '656.25');
  await expect(guide).toHaveAttribute('width', '607.5');
  await expect(guide).toHaveAttribute('height', '1080');
});
