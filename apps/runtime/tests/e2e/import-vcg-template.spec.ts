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

/*
  🔴 `BOOK-EXPORT-01` (`B-350`) — THE OWNER'S FILE: an export that never finished left
  `telavat.vcg` at 0 bytes, and the import read "Unpack failed: End of data reached (data length = 0,
  asked index = 4). Corrupted zip ?". It now says what happened and what to do, and registers nothing.
*/
test('🔴 an EMPTY .vcg says it is empty and that the export did not finish', async ({ app }) => {
  const before = await app.templateCount();
  await app.importVcg('telavat.vcg', new Uint8Array(0), 84);
  await expect(app.page.locator('[data-modal-message]')).toHaveText(
    '“telavat.vcg” is empty (0 bytes); the export did not finish. Export it again from the Designer.',
  );
  expect(await app.templateCount()).toBe(before);
});

test('a .vcg that fails verification shows a clear error and registers nothing', async ({
  app,
}) => {
  const before = await app.templateCount();

  await app.importVcg('broken.vcg', buildInvalidVcg(), 84);

  /*
    🔴 A CLEAR ERROR IS SHOWN — IN THE PICKER'S OWN MESSAGE REGION (`RUNTIME-REPAIR-05` put
    it in a separate Import dialog; `UI-POLISH-01` D retired that dialog, and the line stayed in
    the dialog the operator is looking at). The sentence is `importVcgFile`'s own and the CONDITION that produced
    it is untouched (`verify → unpack → B-196 → render`); what moved is where the operator
    reads it. It used to go to the command toast, which renders UNDER a modal backdrop — the
    A9 defect this console has already fixed once, on the deletion path.
  */
  const refusal = app.page.locator('[data-modal-message]');
  await expect(refusal).toBeVisible();
  // `BOOK-EXPORT-01` (`B-350`) — in the operator's words: the zip library's text is in the log only.
  await expect(refusal).toHaveText('“broken.vcg” is damaged or not a CG template.');

  // …nothing new is registered…
  expect(await app.templateCount()).toBe(before);

  /*
    …and the row it was aimed at is untouched: a rejected package must never leave a
    half-bound layer behind. Stronger than before, and cheaply so: importing no longer touches
    a row in ANY outcome, so the picker is simply dismissed and the row is asked.
  */
  await app.closeTemplatePicker();
  await expect(app.layerRow(84).getByRole('button', { name: 'LOAD' })).toBeEnabled();
});
