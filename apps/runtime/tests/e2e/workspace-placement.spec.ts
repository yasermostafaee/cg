import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

async function startOf(panel: Locator, axis: 'x' | 'y'): Promise<number> {
  const bounds = await panel.boundingBox();
  if (bounds === null) throw new Error('Workspace panel is hidden');
  return bounds[axis];
}

test('places the console panels physically and restores saved UI profiles', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1440, height: 900 });
  await app.showMonitors();
  await expect(app.layerRow(80)).toHaveAttribute('data-template-id', 'irib-news');
  await app.selectLayerRow(80);
  await expect(app.inspector).toBeVisible();
  const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
  const pgm = page.getByRole('region', { name: 'PROGRAM (PGM)' });
  const layers = page.getByRole('region', { name: 'Layers' });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  const settings = async (): Promise<void> => {
    await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
    await dialog.getByRole('tab', { name: 'General', exact: true }).click();
  };
  const close = async (): Promise<void> => {
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  };
  const order = dialog.getByRole('combobox', { name: 'Monitor order', exact: true });
  const position = dialog.getByRole('combobox', { name: 'Layers position', exact: true });
  const side = dialog.getByRole('combobox', { name: 'Inspector position', exact: true });
  const inspectorDivider = page.getByRole('separator', { name: 'Resize the Inspector' });
  const monitorDivider = page.getByRole('separator', { name: 'Resize the monitor strip' });
  const originalInspector = Number(await inspectorDivider.getAttribute('aria-valuenow'));
  const originalMonitor = Number(await monitorDivider.getAttribute('aria-valuenow'));
  const dragInspector = async (dx: number): Promise<void> => {
    const box = await inspectorDivider.boundingBox();
    if (box === null) throw new Error('Inspector resize handle is hidden');
    const { x, y } = box;
    await page.mouse.move(x + box.width / 2, y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x + box.width / 2 + dx, y + box.height / 2, { steps: 4 });
    await page.mouse.up();
  };

  expect(await startOf(pvw, 'x')).toBeLessThan(await startOf(pgm, 'x'));
  expect(await startOf(pvw, 'y')).toBeLessThan(await startOf(layers, 'y'));
  expect(await startOf(layers, 'x')).toBeLessThan(await startOf(app.inspector, 'x'));
  await page.locator('html').evaluate((html) => {
    html.setAttribute('dir', 'rtl');
  });
  expect(await startOf(pvw, 'x')).toBeLessThan(await startOf(pgm, 'x'));
  expect(await startOf(layers, 'x')).toBeLessThan(await startOf(app.inspector, 'x'));
  await expect(pvw).toHaveCSS('direction', 'rtl');
  await expect(app.inspector).toHaveCSS('direction', 'rtl');
  await dragInspector(-24);
  await expect(inspectorDivider).toHaveAttribute('aria-valuenow', String(originalInspector + 24));
  await dragInspector(24);
  await expect(inspectorDivider).toHaveAttribute('aria-valuenow', String(originalInspector));
  await pvw.evaluate((element) => {
    element.setAttribute('data-workspace-test-retained', '');
  });

  await settings();
  await order.selectOption('pgm-first');
  await position.selectOption('above');
  await side.selectOption('left');
  await close();
  expect(await startOf(pgm, 'x')).toBeLessThan(await startOf(pvw, 'x'));
  expect(await startOf(layers, 'y')).toBeLessThan(await startOf(pvw, 'y'));
  expect(await startOf(app.inspector, 'x')).toBeLessThan(await startOf(layers, 'x'));
  await expect(pvw).toHaveAttribute('data-workspace-test-retained', '');
  await expect(app.layerRow(80)).toHaveAttribute('aria-pressed', 'true');

  await expect(layers).toHaveCSS('direction', 'rtl');
  await expect(pvw).toHaveCSS('direction', 'rtl');
  await expect(app.inspector).toHaveCSS('direction', 'rtl');
  await dragInspector(24);
  await monitorDivider.press('ArrowUp');
  await expect(inspectorDivider).toHaveAttribute('aria-valuenow', String(originalInspector + 24));
  await expect(monitorDivider).toHaveAttribute('aria-valuenow', String(originalMonitor + 16));

  await settings();
  await dialog.getByRole('textbox', { name: 'Profile name', exact: true }).fill('کارگردان');
  await dialog.getByRole('button', { name: 'Save profile', exact: true }).click();
  await order.selectOption('pvw-first');
  await position.selectOption('below');
  await side.selectOption('right');
  await dialog.getByRole('button', { name: 'Load profile', exact: true }).click();
  await expect(order).toHaveValue('pgm-first');
  await expect(position).toHaveValue('above');
  await expect(side).toHaveValue('left');
  await close();
  await expect(inspectorDivider).toHaveAttribute('aria-valuenow', String(originalInspector + 24));

  await page.reload();
  await app.showMonitors();
  await expect(app.layerRow(80)).toHaveAttribute('data-template-id', 'irib-news');
  await app.selectLayerRow(80);
  await expect(app.inspector).toBeVisible();
  await page.locator('html').evaluate((html) => {
    html.setAttribute('dir', 'rtl');
  });
  expect(await startOf(pgm, 'x')).toBeLessThan(await startOf(pvw, 'x'));
  expect(await startOf(layers, 'y')).toBeLessThan(await startOf(pvw, 'y'));
  expect(await startOf(app.inspector, 'x')).toBeLessThan(await startOf(layers, 'x'));
  await expect(monitorDivider).toHaveAttribute('aria-valuenow', String(originalMonitor + 16));

  await page.setViewportSize({ width: 800, height: 900 });
  const overlay = page.locator('.cg-inspector-overlay');
  await expect(overlay).toBeVisible();
  expect(await startOf(overlay, 'x')).toBe(0);
  await expect(overlay).toHaveCSS('direction', 'rtl');
  await overlay.getByRole('button', { name: 'Close INSPECTOR', exact: true }).click();
  await settings();
  const profiles = dialog.getByRole('combobox', { name: 'Saved UI profile', exact: true });
  await profiles.selectOption('کارگردان');
  await dialog.getByRole('button', { name: 'Delete profile', exact: true }).click();
  await expect(profiles.getByRole('option', { name: 'کارگردان' })).toHaveCount(0);
});

