import type { Page } from '@playwright/test';
import { buildValidVcg, expect, test } from './fixtures/runtime.js';

async function expectLoadRemoveHeader(page: Page, label: string): Promise<void> {
  const heading = page.locator('[data-verb-head]').first();
  await expect(heading).toHaveText(label);
  await expect
    .poll(() => heading.evaluate((element) => element.scrollWidth))
    .toBeLessThanOrEqual(await heading.evaluate((element) => element.clientWidth));
}

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
  await expectLoadRemoveHeader(page, 'LOAD / REMOVE');
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
  const toast = page.getByRole('status', { name: 'عملیات موفق' });
  await expect(toast).toContainText('روی آنتن رفت.');
  await expect(toast).toHaveCSS('direction', 'rtl');
  const tokenPositions = await toast.locator('span').evaluate((message) => {
    const node = message.firstChild;
    if (node === null) throw new Error('Missing command text');
    const text = node.textContent ?? '';
    const latin = text.search(/[A-Za-z]/);
    const persian = text.indexOf('روی آنتن رفت');
    if (latin < 0 || persian < 0) throw new Error('Expected a Latin row name and Persian feedback');
    const range = document.createRange();
    const x = (at: number) => {
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      return range.getBoundingClientRect().left;
    };
    return { latin: x(latin), persian: x(persian) };
  });
  expect(tokenPositions.latin).toBeGreaterThan(tokenPositions.persian);
  await expect(row.getByRole('button', { name: 'STOP', exact: true })).toBeEnabled();

  await page.reload();
  await openGeneral(page);
  await expect(page.locator('#cg-interface-language')).toHaveValue('en');
  await expect(page.locator('#cg-feedback-language')).toHaveValue('fa');
});

test('shows the complete missing-source refusal in Persian with English chrome', async ({
  app,
}) => {
  const { page } = app;
  await openGeneral(page);
  await page.locator('#cg-feedback-language').selectOption('fa');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.evaluate(() => {
    window.cg.stack.take = async () => ({
      accepted: false,
      errorCode: 'live-source-unassigned',
      message:
        'Plate 2 and Plate 3 are assigned to a source this installation no longer has. Assign them in CG Control, then take again.',
      missingPlateSources: { unassigned: [], stale: [2, 3] },
    });
  });

  const play = app.layerRow(96).getByRole('button', { name: 'PLAY', exact: true });
  await play.click();
  const banner = page.locator('[data-refusal]');
  await expect(banner).toHaveAttribute('data-refusal-count', '1');
  await play.click();
  await expect(banner).toHaveAttribute('data-refusal-count', '2');
  const sentence = banner.getByRole('alert').getByText(/منبع انتخاب‌شده/);
  await expect(sentence).toHaveCSS('direction', 'rtl');
  const readable = (await sentence.innerText()).replace(/[\u2068\u2069]/g, '');
  expect(readable).toContain(
    'منبع انتخاب‌شده برای قاب 2 و قاب 3 دیگر در این ایستگاه در دسترس نیست.',
  );
  expect(readable).toContain('در CG Control برای این قاب‌ها منبع انتخاب کنید');
  expect(readable).toContain('(2 بار)');
  expect(readable).not.toContain('this installation');
});

