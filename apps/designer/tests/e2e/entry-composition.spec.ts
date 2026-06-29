import { test, expect } from './fixtures/designer.js';

/**
 * D-115 — the Compositions panel can designate the MAIN / entry composition: "Set as main" marks the
 * row + toggles to "Unset main", and deleting the designated composition clears it. (Open-on-load
 * resolution + round-trip are unit-tested in apps/designer/tests/entry-composition.test.ts.)
 */
test('Set as main marks the composition and toggles; deleting it clears the designation', async ({
  app,
}) => {
  await app.newProject('EntryComp'); // opens comp1
  await app.newComposition('TitleBlock'); // creates + opens a second composition
  await app.showCompositions();

  const row = app.page.locator('.cg-comp-row', { hasText: 'TitleBlock' }).first();

  // Set as main → the row is marked and the action flips to "Unset main".
  await row.click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Set as main' }).click();
  await expect(row.getByText('main', { exact: true })).toBeVisible();

  await row.click({ button: 'right' });
  await expect(app.page.getByRole('menuitem', { name: 'Unset main' })).toBeVisible();
  await app.page.keyboard.press('Escape');

  // Deleting the designated main clears the designation (no "main" badge remains anywhere).
  await row.click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(app.page.getByText('main', { exact: true })).toHaveCount(0);
});
