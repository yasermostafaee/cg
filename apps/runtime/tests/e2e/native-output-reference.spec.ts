import { cgCss, cgJsIife, ExporterSingleFile } from '@cg/single-file-export';
import { pack, unpack } from '@cg/vcg-format';
import { buildPositionedVcg, expect, test } from './fixtures/runtime.js';

test('PVW outlines and dragging retain the native project reference for a cropped non-live template', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 1000 });
  await app.showMonitors();
  const templateId = 'native-hd-cropped';
  const { scene } = await unpack(await buildPositionedVcg(templateId));
  scene.outputReference = { width: 1280, height: 720 };
  scene.resolution = { width: 1280, height: 100 };
  scene.defaultPosition = { anchor: 'bottom-center', offset: { x: 0, y: 0 } };
  for (const layer of scene.layers)
    for (const element of layer.children) element.transform.position = { x: 10, y: 10 };
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  // The offline bridge has no retained page. Supply the actual exported page at its typed seam.
  await page.evaluate(
    ({ html }) => {
      window.cg.templates.page = () => Promise.resolve({ kind: 'page', html, source: 'bridge' });
    },
    { html },
  );
  const bytes = await pack({
    scene,
    manifestExtras: {
      id: templateId,
      name: scene.name,
      authoring: {
        designerVersion: '1.2.12',
        createdAt: scene.metadata.createdAt,
        exportedAt: scene.metadata.updatedAt,
      },
      compatibility: { minRuntimeVersion: '1.2.12', minCasparCGVersion: '2.3.0' },
      fontDeps: [],
      assetIndex: [],
    },
    indexHtml: '<!doctype html><html><body></body></html>',
    cgJs: '',
    cgCss: '',
  });
  const layer = await app.importVcg('native-hd.vcg', bytes);
  await app.selectLayerRow(layer);
  const info = await page.evaluate(
    async (id) => window.cg.templates.get({ templateId: id, channel: 1 }),
    templateId,
  );
  expect(info?.liveSources).toMatchObject({
    outputReference: { width: 1280, height: 720 },
    sources: [],
  });
  await page
    .locator(`[data-layer="${layer}"]`)
    .getByRole('button', { name: 'ON PVW', exact: true })
    .click();
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const frame = pvw.locator('iframe[data-rehearsal-frame]');
  await expect(frame).toHaveCount(1);
  const itemId = await frame.getAttribute('data-rehearsal-frame');
  const outline = pvw.locator(`[data-pvw-template-outline="${itemId}"]`);
  const raster = pvw.locator('[data-rehearsal-checker]');
  await expect(outline).toBeVisible();
  const frameStage = frame.contentFrame().locator('.cg-stage');
  const referenceGeometry = async () => {
    const [o, r] = await Promise.all([outline.boundingBox(), raster.boundingBox()]);
    if (o === null || r === null) throw new Error('PVW native reference is not laid out');
    return { o, r };
  };
  const before = await referenceGeometry();
  const fit = before.r.width / 1920;
  expect(before.o.width).toBeCloseTo(before.r.width, 0);
  expect(before.o.height).toBeCloseTo(150 * fit, 0);
  expect(before.o.x - before.r.x).toBeCloseTo(0, 0);
  expect(before.o.y - before.r.y).toBeCloseTo(930 * fit, 0);
  const nativeStage = await frameStage.evaluate((el) => ({
    width: (el as HTMLElement).style.width,
    height: (el as HTMLElement).style.height,
  }));
  expect(nativeStage).toEqual({ width: '1280px', height: '100px' });
  const positionBefore = await page.evaluate(
    async (id) =>
      (await window.cg.stack.snapshot()).find((item) => item.templateId === id)?.position,
    templateId,
  );
  await pvw.getByRole('button', { name: 'Move template in Preview', exact: true }).click();
  const grip = pvw.locator(`[data-pvw-template-grip="${itemId}"]`);
  await grip.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(app.inspector.getByLabel('Position offset X')).toHaveValue('-1');
  await expect(app.inspector.getByLabel('Position offset Y')).toHaveValue('0');
  const keyed = await referenceGeometry();
  expect(keyed.o.x - before.o.x).toBeCloseTo(-1.5 * fit, 1);
  const box = await grip.boundingBox();
  if (box === null) throw new Error('Native graphic has no move handle');
  const dx = Math.round(60 * 1.5 * fit);
  const dy = -Math.round(20 * 1.5 * fit);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 4 });
  await page.mouse.up();
  const expectedX = -1 + Math.round(dx / (1.5 * fit));
  const expectedY = Math.round(dy / (1.5 * fit));
  await expect(app.inspector.getByLabel('Position offset X')).toHaveValue(String(expectedX));
  await expect(app.inspector.getByLabel('Position offset Y')).toHaveValue(String(expectedY));
  const moved = await referenceGeometry();
  expect(moved.o.x - before.o.x).toBeCloseTo(expectedX * 1.5 * fit, 0);
  expect(moved.o.y - before.o.y).toBeCloseTo(expectedY * 1.5 * fit, 0);
  // Both gestures stage PVW drafts; neither changes programme's applied position.
  expect(
    await page.evaluate(
      async (id) =>
        (await window.cg.stack.snapshot()).find((item) => item.templateId === id)?.position,
      templateId,
    ),
  ).toEqual(positionBefore);
  await pvw.screenshot({ path: test.info().outputPath('native-hd-cropped-pvw.png') });
});
