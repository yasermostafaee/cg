import { buildInvalidVcg, buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * R-001 — Import a `.vcg` template (upload). Maps the capability's scenarios:
 *  - a verified `.vcg` is registered and loads onto the stack with its fields in
 *    the Inspector;
 *  - a package that fails verification shows a clear error and registers nothing.
 */

test('a verified .vcg is registered, loads onto the stack, and shows its fields', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-import';
  const before = await app.loadButtons().count();

  await app.importVcg('valid.vcg', await buildValidVcg(templateId));

  // The "Imported X" confirmation is a command SUCCESS toast now, not an inline panel message.
  await expect(app.success).toContainText('Imported');

  // It appears in the Library as a new row, headed by the FILE the operator imported —
  // `valid.vcg` → "valid" — not the scene's internal name ('e2e-lower-third') and never the
  // raw id. The id remains the row's stable anchor (and its tooltip).
  await expect(app.templateRow(templateId)).toBeVisible();
  await expect(app.templateRow(templateId)).toContainText('valid');
  await expect(app.templateRow(templateId)).not.toContainText(templateId);
  await expect(app.loadButtons()).toHaveCount(before + 1);
  await expect(app.error).toHaveCount(0);

  // It loads onto the stack, labelled the same way — and the row does not print its id.
  await app.loadTemplate(templateId);
  await expect(app.stack.getByText('valid')).toBeVisible();
  await expect(app.stack.getByText(templateId, { exact: false })).toHaveCount(0);

  // …and selecting it surfaces its field schema in the Inspector.
  await app.selectStackRow(templateId);
  await expect(app.inspector.getByText('Anchor name')).toBeVisible();
});

test('a .vcg that fails verification shows a clear error and registers nothing', async ({
  app,
}) => {
  const before = await app.loadButtons().count();

  await app.importVcg('broken.vcg', buildInvalidVcg());

  // A clear error is shown…
  await expect(app.error).toBeVisible();
  await expect(app.error).toContainText(/failed verification|could not be unpacked/i);

  // …and nothing new is registered (the Library list is unchanged).
  await expect(app.loadButtons()).toHaveCount(before);
});
