import { test, expect } from './fixtures/runtime.js';

test('B-429 — the APASAI link uses the installed shell or the browser tab', async ({ app }) => {
  const page = app.page;
  const site = 'https://apasai.com/';
  await page.context().route(site, (route) => route.fulfill({ body: 'APASAI' }));
  const brand = page.getByRole('link', { name: 'APASAI website' });
  const popup = page.waitForEvent('popup');
  await brand.click();
  const browserTab = await popup;
  await expect(browserTab).toHaveURL(site);
  await browserTab.close();

  await page.evaluate(() => {
    const shell = window as unknown as {
      __companySiteCommands: string[];
      __TAURI_INTERNALS__: unknown;
    };
    shell.__companySiteCommands = [];
    shell.__TAURI_INTERNALS__ = {
      invoke: (command: string) => {
        if (command === 'open_company_site') shell.__companySiteCommands.push(command);
        return Promise.resolve(null);
      },
    };
  });
  await brand.click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __companySiteCommands: string[] }).__companySiteCommands,
      ),
    )
    .toEqual(['open_company_site']);
  await expect(brand).toBeVisible();
  expect(page.context().pages()).toEqual([page]);
});
