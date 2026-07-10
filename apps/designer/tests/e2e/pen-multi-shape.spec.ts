import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * B-037 — the pen tool's multi-shape regression suite. Maps the
 * `fix-pen-multi-shape` OpenSpec scenarios: consecutive draws create independent
 * elements (the pen stays armed), a mid-draw tool switch finishes-or-cancels the
 * draft instead of leaking it, edit affordances never hijack pen clicks, Esc
 * cancels, and the first-anchor close-click still closes. Click targets stay in the
 * upper-left canvas area: below ~y 300 the timeline panel overlaps the surface, and
 * past ~x 430 the frame box runs under the right inspector's field rows.
 */

const penButton = (app: DesignerApp) => app.page.getByRole('button', { name: 'Pen', exact: true });
const paths = (app: DesignerApp) => app.canvasFrame.locator('[data-cg-element-id] path');

/** Draw shape 1 — the closed triangle used across these tests (anchors at
 *  (140,130), (280,130), (210,240), closed by re-clicking the first anchor). */
async function drawClosedTriangle(app: DesignerApp): Promise<void> {
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await app.canvas.click({ position: { x: 210, y: 240 } });
  await app.canvas.click({ position: { x: 140, y: 130 } }); // close
  await expect(paths(app)).toHaveCount(1);
}

test('two sequential draws yield two independent elements; shape 1 untouched', async ({ app }) => {
  await app.newProject('PenMulti');
  await drawClosedTriangle(app);

  // Close-click worked: the shape is CLOSED (fill), selected, and the pen is STILL armed.
  await expect(paths(app).first()).not.toHaveAttribute('fill', 'none');
  await expect(penButton(app)).toHaveAttribute('aria-pressed', 'true');
  const shape1D = await paths(app).first().getAttribute('d');

  // Draw shape 2 without re-picking the tool; finish open with Enter.
  await app.canvas.click({ position: { x: 330, y: 70 } });
  await app.canvas.click({ position: { x: 420, y: 70 } });
  await app.canvas.click({ position: { x: 380, y: 180 } });
  await app.page.keyboard.press('Enter');

  await expect(paths(app)).toHaveCount(2);
  // Shape 1's geometry is byte-identical — the second draw never touched it.
  expect(await paths(app).first().getAttribute('d')).toBe(shape1D);
  // And it still has exactly its 3 anchors (edit overlay count via the Select tool).
  await app.clickCanvas({ x: 210, y: 165 });
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(3);
});

test('mid-draw tool switch finishes the draft; the next pen session starts fresh', async ({
  app,
}) => {
  await app.newProject('PenSwitch');
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });

  // Switch away MID-DRAW: the ≥2-anchor draft is finished as an OPEN path.
  await app.selectTool('Select');
  await expect(paths(app)).toHaveCount(1);
  await expect(paths(app).first()).toHaveAttribute('fill', 'none');
  const shape1D = await paths(app).first().getAttribute('d');

  // Return to the pen and draw — a NEW element, never an append to shape 1.
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 340, y: 80 } });
  await app.canvas.click({ position: { x: 420, y: 180 } });
  await app.page.keyboard.press('Enter');

  await expect(paths(app)).toHaveCount(2);
  expect(await paths(app).first().getAttribute('d')).toBe(shape1D);
  // Shape 1 keeps exactly the 2 anchors it had when the tool switched.
  await app.clickCanvas({ x: 210, y: 130 });
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(2);
});

test('pen armed over a selected shape: clicks start shape 2, never edit shape 1', async ({
  app,
}) => {
  await app.newProject('PenNoHijack');
  await drawClosedTriangle(app); // closed, selected, pen still armed

  // No edit affordances while the pen is armed: neither gizmo nor anchor overlay.
  await expect(app.gizmoFrame).toHaveCount(0);
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(0);
  const shape1D = await paths(app).first().getAttribute('d');
  const box1 = await app.firstCanvasElement.boundingBox();

  // Click ON shape 1's top edge midpoint (a gizmo edge strip / PathEditor segment
  // would live exactly here) — it must start shape 2 instead.
  await app.canvas.click({ position: { x: 210, y: 130 } });
  await app.canvas.click({ position: { x: 400, y: 85 } });
  await app.page.keyboard.press('Enter');

  await expect(paths(app)).toHaveCount(2);
  // Shape 1: no inserted anchor, no resize — geometry and box are unchanged.
  expect(await paths(app).first().getAttribute('d')).toBe(shape1D);
  const box1After = await app.firstCanvasElement.boundingBox();
  expect(Math.abs((box1After?.x ?? 0) - (box1?.x ?? 0))).toBeLessThan(0.5);
  expect(Math.abs((box1After?.width ?? 0) - (box1?.width ?? 0))).toBeLessThan(0.5);
  await app.clickCanvas({ x: 210, y: 165 });
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(3);
});

