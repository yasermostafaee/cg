import type { Download, Locator, Page } from '@playwright/test';
import {
  outputLetterbox,
  outputScale,
  outputTranslate,
  type Position,
  type Raster,
} from '@cg/shared-schema';
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
  const scale = outputScale(raster);
  const pad = outputLetterbox(raster);
  const origin = outputTranslate({ resolution }, position);
  return {
    x: pad.x + scale * origin.x,
    y: pad.y + scale * origin.y,
    width: scale * resolution.width,
    height: scale * resolution.height,
  };
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
  await setNumber(settings.getByRole('spinbutton', { name: 'Project output width' }), 1920);
  await setNumber(settings.getByRole('spinbutton', { name: 'Project output height' }), 1080);
  await settings
    .getByRole('combobox', { name: 'Composition output anchor' })
    .selectOption('bottom-center');
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

  // Non-16:9 output makes the letterbox term observable; scaling alone cannot pass.
  settings = await openSettings(page);
  await setNumber(settings.getByRole('spinbutton', { name: 'Project output width' }), 1440);
  await closeSettings(settings);
  await page.getByRole('button', { name: 'Fit project frame', exact: true }).click();
  await expectProjectFrame(page, { width: 1440, height: 1080 });
  await expectCompositionFrame(
    app,
    { width: 1920, height: 190 },
    { width: 1440, height: 1080 },
    { anchor: 'bottom-center', offset: { x: 0, y: 0 } },
  );
  await expectProjectFits(page);

  settings = await openSettings(page);
  await setNumber(settings.getByRole('spinbutton', { name: 'Project output width' }), 1280);
  await setNumber(settings.getByRole('spinbutton', { name: 'Project output height' }), 720);
  await closeSettings(settings);
  await page.getByRole('button', { name: 'Fit project frame', exact: true }).click();
  await expectProjectFrame(page, { width: 1280, height: 720 });
  await expectCompositionFrame(
    app,
    { width: 1920, height: 190 },
    { width: 1280, height: 720 },
    { anchor: 'bottom-center', offset: { x: 0, y: 0 } },
  );
  await expectProjectFits(page);

  const saving = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SAVE', exact: true }).click();
  const saved = await bytesOf(await saving);
  const project = await readProjectDocument(saved);
  expect(project.scene).toMatchObject({ outputRaster: { width: 1280, height: 720 } });
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
  await expectProjectFrame(page, { width: 1280, height: 720 });
  await expectCompositionFrame(
    app,
    { width: 1920, height: 190 },
    { width: 1280, height: 720 },
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
  await settings.getByRole('button', { name: 'Add horizontal guide', exact: true }).click();
  await setNumber(settings.getByRole('spinbutton', { name: 'Guide 1 position percent' }), 75);
  await closeSettings(settings);
  await expect(page.locator('[data-custom-guide][data-guide-axis="y"]')).toHaveAttribute(
    'y1',
    '540',
  );
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
  await settings
    .getByRole('combobox', { name: 'Composition output anchor' })
    .selectOption('top-right');
  await expect(settings.getByRole('spinbutton', { name: 'Composition output X' })).toHaveValue(
    '1820',
  );
  await expect(settings.getByRole('spinbutton', { name: 'Composition output Y' })).toHaveValue('0');
  await setNumber(settings.getByRole('spinbutton', { name: 'Composition output X' }), 1795);
  await setNumber(settings.getByRole('spinbutton', { name: 'Composition output Y' }), 35);
  await settings.getByRole('button', { name: 'Add horizontal guide', exact: true }).click();
  await setNumber(settings.getByRole('spinbutton', { name: 'Guide 1 position percent' }), 75);
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
  await expect(page.locator('[data-custom-guide][data-guide-axis="y"]')).toHaveAttribute(
    'y1',
    '810',
  );
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
  await expect(settings.getByRole('spinbutton', { name: 'Project output width' })).toHaveValue(
    '1920',
  );
  await expect(settings.getByRole('spinbutton', { name: 'Project output height' })).toHaveValue(
    '1080',
  );
  await expect(settings.getByRole('combobox', { name: 'Composition output anchor' })).toHaveValue(
    'center',
  );
  await expect(settings.getByRole('spinbutton', { name: 'Guide 1 position percent' })).toHaveValue(
    '75',
  );
  await closeSettings(settings);
  await enableSafeAreas(page);
  await expect(page.locator('[data-custom-guide][data-guide-axis="y"]')).toHaveAttribute(
    'y1',
    '810',
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});
