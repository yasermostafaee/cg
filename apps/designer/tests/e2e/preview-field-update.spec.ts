import { test, expect } from './fixtures/designer.js';

/**
 * D-106 — the preview field form. Editing a field stages a PENDING value (no
 * realtime apply); one explicit global "Update all" commits it. Update applies IN PLACE: the held graphic's
 * background + animation are untouched, only the bound values swap (CG UPDATE).
 * FIX 3 — long text values render in a real, visible multi-line textarea.
 */
test.describe('D-106/D-173 — preview field form: one Update all + apply-in-place + textarea', () => {
  test('Update all is the only commit action and applies IN PLACE (background kept)', async ({
    app,
  }) => {
    await app.newProject('Lower3rd');
    // Background: a start-trimmed rectangle — visible at the held frame but hidden
    // at frame 0, so a stray re-tick to frame 0 (the old bug) would make it vanish.
    await app.addRectangle({ x: 260, y: 220 });
    const rectId = (await app.timelineRowIds())[0]!;
    await app.trimElementStart(rectId, 30);
    // Three bound content fields.
    await app.addTextElement({ x: 120, y: 90 });
    await app.setDataKey('headline');
    await app.addTextElement({ x: 120, y: 130 });
    await app.setDataKey('subtitle');
    await app.addTextElement({ x: 120, y: 170 });
    await app.setDataKey('caption');

    await app.openPreviewModal();
    await app.play();
    const bg = app.previewFrame.locator(`[data-cg-element-id="${rectId}"]`);
    await expect(bg).toBeVisible(); // held: the background is present

    // Edit all three → one global Update all becomes available.
    await app.setPreviewField('headline', 'HEAD');
    await app.setPreviewField('subtitle', 'SUB');
    await app.setPreviewField('caption', 'CAP');
    await expect(app.previewDialog.getByRole('button', { name: /^Update field / })).toHaveCount(0);
    await expect(
      app.previewDialog.getByRole('button', { name: 'Update all', exact: true }),
    ).toBeEnabled();
    await expect(
      app.previewDialog.getByRole('button', { name: 'Update', exact: true }),
    ).toHaveCount(0);
    await expect(app.previewFrame.getByText('HEAD')).toBeHidden(); // pending — stage unchanged

    // Update all applies every prepared value in one in-place runtime update.
    await app.updateAllPreviewFields();
    await expect(app.previewFrame.getByText('HEAD')).toBeVisible();
    await expect(app.previewFrame.getByText('SUB')).toBeVisible();
    await expect(app.previewFrame.getByText('CAP')).toBeVisible();
    await expect(bg).toBeVisible(); // the background is not removed or replayed
    await expect(
      app.previewDialog.getByRole('button', { name: 'Update all', exact: true }),
    ).toBeDisabled();
  });

  test('FIX 3 — a long value renders as a visible multi-line textarea (full text, not truncated)', async ({
    app,
  }) => {
    await app.newProject('LongText');
    await app.addTextElement({ x: 200, y: 140 });
    await app.setDataKey('headline');

    await app.openPreviewModal();
    const field = app.previewDialog.getByRole('textbox', { name: 'headline', exact: true });
    await expect(field).toBeVisible();
    await expect(field).toHaveJSProperty('tagName', 'TEXTAREA'); // a real textarea, not a single-line input

    const long =
      'A long headline that wraps onto several lines and must stay fully visible in the preview form — not truncated or clipped by a single-line input.';
    await app.setPreviewField('headline', long);
    const box = await field.evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      return { scroll: t.scrollHeight, client: t.clientHeight };
    });
    expect(box.scroll).toBeLessThanOrEqual(box.client + 2); // auto-grown: full text fits, no clipping
    expect(box.client).toBeGreaterThan(28); // multi-line (more than a single row)
  });
});
