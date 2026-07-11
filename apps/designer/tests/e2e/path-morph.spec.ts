import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * D-110 — path morphing: keyframe a path's SHAPE on the single "Path" timeline
 * row, reshape it at a later frame (auto-record), and scrub → the preview
 * interpolates between the two shapes (id-matched per-anchor tween).
 */

const paths = (app: DesignerApp) => app.canvasFrame.locator('[data-cg-element-id] path');
const anchors = (app: DesignerApp) => app.page.locator('[data-cg-anchor]');
/** Timeline LABEL cells for the Path property (the lane cell carries data-role). */
const pathRows = (app: DesignerApp) =>
  app.page.locator('[data-track-property="path"]:not([data-role="lane-empty"])');

async function drawClosedTriangle(app: DesignerApp): Promise<void> {
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await app.canvas.click({ position: { x: 210, y: 240 } });
  await app.canvas.click({ position: { x: 140, y: 130 } }); // close
  await expect(paths(app)).toHaveCount(1);
}

const previewD = (app: DesignerApp) => paths(app).first().getAttribute('d');

test('keyframe the shape, reshape at a later frame (auto-record), scrub → it morphs (D-110)', async ({
  app,
}) => {
  await app.newProject('PathMorph');
  await drawClosedTriangle(app);
  await app.page.keyboard.press('Escape'); // pen idle → cursor, path stays selected

  // Expand the element's track list (collapsed by default; the element is named
  // "Path"), then the "Path" property SECTION inside it (also collapsed) —
  // exact-case names distinguish the two toggles.
  await app.page.getByRole('button', { name: 'Toggle Path tracks', exact: true }).click();
  await app.page.getByRole('button', { name: 'Toggle path tracks', exact: true }).click();

  // ONE "Path" row for the whole shape — never a row per anchor.
  await expect(pathRows(app)).toHaveCount(1);

  // First Path keyframe at frame 0 via the standard timeline diamond.
  await app.addKeyframeViaDiamond('Path');
  await expect(app.keyframeAtFrame(0)).toHaveCount(1);
  const d0 = await previewD(app);
  expect(d0).toBeTruthy();

  // Scrub ahead and reshape in point-edit mode → a second keyframe auto-records.
  await app.scrubToFrame(30);
  await app.canvas.dblclick({ position: { x: 210, y: 165 } });
  await expect(anchors(app)).toHaveCount(3);
  const apex = anchors(app).nth(2); // the 210,240 anchor
  const box = await apex.boundingBox();
  if (box === null) throw new Error('apex anchor not visible');
  await app.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await app.page.mouse.down();
  await app.page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, {
    steps: 6,
  });
  await app.page.mouse.up();

  await expect(app.keyframeAtFrame(30)).toHaveCount(1); // auto-recorded
  await expect(app.keyframeAtFrame(0)).toHaveCount(1); // first keyframe untouched
  await app.page.keyboard.press('Escape'); // exit edit mode

  // The reshaped frame renders a different d.
  await expect.poll(() => previewD(app)).not.toBe(d0);
  const d30 = await previewD(app);

  // A mid-frame renders an INTERPOLATED shape — differs from both endpoints.
  await app.scrubToFrame(15);
  await expect.poll(() => previewD(app)).not.toBe(d0);
  const d15 = await previewD(app);
  expect(d15).not.toBe(d30);

  // Scrubbing back to the endpoints reproduces their shapes (stable morph).
  await app.scrubToFrame(0);
  await expect.poll(() => previewD(app)).toBe(d0);
  await app.scrubToFrame(30);
  await expect.poll(() => previewD(app)).toBe(d30);
});

