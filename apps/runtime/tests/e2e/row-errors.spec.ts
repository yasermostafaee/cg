import type { Page } from '@playwright/test';
import { buildInvalidVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `B-301` (`CONSOLE-POLISH-01` §2) — **THE LAYERS BADGE COUNTS CURRENT ROW ERRORS, AND CLEARS.**
 *
 * The owner's own-PC run of `0.10.0` (2026-09-30): he imported two broken templates, the import failed
 * (right), and the Layers header read `2 in error` and never cleared. A failed import is said once,
 * where it happened — the picker — and is never counted; the badge counts rows in error, lists them on
 * a press, and each can be dismissed. The row error comes from the mock's one-shot seam
 * (`CG_E2E_REFUSE_NEXT_TAKE`), shaped as the bridge records a take CasparCG refused.
 */

const badge = (page: Page) => page.locator('[data-layers-tally-error]');

test('🔴 a broken .vcg import fails in the picker with its reason, and the badge stays at 0', async ({
  app,
}) => {
  const { page } = app;
  await app.openTemplatePicker();
  const chooser = page.waitForEvent('filechooser');
  await app.templatePicker.getByRole('button', { name: 'Import a .vcg' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'broken.vcg',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(buildInvalidVcg()),
  });
  // Said ONCE, where it happened, with its reason.
  await expect(app.templatePicker.locator('[data-modal-message]')).toContainText(
    '“broken.vcg” failed verification',
  );
  await app.closeTemplatePicker();
  // …and never counted as a row error.
  await expect(badge(page)).toHaveCount(0);
});

test('🔴 a real row error counts, is listed by its row and coordinate, and is dismissed for good — control: a take that lands clears one too', async ({
  app,
}) => {
  const { page } = app;
  const row = app.layerRow(96);
  const refuse = (): Promise<void> =>
    page.evaluate(() => {
      (window as unknown as { CG_E2E_REFUSE_NEXT_TAKE?: unknown }).CG_E2E_REFUSE_NEXT_TAKE = {
        code: 'amcp-403',
        command: 'CG 1-96 PLAY 0',
      };
    });

  // A take CasparCG refused: the row in ERROR, and the badge counts it.
  await refuse();
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row).toContainText('ERROR');
  await expect(badge(page)).toHaveText('1 in error');

  // Pressed: the rows in error, by name and real coordinate, the reason in words.
  await badge(page).click();
  const list = page.getByRole('dialog', { name: 'Rows in error' });
  await expect(list).toBeVisible();
  const entry = list.locator('[data-row-error]');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('1-96');
  await expect(entry.locator('[data-row-error-why]')).not.toHaveText('');
  await expect(entry).not.toContainText('amcp-403');

  // Dismissed: the badge is gone, and the row reads what it settled to — no longer ERROR.
  await entry.locator('[data-row-error-dismiss]').click();
  await expect(badge(page)).toHaveCount(0);
  await expect(list).toHaveCount(0);
  await expect(row).not.toContainText('ERROR');

  // CONTROL — refused again, the badge counts it again; a take that LANDS clears it.
  await refuse();
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(badge(page)).toHaveText('1 in error');
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row).toContainText('ON AIR');
  await expect(badge(page)).toHaveCount(0);
});
