import { test, expect } from './fixtures/designer.js';

/**
 * D-071 Phase B — the editor PASTEBOARD: a dark area beyond the frame (to the
 * right/bottom) where the author parks/sees/moves shapes. They render + are
 * selectable in authoring and persist in save, but are EXCLUDED from the broadcast
 * preview + export (Phase A still drops them, through the new authoring flag). On-
 * frame editing is unchanged; the broadcast modal still blanks-until-play (D-087).
 */
test.describe('Editor pasteboard (D-071 Phase B)', () => {
  test('an off-frame shape is dropped from the broadcast preview + export but kept on the canvas; the modal still blanks-until-play', async ({
    app,
  }) => {
    await app.newProject('Pasteboard');
    await app.addRectangle({ x: 240, y: 200 });

    // Park it on the pasteboard, off the right edge (frame is 1920 wide).
    const xField = app.inspector.getByRole('spinbutton', { name: 'X position' });
    await xField.fill('2000');
    await xField.press('Enter');

    // Canvas (authoring) KEEPS it — the node is rendered (into the pasteboard).
    const canvasFrame = app.page.frameLocator('iframe[title="cgpreview"]');
    await expect(canvasFrame.locator('[data-cg-element-id]')).toHaveCount(1);

    // Broadcast preview DROPS it (Phase A through the new flag) AND still blanks
    // until Play (D-087 intact).
    await app.openPreviewModal();
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/); // D-087
    await expect(app.previewFrame.locator('[data-cg-element-id]')).toHaveCount(0); // Phase A
    await app.previewDialog.getByRole('button', { name: 'Close' }).click();

    // Export DROPS it.
    const { html } = await app.exportHtml();
    expect(html).toContain('<!doctype html');
    expect((html.match(/"type":"shape"/g) ?? []).length).toBe(0);
  });

  test('the pasteboard lifts the frame clip so off-frame shapes render + stay selected; on-frame select/drag is unchanged', async ({
    app,
  }) => {
    await app.newProject('PasteboardEdit');
    await app.addRectangle({ x: 240, y: 200 });
    const canvasFrame = app.page.frameLocator('iframe[title="cgpreview"]');
    const shape = canvasFrame.locator('[data-cg-element-id]');

    // On-frame control: the shape is selected on add (gizmo shown) and DRAGGABLE on
    // the canvas exactly as before — no hit-test regression.
    await expect(app.gizmoFrame).toBeVisible();
    const xField = app.inspector.getByRole('spinbutton', { name: 'X position' });
    const x0 = Number(await xField.inputValue());
    const box = (await shape.boundingBox())!;
    await app.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await app.page.mouse.down();
    await app.page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
    await app.page.mouse.up();
    await expect.poll(async () => Number(await xField.inputValue())).toBeGreaterThan(x0); // dragged

    // The canvas runs in AUTHORING mode: the frame clip is LIFTED so off-frame
    // shapes paint into the pasteboard (the broadcast modal + export keep the clip).
    const overflowX = await canvasFrame
      .locator('.cg-stage')
      .evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe('visible');

    // Park it off-frame: it stays RENDERED (into the pasteboard, not clipped away)
    // and stays SELECTED — the overlay's gizmo tracks it off-frame.
    await xField.fill('2000');
    await xField.press('Enter');
    await expect(shape).toBeAttached();
    await expect(app.gizmoFrame).toBeAttached();
  });
});
