import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * D-124 / B-059 / B-060 — the path point-edit mode redesign: single click selects
 * (box only), double-click enters edit mode (anchors, gizmo hidden), Esc/empty
 * click exits (selection kept); the selection box + Inspector W/H enclose the
 * CURVED outline; right-click while drawing cancels the draft.
 */

const paths = (app: DesignerApp) => app.canvasFrame.locator('[data-cg-element-id] path');
const anchors = (app: DesignerApp) => app.page.locator('[data-cg-anchor]');

async function drawClosedTriangle(app: DesignerApp): Promise<void> {
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await app.canvas.click({ position: { x: 210, y: 240 } });
  await app.canvas.click({ position: { x: 140, y: 130 } }); // close
  await expect(paths(app)).toHaveCount(1);
}

test('single click = box only; double-click = point edit; Esc and empty click exit (D-124)', async ({
  app,
}) => {
  await app.newProject('PenEditMode');
  await drawClosedTriangle(app);
  await app.page.keyboard.press('Escape'); // pen idle → cursor
  await app.page.keyboard.press('Escape'); // deselect
  await expect(app.gizmoFrame).toHaveCount(0);

  // Single click: selection box ONLY — no anchors, no handles.
  await app.canvas.click({ position: { x: 210, y: 165 } });
  await expect(app.gizmoFrame).toHaveCount(1);
  await expect(anchors(app)).toHaveCount(0);

  // Double-click: point-edit mode — anchors show, the gizmo hides.
  await app.canvas.dblclick({ position: { x: 210, y: 165 } });
  await expect(anchors(app)).toHaveCount(3);
  await expect(app.gizmoFrame).toHaveCount(0);

  // First Esc exits edit mode (selection KEPT — the box returns); second deselects.
  await app.page.keyboard.press('Escape');
  await expect(anchors(app)).toHaveCount(0);
  await expect(app.gizmoFrame).toHaveCount(1);
  await app.page.keyboard.press('Escape');
  await expect(app.gizmoFrame).toHaveCount(0);

  // Empty-pasteboard click exits the mode the same way (selection kept).
  await app.canvas.dblclick({ position: { x: 210, y: 165 } });
  await expect(anchors(app)).toHaveCount(3);
  await app.canvas.click({ position: { x: 30, y: 30 } }); // empty space
  await expect(anchors(app)).toHaveCount(0);
  await expect(app.gizmoFrame).toHaveCount(1); // still selected — box only
  await app.canvas.click({ position: { x: 30, y: 30 } });
  await expect(app.gizmoFrame).toHaveCount(0); // second empty click deselects
});

test('the selection box and Inspector H enclose a curved shape (B-059)', async ({ app }) => {
  await app.newProject('PenBounds');
  await app.selectTool('Pen');
  // The two-anchor closed lens from B-055: anchors on one horizontal line, both
  // segments bowing away — the ANCHOR box is a zero-height band; the visual box
  // must span the arcs.
  await app.canvas.click({ position: { x: 200, y: 200 } });
  const box = await app.canvas.boundingBox();
  if (box === null) throw new Error('canvas not laid out');
  await app.page.mouse.move(box.x + 400, box.y + 200);
  await app.page.mouse.down();
  await app.page.mouse.move(box.x + 400, box.y + 120, { steps: 6 }); // smooth drag
  await app.page.mouse.up();
  await app.canvas.click({ position: { x: 200, y: 200 } }); // close

  await app.page.keyboard.press('Escape'); // → cursor (path stays selected)
  // Inspector H reports the VISUAL height (scene px) — the anchors box is height
  // ~1; the arcs reach ≈±60 scene px at this zoom, so demand a real extent.
  const h = await app.getInspectorNumber('Height');
  expect(h).toBeGreaterThan(30);

  // The gizmo frame polygon spans the arcs vertically (screen px): parse its
  // points attribute and check the extent isn't the old ~1-px band.
  const pts = (await app.gizmoFrame.getAttribute('points')) ?? '';
  const ys = pts
    .split(' ')
    .map((pair) => Number(pair.split(',')[1]))
    .filter((n) => Number.isFinite(n));
  const extent = Math.max(...ys) - Math.min(...ys);
  expect(extent).toBeGreaterThan(20);
});

