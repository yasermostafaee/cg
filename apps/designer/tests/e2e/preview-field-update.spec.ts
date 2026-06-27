import { test, expect } from './fixtures/designer.js';

/**
 * D-106 — the preview field form. Editing a field value no longer updates the
 * stage in realtime: edits are PENDING until an explicit Update (a global "Update
 * all" or a per-field Update). Long text values render in an auto-grow textarea.
 */
test.describe('D-106 — preview field form: explicit Update + textarea', () => {
  test('edits are pending until Update; a per-field Update applies one; Update all applies the rest', async ({
    app,
  }) => {
    await app.newProject('FieldUpdate');
    // Two bound text fields.
    await app.addTextElement({ x: 200, y: 110 });
    await app.setDataKey('headline');
    await app.addTextElement({ x: 200, y: 200 });
    await app.setDataKey('subtitle');

    await app.openPreviewModal();
    await app.play();

    // Edit both fields — the edits are PENDING; the stage does NOT change.
    await app.setPreviewField('headline', 'HEAD');
    await app.setPreviewField('subtitle', 'SUB');
    await expect(app.previewFrame.getByText('HEAD')).toBeHidden();
    await expect(app.previewFrame.getByText('SUB')).toBeHidden();

    // A per-field Update applies ONLY that field; the other stays pending.
    await app.updatePreviewField('headline');
    await expect(app.previewFrame.getByText('HEAD')).toBeVisible();
    await expect(app.previewFrame.getByText('SUB')).toBeHidden();

    // "Update all" applies the remaining pending field.
    await app.updateAllPreviewFields();
    await expect(app.previewFrame.getByText('SUB')).toBeVisible();
  });

  test('a text field renders as a multi-line textarea so long values are visible', async ({
    app,
  }) => {
    await app.newProject('LongText');
    await app.addTextElement({ x: 200, y: 140 });
    await app.setDataKey('headline');

    await app.openPreviewModal();
    const field = app.previewDialog.getByLabel('headline');
    await expect(field).toBeVisible();
    // The preview input is a <textarea> (auto-grow), not a single-line <input>.
    await expect(field).toHaveJSProperty('tagName', 'TEXTAREA');
  });
});
