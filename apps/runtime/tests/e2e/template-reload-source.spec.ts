import { expect, test } from './fixtures/runtime.js';

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
