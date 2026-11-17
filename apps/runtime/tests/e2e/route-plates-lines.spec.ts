import type { StackItemState } from '@cg/shared-schema';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `ROUTE-PLATES-01` — **CONTRACT v1.3'S LINES, ON THE ROW AND IN ITS INSPECTOR, IN THE ROW'S OWN
 * CHANNEL VIEW, AND NOTHING ELSE SAYING THEM.**
 *
 *   - rule 5: `<row> · Plate N: waiting for the Playout's input list.` — a Playout route whose epoch
 *     could not be confirmed stays empty, and says so;
 *   - rule 1: `<row> · Plate N: “ورودی ۴” can't be shown on CH n.` — an input the Playout does not
 *     offer for this row's channel is refused before any AMCP;
 *   - C4: a local route refused on active engine B names that engine restriction on its row;
 *     the backup details explain when a row carries a route on the primary.
 *
 * The wire half of each is `tools/caspar-bridge/tests/route-plates.integration.test.ts`; what only
 * this can prove is what the operator SEES. The refusals come from the mock's one-shot switch
 * seam (`CG_E2E_REFUSE_NEXT_SWITCH`) on the seeded look-bearing row, shaped exactly as the bridge
 * records them; the backup line from its one-shot take seam (`CG_E2E_BACKUP_UNMIRRORED_NEXT_TAKE`).
 *
 * ⚠ The row's line is read with the Inspector CLOSED: opening it narrows the table, and the narrow
 * density drops the cell the line is in — so an absence read with it open would prove nothing.
 */

// The row's name is composed by the console; the plate label and the clause are the refusal's.
// `live-3` is the seeded template's third plate, and the `right` look needs it.
const WAITING_TAIL = / · Plate 3: waiting for the Playout's input list\.$/;
const ENGINE_UNSUPPORTED_TAIL =
  / · Plate 3: this Playout input cannot be routed to backup engine B\.$/;
const NOT_SHOWABLE_TAIL = / · Plate 3: “ورودی ۴” can't be shown on CH 1\.$/;
const LIVE_INPUT_NOTE = 'Live inputs routed through Playout remain on the primary engine.';

for (const { what, refusal, tail } of [
  {
    what: 'rule 5 — a route that waits for the Playout’s input list',
    refusal: { code: 'route-epoch-waiting', plateId: 'live-3', sourceOrigin: 'input' },
    tail: WAITING_TAIL,
  },
  {
    what: 'C4 — a local Playout route unsupported on backup engine B',
    refusal: { code: 'route-engine-unsupported', plateId: 'live-3', sourceOrigin: 'input' },
    tail: ENGINE_UNSUPPORTED_TAIL,
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
    await app.toggleLayerRow(99); // toggles it closed again
    await expect(page.locator('[data-inspector-take-refusal]')).toHaveCount(0);
    await expect(row.locator('[data-take-refusal]')).toHaveText(tail);

    // CONTROL — the next switch lands, and the line goes with it; the cell is still drawn.
    await seg('right').click();
    await expect(seg('right')).toHaveAttribute('aria-pressed', 'true');
    await expect(row.locator('[data-take-refusal]')).toHaveCount(0);
    await expect(row).toContainText('Debate — 4 box');
  });
}

test('backup coverage keeps the row short and explains live inputs from both surfaces', async ({
  app,
}) => {
  const { page } = app;
  const row = app.layerRow(96);
  const status = row.getByRole('button', { name: 'Backup incomplete' });
  const details = page.getByRole('dialog', { name: 'Backup details' });
  await expect(status).toHaveCount(0);
  await page.evaluate(() => {
    (
      window as unknown as { CG_E2E_BACKUP_UNMIRRORED_NEXT_TAKE?: boolean }
    ).CG_E2E_BACKUP_UNMIRRORED_NEXT_TAKE = true;
  });
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row).toContainText('ON AIR');
  await expect(status).toHaveText('B');
  await expect(row).not.toContainText(LIVE_INPUT_NOTE);
  await expect(page.locator('[data-refusal]')).toHaveCount(0);
  await status.focus();
  await page.keyboard.press('Enter');
  await expect(details).toContainText(LIVE_INPUT_NOTE);
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await expect(status).toBeFocused();

  await app.selectLayerRow(96);
  const inspectorStatus = app.inspector.getByRole('button', { name: 'Backup incomplete' });
  await expect(inspectorStatus).toHaveText('Backup incomplete');
  await inspectorStatus.click();
  await expect(details).toContainText(LIVE_INPUT_NOTE);
  await details.getByRole('button', { name: 'Close', exact: true }).click();
  await app.toggleLayerRow(96);
  await row.getByRole('button', { name: 'CLEAR' }).click();
  await page
    .getByRole('dialog', { name: /^Clear / })
    .getByRole('button', { name: 'Clear layer', exact: true })
    .click();
  await expect(status).toHaveCount(0);
});

test('backup media details retain full names and distinguish unread catalogues from missing copies', async ({
  app,
}) => {
  const { page } = app;
  const row = app.layerRow(96);
  const clips: NonNullable<StackItemState['backupNoCopy']> = [
    {
      plateId: 'p1',
      name: 'بخش ویژهٔ خبر شبانگاهی — News-Programme_Final-نسخه کامل.mov',
      reason: 'no-copy',
    },
    { plateId: 'p2', name: 'ستون خبری-Backup-15032026.mp4', reason: 'backup-unread' },
    { plateId: 'p3', name: 'Studio-fingerprint.mov', reason: 'no-fingerprint' },
    { plateId: 'p4', name: 'Studio-legacy-backup.mov', reason: 'backup-old' },
  ];
  await page.evaluate((next) => {
    const globals = window as unknown as {
      CG_E2E_BACKUP_NO_COPY_NEXT_TAKE?: StackItemState['backupNoCopy'];
      CG_E2E_BACKUP_UNMIRRORED_NEXT_TAKE?: boolean;
    };
    globals.CG_E2E_BACKUP_NO_COPY_NEXT_TAKE = next;
    globals.CG_E2E_BACKUP_UNMIRRORED_NEXT_TAKE = true;
  }, clips);
  await row.getByRole('button', { name: 'PLAY' }).click();
  const status = row.getByRole('button', { name: 'Backup incomplete' });
  await expect(status).toHaveCount(1);
  await expect(row).not.toContainText(clips[0]!.name);
  await status.click();

  const details = page.getByRole('dialog', { name: 'Backup details' });
  await expect(details.getByRole('listitem')).toHaveCount(4);
  const reasons = [
    'Matching copy missing from the backup media library.',
    'Backup media library unread.',
    'Primary media fingerprint missing.',
    'Backup Playout is older than 2.9.1.',
  ];
  for (const [index, clip] of clips.entries()) {
    const detail = details.getByRole('listitem').filter({ hasText: clip.name });
    await expect(detail.getByText(clip.name, { exact: true })).toBeVisible();
    await expect(detail).toContainText(reasons[index]!);
  }
  await expect(details).toContainText('Check media synchronization and library indexing');
  await expect(details).toContainText('Check the backup engine connection and Bridge sign-in.');
  await expect(details).toContainText(LIVE_INPUT_NOTE);
  await expect(page.locator('[data-refusal]')).toHaveCount(0);
});
