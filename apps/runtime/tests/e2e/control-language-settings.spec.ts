import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

async function openGeneral(page: Page): Promise<void> {
  await page
    .getByRole('button', {
      name: /^(Open Station setup|باز کردن تنظیمات ایستگاه|فتح إعداد المحطة)$/,
    })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /^(General|عمومی|عام)$/ }).click();
}

test('chooses English chrome and Persian command outcomes independently, and remembers them', async ({
  app,
}) => {
  const { page } = app;
  await openGeneral(page);
  const languageCard = page.getByRole('region', { name: 'Language', exact: true });
  await expect(languageCard.getByRole('combobox')).toHaveCount(2);
  await expect(languageCard.getByRole('button')).toHaveCount(0);
  await expect(page.locator('#cg-interface-language')).toHaveValue('en');
  await expect(page.locator('#cg-feedback-language')).toHaveValue('en');
  await page.locator('#cg-feedback-language').selectOption('fa');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('tab', { name: 'General', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  const row = app.layerRow(96);
  await row.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(page.getByRole('status', { name: 'عملیات موفق' })).toContainText('روی آنتن رفت.');
  await expect(row.getByRole('button', { name: 'STOP', exact: true })).toBeEnabled();

  await page.reload();
  await openGeneral(page);
  await expect(page.locator('#cg-interface-language')).toHaveValue('en');
  await expect(page.locator('#cg-feedback-language')).toHaveValue('fa');
});

test('keeps English controls when the Play refusal uses Arabic', async ({ app }) => {
  const { page } = app;
  await openGeneral(page);
  await page.locator('#cg-feedback-language').selectOption('ar');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => {
    (window as Window & { CG_E2E_REFUSE_NEXT_TAKE?: unknown }).CG_E2E_REFUSE_NEXT_TAKE = {
      code: 'amcp-403',
      command: 'PLAY 1-60 DECKLINK DEVICE 1',
      plateId: 'plate-1',
      sourceName: 'Studio One',
    };
  });
  const row = app.layerRow(96);
  await row.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(row.locator('[data-take-refusal]')).toContainText(
    'هذا المدخل غير موجود على الخادم أو قيد الاستخدام.',
  );
  await expect(row.getByRole('button', { name: 'PLAY', exact: true })).toBeVisible();
  await expect(row).toContainText('ERROR');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('mirrors settings and layers for Persian and Arabic, and isolates a Latin input', async ({
  app,
}) => {
  const { page } = app;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Show monitors', exact: true }).click();
  await openGeneral(page);
  await expect(page.getByRole('region', { name: 'Lunar Hijri correction' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Lunar Hijri correction' })).toHaveCount(0);

  await page.locator('#cg-interface-language').selectOption('fa');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('زبان رابط کاربری', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'عمومی', exact: true })).toBeVisible();
  await expect(page.locator('#cg-interface-language')).toHaveCSS('direction', 'rtl');
  const ownLabel = page.locator('label[for="cg-interface-language"]');
  await expect(ownLabel).toHaveCSS('direction', 'rtl');
  const build = page.getByTestId('app-build');
  await expect(build).toContainText('شناسهٔ ساخت');
  const identifier = build.locator('bdi[dir="ltr"]');
  await expect(identifier).toHaveText(/^[a-f0-9]{7,12}$/);
  await expect(identifier).toHaveCSS('direction', 'ltr');

  await page.getByRole('dialog').getByRole('button', { name: 'بستن', exact: true }).click();
  const row = app.layerRow(96);
  await expect(row).toHaveCSS('direction', 'rtl');
  await expect(row.getByRole('button', { name: 'پخش', exact: true })).toBeVisible();
  const header = page.locator('[data-verb-head]').first();
  await expect(header).toHaveCSS('direction', 'rtl');

  await openGeneral(page);
  await page.locator('#cg-interface-language').selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('لغة الواجهة', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'عام', exact: true })).toBeVisible();
  await expect(page.locator('#cg-feedback-language')).toHaveValue('en');

  await page.getByRole('dialog').getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expect(app.layerRow(98)).toContainText('محظور');
  await expect(app.layerRow(99)).toContainText('بث محاكى');
  await expect(page.locator('[data-rehearsal-caption]')).toContainText('معاينة');
  await expect(page.locator('[data-pgm-screen]').first()).toContainText('لا توجد إشارة عودة');
  await expect(page.getByText(/صفوف على البث/).first()).toBeVisible();
  await expect(page.getByText('طبقات على PVW', { exact: true })).toBeVisible();
  for (const label of ['تشغيل', 'إيقاف', 'التالي', 'في PVW', 'مسح']) {
    await expect(page.locator('[data-verb-head]').getByText(label, { exact: true })).toBeVisible();
  }
  await openGeneral(page);

  const tabs = page.getByRole('dialog').getByRole('tablist');
  await tabs.getByRole('tab', { name: 'الاتصال', exact: false }).click();
  const technical = page.getByRole('dialog').locator('input[dir="ltr"]').first();
  await expect(technical).toHaveCSS('direction', 'ltr');
});

test('keeps delimiter settings until the reset warning is confirmed', async ({ app }) => {
  const { page } = app;
  await page.evaluate(() => {
    const state = window as Window & { resetWrites?: number };
    state.resetWrites = 0;
    const send = window.cg.delimiters.set;
    window.cg.delimiters.set = (args) => {
      state.resetWrites = (state.resetWrites ?? 0) + 1;
      return send(args);
    };
  });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await page.getByRole('tab', { name: 'Text file delimiters', exact: true }).click();
  const reset = page.getByRole('button', { name: 'Reset delimiters to defaults', exact: true });
  const warning = page.getByRole('dialog', { name: 'Reset delimiters to defaults?' });
  await reset.click();
  await expect(warning).toContainText('Graphics that use them may be affected');
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { resetWrites?: number }).resetWrites)).toBe(
    0,
  );

  await reset.click();
  await warning.getByRole('button', { name: 'Reset to defaults', exact: true }).click();
  await expect(warning).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { resetWrites?: number }).resetWrites)).toBe(
    1,
  );
});