test('Esc cancels the in-progress draft; Esc while idle exits to the cursor', async ({ app }) => {
  await app.newProject('PenEsc');
  await app.selectTool('Pen');

  // A committed 3-anchor draft: Esc removes the created element entirely.
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await app.canvas.click({ position: { x: 210, y: 240 } });
  await expect(paths(app)).toHaveCount(1);
  await app.page.keyboard.press('Escape');
  await expect(paths(app)).toHaveCount(0);
  // The cancel does NOT exit the tool — the pen is still armed.
  await expect(penButton(app)).toHaveAttribute('aria-pressed', 'true');

  // A 1-anchor draft cancels to nothing as well.
  await app.canvas.click({ position: { x: 200, y: 160 } });
  await app.page.keyboard.press('Escape');
  await expect(paths(app)).toHaveCount(0);

  // With no draft in progress, Esc drops back to the cursor tool.
  await app.page.keyboard.press('Escape');
  await expect(app.page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a composition switch mid-draw ends the pen session; nothing leaks across', async ({
  app,
}) => {
  await app.newProject('PenComp');
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });

  // Switch composition MID-DRAW — the ≥2-anchor draft finishes OPEN back in comp1.
  await app.newComposition('comp2');
  await expect(paths(app)).toHaveCount(0); // comp2's canvas is empty

  // Drawing in comp2 creates an element HERE — never an append to comp1's shape.
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 200, y: 100 } });
  await app.canvas.click({ position: { x: 320, y: 160 } });
  await app.page.keyboard.press('Enter');
  await expect(paths(app)).toHaveCount(1);

  // Back in comp1: the mid-draw shape survived as a 2-anchor OPEN path, untouched.
  await app.openComposition('comp1');
  await expect(paths(app)).toHaveCount(1);
  await expect(paths(app).first()).toHaveAttribute('fill', 'none');
  await app.clickCanvas({ x: 210, y: 130 });
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(2);
});

test('deleting the in-progress element mid-draw kills the draft; clicks start fresh', async ({
  app,
}) => {
  await app.newProject('PenDelete');
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await expect(paths(app)).toHaveCount(1);

  await app.page.keyboard.press('Delete'); // acts on the auto-selected draft element
  await expect(paths(app)).toHaveCount(0);

  // The stale draft died with its element: the next clicks draw a FRESH 2-anchor
  // path — the deleted anchors are never resurrected. The finished path is already
  // selected, so switch to Select and count its edit-overlay anchors directly
  // (clicking its stroke would hit the PathEditor segment and INSERT an anchor —
  // the intended D-109 edit gesture, not what this test measures).
  await app.canvas.click({ position: { x: 200, y: 100 } });
  await app.canvas.click({ position: { x: 320, y: 160 } });
  await app.page.keyboard.press('Enter');
  await expect(paths(app)).toHaveCount(1);
  await app.selectTool('Select');
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(2);
});

test('draw-state feedback: rubber band while drafting, close affordance in radius', async ({
  app,
}) => {
  await app.newProject('PenFeedback');
  await app.selectTool('Pen');
  const box = await app.canvas.boundingBox();
  if (box === null) throw new Error('canvas not laid out');

  // One anchor placed + pointer moved → the rubber-band feedback layer appears.
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.page.mouse.move(box.x + 260, box.y + 180);
  await expect(app.page.getByTestId('pen-draft-feedback')).toBeVisible();

  // With ≥ 2 anchors, hovering within the close radius lights the close affordance.
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await app.page.mouse.move(box.x + 220, box.y + 200);
  const affordance = app.page.getByTestId('pen-close-affordance');
  await expect(affordance).toHaveAttribute('data-active', 'false');
  await app.page.mouse.move(box.x + 142, box.y + 132); // ~3 px from the first anchor
  await expect(affordance).toHaveAttribute('data-active', 'true');

  await app.page.keyboard.press('Escape'); // cancel — leave the canvas clean
  await expect(paths(app)).toHaveCount(0);
});
