import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * B-057 / B-056 / B-055 — bézier curves across placement, insertion, and
 * hit-testing. Placement decides corner-vs-smooth at pointer-UP by total SCREEN-px
 * displacement (a click-sized slip stays a corner); a segment click-DRAG inserts a
 * SMOOTH anchor; hit-testing follows the flattened curved outline. Click targets
 * stay in the upper-left canvas area (timeline below ~y 300, inspector past ~x 430).
 */

const paths = (app: DesignerApp) => app.canvasFrame.locator('[data-cg-element-id] path');

async function canvasBox(app: DesignerApp): Promise<{ x: number; y: number }> {
  const box = await app.canvas.boundingBox();
  if (box === null) throw new Error('canvas not laid out');
  return box;
}

/** A human-like click with a 2-px slip between down and up — under the B-057
 *  screen-px guard, so it must place a CORNER anchor. */
async function slipClick(app: DesignerApp, x: number, y: number): Promise<void> {
  const box = await canvasBox(app);
  await app.page.mouse.move(box.x + x, box.y + y);
  await app.page.mouse.down();
  await app.page.mouse.move(box.x + x + 2, box.y + y + 1);
  await app.page.mouse.up();
}

/** Press at (x,y) and drag by (dx,dy) before releasing — the drag-to-smooth gesture. */
async function dragSmooth(
  app: DesignerApp,
  x: number,
  y: number,
  dx: number,
  dy: number,
): Promise<void> {
  const box = await canvasBox(app);
  await app.page.mouse.move(box.x + x, box.y + y);
  await app.page.mouse.down();
  await app.page.mouse.move(box.x + x + dx, box.y + y + dy, { steps: 6 });
  await app.page.mouse.up();
}

test('corner after a smooth drag stays a corner — even with click slip (B-057)', async ({
  app,
}) => {
  await app.newProject('PenCorner');
  await app.selectTool('Pen');
  await slipClick(app, 140, 130); // corner
  await dragSmooth(app, 280, 130, 30, -30); // smooth
  await slipClick(app, 210, 240); // corner — the bug made this stick smooth
  await slipClick(app, 350, 240); // corner
  await app.page.keyboard.press('Enter');

  const d = await paths(app).first().getAttribute('d');
  // Segments: a1→a2 and a2→a3 curve (a2's mirrored handles); a3→a4 must be a
  // straight L — with the old incremental guard the slip made a3 smooth and the
  // final segment a C.
  expect(d).toMatch(/L [\d.]+ [\d.]+$/);
  expect((d?.match(/C /g) ?? []).length).toBe(2);
});

test('Ctrl-gated insertion: Ctrl+click = corner, Ctrl+drag = smooth, plain click inert (B-056/D-124)', async ({
  app,
}) => {
  await app.newProject('PenInsert');
  await app.selectTool('Pen');
  await slipClick(app, 140, 130);
  await slipClick(app, 280, 130);
  await slipClick(app, 210, 240);
  await app.page.keyboard.press('Enter'); // open path, 3 corners — d has no C
  expect(await paths(app).first().getAttribute('d')).not.toContain('C ');

  await app.enterPathEdit({ x: 210, y: 130 }); // D-124 — dblclick enters edit mode
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(3);

  // D-124 — WITHOUT the modifier a segment click does nothing special.
  await app.canvas.click({ position: { x: 210, y: 130 } });
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(3);
  expect(await paths(app).first().getAttribute('d')).not.toContain('C ');

  // Ctrl+click on the FIRST segment's midpoint → a corner insert, still no curve.
  await app.canvas.click({ position: { x: 210, y: 130 }, modifiers: ['Control'] });
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(4);
  expect(await paths(app).first().getAttribute('d')).not.toContain('C ');

  // Ctrl+DRAG on the SECOND segment's midpoint → a smooth insert, the path curves.
  await app.page.keyboard.down('Control');
  await dragSmooth(app, 245, 185, 30, -20);
  await app.page.keyboard.up('Control');
  await expect(app.page.locator('[data-cg-anchor]')).toHaveCount(5);
  expect(await paths(app).first().getAttribute('d')).toContain('C ');
});

test('a curved shape selects from anywhere on it, not just near the center (B-055)', async ({
  app,
}) => {
  await app.newProject('PenHit');
  await app.selectTool('Pen');
  // A two-anchor closed LENS: anchor 2's smooth drag bows both segments away from
  // the a1–a2 chord. The anchors-only polygon of this shape is a zero-area LINE, so
  // the old hit-test selected only within the stroke margin of the chord ("near
  // the center") — the flattened outline makes the whole lens interior hit.
  await slipClick(app, 200, 200);
  await dragSmooth(app, 400, 200, 0, -80);
  await app.canvas.click({ position: { x: 200, y: 200 } }); // close on anchor 1

  await expect(paths(app)).toHaveCount(1);
  await expect(paths(app).first()).not.toHaveAttribute('fill', 'none');

  // Exit the pen and clear the selection (Esc → cursor; Esc → deselect).
  await app.page.keyboard.press('Escape');
  await app.page.keyboard.press('Escape');
  await expect(app.gizmoFrame).toHaveCount(0);

  // Click INSIDE the upper arc, well away from the chord (≈15 screen px above it,
  // far past the grab margin) — it must select the path.
  await app.canvas.click({ position: { x: 300, y: 185 } });
  await expect(app.gizmoFrame).toHaveCount(1);
  await expect(app.inspector.getByText('points')).toBeVisible();
});
