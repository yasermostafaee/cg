import { test, expect } from './fixtures/designer.js';

/**
 * D-041 — multi-select editing through the real UI. The shared-property
 * intersection, the undo coalescing, and the move math are unit-tested; this
 * guards the integrated path: shift-click building a selection across the
 * canvas, the single union bounding box, group move as one undo step, the
 * shared-property editor (group fill + the mixed state for a mixed selection),
 * and group delete.
 *
 * Shapes are placed relative to the canvas size (the scene is 1920×1080, so a
 * 320-px shape is ~1/6 of the canvas width — the placements stay well apart and
 * never overlap regardless of the fit scale). A shape's placement point is its
 * top-left corner, so clicking near it re-selects it.
 */
test.describe('Multi-select editing (D-041)', () => {
  test('shift-click builds a selection; one bbox; group move is one undo; group fill recolours all', async ({
    app,
  }) => {
    await app.newProject('Multi');
    const cb = (await app.canvas.boundingBox())!;
    const A = { x: Math.round(cb.width * 0.14), y: Math.round(cb.height * 0.22) };
    const B = { x: Math.round(cb.width * 0.62), y: Math.round(cb.height * 0.22) };
    const C = { x: Math.round(cb.width * 0.14), y: Math.round(cb.height * 0.62) };
    const inA = { x: A.x + 10, y: A.y + 8 };
    const inB = { x: B.x + 10, y: B.y + 8 };

    await app.addRectangle(A);
    await app.addRectangle(B);
    await app.addRectangle(C);

    // Plain click selects one; shift-click adds a second → multi editor + ONE bbox.
    await app.clickCanvas(inA);
    await app.shiftClickCanvas(inB);
    await expect(app.multiInspector).toBeVisible();
    await expect(app.multiInspector).toContainText('2 ELEMENTS SELECTED');
    await expect(app.multiBbox).toHaveCount(1);

    // Group move: both translate by the same delta — the union box keeps its
    // size and shifts — and a single undo reverts the whole move.
    const box0 = (await app.multiBbox.boundingBox())!;
    await app.groupDrag(inA, { x: 130, y: 80 });
    const box1 = (await app.multiBbox.boundingBox())!;
    expect(box1.x - box0.x).toBeGreaterThan(20);
    expect(box1.y - box0.y).toBeGreaterThan(10);
    expect(Math.abs(box1.width - box0.width)).toBeLessThan(6); // rigid translation, not a resize

    await app.undo();
    // Undo clears the selection; re-pick at the ORIGINAL spots — they only hit
    // if the move was reverted — and the box returns to where it started.
    await app.clickCanvas(inA);
    await app.shiftClickCanvas(inB);
    const box2 = (await app.multiBbox.boundingBox())!;
    expect(Math.abs(box2.x - box0.x)).toBeLessThan(6);
    expect(Math.abs(box2.width - box0.width)).toBeLessThan(6);

    // Group fill: editing the shared Fill recolours BOTH selected shapes; the
    // third (unselected) keeps its default grey.
    await app.setMultiFill('#FF0000');
    await expect.poll(() => app.canvasElementsWithBackground('rgb(255, 0, 0)')).toBe(2);
  });

  test('a mixed selection exposes only shared props with a mixed value; Delete removes the whole selection', async ({
    app,
  }) => {
    await app.newProject('MultiMixed');
    const cb = (await app.canvas.boundingBox())!;
    const A = { x: Math.round(cb.width * 0.14), y: Math.round(cb.height * 0.2) };
    const text = { x: Math.round(cb.width * 0.6), y: Math.round(cb.height * 0.62) };
    const inA = { x: A.x + 10, y: A.y + 8 };

    await app.addRectangle(A);
    await app.addTextElement(text); // auto-selected after placing

    // Text (selected) + the rectangle → a MIXED selection.
    await app.shiftClickCanvas(inA);
    await expect(app.multiInspector).toBeVisible();
    await expect(app.multiInspector).toContainText('2 ELEMENTS SELECTED');

    // Shared subset only: a transform field reads "mixed" (text & shape differ),
    // and there is NO Fill control (fill is not shared across the two kinds).
    await expect(app.multiInspector.getByText(/mixed/i).first()).toBeVisible();
    await expect(app.multiInspector.getByRole('button', { name: 'Fill' })).toHaveCount(0);

    // Delete removes the WHOLE selection in one step → the multi editor is gone
    // and two elements left the canvas.
    const before = await app.canvasFrame.locator('[data-cg-element-id]').count();
    await app.page.keyboard.press('Delete');
    await expect(app.multiInspector).toHaveCount(0);
    await expect
      .poll(() => app.canvasFrame.locator('[data-cg-element-id]').count())
      .toBe(before - 2);
  });
});
