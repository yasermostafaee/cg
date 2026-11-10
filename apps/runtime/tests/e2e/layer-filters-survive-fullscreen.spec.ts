import { test, expect, buildValidVcg } from './fixtures/runtime.js';

test('B-427: Layers search and Hide empty survive fullscreen and restore', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  await app.showMonitors();
  const templateId = 'tpl-filter-fullscreen';
  await app.importVcg('weather-filter.vcg', await buildValidVcg(templateId));
  await app.selectStackRow(templateId);

  const search = app.layers.getByRole('searchbox', { name: 'Find row or template' });
  const hideEmpty = app.layers.getByRole('checkbox', { name: 'Hide empty' });
  const query = 'weather filter';
  await search.fill(query);
  await hideEmpty.check();
  const rowCount = app.layers.locator('[data-layers-tally-rows]');
  const count = await rowCount.innerText();
  await expect(app.layers.getByText(query, { exact: true })).toBeVisible();

  for (const panel of ['PROGRAM (PGM)', 'PREVIEW (PVW)', 'INSPECTOR']) {
    await test.step(`Restore the workspace after maximizing ${panel}`, async () => {
      await page.getByRole('button', { name: `Show ${panel} fullscreen` }).click();
      await expect(search).toBeHidden();
      await page.getByRole('button', { name: `Exit fullscreen ${panel}` }).click();
      await expect(search).toHaveValue(query);
      await expect(hideEmpty).toBeChecked();
      await expect(rowCount).toHaveText(count);
    });
  }
});
