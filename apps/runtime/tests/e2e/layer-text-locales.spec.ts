import { test, expect } from './fixtures/runtime.js';

const languages = {
  fa: {
    layers: 'لایه‌ها',
    station: 'لایه‌های ایستگاه',
    clear: 'پاک کردن',
    clearTitle: 'لایه و منبع آن فوراً و بدون اجرای افکت خروج پاک می‌شوند.',
    empty: 'ردیف خالی است',
    channel: 'کانال',
    layer: 'لایهٔ',
    tech: 'ffmpeg',
  },
  ar: {
    layers: 'الطبقات',
    station: 'طبقات المحطة',
    clear: 'مسح',
    clearTitle: 'تُمسح الطبقة ويُزال مصدرها فورًا من دون حركة خروج.',
    empty: 'الصف فارغ',
    channel: 'القناة',
    layer: 'الطبقة',
    tech: 'ffmpeg',
  },
};

for (const [locale, words] of Object.entries(languages)) {
  test(`Layer controls and Station layers follow the ${locale} interface`, async ({ app }) => {
    const { page } = app;
    await page.addInitScript((language) => {
      localStorage.setItem(
        'cg.runtime.language.v1',
        JSON.stringify({ interface: language, feedback: 'en' }),
      );
      (window as unknown as { CG_E2E_ORPHAN: boolean }).CG_E2E_ORPHAN = true;
    }, locale);
    await page.reload();

    const layers = page.getByRole('region', { name: words.layers, exact: true });
    const row = layers.locator('[data-layer="95"]');
    await expect(row.locator('[data-row-state]')).toHaveAttribute('title', new RegExp(words.empty));
    const clearHeading = layers
      .locator('[data-verb-head]')
      .filter({ hasText: new RegExp(`^${words.clear}`, 'i') });
    await expect(clearHeading).toHaveCount(1);
    await expect(clearHeading).toHaveAttribute('title', words.clearTitle);

    await layers.getByRole('tab', { name: new RegExp(`^${words.station}`) }).click();
    const undeclared = layers.locator('[data-undeclared-layer="5"]');
    await expect(undeclared).toBeVisible();
    await expect(undeclared).toHaveCSS('direction', 'rtl');
    await expect(undeclared).toHaveCSS('text-align', 'start');
    await expect(undeclared).toContainText(words.channel);
    await expect(undeclared).toContainText(words.layer);
    await expect(undeclared).toContainText(words.tech);
  });
}
