import { test, expect } from './fixtures/runtime.js';

/**
 * R-010 — the server settings panel + Remove-All, driven against the offline
 * MockRuntime (which mirrors the bridge's on-air gate):
 *
 *   1. With an item ON AIR, the panel opens blocked (reason shown, Apply disabled).
 *   2. Remove-All (confirm accepted) clears the stack.
 *   3. Reopened, the panel is unblocked; a remote host shows the LAN-exposure
 *      warning and Apply round-trips.
 */

test('settings panel: blocked while on air, Remove-All clears + unblocks, remote-host apply round-trips', async ({
  app,
}) => {
  const page = app.page;
  const panel = page.getByRole('dialog', { name: 'Server connection settings' });
  const openSettings = page.getByRole('button', { name: 'Open server settings' });

  // 1. Take an item to air, THEN open the panel → gate mirrored, Apply disabled.
  // R-028 part B — addressed by LAYER, not `.first()`: rows render newest-layer
  // first and most are empty, so the first PLAY on the page belongs to an empty
  // row and is correctly disabled. Layer 70 is the seed's loaded graphic.
  await app.layerRow(70).getByRole('button', { name: 'PLAY' }).click();
  await openSettings.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Primary host')).toHaveValue('127.0.0.1');
  await expect(panel.getByText(/on air or unsettled/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Apply server settings' })).toBeDisabled();

  /*
    THE HEADER'S `Close` BUTTON IS GONE, and this assertion is why the line below
    changed rather than the code.

    This dialog used to hand-roll its chrome, and its dedicated `Close` BUTTON was
    the odd one out in the app: every other dialog dismisses with the ✕ glyph. The
    modal primitive now owns the chrome, so the word is spent nowhere and the ✕ is
    the close affordance here as everywhere else — plus a real `Cancel` in the
    action row, because this dialog is a FORM and leaving without applying is a
    deliberate choice.

    Pinned, not merely updated: if the hand-rolled button ever comes back, this
    fails.
  */
  await expect(panel.getByRole('button', { name: 'Close server settings' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toBeHidden();

  // 2. Remove-All: confirm the app's modal (a deliberate destructive path).
  await page.getByRole('button', { name: 'Remove all items' }).click();
  await page
    .getByRole('dialog', { name: 'Remove all items?' })
    .getByRole('button', { name: 'Remove all', exact: true })
    .click();
  // R-028 part B — there is no separate Stack panel to empty. Remove-All is
  // proved by the LAYER rows: every one of them stops naming an item and offers
  // LOAD again. The rows themselves survive — they are declared layers, not a
  // list of what happens to be loaded.
  await expect(app.layers.locator('[data-item-id]')).toHaveCount(0);
  await expect(app.layerRow(70).getByRole('button', { name: 'LOAD' })).toBeVisible();

  // 3. Reopened: unblocked; remote host → warning; Apply → applied.
  await openSettings.click();
  await expect(panel.getByRole('button', { name: 'Apply server settings' })).toBeEnabled();
  await panel.getByLabel('Primary host').fill('192.168.1.50');
  await expect(panel.getByText(/Remote server \(192\.168\.1\.50\)/)).toBeVisible();
  await expect(panel.getByText(/control connection stays on 127\.0\.0\.1/)).toBeVisible();
  await panel.getByRole('button', { name: 'Apply server settings' }).click();
  await expect(panel.getByText(/^Applied\./)).toBeVisible();
});
