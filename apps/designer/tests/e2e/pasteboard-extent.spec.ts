import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * B-027 — the pasteboard is a FIXED extent (a pure function of the resolution: 3× the
 * frame width left/right, 2× the frame height top/bottom → total 7× × 5×), NOT
 * content-grown. So parking a shape off-frame changes neither the extent nor the frame
 * offset, and the frame never drifts (the grow-to-fit origin shift was the jitter source).
 * A shape parked beyond the extent stays in the scene and is reachable by zoom-out / pan.
 */
test.describe('B-027 — fixed pasteboard extent (no grow, no drift)', () => {
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

  test('the extent is FIXED (7× × 5×) and does NOT change when a shape is parked far off any side', async ({
    app,
  }) => {
    await app.newProject('Fixed');
    await app.addRectangle({ x: 240, y: 200 });
    const baseW = await extentW(app);
    const baseH = await extentH(app);
    expect(baseW).toBe(1920 * 7); // 13440
    expect(baseH).toBe(1080 * 5); // 5400

    for (const [dir, x, y] of [
      ['right', 6000, 200],
      ['left', -5000, 200],
      ['bottom', 240, 4000],
      ['top', 240, -3000],
    ] as const) {
      await setXY(app, x, y);
      expect(await extentW(app), dir).toBe(baseW); // no grow-to-fit
      expect(await extentH(app), dir).toBe(baseH);
      await setXY(app, 240, 200);
    }
  });

  test('the frame does NOT drift when a shape is parked off-frame on the left/top (the bug fix)', async ({
    app,
  }) => {
    await app.newProject('NoDrift');
    await app.addRectangle({ x: 240, y: 200 });
    // The frame (canvas-surface, at scene 0,0) is the reference. Off-LEFT/TOP is the
    // direction the old grow-to-fit shifted the origin → the frame used to drift.
    const before = (await app.canvas.boundingBox())!;
    await setXY(app, -5000, -3000);
    const after = (await app.canvas.boundingBox())!;
    // Fixed extent ⇒ constant offset ⇒ no origin shift ⇒ the frame stays exactly put.
    expect(Math.abs(after.x - before.x)).toBeLessThan(2);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  });

  test('a shape parked within the extent stays rendered + selectable; one beyond is not lost', async ({
    app,
  }) => {
    await app.newProject('Reach');
    await app.addRectangle({ x: 240, y: 200 });
    const shape = app.page
      .frameLocator('iframe[title="cgpreview"]')
      .locator('[data-cg-element-id]');

    // Within the fixed extent → rendered + selectable.
    await setXY(app, 3000, 200);
    await expect(shape).toBeAttached();
    await expect(app.gizmoFrame).toBeAttached();

    // Beyond the extent → outside the visible dark area, but STILL in the scene: drag it
    // back and it is there (not deleted/lost).
    await setXY(app, 50_000, 200);
    await setXY(app, 240, 200);
    await expect(shape).toBeAttached();
    await expect(app.gizmoFrame).toBeAttached();
  });
});
