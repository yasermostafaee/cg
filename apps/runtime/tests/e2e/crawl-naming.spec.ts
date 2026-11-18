import { test, expect } from './fixtures/runtime.js';

test('legacy ticker templates show and search as Crawl in the template browser', async ({
  app,
}) => {
  const template = await app.page.evaluate(async () =>
    (await window.cg.templates.list()).find((entry) => entry.templateType === 'ticker'),
  );
  expect(template).toBeDefined();
  if (template === undefined) throw new Error('Missing legacy ticker starter');
  await app.openTemplatePicker();
  const search = app.templatePicker.getByRole('searchbox', { name: 'Search templates' });
  await search.fill('crawl');
  const row = app.templateRow(template.templateId);
  await expect(row).toBeVisible();
  await expect(row.locator('.cg-tpl-meta')).toContainText('Crawl');
  await row.getByRole('button', { name: /^Select / }).click();
  await expect(app.templatePicker.locator('[data-template-aside]')).toContainText('Crawl');
  await app.closeTemplatePicker();
  const retained = await app.page.evaluate(
    async (id) => (await window.cg.templates.list()).find((entry) => entry.templateId === id),
    template.templateId,
  );
  expect(retained?.templateType).toBe('ticker');
  expect(retained?.name).toBe(template.name);
});
