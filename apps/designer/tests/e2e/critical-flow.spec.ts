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

    // Preview reflects the bound value, and a live field edit updates the stage.
    await app.openPreviewModal();
    await expect(app.previewFrame.getByText('New text')).toBeVisible();
    await app.setPreviewField('headline', 'Hello E2E');
    await expect(app.previewFrame.getByText('Hello E2E')).toBeVisible();

    // Transport commands run without error and the content persists.
    await app.play();
    await expect(app.previewFrame.getByText('Hello E2E')).toBeVisible();
    await app.stop();
    await expect(app.previewFrame.getByText('Hello E2E')).toBeVisible();

    // Close the preview and export a single-file HTML (captured via the download).
    await app.previewDialog.getByRole('button', { name: 'Close' }).click();
    const { filename, html } = await app.exportHtml();
    expect(filename).toMatch(/\.html$/);
    expect(html).toContain('<!doctype html');
    // The exported HTML embeds the bound field as a GDD data key.
    expect(html.toLowerCase()).toContain('headline');
  });
});
