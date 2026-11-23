import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMock } from '@cg/amcp-mock';
import { createBridge } from '@cg/caspar-bridge';
import { expect, test } from '@playwright/test';

const locales = [
  {
    locale: 'fa',
    openTemplates: 'باز کردن قالب‌ها',
    catalogue: /^قالب‌ها ·/,
    graphics: 'گرافیک‌ها',
    details: 'قالب انتخاب‌شده',
    reloadUnavailable: /^فایل اصلی روی این CG Control/,
    channelSubtitle: /^وارد کردن، بارگذاری مجدد یا حذف قالب‌ها/,
    sharedDoor: 'پوشهٔ مشترک…',
    shared: 'پوشهٔ مشترک قالب‌ها',
    newest: /^جدیدترین ابتدا/,
    atRoot: 'در ریشهٔ فایل‌های مشترک',
    importPackage: 'وارد کردن بسته',
    create: 'چیدمان زندهٔ جدید',
    plate: 'قاب',
    preset: 'پریست',
    layout: 'چیدمان',
    layoutName: 'نام چیدمان',
    presetName: 'نام پریست',
    defaultPreset: 'پریست 1',
    addPlate: 'افزودن قاب',
    addPreset: 'افزودن پریست',
    noPlate: 'برای شروع یک قاب اضافه کنید.',
    advanced: 'کنترل‌های پیشرفتهٔ قاب',
    defaultFit: 'نمایش کل تصویر',
    margins: 'حاشیه‌های پریست (پیکسل)',
    effects: 'افکت‌های چیدمان',
    motion: 'حرکت',
    linear: 'خطی',
    cancel: 'انصراف',
    save: 'ذخیرهٔ چیدمان',
  },
  {
    locale: 'ar',
    openTemplates: 'فتح القوالب',
    catalogue: /^القوالب ·/,
    graphics: 'الرسوم',
    details: 'القالب المحدد',
    reloadUnavailable: /^الملف الأصلي غير مسجّل في CG Control/,
    channelSubtitle: /^استيراد القوالب أو إعادة تحميلها أو إزالتها/,
    sharedDoor: 'المجلد المشترك…',
    shared: 'مجلد القوالب المشتركة',
    newest: /^الأحدث أولًا/,
    atRoot: 'في جذر الملفات المشتركة',
    importPackage: 'استيراد الحزمة',
    create: 'ترتيب حي جديد',
    plate: 'لوحة',
    preset: 'إعداد مسبق',
    layout: 'الترتيب',
    layoutName: 'اسم الترتيب',
    presetName: 'اسم الإعداد المسبق',
    defaultPreset: 'الإعداد المسبق 1',
    addPlate: 'إضافة إطار',
    addPreset: 'إضافة إعداد مسبق',
    noPlate: 'أضف إطارًا للبدء.',
    advanced: 'خيارات الإطار المتقدمة',
    defaultFit: 'عرض الصورة كاملةً',
    margins: 'هوامش الإعداد المسبق (بكسل)',
    effects: 'تأثيرات الترتيب',
    motion: 'الحركة',
    linear: 'خطي',
    cancel: 'إلغاء',
    save: 'حفظ الترتيب',
  },
] as const;

