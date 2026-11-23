import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createBridge } from '@cg/caspar-bridge';
import { fromGregorian, writeFieldDigits } from '@cg/text-shaping';
import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Asia/Tehran' });

test('Audit General calendar and localized filters use the same canonical local day', async ({
  page,
}, testInfo) => {
  const fixture = testInfo.outputPath('bridge');
  await mkdir(fixture, { recursive: true });
  const templatesDir = path.join(fixture, 'templates');
  await mkdir(templatesDir);
  await writeFile(
    path.join(templatesDir, 'calendar.json'),
    JSON.stringify({ lunarAdjustDays: 1, updatedAt: '2026-03-20T20:00:00.000Z' }),
  );
  const auditLogPath = path.join(fixture, 'audit.ndjson');
  const stamp = '2026-03-20T21:00:00.123Z';
  const event = (ts: string, itemId: string) => ({
    ts,
    itemId,
    actor: 'Operator',
    action: 'take',
    outcome: 'ok',
    slot: { channel: 1, layer: 91, server: 'primary' },
  });
  await writeFile(
    auditLogPath,
    [event('2026-03-20T20:00:00.000Z', 'earlier'), event(stamp, 'day-selected')]
      .map((row) => JSON.stringify(row))
      .join('\n') + '\n',
  );
  const bridge = await createBridge({
    host: '127.0.0.1',
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    fixedLayers: { channel: 1, start: 91, count: 2, low: { start: 51, count: 2 } },
    auditLogPath,
    stackPath: path.join(fixture, 'stack.json'),
    templatesDir,
  });

  try {
    const filterRequests: string[] = [];
    page.on('websocket', (socket) => {
      socket.on('framesent', ({ payload }) => {
        if (typeof payload === 'string' && payload.includes('audit.page'))
          filterRequests.push(payload);
      });
    });
    await page.addInitScript((bridgeUrl) => {
      Object.assign(window, { __CG_BRIDGE_URL__: bridgeUrl, __CG_SPLASH_DISABLED__: true });
    }, bridge.url);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Station setup' }).click();
    const settings = page.getByRole('dialog', { name: 'Station setup' });
    await settings.getByRole('tab', { name: 'General' }).click();
    const preference = settings.getByLabel('Date calendar');
    await expect(preference).toHaveValue('gregorian');
    await preference.selectOption('solar-hijri');
    await settings.getByRole('button', { name: 'Close' }).last().click();

    await page.evaluate(() => {
      localStorage.setItem(
        'cg.runtime.language.v1',
        JSON.stringify({ interface: 'fa', feedback: 'en' }),
      );
    });
    await page.reload();
    await page.getByRole('button', { name: 'باز کردن گزارش عملیات' }).click();
    const audit = page.getByRole('dialog', { name: 'گزارش عملیات' });
    const selectedDay = audit.locator('[data-audit-item-id="day-selected"]');
    await expect(selectedDay.locator('[data-audit-time] small')).toHaveText('۱۴۰۵-۰۱-۰۱');
    await expect(selectedDay.locator('[data-audit-cell="action"]')).toHaveText('فرستادن روی آنتن');
    await expect(audit.locator('#audit-action option').first()).toHaveText('همهٔ عملیات');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const details = audit.locator('[data-audit-details]');
    await expect(details).toContainText(stamp);
    await expect(details.locator('[data-audit-technical="Item ID"] span')).toHaveText(
      'شناسهٔ آیتم',
    );
    await expect(details.locator('[data-audit-technical="Item ID"] code')).toHaveText(
      'day-selected',
    );

    const from = audit.getByLabel('تاریخ شروع گزارش');
    const to = audit.getByLabel('تاریخ پایان گزارش');
    const before = filterRequests.length;
    await from.fill('۱۴۰۵/۱۲/۳۱');
    await expect(from).toHaveAttribute('aria-invalid', 'true');
    await expect(audit.locator('[data-audit-range-error]')).toContainText('تاریخ معتبر');
    expect(filterRequests).toHaveLength(before);

    await from.fill('۱۴۰۵/۰۱/۰۱');
    await to.fill('۱۴۰۵/۰۱/۰۱');
    await expect(from).toHaveValue('۱۴۰۵/۰۱/۰۱');
    await expect(audit.locator('[data-audit-row]')).toHaveCount(1);
    await expect(audit.locator('[data-audit-item-id="earlier"]')).toHaveCount(0);
    await expect.poll(() => filterRequests.at(-1)).toContain('2026-03-20T20:30:00.000Z');
    await expect.poll(() => filterRequests.at(-1)).toContain('2026-03-21T20:29:59.999Z');
    await audit.getByRole('button', { name: 'انتخاب تاریخ شروع' }).click();
    await expect(page.locator('[data-datetime-grid="solar-hijri"]')).toHaveAttribute('dir', 'rtl');

    await page.evaluate(() => {
      localStorage.setItem(
        'cg.runtime.language.v1',
        JSON.stringify({ interface: 'ar', feedback: 'en' }),
      );
      localStorage.setItem('cg.runtime.audit-calendar.v1', 'lunar-hijri');
    });
    await page.reload();
    await page.getByRole('button', { name: 'فتح سجل التدقيق' }).click();
    const arabicAudit = page.getByRole('dialog', { name: 'سجل العمليات' });
    const arabicRow = arabicAudit.locator('[data-audit-item-id="day-selected"]');
    const lunar = fromGregorian({ year: 2026, month: 3, day: 21 }, 'lunar-hijri', 1);
    const digits = [
      String(lunar.year),
      String(lunar.month).padStart(2, '0'),
      String(lunar.day).padStart(2, '0'),
    ];
    await expect(arabicRow.locator('[data-audit-time] small')).toHaveText(
      writeFieldDigits(digits.join('-'), 'arabic-indic'),
    );
    await expect(arabicRow.locator('[data-audit-cell="action"]')).toHaveText('إرسال إلى البث');
    await arabicAudit
      .getByLabel('تاريخ بداية السجل')
      .fill(writeFieldDigits(digits.join('/'), 'arabic-indic'));
    await expect(arabicAudit.locator('[data-audit-row]')).toHaveCount(1);
    await expect.poll(() => filterRequests.at(-1)).toContain('2026-03-20T20:30:00.000Z');
  } finally {
    await bridge.close();
  }
});
