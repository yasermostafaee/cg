import { expect, test } from './fixtures/designer.js';

/** D-195 — Look registration, instance and backing composition share one lifecycle. */
test('deleting a Look composition removes the Look everywhere; a new Look reuses the free name', async ({
  app,
}) => {
  await app.newProject('LookLifecycle');
  await app.showCompositions();
  const homeName = (await app.page.locator('.cg-comp-row').first().innerText()).trim();

  await app.addMultiFrameGroup();
  await app.addLook();
  await app.openComposition('preset-1');
  await app.addLiveSource({ x: 300, y: 200 });
  await app.setLiveSourceId('guest-1');
  await app.deselect();
  await app.openComposition(homeName);

  await app.showCompositions();
  const lookRow = app.page.locator('[data-composition-kind="look"]', { hasText: 'preset-1' });
  await expect(lookRow).toBeVisible();
  await lookRow.click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Delete Preset' }).click();

  await expect(
    app.page.locator('[data-composition-kind="look"]', { hasText: 'preset-1' }),
  ).toHaveCount(0);
  await expect(
    app.page.getByRole('status').filter({ hasText: /Preset “preset-1”.*composition.*deleted/i }),
  ).toBeVisible();
  await expect(app.page.getByLabel('Active preset')).toHaveCount(0);

  // The old backing composition was deleted too, so the free default name is honest again.
  await app.addLook();
  await expect(
    app.page.locator('[data-composition-kind="look"]', { hasText: 'preset-1' }),
  ).toHaveCount(1);
  await expect(
    app.page.locator('[data-composition-kind="composition"]', { hasText: 'preset-1' }),
  ).toHaveCount(0);
});