/** Width × height extents of the gizmo frame polygon (screen px). */
async function gizmoExtents(app: DesignerApp): Promise<{ w: number; h: number }> {
  const pts = (await app.gizmoFrame.getAttribute('points')) ?? '';
  const xs: number[] = [];
  const ys: number[] = [];
  for (const pair of pts.split(' ')) {
    const [x, y] = pair.split(',').map(Number);
    if (Number.isFinite(x)) xs.push(x as number);
    if (Number.isFinite(y)) ys.push(y as number);
  }
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

test('live bounds + structure lock: the box tracks the morph; insert/delete hit every keyframe (D-110 follow-up)', async ({
  app,
}) => {
  await app.newProject('PathMorphLock');
  await drawClosedTriangle(app);
  await app.page.keyboard.press('Escape'); // pen idle → cursor, path stays selected

  // Expand the element's tracks + the Path section so the lane diamonds render.
  await app.page.getByRole('button', { name: 'Toggle Path tracks', exact: true }).click();
  await app.page.getByRole('button', { name: 'Toggle path tracks', exact: true }).click();

  // Keyframe the shape at 0, then GROW it at frame 30 (drag the apex outward).
  await app.addKeyframeViaDiamond('Path');
  await app.scrubToFrame(30);
  await app.canvas.dblclick({ position: { x: 210, y: 165 } });
  await expect(anchors(app)).toHaveCount(3);
  const apex = anchors(app).nth(2);
  const apexBox = await apex.boundingBox();
  if (apexBox === null) throw new Error('apex anchor not visible');
  await app.page.mouse.move(apexBox.x + 4, apexBox.y + 4);
  await app.page.mouse.down();
  await app.page.mouse.move(apexBox.x + 4 + 90, apexBox.y + 4 + 70, { steps: 6 });
  await app.page.mouse.up();
  await expect(app.keyframeAtFrame(30)).toHaveCount(1);
  await app.page.keyboard.press('Escape'); // exit edit mode → gizmo box shows

  // LIVE BOUNDS — the selection box hugs the morphed shape: grown at 30,
  // between the two extents at the midpoint, base-sized back at 0. The apex
  // drag (+90, +70) grows the height by ~70 screen px — the robust signal.
  const at30 = await gizmoExtents(app);
  await app.scrubToFrame(0);
  await expect.poll(async () => (await gizmoExtents(app)).h).toBeLessThan(at30.h - 15);
  const at0 = await gizmoExtents(app);
  await app.scrubToFrame(15);
  await expect.poll(async () => (await gizmoExtents(app)).h).toBeGreaterThan(at0.h + 5);
  const at15 = await gizmoExtents(app);
  expect(at15.h).toBeLessThan(at30.h - 5); // strictly between the endpoints
  // Width grows only once the apex passes the base right edge (late in the
  // morph) — visible at frame 30, not at 15.
  expect(at30.w).toBeGreaterThan(at0.w + 10);

  // STRUCTURE LOCK — Ctrl-click a segment at frame 0 inserts ONE shared anchor
  // into EVERY keyframe: 4 anchors here AND at frame 30, and the morph stays
  // well-formed (the new point tweens; shape changes smoothly, no pop).
  await app.canvas.dblclick({ position: { x: 210, y: 165 } });
  await expect(anchors(app)).toHaveCount(3);
  await app.canvas.click({ position: { x: 210, y: 130 }, modifiers: ['Control'] });
  await expect(anchors(app)).toHaveCount(4);
  await app.scrubToFrame(30);
  await expect(anchors(app)).toHaveCount(4); // same set at the other keyframe
  await app.scrubToFrame(15);
  await expect(anchors(app)).toHaveCount(4); // and tweened in between
  const dMid = await previewD(app);
  expect(dMid).toBeTruthy();
  expect((dMid ?? '').includes('NaN')).toBe(false);

  // DELETE — removing the inserted anchor removes it from every keyframe.
  await app.scrubToFrame(0);
  const inserted = anchors(app).nth(1); // a → inserted → b → c (leading order)
  await inserted.click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Delete point' }).click();
  await expect(anchors(app)).toHaveCount(3);
  await app.scrubToFrame(30);
  await expect(anchors(app)).toHaveCount(3); // gone from the other keyframe too

  // LIVE HIT-TEST — at the grown frame, double-clicking a point INSIDE the
  // morphed shape but OUTSIDE the base outline enters point-edit mode (the
  // hit region follows the evaluated points, not the static geometry).
  await app.page.keyboard.press('Escape'); // exit edit mode (selection kept)
  await app.page.keyboard.press('Escape'); // deselect
  await expect(anchors(app)).toHaveCount(0);
  await app.canvas.dblclick({ position: { x: 270, y: 220 } }); // grown-only region
  await expect(anchors(app)).toHaveCount(3); // edit mode entered on the morphed outline
});
