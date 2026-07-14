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
  await page.getByRole('button', { name: 'PLAY' }).first().click();
  await openSettings.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Primary host')).toHaveValue('127.0.0.1');
  await expect(panel.getByText(/on air or unsettled/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Apply server settings' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Close server settings' }).click();

  // 2. Remove-All: confirm the app's modal (a deliberate destructive path).
  await page.getByRole('button', { name: 'Remove all items' }).click();
  await page
    .getByRole('dialog', { name: 'Remove all items?' })
    .getByRole('button', { name: 'Remove all', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Stack' }).getByText('No items loaded', { exact: false }),
  ).toBeVisible();

  // 3. Reopened: unblocked; remote host → warning; Apply → applied.
  await openSettings.click();
  await expect(panel.getByRole('button', { name: 'Apply server settings' })).toBeEnabled();
  await panel.getByLabel('Primary host').fill('192.168.1.50');
  await expect(panel.getByText(/Remote server \(192\.168\.1\.50\)/)).toBeVisible();
  await expect(panel.getByText(/control connection stays on 127\.0\.0\.1/)).toBeVisible();
  await panel.getByRole('button', { name: 'Apply server settings' }).click();
  await expect(panel.getByText(/^Applied\./)).toBeVisible();
});