test('regular and live layers share filtering and keep their side-by-side layout in UI profiles', async ({
  app,
}) => {
  const { page } = app;
  const wide = { width: 2080, height: 900 };
  await page.setViewportSize(wide);
  const layers = page.getByRole('region', { name: 'Layers', exact: true });
  const toggle = layers.getByRole('button', { name: 'Layers side by side', exact: true });
  const regular = page.locator('[data-layer-group="regular"]');
  const live = page.locator('[data-layer-group="live"]');
  const layout = page.locator('[data-layer-groups-layout]');
  const search = layers.getByRole('searchbox', { name: 'Find row or template' });
  const selected = regular.locator('[data-layer="80"]');

  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(layout).toHaveAttribute('data-layer-groups-layout', 'side-by-side');
  expect(await startOf(regular, 'x')).toBeLessThan(await startOf(live, 'x'));
  expect(await startOf(regular, 'y')).toBe(await startOf(live, 'y'));
  await expect(
    live.locator('[data-layer="59"]').getByRole('button', { name: 'LOAD', exact: true }),
  ).toBeVisible();

  await search.fill('Live layer 59');
  await expect(regular.locator('[data-layer="82"]')).toHaveCount(0);
  await expect(live.locator('[data-layer="59"]')).toBeVisible();
  await expect(live.locator('[data-layer="58"]')).toHaveCount(0);
  await search.clear();
  await app.selectLayerRow(80);
  await toggle.click();
  await expect(layout).toHaveAttribute('data-layer-groups-layout', 'stacked');
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await app.inspector.getByRole('button', { name: 'Close INSPECTOR', exact: true }).click();

  await page.setViewportSize({ width: 700, height: 850 });
  await expect(layout).toHaveAttribute('data-layer-groups-layout', 'stacked');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize(wide);
  await expect(layout).toHaveAttribute('data-layer-groups-layout', 'side-by-side');

  await app.openStationSetupAt('General');
  const settings = page.getByRole('dialog', { name: 'Station setup' });
  await settings.getByRole('textbox', { name: 'Profile name', exact: true }).fill('Layer columns');
  await settings.getByRole('button', { name: 'Save profile', exact: true }).click();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await toggle.click();
  await app.openStationSetupAt('General');
  await settings
    .getByRole('combobox', { name: 'Saved UI profile', exact: true })
    .selectOption('Layer columns');
  await settings.getByRole('button', { name: 'Load profile', exact: true }).click();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(layout).toHaveAttribute('data-layer-groups-layout', 'side-by-side');
  await page.reload();
  await expect(layout).toHaveAttribute('data-layer-groups-layout', 'side-by-side');

  await app.openStationSetupAt('General');
  await settings.locator('#cg-interface-language').selectOption('fa');
  await page.getByRole('dialog').getByRole('button', { name: 'بستن', exact: true }).last().click();
  await expect(
    page.getByRole('button', { name: 'نمایش لایه‌ها کنار هم', exact: true }),
  ).toBeVisible();
  await expect(regular.getByText('لایه‌های معمولی', { exact: true })).toBeVisible();
  expect(await startOf(regular, 'x')).toBeGreaterThan(await startOf(live, 'x'));
});
