import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * B-035 — the opened composition must be fit AND CENTERED on open, without a manual Fit.
 * The bug was a CENTERING failure (zoom correct, frame in a corner) on the warm switch
 * path. So these assert the SCROLL is centered (not a corner) and that pressing Fit is a
 * no-op (it was already fit+centered) — including the composition-switch path, where
 * `scene.id` is stable so the fit must be keyed on the active composition.
 */

interface Scroll {
  l: number;
  t: number;
}
function readScroll(app: DesignerApp): Promise<Scroll> {
  return app.page
    .getByTestId('canvas-viewport')
    .evaluate((el) => ({ l: (el as HTMLElement).scrollLeft, t: (el as HTMLElement).scrollTop }));
}

/** Assert the canvas is fit + centered: zoom ≠ default 100%, scroll off the corner, and
 *  pressing Fit moves neither zoom nor scroll (already fit+centered on open). */
async function expectFitAndCentered(app: DesignerApp): Promise<void> {
  const readout = app.page.getByTestId('zoom-readout');
  await expect(readout).not.toHaveText('100%'); // fit applied (a >viewport comp fits below 100%)
  // Centered: a symmetric 2× pasteboard centered in the viewport scrolls off the corner.
  await expect.poll(() => readScroll(app).then((s) => s.l > 0 && s.t > 0)).toBe(true);

  const before = await readScroll(app);
  const zoomBefore = await readout.textContent();
  await app.page.getByRole('button', { name: 'Fit' }).click();
  await expect(readout).toHaveText(zoomBefore ?? ''); // zoom unchanged
  const after = await readScroll(app);
  // Centering didn't move on Fit → it was already centered on open (the B-035 symptom was
  // a corner that Fit then fixed with the SAME zoom).
  expect(Math.abs(after.l - before.l)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.t - before.t)).toBeLessThanOrEqual(1);
}

test.describe('B-035 — fit + center on open', () => {
  test('a NEW project is fit + centered on open (Fit is a no-op)', async ({ app }) => {
    await app.goto();
    await app.newProject();
    await expectFitAndCentered(app);
  });

  test('a bundled TEMPLATE is fit + centered on open (Fit is a no-op)', async ({ app }) => {
    await app.goto();
    await app.page.getByTestId('starter-card').first().click();
    await app.expectStudio();
    await expectFitAndCentered(app);
  });

  test('switching to another (same-resolution) composition re-fits + centers — no corner', async ({
    app,
  }) => {
    await app.goto();
    await app.newProject();
    await expectFitAndCentered(app);
    // Scroll away so a stale scroll WOULD leak if the switch didn't re-center.
    await app.page.getByTestId('canvas-viewport').evaluate((el) => {
      (el as HTMLElement).scrollLeft = 0;
      (el as HTMLElement).scrollTop = 0;
    });
    // Switch the ACTIVE COMPOSITION (scene.id unchanged) → must still re-fit + center.
    await app.newComposition('Lower Third 2');
    await expectFitAndCentered(app);
  });
});
