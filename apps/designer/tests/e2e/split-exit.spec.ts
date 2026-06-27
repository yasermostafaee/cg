import { test, expect } from './fixtures/designer.js';

/**
 * D-105 — the preview transport's split exit. **Out** animates the content off
 * (a CSS opacity fade) before the background closes; **Stop** removes the content
 * IMMEDIATELY (a hard hide) then closes the background. Both settle the stage into
 * the cleared (`cg-pending`) state. The precise content-first/background-last
 * sequencing is covered by the @cg/template-runtime unit tests
 * (split-exit.test.ts), which run the same runtime source the preview uses.
 */
test.describe('D-105 — split exit (Out vs Stop)', () => {
  test('Out fades the content off; Stop removes it immediately; both clear the stage', async ({
    app,
  }) => {
    await app.newProject('SplitExit');
    // A content element (a countdown clock — marked `data-cg-content` by the runtime)
    // plus an out-point so the composition has a background close to play.
    await app.addClock();
    await app.setClockCountdown(30);
    await app.addOutPoint();

    await app.openPreviewModal();
    const content = app.previewFrame.locator('[data-cg-content]').first();
    const body = app.previewFrame.locator('body');

    // Out — the content gets an opacity TRANSITION (animated fade), then the stage clears.
    await app.play();
    await expect(content).toBeVisible();
    await app.out();
    await expect(content).toHaveAttribute('style', /transition:\s*opacity/);
    await expect(body).toHaveClass(/cg-pending/, { timeout: 10_000 });

    // Stop — the content is hidden IMMEDIATELY (a hard hide, no transition), then the
    // stage clears. (Re-play first to restore the content.)
    await app.play();
    await expect(content).toBeVisible();
    await app.stop();
    await expect(content).toHaveAttribute('style', /visibility:\s*hidden/);
    await expect(body).toHaveClass(/cg-pending/, { timeout: 10_000 });
  });
});
