import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `FIELD-FIXES-01` K — **THE SILENCE CONTROLS ARE LIVE ONLY WHEN THERE IS SOMETHING TO SILENCE**,
 * measured in a real browser, because what the owner objected to is what the header LOOKS like: a
 * bright amber `SILENCE ALL PLATES · EVERY CHANNEL` with nothing to act on. Disabled, the chip takes
 * the neutral ground at the same size, so the header does not jump.
 *
 * The offline mock seats the news row's two plates on channel 1 (the `B-145` case); a CLEAR of that
 * row releases them, which is "no live plate anywhere".
 */

/** `--r-panic-bg` (#3c3019): the chip's amber ground. */
const PANIC_AMBER = 'rgb(60, 48, 25)';

async function declareSecondChannel(page: Page): Promise<void> {
  const ok = await page.evaluate(async () => {
    const cg = (window as unknown as { cg: typeof window.cg }).cg;
    const [first] = await cg.fixedLayers.banks();
    if (first === undefined) return false;
    const res = await cg.fixedLayers.setBanks({ banks: [first, { ...first, channel: 2 }] });
    return res.ok;
  });
  expect(ok, 'the second channel was declared').toBe(true);
}

const ground = (el: Locator): Promise<string> =>
  el.evaluate((node) => getComputedStyle(node).backgroundColor);

test('🔴 K — each silence control is amber and live only while its scope holds a live plate; otherwise neutral, disabled, the same size', async ({
  app,
}) => {
  const { page } = app;
  await declareSecondChannel(page);
  const every = page.locator('[data-app-header] [data-every-channel-panic]');

  // CONTROL — the seeded plates are live on channel 1: amber and live, the header's and the channel's.
  await expect(every).toBeEnabled();
  await expect(every).toHaveAttribute('data-silence-live', 'true');
  expect(await ground(every)).toBe(PANIC_AMBER);
  const height = (await every.boundingBox())?.height ?? 0;
  expect(height).toBeGreaterThan(0);
  await app.liveSourcesTab.click();
  const own = app.layers.locator('[data-plate-toolbar] [data-plate-panic]');
  await expect(own).toBeEnabled();
  expect(await ground(own)).toBe(PANIC_AMBER);

  // No live plate anywhere: CLEAR takes the news row out and the bridge releases its seats.
  await page.getByRole('tab', { name: /^layers/i }).click();
  const news = app.layers.locator('[data-item-id="item-irib-news"]');
  await news.getByRole('button', { name: 'CLEAR' }).click();
  await page
    .getByRole('dialog', { name: /^Clear / })
    .getByRole('button', { name: 'Clear layer', exact: true })
    .click();

  // 🔴 THE PROPERTY — disabled, neutral, and the same size: the header does not jump.
  await expect(every).toBeDisabled();
  await expect(every).toHaveAttribute('data-silence-live', 'false');
  // Polled: the chip's ground TRANSITIONS, and a read mid-transition is still the amber it left.
  await expect.poll(() => ground(every)).not.toBe(PANIC_AMBER);
  expect((await every.boundingBox())?.height).toBe(height);
  await expect(every).toHaveAttribute(
    'title',
    'Nothing to silence — no channel holds a live plate.',
  );
  // …and the channel's own tab lists no plate at all now, so its control is not there to be amber:
  // the plates tab shows its empty state (the toolbar, and its control, exist only beside plate
  // rows — with rows and no seat the control is disabled and neutral by the same predicate and the
  // same rule, `silenceHasTarget.test.ts`).
  await app.liveSourcesTab.click();
  await expect(app.layers.locator('[data-live-layers-known]')).toBeVisible();
  await expect(own).toHaveCount(0);
});
