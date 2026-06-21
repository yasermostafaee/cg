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
  test('author a ticker → edit items → data key → live preview update → crawl', async ({ app }) => {
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
    // field, seeded from the authored items. D-087 — the stage is blank until
    // Play, so the live edits are verified on the running crawl after Play.
    await app.openPreviewModal();
    await expect(app.tickerItemInput('headlines', 1, app.previewDialog)).toHaveValue(
      'سرخط نخست E2E',
    );
    await app.tickerItemInput('headlines', 1, app.previewDialog).fill('خبر فوری — Brand X');

    // Append an item through the preview form.
    await app.addTickerItem(app.previewDialog);
    await app.tickerItemInput('headlines', 4, app.previewDialog).fill('آیتم تازه');

    // Play: the crawl starts — the static authoring row is replaced by the
    // treadmill's fed item spans, carrying BOTH the edited and the appended item.
    await app.play();
    await expect(app.previewFrame.locator('[data-cg-ticker-static]')).toHaveCount(0);
    await expect(
      app.previewFrame.locator('[data-cg-ticker-item]', { hasText: 'خبر فوری — Brand X' }).first(),
    ).toBeAttached();
    await expect(
      app.previewFrame.locator('[data-cg-ticker-item]', { hasText: 'آیتم تازه' }).first(),
    ).toBeAttached();
    await app.stop();
  });

  test('a finite ticker (repeat=2, drain seam) COMPLETES a content-driven hold — the stage settles on its own', async ({
    app,
  }) => {
    await app.newProject('TickerFinite');
    await app.addTicker();

    // Inner loop: 2 passes, drain seam; crank the speed so the run fits the
    // test budget (completion = (content×2 + spacer + viewport) / speed).
    await app.inspector.getByRole('combobox', { name: 'repeat' }).selectOption('count');
    await app.page.getByLabel('passes', { exact: true }).fill('2');
    await app.page.getByLabel('passes', { exact: true }).press('Enter');
    await app.inspector.getByRole('combobox', { name: 'cycle seam' }).selectOption('drain');
    await app.page.getByLabel('speed', { exact: true }).fill('3000');
    await app.page.getByLabel('speed', { exact: true }).press('Enter');

    // Outer loop: auto-out whose hold ends when the ticker completes.
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');

    await app.openPreviewModal();
    await app.play();
    // The crawl runs its two passes, drains, signals completion → the
    // composition plays its outro and settles hidden — with NO stop() sent.
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/, {
      timeout: 20_000,
    });
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
