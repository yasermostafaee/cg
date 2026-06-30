import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * B-027 — the pasteboard is a FIXED extent (a pure function of the resolution), NOT
 * content-grown. The margin per side is the LARGER of an absolute minimum or one full frame:
 * `max(5000, W)` left+right, `max(3000, H)` top+bottom → extent `W + 2·marginX` × `H + 2·marginY`.
 * Parking a shape off-frame changes neither the extent nor the frame offset, and the frame
 * never drifts (the grow-to-fit origin shift was the jitter source). Element drags + nudges
 * are CLAMPED to the extent, so no shape can be moved into the clipped region beyond it (no
 * dead zone).
 *
 * The default rectangle is 320×120 (scale 1). For a 1920×1080 frame (both axes below the
 * floor → margin 5000/3000) the pasteboard spans scene x ∈ [−5000, 6920], y ∈ [−3000, 4080];
 * clamping the FULL box keeps the top-left in x ∈ [−5000, 6920−320 = 6600], y ∈ [−3000,
 * 4080−120 = 3960]. The clamp is delta-based, so an overshooting drag pins the box edge
 * exactly to the bound regardless of where it began.
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

  test('the extent is FIXED (frame + 2·margin) and does NOT change when a shape is parked far off any side', async ({
    app,
  }) => {
    await app.newProject('Fixed');
    await app.addRectangle({ x: 240, y: 200 });
    await expect.poll(() => extentW(app)).toBe(11920); // 1920 + 2·5000
    await expect.poll(() => extentH(app)).toBe(7080); //  1080 + 2·3000

    // The inspector (unlike a drag) is NOT clamped, so it can still park a shape beyond the
    // extent — the extent must stay FIXED regardless (no grow-to-fit).
    for (const [dir, x, y] of [
      ['right', 9000, 200],
      ['left', -7000, 200],
      ['bottom', 240, 6000],
      ['top', 240, -4000],
    ] as const) {
      await setXY(app, x, y);
      await expect.poll(() => extentW(app), dir).toBe(11920); // no grow-to-fit
      await expect.poll(() => extentH(app), dir).toBe(7080);
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
    expect(await readX(app)).toBe(-5000);
    expect(await readY(app)).toBe(-3000);
    // …and the shape is still rendered + selectable (it never entered a clipped dead zone).
    await expect(app.gizmoFrame).toBeAttached();
  });

  test('dragging past the RIGHT/BOTTOM edges STOPS with the box inside', async ({ app }) => {
    await app.newProject('ClampRightBottom');
    await app.addRectangle({ x: 240, y: 200 });
    await dragSelected(app, { x: 4000, y: 4000 });
    // Top-left clamped so the box's right/bottom edges touch the bounds (6920−320, 4080−120).
    expect(await readX(app)).toBe(6600);
    expect(await readY(app)).toBe(3960);
    await expect(app.gizmoFrame).toBeAttached();
  });

  test('at maximum zoom-out the pasteboard hugs ALL FOUR viewport edges — no surround sliver (multi-resolution)', async ({
    app,
  }) => {
    await app.newProject('Cover');

    const zoomOut = app.page.getByRole('button', { name: 'Zoom out', exact: true });

    async function setResolution(w: number, h: number): Promise<void> {
      await app.deselect();
      const wInput = app.inspector.getByRole('spinbutton', { name: 'Composition width' });
      const hInput = app.inspector.getByRole('spinbutton', { name: 'Composition height' });
      await wInput.fill(String(w));
      await wInput.press('Enter');
      await hInput.fill(String(h));
      await hInput.press('Enter');
    }

    // How far the rendered stage (pasteboard) covers each edge of the scroll viewport's CLIENT
    // area — the padding-box, where the `#0e1018` surround would show. The client edges are the
    // border-box (getBoundingClientRect) inset by the border (`clientLeft/Top` + `clientW/H`).
    // Positive = the stage covers/overflows that edge; NEGATIVE = a surround gap there.
    async function edgeCoverage(): Promise<{
      left: number;
      top: number;
      right: number;
      bottom: number;
    }> {
      return app.page.evaluate(() => {
        const outer = document.querySelector('[data-testid="canvas-viewport"]') as HTMLElement;
        const stage = document.querySelector('[data-testid="canvas-stage"]') as HTMLElement;
        const o = outer.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        const cl = o.left + outer.clientLeft;
        const ct = o.top + outer.clientTop;
        const cr = cl + outer.clientWidth;
        const cb = ct + outer.clientHeight;
        return { left: cl - s.left, top: ct - s.top, right: s.right - cr, bottom: s.bottom - cb };
      });
    }

    // A WIDE, a TALL, and a smaller resolution → different extent aspects so a different axis is
    // the tight (cover) one. At maximum zoom-out EVERY edge must be covered (the over-cover bias
    // keeps the TRAILING right/bottom edges flush too, not just the leading left/top).
    for (const [w, h] of [
      [1920, 1080],
      [1080, 1920],
      [1280, 720],
    ] as const) {
      await setResolution(w, h);
      for (let i = 0; i < 40; i++) await zoomOut.click();
      const cov = await edgeCoverage();
      // Every edge covered (≥ 0, within a sub-pixel tolerance) — the stage hugs or overflows
      // each side, so NO `#0e1018` surround shows. The old `0.5rem` padding left an ~8px gap.
      for (const [edge, v] of Object.entries(cov)) {
        expect(v, `${String(w)}×${String(h)} ${edge} gap`).toBeGreaterThanOrEqual(-0.5);
      }
    }
  });

  test('arrow-key nudge cannot push a shape past the pasteboard edge', async ({ app }) => {
    await app.newProject('NudgeClamp');
    await app.addRectangle({ x: 240, y: 200 });
    // Park it AT the left bound by dragging far left.
    await dragSelected(app, { x: -4000, y: 0 });
    expect(await readX(app)).toBe(-5000);

    // Dispatch the nudge keydowns directly on `window` (the global handler's target), so the
    // test is immune to where focus landed after the off-screen drag (the canvas toolbar uses
    // roving-tabindex, so arrows to a focused tool button get trapped). Matches the held-key
    // technique in arrow-nudge.spec.ts. `e.target` is then `window` (not an input), so the
    // handler runs; the selection is store state, so it is still active.
    const nudge = (key: string, times: number): Promise<void> =>
      app.page.evaluate(
        ({ key, times }) => {
          for (let i = 0; i < times; i++) {
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
            );
          }
        },
        { key, times },
      );

    // Nudge RIGHT 5px (1px/press) — the nudge path moves the shape inward off the bound…
    await nudge('ArrowRight', 5);
    await expect.poll(() => readX(app)).toBe(-4995);

    // …then nudge LEFT 10px — it reaches the bound and STOPS there (does not cross to −5005).
    await nudge('ArrowLeft', 10);
    await expect.poll(() => readX(app)).toBe(-5000);
  });

  test('a TINY resolution does NOT freeze zoom — min-zoom is small and zoom in/out works', async ({
    app,
  }) => {
    // The reported bug: a 100×100 frame gave a 300×300 pasteboard → cover-fit forced a ~428%
    // min-zoom, locking zoom. With margin = max(5000,W)/max(3000,H) the pasteboard is
    // 10100×6100, so the cover-fit min-zoom is a small fraction and zoom-out is free again.
    await app.newProject('TinyRes');
    // Shrink the composition to 100×100 via the (deselected) composition size inputs.
    await app.deselect();
    const wInput = app.inspector.getByRole('spinbutton', { name: 'Composition width' });
    const hInput = app.inspector.getByRole('spinbutton', { name: 'Composition height' });
    await wInput.fill('100');
    await wInput.press('Enter');
    await hInput.fill('100');
    await hInput.press('Enter');
    // The extent re-derives to the always-large 10100×6100 pasteboard.
    await expect.poll(() => extentW(app)).toBe(10100);
    await expect.poll(() => extentH(app)).toBe(6100);

    const readZoom = async (): Promise<number> =>
      Number((await app.page.getByTestId('zoom-readout').textContent())!.replace('%', ''));

    // Zoom out HARD — the dynamic min is the cover-fit of a 10100-wide pasteboard, a small %.
    const zoomOut = app.page.getByRole('button', { name: 'Zoom out', exact: true });
    for (let i = 0; i < 40; i++) await zoomOut.click();
    const minZoom = await readZoom();
    // Well under 100% (≈ 10–20% for a normal viewport) — NOT the old frozen ~428%.
    expect(minZoom).toBeLessThan(100);

    // …and zoom is not locked: zooming IN raises the %, proving a useful range exists.
    const zoomIn = app.page.getByRole('button', { name: 'Zoom in', exact: true });
    for (let i = 0; i < 5; i++) await zoomIn.click();
    expect(await readZoom()).toBeGreaterThan(minZoom);
  });

  test('drag clamp still keeps a shape inside the pasteboard at a non-default (smaller) resolution', async ({
    app,
  }) => {
    // Not only the default 1920×1080 — the clamp reads `pasteboardSceneBounds(resolution)`, so it
    // follows the re-derived extent at any resolution. 1280×720 is below the floor on both axes, so
    // the margins are still 5000/3000 (bounds −5000 / −3000); Fit centers + sizes the smaller frame
    // to the viewport so the placement click + grab stay reliable. (Above-floor bounds — where the
    // margin is one full frame — are exhaustively covered by the pasteboardLayout unit tests.)
    await app.newProject('SmallerResClamp');
    await app.deselect();
    const wInput = app.inspector.getByRole('spinbutton', { name: 'Composition width' });
    const hInput = app.inspector.getByRole('spinbutton', { name: 'Composition height' });
    await wInput.fill('1280');
    await wInput.press('Enter');
    await hInput.fill('720');
    await hInput.press('Enter');
    await app.page.getByRole('button', { name: 'Fit' }).click();

    await app.addRectangle({ x: 240, y: 200 });
    // Drag hard up-and-left, well past the corner — the box stops at the re-derived bounds.
    await dragSelected(app, { x: -4000, y: -4000 });
    expect(await readX(app)).toBe(-5000);
    expect(await readY(app)).toBe(-3000);
    await expect(app.gizmoFrame).toBeAttached();
  });
});
