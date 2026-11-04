import { test, expect } from './fixtures/designer.js';

/**
 * D-173 supersedes the Designer-preview half of D-105: Out remains a runtime/on-air
 * contract but is no longer a rehearsal button. Stop still clears immediately. The
 * precise split-exit sequencing remains covered by @cg/template-runtime unit tests.
 */
test.describe('D-173 — Preview exposes Stop, not Out', () => {
  test('Out is absent; Stop removes content immediately and clears the stage', async ({ app }) => {
    await app.newProject('SplitExit');
    // A content element (a countdown clock — marked `data-cg-content` by the runtime)
    // plus an out-point so the composition has a background close to play.
    await app.addClock();
    await app.setClockCountdown(30);
    await app.addOutPoint();

    await app.openPreviewModal();
    const content = app.previewFrame.locator('[data-cg-content]').first();
    const body = app.previewFrame.locator('body');

    await expect(app.previewDialog.getByRole('button', { name: 'Out', exact: true })).toHaveCount(
      0,
    );
    await app.play();
    await expect(content).toBeVisible();
    await app.stop();
    await expect(content).toHaveAttribute('style', /visibility:\s*hidden/);
    await expect(body).toHaveClass(/cg-pending/, { timeout: 10_000 });
  });
});
