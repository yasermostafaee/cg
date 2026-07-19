import { test, expect } from './fixtures/runtime.js';

/**
 * R-009 — the orphan-layer banner + Clear flow, driven against the offline
 * MockRuntime with the CG_E2E_ORPHAN seed (the bridge-side truth — real OSC
 * tap + sweep — is integration-tested in tools/caspar-bridge). Also proves
 * idle-quiet: with no seed, the banner does not exist.
 *
 * R-015 — the seed also carries a VIDEO layer (ffmpeg on 1-1): it renders as
 * NEUTRAL information (role="status", never an alert) with NO Clear control,
 * and it survives the html orphan's Clear — a video layer is another
 * system's output and reads as a normal fact of the console.
 */

test('a seeded orphan surfaces the banner naming the layer; confirm-gated Clear resolves it; the video layer stays neutral', async ({
  app,
}) => {
  const page = app.page;

  // Idle-quiet first: the default boot (no seed) shows neither surface.
  await expect(page.getByRole('alert', { name: 'Orphaned on-air layers' })).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Layers in use by other systems' })).toHaveCount(0);

  // Re-boot with the seeded orphan + video layer (init scripts apply on the next navigation).
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E_ORPHAN: boolean }).CG_E2E_ORPHAN = true;
  });
  await page.reload();

  const banner = page.getByRole('alert', { name: 'Orphaned on-air layers' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Layer 1-60 is on air but not on your stack');

  // R-015 — the video layer reads as NORMAL: a status strip, not an alert,
  // naming the kind, with no button anywhere in it.
  const videoStrip = page.getByRole('status', { name: 'Layers in use by other systems' });
  await expect(videoStrip).toBeVisible();
  await expect(videoStrip).toContainText('Layer 1-1 is carrying video (ffmpeg)');
  await expect(videoStrip.getByRole('button')).toHaveCount(0);

  // The gate is the app's own modal. Cancel first — nothing happens.
  const confirmClear = page.getByRole('dialog', { name: 'Clear layer 1-60?' });
  await banner.getByRole('button', { name: 'Clear layer 1-60' }).click();
  await expect(confirmClear).toBeVisible();
  await confirmClear.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmClear).toHaveCount(0);
  await expect(banner).toBeVisible();

  // Confirm: Clear resolves, the warning disappears — and the video layer
  // is still there, still neutral, still button-less (R-015).
  await banner.getByRole('button', { name: 'Clear layer 1-60' }).click();
  await confirmClear.getByRole('button', { name: 'Clear layer', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Orphaned on-air layers' })).toHaveCount(0);
  await expect(videoStrip).toBeVisible();
  await expect(videoStrip.getByRole('button')).toHaveCount(0);
});
