import { test, expect } from './fixtures/designer.js';

/**
 * D-071 Phase B — the editor PASTEBOARD: a FIXED, SYMMETRIC dark area around the frame
 * (a margin on EVERY side) where the author parks/sees/moves shapes. Off-frame shapes
 * render + are selectable on all sides (left/top too) and persist in save, but are
 * EXCLUDED from the broadcast preview + export (Phase A still drops them, through the
 * authoring flag). The dark area is resolution-driven, so dragging never resizes it
 * (only zoom does). On-frame editing is unchanged; the modal still blanks-until-play.
 */
test.describe('Editor pasteboard (D-071 Phase B)', () => {
  test('an off-frame shape is dropped from the broadcast preview + export but kept on the canvas; the modal still blanks-until-play', async ({
    app,
  }) => {
    await app.newProject('Pasteboard');
    await app.addRectangle({ x: 240, y: 200 });

    // Park it on the pasteboard, off the right edge (frame is 1920 wide).
    const xField = app.inspector.getByRole('spinbutton', { name: 'X position' });
    await xField.fill('2000');
    await xField.press('Enter');

    // Canvas (authoring) KEEPS it — the node is rendered (into the pasteboard).
    const canvasFrame = app.page.frameLocator('iframe[title="cgpreview"]');
    await expect(canvasFrame.locator('[data-cg-element-id]')).toHaveCount(1);

    // Broadcast preview DROPS it (Phase A through the new flag) AND still blanks
    // until Play (D-087 intact).
    await app.openPreviewModal();
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/); // D-087
    await expect(app.previewFrame.locator('[data-cg-element-id]')).toHaveCount(0); // Phase A
    await app.previewDialog.getByRole('button', { name: 'Close' }).click();

    // Export DROPS it.
    const { html } = await app.exportHtml();
    expect(html).toContain('<!doctype html');
    expect((html.match(/"type":"shape"/g) ?? []).length).toBe(0);
  });

  test('the pasteboard lifts the frame clip so off-frame shapes render + stay selected; on-frame select/drag is unchanged', async ({
    app,
  }) => {
    await app.newProject('PasteboardEdit');
    await app.addRectangle({ x: 240, y: 200 });
    const canvasFrame = app.page.frameLocator('iframe[title="cgpreview"]');
    const shape = canvasFrame.locator('[data-cg-element-id]');

    // On-frame control: the shape is selected on add (gizmo shown) and DRAGGABLE on
    // the canvas exactly as before — no hit-test regression.
    await expect(app.gizmoFrame).toBeVisible();
    const xField = app.inspector.getByRole('spinbutton', { name: 'X position' });
    const x0 = Number(await xField.inputValue());
    const box = (await shape.boundingBox())!;
    await app.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await app.page.mouse.down();
    await app.page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
    await app.page.mouse.up();
    await expect.poll(async () => Number(await xField.inputValue())).toBeGreaterThan(x0); // dragged

    // The canvas runs in AUTHORING mode: the frame clip is LIFTED so off-frame
    // shapes paint into the pasteboard (the broadcast modal + export keep the clip).
    const overflowX = await canvasFrame
      .locator('.cg-stage')
      .evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe('visible');

    // Park it off-frame: it stays RENDERED (into the pasteboard, not clipped away)
    // and stays SELECTED — the overlay's gizmo tracks it off-frame.
    await xField.fill('2000');
    await xField.press('Enter');
    await expect(shape).toBeAttached();
    await expect(app.gizmoFrame).toBeAttached();
  });

  test('on open the frame is fit + CENTERED in the viewport (no off-center scroll)', async ({
    app,
  }) => {
    await app.newProject('Centered');
    // The frame (canvas-surface) is centred in the canvas viewport — its centre
    // matches the viewport centre, not pinned to a corner of the pasteboard.
    const offset = async (): Promise<{ dx: number; dy: number }> => {
      const v = (await app.page.getByTestId('canvas-viewport').boundingBox())!;
      const f = (await app.canvas.boundingBox())!;
      return {
        dx: Math.abs(f.x + f.width / 2 - (v.x + v.width / 2)),
        dy: Math.abs(f.y + f.height / 2 - (v.y + v.height / 2)),
      };
    };
    await expect.poll(async () => (await offset()).dx).toBeLessThan(10);
    await expect.poll(async () => (await offset()).dy).toBeLessThan(10);
  });

  test('alignment guides span the full canvas (pasteboard), not the frame', async ({ app }) => {
    await app.newProject('Guides');
    await app.addRectangle({ x: 240, y: 200 });
    const viewport = (await app.page.getByTestId('canvas-viewport').boundingBox())!;
    const frame = (await app.canvas.boundingBox())!;
    const shapeBox = (await app.page
      .frameLocator('iframe[title="cgpreview"]')
      .locator('[data-cg-element-id]')
      .boundingBox())!;

    // Drag the shape so its centre meets the frame centre → centre snap guides show.
    await app.page.mouse.move(shapeBox.x + shapeBox.width / 2, shapeBox.y + shapeBox.height / 2);
    await app.page.mouse.down();
    await app.page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2, { steps: 12 });

    // Mid-drag: a guide is drawn across the FULL visible canvas (≈ the viewport
    // height), NOT just the frame — the regression was a half (frame-height) guide.
    const guideLine = app.page.getByTestId('snap-guides').locator('div').first();
    await expect(guideLine).toBeVisible();
    const lineBox = (await guideLine.boundingBox())!;
    expect(lineBox.height).toBeGreaterThan(frame.height);
    expect(Math.abs(lineBox.height - viewport.height)).toBeLessThan(8);
    await app.page.mouse.up();
  });

  test('a shape parked off the LEFT/TOP of the frame stays visible on the pasteboard', async ({
    app,
  }) => {
    await app.newProject('OffLeftTop');
    await app.addRectangle({ x: 240, y: 200 });
    const shape = app.page
      .frameLocator('iframe[title="cgpreview"]')
      .locator('[data-cg-element-id]');

    // Park it fully off the TOP-LEFT (negative scene coords; the default rect is
    // 320×120, so -500/-300 clears the frame on both axes while staying inside the
    // 960×540 margin). With the OLD right/bottom-only pasteboard this fell outside the
    // stage and was clipped away; the symmetric pasteboard keeps it painted.
    const xField = app.inspector.getByRole('spinbutton', { name: 'X position' });
    const yField = app.inspector.getByRole('spinbutton', { name: 'Y position' });
    await xField.fill('-500');
    await xField.press('Enter');
    await yField.fill('-300');
    await yField.press('Enter');

    // Scroll to the pasteboard's top-left so the off-frame margin is in view.
    const viewport = app.page.getByTestId('canvas-viewport');
    await viewport.evaluate((el) => {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    });

    // The shape paints in the dark margin — fully ABOVE-LEFT of the frame, and inside
    // the visible viewport (not clipped off).
    await expect(shape).toBeAttached();
    const vp = (await viewport.boundingBox())!;
    const frame = (await app.canvas.boundingBox())!;
    const box = (await shape.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + 2); // left of the frame
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + 2); // above the frame
    expect(box.x).toBeGreaterThan(vp.x); // visible, not clipped past the left edge
    expect(box.y).toBeGreaterThan(vp.y); // visible, not clipped past the top edge
  });

  test('two-tone canvas — #161927 surround + #c4c4ca frame page — on-frame shapes stay visible (not occluded)', async ({
    app,
  }) => {
    await app.newProject('TwoTone');
    await app.addRectangle({ x: 240, y: 200 });
    const canvasFrame = app.page.frameLocator('iframe[title="cgpreview"]');
    const shape = canvasFrame.locator('[data-cg-element-id]').first();
    await expect(shape).toBeVisible();

    // SURROUND = the lighter #161927: the scroll viewport (s.outer) AND the iframe
    // body (the area beyond the frame, where off-frame shapes park).
    const surround = await app.page
      .getByTestId('canvas-viewport')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(surround).toBe('rgb(22, 25, 39)'); // #161927
    const bodyBg = await canvasFrame
      .locator('body')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bodyBg).toBe('rgb(22, 25, 39)'); // #161927

    // FRAME-SIZED page backdrop (.cg-stage) = a light gray #c4c4ca — a
    // background-color, so it paints BEHIND the near-white checkerboard + shapes.
    const pageBg = await canvasFrame
      .locator('.cg-stage')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(pageBg).toBe('rgb(196, 196, 202)'); // #c4c4ca

    // The on-frame shape over the #c4c4ca page is NOT occluded: at its centre the
    // topmost painted node belongs to the shape's own subtree (or an ancestor it paints
    // over) — never a sibling overlay. A #c4c4ca painted in FRONT would fail this.
    const topIsShape = await shape.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = el.ownerDocument.elementFromPoint(
        Math.round(r.left + r.width / 2),
        Math.round(r.top + r.height / 2),
      );
      return top !== null && (el === top || el.contains(top) || top.contains(el));
    });
    expect(topIsShape).toBe(true);
    await expect(app.gizmoFrame).toBeVisible(); // selectable
  });

  test('Ctrl+wheel zoom is anchored at the cursor — the point under the pointer does not jump', async ({
    app,
  }) => {
    await app.newProject('ZoomAnchor');
    await app.addRectangle({ x: 240, y: 200 });
    const shape = app.page
      .frameLocator('iframe[title="cgpreview"]')
      .locator('[data-cg-element-id]');
    await expect(shape).toBeVisible();

    // Put the cursor exactly on the shape's centre, then Ctrl+wheel to zoom in. The
    // shape's centre IS the scene point under the cursor, so a cursor-anchored zoom must
    // keep it at the SAME viewport pixel (no recenter, no drift) while the shape grows.
    const before = (await shape.boundingBox())!;
    const cx = before.x + before.width / 2;
    const cy = before.y + before.height / 2;
    await app.page.mouse.move(cx, cy);
    await app.page.keyboard.down('Control');
    await app.page.mouse.wheel(0, -120); // deltaY < 0 → zoom in one step
    await app.page.keyboard.up('Control');

    await expect
      .poll(async () => (await shape.boundingBox())!.width)
      .toBeGreaterThan(before.width + 1); // zoomed in (the shape grew)
    const after = (await shape.boundingBox())!;
    expect(Math.abs(after.x + after.width / 2 - cx)).toBeLessThan(6); // centre stayed under cursor
    expect(Math.abs(after.y + after.height / 2 - cy)).toBeLessThan(6);
  });

  test('the ruler stays pinned to the viewport when zoomed in and scrolled', async ({ app }) => {
    await app.newProject('ScrollRuler');

    // Show the ruler (View ▸ Ruler). `exact` so 'View' doesn't also match 'Preview'.
    await app.page.getByRole('button', { name: 'View', exact: true }).click();
    await app.page.getByRole('menuitemcheckbox', { name: 'Ruler (R)' }).click();
    const rulerTop = app.page.getByTestId('ruler-top');
    await expect(rulerTop).toBeVisible();

    // Zoom to 100% so the 1920×1080 frame overflows the canvas viewport, then
    // scroll. The rulers live in a NON-scrolling overlay, so the top bar must stay
    // pinned to the viewport top — before the fix it scrolled away with the content
    // (it was absolutely positioned inside the overflow:auto scroll container).
    await app.page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
    const viewport = app.page.getByTestId('canvas-viewport');
    await viewport.evaluate((el) => {
      el.scrollTop = 200;
      el.scrollLeft = 200;
    });

    const vp = (await viewport.boundingBox())!;
    const ruler = (await rulerTop.boundingBox())!;
    // Pinned to the top edge (not scrolled up by ~200px) and spanning the width.
    expect(Math.abs(ruler.y - vp.y)).toBeLessThan(3);
    expect(ruler.width).toBeGreaterThan(vp.width - 4);
  });
});
