import { test, expect } from './fixtures/designer.js';

/**
 * D-102 Phase 2 — the preview timing panel tunes SEQUENCES and COUNTDOWN clocks per element (as
 * Phase 1 did tickers), and it finally SURFACES a ticker that exists only inside a repeater's child
 * composition (the tree used to walk authored composition instances only, so those stamped tickers
 * were invisible). The runtime stamps each driver's EFFECTIVE (post-override) timing —
 * `data-cg-sequence-dwell`, `data-cg-countdown-ms`, `data-cg-ticker-boundary` — so the canvas
 * (stored values) and the preview (overridden values) are directly comparable, which is how we
 * prove the overrides are SESSION-ONLY.
 */

/** A child composition "Row" holding a ticker — the repeater stamps it per data row. */
async function buildRowChild(app: Parameters<Parameters<typeof test>[2]>[0]['app']): Promise<void> {
  await app.newComposition('Row');
  await app.openComposition('Row');
  await app.addTicker({ x: 120, y: 60 });
  await app.openComposition('comp1');
}

test.describe('Per-element preview timing — sequences, countdowns, repeater-stamped tickers (D-102 Phase 2)', () => {
  test('a sequence and a countdown each tune their OWN driver; the stored scene is unchanged', async ({
    app,
  }) => {
    await app.newProject('Phase2');
    await app.addSequence({ x: 160, y: 120 });
    await app.addClock({ x: 160, y: 260 });
    await app.setClockCountdown(60); // a 60s duration countdown → 60000 ms stored

    // The authoring canvas stamps each element's STORED timing.
    const canvasSeq = app.canvasFrame.locator('[data-cg-sequence-dwell]');
    const canvasCd = app.canvasFrame.locator('[data-cg-countdown-ms]');
    await expect(canvasSeq).toHaveAttribute('data-cg-sequence-dwell', '5000'); // authored default
    await expect(canvasCd).toHaveAttribute('data-cg-countdown-ms', '60000');

    await app.openPreviewModal();

    // Each content element gets its OWN row in the timing panel, labelled by its element name.
    const dwell = app.previewDialog.getByLabel(
      'Preview Sequence sequence item dwell in milliseconds',
    );
    const duration = app.previewDialog.getByLabel(
      'Preview Clock countdown duration in milliseconds',
    );
    await expect(dwell).toHaveValue('5000');
    await expect(duration).toHaveValue('60000');

    // Tune the sequence: only ITS driver changes — the countdown keeps its authored duration.
    await dwell.fill('800');
    await expect(app.previewFrame.locator('[data-cg-sequence-dwell]')).toHaveAttribute(
      'data-cg-sequence-dwell',
      '800',
    );
    await expect(app.previewFrame.locator('[data-cg-countdown-ms]')).toHaveAttribute(
      'data-cg-countdown-ms',
      '60000',
    );

    // Tune the countdown: rehearse the 60s break in 3s — the sequence keeps its 800ms dwell.
    await duration.fill('3000');
    await expect(app.previewFrame.locator('[data-cg-countdown-ms]')).toHaveAttribute(
      'data-cg-countdown-ms',
      '3000',
    );
    await expect(app.previewFrame.locator('[data-cg-sequence-dwell]')).toHaveAttribute(
      'data-cg-sequence-dwell',
      '800',
    );

    // Session-only — the STORED scene (the authoring canvas) is untouched by both.
    await expect(canvasSeq).toHaveAttribute('data-cg-sequence-dwell', '5000');
    await expect(canvasCd).toHaveAttribute('data-cg-countdown-ms', '60000');
  });

  test('a ticker inside a repeater child is listed, and one control governs every stamped row', async ({
    app,
  }) => {
    await app.newProject('Phase2Rep');
    await buildRowChild(app);
    await app.addRepeater({ x: 200, y: 120 }); // 3 seeded rows, each stamping the child's ticker

    // Three stamped rows on the canvas, each with the child's ticker at its STORED seam.
    const canvasBands = app.canvasFrame.locator('[data-cg-repeater-row] [data-cg-ticker-boundary]');
    await expect(canvasBands).toHaveCount(3);

    await app.openPreviewModal();

    // The panel surfaces the repeater child's ticker — ONE row (it governs the authored template
    // ticker), not one per data row.
    const seam = app.previewDialog.getByRole('combobox', { name: /ticker cycle boundary/ });
    await expect(seam).toHaveCount(1);
    await seam.selectOption('drain');

    // EVERY stamped row in the PREVIEW honors the authored ticker's override.
    const previewBands = app.previewFrame.locator(
      '[data-cg-repeater-row] [data-cg-ticker-boundary]',
    );
    await expect(previewBands).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await expect(previewBands.nth(i)).toHaveAttribute('data-cg-ticker-boundary', 'drain');
    }

    // Session-only — the stored scene (canvas) still shows the authored seamless seam on every row.
    for (let i = 0; i < 3; i += 1) {
      await expect(canvasBands.nth(i)).toHaveAttribute('data-cg-ticker-boundary', 'seamless');
    }
  });
});
