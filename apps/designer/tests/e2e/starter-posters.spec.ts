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
  ['irib-news', 'میان‌برنامهٔ خبر — News Composite'],
  ['ticker', 'نوار اخبار — News Ticker'],
  ['logo-bug', 'آرم شبکه — Logo Sting'],
  ['title', 'زیرنویس معرفی — Guest Title'],
  ['sequence', 'توالی خبر — Headline Rotator'],
  ['iran-premier-league', 'جدول لیگ برتر ایران'],
  ['iran-weather-pages', 'آب‌وهوای مراکز استان‌ها'],
  ['iran-weather-forecast', 'پیش‌بینی چندروزهٔ هوا'],
  ['image-folder-sequence', 'توالی تصاویر پوشه'],
  ['countdown-steps', 'شمارش معکوس مرحله‌ای'],
  ['multibox', 'میزگرد چندقابه'],
] as const;

test('renders the complete production poster set from authored scenes', async ({ app }) => {
  test.setTimeout(240_000);
  const out = OUT as string;
  fs.mkdirSync(out, { recursive: true });
  await app.page.setViewportSize({ width: 1600, height: 1000 });

  for (const [id, label] of starters) {
    await app.goto();
    await app.page.getByTestId('starter-card').filter({ hasText: label }).click();
    await app.expectStudio();
    await app.openPreviewModal();
    await app.play();
    // The league table intentionally staggers all 18 rows. Capture after that
    // entrance has settled so the landing poster represents the complete design.
    await app.page.waitForTimeout(1800);

    const stage = app.previewFrame.locator('.cg-stage').first();
    await expect(stage).toBeVisible();
    const file = path.join(out, `${id}.png`);
    await stage.screenshot({ path: file, animations: 'disabled' });
    expect(fs.statSync(file).size, id).toBeGreaterThan(5000);
  }
});
