import { test, expect } from './fixtures/designer.js';

/**
 * D-109 — the Pen tool draws an editable bézier `path` element. Click places corner
 * anchors; Enter finishes the path (open); the tool returns to the cursor with the
 * new path selected, rendered (stroke only while open), editable (its anchors show
 * in the overlay), and able to be closed (→ fill) from the inspector.
 *
 * (Click-the-first-anchor-to-close is exercised by the pen controller in the live
 * app where the operator clicks the visible anchor; the E2E finishes with Enter and
 * closes via the inspector to stay robust to canvas-layout shifts.)
 */
test('pen draws a path → renders, selects, is editable, and can be closed', async ({ app }) => {
  await app.newProject('PenPath');
  await app.selectTool('Pen');

  // Three corner anchors, then Enter to finish (open) and return to the cursor.
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await app.canvas.click({ position: { x: 210, y: 240 } });
  await app.page.keyboard.press('Enter');

  // Rendered in the preview as an <svg><path>; open ⇒ stroke only (fill: none).
  const path = app.canvasFrame.locator('[data-cg-element-id] path');
  await expect(path).toHaveCount(1);
  await expect(path).toHaveAttribute('fill', 'none');

  // Selected: the Path inspector shows stroke + a 3-anchor count + the Open/Closed toggle.
  await expect(app.inspector.getByRole('spinbutton', { name: 'stroke width' })).toBeVisible();
  await expect(app.inspector.getByText('points')).toBeVisible();
  await expect(app.inspector.getByText('3', { exact: true })).toBeVisible();

  // Editable: the edit overlay draws one draggable square per anchor (cursor tool).
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(3);

  // Closing it from the inspector fills the path (closed ⇒ fill + stroke).
  await app.inspector.getByRole('button', { name: 'Closed' }).click();
  await expect(path).not.toHaveAttribute('fill', 'none');
});
