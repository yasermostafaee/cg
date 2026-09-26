import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `FIELD-FIXES-01` B — **A REFUSED TAKE IS SAID ON ITS ROW AND IN ITS INSPECTOR, IN ONE LINE
 * NAMING THE ROW AND THE SOURCE, IN THAT CHANNEL'S VIEW ONLY.** No banner repeats it; another
 * channel's view shows only the strip's mark. Control: the next take that lands clears it.
 *
 * The refusal comes from the mock's one-shot seam (`CG_E2E_REFUSE_NEXT_TAKE`), shaped exactly as
 * the bridge records the owner's case (`take-all-or-nothing.integration.test.ts`): the offline
 * mock's sends always land, so there is no other way to refuse one at the wire.
 */

const REFUSAL = {
  code: 'amcp-403',
  command: 'PLAY 1-60 DECKLINK DEVICE 1',
  plateId: 'plate-1',
  sourceId: 'src-studio1',
  sourceName: 'studio1',
};
const LINE = 'TICKER · studio1 (DeckLink 1): the server has no such input, or it is in use.';

const strip = (page: Page) => page.getByRole('tablist', { name: 'Channels' });
const markOn = (page: Page, channel: number) =>
  strip(page).locator(`#channel-${String(channel)} [data-tab-signal]`);

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

test('🔴 a refused take is said on its row and in its Inspector, in its channel only — and the next take clears it', async ({
  app,
}) => {
  const { page } = app;
  await declareSecondChannel(page);
  // THE BASELINE, measured: channel 1 carries no mark before the refusal, so the mark below is
  // the refusal's and the control's "gone" is not a mark that was never there.
  await strip(page)
    .getByRole('tab', { name: /^CHANNEL 2/ })
    .click();
  await expect(markOn(page, 1)).toHaveCount(0);
  await strip(page)
    .getByRole('tab', { name: /^CHANNEL 1/ })
    .click();

  // Row 96 is the seed's idle TICKER row, on channel 1.
  const row = app.layerRow(96);
  await page.evaluate((refusal) => {
    (window as unknown as { CG_E2E_REFUSE_NEXT_TAKE?: unknown }).CG_E2E_REFUSE_NEXT_TAKE = refusal;
  }, REFUSAL);
  await row.getByRole('button', { name: 'PLAY' }).click();

  // ON THE ROW: its ERROR state, and the one line.
  await expect(row).toContainText('ERROR');
  await expect(row.locator('[data-take-refusal]')).toHaveText(LINE);
  // …and NOWHERE ELSE: no banner, and the number nowhere on the page.
  await expect(page.locator('[data-refusal]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/AMCP/);

  // IN ITS INSPECTOR: the same line.
  await app.selectLayerRow(96);
  await expect(page.locator('[data-inspector-take-refusal]')).toHaveText(LINE);

  // ANOTHER CHANNEL'S VIEW: no line, no banner — only the mark on channel 1's tab.
  await strip(page)
    .getByRole('tab', { name: /^CHANNEL 2/ })
    .click();
  await expect(page.locator('[data-take-refusal]')).toHaveCount(0);
  await expect(page.locator('[data-refusal]')).toHaveCount(0);
  await expect(markOn(page, 1)).toHaveAttribute('data-tab-signal', 'warning');

  // CONTROL — a take that lands clears the line, in the row and the Inspector, and the mark.
  await strip(page)
    .getByRole('tab', { name: /^CHANNEL 1/ })
    .click();
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row).toContainText('ON AIR');
  await expect(row.locator('[data-take-refusal]')).toHaveCount(0);
  await expect(page.locator('[data-inspector-take-refusal]')).toHaveCount(0);
  await strip(page)
    .getByRole('tab', { name: /^CHANNEL 2/ })
    .click();
  await expect(markOn(page, 1)).toHaveCount(0);
});
