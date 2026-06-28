import { test, expect } from './fixtures/designer.js';

/**
 * B-033 — a content-driven hold must re-arm on every preview play. The first play waits for the
 * content (a 3s countdown); the SECOND play (without reopening the preview) used to close instantly
 * because the nested/self settle signal stayed resolved from the first play. The runtime re-arm is
 * proven deterministically by packages/template-runtime/tests/replay-rearms-content-hold.test.ts;
 * this is the preview play-twice guard.
 */
test('a content-driven hold re-arms on the 2nd preview play (does not close instantly)', async ({
  app,
}) => {
  await app.newProject('ReplayHold');
  await app.addClock();
  await app.setClockCountdown(3); // a 3s countdown = the content that ends the hold
  await app.addOutPoint();
  await app.setPlayoutTiming('auto-out');
  await app.setHoldSource('content-driven');
  await app.openPreviewModal();

  const pending = app.previewFrame.locator('body.cg-pending');

  // First play: on air, holds for the countdown, then settles (~3s + outro).
  await app.play();
  await expect(pending).toHaveCount(0); // on air (holding)
  await app.page.waitForTimeout(4500);
  await expect(pending).toHaveCount(1); // settled after the countdown completed

  // Replay WITHOUT reopening: the hold must re-arm and wait again.
  await app.play();
  await expect(pending).toHaveCount(0); // on air again
  await app.page.waitForTimeout(1000); // well within the fresh 3s countdown
  await expect(pending).toHaveCount(0); // STILL holding — B-033 re-arm (would be settled/1 without the fix)
});
