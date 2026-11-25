import { buildValidVcg, expect, test } from './fixtures/runtime.js';

test('the status bar toggles app fullscreen and F11 still plays its assigned layer', async ({
  app,
  page,
}) => {
  // F11 is the default Play binding for layer 89.
  const layer = 89;
  await app.importVcg(
    'fullscreen-shortcut.vcg',
    await buildValidVcg('tpl-fullscreen-shortcut'),
    layer,
  );

  const footer = page.getByLabel('Status bar', { exact: true });
  const enter = footer.getByRole('button', { name: 'Enter app fullscreen', exact: true });
  const exit = footer.getByRole('button', { name: 'Exit app fullscreen', exact: true });
  const fullscreen = () =>
    page.evaluate(() => document.fullscreenElement === document.documentElement);

  await expect(enter).toHaveText('');
  await expect(enter).toHaveAttribute('title', 'Enter app fullscreen');
  expect(await enter.evaluate((button) => button.previousElementSibling?.textContent)).toBe('Lock');
  await enter.click();
  await expect.poll(fullscreen).toBe(true);
  await expect(app.layerState(layer)).toHaveText('READY');
  await page.mouse.move(1, 1);
  await exit.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Exit app fullscreen');
  await exit.click();
  await expect.poll(fullscreen).toBe(false);
  await expect(enter).toBeVisible();
  await expect(app.layerState(layer)).toHaveText('READY');

  await app.layers.getByRole('switch', { name: 'Layer shortcuts', exact: true }).click();
  await page.keyboard.press('F11');
  await expect(app.layerState(layer)).toHaveText('SIM ON AIR');
  expect(await fullscreen()).toBe(false);

  for (const [locale, enterLabel, exitLabel] of [
    ['fa', 'نمایش تمام‌صفحهٔ برنامه', 'خروج از حالت تمام‌صفحهٔ برنامه'],
    ['ar', 'عرض التطبيق بملء الشاشة', 'الخروج من وضع ملء الشاشة للتطبيق'],
  ] as const) {
    await page.evaluate((interfaceLanguage) => {
      localStorage.setItem(
        'cg.runtime.language.v1',
        JSON.stringify({ interface: interfaceLanguage, feedback: 'en' }),
      );
    }, locale);
    await page.reload();
    const localizedEnter = page.getByRole('button', { name: enterLabel, exact: true });
    const localizedExit = page.getByRole('button', { name: exitLabel, exact: true });
    await localizedEnter.click();
    await expect(localizedExit).toBeVisible();
    await localizedExit.click();
    await expect(localizedEnter).toBeVisible();
  }
});