for (const scenario of [
  { language: 'fa', message: 'سرور یکی از تنظیمات این فرمان را نپذیرفت.', details: 'جزئیات فنی' },
  { language: 'ar', message: 'رفض الخادم أحد إعدادات هذا الأمر.', details: 'تفاصيل تقنية' },
]) {
  test(`shows the server's Update refusal in ${scenario.language} with English controls`, async ({
    app,
  }) => {
    const { page } = app;
    const layer = await app.importVcg('feedback.vcg', await buildValidVcg('tpl-feedback-update'));
    await app.selectLayerRow(layer);
    await app.layerRow(layer).getByRole('button', { name: 'PLAY', exact: true }).click();
    const commit = app.inspector.locator('[data-inspector-commit]');
    await expect(commit).toHaveText('Update on air');

    await openGeneral(page);
    await page.locator('#cg-feedback-language').selectOption(scenario.language);
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const rawReply = 'The server refused a setting in this command.';
    await page.evaluate((message) => {
      window.cg.stack.update = async () => ({
        accepted: false,
        errorCode: 'amcp-402',
        message,
      });
    }, rawReply);
    const field = app.inspector.getByRole('textbox', { name: 'anchor' });
    await field.fill('Changed field');
    await commit.click();

    const banner = page.locator('[data-refusal]').getByRole('alert');
    await expect(banner.getByText(scenario.message, { exact: true })).toHaveCSS('direction', 'rtl');
    await expect(banner.getByText(rawReply, { exact: false })).toBeHidden();
    await banner.getByText(scenario.details, { exact: true }).click();
    await expect(banner.getByText(rawReply, { exact: false })).toBeVisible();
    await expect(field).toHaveValue('Changed field');
  });
}

test('anchors PGM audio at the end of the strip as the console width and language change', async ({
  app,
}) => {
  const { page } = app;
  await app.showMonitors();
  for (const locale of ['en', 'fa', 'ar']) {
    await openGeneral(page);
    await page.locator('#cg-interface-language').selectOption(locale);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^(Close|بستن|إغلاق)$/, exact: true })
      .last()
      .click();
    for (const width of [1440, 850, 650]) {
      await page.setViewportSize({ width, height: 900 });
      const group = page.locator('[data-monitor-pgm-strip] > .cg-pgm-source-controls');
      await expect(group).toBeVisible();
      const gap = await group.evaluate((controls) => {
        const strip = controls.parentElement;
        if (strip === null) throw new Error('Missing PGM status strip');
        const rect = strip.getBoundingClientRect();
        const style = getComputedStyle(strip);
        const boxes = [...controls.children].map((child) => child.getBoundingClientRect());
        const distance =
          style.direction === 'rtl'
            ? Math.min(...boxes.map((box) => box.left)) - rect.left
            : rect.right - Math.max(...boxes.map((box) => box.right));
        return distance - Number.parseFloat(style.paddingInlineEnd);
      });
      expect(Math.abs(gap)).toBeLessThan(1);
    }
    if (locale === 'fa') {
      await expect(page.locator('[data-monitor-air-count]')).toHaveAttribute(
        'title',
        /^تعداد لایه‌های روی آنتن/,
      );
    }
  }
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
  await expect(page.getByRole('img', { name: /^پیش‌نمایش خالی است/ })).toContainText(
    /نمایش در PVW.*هیچ فرمانی به .+ فرستاده نمی‌شود\./,
  );
  const row = page.locator('[data-layer="96"]');
  await expect(row).toHaveCSS('direction', 'rtl');
  await expect(row.getByRole('button', { name: 'پخش', exact: true })).toBeVisible();
  const header = page.locator('[data-verb-head]').first();
  await expect(header).toHaveCSS('direction', 'rtl');
  await expectLoadRemoveHeader(page, 'بارگذاری / حذف');

  await openGeneral(page);
  await page.locator('#cg-interface-language').selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('لغة الواجهة', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'عام', exact: true })).toBeVisible();
  await expect(page.locator('#cg-feedback-language')).toHaveValue('en');

  await page.getByRole('dialog').getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expect(page.locator('[data-layer="98"]')).toContainText('محظور');
  await expect(page.locator('[data-layer="99"]')).toContainText('بث محاكى');
  await expect(page.locator('[data-rehearsal-caption]')).toContainText('معاينة');
  await expect(page.getByRole('img', { name: /^المعاينة خالية/ })).toContainText(
    /في PVW.*لا يُرسل أي أمر إلى .+\./,
  );
  await expect(page.locator('[data-pgm-screen]').first()).toContainText('لا توجد إشارة عودة');
  await expect(page.getByTestId('monitor-head-tag')).toContainText('الخرج غير معروف');
  await expect(page.getByText(/صفوف على البث/).first()).toBeVisible();
  await expect(page.getByText('طبقات على PVW', { exact: true })).toBeVisible();
  await expectLoadRemoveHeader(page, 'تحميل / إزالة');
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

