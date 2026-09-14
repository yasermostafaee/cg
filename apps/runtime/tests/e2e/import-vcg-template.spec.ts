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

  // Import AND load, in one action, onto the row the operator chose (layer 84).
  await app.importVcg('valid.vcg', await buildValidVcg(templateId), 84);

  /*
    🔴 REPLACED, NOT DELETED — and the reason is the rule, not this test.

    `importVcg` is ONE gesture that completes TWO actions: the package is imported, and it is
    loaded onto the row the operator aimed at. Each completed action makes exactly one toast
    call (`CommandToast`'s corollary), and a second confirmation REPLACES the first. So
    `Imported · valid` is on screen for the instant between them and the LOAD's sentence is
    what the operator actually reads.

    This spec asserted the one that loses. It now asserts the one that survives, and the
    assertion is stronger than the old one was: the surviving sentence has to name BOTH halves
    on its own — WHAT arrived (the template, by the file the operator chose) and WHERE it
    landed (the row, by the operator's name for it) — which is exactly the property that makes
    replacement safe. If the load's toast ever goes back to `Row N loaded.`, this fails.
  */
  // The row's OWN name, read off the row rather than hardcoded. Its `title` is exactly the
  // name, where `innerText` would also pick up the draft chip that sits beside it.
  const landedOn = await app.layerRow(84).locator('[data-row-body]').getAttribute('title');
  expect(landedOn, 'the row does not name itself').not.toBeNull();
  await expect(app.success).toContainText('loaded');
  await expect(app.success).toContainText(landedOn ?? '');
  await expect(app.success).toContainText('valid');
  await expect(app.error).toHaveCount(0);

  // It is on the row, headed by the FILE the operator imported — `valid.vcg` → "valid" —
  // not the scene's internal name ('e2e-lower-third') and never the raw id.
  const row = app.layerRow(84);
  await expect(row).toContainText('valid');
  await expect(row).not.toContainText(templateId);

  // …and it is registered in the library, exactly once.
  expect(await app.templateCount()).toBe(before + 1);

  // Selecting the row surfaces its field schema in the Inspector.
  await app.selectLayerRow(84);
  await expect(app.inspector.getByText('Anchor name')).toBeVisible();
});

test('a .vcg that fails verification shows a clear error and registers nothing', async ({
  app,
}) => {
  const before = await app.templateCount();

  await app.importVcg('broken.vcg', buildInvalidVcg(), 84);

  /*
    🔴 A CLEAR ERROR IS SHOWN — IN THE IMPORT DIALOG, which is `RUNTIME-REPAIR-05`'s one
    change to this case. The sentence is `importVcgFile`'s own and the CONDITION that produced
    it is untouched (`verify → unpack → B-196 → render`); what moved is where the operator
    reads it. It used to go to the command toast, which renders UNDER a modal backdrop — the
    A9 defect this console has already fixed once, on the deletion path.
  */
  const refusal = app.page.locator('[data-modal-message]');
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText(/failed verification|could not be unpacked/i);
  await expect(refusal).toContainText('broken.vcg');

  // …nothing new is registered…
  expect(await app.templateCount()).toBe(before);

  /*
    …and the row it was aimed at is untouched: a rejected package must never leave a
    half-bound layer behind. Stronger than before, and cheaply so: importing no longer touches
    a row in ANY outcome, so the dialogs are simply dismissed and the row is asked.
  */
  await app.page.getByRole('button', { name: 'Cancel' }).last().click();
  await app.closeTemplatePicker();
  await expect(app.layerRow(84).getByRole('button', { name: 'LOAD' })).toBeEnabled();
});
