import { test, expect } from './fixtures/runtime.js';

/**
 * R-009 — the orphan-layer banner + Clear flow, driven against the offline
 * MockRuntime with the CG_E2E_ORPHAN seed (the bridge-side truth — real OSC
 * tap + sweep — is integration-tested in tools/caspar-bridge). Also proves
 * idle-quiet: with no seed, the banner does not exist.
 */

test('a seeded orphan surfaces the banner naming the layer; confirm-gated Clear resolves it', async ({
  app,
}) => {
  const page = app.page;

  // Idle-quiet first: the default boot (no seed) shows no banner at all.
  await expect(page.getByRole('alert', { name: 'Orphaned on-air layers' })).toHaveCount(0);

  // Re-boot with the seeded orphan (init scripts apply on the next navigation).
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E_ORPHAN: boolean }).CG_E2E_ORPHAN = true;
  });
  await page.reload();

  const banner = page.getByRole('alert', { name: 'Orphaned on-air layers' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Layer 1-60 is on air but not on your stack');

  // Cancel first: the fixture's default dialog handler dismisses — nothing happens.
  await banner.getByRole('button', { name: 'Clear layer 1-60' }).click();
  await expect(banner).toBeVisible();

  // Accept: replace the dialog handler, Clear resolves, the banner disappears.
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => void d.accept());
  await banner.getByRole('button', { name: 'Clear layer 1-60' }).click();
  await expect(page.getByRole('alert', { name: 'Orphaned on-air layers' })).toHaveCount(0);
});
