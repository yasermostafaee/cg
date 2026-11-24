import type { Locator } from '@playwright/test';
import { CONTROL_LANGUAGE_KEY } from '../../src/renderer/i18n/localePreferences.js';
import type { RuntimeBridge } from '../../src/shared/runtime-bridge.js';
import { expect, RuntimeApp, test } from './fixtures/runtime.js';

const WIDE = { width: 1280, height: 800 };

async function openShortcuts(app: RuntimeApp): Promise<Locator> {
  await app.openStationSetupAt('Layers');
  await app.page.getByRole('button', { name: 'Layer shortcuts…' }).click();
  return app.page.getByRole('dialog', { name: 'Layer shortcuts', exact: true });
}

function cell(dialog: Locator, verb: string, layer: number): Locator {
  return dialog.getByRole('button', {
    name: `${verb} shortcut for layer ${String(layer)}`,
    exact: true,
  });
}

test('R-023 — Space records, applies and uses the existing row action without resizing the table', async ({
  app,
  page,
}) => {
  await page.setViewportSize(WIDE);
  const dialog = await openShortcuts(app);
  await expect(dialog.getByText('Space', { exact: true })).toHaveCount(0);
  await expect(cell(dialog, 'Play', 80)).toHaveText('—');
  const play = cell(dialog, 'Play', 96);
  const measure = () =>
    play.evaluate((button) => {
      const row = button.closest('tr')!;
      return [row, ...row.cells, button].map((part) => {
        const { width, height } = part.getBoundingClientRect();
        return { width, height };
      });
    });
  const before = await measure();
  expect((await dialog.boundingBox())?.width).toBeGreaterThan(500);
  await play.press('Space');
  await expect(play).toHaveText('Press keys…');
  expect(await measure()).toEqual(before);
  await play.press('Space');
  await expect(play).toHaveText('Space');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  expect(await measure()).toEqual(before);

  const stop = cell(dialog, 'Stop', 96);
  await stop.press('Enter');
  await stop.press('Space');
  await expect(dialog.getByRole('alert')).toHaveText('Space is assigned to Play on layer 96.');
  await stop.click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog.getByText('Layer shortcuts applied.')).toBeVisible();
  const bank = await page.evaluate(async () => (await window.cg.fixedLayers.banks())[0]);
  expect(bank?.spaceShortcut).toEqual({ layer: 96, verb: 'play' });
  expect(bank?.shortcuts?.['96']?.play).toBeUndefined();

  await page.setViewportSize({ width: 490, height: 650 });
  expect((await dialog.boundingBox())?.width).toBeLessThan(490);
  const scroller = dialog.locator('.cg-layer-shortcut-scroll');
  expect(await scroller.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  const clear = cell(dialog, 'Clear', 96);
  await clear.focus();
  await expect(clear).toBeFocused();
  await page.setViewportSize(WIDE);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await app.closeStationSetup();

  const status = () =>
    page.evaluate(
      async () => (await window.cg.stack.snapshot()).find(({ slot }) => slot?.layer === 96)?.status,
    );
  const toggle = app.layers.getByRole('switch', { name: 'Layer shortcuts', exact: true });
  const otherRow = app.layerRow(80);
  await expect(toggle).not.toBeChecked();
  await otherRow.press('Space');
  await expect(otherRow).toHaveAttribute('aria-pressed', 'true');
  expect(await status()).not.toBe('on-air');
  await otherRow.press('Enter');
  await expect(otherRow).toHaveAttribute('aria-pressed', 'false');

  await toggle.press('Space');
  await expect(toggle).toBeChecked();
  await toggle.press('Space');
  await expect(toggle).not.toBeChecked();
  expect(await status()).not.toBe('on-air');
  await toggle.click();
  const search = app.layers.getByRole('searchbox', { name: 'Find row or template' });
  await search.press('Space');
  await expect(search).toHaveValue(' ');
  expect(await status()).not.toBe('on-air');
  await search.clear();

  await otherRow.press('Space');
  await expect(otherRow).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(status).toBe('on-air');

  const target = app.layerRow(96);
  await expect(target.getByRole('button', { name: 'PLAY', exact: true })).toBeDisabled();
  await target.press('Space');
  await expect(target).toHaveAttribute('aria-pressed', 'true');
});

