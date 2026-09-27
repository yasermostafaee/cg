import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `ROUTE-PLATES-01` — **CONTRACT v1.3'S LINES, ON THE ROW AND IN ITS INSPECTOR, IN THE ROW'S OWN
 * CHANNEL VIEW, AND NOTHING ELSE SAYING THEM.**
 *
 *   - rule 5: `<row> · Plate N: waiting for the Playout's input list.` — a Playout route whose epoch
 *     could not be confirmed stays empty, and says so;
 *   - rule 1: `<row> · Plate N: “ورودی ۴” can't be shown on CH n.` — an input the Playout does not
 *     offer for this row's channel is refused before any AMCP;
 *   - C4: `Backup: live boxes not mirrored.` — a backup is declared and the row carries a route.
 *
 * The wire half of each is `tools/caspar-bridge/tests/route-plates.integration.test.ts`; what only
 * this can prove is what the operator SEES. The two refusals come from the mock's one-shot switch
 * seam (`CG_E2E_REFUSE_NEXT_SWITCH`) on the seeded look-bearing row, shaped exactly as the bridge
 * records them; the backup line from its one-shot take seam (`CG_E2E_BACKUP_UNMIRRORED_NEXT_TAKE`).
 *
 * ⚠ The row's line is read with the Inspector CLOSED: opening it narrows the table, and the narrow
 * density drops the cell the line is in — so an absence read with it open would prove nothing.
 */

// The row's name is composed by the console; the plate label and the clause are the refusal's.
// `live-3` is the seeded template's third plate, and the `right` look needs it.
const WAITING_TAIL = / · Plate 3: waiting for the Playout's input list\.$/;
const NOT_SHOWABLE_TAIL = / · Plate 3: “ورودی ۴” can't be shown on CH 1\.$/;
const BACKUP_LINE = 'Backup: live boxes not mirrored.';

for (const { what, refusal, tail } of [
  {
    what: 'rule 5 — a route that waits for the Playout’s input list',
    refusal: { code: 'route-epoch-waiting', plateId: 'live-3', sourceOrigin: 'input' },
    tail: WAITING_TAIL,
  },
  {
    what: 'rule 1 — an input the Playout does not offer on this channel',
    refusal: {
      code: 'source-not-showable',
      plateId: 'live-3',
      sourceId: 'in-input-4',
      sourceName: 'ورودی ۴',
      sourceOrigin: 'input',
    },
    tail: NOT_SHOWABLE_TAIL,
  },
]) {
  test(`🔴 ${what}: one line naming the plate, on the row and in its Inspector — no banner, no code`, async ({
    app,
  }) => {
    const { page } = app;
    const row = app.fixedRow(99); // the seeded look-bearing row, on air, on channel 1
    await row.scrollIntoViewIfNeeded();
    const seg = (id: string) => row.locator(`[data-look-id="${id}"]`);
    await expect(seg('left')).toHaveAttribute('aria-pressed', 'true');
    // THE BASELINE, measured: no line before the refusal, so the line below is the refusal's.
    await expect(row.locator('[data-take-refusal]')).toHaveCount(0);

    await page.evaluate((armed) => {
      (window as unknown as { CG_E2E_REFUSE_NEXT_SWITCH?: unknown }).CG_E2E_REFUSE_NEXT_SWITCH =
        armed;
    }, refusal);
    await seg('right').click();

    // ON THE ROW: the one line, naming the plate by its position — and the row on its old look.
    await expect(row.locator('[data-take-refusal]')).toHaveText(tail);
    await expect(seg('left')).toHaveAttribute('aria-pressed', 'true');
    // …nothing else says it: no banner, and none of the bridge's vocabulary on the page…
    await expect(page.locator('[data-refusal]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/epoch|not-showable|AMCP/i);
    // …and its Inspector says the same line.
    await app.selectLayerRow(99);
    await expect(page.locator('[data-inspector-take-refusal]')).toHaveText(tail);
    await app.selectLayerRow(99); // toggles it closed again
    await expect(page.locator('[data-inspector-take-refusal]')).toHaveCount(0);
    await expect(row.locator('[data-take-refusal]')).toHaveText(tail);

    // CONTROL — the next switch lands, and the line goes with it; the cell is still drawn.
    await seg('right').click();
    await expect(seg('right')).toHaveAttribute('aria-pressed', 'true');
    await expect(row.locator('[data-take-refusal]')).toHaveCount(0);
    await expect(row).toContainText('Debate — 4 box');
  });
}

test('🔴 C4 — a row whose live boxes are not mirrored says so, on the row and in its Inspector; control: it goes with the row’s seats', async ({
  app,
}) => {
  const { page } = app;
  // Row 96 is the seed's idle TICKER row, on channel 1.
  const row = app.layerRow(96);
  // THE BASELINE, measured: no row carries the line before the take.
  await expect(page.locator('[data-backup-unmirrored]')).toHaveCount(0);

  await page.evaluate(() => {
    (
      window as unknown as { CG_E2E_BACKUP_UNMIRRORED_NEXT_TAKE?: boolean }
    ).CG_E2E_BACKUP_UNMIRRORED_NEXT_TAKE = true;
  });
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row).toContainText('ON AIR');
  await expect(row.locator('[data-backup-unmirrored]')).toHaveText(BACKUP_LINE);
  // It is a state fact, not a refusal: no banner raises it.
  await expect(page.locator('[data-refusal]')).toHaveCount(0);
  await app.selectLayerRow(96);
  await expect(page.locator('[data-inspector-backup-unmirrored]')).toHaveText(BACKUP_LINE);
  await app.selectLayerRow(96); // toggles it closed again
  const line = row.locator('[data-backup-unmirrored]');
  await expect(line).toHaveText(BACKUP_LINE);
  // The cell keeps the template's name on its title (`<line> — <template>`): the control's anchor.
  const template = ((await line.getAttribute('title')) ?? '').split(' — ').slice(1).join(' — ');
  expect(template, 'the cell names its template on the title').not.toBe('');

  // CONTROL — the row comes off air, its seats go, and the line goes with them; the same cell now
  // draws the template's name, so the absence is read off a cell that is there.
  await row.getByRole('button', { name: 'CLEAR' }).click();
  await page
    .getByRole('dialog', { name: /^Clear / })
    .getByRole('button', { name: 'Clear layer', exact: true })
    .click();
  await expect(line).toHaveCount(0);
  await expect(row).toContainText(template);
  await app.selectLayerRow(96);
  await expect(page.locator('[data-inspector-backup-unmirrored]')).toHaveCount(0);
});
