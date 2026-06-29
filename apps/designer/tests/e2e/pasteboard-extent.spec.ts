import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * B-027 — the pasteboard is a FIXED extent (a pure function of the resolution: a one-frame
 * margin on every side → total 3× × 3×), NOT content-grown. Parking a shape off-frame
 * changes neither the extent nor the frame offset, and the frame never drifts (the
 * grow-to-fit origin shift was the jitter source). Element drags + nudges are CLAMPED to
 * the extent, so no shape can be moved into the clipped region beyond it (no dead zone).
 *
 * The default rectangle is 320×120 (scale 1). For a 1920×1080 frame the pasteboard spans
 * scene x ∈ [−1920, 3840], y ∈ [−1080, 2160]; clamping the FULL box keeps the top-left in
 * x ∈ [−1920, 3840−320 = 3520], y ∈ [−1080, 2160−120 = 2040]. The clamp is delta-based, so
 * an overshooting drag pins the box edge exactly to the bound regardless of where it began.
 */
test.describe('B-027 — fixed pasteboard extent + drag/nudge clamp (no dead zone)', () => {
  // The iframe element's INLINE width/height is the scene-px extent (React sets it from
  // `extent`). Read the inline style, NOT offsetWidth — offsetWidth resolves the `width:100%`
  // fallback to the scaled stage size mid-settle under load, which flakes.
  const extentW = (app: DesignerApp): Promise<number> =>
    app.page
      .locator('iframe[title="cgpreview"]')
      .evaluate((el) => parseFloat((el as HTMLElement).style.width));
  const extentH = (app: DesignerApp): Promise<number> =>
    app.page
      .locator('iframe[title="cgpreview"]')
      .evaluate((el) => parseFloat((el as HTMLElement).style.height));

  const readX = async (app: DesignerApp): Promise<number> =>
    Number(await app.inspector.getByRole('spinbutton', { name: 'X position' }).inputValue());
  const readY = async (app: DesignerApp): Promise<number> =>
    Number(await app.inspector.getByRole('spinbutton', { name: 'Y position' }).inputValue());

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

  /**
   * MOVE the currently-selected shape by (dx, dy) SCREEN px via a real pointer drag. Robust
   * under parallel load: switches to the Select tool and WAITS until its toolbar button is
   * `aria-pressed` — so the overlay sees `tool: cursor` before the drag; otherwise the
   * still-active Rectangle tool would DRAW a new shape (the race that flaked under load).
   * The grab point (260, 210) sits just inside the freshly-placed 320×120 rect (top-left at
   * the 240,200 click) at any fit zoom, so the press lands on the body → `beginDrag`.
   */
  async function dragSelected(app: DesignerApp, by: { x: number; y: number }): Promise<void> {
    await app.selectTool('Select');
    await expect(app.page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await app.dragShape({ x: 260, y: 210 }, by);
  }

  test('the extent is FIXED (3× × 3×) and does NOT change when a shape is parked far off any side', async ({
    app,
  }) => {
    await app.newProject('Fixed');
    await app.addRectangle({ x: 240, y: 200 });
    await expect.poll(() => extentW(app)).toBe(1920 * 3); // 5760
    await expect.poll(() => extentH(app)).toBe(1080 * 3); // 3240

    // The inspector (unlike a drag) is NOT clamped, so it can still park a shape beyond the
    // extent — the extent must stay FIXED regardless (no grow-to-fit).
    for (const [dir, x, y] of [
      ['right', 6000, 200],
      ['left', -5000, 200],
      ['bottom', 240, 4000],
      ['top', 240, -3000],
    ] as const) {
      await setXY(app, x, y);
      await expect.poll(() => extentW(app), dir).toBe(1920 * 3); // no grow-to-fit
      await expect.poll(() => extentH(app), dir).toBe(1080 * 3);
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

  test('dragging past the LEFT/TOP edges STOPS with the box inside (negative coords, no dead zone)', async ({
    app,
  }) => {
    await app.newProject('ClampLeftTop');
    await app.addRectangle({ x: 240, y: 200 });
    // Drag hard up-and-left, well past the pasteboard corner.
    await dragSelected(app, { x: -4000, y: -4000 });
    // The full box stops AT the negative bounds — the left/top edges touch, never cross.
    expect(await readX(app)).toBe(-1920);
    expect(await readY(app)).toBe(-1080);
    // …and the shape is still rendered + selectable (it never entered a clipped dead zone).
    await expect(app.gizmoFrame).toBeAttached();
  });

  test('dragging past the RIGHT/BOTTOM edges STOPS with the box inside', async ({ app }) => {
    await app.newProject('ClampRightBottom');
    await app.addRectangle({ x: 240, y: 200 });
    await dragSelected(app, { x: 4000, y: 4000 });
    // Top-left clamped so the box's right/bottom edges touch the bounds (3840−320, 2160−120).
    expect(await readX(app)).toBe(3520);
    expect(await readY(app)).toBe(2040);
    await expect(app.gizmoFrame).toBeAttached();
  });

  test('arrow-key nudge cannot push a shape past the pasteboard edge', async ({ app }) => {
    await app.newProject('NudgeClamp');
    await app.addRectangle({ x: 240, y: 200 });
    // Park it AT the left bound by dragging far left (focus stays on the canvas, not an
    // input — so the arrow-nudge handler is live).
    await dragSelected(app, { x: -4000, y: 0 });
    expect(await readX(app)).toBe(-1920);

    // Nudge RIGHT 5px (1px/press) — the nudge path moves the shape…
    for (let i = 0; i < 5; i++) await app.page.keyboard.press('ArrowRight');
    expect(await readX(app)).toBe(-1915);

    // …then nudge LEFT 10px — it reaches the bound and STOPS there (does not cross to −1925).
    for (let i = 0; i < 10; i++) await app.page.keyboard.press('ArrowLeft');
    expect(await readX(app)).toBe(-1920);
  });
});
