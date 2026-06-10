import { test, expect } from './fixtures/designer.js';

/**
 * D-028 — the ticker author → bind → live-edit scenario (the OpenSpec
 * "Author → bind → live-edit flow" + "List field drives the ticker"
 * scenarios driven through the real UI). Frame-precise crawl math (duration,
 * seams, reconcile) lives in @cg/template-runtime unit tests; this guards the
 * integrated path: tool → inspector items editor → data key → preview items
 * editor → live update → crawl runs.
 */
test.describe('Ticker / crawler (D-028)', () => {
  test('author a ticker → edit items → data key → live preview update → crawl', async ({
    app,
  }) => {
    await app.newProject('Ticker');
    await app.addTicker({ x: 120, y: 260 });

    // The inspector shows the ticker config + its items editor (3 sample items).
    await expect(app.inspector.getByText('Time-driven', { exact: false })).toBeVisible();
    await expect(app.tickerItemInput('Ticker', 3)).toBeVisible();

    // Edit an authored item — the canvas preview (static authoring row) shows it.
    await app.tickerItemInput('Ticker', 1).fill('سرخط نخست E2E');
    const canvasFrame = app.page.frameLocator('iframe[title="cgpreview"]');
    await expect(canvasFrame.getByText('سرخط نخست E2E')).toBeVisible();

    // A data key seeds a LIST field from the authored items.
    await app.setDataKey('headlines');
    await expect(app.dataKeyInput).toHaveValue('headlines');

    // The preview's data form renders the same items editor for the bound list
    // field, seeded from the authored items, and edits live-update the stage.
    await app.openPreviewModal();
    await expect(app.tickerItemInput('headlines', 1, app.previewDialog)).toHaveValue(
      'سرخط نخست E2E',
    );
    await app.tickerItemInput('headlines', 1, app.previewDialog).fill('خبر فوری — Brand X');
    await expect(app.previewFrame.getByText('خبر فوری — Brand X')).toBeVisible();

    // Append an item through the preview form and confirm it reaches the stage.
    await app.addTickerItem(app.previewDialog);
    await app.tickerItemInput('headlines', 4, app.previewDialog).fill('آیتم تازه');
    await expect(app.previewFrame.getByText('آیتم تازه')).toBeVisible();

    // Play: the crawl starts — the static authoring row is replaced by the
    // treadmill's fed item spans, and the band keeps rendering the items.
    await app.play();
    await expect(app.previewFrame.locator('[data-cg-ticker-static]')).toHaveCount(0);
    await expect(
      app.previewFrame.locator('[data-cg-ticker-item]', { hasText: 'خبر فوری — Brand X' }).first(),
    ).toBeAttached();
    await app.stop();
  });

  test('the exported single-file HTML carries the ticker and the GDD list field', async ({
    app,
  }) => {
    await app.newProject('TickerExport');
    await app.addTicker();
    await app.setDataKey('headlines');
    const { html } = await app.exportHtml();
    expect(html).toContain('"type":"ticker"');
    // GDD: the list field exports as a typed array property.
    const gdd = /<script name="graphics-data-definition"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(gdd?.[1] ?? '').toContain('"type":"array"');
  });
});
