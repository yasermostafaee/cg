import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-071 follow-up — the pasteboard extent GROWS to fit off-frame content. The fixed 2×
 * extent (frame ± 50% margin) clipped a shape parked beyond the margin; now the iframe
 * (sized to the extent) grows to contain it, only PAST the 2× boundary (Q1 = B), shrinks
 * back toward 2× as content returns, and is capped at MAX_EXTENT_RATIO×. An origin shift
 * (left/up growth) is scroll-compensated so the visible content never jumps.
 */
test.describe('Pasteboard extent grows to fit off-frame content', () => {
  // The iframe element is sized (CSS px) to the scene-px extent → offsetWidth/Height are
  // the extent. `transform: scale()` doesn't change offset metrics.
  const extentW = (app: DesignerApp): Promise<number> =>
    app.page.locator('iframe[title="cgpreview"]').evaluate((el) => (el as HTMLElement).offsetWidth);
  const extentH = (app: DesignerApp): Promise<number> =>
    app.page
      .locator('iframe[title="cgpreview"]')
      .evaluate((el) => (el as HTMLElement).offsetHeight);

  async function setXY(app: DesignerApp, x?: number, y?: number): Promise<void> {
    if (x !== undefined) {
      const xf = app.inspector.getByRole('spinbutton', { name: 'X position' });
      await xf.fill(String(x));
      await xf.press('Enter');
    }
    if (y !== undefined) {
      const yf = app.inspector.getByRole('spinbutton', { name: 'Y position' });
      await yf.fill(String(y));
      await yf.press('Enter');
    }
  }

  test('a shape parked FAR off any of the 4 sides stays rendered + selectable (extent grew)', async ({
    app,
  }) => {
    await app.newProject('GrowAll');
    await app.addRectangle({ x: 240, y: 200 });
    const shape = app.page
      .frameLocator('iframe[title="cgpreview"]')
      .locator('[data-cg-element-id]');
    const baseW = await extentW(app);
    const baseH = await extentH(app);

    // The old 2× extent for 1920×1080 is scene x∈[−960,2880], y∈[−540,1620]. Park well
    // past each boundary; the iframe (extent) must grow to contain it, and it stays
    // rendered + selected (gizmo tracks it).
    for (const [dir, x, y, grows] of [
      ['right', 4000, 200, 'w'],
      ['left', -3000, 200, 'w'],
      ['bottom', 240, 3000, 'h'],
      ['top', 240, -2500, 'h'],
    ] as const) {
      await setXY(app, x, y);
      await expect(shape, dir).toBeAttached();
      await expect(app.gizmoFrame, dir).toBeAttached(); // still selectable
      if (grows === 'w') await expect.poll(() => extentW(app), dir).toBeGreaterThan(baseW + 100);
      else await expect.poll(() => extentH(app), dir).toBeGreaterThan(baseH + 100);
      await setXY(app, 240, 200); // return on-frame before the next direction
    }
  });

  test('a within-50% off-frame shape does NOT grow the extent (the B containment invariant)', async ({
    app,
  }) => {
    await app.newProject('Within2x');
    await app.addRectangle({ x: 240, y: 200 });
    const baseW = await extentW(app);
    // x=−500 is off the frame's left edge but well inside the 960 margin → still 2×.
    await setXY(app, -500, -100);
    expect(await extentW(app)).toBe(baseW); // byte-identical, no growth
  });

  test('left growth is scroll-compensated — the frame does not jump on screen', async ({ app }) => {
    await app.newProject('NoJump');
    await app.addRectangle({ x: 240, y: 200 });
    // The frame (canvas-surface) is the fixed reference — at scene (0,0). Growing the
    // pasteboard off-LEFT shifts the origin; the scroll-comp must hold the frame put.
    const before = (await app.canvas.boundingBox())!;
    await setXY(app, -3000); // grow off-left (origin shifts right; scroll compensates)
    await expect.poll(() => extentW(app)).toBeGreaterThan(0);
    const after = (await app.canvas.boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(6); // no horizontal jump
    expect(Math.abs(after.y - before.y)).toBeLessThan(6);
  });

  test('dragging far content back within 50% returns the extent to the 2× baseline (never smaller)', async ({
    app,
  }) => {
    await app.newProject('Shrink');
    await app.addRectangle({ x: 240, y: 200 });
    const baseW = await extentW(app);
    await setXY(app, -3000); // grow
    await expect.poll(() => extentW(app)).toBeGreaterThan(baseW + 100);
    await setXY(app, 240); // return inward
    await expect.poll(() => extentW(app)).toBe(baseW); // back to exactly 2× (not smaller)
  });

  test('an absurd coordinate is CAPPED at the clamp (the iframe does not blow up)', async ({
    app,
  }) => {
    await app.newProject('Clamp');
    await app.addRectangle({ x: 240, y: 200 });
    await setXY(app, 10_000_000);
    // MAX_EXTENT_RATIO = 12 × a 1920 frame = 23040; far below the 10M coordinate.
    await expect.poll(() => extentW(app)).toBeLessThanOrEqual(12 * 1920);
    expect(await extentW(app)).toBeLessThan(30_000);
  });
});

/**
 * B-026 — dragging a shape FAR off-frame must move ONLY the dragged shape; the frame and
 * every other (stationary) element must stay put. The bug was a TIMING decoupling: the
 * host-side origin-shift scroll-comp ran synchronously per pointer-move, but the iframe's
 * `.cg-stage` inset (which the scroll compensates for) was applied a frame LATER via the
 * async scene-replace postMessage — so the frame + content drifted/jittered with the drag.
 * The fix writes the inset CSS var synchronously (same-origin srcDoc) in the same layout
 * effect as the scroll, so they land together. These specs assert the invariant via a real
 * pointer drag (the `beginDrag` move listener is on `window`, so the drag tracks the mouse
 * even past the canvas viewport edge — enough travel to cross the 2× boundary).
 */
test.describe('Pasteboard: dragging a shape does not drag/jitter the canvas (B-026)', () => {
  const frame = (app: DesignerApp) => app.page.frameLocator('iframe[title="cgpreview"]');
  const idBox = (app: DesignerApp, id: string): Promise<{ x: number; y: number } | null> =>
    frame(app).locator(`[data-cg-element-id="${id}"]`).boundingBox();
  const elementIds = (app: DesignerApp): Promise<string[]> =>
    frame(app)
      .locator('[data-cg-element-id]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-cg-element-id') ?? ''));
  const extentW = (app: DesignerApp): Promise<number> =>
    app.page.locator('iframe[title="cgpreview"]').evaluate((el) => (el as HTMLElement).offsetWidth);
  const extentH = (app: DesignerApp): Promise<number> =>
    app.page
      .locator('iframe[title="cgpreview"]')
      .evaluate((el) => (el as HTMLElement).offsetHeight);
  async function zoomOut(app: DesignerApp, n: number): Promise<void> {
    for (let i = 0; i < n; i += 1) {
      // "Zoom out" (canvas) vs "Zoom out timeline" — exact so it's unambiguous.
      await app.page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    }
  }

  // Each direction: where (canvas-relative %) to drop the DRAG shape near that frame edge,
  // the page-edge the mouse is dragged toward (to overshoot the 2× boundary), and which
  // extent axis must grow once the boundary is crossed.
  const DIRS = [
    { dir: 'left', place: { fx: 0.08, fy: 0.5 }, axis: 'w' },
    { dir: 'right', place: { fx: 0.92, fy: 0.5 }, axis: 'w' },
    { dir: 'up', place: { fx: 0.5, fy: 0.08 }, axis: 'h' },
    { dir: 'down', place: { fx: 0.5, fy: 0.92 }, axis: 'h' },
  ] as const;

  for (const { dir, place, axis } of DIRS) {
    test(`drag far ${dir}: the frame + other content stay put, only the dragged shape moves`, async ({
      app,
    }) => {
      await app.newProject(`Drift-${dir}`);
      // A STATIONARY reference shape at the frame centre, then the DRAG shape near the
      // relevant edge (so a single in-window drag crosses that 2× boundary).
      const cbox = (await app.canvas.boundingBox())!;
      await app.addRectangle({ x: cbox.width * 0.5, y: cbox.height * 0.5 });
      const refId = (await elementIds(app))[0]!;
      await app.addRectangle({ x: cbox.width * place.fx, y: cbox.height * place.fy });
      const dragId = (await elementIds(app)).find((id) => id !== refId)!;

      // Zoom out so the whole 2× pasteboard OVERFLOWS the viewport (so the scroll-comp is
      // the active mechanism, not centering) yet a modest drag still crosses the boundary.
      await zoomOut(app, 3);

      const baseExtent = axis === 'w' ? await extentW(app) : await extentH(app);
      const refStart = (await idBox(app, refId))!;
      const dragStart = (await idBox(app, dragId))!;
      const frameStart = (await app.canvas.boundingBox())!;
      const g = (await app.gizmoFrame.boundingBox())!; // the selected DRAG shape's gizmo

      // Grab the drag shape and drag toward the page edge (the `window` move listener keeps
      // the drag live past the canvas), crossing the 2× boundary so the extent grows.
      const vp = app.page.viewportSize()!;
      const target = {
        left: { x: 2, y: g.y + g.height / 2 },
        right: { x: vp.width - 2, y: g.y + g.height / 2 },
        up: { x: g.x + g.width / 2, y: 2 },
        down: { x: g.x + g.width / 2, y: vp.height - 2 },
      }[dir];
      await app.page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await app.page.mouse.down();
      await app.page.mouse.move(target.x, target.y, { steps: 24 });

      // Mid-drag (mouse still DOWN): the extent has grown (we crossed the boundary)…
      await expect
        .poll(() => (axis === 'w' ? extentW(app) : extentH(app)), { timeout: 4000 })
        .toBeGreaterThan(baseExtent + 100);
      // …the frame (host overlay) has NOT drifted…
      const frameMid = (await app.canvas.boundingBox())!;
      expect(Math.abs(frameMid.x - frameStart.x), `${dir} frame x`).toBeLessThan(6);
      expect(Math.abs(frameMid.y - frameStart.y), `${dir} frame y`).toBeLessThan(6);
      // …the STATIONARY reference shape (rendered IN the iframe) has NOT drifted…
      const refMid = (await idBox(app, refId))!;
      expect(Math.abs(refMid.x - refStart.x), `${dir} ref x`).toBeLessThan(6);
      expect(Math.abs(refMid.y - refStart.y), `${dir} ref y`).toBeLessThan(6);
      // …while the DRAGGED shape DID follow the cursor (moved well off its start).
      const dragMid = (await idBox(app, dragId))!;
      const moved = Math.abs(dragMid.x - dragStart.x) + Math.abs(dragMid.y - dragStart.y);
      expect(moved, `${dir} dragged moved`).toBeGreaterThan(50);

      await app.page.mouse.up();
      await expect(app.gizmoFrame, dir).toBeAttached(); // still selected/selectable
    });
  }

  test('a within-2× drag does NOT move the canvas or change the extent (B containment)', async ({
    app,
  }) => {
    await app.newProject('DriftWithin');
    const cbox = (await app.canvas.boundingBox())!;
    await app.addRectangle({ x: cbox.width * 0.5, y: cbox.height * 0.5 });
    const refId = (await elementIds(app))[0]!;
    await app.addRectangle({ x: cbox.width * 0.4, y: cbox.height * 0.5 }); // the (selected) drag shape
    await zoomOut(app, 3);

    const baseW = await extentW(app);
    const refStart = (await idBox(app, refId))!;
    const frameStart = (await app.canvas.boundingBox())!;
    const g = (await app.gizmoFrame.boundingBox())!;

    // A SMALL drag that keeps the shape within the 2× boundary — no growth, no origin shift.
    await app.page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await app.page.mouse.down();
    await app.page.mouse.move(g.x + g.width / 2 - 30, g.y + g.height / 2, { steps: 10 });
    expect(await extentW(app)).toBe(baseW); // no growth
    const frameMid = (await app.canvas.boundingBox())!;
    const refMid = (await idBox(app, refId))!;
    expect(Math.abs(frameMid.x - frameStart.x)).toBeLessThan(6);
    expect(Math.abs(refMid.x - refStart.x)).toBeLessThan(6);
    await app.page.mouse.up();
  });
});
