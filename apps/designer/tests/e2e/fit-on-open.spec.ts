import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * B-035 — the opened composition must be fit + centered in the canvas viewport on open,
 * WITHOUT a manual Fit press. The invariant: after open the zoom already equals the fit
 * zoom, so pressing Fit is a no-op. A default 1920×1080 composition in the test viewport
 * (1280×720) fits BELOW 100%, so "not 100%" both waits for fit-on-open to apply and
 * proves it ran (the bug left the default 100%). Covers the project-open AND the
 * template-load paths (both set a new scene — the paths the bug hit).
 */

async function expectFitOnOpen(app: DesignerApp): Promise<void> {
  const readout = app.page.getByTestId('zoom-readout');
  // Wait until fit-on-open has applied (a >viewport comp fits below 100%); this is the
  // assertion the bug failed — it left the default 100% until a manual Fit.
  await expect(readout).not.toHaveText('100%');
  const openPct = (await readout.textContent())?.trim() ?? '';
  // Pressing Fit must not change the zoom — it was already fit on open.
  await app.page.getByRole('button', { name: 'Fit' }).click();
  await expect(readout).toHaveText(openPct);
}

test.describe('B-035 — fit-on-open', () => {
  test('a NEW project is fit + centered on open (Fit is a no-op)', async ({ app }) => {
    await app.goto();
    await app.newProject();
    await expectFitOnOpen(app);
  });

  test('a bundled TEMPLATE is fit + centered on open (Fit is a no-op)', async ({ app }) => {
    await app.goto();
    await app.page.getByTestId('starter-card').first().click();
    await app.expectStudio();
    await expectFitOnOpen(app);
  });
});
