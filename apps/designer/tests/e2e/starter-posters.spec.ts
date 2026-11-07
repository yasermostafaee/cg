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
  ['logo-bug', 'لوگو شبکه'],
  ['title', 'عنوان معرفی'],
  ['ticker', 'زیرنویس حرکت افقی'],
  ['irib-news', 'زیرنویس با ساعت'],
  ['sequence', 'زیرنویس حرکت عمودی'],
  ['image-folder-sequence', 'نمایش تلاوت قرآن'],
  ['multibox', 'چهارقاب'],
  ['countdown-steps', 'شمارش معکوس اذان'],
  ['iran-weather-pages', 'آب‌وهوای مراکز استان‌ها'],
  ['iran-weather-forecast', 'پیش‌بینی چندروزهٔ هوا'],
  ['iran-weather-cards', 'آب‌وهوای شهرها — کارت‌های تصویری'],
  ['iran-premier-league', 'جدول لیگ برتر ایران'],
] as const;

test('renders the complete production poster set from authored scenes', async ({ app }) => {
  test.setTimeout(240_000);
  const out = OUT as string;
  const runtimeErrors: string[] = [];
  app.page.on('pageerror', (error) => runtimeErrors.push(error.stack ?? error.message));
  const requested = process.env.CG_STARTER_CAPTURE_IDS?.split(',').filter(Boolean);
  if (requested !== undefined)
    expect(requested.every((id) => starters.some(([candidate]) => candidate === id))).toBe(true);
  fs.mkdirSync(out, { recursive: true });
  await app.page.setViewportSize({ width: 1600, height: 1000 });

  for (const [id, label] of starters) {
    if (requested !== undefined && !requested.includes(id)) continue;
    await app.goto();
    await app.page.getByTestId('starter-card').filter({ hasText: label }).click();
    await app.expectStudio();
    if (id === 'ticker' || id === 'irib-news') {
      // A poster represents the populated band, not the first few pixels entering
      // from off screen. Static authoring uses the same fixed nested measurement.
      await app.scrubToFrame(60);
      const stage = app.canvasFrame.locator('.cg-stage').first();
      await expect(stage).toBeVisible();
      const file = path.join(out, `${id}.png`);
      await stage.screenshot({ path: file, animations: 'disabled' });
      expect(fs.statSync(file).size, id).toBeGreaterThan(5000);
      continue;
    }
    await app.openPreviewModal();
    await app.play();
    // The league table intentionally staggers its rows. Capture after that
    // entrance has settled so the landing poster represents the complete design.
    await app.page.waitForTimeout(1800);
    if (id === 'iran-premier-league') {
      await expect(app.previewDialog.getByLabel('Preview frame')).toContainText('110 / 200');
    }

    const stage = app.previewFrame.locator('.cg-stage').first();
    await expect(stage, `${id}: ${runtimeErrors.join('\n')}`).toBeVisible();
    const file = path.join(out, `${id}.png`);
    await stage.screenshot({ path: file, animations: 'disabled' });
    expect(fs.statSync(file).size, id).toBeGreaterThan(5000);
  }
});
