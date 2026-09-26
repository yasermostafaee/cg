import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/runtime.js';

/**
 * R-009 — the orphan-layer banner + Clear flow, driven against the offline
 * MockRuntime with the CG_E2E_ORPHAN seed (the bridge-side truth — real OSC
 * tap + sweep — is integration-tested in tools/caspar-bridge). Also proves
 * idle-quiet: with no seed, the banner does not exist.
 *
 * R-015 — the seed also carries VIDEO layers: inside CG's bands one renders as
 * NEUTRAL information (role="status", never an alert) with NO Clear control,
 * and it survives the html orphan's Clear — a video layer is another
 * system's output and reads as a normal fact of the console.
 *
 * `FIELD-FIXES-01` L — and the seed straddles CG's bands: `ffmpeg` on 1-5 is the Playout's
 * playlist, which is normal (no notice, no mark, listed on Station layers), and `ffmpeg` on 1-90
 * is a conflict inside the bands (the notice, the mark, and a dismissal that holds).
 */

test('a seeded orphan surfaces the banner naming the layer; confirm-gated Clear resolves it; the video layer stays neutral', async ({
  app,
}) => {
  const page = app.page;

  // Idle-quiet first: the default boot (no seed) shows neither surface.
  await expect(page.getByRole('alert', { name: 'Orphaned on-air layers' })).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Layers in use by other systems' })).toHaveCount(0);

  // Re-boot with the seeded orphan + video layers (init scripts apply on the next navigation).
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E_ORPHAN: boolean }).CG_E2E_ORPHAN = true;
  });
  await page.reload();

  const banner = page.getByRole('alert', { name: 'Orphaned on-air layers' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Layer 1-60 is on air but not on your stack');

  // R-015 — the video layer inside the bands reads as NORMAL: a status strip, not an alert,
  // naming the kind, with no Clear control in it. (L — the one on layer 5 is not in it at all.)
  const videoStrip = page.getByRole('status', { name: 'Layers in use by other systems' });
  await expect(videoStrip).toBeVisible();
  await expect(videoStrip).toContainText('Layer 1-90 is carrying video (ffmpeg)');
  await expect(videoStrip).not.toContainText('Layer 1-5 ');
  await expect(videoStrip.getByRole('button', { name: /clear/i })).toHaveCount(0);

  // The gate is the app's own modal. Cancel first — nothing happens.
  const confirmClear = page.getByRole('dialog', { name: 'Clear layer 1-60?' });
  await banner.getByRole('button', { name: 'Clear layer 1-60' }).click();
  await expect(confirmClear).toBeVisible();
  await confirmClear.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmClear).toHaveCount(0);
  await expect(banner).toBeVisible();

  // Confirm: Clear resolves, the warning disappears — and the video layer
  // is still there, still neutral, still without a Clear (R-015).
  await banner.getByRole('button', { name: 'Clear layer 1-60' }).click();
  await confirmClear.getByRole('button', { name: 'Clear layer', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Orphaned on-air layers' })).toHaveCount(0);
  await expect(videoStrip).toBeVisible();
  await expect(videoStrip.getByRole('button', { name: /clear/i })).toHaveCount(0);
});

/** The strip marks another channel only on a station that declares more than one. */
async function declareSecondChannel(page: Page): Promise<void> {
  const ok = await page.evaluate(async () => {
    const cg = (window as unknown as { cg: typeof window.cg }).cg;
    const [first] = await cg.fixedLayers.banks();
    if (first === undefined) return false;
    const res = await cg.fixedLayers.setBanks({ banks: [first, { ...first, channel: 2 }] });
    return res.ok;
  });
  expect(ok, 'the second channel was declared').toBe(true);
}

test('🔴 FIELD-FIXES-01 L — layer 5 is the Playout’s: no notice, no mark, listed on Station layers; layer 90’s notice and mark stand until dismissed, the dismissal survives a reload, and layer 91 brings it back', async ({
  app,
}) => {
  const page = app.page;
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E_ORPHAN: boolean }).CG_E2E_ORPHAN = true;
  });
  await page.reload();
  await declareSecondChannel(page);

  const graphicStrip = page.getByRole('alert', { name: 'Orphaned on-air layers' });
  const videoStrip = page.getByRole('status', { name: 'Layers in use by other systems' });
  const markOnOne = page.locator('#channel-1 [data-tab-signal]');

  // CONTROL — inside the bands: layer 90's notice and channel 1's mark.
  await expect(videoStrip).toContainText('Layer 1-90 is carrying video (ffmpeg)');
  await expect(graphicStrip).toBeVisible();
  await expect(markOnOne).toHaveAttribute('data-tab-signal', 'warning');
  // Layer 5 is listed where the station's own layers are read…
  await app.playoutTab.click();
  await expect(app.layers.locator('[data-undeclared-layer="5"]')).toBeVisible();
  // …and nowhere in the notice.
  await expect(videoStrip).not.toContainText('Layer 1-5 ');

  // Each strip is dismissed on its own. With both dismissed, what is left on channel 1 is layer 5,
  // and layer 5 gives no notice and no mark.
  await videoStrip.getByRole('button', { name: 'Dismiss this notice' }).click();
  await expect(videoStrip).toHaveCount(0);
  await expect(graphicStrip, 'the other strip is its own notice').toBeVisible();
  await expect(markOnOne, 'the graphic strip still marks the channel').toHaveCount(1);
  await graphicStrip.getByRole('button', { name: 'Dismiss this notice' }).click();
  await expect(graphicStrip).toHaveCount(0);
  await expect(markOnOne).toHaveCount(0);
  await expect(app.layers.locator('[data-undeclared-layer="5"]')).toBeVisible();

  // A reload keeps the dismissals (the offline mock re-seeds the same set and forgets its banks).
  await page.reload();
  await declareSecondChannel(page);
  await expect(page.locator('#channel-2')).toBeVisible();
  await expect(videoStrip).toHaveCount(0);
  await expect(graphicStrip).toHaveCount(0);
  await expect(markOnOne).toHaveCount(0);

  // A foreign producer APPEARS on layer 91: the video strip returns with its mark; the graphic
  // strip, whose set did not change, stays dismissed.
  await page.evaluate(() => {
    (
      window as unknown as {
        CG_TEST_ORPHAN_APPEARS: (o: { channel: number; layer: number; producer: string }) => void;
      }
    ).CG_TEST_ORPHAN_APPEARS({ channel: 1, layer: 91, producer: 'ffmpeg' });
  });
  await expect(videoStrip).toContainText('Layer 1-91 is carrying video (ffmpeg)');
  await expect(videoStrip).toContainText('Layer 1-90 is carrying video (ffmpeg)');
  await expect(markOnOne).toHaveAttribute('data-tab-signal', 'warning');
  await expect(graphicStrip).toHaveCount(0);
});
