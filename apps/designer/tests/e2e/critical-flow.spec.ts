import { test, expect } from './fixtures/designer.js';

/**
 * The critical end-to-end flow (P-005): create a composition → add a text element
 * with a data key → preview and edit the field value live → run the lifecycle
 * transport → export a single-file HTML. Composed entirely from the shared fixtures.
 */
test.describe('Designer critical flow', () => {
  test('compose → data key → live preview → transport → export HTML', async ({ app }) => {
    // Create a project (opens one composition) and add a text element.
    await app.newProject('Critical');
    await app.addTextElement({ x: 240, y: 140 });

    // Give it a data key → a field is created (seeded from the element's text).
    await app.setDataKey('headline');
    await expect(app.dataKeyInput).toHaveValue('headline');

    // D-087 — the preview opens loaded-but-unpainted (blank until Play). Play paints
    // the bound value. D-106 — a field edit is PENDING and does NOT touch the stage
    // until an explicit Update is applied.
    await app.openPreviewModal();
    await expect(app.previewFrame.getByText('New text')).toBeHidden();
    await app.play();
    await expect(app.previewFrame.getByText('New text')).toBeVisible();
    await app.setPreviewField('headline', 'Hello E2E');
    await expect(app.previewFrame.getByText('Hello E2E')).toBeHidden(); // pending, not applied
    await app.updateAllPreviewFields();
    await expect(app.previewFrame.getByText('Hello E2E')).toBeVisible();

    // Stop runs the outro and settles the stage blank again.
    await app.stop();
    await expect(app.previewFrame.getByText('Hello E2E')).toBeHidden();

    // Close the preview and export a single-file HTML (captured via the download).
    await app.previewDialog.getByRole('button', { name: 'Close' }).click();
    const { filename, html } = await app.exportHtml();
    expect(filename).toMatch(/\.html$/);
    expect(html).toContain('<!doctype html');
    // The exported HTML embeds the bound field as a GDD data key.
    expect(html.toLowerCase()).toContain('headline');
  });
});
