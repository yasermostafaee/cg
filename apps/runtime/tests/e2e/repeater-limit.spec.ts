import { buildRepeaterVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q4 — CG Control stops the operator at a repeater's max items: the page shows
 * only that many rows, and the Inspector's list used to add rows nobody would see.
 */
test('🔴 a repeater of at most 2 rows: Add item is withheld at 2 / 2, and comes back below it', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-repeater';
  await app.importVcg('rows.vcg', await buildRepeaterVcg(templateId, 2));
  await app.selectStackRow(templateId);

  await app.inspector.getByRole('button', { name: 'Edit rows…' }).click();
  const editor = app.page.getByRole('dialog', { name: 'Edit rows rows' });
  const count = editor.locator('[data-list-count="rows"]');
  const add = editor.getByRole('button', { name: 'Add rows item' });
  await expect(count).toHaveText('2 / 2');
  await expect(add).toBeDisabled();

  await editor.getByRole('button', { name: 'Remove rows item 2' }).click();
  await expect(count).toHaveText('1 / 2');
  await expect(add).toBeEnabled();
  await add.click();
  await expect(count).toHaveText('2 / 2');
  await expect(add).toBeDisabled();
});
