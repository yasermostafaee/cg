import { buildInvalidVcg, buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * R-001 — Import a `.vcg` template (upload). Maps the capability's scenarios:
 *  - a verified `.vcg` is registered and loads onto a layer with its fields in
 *    the Inspector;
 *  - a package that fails verification shows a clear error and registers nothing.
 *
 * R-028 part B — re-homed, not re-scoped. The Library panel was DELETED and the
 * Stack merged into the Layers list, so the surface these scenarios are driven
 * through changed: importing is no longer "register, then find it in a list,
 * then load it" but ONE gesture on the row the operator wants it on. The
 * assertions themselves are unchanged — a verified package is registered,
 * labelled by the FILE, loaded, and its fields appear; an unverifiable one
 * errors and registers nothing. Where the old spec read the Library panel for
 * "is it registered?", it now reads the picker dialog, which is the only
 * template list left.
 */

test('a verified .vcg is registered, loads onto a layer, and shows its fields', async ({ app }) => {
  const templateId = 'tpl-e2e-import';
  const before = await app.templateCount();

  // Import AND load, in one action, onto the row the operator chose (layer 74).
  await app.importVcg('valid.vcg', await buildValidVcg(templateId), 74);

  // The "Imported X" confirmation is a command SUCCESS toast now, not an inline panel message.
  await expect(app.success).toContainText('Imported');
  await expect(app.error).toHaveCount(0);

  // It is on the row, headed by the FILE the operator imported — `valid.vcg` → "valid" —
  // not the scene's internal name ('e2e-lower-third') and never the raw id.
  const row = app.layerRow(74);
  await expect(row).toContainText('valid');
  await expect(row).not.toContainText(templateId);

  // …and it is registered in the library, exactly once.
  expect(await app.templateCount()).toBe(before + 1);

  // Selecting the row surfaces its field schema in the Inspector.
  await app.selectLayerRow(74);
  await expect(app.inspector.getByText('Anchor name')).toBeVisible();
});

test('a .vcg that fails verification shows a clear error and registers nothing', async ({
  app,
}) => {
  const before = await app.templateCount();

  await app.importVcg('broken.vcg', buildInvalidVcg(), 74);

  // A clear error is shown…
  await expect(app.error).toBeVisible();
  await expect(app.error).toContainText(/failed verification|could not be unpacked/i);

  // …nothing new is registered…
  expect(await app.templateCount()).toBe(before);

  // …and the row it was aimed at is untouched: a rejected package must never
  // leave a half-bound layer behind.
  await expect(app.layerRow(74).getByRole('button', { name: 'LOAD' })).toBeEnabled();
});
