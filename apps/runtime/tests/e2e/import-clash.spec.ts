import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `B-352` — **A RE-IMPORT IS A QUESTION, NEVER A SILENT REPLACEMENT.** The owner: "from one template
 * we take several outputs; imported into CG Control, each takes the place of the previous one". A
 * package whose id the channel already lists asks, in the Templates dialog: Update "<name>" (the
 * default) or Add as a new template — and the success line says which happened.
 */
test('🔴 the same package imported again: Add as a new template, then Update', async ({ app }) => {
  const start = await app.templateCount();
  const bytes = await buildValidVcg('tpl-e2e-clash');
  await app.importVcg('telavat.vcg', bytes);
  expect(await app.templateCount()).toBe(start + 1);

  // Again: the dialog asks instead of replacing.
  await app.importVcg('telavat.vcg', bytes);
  const question = app.page.locator('[data-modal-message]');
  await expect(question).toContainText('“telavat” is already on this channel.');
  // The default answer comes first; the name inside it is an isolated `<bdi>` (golden rule 11).
  const update = question.getByRole('button', { name: /^Update/ });
  await expect(update).toHaveText('Update “telavat”');
  await expect(question.getByRole('button').first()).toHaveText('Update “telavat”');
  await question.getByRole('button', { name: 'Add as a new template' }).click();
  await expect(app.success).toContainText('Imported · telavat (2)');
  await expect.poll(() => app.templateCount()).toBe(start + 2);
  // Listed, and selected (its name in the list row and in the aside).
  await expect(app.templatePicker.getByText('telavat (2)', { exact: true }).first()).toBeVisible();
  await app.closeTemplatePicker();

  // And again: Update keeps one template under that id, and says so.
  await app.importVcg('telavat.vcg', bytes);
  await expect(question).toContainText('“telavat” is already on this channel.');
  await question.getByRole('button', { name: /^Update/ }).click();
  await expect(app.success).toContainText('Updated · telavat');
  await expect.poll(() => app.templateCount()).toBe(start + 2);
  await app.closeTemplatePicker();
});

test('two compositions of one project (two ids) import side by side, nothing asked', async ({
  app,
}) => {
  const start = await app.templateCount();
  await app.importVcg('telavat-a.vcg', await buildValidVcg('tpl-e2e-comp-a'));
  await app.importVcg('telavat-b.vcg', await buildValidVcg('tpl-e2e-comp-b'));
  expect(await app.templateCount()).toBe(start + 2);
  await expect(app.page.locator('[data-modal-message]')).toHaveCount(0);
});