for (const strings of locales) {
  test(`localizes Templates, Shared folder and every live layout tab in ${strings.locale}`, async ({
    page,
  }, testInfo) => {
    const shared = testInfo.outputPath('shared');
    mkdirSync(shared, { recursive: true });
    writeFileSync(join(shared, 'Studio میز.vcg'), 'fixture filename for folder navigation');
    const mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    try {
      const bridge = await createBridge({
        port: 0,
        host: '127.0.0.1',
        connection: {
          servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort: 0 } },
          strategy: 'mirror-sync',
          autoFailoverEnabled: false,
        },
        textSourceRoot: shared,
        templatesDir: testInfo.outputPath('templates'),
        stackPath: testInfo.outputPath('stack.json'),
      });
      try {
        await page.setViewportSize({ width: 1600, height: 970 });
        await page.addInitScript(
          ({ bridgeUrl, locale }) => {
            const browser = window as unknown as {
              __CG_BRIDGE_URL__: string;
              __CG_SPLASH_DISABLED__: boolean;
            };
            browser.__CG_BRIDGE_URL__ = bridgeUrl;
            browser.__CG_SPLASH_DISABLED__ = true;
            localStorage.setItem(
              'cg.runtime.language.v1',
              JSON.stringify({ interface: locale, feedback: 'en' }),
            );
          },
          { bridgeUrl: bridge.url, locale: strings.locale },
        );
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        const open = page.getByRole('button', { name: strings.openTemplates, exact: true });
        await expect(open).toBeEnabled();
        await page.evaluate(async () => {
          await window.cg.templates.import({
            channel: 1,
            template: {
              templateId: 'rtl-localization-fixture',
              name: 'Studio میز 01',
              templateType: 'lower-third',
              fields: [],
            },
            html: '<!doctype html><html><body></body></html>',
          });
        });
        await open.click();

        const catalogue = page.getByRole('dialog', { name: strings.catalogue });
        await expect(catalogue.locator('[data-modal-subtitle]')).toHaveText(
          strings.channelSubtitle,
        );
        await expect(
          catalogue.getByRole('button', { name: strings.graphics, exact: true }),
        ).toBeVisible();
        const row = catalogue.locator('[data-template-id="rtl-localization-fixture"]');
        const rowName = row.locator('.cg-tpl-name');
        await expect(rowName).toHaveCSS('direction', 'rtl');
        await expect(rowName.locator('bdi')).toHaveText('Studio میز 01');
        await expect(rowName.locator('bdi')).toHaveCSS('direction', 'rtl');
        await expect(row.locator('[data-template-reload]')).toHaveAttribute(
          'title',
          strings.reloadUnavailable,
        );
        await row.locator('.cg-tpl-row__load').click();
        await expect(catalogue.getByText(strings.details, { exact: true })).toBeVisible();

        await catalogue.getByRole('button', { name: strings.sharedDoor, exact: true }).click();
        const sharedFolder = page.getByRole('dialog', { name: strings.shared, exact: true });
        await expect(sharedFolder.getByRole('button', { name: strings.newest })).toBeVisible();
        await expect(sharedFolder.getByTitle(strings.atRoot)).toBeDisabled();
        const entry = sharedFolder.getByRole('button', { name: 'Studio میز.vcg', exact: true });
        await expect(entry).toHaveCSS('direction', 'rtl');
        await expect(entry.locator('bdi')).toHaveCSS('direction', 'rtl');
        await entry.click();
        await expect(
          sharedFolder.getByRole('button', { name: strings.importPackage, exact: true }),
        ).toBeEnabled();
        await sharedFolder.getByRole('button', { name: strings.cancel, exact: true }).click();

        await catalogue.getByRole('button', { name: strings.create, exact: true }).click();
        const editor = page.getByRole('dialog', { name: strings.create, exact: true });
        await expect(editor.getByText(strings.noPlate, { exact: true })).toBeVisible();
        await expect(editor.getByRole('tab')).toHaveText([
          strings.plate,
          strings.preset,
          strings.layout,
        ]);
        const plateTab = editor.getByRole('tab', { name: strings.plate, exact: true });
        await plateTab.focus();
        await page.keyboard.press('ArrowLeft');
        await expect(editor.getByRole('tab', { name: strings.preset, exact: true })).toBeFocused();
        await expect(plateTab).toHaveAttribute('aria-selected', 'true');
        const layoutName = editor.getByRole('textbox', { name: strings.layoutName, exact: true });
        await expect(layoutName).toHaveValue(strings.create);
        await layoutName.fill('Studio میز 02');
        await expect(layoutName).toHaveCSS('direction', 'ltr');
        await editor.getByRole('button', { name: strings.addPlate, exact: true }).click();
        await editor.getByRole('button', { name: strings.addPreset, exact: true }).click();
        await expect(
          editor.getByRole('textbox', { name: strings.presetName, exact: true }),
        ).toHaveValue(strings.defaultPreset);

        const headings = editor.locator('.cg-live-layout-section-heading');
        await expect(headings).toHaveCount(4);
        for (const heading of await headings.all()) {
          await expect(heading.locator('svg:last-child')).toHaveCSS(
            'transform',
            'matrix(-1, 0, 0, 1, 0, 0)',
          );
        }

        const advanced = headings.filter({ hasText: strings.advanced });
        await advanced.click();
        await expect(advanced.locator('svg:last-child')).toHaveCSS(
          'transform',
          'matrix(0, 1, -1, 0, 0, 0)',
        );
        await expect(
          editor.getByRole('button', { name: strings.defaultFit, exact: true }),
        ).toBeVisible();
        await editor.getByRole('tab', { name: strings.preset, exact: true }).click();
        await expect(
          editor.getByRole('group', { name: strings.margins, exact: true }),
        ).toBeVisible();
        await editor.getByRole('tab', { name: strings.layout, exact: true }).click();
        await editor.getByText(strings.effects, { exact: true }).click();
        await expect(
          editor
            .getByRole('combobox', { name: strings.motion, exact: true })
            .locator('option[value="linear"]'),
        ).toHaveText(strings.linear);
        await editor.getByRole('button', { name: strings.save, exact: true }).click();
        await expect(editor).toBeHidden();
        await expect(catalogue.locator('.cg-tpl-pick__name')).toHaveText('Studio میز 02');
      } finally {
        await bridge.close();
      }
    } finally {
      await mock.stop();
    }
  });
}
