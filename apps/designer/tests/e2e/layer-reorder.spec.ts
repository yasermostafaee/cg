import { test, expect } from './fixtures/designer.js';

/**
 * D-047 — reorder layers by dragging a timeline row up/down to change the z-stack,
 * with a horizontal drop indicator. Maps the `designer-animation-timeline` reorder
 * scenarios to the real dock (the store math is unit-tested in
 * `tests/store-layer-reorder.test.ts`; this drives the actual pointer drag).
 */
test.describe('D-047 — layer reorder by dragging a timeline row', () => {
  test('dragging the bottom row to the top reorders the stack, and one undo reverts it', async ({
    app,
  }) => {
    await app.newProject('reorder');
    // Three shapes; newest is the TOP row, so rows top→bottom are [r3, r2, r1].
    await app.addRectangle({ x: 200, y: 120 });
    await app.addRectangle({ x: 240, y: 160 });
    await app.addRectangle({ x: 280, y: 200 });

    const before = await app.timelineRowIds();
    expect(before).toHaveLength(3);
    const [top, mid, bottom] = before;

    // Drag the bottom row up above the current top row → it becomes the new top.
    // Assert the drop indicator is visible mid-drag (before release).
    await app.dragRowAboveRow(bottom!, top!, async () => {
      await expect(app.reorderIndicator).toBeVisible();
    });

    expect(await app.timelineRowIds()).toEqual([bottom, top, mid]);
    // The indicator is gone once the drag ends.
    await expect(app.reorderIndicator).toHaveCount(0);

    // One undo restores the original order.
    await app.undo();
    expect(await app.timelineRowIds()).toEqual(before);
  });
});
