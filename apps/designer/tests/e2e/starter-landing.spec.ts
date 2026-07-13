import { test, expect } from './fixtures/designer.js';

/**
 * D-119 — the starter catalog is exactly the five professional Persian
 * broadcast demos, in landing order with the composite leading, none carries
 * the "New" badge (owner decision), and picking one loads its scene into the
 * Studio (the designer-shell "Operator picks a starter" scenario).
 */

const EXPECTED_LABELS = [
  'میان‌برنامهٔ خبر — News Composite',
  'نوار اخبار — News Ticker',
  'آرم شبکه — Logo Sting',
  'زیرنویس معرفی — Guest Title',
  'توالی خبر — Headline Rotator',
];

test.describe('D-119 — starter landing catalog', () => {
  test('shows exactly the five D-119 starters, in order, with posters and no New badge', async ({
    app,
  }) => {
    await app.goto();
    const cards = app.page.getByTestId('starter-card');
    await expect(cards).toHaveCount(EXPECTED_LABELS.length);
    for (const [i, label] of EXPECTED_LABELS.entries()) {
      await expect(cards.nth(i)).toContainText(label);
      // Every card ships a real poster render (no PREVIEW fallback text).
      await expect(cards.nth(i).locator('img')).toBeVisible();
    }
    await expect(app.page.getByText('New', { exact: true })).toHaveCount(0);
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
