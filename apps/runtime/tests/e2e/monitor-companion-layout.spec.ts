import { expect, test, buildValidVcg } from './fixtures/runtime.js';

const MAIN_CHROME = '[data-app-header], footer[aria-label="Status bar"]';

for (const name of ['PROGRAM (PGM)', 'PREVIEW (PVW)']) {
  test(`R-111: maximized ${name} keeps the row below and Inspector to the right`, async ({
    app,
  }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1900, height: 922 });
    await app.showMonitors();
    const templateId = 'monitor-companion-layout';
    await app.importVcg('monitor-companion-layout.vcg', await buildValidVcg(templateId));
    await app.selectStackRow(templateId);

    const monitor = page.locator('[data-monitor-strip]');
    const mainChrome = page.locator(MAIN_CHROME);
    const normal = await monitor.boundingBox();
    expect(normal).not.toBeNull();
    await expect(mainChrome).toHaveCount(2);
    await page.getByRole('button', { name: `Show ${name} fullscreen` }).click();
    await expect(mainChrome).toHaveCount(0);
    const showBoth = page.getByRole('button', { name: 'Monitor, selected layer and Inspector' });
    await showBoth.click();
    const layer = page.locator('[data-monitor-layer-companion]');
    const inspector = page.locator('[data-monitor-inspector-companion]');
    await expect(layer).toBeVisible();
    await expect(inspector).toBeVisible();
    await expect(layer.locator('header, [data-verb-head]')).toHaveCount(0);
    const rowControl = layer.locator('[data-layer]');
    await expect(rowControl).toHaveCount(1);
    const field = inspector.getByRole('textbox', { name: 'anchor', exact: true });
    await expect(field).toBeVisible();

    for (const width of [1900, 1440, 840]) {
      await page.setViewportSize({ width, height: 922 });
      const [picture, row, rowBox, editor, inspectorPanel, input] = await Promise.all([
        monitor.boundingBox(),
        layer.boundingBox(),
        rowControl.boundingBox(),
        inspector.boundingBox(),
        inspector.getByRole('complementary', { name: 'Inspector' }).boundingBox(),
        field.boundingBox(),
      ]);
      expect(picture!.height).toBeGreaterThan(normal!.height);
      expect(row!.y).toBeGreaterThanOrEqual(picture!.y + picture!.height - 1);
      expect(row!.height).toBeCloseTo(rowBox!.height, 0);
      expect(row!.width).toBeCloseTo(picture!.width, 0);
      expect(editor!.x).toBeGreaterThanOrEqual(picture!.x + picture!.width - 1);
      expect(editor!.y).toBeCloseTo(picture!.y, 0);
      expect(inspectorPanel!.width).toBeGreaterThanOrEqual(260);
      expect(inspectorPanel!.height).toBeGreaterThan(picture!.height);
      expect(input!.width).toBeGreaterThan(200);
      await expect(field).toBeInViewport({ ratio: 1 });
    }

    await field.fill('Edited while monitoring');
    await expect(inspector.getByRole('button', { name: 'Discard staged edits' })).toBeEnabled();

    await page.getByRole('button', { name: 'Monitor only', exact: true }).click();
    await expect(layer).toHaveCount(0);
    await expect(inspector).toHaveCount(0);
    expect((await monitor.boundingBox())!.width).toBeGreaterThan(800);
    await expect(mainChrome).toHaveCount(0);
    await showBoth.click();
    await expect(layer).toBeVisible();
    await expect(inspector).toBeVisible();
    await expect(field).toHaveValue('Edited while monitoring');
    await page.getByRole('button', { name: `Exit fullscreen ${name}` }).click();
    await expect(mainChrome).toHaveCount(2);
  });
}

test('R-111: maximized Layers and Inspector also hide the main header and footer', async ({
  app,
}) => {
  const page = app.page;
  const templateId = 'fullscreen-shell';
  await app.importVcg('fullscreen-shell.vcg', await buildValidVcg(templateId));
  await app.selectStackRow(templateId);
  const mainChrome = page.locator(MAIN_CHROME);
  await expect(mainChrome).toHaveCount(2);

  for (const panel of ['LAYERS', 'INSPECTOR']) {
    await page.getByRole('button', { name: `Show ${panel} fullscreen` }).click();
    await expect(mainChrome).toHaveCount(0);
    await page.getByRole('button', { name: `Exit fullscreen ${panel}` }).click();
    await expect(mainChrome).toHaveCount(2);
  }
});
