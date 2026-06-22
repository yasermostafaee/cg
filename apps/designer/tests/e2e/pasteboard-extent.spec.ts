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
