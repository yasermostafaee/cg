import type { Locator } from '@playwright/test';
import { expect, test, E2E_PLAYOUT } from './fixtures/runtime.js';

test.use({ playoutSources: E2E_PLAYOUT });

async function expectAdvancedChevron(dialog: Locator, direction: 'ltr' | 'rtl'): Promise<void> {
  const advanced = dialog.locator('[data-setup-advanced]');
  const summary = advanced.locator('summary');
  if ((await advanced.getAttribute('open')) === null) await summary.click();
  await expect(advanced).toHaveAttribute('open', '');
  await expect(summary.locator('.lucide-chevron-down')).toHaveCSS('transform', 'none');
  await summary.click();
  await expect(advanced).not.toHaveAttribute('open');
  await expect(summary.locator('.lucide-chevron-right')).toHaveCSS(
    'transform',
    direction === 'rtl' ? 'matrix(-1, 0, 0, 1, 0, 0)' : 'none',
  );
}

test('Station Settings keeps the English Advanced chevron pointing right when closed', async ({
  app,
}) => {
  await app.openStationSetupAt('Connection');
  await expectAdvancedChevron(app.page.getByRole('dialog'), 'ltr');
});

const detail = {
  fa: {
    sources: 'منابع زنده',
    files: 'فایل‌های اشتراکی',
    general: 'عمومی',
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
    formatHelp: 'چرا فرمت ویدئو فقط خواندنی است؟',
    formatOwner: 'فرمت کانال را موتور پخش تعیین می‌کند.',
    sharedRead: 'CG Bridge این پوشه را می‌خواند.',
    route: 'مسیر CG Bridge به',
    signingKey: 'کلید امضا',
    locked: 'نمایش قفل است',
    unassigned: /اختصاص‌نیافته|تخصیص نیافته/,
  },
  ar: {
    sources: 'المصادر الحية',
    files: 'الملفات المشتركة',
    general: 'عام',
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
    formatHelp: 'لماذا تنسيق الفيديو للقراءة فقط؟',
    formatOwner: 'يحدّد محرك البث تنسيق القناة.',
    sharedRead: 'يستطيع CG Bridge قراءة هذا المجلد.',
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

    const channelTab = locale === 'fa' ? 'کانال' : 'القناة';
    await dialog.getByRole('tab', { name: channelTab, exact: true }).click();
    const video = dialog.locator('[data-raster-channel="1"]');
    await expect(video.locator('.cg-video-mode__scan')).toHaveText(
      locale === 'fa' ? 'درهم‌بافته (Interlaced)' : 'مسح متداخل (Interlaced)',
    );
    const raster = video.locator('[data-channel-raster]');
    await expect(raster).toHaveText('1920 × 1080');
    await expect(raster).toHaveCSS('direction', 'ltr');
    const rate = video.locator('[data-channel-rate]');
    await expect(rate).toHaveText('25 fps · 50 fields/s');
    await expect(rate).toHaveCSS('direction', 'ltr');
    await expect(video.locator('[data-raster-verdict="match"]')).toHaveText(
      locale === 'fa' ? 'با سرور هم‌خوان است' : 'مطابق لإعدادات الخادم',
    );
    await expect(video).not.toContainText('the engine configuration');
    const metrics = video.locator('.cg-video-metric');
    await expect(metrics).toHaveCount(5);
    for (const index of [0, 1, 2, 3, 4]) {
      const firstInRow = index === 0 || index === 3;
      const cell = metrics.nth(index);
      await expect(cell).toHaveCSS('border-right-width', firstInRow ? '0px' : '1px');
      await expect(cell).toHaveCSS('border-left-width', '0px');
    }
    const formatHelp = dialog.locator('details').filter({ hasText: words.formatHelp });
    await formatHelp.locator('summary').click();
    const explanation = formatHelp.locator('p');
    await expect(explanation).toBeVisible();
    await expect(explanation).toContainText(words.formatOwner);
    await expect(explanation).not.toContainText(locale === 'fa' ? 'خیر' : 'لا تُكتب هنا');
    const outputHelp = dialog.locator('details').filter({
      hasText: locale === 'fa' ? 'شناسایی خروجی‌ها' : 'طريقة تحديد المخارج',
    });
    await outputHelp.locator('summary').click();
    await expect(outputHelp).toContainText('INFO CONFIG');
    await expect(outputHelp).toContainText(
      locale === 'fa' ? 'خروجی‌های تعریف‌شده' : 'تقارن وحدة التحكم المخارج',
    );

    for (const [mode, width, height, scan, expectedRate] of [
      ['1080p5000', 1920, 1080, '1080p', '50 fps'],
      ['720p5994', 1280, 720, '720p', '59.94 fps'],
      ['2160p2500', 3840, 2160, '2160p', '25 fps'],
    ] as const) {
      await dialog.getByRole('tab', { name: words.sources, exact: true }).click();
      await page.evaluate(
        ({ mode, width, height }) => {
          window.cg.channelSettings.get = async () => ({
            settings: [{ channel: 1, raster: { width, height } }],
            observed: [{ channel: 1, mode, raster: { width, height } }],
          });
        },
        { mode, width, height },
      );
      await dialog.getByRole('tab', { name: channelTab, exact: true }).click();
      await expect(video.locator('[data-video-mode-word]')).toHaveText(scan);
      await expect(video.locator('.cg-video-mode__scan')).toHaveText(
        locale === 'fa' ? 'پیش‌رونده (Progressive)' : 'تقدّمي (Progressive)',
      );
      await expect(raster).toHaveText(String(width) + ' × ' + String(height));
      await expect(raster).toHaveCSS('direction', 'ltr');
      await expect(rate).toHaveText(expectedRate);
      await expect(rate).toHaveCSS('direction', 'ltr');
    }

    await dialog.getByRole('tab', { name: words.sources, exact: true }).click();
    const sourceSection = dialog.locator('[data-station-section="sources"]');
    const view = sourceSection.locator('.cg-picker-input-view button');
    await expect(view).toHaveText(words.grid);
    await expect(sourceSection.locator('[data-sources-read]')).toContainText(words.lastRead);
    const autoFormat = sourceSection.locator('.cg-setup-source-format', { hasText: words.auto });
    await expect(autoFormat).toHaveCount(0);
    await expect(
      sourceSection.locator('.cg-resource__name').filter({ hasText: /^Studio 1$/ }),
    ).toHaveAttribute('dir', 'ltr');
    await view.click();
    await expect(view).toHaveText(words.list);
    await expect(autoFormat).toHaveCount(0);

    await dialog.getByRole('tab', { name: words.files, exact: true }).click();
    await expect(dialog.locator('#shared-files-path')).toHaveValue('D:\\CG Shared');
    await dialog.getByRole('button', { name: words.access, exact: true }).click();
    // Feedback language remains English while the Settings interface is RTL.
    await expect(
      dialog.getByText('CG Bridge can read this folder.', { exact: true }),
    ).toBeVisible();

    await dialog.getByRole('tab', { name: words.general, exact: true }).click();
    await dialog.locator('#cg-feedback-language').selectOption(locale);
    await dialog.getByRole('tab', { name: words.files, exact: true }).click();
    await dialog.getByRole('button', { name: words.access, exact: true }).click();
    const sharedRead = dialog.getByText(words.sharedRead, { exact: true });
    await expect(sharedRead).toBeVisible();
    await expect(sharedRead).toHaveCSS('direction', 'rtl');
    if (locale === 'fa') {
      const positions = await sharedRead.evaluate((el) => {
        const node = el.firstChild;
        if (node?.nodeType !== Node.TEXT_NODE) throw new Error('The notice text is missing');
        const value = node.textContent ?? '';
        const prefix = 'CG Bridge';
        const start = value.indexOf(prefix);
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + prefix.length);
        const bridge = range.getBoundingClientRect();
        range.setStart(node, start + prefix.length);
        range.setEnd(node, value.length);
        return {
          bridgeLeft: bridge.left,
          bridgeRight: bridge.right,
          persianLeft: range.getBoundingClientRect().left,
          noticeRight: el.getBoundingClientRect().right,
        };
      });
      expect(positions.bridgeLeft).toBeGreaterThan(positions.persianLeft);
      expect(Math.abs(positions.noticeRight - positions.bridgeRight)).toBeLessThan(2);
    }

    const connection = locale === 'fa' ? /^اتصال/ : /^الاتصال/;
    await dialog.getByRole('tab', { name: connection }).click();
    await expectAdvancedChevron(dialog, 'rtl');
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
    const layerName = locale === 'fa' ? 'لایهٔ 84' : 'الطبقة 84';
    const lowName = locale === 'fa' ? 'لایهٔ زنده 59' : 'الطبقة الحية 59';
    const layerNameInput = occupied.getByRole('textbox');
    await expect(layerNameInput).toHaveAttribute('placeholder', layerName);
    await expect(layerNameInput).toHaveValue('');
    await expect(
      dialog.locator('[data-candidate-layer="59"]').getByRole('textbox'),
    ).toHaveAttribute('placeholder', lowName);
    await expect(dialog.locator('[data-candidate-layer="80"]').getByRole('textbox')).toHaveValue(
      'CLOCK',
    );

    const filter = dialog.getByRole('searchbox');
    const query = locale === 'fa' ? 'لایهٔ ۸۴' : 'الطبقة ٨٤';
    for (const text of [query, 'Layer 84']) {
      await filter.fill(text);
      await expect(dialog.locator('[data-candidate-layer]')).toHaveCount(1);
      await expect(occupied).toBeVisible();
    }
    await filter.fill('');

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
    await occupied.getByRole('button').click();
    const confirmation = page.getByRole('dialog').last();
    await expect(confirmation.getByRole('heading')).toContainText(layerName);
    await expect(confirmation.getByRole('heading')).toContainText('ghabb');
    await confirmation
      .getByRole('button', { name: locale === 'fa' ? 'انصراف' : 'إلغاء', exact: true })
      .click();
    await expect(occupied.locator('.cg-layer-template')).toHaveText('ghabb');

    const close = locale === 'fa' ? 'بستن' : 'إغلاق';
    await dialog.getByRole('button', { name: close, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const mainList = page.locator('[data-layer-list]');
    const mainRow = mainList.locator('[data-layer="84"]');
    await expect(mainRow.locator('[data-row-body] bdi')).toHaveText(layerName);
    await expect(mainList.locator('[data-layer="59"]').locator('[data-row-body] bdi')).toHaveText(
      lowName,
    );
    await expect(mainList.locator('[data-layer="80"]').locator('[data-row-body] bdi')).toHaveText(
      'CLOCK',
    );
    await mainRow.locator('[data-verb-tone="remove"]').click();
    const remove = page.getByRole('dialog');
    await expect(remove.getByRole('heading')).toContainText(layerName);
    await expect(remove.getByRole('heading')).toContainText('ghabb');
    await expect(remove).toContainText(locale === 'fa' ? 'برای بارگذاری دوباره' : 'لإعادة التحميل');
    await expect(remove).toContainText('1-84');
    await remove
      .getByRole('button', { name: locale === 'fa' ? 'انصراف' : 'إلغاء', exact: true })
      .click();
    await expect(mainRow.locator('[data-verb-tone="remove"]')).toBeVisible();
  });
}
