import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './fixtures/designer.js';

/**
 * D-179 — regenerate landing posters from the real Designer renderer. The test
 * is opt-in so regular E2E never writes tracked files:
 * `CG_STARTER_POSTERS=<public/starters> playwright test starter-posters`.
 */
const OUT = process.env.CG_STARTER_POSTERS;
test.skip(OUT === undefined || OUT === '', 'only when regenerating starter posters');

const starters = [
  ['azadegan-table', 'جدول لیگ آزادگان ایران'],
  ['iran-weather-pages', 'آب‌وهوای مراکز استان‌ها'],
  ['iran-weather-forecast', 'پیش‌بینی چندروزهٔ هوا'],
  ['image-folder-sequence', 'توالی تصاویر پوشه'],
  ['countdown-steps', 'شمارش معکوس مرحله‌ای'],
  ['multibox', 'میزگرد چندقابه'],
] as const;

test('renders the D-179 poster set from authored scenes', async ({ app }) => {
  test.setTimeout(120_000);
  const out = OUT as string;
  fs.mkdirSync(out, { recursive: true });
  await app.page.setViewportSize({ width: 1600, height: 1000 });

  for (const [id, label] of starters) {
    await app.goto();
    await app.page.getByTestId('starter-card').filter({ hasText: label }).click();
    await app.expectStudio();
    await app.openPreviewModal();
    await app.play();
    await app.page.waitForTimeout(750);

    const stage = app.previewFrame.locator('.cg-stage').first();
    await expect(stage).toBeVisible();
    const file = path.join(out, `${id}.png`);
    await stage.screenshot({ path: file, animations: 'disabled' });
    expect(fs.statSync(file).size, id).toBeGreaterThan(5000);
  }
});
