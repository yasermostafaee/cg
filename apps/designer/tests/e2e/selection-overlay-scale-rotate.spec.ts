import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * B-022 — the single-selection gizmo must trace the element's RENDERED geometry
 * (`scale(sx,sy) rotate(deg)` about the anchor — a parallelogram under non-uniform
 * scale), not a rotated bounding rectangle. The shape itself is drawn by the real
 * runtime in the preview iframe, so we compare the gizmo frame's screen bounds with
 * the rendered element's screen bounds.
 *
 * Both metrics are measured RELATIVE to the scale-1 / rotation-0 baseline: the shape's
 * bbox carries a small constant offset from the gizmo (its border + the frame's 1px
 * stroke, plus the overlay↔iframe screen offset). The FIX keeps that offset constant
 * under any scale/rotation; the OLD rotated-rectangle overlay diverged by tens of px
 * once a non-uniform scale met a rotation. Also re-confirms B-004 (rotate moves the
 * handles).
 */

const TOL = 3; // px headroom over the constant baseline offset (bug divergence ≫ this)

interface Gap {
  sizeGap: number; // max |Δwidth|, |Δheight| between shape and gizmo bounds
  centerGap: number; // distance between the two box centres
}

async function measure(app: DesignerApp): Promise<Gap | null> {
  const sh = await app.firstCanvasElement.boundingBox();
  const gz = await app.gizmoFrame.boundingBox();
  if (sh === null || gz === null) return null;
  return {
    sizeGap: Math.max(Math.abs(sh.width - gz.width), Math.abs(sh.height - gz.height)),
    centerGap: Math.hypot(
      sh.x + sh.width / 2 - (gz.x + gz.width / 2),
      sh.y + sh.height / 2 - (gz.y + gz.height / 2),
    ),
  };
}

test.describe('B-022 — selection overlay under scale + rotation', () => {
  test('gizmo stays glued to the shape under non-uniform scale, then rotation', async ({ app }) => {
    await app.newProject();
    await app.addRectangle({ x: 240, y: 200 });

    // Baseline alignment (scale 1, rotation 0) — the constant shape↔gizmo offset.
    const base = await measure(app);
    if (base === null) throw new Error('no baseline boxes');
    const baseWidth = (await app.firstCanvasElement.boundingBox())?.width ?? 0;

    // Non-uniform scale (200% × 100%) — the rendered width grows, height does not.
    await app.setInspectorNumber('Scale X', 200);
    await app.setInspectorNumber('Scale Y', 100);
    await expect
      .poll(async () => (await app.firstCanvasElement.boundingBox())?.width ?? 0)
      .toBeGreaterThan(baseWidth * 1.5);
    // The overlay still matches the (now wider) shape — no growth over the baseline gap.
    await expect
      .poll(async () => (await measure(app))?.sizeGap ?? Infinity)
      .toBeLessThanOrEqual(base.sizeGap + TOL);

    // Add a rotation on top of the non-uniform scale → the shape renders as a
    // PARALLELOGRAM. A rotated-rectangle overlay's bbox would diverge here; the
    // parallelogram overlay keeps the same bbox size and centre as the baseline.
    await app.setInspectorNumber('Rotation', 30);
    await expect
      .poll(async () => (await measure(app))?.sizeGap ?? Infinity)
      .toBeLessThanOrEqual(base.sizeGap + TOL);
    await expect
      .poll(async () => (await measure(app))?.centerGap ?? Infinity)
      .toBeLessThanOrEqual(base.centerGap + TOL);
  });

  test('rotate updates the gizmo handle position (B-004 regression)', async ({ app }) => {
    await app.newProject();
    await app.addRectangle({ x: 240, y: 200 });

    const base = await measure(app);
    if (base === null) throw new Error('no baseline boxes');
    const before = await app.gizmoFrame.boundingBox();

    await app.setInspectorNumber('Rotation', 45);

    // The frame's bounds change with the rotation (handles moved)…
    await expect
      .poll(async () => {
        const now = await app.gizmoFrame.boundingBox();
        if (now === null || before === null) return 0;
        return Math.max(Math.abs(now.width - before.width), Math.abs(now.height - before.height));
      })
      .toBeGreaterThan(3);
    // …and the rotated frame still tracks the rotated shape.
    await expect
      .poll(async () => (await measure(app))?.sizeGap ?? Infinity)
      .toBeLessThanOrEqual(base.sizeGap + TOL);
  });
});
