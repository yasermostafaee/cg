import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-104 follow-up — a composition's CONTENT (here a subtitle ticker) must begin the
 * moment the parent's INTRO completes (its hold entry) and run through the WHOLE hold,
 * NOT only near the out-point / hold exit.
 *
 * Scene: a background shape that ENTERS quickly (a short fade-in that settles at ~frame 8)
 * then holds statically to a FAR out-point (the timeline is stretched to 500 frames so the
 * out-point sits at ~7.5s). Pre-fix the ticker only started at the out-point (~7.5s, near
 * the outro); the fix starts it at the entrance settle (~0.16s). We poll for the crawl
 * within 1.5s — comfortably after the settle but long before the out-point — so the test
 * FAILS on the old behavior and PASSES on the fix.
 *
 * Direct-subtitle coverage here (both hold modes); the nested-composition and per-cycle
 * cases are covered deterministically by packages/template-runtime/tests (a real-timer
 * E2E cannot reliably separate "starts at play" from "starts at the parent settle").
 */

/** Author a comp: a shape with a short fade-in entrance + a subtitle ticker + a far out-point. */
async function authorEnteringGraphic(
  app: DesignerApp,
  hold: 'timed' | 'content-driven',
): Promise<void> {
  // A background shape with a SHORT fade-in: opacity 0 @0 → 100 @~8, then static.
  await app.addRectangle({ x: 240, y: 130 });
  await app.setInspectorNumber('Opacity', 0);
  await app.toggleInspectorKeyframe('opacity'); // keyframe @0 = 0
  await expect(app.inspectorDiamond('opacity')).toHaveAttribute('data-variant', 'at-frame');
  await app.scrubToFrame(8);
  await app.setInspectorNumber('Opacity', 100);
  await app.toggleInspectorKeyframe('opacity'); // keyframe @~8 = 100 (entrance settles here)
  await app.scrubToFrame(0);

  // Stretch the timeline so the out-point (75% of it) sits far from the entrance settle.
  await app.setSceneDuration(500);
  // The subtitle (a ticker) + the far out-point + the hold mode.
  await app.addTicker({ x: 140, y: 210 });
  await app.addOutPoint();
  await app.setPlayoutTiming('auto-out');
  await app.setHoldSource(hold);
}

/** The crawl track gains a `translateX(...)` on the driver's first step() — i.e. when content starts. */
async function expectSubtitleCrawlsWithin(app: DesignerApp, ms: number): Promise<void> {
  const track = app.previewFrame.locator('.cg-ticker-track').first();
  await expect
    .poll(async () => (await track.getAttribute('style')) ?? '', { timeout: ms })
    .toContain('translateX');
}

test.describe('Content starts at the entrance completion (hold entry), not the out-point — D-104 follow-up', () => {
  test('timed / auto-out hold: the subtitle crawls from the entrance settle, not the out-point', async ({
    app,
  }) => {
    await app.newProject('HoldEntryTimed');
    await authorEnteringGraphic(app, 'timed');
    await app.openPreviewModal();
    await app.play();
    await expectSubtitleCrawlsWithin(app, 1500); // ~0.16s with the fix; ~7.5s (out-point) pre-fix
  });

  test('content-driven hold: the subtitle still crawls from the entrance settle', async ({
    app,
  }) => {
    await app.newProject('HoldEntryCD');
    await authorEnteringGraphic(app, 'content-driven');
    await app.openPreviewModal();
    await app.play();
    await expectSubtitleCrawlsWithin(app, 1500);
  });
});
