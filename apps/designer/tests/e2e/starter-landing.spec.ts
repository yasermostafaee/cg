import { test, expect } from './fixtures/designer.js';

/**
 * D-119 + D-179 — the starter catalog is the audited Persian starter set,
 * in landing order with the composite leading, none carries
 * the "New" badge (owner decision), and picking one loads its scene into the
 * Studio (the designer-shell "Operator picks a starter" scenario).
 */

const EXPECTED_LABELS = [
  'میان‌برنامهٔ خبر — News Composite',
  'نوار اخبار — News Ticker',
  'آرم شبکه — Logo Sting',
  'زیرنویس معرفی — Guest Title',
  'توالی خبر — Headline Rotator',
  'جدول لیگ برتر ایران',
  'آب‌وهوای مراکز استان‌ها',
  'پیش‌بینی چندروزهٔ هوا',
  'توالی تصاویر پوشه',
  'شمارش معکوس مرحله‌ای',
  'میزگرد چندقابه',
];

test.describe('D-119 + D-179 — starter landing catalog', () => {
  test('shows the audited Persian starters in order, with posters and no New badge', async ({
    app,
  }) => {
    await app.goto();
    const cards = app.page.getByTestId('starter-card');
    await expect(cards).toHaveCount(EXPECTED_LABELS.length);
    for (const [i, label] of EXPECTED_LABELS.entries()) {
      await expect(cards.nth(i)).toContainText(label);
      // Every card ships a real poster render (no PREVIEW fallback text).
      await expect(cards.nth(i).locator('img')).toBeVisible();
      await expect(cards.nth(i).locator('video')).toHaveAttribute('preload', 'none');
    }
    await expect(app.page.getByText('New', { exact: true })).toHaveCount(0);
  });

  test('plays a short silent preview on hover and resets it when the pointer leaves', async ({
    app,
  }) => {
    await app.goto();
    const card = app.page.getByTestId('starter-card').first();
    const video = card.getByTestId('starter-motion-preview');
    await card.hover();
    await expect
      .poll(() => video.evaluate((node) => !(node as HTMLVideoElement).paused))
      .toBe(true);
    await expect(video).toHaveCSS('opacity', '1');

    await app.page.getByRole('button', { name: 'New project' }).hover();
    await expect
      .poll(() =>
        video.evaluate(
          (node) =>
            (node as HTMLVideoElement).paused && (node as HTMLVideoElement).currentTime === 0,
        ),
      )
      .toBe(true);
  });

  /**
   * `DESIGNER-FIX-0905` — the one thing the five starters differ in, playout behaviour, is a
   * comparable BADGE on each card, derived from the scene, above one line of description.
   */
  test('every card carries a playout badge, and the badges differ where the templates do', async ({
    app,
  }) => {
    await app.goto();
    const badges = app.page.getByTestId('starter-playout');
    await expect(badges).toHaveCount(EXPECTED_LABELS.length);
    await expect(badges.nth(0)).toHaveText('holds until stopped, then exits');
    await expect(badges.nth(2)).toContainText(/loops every ~10 s/);
    await expect(badges.nth(3)).toHaveText('auto-out after 6 s');
    await expect(badges.nth(4)).toHaveText('content-driven hold');
  });

  test('the landing carries the APASAI brand and website link', async ({ app }) => {
    await app.goto();
    await expect(app.page).toHaveTitle('APASAI CG DESIGNER');
    const brand = app.page.getByTestId('apasai-brand');
    await expect(brand).toBeVisible();
    await expect(brand).toContainText('APASAI');
    await expect(brand).toHaveAttribute('href', 'https://apasai.com/');
    await expect(brand).toHaveAttribute('target', '_blank');
    // CONTROL — the landing rendered (its New project door), and an opened project has its toolbar.
    await expect(app.page.getByRole('button', { name: 'New project' })).toBeVisible();
    await app.page.getByTestId('starter-card').first().click();
    await app.expectStudio();
    await expect(app.page.getByTestId('project-name')).toBeVisible();
    await expect(app.page.getByTestId('apasai-brand')).toHaveCount(0);
  });

  test('picking the composite starter loads it into the Studio', async ({ app }) => {
    await app.goto();
    await app.page.getByTestId('starter-card').first().click();
    await app.expectStudio();
  });

  /**
   * D-119 polish — a bound field's base text is its real Persian default, not a
   * raw `{{token}}`. The operator opening a starter sees broadcast copy on the
   * canvas; the same string is the on-air fallback when no value is sent.
   */
  test('a loaded starter shows real Persian copy on the canvas, never a raw {{token}}', async ({
    app,
  }) => {
    await app.goto();
    // «آرم شبکه — Logo Sting» — its wordmark + sub-tag are both bound fields.
    await app.page.getByTestId('starter-card').nth(2).click();
    await app.expectStudio();

    await expect(app.canvasFrame.locator('[data-cg-element-id="lb-word"]')).toHaveText('شبکه جدید');
    await expect(app.canvasFrame.locator('[data-cg-element-id="lb-tag"]')).toHaveText('پخش زنده');
    await expect(app.canvasFrame.locator('body')).not.toContainText('{{');
  });
});
