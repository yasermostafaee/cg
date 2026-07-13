import { buildNestedCompVcg, expect, test } from './fixtures/runtime.js';

/**
 * B-067 — a D-119 starter is a graphic composition NESTED inside a full-frame
 * positioning composition, and its authored fields live on the nested comp. The Runtime
 * built the operator form from the ENTRY comp's flat fields only, so importing a starter
 * showed "No fields." and the graphic could not be edited on air.
 *
 * Maps the runtime-template-library scenarios:
 *  - a two-composition starter exposes its nested fields;
 *  - the Inspector renders them as a labelled group per composition instance;
 *  - editing one stages + applies through the SAME R-003 Update path as a flat field.
 */

test('a two-composition starter shows its NESTED fields in the Inspector, grouped and editable', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-nested';
  const { bytes, groupLabel, fieldId } = await buildNestedCompVcg(templateId);

  await app.importVcg('nested.vcg', bytes);
  await expect(app.error).toHaveCount(0);

  await app.loadTemplate(templateId);
  await app.selectStackRow(templateId);

  // The regression: this used to be "No fields."
  await expect(app.inspector.getByText('No fields.')).toHaveCount(0);

  // The nested composition instance renders as its own labelled group…
  const group = app.inspector.locator(`section[aria-label="${groupLabel} fields"]`);
  await expect(group).toBeVisible();

  // …carrying the nested comp's editable field.
  const field = group.getByLabel(fieldId, { exact: true });
  await expect(field).toBeVisible();

  // And it edits through the ordinary staged-edit path (R-003): type → dirty → Apply.
  await field.fill('خبر فوری');
  await expect(app.inspector.getByLabel(`${fieldId} has unapplied edits`)).toBeVisible();
  await expect(app.inspector.getByLabel('unapplied edits', { exact: true })).toBeVisible();

  await app.applyEdits();
  // The applied value came back from the bridge under its NESTED key — if it had gone out
  // (or come back) as a flat top-level key, the control would re-seed empty here.
  await expect(app.inspector.getByLabel('unapplied edits', { exact: true })).toHaveCount(0);
  await expect(field).toHaveValue('خبر فوری');
});
