import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `MULTI-CHANNEL-01` — **ONE CONSOLE, TWO CHANNELS, SWITCHED BETWEEN**, in a real browser over the
 * offline mock. The whole-App jsdom proofs (`channelSwitch.dom.test.ts`) carry every negative with
 * its control; this spec maps the OpenSpec scenarios onto the page the operator actually uses.
 *
 * The second channel is declared the way Station setup declares it — `fixedLayers.set-banks` with
 * the first channel's bank kept and a second bank added — and row 84 is named on channel 2 only,
 * so the same layer number reads differently on the two channels.
 */

const NAME_ON_2 = 'میز ورزش';

async function declareSecondChannel(page: Page): Promise<void> {
  const ok = await page.evaluate(async (name) => {
    const cg = (window as unknown as { cg: typeof window.cg }).cg;
    const [first] = await cg.fixedLayers.banks();
    if (first === undefined) return false;
    const second = { ...first, channel: 2, aliases: { ...first.aliases, '84': name } };
    const res = await cg.fixedLayers.setBanks({ banks: [first, second] });
    return res.ok;
  }, NAME_ON_2);
  expect(ok, 'the second channel was declared').toBe(true);
}

const strip = (page: Page) => page.getByRole('tablist', { name: 'Channels' });

test('switching channels moves the rows, their names, the monitors and the bulk scope together', async ({
  app,
}) => {
  const { page } = app;
  await declareSecondChannel(page);
  await expect(strip(page).getByRole('tab')).toHaveText(['CHANNEL 1', 'CHANNEL 2']);
  await expect(strip(page).getByRole('tab', { name: 'CHANNEL 1' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(app.layerRow(84)).not.toContainText(NAME_ON_2);
  await expect(page.locator('[data-bulk-target]')).toHaveText('CH 1');

  await strip(page).getByRole('tab', { name: 'CHANNEL 2' }).click();
  await expect(app.layerRow(84)).toContainText(NAME_ON_2);
  await expect(page.locator('[data-bulk-target]')).toHaveText('CH 2');
  await app.showMonitors();
  await expect(page.locator('.cg-monitor-ch')).toHaveText(['CH 2', 'CH 2']);
});

test('PANIC on a channel names that channel; the every-channel control sits with the channels', async ({
  app,
}) => {
  const { page } = app;
  await declareSecondChannel(page);
  const every = page.locator('[data-app-header] [data-every-channel-panic]');
  await expect(every).toHaveText('SILENCE ALL PLATES · EVERY CHANNEL');
  await expect(every).toHaveAttribute('aria-label', /^Silence all boxes on every channel/);

  // Channel 1 holds the mock's seeded plates, so its plates toolbar carries ITS channel's PANIC.
  await app.liveSourcesTab.click();
  const own = app.layers.locator('[data-plate-toolbar] [data-plate-panic]');
  await expect(own).toHaveText('Silence all plates · CH 1');
  await expect(own).toHaveAttribute('aria-label', /^Silence all boxes on channel 1 /);
  // …and the two are never side by side.
  await expect(app.layers.locator('[data-every-channel-panic]')).toHaveCount(0);
});

test('a message about one channel stays in its view; the other channel’s tab carries the mark', async ({
  app,
}) => {
  const { page } = app;
  await declareSecondChannel(page);
  await strip(page).getByRole('tab', { name: 'CHANNEL 2' }).click();
  await page.evaluate(() => {
    (window as unknown as { CG_TEST_REFUSE: (m: string) => void }).CG_TEST_REFUSE(
      'Refused on channel 2.',
    );
  });
  await expect(page.locator('[data-refusal]')).toContainText('Refused on channel 2.');

  await strip(page)
    .getByRole('tab', { name: /^CHANNEL 1/ })
    .click();
  await expect(page.locator('[data-refusal]')).toHaveCount(0);
  await expect(strip(page).locator('#channel-2 [data-tab-signal]')).toHaveAttribute(
    'data-tab-signal',
    'warning',
  );

  // THE CONTROL — back on channel 2, the message is there to read.
  await strip(page)
    .getByRole('tab', { name: /^CHANNEL 2/ })
    .click();
  await expect(page.locator('[data-refusal]')).toContainText('Refused on channel 2.');
});
