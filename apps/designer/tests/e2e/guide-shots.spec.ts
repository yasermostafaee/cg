import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './fixtures/designer.js';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B3 — **THE INSTALL GUIDE'S SCREENSHOT OF CG DESIGNER, TAKEN FROM THE REAL
 * APP**: a starter template open in the studio, with `Export .vcg` in the composition's action bar.
 *
 * It runs only when `CG_GUIDE_SHOTS` names a folder, and writes its PNG there
 * (`docs/release/<version>/img/`, then built into the guide by `tools/release`); otherwise it is
 * skipped, so the suite pays nothing for it. The Designer holds no address, token or password.
 */

const OUT = process.env.CG_GUIDE_SHOTS;
test.skip(OUT === undefined || OUT === '', 'only when building the install guide (CG_GUIDE_SHOTS)');
// Two device pixels per CSS pixel: the picture is printed small, and stays sharp.
test.use({ deviceScaleFactor: 2 });

test('B3 — CG Designer: a template open, Export (.vcg) in its action bar', async ({ app }) => {
  const out = OUT as string;
  fs.mkdirSync(out, { recursive: true });
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole('button', { name: /Guest Title/ }).click();
  await app.expectStudio();
  const bar = app.compositionActionBar;
  // Its accessible name is `Export .vcg`; what it SHOWS is `Export (.vcg)` — the guide quotes that.
  const exportButton = bar.getByRole('button', { name: 'Export .vcg', exact: true });
  await expect(exportButton).toHaveText('Export (.vcg)');
  await exportButton.hover();
  await page.waitForTimeout(400);

  // The Compositions panel, from its heading down to the action bar at its foot.
  const [headingBox, barBox] = await Promise.all([
    page.getByText('Compositions', { exact: true }).boundingBox(),
    bar.boundingBox(),
  ]);
  if (headingBox === null || barBox === null) throw new Error('the panel and its bar render');
  const x = barBox.x - 8;
  const y = headingBox.y - 12;
  const file = path.join(out, '4-designer-export.png');
  await page.screenshot({
    path: file,
    clip: { x, y, width: barBox.width + 16, height: barBox.y + barBox.height + 8 - y },
  });
  expect(fs.statSync(file).size).toBeGreaterThan(1000);
});
