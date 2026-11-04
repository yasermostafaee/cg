import { test, expect } from './fixtures/designer.js';

/**
 * D-106/D-173 — list values use the same single global commit action as scalar values. Item-level
 * check buttons crowded every row and duplicated Update all, so they are deliberately absent.
 */
test.describe('D-106/D-173 — preview list values use one Update all', () => {
  test('ticker items have no per-item checks and commit together through Update all', async ({
    app,
  }) => {
    await app.newProject('PerItemUpdate');
    await app.addTicker({ x: 120, y: 200 });
    // A data key binds the ticker's (3 sample) items to a `list` field, so the
    // preview form renders the items editor for it.
    await app.setDataKey('headlines');

    await app.openPreviewModal();
    await expect(
      app.previewDialog.getByRole('button', { name: /^Update headlines item / }),
    ).toHaveCount(0);
    await expect(app.previewDialog.getByRole('button', { name: /^Update field / })).toHaveCount(0);
    const updateAll = app.previewDialog.getByRole('button', { name: 'Update all', exact: true });
    await expect(updateAll).toBeDisabled();

    const firstItem = app.tickerItemInput('headlines', 1, app.previewDialog);
    // The authored ticker uses Persian digits; leading digits/punctuation are not strong letters.
    await firstItem.fill('۱۲۳ — خبر نخست');
    await expect(firstItem).toHaveValue('۱۲۳ — خبر نخست');
    await expect(firstItem).toHaveCSS('direction', 'rtl');
    await firstItem.fill('۱۲۳ — FIRST');
    await expect(firstItem).toHaveValue('۱۲۳ — FIRST');
    await expect(firstItem).toHaveCSS('direction', 'ltr');
    await app.tickerItemInput('headlines', 2, app.previewDialog).fill('SECOND');
    await expect(updateAll).toBeEnabled();
    await updateAll.click();
    await expect(updateAll).toBeDisabled();
  });

  test('Update all applies list edits IN PLACE and keeps the held background', async ({ app }) => {
    await app.newProject('PerItemInPlace');
    // Background: a start-trimmed rectangle — present at the held frame but hidden at
    // frame 0, so a stray re-tick to frame 0 (the old D-106 bug) would make it vanish.
    await app.addRectangle({ x: 260, y: 220 });
    const rectId = (await app.timelineRowIds())[0]!;
    await app.trimElementStart(rectId, 30);
    // A ticker bound to a list data key → the per-ITEM Update path (the new code path
    // the scalar apply-in-place test does not exercise).
    await app.addTicker({ x: 120, y: 120 });
    await app.setDataKey('headlines');

    await app.openPreviewModal();
    await app.play();
    const bg = app.previewFrame.locator(`[data-cg-element-id="${rectId}"]`);
    await expect(bg).toBeVisible(); // held: the background is present

    // Edit a ticker item, then apply through the single global action.
    await app.tickerItemInput('headlines', 1, app.previewDialog).fill('BREAKING — Brand X');
    const updateAll = app.previewDialog.getByRole('button', { name: 'Update all', exact: true });
    await expect(updateAll).toBeEnabled();
    await updateAll.click();

    // The held background is not torn down: this remains an in-place CG UPDATE.
    await expect(bg).toBeVisible();
    await expect(updateAll).toBeDisabled();
  });
});
