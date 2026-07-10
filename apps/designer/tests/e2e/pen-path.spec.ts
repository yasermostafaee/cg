import { test, expect } from './fixtures/designer.js';

/**
 * D-109 — the Pen tool draws an editable bézier `path` element. Click places corner
 * anchors; Enter finishes the path (open) with it selected, rendered (stroke only
 * while open), editable with the Select tool (its anchors show in the overlay), and
 * able to be closed (→ fill) from the inspector. B-037 — the pen STAYS armed after a
 * finish (returning to the cursor is explicit), so the edit-overlay check switches
 * to Select first.
 *
 * (Click-the-first-anchor-to-close and multi-shape flows are exercised by
 * `pen-multi-shape.spec.ts`.)
 */
test('pen draws a path → renders, selects, is editable, and can be closed', async ({ app }) => {
  await app.newProject('PenPath');
  await app.selectTool('Pen');

  // Three corner anchors, then Enter to finish (open). The pen stays armed.
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await app.canvas.click({ position: { x: 210, y: 240 } });
  await app.page.keyboard.press('Enter');

  // Rendered in the preview as an <svg><path>; open ⇒ stroke only (fill: none).
  const path = app.canvasFrame.locator('[data-cg-element-id] path');
  await expect(path).toHaveCount(1);
  await expect(path).toHaveAttribute('fill', 'none');

  // B-037 — the pen is still the active tool after the finish.
  await expect(app.page.getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Selected: the Path inspector shows stroke + a 3-anchor count + the Open/Closed toggle.
  await expect(app.inspector.getByRole('spinbutton', { name: 'stroke width' })).toBeVisible();
  await expect(app.inspector.getByText('points')).toBeVisible();
  await expect(app.inspector.getByText('3', { exact: true })).toBeVisible();

  // Editable with the SELECT tool: the edit overlay draws one square per anchor.
  await app.selectTool('Select');
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(3);

  // Closing it from the inspector fills the path (closed ⇒ fill + stroke).
  await app.inspector.getByRole('button', { name: 'Closed' }).click();
  await expect(path).not.toHaveAttribute('fill', 'none');
});
