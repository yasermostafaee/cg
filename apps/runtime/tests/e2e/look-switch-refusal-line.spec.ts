import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `LOOK-SWITCH-01` / `B-273` — **A LOOK SWITCH REFUSED FOR A PLATE LEAVES THE ROW ON ITS OLD
 * LOOK, AND THE ROW SAYS WHICH SOURCE FAILED — `FIELD-FIXES-01`'s ONE LINE, WITH NO BANNER.**
 *
 * The owner's decision (2026-09-27): if any plate the new look needs is refused, the page never
 * moves, nothing on air changes, and the row shows the A/B line naming the plate's source, in that
 * channel's view only. The wire half (no page UPDATE, no commit after the hide, nothing touched) is
 * proven in `tools/caspar-bridge/tests/look-switch-all-or-nothing.integration.test.ts`; what only
 * this can prove is what the operator SEES.
 *
 * The refusal comes from the mock's one-shot seam (`CG_E2E_REFUSE_NEXT_SWITCH`), shaped as the
 * bridge records it: the offline mock's sends always land, so there is no other way to refuse one
 * at the wire. Control: the next switch lands, and the line goes with it.
 */

const REFUSAL = {
  code: 'amcp-404',
  command: 'PLAY 1-61 DECKLINK DEVICE 2',
  plateId: 'plate-2',
  sourceId: 'src-studio2',
  sourceName: 'studio2',
};
// The row's name is composed by the console; the source and the clause are the refusal's.
const LINE_TAIL = /· studio2 \(DeckLink 2\): the server has no such input, or it is in use\.$/;

test('🔴 a switch refused for a plate keeps the old look and says the source on the row, with no banner — and the next switch that lands clears it', async ({
  app,
}) => {
  const { page } = app;
  const row = app.fixedRow(99); // the seeded look-bearing row, on air
  await row.scrollIntoViewIfNeeded();
  const seg = (id: string) => row.locator(`[data-look-id="${id}"]`);
  await expect(seg('left')).toHaveAttribute('aria-pressed', 'true');
  // THE BASELINE, measured: no line before the refusal, so the line below is the refusal's.
  await expect(row.locator('[data-take-refusal]')).toHaveCount(0);

  await page.evaluate((refusal) => {
    (window as unknown as { CG_E2E_REFUSE_NEXT_SWITCH?: unknown }).CG_E2E_REFUSE_NEXT_SWITCH =
      refusal;
  }, REFUSAL);
  await seg('right').click();

  // ON THE ROW: the one line, naming the source that was refused…
  await expect(row.locator('[data-take-refusal]')).toHaveText(LINE_TAIL);
  // …while the row stays on its OLD look — nothing moved…
  await expect(seg('left')).toHaveAttribute('aria-pressed', 'true');
  await expect(seg('right')).toHaveAttribute('aria-pressed', 'false');
  // …and NOTHING ELSE says it: no banner, no AMCP code anywhere on the page.
  await expect(page.locator('[data-refusal]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/AMCP/);

  // CONTROL — the next switch lands (the seam is one-shot), and the line goes with it.
  await seg('right').click();
  await expect(seg('right')).toHaveAttribute('aria-pressed', 'true');
  await expect(row.locator('[data-take-refusal]')).toHaveCount(0);
});
