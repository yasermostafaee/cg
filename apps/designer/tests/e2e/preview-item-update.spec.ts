import { test, expect } from './fixtures/designer.js';

/**
 * D-106 follow-up — PER-INPUT Update granularity in the preview field form.
 *
 * A ticker / sequence binds to a `list` field. The corrected requirement: instead
 * of ONE per-field Update for the WHOLE list, EACH item input carries its OWN
 * Update button, ENABLED only when that specific item has an unsaved change, and
 * clicking it applies ONLY that item (the others stay pending). Plus the single
 * global "Update all".
 *
 * This is the neutralize-and-confirm guard for the real user-visible behavior:
 * editing one item input enables only its Update, and applying it leaves the
 * other edited items still pending. Reverting to per-field granularity (one
 * Update for the whole list) makes this FAIL — there would be zero per-item
 * Update buttons and a per-field "Update field" button instead.
 */
test.describe('D-106 follow-up — preview form: PER-ITEM (per-input) Update', () => {
  test('each ticker item input has its OWN Update, enabled independently; applying one leaves the others pending', async ({
    app,
  }) => {
    await app.newProject('PerItemUpdate');
    await app.addTicker({ x: 120, y: 200 });
    // A data key binds the ticker's (3 sample) items to a `list` field, so the
    // preview form renders the items editor for it.
    await app.setDataKey('headlines');

    await app.openPreviewModal();
    const itemUpdate = (n: number) =>
      app.previewDialog.getByRole('button', {
        name: `Update headlines item ${String(n)}`,
        exact: true,
      });

    // PER-INPUT: one Update button PER item (3), NO single per-field Update for the
    // whole list (the per-item buttons replace it), and NO bare global "Update".
    await expect(
      app.previewDialog.getByRole('button', { name: /^Update headlines item / }),
    ).toHaveCount(3);
    await expect(app.previewDialog.getByRole('button', { name: /^Update field / })).toHaveCount(0);
    await expect(
      app.previewDialog.getByRole('button', { name: 'Update', exact: true }),
    ).toHaveCount(0);
    // Nothing edited yet → every per-item Update is DISABLED.
    await expect(itemUpdate(1)).toBeDisabled();
    await expect(itemUpdate(2)).toBeDisabled();
    await expect(itemUpdate(3)).toBeDisabled();

    // Edit item 1 → ONLY item 1's Update enables (items 2 + 3 stay disabled).
    await app.tickerItemInput('headlines', 1, app.previewDialog).fill('FIRST');
    await expect(itemUpdate(1)).toBeEnabled();
    await expect(itemUpdate(2)).toBeDisabled();
    await expect(itemUpdate(3)).toBeDisabled();

    // Edit item 2 → item 2's Update also enables, INDEPENDENTLY of item 1.
    await app.tickerItemInput('headlines', 2, app.previewDialog).fill('SECOND');
    await expect(itemUpdate(1)).toBeEnabled();
    await expect(itemUpdate(2)).toBeEnabled();

    // Apply ONLY item 1 → its Update disables (committed); item 2 STAYS pending.
    await itemUpdate(1).click();
    await expect(itemUpdate(1)).toBeDisabled();
    await expect(itemUpdate(2)).toBeEnabled();
  });
});