const shortcutLocales = [
  {
    locale: 'en',
    settings: 'Open Station setup',
    layers: 'Layers',
    shortcuts: 'Layer shortcuts',
    headings: ['Layer', 'Play', 'Next', 'Stop', 'Clear'],
    rtl: false,
  },
  {
    locale: 'fa',
    settings: 'باز کردن تنظیمات ایستگاه',
    layers: 'لایه‌ها',
    shortcuts: 'میانبرهای لایه',
    headings: ['لایه', 'پخش', 'بعدی', 'توقف', 'پاک کردن'],
    rtl: true,
  },
  {
    locale: 'ar',
    settings: 'فتح إعداد المحطة',
    layers: 'الطبقات',
    shortcuts: 'اختصارات الطبقات',
    headings: ['الطبقة', 'تشغيل', 'التالي', 'إيقاف', 'مسح'],
    rtl: true,
  },
];

for (const { locale, settings, layers, shortcuts, headings, rtl } of shortcutLocales) {
  test(`R-023 — ${locale} shortcut headings and layer numbers follow the interface reading order`, async ({
    app,
  }) => {
    const { page } = app;
    await page.setViewportSize(WIDE);
    await page.evaluate(
      ({ key, locale }) => localStorage.setItem(key, JSON.stringify({ interface: locale })),
      { key: CONTROL_LANGUAGE_KEY, locale },
    );
    await page.reload();
    await page.getByRole('button', { name: settings, exact: true }).click();
    await page.getByRole('dialog').getByRole('tab', { name: layers, exact: true }).click();
    await page.getByRole('button', { name: `${shortcuts}…`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: shortcuts, exact: true });
    await expect(dialog.getByRole('columnheader')).toHaveText(headings);
    await expect(dialog.getByRole('switch', { name: shortcuts, exact: true })).not.toBeChecked();

    for (const [layer, alias] of [
      ['99', 'DEBATE'],
      ['83', 'میانبرنامه روی انتن'],
    ] as const) {
      const rowHeader = dialog.getByRole('rowheader').filter({ hasText: alias });
      const parts = rowHeader.locator('bdi');
      await expect(parts).toHaveText([layer, alias]);
      const measure = (part: Locator) =>
        part.evaluate((element) => {
          const { left, right } = element.getBoundingClientRect();
          return { left, right };
        });
      const [number, name] = await Promise.all([measure(parts.nth(0)), measure(parts.nth(1))]);
      if (rtl) expect(number.left).toBeGreaterThan(name.right);
      else expect(number.right).toBeLessThan(name.left);
    }
  });
}

test('R-023 — a console connected to a Bridge without Space support can still record function keys', async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.addInitScript(() => {
    const testWindow = window as unknown as Window & {
      CG_E2E: boolean;
      CG_E2E_FIXED_BANK: boolean;
      __CG_BRIDGE_URL__: string;
    };
    testWindow.CG_E2E = true;
    testWindow.CG_E2E_FIXED_BANK = true;
    testWindow.__CG_BRIDGE_URL__ = 'ws://127.0.0.1:1';
    let held: RuntimeBridge | undefined;
    Object.defineProperty(window, 'cg', {
      configurable: true,
      get: () => held,
      set: (bridge: RuntimeBridge) => {
        const capabilities = bridge.auth.capabilities;
        bridge.auth.capabilities = () => {
          const current = capabilities();
          if (current === null) return current;
          const { fixedLayerSpaceShortcut: _space, ...older } = current;
          return older;
        };
        held = bridge;
      },
    });
  });
  const app = new RuntimeApp(page);
  await app.goto();
  const dialog = await openShortcuts(app);
  const play = cell(dialog, 'Play', 80);
  await expect(play).toHaveText('—');
  await play.press('Space');
  await play.press('Space');
  await expect(dialog.getByRole('alert')).toHaveText('Assigning Space requires a newer CG Bridge.');
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await play.press('Alt+Shift+F8');
  await expect(play).toHaveText('Alt+Shift+F8');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog.getByText('Layer shortcuts applied.')).toBeVisible();
  expect(await page.evaluate(async () => (await window.cg.fixedLayers.banks())[0])).toMatchObject({
    shortcuts: { '80': { play: 'Alt+Shift+F8' } },
  });
  expect(
    await page.evaluate(async () => (await window.cg.fixedLayers.banks())[0]?.spaceShortcut),
  ).toBeUndefined();
});