test('localizes a layer confirmation without changing the feedback language', async ({ app }) => {
  const { page } = app;
  await openGeneral(page);
  await page.locator('#cg-interface-language').selectOption('fa');
  await expect(page.locator('#cg-feedback-language')).toHaveValue('en');
  await page.getByRole('dialog').getByRole('button', { name: 'بستن', exact: true }).click();

  const row = page.locator('[data-layer="80"]');
  await row.getByRole('button', { name: 'پاک کردن', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /پاک شود/ });
  await expect(dialog).toContainText('بدون افکت خروج از آنتن برداشته می‌شود');
  await expect(dialog).toContainText('1-80');
  await dialog.getByRole('button', { name: 'انصراف', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'پاک کردن', exact: true })).toBeEnabled();
});

test('reads a Latin template name first in RTL remove confirmations', async ({ app }) => {
  const { page } = app;
  const id = 'rtl-removal-title';
  await app.importVcg('ghabb.vcg', await buildValidVcg(id));
  const layer = await app.loadTemplate(id);
  for (const locale of ['fa', 'ar']) {
    await openGeneral(page);
    await page.locator('#cg-interface-language').selectOption(locale);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^(بستن|إغلاق)$/, exact: true })
      .last()
      .click();
    await page.locator(`[data-layer="${layer}"] [data-verb-tone="remove"]`).click();
    const dialog = page.getByRole('dialog', { name: /ghabb/ });
    const heading = dialog.getByRole('heading');
    await expect(heading).toHaveCSS('direction', 'rtl');
    await expect(heading).toHaveText(/^«\u2068ghabb\u2069»/u);
    const startsAtRight = await heading.evaluate((element) => {
      const node = element.firstChild;
      if (node === null) throw new Error('Missing confirmation title');
      const text = node.textContent ?? '';
      const latin = text.indexOf('ghabb');
      const onRtlScript = text.search(/\p{Script=Arabic}/u);
      if (latin < 0 || onRtlScript < 0) throw new Error('Expected a mixed-script confirmation');
      const range = document.createRange();
      const x = (at: number) => {
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        return range.getBoundingClientRect().left;
      };
      return x(latin) > x(onRtlScript);
    });
    expect(startsAtRight).toBe(true);
    await dialog.getByRole('button', { name: /^(انصراف|إلغاء)$/, exact: true }).click();
  }
});

test('keeps both positions of a visibility switch inside the track in RTL', async ({ app }) => {
  const { page } = app;
  for (const { language, layers } of [
    { language: 'fa', layers: 'لایه‌ها' },
    { language: 'ar', layers: 'الطبقات' },
  ]) {
    await openGeneral(page);
    await page.locator('#cg-interface-language').selectOption(language);
    const setup = page.getByRole('dialog');
    await setup.getByRole('tab', { name: layers, exact: true }).click();

    const input = setup.locator('.cg-switch input:enabled').first();
    const wasChecked = await input.isChecked();
    const track = input.locator('xpath=following-sibling::span');
    const geometry = () =>
      track.evaluate((element) => {
        const thumb = getComputedStyle(element, '::after');
        return {
          right: Number.parseFloat(thumb.right),
          width: Number.parseFloat(thumb.width),
          trackWidth: element.clientWidth,
        };
      });
    for (const checked of [false, true]) {
      await input.setChecked(checked);
      await expect(input).toBeChecked({ checked });
      await expect(track).toHaveCSS('direction', 'rtl');
      await expect
        .poll(async () => {
          const { right, width, trackWidth } = await geometry();
          const left = trackWidth - right - width;
          return right >= 0 && left >= 0 && (checked ? right > left : right < left);
        })
        .toBe(true);
    }
    // Revert the local draft without applying it to the bridge.
    await input.setChecked(wasChecked);
    await setup
      .getByRole('button', { name: language === 'fa' ? 'بستن' : 'إغلاق', exact: true })
      .first()
      .click();
  }
});
