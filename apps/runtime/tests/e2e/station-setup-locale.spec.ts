import { expect, test, E2E_PLAYOUT } from './fixtures/runtime.js';

test.use({ playoutSources: E2E_PLAYOUT });

const detail = {
  fa: {
    sources: 'منابع زنده',
    files: 'فایل‌های اشتراکی',
    layers: 'لایه‌ها',
    grid: 'شبکه‌ای',
    list: 'فهرست',
    auto: 'خودکار',
    lastRead: 'آخرین خوانش',
    check: 'بررسی',
    access: 'بررسی دسترسی',
    showAll: 'نمایش همه',
    reach: 'دسترسی',
    versions: 'نسخه‌ها',
    signIn: 'ورود',
    route: 'مسیر CG Bridge به',
    signingKey: 'کلید امضا',
    locked: 'نمایش قفل است',
    unassigned: /اختصاص‌نیافته|تخصیص نیافته/,
  },
  ar: {
    sources: 'المصادر الحية',
    files: 'الملفات المشتركة',
    layers: 'الطبقات',
    grid: 'شبكة',
    list: 'قائمة',
    auto: 'تلقائي',
    lastRead: 'آخر قراءة',
    check: 'فحص',
    access: 'فحص الوصول',
    showAll: 'عرض الكل',
    reach: 'إمكانية الوصول',
    versions: 'الإصدارات',
    signIn: 'تسجيل الدخول',
    route: 'يمر مسار CG Bridge إلى',
    signingKey: 'مفاتيح التوقيع',
    locked: 'العرض مقفل',
    unassigned: /غير معيّن|غير مخصص/,
  },
} as const;

for (const locale of ['fa', 'ar'] as const) {
  test(`Station Settings uses ${locale} for standing text and aligns a Latin graphic name`, async ({
    app,
  }) => {
    const { page } = app;
    const words = detail[locale];
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      window.cg.sharedFiles.get = async () => ({ path: 'D:\\CG Shared' });
      window.cg.sharedFiles.set = async ({ path }) => ({ ok: true, path });
      window.cg.setup.check = async () => ({
        localAddress: '127.0.0.1',
        bridge: null,
        lines: [
          {
            id: 'route',
            status: 'pass',
            text: "CG Bridge's route to 127.0.0.1 leaves through Loopback Pseudo-Interface 1 (127.0.0.1).",
          },
          {
            id: 'api',
            status: 'pass',
            text: 'The Playout answers and publishes 1 signing key.',
          },
          {
            id: 'playout-version',
            status: 'pass',
            text: 'Playout 2.8.54.',
          },
          {
            id: 'cors',
            status: 'pass',
            text: 'Sign-in from this console: direct, with no browser origin — no CORS entry is needed.',
          },
        ],
      });
    });

    const assigned = await page.evaluate(async () => {
      const choices = [
        { layer: 84, templateId: '11111111-1111-4111-8111-111111111111', name: 'ghabb' },
        { layer: 85, templateId: '22222222-2222-4222-8222-222222222222' },
      ];
      for (const { layer, templateId, name } of choices) {
        await window.cg.templates.import({
          template: {
            templateId,
            templateType: 'lower-third',
            fields: [],
            ...(name === undefined ? {} : { name }),
          },
          html: '<!doctype html><html></html>',
        });
        const loaded = await window.cg.fixedLayers.load({
          channel: 1,
          layer,
          itemId: 'station-locale-' + String(layer),
          templateId,
          fields: {},
        });
        if (!loaded.accepted) return loaded.errorCode ?? 'load rejected';
      }
      return 'loaded';
    });
    expect(assigned).toBe('loaded');
    await app.openStationSetupAt('General');
    const dialog = page.getByRole('dialog');
    await dialog.locator('#cg-interface-language').selectOption(locale);
    await expect(dialog).toHaveCSS('direction', 'rtl');

    await dialog.getByRole('tab', { name: words.sources, exact: true }).click();
    const sourceSection = dialog.locator('[data-station-section="sources"]');
    const view = sourceSection.locator('.cg-picker-input-view button');
    await expect(view).toHaveText(words.grid);
    await expect(sourceSection.locator('[data-sources-read]')).toContainText(words.lastRead);
    await expect(
      sourceSection.locator('.cg-resource__name').filter({ hasText: /^Studio 1$/ }),
    ).toHaveAttribute('dir', 'ltr');
    await view.click();
    await expect(view).toHaveText(words.list);
    await expect(
      sourceSection.locator('.cg-setup-source-format', { hasText: words.auto }).first(),
    ).toBeVisible();

    await dialog.getByRole('tab', { name: words.files, exact: true }).click();
    await expect(dialog.locator('#shared-files-path')).toHaveValue('D:\\CG Shared');
    await dialog.getByRole('button', { name: words.access, exact: true }).click();
    // Feedback language remains English while the Settings interface is RTL.
    await expect(
      dialog.getByText('CG Bridge can read this folder.', { exact: true }),
    ).toBeVisible();

    const connection = locale === 'fa' ? /^اتصال/ : /^الاتصال/;
    await dialog.getByRole('tab', { name: connection }).click();
    const editHost = dialog.locator('#cg-playout-address');
    if (await editHost.isVisible()) await editHost.fill('127.0.0.1');
    await dialog.getByRole('button', { name: words.check, exact: true }).click();
    await dialog.getByRole('button', { name: words.showAll, exact: true }).click();
    for (const [id, heading] of [
      ['reach', words.reach],
      ['versions', words.versions],
      ['sign-in', words.signIn],
    ] as const) {
      await expect(dialog.locator(`[data-check-group="${id}"] h4`)).toHaveText(heading);
    }
    const route = dialog.locator('[data-check="route"]');
    await expect(route).toContainText(words.route);
    await expect(route).toContainText('Loopback Pseudo-Interface 1');
    await expect(route).toContainText('127.0.0.1');
    await expect(dialog.locator('[data-check="api"]')).toContainText(words.signingKey);
    await expect(dialog.locator('[data-check="playout-version"]')).toContainText('2.8.54');

    await dialog.getByRole('tab', { name: new RegExp('^' + words.layers) }).click();
    const occupied = dialog.locator('[data-candidate-layer="84"]');
    const name = occupied.locator('.cg-layer-template bdi');
    await expect(name).toHaveText('ghabb');
    await expect(name).toHaveAttribute('dir', 'ltr');
    await expect(occupied.locator('.cg-layer-template')).toHaveAttribute('title', 'ghabb');
    const unnamed = dialog.locator('[data-candidate-layer="85"] .cg-layer-template');
    const unnamedText = locale === 'fa' ? 'قالب بی‌نام' : 'قالب بلا اسم';
    await expect(unnamed).toHaveText(unnamedText);
    await expect(unnamed).toHaveAttribute('title', unnamedText);
    await expect(occupied.locator('[data-layer-locked]')).toContainText(words.locked);
    await expect(dialog.locator('.cg-layer-none').first()).toHaveText(words.unassigned);
    const nameBox = await name.boundingBox();
    const lockBox = await occupied.locator('[data-layer-locked] svg').boundingBox();
    expect(nameBox).not.toBeNull();
    expect(lockBox).not.toBeNull();
    if (nameBox !== null && lockBox !== null) {
      expect(Math.abs(nameBox.x + nameBox.width - lockBox.x - lockBox.width)).toBeLessThan(2);
    }
  });
}
