import { expect, test } from './fixtures/runtime.js';

const locales = [
  {
    language: 'fa',
    close: 'بستن',
    tab: 'قاب‌های زنده',
    headline: 'بریج هیچ قاب زنده‌ای روی لایه قرار نداده است.',
    detail: 'وقتی ردیفی با قالب دارای قاب زنده روی آنتن برود، لایه‌هایش اینجا نمایش داده می‌شوند.',
  },
  {
    language: 'ar',
    close: 'إغلاق',
    tab: 'الإطارات الحية',
    headline: 'لم يخصّص CG Bridge حاليًا أي طبقة لإطار حيّ.',
    detail: 'تظهر الطبقات هنا عند إرسال صف يستخدم قالباً يحتوي على إطارات حية إلى البث.',
  },
] as const;

for (const locale of locales) {
  test('empty Live plates follows the ' + locale.language + ' interface', async ({ app }) => {
    const { page } = app;
    // The standard Runtime fixture starts with two plates on this row.
    await page
      .locator('[data-item-id="item-irib-news"]')
      .getByRole('button', { name: 'CLEAR', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: /^Clear / })
      .getByRole('button', { name: 'Clear layer', exact: true })
      .click();
    await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
    const settings = page.getByRole('dialog');
    await settings.getByRole('tab', { name: 'General', exact: true }).click();
    await page.locator('#cg-interface-language').selectOption(locale.language);
    await expect(page.locator('#cg-feedback-language')).toHaveValue('en');
    await settings.getByRole('button', { name: locale.close, exact: true }).click();

    await page.getByRole('tab', { name: locale.tab, exact: true }).click();
    const empty = page.locator('[data-live-layers-known="true"]');
    await expect(empty.getByText(locale.headline, { exact: true })).toBeVisible();
    await expect(empty.getByText(locale.detail, { exact: true })).toBeVisible();
    await expect(empty).toHaveCSS('direction', 'rtl');
  });
}
