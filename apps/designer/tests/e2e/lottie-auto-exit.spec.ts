import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * D-125 Phase 3b-2 — an AUTO-exit plays the element outro (the seam is no longer
 * bypassed). Phase 2's seam covered only the operator exits (`out()`/`stop()`); a
 * composition that ended its OWN hold went through `PlayoutController.startOutro()`
 * and snapped the furniture off — the owner reproduced it by eye: manual mode closed
 * correctly, auto mode snapped.
 *
 * The clip below carries a deliberately LONG outro (frames 40..120 @ fr 30 ≈ 2.7 s) so
 * the two behaviours are seconds apart under real timers: pre-fix the stage cleared
 * ~1 s after play (background outro only); post-fix it must still be on air ~1.8 s in
 * (the element outro is playing) and clear afterwards.
 */

/** Furniture: short intro (0..20), hold at 20, LONG outro (40..120 ≈ 2.7 s). */
const LONG_OUTRO = JSON.stringify({
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 120,
  w: 400,
  h: 200,
  nm: 'long-outro-furniture',
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
        // ON across 0..20, OFF across 40..120 (the long authored exit).
        s: {
          a: 1,
          k: [
            {
              t: 0,
              s: [0, 0, 100],
              i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] },
              o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] },
            },
            { t: 20, s: [100, 100, 100] },
            {
              t: 40,
              s: [100, 100, 100],
              i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] },
              o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] },
            },
            { t: 120, s: [0, 0, 100] },
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
    { tm: 20, cm: 'intro-end', dr: 0 },
    { tm: 40, cm: 'outro-start', dr: 0 },
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

test.describe('D-125 Phase 3b-2 — auto-exit plays the element outro', () => {
  test('an auto-out composition spends its Lottie outro on air before clearing (no snap-off)', async ({
    app,
  }) => {
    await app.newProject('LottieAutoExit');
    // D-151 — this scenario DELIBERATELY pairs a 4 s clip with a 1 s host (the outro plays
    // on EXIT, outside the timeline), which the add-time duration guard now interrupts.
    // Place through a fitting host, then shrink back: the guard is ADD-time only (no
    // re-check ever fires on an element already accepted), so the end state is byte-equal
    // to the original scenario and every sub-second timing below stays valid.
    await app.setSceneDuration(250);
    await importAndPlaceLottie(app, 'longoutro.json', LONG_OUTRO);
    await app.setSceneDuration(50);
    // auto-out with the default zero hold: the composition ends its OWN hold right at
    // the out-point (seeded at 75% of the 1 s timeline ⇒ exit ≈ 0.75 s after play) —
    // the exact path that used to bypass the seam. No stop()/out() is ever sent.
    await app.setPlayoutTiming('auto-out');

    await app.openPreviewModal();
    await app.play();
    const body = app.previewFrame.locator('body');
    await expect(body).not.toHaveClass(/cg-pending/); // on air

    // PRE-FIX: background-only exit cleared the stage ≈1 s after play. The 2.7 s
    // element outro must keep it on air well past that.
    await app.page.waitForTimeout(1800);
    await expect(body).not.toHaveClass(/cg-pending/); // still on air — outro playing

    // …and the exit completes on its own: element outro → background → CLEARED.
    await expect(body).toHaveClass(/cg-pending/, { timeout: 10_000 });
  });
});
