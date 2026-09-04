import { expect, test } from './fixtures/designer.js';

/**
 * `DESIGNER-FIX-0905` §5 / `B-219` — **a removed look is offered back, and comes back as
 * authored.** The owner's screenshot had the Compositions panel listing `look-1`…`look-3`
 * beside a Looks section reading "No looks yet". The walk: author a look with a plate, remove
 * it, see both panels agree, restore it with **Make it a look**, and see the next `+ Look`
 * take a fresh name rather than a second `look-1`.
 */
test('a removed look is offered back; Make it a look restores its plate; + Look takes a fresh name', async ({
  app,
}) => {
  await app.newProject('LookOrphan');
  await app.showCompositions();
  const homeName = (await app.page.locator('.cg-comp-row').first().innerText()).trim();

  await app.page.getByRole('button', { name: 'Add multi-frame group' }).click();
  await app.inspector.getByRole('button', { name: '+ Look' }).click();
  await app.inspector.getByRole('button', { name: 'Edit contents of look-1' }).click();
  await app.addLiveSource({ x: 300, y: 200 });
  await app.setLiveSourceId('guest-1');
  await app.deselect();
  await app.openComposition(homeName);

  // Remove it. The section says "No looks yet" — and, in the same frame, that the
  // composition is still there and can become a look again; the notice says so too.
  await app.inspector.getByRole('button', { name: 'Remove look look-1' }).click();
  await expect(app.inspector.getByText('No looks yet.')).toBeVisible();
  await expect(app.inspector.getByText('Compositions that can become a look')).toBeVisible();
  await expect(app.inspector.getByRole('button', { name: 'Make look-1 a look' })).toBeVisible();
  await expect(
    app.page.getByRole('status').filter({ hasText: /stays in the project/ }),
  ).toBeVisible();
  await app.showCompositions();
  await expect(app.page.locator('.cg-comp-row', { hasText: 'look-1' })).toHaveCount(1);

  // Restore it: the look is registered on the SAME composition and its plate is on stage.
  await app.inspector.getByRole('button', { name: 'Make look-1 a look' }).click();
  await expect(
    app.inspector.getByRole('button', { name: 'Edit contents of look-1' }),
  ).toBeVisible();
  await expect(app.inspector.getByText('Compositions that can become a look')).toHaveCount(0);
  await expect(app.canvasFrame.locator('[data-cg-live-source="guest-1"]:visible')).toHaveCount(1);
  await expect(app.page.locator('.cg-comp-row', { hasText: 'look-1' })).toHaveCount(1);

  // The next + Look is `look-2`, never a second `look-1`.
  await app.inspector.getByRole('button', { name: '+ Look' }).click();
  await expect(
    app.inspector.getByRole('button', { name: 'Edit contents of look-2' }),
  ).toBeVisible();
});
