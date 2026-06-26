import { test, expect } from './fixtures/designer.js';

/**
 * D-102 Phase 1 — per-element ticker timing overrides in the preview. Two tickers in one
 * composition are tuned INDEPENDENTLY: each ticker's own cycle-seam override applies to its OWN
 * driver, and the stored scene is untouched (session-only). The runtime stamps each band's
 * EFFECTIVE (post-override) timing as `data-cg-ticker-boundary` (and `-repeat`), so the canvas
 * (stored values) and the preview (overridden values) are directly comparable. The per-ticker
 * repeat dimension is covered by the clock/ticker-runtime unit tests; here we drive the seam
 * Select (robust, like the existing per-scope timing controls). Tickers + their panel rows are in
 * document order (both default to the name "Ticker").
 */
test.describe('Per-element ticker timing overrides (D-102 Phase 1)', () => {
  test('two tickers honor their own cycle-seam independently; stored scene unchanged', async ({
    app,
  }) => {
    await app.newProject('TwoTickers');
    await app.addTicker({ x: 120, y: 140 }); // ticker A — first in document order
    await app.addTicker({ x: 120, y: 240 }); // ticker B — second (both well within the canvas)

    // The authoring canvas stamps each band's stored timing — both seamless.
    const canvasBands = app.canvasFrame.locator('[data-cg-ticker-boundary]');
    await expect(canvasBands).toHaveCount(2);

    await app.openPreviewModal();

    // The preview timing panel shows ONE cycle-seam row per ticker (not one shared per-scope slot);
    // the two same-named tickers are disambiguated ("Ticker (1)" / "Ticker (2)").
    const seam = app.previewDialog.getByRole('combobox', { name: /ticker cycle boundary/ });
    await expect(seam).toHaveCount(2);
    await seam.first().selectOption('drain'); // ticker A → drain
    await seam.nth(1).selectOption('seamless'); // ticker B → seamless (explicit)

    // Each PREVIEW band now runs its OWN seam — independent (A drain, B seamless).
    const previewBands = app.previewFrame.locator('[data-cg-ticker-boundary]');
    await expect(previewBands.first()).toHaveAttribute('data-cg-ticker-boundary', 'drain');
    await expect(previewBands.nth(1)).toHaveAttribute('data-cg-ticker-boundary', 'seamless');

    // Session-only — the STORED scene (the authoring canvas) is unchanged: both still seamless.
    await expect(canvasBands.first()).toHaveAttribute('data-cg-ticker-boundary', 'seamless');
    await expect(canvasBands.nth(1)).toHaveAttribute('data-cg-ticker-boundary', 'seamless');
  });
});
