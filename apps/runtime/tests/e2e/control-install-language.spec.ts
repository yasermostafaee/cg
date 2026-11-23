import { expect, test } from './fixtures/runtime.js';

test('uses each new setup language for scopes without a saved choice', async ({ app }) => {
  const { page } = app;
  await page.addInitScript(() => {
    const seed = sessionStorage.getItem('cg.test.install-language') ?? 'ar';
    Object.assign(globalThis, { __CG_INSTALL_LANGUAGE__: seed });
  });
  await page.reload();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'ar');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'فتح إعداد المحطة', exact: true }).click();
  await page.getByRole('tab', { name: 'عام', exact: true }).click();
  const editInterface = page.locator('#cg-interface-language');
  const editFeedback = page.locator('#cg-feedback-language');
  await expect(editInterface).toHaveValue('ar');
  await expect(editFeedback).toHaveValue('ar');
  await editInterface.selectOption('en');
  await page.evaluate(() => sessionStorage.setItem('cg.test.install-language', 'fa'));
  await page.reload();

  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).toHaveAttribute('dir', 'ltr');
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await expect(editInterface).toHaveValue('en');
  await expect(editFeedback).toHaveValue('fa');

  await editFeedback.selectOption('ar');
  await page.evaluate(() => sessionStorage.setItem('cg.test.install-language', 'en'));
  await page.reload();
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await expect(editInterface).toHaveValue('en');
  await expect(editFeedback).toHaveValue('ar');
});
