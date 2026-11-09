import type { Locator } from '@playwright/test';
import { expect, test, buildValidVcg } from './fixtures/runtime.js';

const MAIN_CHROME = '[data-app-header], footer[aria-label="Status bar"]';

async function expectHeaderActionsClear(panel: Locator): Promise<void> {
  const header = panel.locator('.cg-panel-header--monitor');
  const geometry = await header.evaluate((element) => {
    const frame = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')];
    const inside = (outer: DOMRect, inner: DOMRect): boolean =>
      inner.left >= outer.left - 0.5 &&
      inner.top >= outer.top - 0.5 &&
      inner.right <= outer.right + 0.5 &&
      inner.bottom <= outer.bottom + 0.5;
    const intersect = (a: DOMRect, b: DOMRect): boolean =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const rects = buttons.map((button) => button.getBoundingClientRect());
    const actions = {
      insideHeader: rects.every((rect) => inside(frame, rect)),
      distinctHitboxes: rects.every((rect, i) =>
        rects.slice(i + 1).every((other) => !intersect(rect, other)),
      ),
    };
    const panButton = element.querySelector('[data-monitor-pan]');
    if (panButton === null) return { ...actions, iconAndTextFit: true };
    const icon = panButton.querySelector('svg')?.getBoundingClientRect();
    const label = panButton.lastChild;
    if (icon === undefined || label === null) {
      throw new Error('Pan button is missing its icon or label');
    }
    const range = document.createRange();
    range.selectNodeContents(label);
    const text = range.getBoundingClientRect();
    const button = panButton.getBoundingClientRect();
    return {
      ...actions,
      iconAndTextFit: inside(button, icon) && inside(button, text) && !intersect(icon, text),
    };
  });
  expect(geometry).toEqual({ insideHeader: true, distinctHitboxes: true, iconAndTextFit: true });
}

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
    const panel = page.getByRole('region', { name, exact: true });
    const mainChrome = page.locator(MAIN_CHROME);
    const normal = await monitor.boundingBox();
    expect(normal).not.toBeNull();
    await expect(mainChrome).toHaveCount(2);
    await page.getByRole('button', { name: `Show ${name} fullscreen` }).click();
    await expect(mainChrome).toHaveCount(0);
    await expect(panel.locator('[data-monitor-pan]')).toHaveCount(name === 'PREVIEW (PVW)' ? 1 : 0);
    if (name === 'PROGRAM (PGM)') {
      await panel.getByRole('button', { name: 'A+B', exact: true }).click();
    }
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
      await expectHeaderActionsClear(panel);
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

    await page.setViewportSize({ width: 620, height: 922 });
    await expectHeaderActionsClear(panel);
    await page.setViewportSize({ width: 840, height: 922 });

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

test('R-111: focused browser reload shows companion choices until a layer is selected', async ({
  app,
}) => {
  const { page } = app;
  const name = 'PROGRAM (PGM)';
  // Test mode rebuilds its stack on reload. Use a seeded row on both boots.
  const logoLayer = 97;
  await page.setViewportSize({ width: 1440, height: 922 });
  await app.selectLayerRow(logoLayer);
  await app.showMonitors();
  await page.getByRole('button', { name: `Show ${name} fullscreen` }).click();
  const layerOnly = page.getByRole('button', { name: 'Monitor and selected layer', exact: true });
  await layerOnly.click();
  await expect(page.locator('[data-monitor-layer-companion]')).toBeVisible();

  await page.setViewportSize({ width: 840, height: 922 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Monitor only', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const layerAndInspector = page.getByRole('button', {
    name: 'Monitor, selected layer and Inspector',
    exact: true,
  });
  for (const mode of [layerOnly, layerAndInspector]) {
    await expect(mode).toBeVisible();
    await expect(mode).toBeDisabled();
    await expect(mode).toHaveAttribute('title', 'Restore the workspace and select a layer');
  }
  await expect(
    page.locator('[data-monitor-layer-companion], [data-monitor-inspector-companion]'),
  ).toHaveCount(0);
  await expectHeaderActionsClear(page.getByRole('region', { name, exact: true }));

  await page.getByRole('button', { name: `Exit fullscreen ${name}` }).click();
  await page.setViewportSize({ width: 1440, height: 922 });
  await app.selectLayerRow(logoLayer);
  await app.showMonitors();
  await page.getByRole('button', { name: `Show ${name} fullscreen` }).click();
  await expect(layerOnly).toBeEnabled();
  await expect(layerAndInspector).toBeEnabled();
});

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