test('resize then edit: the anchor drag keeps the resized scale (B-062); rotated overlay tracks (B-061)', async ({
  app,
}) => {
  await app.newProject('PenResizeEdit');
  await drawClosedTriangle(app);
  await app.page.keyboard.press('Escape'); // pen idle → cursor, path stays selected

  // Resize via the Inspector: H ×2 (bakes into the points under the owner model).
  const h0 = await app.getInspectorNumber('Height');
  await app.setInspectorNumber('Height', h0 * 2);
  await expect(async () => {
    expect(await app.getInspectorNumber('Height')).toBeCloseTo(h0 * 2, 1);
  }).toPass();

  // Enter edit mode, drag an anchor a little — the size must NOT snap back.
  await app.canvas.dblclick({ position: { x: 210, y: 200 } });
  await expect(anchors(app)).toHaveCount(3);
  const a0 = app.page.locator('[data-cg-anchor]').first();
  const box = await a0.boundingBox();
  if (box === null) throw new Error('anchor not laid out');
  await app.page.mouse.move(box.x + 4, box.y + 4);
  await app.page.mouse.down();
  await app.page.mouse.move(box.x + 14, box.y + 4, { steps: 4 });
  await app.page.mouse.up();
  await app.page.keyboard.press('Escape'); // back to selection (box)
  const h2 = await app.getInspectorNumber('Height');
  expect(h2).toBeGreaterThan(h0 * 1.8); // pre-fix this snapped back to ~h0

  // B-061 — rotate the shape; the edit overlay's anchors track the rotation:
  // rotating 90° swings the triangle's apex anchor from below to the side, so
  // the anchors' screen bbox becomes wider than tall (it was taller than wide).
  await app.setInspectorNumber('Rotation', 90);
  // Dblclick the ROTATED shape where it actually renders (its box center).
  const elBox = await app.firstCanvasElement.boundingBox();
  const cBox = await app.canvas.boundingBox();
  if (elBox === null || cBox === null) throw new Error('layout missing');
  await app.canvas.dblclick({
    position: {
      x: elBox.x + elBox.width / 2 - cBox.x,
      y: elBox.y + elBox.height / 2 - cBox.y,
    },
  });
  await expect(anchors(app)).toHaveCount(3);
  const rects = await app.page.locator('[data-cg-anchor]').evaluateAll((els) =>
    els.map((el) => {
      const r = (el as SVGGraphicsElement).getBoundingClientRect();
      return { x: r.x, y: r.y };
    }),
  );
  const xs = rects.map((r) => r.x);
  const ys = rects.map((r) => r.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  expect(spanX).toBeGreaterThan(spanY); // rotated: anchors lie on the rotated outline

  // Drift regression (owner re-verify round): dragging ONE anchor of the ROTATED
  // shape must leave every OTHER anchor rendered in place — pre-fix the per-tick
  // bbox re-normalize moved the rotation pivot and re-projected them all.
  const anchorIds = await app.page
    .locator('[data-cg-anchor]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-cg-anchor') ?? ''));
  const centerOf = async (id: string): Promise<{ x: number; y: number }> => {
    const b = await app.page.locator(`[data-cg-anchor="${id}"]`).boundingBox();
    if (b === null) throw new Error(`anchor ${id} not laid out`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const draggedId = anchorIds[0] ?? '';
  const others = anchorIds.slice(1);
  const beforePos = new Map<string, { x: number; y: number }>();
  for (const id of others) beforePos.set(id, await centerOf(id));
  const start = await centerOf(draggedId);
  await app.page.mouse.move(start.x, start.y);
  await app.page.mouse.down();
  await app.page.mouse.move(start.x + 18, start.y + 10, { steps: 5 });
  await app.page.mouse.up();
  for (const id of others) {
    const b = beforePos.get(id);
    if (b === undefined) throw new Error('missing');
    const a = await centerOf(id);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1); // stationary to within a px
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  }
});

test('right-click while drawing cancels the draft like Esc (B-060)', async ({ app }) => {
  await app.newProject('PenRightCancel');
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await app.canvas.click({ position: { x: 210, y: 240 } });
  await expect(paths(app)).toHaveCount(1); // committed draft

  await app.canvas.click({ position: { x: 320, y: 180 }, button: 'right' });
  await expect(paths(app)).toHaveCount(0); // canceled — element removed
  // The pen stays armed after the cancel.
  await expect(app.page.getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // One undo restores the WHOLE canceled path as a single step (Esc-cancel parity).
  await app.undo();
  await expect(paths(app)).toHaveCount(1);

  // Drawing again works immediately — a fresh, independent element.
  await app.canvas.click({ position: { x: 380, y: 80 } });
  await app.canvas.click({ position: { x: 300, y: 60 } });
  await app.page.keyboard.press('Enter');
  await expect(paths(app)).toHaveCount(2);

  // Right-click with the pen armed but IDLE changes nothing.
  await app.canvas.click({ position: { x: 100, y: 100 }, button: 'right' });
  await expect(app.page.getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(paths(app)).toHaveCount(2);
});
