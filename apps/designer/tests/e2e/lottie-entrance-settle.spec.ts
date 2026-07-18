import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * D-125 Phase 3a — the Lottie's intro DERIVES the composition's entrance settle, so an
 * overlay placed on top of Lottie furniture starts when the furniture has settled, with
 * NO manual trim anywhere. And the Inspector shows the timing needed to author against it.
 *
 * Pre-fix a Lottie contributed nothing to `entranceSettleFrame` (it carries no keyframes),
 * so the settle was the out-point verbatim, the intro leg collapsed, and the ticker crawled
 * IMMEDIATELY at play — on top of furniture still animating on. The clip below has a
 * deliberately LONG intro (frames 0..60 @ fr 30 = 2.0s) so the two behaviours are hundreds
 * of milliseconds apart and a real-timer E2E can separate them: we assert the crawl has NOT
 * started at 1.2s (fails pre-fix) and HAS started by 3s (fails if the settle over-shoots).
 */

/** A furniture clip with a 2-second intro: fr 30, intro-end marker at frame 60. */
const LONG_INTRO = JSON.stringify({
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 120,
  w: 400,
  h: 200,
  nm: 'long-intro-furniture',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'bar',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        // The intro animates the bar ON across frames 0..60 — the 2s entrance.
        s: {
          a: 1,
          k: [
            {
              t: 0,
              s: [0, 0, 100],
              i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] },
              o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] },
            },
            { t: 60, s: [100, 100, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            {
              ty: 'rc',
              d: 1,
              s: { a: 0, k: [300, 80] },
              p: { a: 0, k: [0, 0] },
              r: { a: 0, k: 0 },
            },
            { ty: 'fl', c: { a: 0, k: [1, 0.2, 0.2, 1] }, o: { a: 0, k: 100 }, r: 1 },
            {
              ty: 'tr',
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
            },
          ],
          nm: 'Group',
        },
      ],
      ip: 0,
      op: 120,
      st: 0,
      bm: 0,
    },
  ],
  markers: [
    { tm: 60, cm: 'intro-end', dr: 0 },
    { tm: 100, cm: 'outro-start', dr: 0 },
  ],
});

/** Import a bodymovin JSON via Project Assets and drag it onto the canvas. */
async function importAndPlaceLottie(
  app: DesignerApp,
  filename: string,
  json: string,
): Promise<void> {
  await app.page.getByRole('button', { name: 'Project assets', exact: true }).click();
  await app.page.getByRole('button', { name: 'Add asset', exact: true }).click();
  const chooser = app.page.waitForEvent('filechooser');
  await app.page.getByRole('menuitem', { name: /Lottie/ }).click();
  await (
    await chooser
  ).setFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(json) });
  const panel = app.page.locator('aside[aria-label="Project assets"]');
  const tile = panel
    .locator('[draggable="true"]')
    .filter({ hasText: filename.replace(/\.json$/, '') })
    .first();
  await expect(tile).toBeVisible();
  await tile.dragTo(app.canvas, { targetPosition: { x: 220, y: 130 } });
}

/**
 * Lottie furniture + a subtitle ticker on top. NOTHING is keyframed by hand and NO
 * content-start marker is placed — the settle must come from the Lottie alone. The
 * timeline is stretched so the out-point sits far past the derived settle (no clamp).
 */
async function authorLottieFurnitureWithOverlay(app: DesignerApp): Promise<void> {
  await importAndPlaceLottie(app, 'longintro.json', LONG_INTRO);
  await app.setSceneDuration(500);
  await app.addTicker({ x: 140, y: 210 });
  await app.addOutPoint();
  await app.setPlayoutTiming('auto-out');
  await app.setHoldSource('content-driven');
}

test.describe('D-125 Phase 3a — the entrance settle derives from the Lottie intro', () => {
  test('the overlay ticker appears AFTER the furniture settles, with no trim applied', async ({
    app,
  }) => {
    await app.newProject('LottieSettle');
    await authorLottieFurnitureWithOverlay(app);

    await app.openPreviewModal();
    await app.play();

    const track = app.previewFrame.locator('.cg-ticker-track').first();
    await expect(track).toBeAttached(); // the ticker IS rendered, so the next check is meaningful

    // PRE-FIX this crawled at ~0s (the intro leg collapsed and content started at play).
    await app.page.waitForTimeout(1200);
    expect((await track.getAttribute('style')) ?? '').not.toContain('translateX');

    // …and it MUST start once the 2s Lottie intro completes — not be stranded to the out-point.
    await expect
      .poll(async () => (await track.getAttribute('style')) ?? '', { timeout: 3000 })
      .toContain('translateX');
  });

  test('the Inspector shows the clip timing in BOTH frame spaces, no hand conversion', async ({
    app,
  }) => {
    await app.newProject('LottieTiming');
    await importAndPlaceLottie(app, 'longintro.json', LONG_INTRO);

    // The placed Lottie is selected — its inspector shows the clip totals and the phase
    // breakdown in animation frames, seconds, AND this composition's frames.
    await expect(app.inspector.getByText(/120 f @ 30 fps/)).toBeVisible();
    await expect(app.inspector.getByText(/intro 0–60/)).toBeVisible();
    await expect(app.inspector.getByText(/frame \d+ of this comp/)).toBeVisible();
  });
});
