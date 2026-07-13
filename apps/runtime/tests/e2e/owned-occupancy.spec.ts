import { test, expect } from './fixtures/runtime.js';

/**
 * B-056 — the owned-slot occupancy warning surface, driven against the
 * offline MockRuntime with the CG_E2E_OWNED_OCCUPANCY seed (the bridge-side
 * truth — load-time detection off the real OSC occupancy tap — is
 * integration-tested in tools/caspar-bridge). Distinct from R-009's orphan
 * rows: names the item, offers NO Clear, and resolves via the Out/Remove
 * remedy. Also proves idle-quiet: with no seed, the strip does not exist.
 */

test('a seeded owned-slot warning names the layer and item, offers no Clear, and resolves when the item is removed', async ({
  app,
}) => {
  const page = app.page;

  // Idle-quiet first: the default boot (no seed) shows no owned-slot strip.
  await expect(page.getByRole('alert', { name: 'Owned-layer occupancy warnings' })).toHaveCount(0);

  // Re-boot with the seeded warning (init scripts apply on the next navigation).
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E_OWNED_OCCUPANCY: boolean }).CG_E2E_OWNED_OCCUPANCY = true;
  });
  await page.reload();

  const banner = page.getByRole('alert', { name: 'Owned-layer occupancy warnings' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Layer 1-10');
  await expect(banner).toContainText('item-irib-news');
  await expect(banner).toContainText('Out or Remove the item');
  // No direct Clear on an owned layer — the strip offers no controls at all.
  await expect(banner.getByRole('button')).toHaveCount(0);

  // The remedy: REMOVE the named item from the stack → the warning resolves.
  const row = app.stack
    .locator('div')
    .filter({ hasText: 'item-irib-news' })
    .filter({ has: page.getByRole('button', { name: 'REMOVE' }) })
    .last();
  await row.getByRole('button', { name: 'REMOVE' }).click();
  await expect(app.stack.getByText('item-irib-news', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('alert', { name: 'Owned-layer occupancy warnings' })).toHaveCount(0);
});
