import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './fixtures/designer.js';

/**
 * Opt-in source-frame generator for the landing gallery's accelerated WebM
 * previews. Frames are sampled more slowly than their final 12 fps playback,
 * so a few seconds of real template motion become a concise ~2.2 s summary.
 *
 * `CG_STARTER_MOTION_FRAMES=<temp dir> playwright test starter-motion-previews`
 */
const OUT = process.env.CG_STARTER_MOTION_FRAMES;
test.skip(OUT === undefined || OUT === '', 'only when regenerating starter motion previews');

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

test('samples every starter into a short accelerated preview', async ({ app }) => {
  test.setTimeout(360_000);
  const root = OUT as string;
  await app.page.setViewportSize({ width: 1600, height: 1000 });

  for (const [id, label] of starters) {
    const out = path.join(root, id);
    fs.mkdirSync(out, { recursive: true });
    await app.goto();
    await app.page.getByTestId('starter-card').filter({ hasText: label }).click();
    await app.expectStudio();
    await app.openPreviewModal();
    await app.play();

    const stage = app.previewFrame.locator('.cg-stage').first();
    await expect(stage).toBeVisible();
    // Capture the stable iframe viewport, not the animated stage node itself:
    // locator screenshots wait for their target's geometry to settle, which an
    // authored transform animation deliberately never promises.
    const frameViewport = app.previewDialog.locator('iframe');
    for (let frame = 0; frame < 26; frame += 1) {
      // Show a sequence/list change in the condensed preview when Next exists.
      if (frame === 8 || frame === 15) {
        const next = app.previewDialog.getByRole('button', { name: /Next/ });
        if ((await next.count()) > 0 && (await next.isEnabled())) await next.click();
      }
      const file = path.join(out, `frame-${String(frame).padStart(3, '0')}.png`);
      await frameViewport.screenshot({ path: file, animations: 'allow' });
      await app.page.waitForTimeout(90);
    }
    expect(fs.readdirSync(out).filter((name) => name.endsWith('.png'))).toHaveLength(26);
  }
});
