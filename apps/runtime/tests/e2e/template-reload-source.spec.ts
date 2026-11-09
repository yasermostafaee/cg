import { buildValidVcg, expect, test } from './fixtures/runtime.js';

test('R-108 — the header opens destination-free template management', async ({ app }) => {
  const page = app.page;
  const door = page.locator('[data-app-header]').getByRole('button', { name: 'Open templates' });
  await expect(door).toBeVisible();
  await expect(door).toHaveText('TEMPLATES');

  await door.click();
  const dialog = page.getByRole('dialog', { name: /Templates · CH 1/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Import, reload or remove templates on CH 1.');
  await expect(dialog.locator('[data-template-destination]')).toHaveCount(0);
  await expect(dialog.locator('[data-template-commit]')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Import a .vcg' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Reload all' })).toBeVisible();
  await expect(dialog.locator('[data-modal-role="cancel"]')).toHaveText('Close');

  await dialog
    .getByRole('button', { name: /^Select / })
    .first()
    .click();
  await expect(dialog.getByRole('complementary', { name: 'Template details' })).toBeVisible();
  await expect(dialog.locator('[data-template-verdict]')).toHaveCount(0);
});

test('R-108 — a shared-file replacement requires review and keeps the catalogue entry', async ({
  app,
}) => {
  const page = app.page;
  const original = 'ghab-title-before';
  const updated = 'ghab-title-after';
  // A real, structured-cloneable file handle with replaceable bytes. The browser profile
  // used by the test owns the OPFS file, so the operating-system chooser is unnecessary.
  const writeSource = async (id: string) => {
    const bytes = Array.from(await buildValidVcg(id));
    await page.evaluate(async (data) => {
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle('ghab-title.vcg', { create: true });
      const writer = await handle.createWritable();
      await writer.write(new Uint8Array(data));
      await writer.close();
      Object.defineProperty(window, 'showOpenFilePicker', {
        value: () => Promise.resolve([handle]),
        configurable: true,
      });
    }, bytes);
  };
  await writeSource(original);
  await page.getByRole('button', { name: 'Open templates' }).click();
  const dialog = page.getByRole('dialog', { name: /Templates · CH 1/ });
  await dialog.getByRole('button', { name: 'Import a .vcg' }).click();
  const reload = dialog.locator(`[data-template-reload="${original}"]`);
  await expect(reload).toBeEnabled();
  await writeSource(updated);

  await dialog.getByRole('button', { name: 'Reload all', exact: true }).click();
  await dialog.getByRole('button', { name: 'Reload and keep current data' }).click();
  await expect(dialog).toContainText('Reload it individually');

  await reload.click();
  await dialog.getByRole('button', { name: 'Reload and keep current data' }).click();
  await dialog.getByRole('button', { name: 'Cancel replacement' }).click();
  await expect(reload).toBeEnabled();

  await reload.click();
  await dialog.getByRole('button', { name: 'Reload and keep current data' }).click();
  await dialog.getByRole('button', { name: 'Replace from this file' }).click();
  await expect(reload).toBeEnabled();
  await expect(dialog.locator(`[data-template-reload="${updated}"]`)).toHaveCount(0);

  // The verified package identity survived persistence under the original catalogue id.
  await reload.click();
  await dialog.getByRole('button', { name: 'Reload and keep current data' }).click();
  await expect(reload).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Replace from this file' })).toHaveCount(0);
  const ids = await page.evaluate(async () =>
    (await window.cg.templates.list({ channel: 1 })).map((template) => template.templateId),
  );
  expect(ids).toContain(original);
  expect(ids).not.toContain(updated);
});
