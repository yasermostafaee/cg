import { test, expect } from './fixtures/designer.js';

/**
 * D-071 Phase A — the EXPORT-ONLY off-frame filter, in the real browser. A fully
 * off-frame STATIC element is dropped from the broadcast preview render and the
 * generated export (both fed by `scopeSceneToComposition`), while the editor canvas
 * (fed by `editSceneOf`) keeps it. An element with a transform keyframe is KEPT
 * (conservative — it could move onto the frame). Per-driver-kind / boundary cases are
 * pinned deterministically in `tests/off-frame-export-filter.test.ts`.
 */
test.describe('Off-frame export filter (D-071 Phase A)', () => {
  test('a static off-frame element is dropped from preview + export, kept on the canvas', async ({
    app,
  }) => {
    await app.newProject('OffFrame');
    await app.addRectangle({ x: 240, y: 200 });

    // Park it fully off-frame via the inspector X field (the frame is 1920 wide).
    const xField = app.inspector.getByRole('spinbutton', { name: 'X position' });
    await xField.fill('5000');
    await xField.press('Enter');

    // Canvas (editSceneOf, unfiltered) KEEPS it — the node is still in the DOM.
    const canvasFrame = app.page.frameLocator('iframe[title="cgpreview"]');
    await expect(canvasFrame.locator('[data-cg-element-id]')).toHaveCount(1);

    // Broadcast preview (scopeSceneToComposition, filtered) DROPS it — no node.
    await app.openPreviewModal();
    await expect(app.previewFrame.locator('[data-cg-element-id]')).toHaveCount(0);
    await app.previewDialog.getByRole('button', { name: 'Close' }).click();

    // Export (same filter) DROPS it — no shape in the embedded scene.
    const { html } = await app.exportHtml();
    expect(html).toContain('<!doctype html');
    expect((html.match(/"type":"shape"/g) ?? []).length).toBe(0);
  });

  test('an animated off-frame element (transform keyframe) is KEPT in preview + export', async ({
    app,
  }) => {
    await app.newProject('OffFrameAnim');
    await app.addRectangle({ x: 240, y: 200 });

    // A position.x keyframe makes it "animated" — it could move onto the frame, so the
    // conservative filter must KEEP it even when currently parked off-frame.
    await app.page
      .getByRole('button', { name: /Toggle keyframe for position\.x/ })
      .first()
      .click();
    const xField = app.inspector.getByRole('spinbutton', { name: 'X position' });
    await xField.fill('5000');
    await xField.press('Enter');

    // Broadcast preview KEEPS the animated element (node present).
    await app.openPreviewModal();
    await expect(app.previewFrame.locator('[data-cg-element-id]')).toHaveCount(1);
    await app.previewDialog.getByRole('button', { name: 'Close' }).click();

    // Export KEEPS it.
    const { html } = await app.exportHtml();
    expect((html.match(/"type":"shape"/g) ?? []).length).toBe(1);
  });
});
