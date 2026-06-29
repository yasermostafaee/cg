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

  // It appears in the Library (a new "Load <id>" entry).
  await expect(
    app.library.getByRole('button', { name: `Load ${templateId}`, exact: true }),
  ).toBeVisible();
  await expect(app.loadButtons()).toHaveCount(before + 1);
  await expect(app.error).toHaveCount(0);

  // It loads onto the stack…
  await app.loadTemplate(templateId);
  await expect(app.stack.getByText(templateId, { exact: false })).toBeVisible();

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
