import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * Multi-select editing through the real UI (D-041 + D-049). The shared-property
 * intersection, undo coalescing, and move math are unit-tested; this guards the
 * integrated path: building a selection, the single-inspector PARITY (grouped,
 * unit-bearing horizontal-drag inputs — D-049), the PER-SHAPE selection boxes
 * (no group bounding box — D-049), group move as one undo step, that an
 * empty-space press does not drag the group, the shared fill edit, the mixed
 * state, and group delete.
 *
 * Shapes are placed relative to the canvas size (the scene is 1920×1080, so a
 * 320-px shape is ~1/6 of the canvas width — the placements stay well apart and
 * never overlap). A shape's placement point is its top-left corner.
 */
const rnd = (n: number): number => Math.round(n);

test.describe('Multi-select inspector parity + per-shape boxes (D-049)', () => {
  test('grouped unit-bearing inspector; per-shape boxes (no group box); group move one undo; empty press does not drag', async ({
    app,
  }) => {
    await app.newProject('Multi');
    const cb = (await app.canvas.boundingBox())!;
    const A = { x: rnd(cb.width * 0.14), y: rnd(cb.height * 0.22) };
    const B = { x: rnd(cb.width * 0.62), y: rnd(cb.height * 0.22) };
    const C = { x: rnd(cb.width * 0.14), y: rnd(cb.height * 0.62) };
    const inA = { x: A.x + 10, y: A.y + 8 };
    const inB = { x: B.x + 10, y: B.y + 8 };

    await app.addRectangle(A);
    await app.addRectangle(B);
    await app.addRectangle(C);
    await app.clickCanvas(inA);
    await app.shiftClickCanvas(inB);
    await expect(app.multiInspector).toBeVisible();

    // Parity: transform props are grouped under a Transform section and use the
    // same horizontal-drag number primitive as single selection, WITH units —
    // opacity shows the percent value + `%`, not the raw 0–1 the D-041 flat
    // editor showed.
    await expect(app.multiInspector.getByText('Transform', { exact: false }).first()).toBeVisible();
    const opacity = app.multiInspector.getByRole('spinbutton', { name: 'Opacity' });
    await expect(opacity).toHaveValue('100');
    await expect(app.multiInspector.getByText('%').first()).toBeVisible();

    // Per-shape selection boxes, and NO single group bounding box.
    await expect(app.multiBoxes).toHaveCount(2);
    await expect(app.multiBbox).toHaveCount(0);

    // Group move: both per-shape boxes translate by the SAME delta; one undo
    // reverts the whole move.
    const a0 = (await app.multiBoxes.nth(0).boundingBox())!;
    const b0 = (await app.multiBoxes.nth(1).boundingBox())!;
    await app.groupDrag(inA, { x: 130, y: 80 });
    const a1 = (await app.multiBoxes.nth(0).boundingBox())!;
    const b1 = (await app.multiBoxes.nth(1).boundingBox())!;
    expect(a1.x - a0.x).toBeGreaterThan(20);
    expect(b1.x - b0.x).toBeGreaterThan(20);
    expect(Math.abs(a1.x - a0.x - (b1.x - b0.x))).toBeLessThan(6); // same delta

    await app.undo();
    await app.clickCanvas(inA);
    await app.shiftClickCanvas(inB);
    expect(Math.abs((await app.multiBoxes.nth(0).boundingBox())!.x - a0.x)).toBeLessThan(6);

    // An empty-space press does not drag the group (there is no group box to
    // grab) — it clears the selection per the cursor-tool rule, moving nothing.
    const before = (await app.multiBoxes.nth(0).boundingBox())!;
    await app.groupDrag({ x: rnd(cb.width * 0.85), y: rnd(cb.height * 0.85) }, { x: 120, y: 0 });
    await expect(app.multiInspector).toHaveCount(0);
    await app.clickCanvas(inA);
    await app.shiftClickCanvas(inB);
    expect(Math.abs((await app.multiBoxes.nth(0).boundingBox())!.x - before.x)).toBeLessThan(6);
  });

  test('editing the shared fill recolours every selected shape', async ({ app }) => {
    await app.newProject('MultiFill');
    const cb = (await app.canvas.boundingBox())!;
    const A = { x: rnd(cb.width * 0.14), y: rnd(cb.height * 0.22) };
    const B = { x: rnd(cb.width * 0.62), y: rnd(cb.height * 0.22) };
    await app.addRectangle(A);
    await app.addRectangle(B);
    await app.clickCanvas({ x: A.x + 10, y: A.y + 8 });
    await app.shiftClickCanvas({ x: B.x + 10, y: B.y + 8 });

    await app.setMultiFill('#FF0000');
    await expect.poll(() => app.canvasElementsWithBackground('rgb(255, 0, 0)')).toBe(2);
  });

  test('a mixed selection shows the mixed state through the same primitive; Delete removes all', async ({
    app,
  }) => {
    await app.newProject('MultiMixed');
    const cb = (await app.canvas.boundingBox())!;
    const A = { x: rnd(cb.width * 0.14), y: rnd(cb.height * 0.2) };
    const text = { x: rnd(cb.width * 0.6), y: rnd(cb.height * 0.62) };

    await app.addRectangle(A);
    await app.addTextElement(text); // auto-selected after placing
    await app.shiftClickCanvas({ x: A.x + 10, y: A.y + 8 }); // text + shape → mixed

    await expect(app.multiInspector).toBeVisible();
    // Mixed renders through the SAME primitive: the X field is the drag-input
    // showing an EMPTY (mixed) value, not a "(mixed)" text label.
    await expect(app.multiInspector.getByRole('spinbutton', { name: 'X position' })).toHaveValue(
      '',
    );
    await expect(app.multiInspector.getByText('%').first()).toBeVisible(); // unit intact
    // Fill is shape-only → not shared across text+shape → no fill control.
    await expect(app.multiInspector.getByRole('button', { name: 'fill fill' })).toHaveCount(0);

    const before = await app.canvasFrame.locator('[data-cg-element-id]').count();
    await app.page.keyboard.press('Delete');
    await expect(app.multiInspector).toHaveCount(0);
    await expect
      .poll(() => app.canvasFrame.locator('[data-cg-element-id]').count())
      .toBe(before - 2);
  });

  test('two shapes expose the FULL shape sections; a typed shared edit + Enter is one undo across both (D-050)', async ({
    app,
  }) => {
    await app.newProject('Multi050');
    const cb = (await app.canvas.boundingBox())!;
    const A = { x: rnd(cb.width * 0.14), y: rnd(cb.height * 0.22) };
    const B = { x: rnd(cb.width * 0.62), y: rnd(cb.height * 0.22) };
    const inA = { x: A.x + 10, y: A.y + 8 };
    const inB = { x: B.x + 10, y: B.y + 8 };

    await app.addEllipse(A);
    await app.addEllipse(B);
    await app.clickCanvas(inA);
    await app.shiftClickCanvas(inB);
    await expect(app.multiInspector).toBeVisible();

    // The full shape set is exposed — stroke (Path Style), Border Radius, Drop
    // Shadow, Filter — not just transform; plus per-shape boxes.
    const strokeWidth = app.multiInspector.getByRole('spinbutton', { name: 'stroke width' });
    await expect(strokeWidth).toBeVisible();
    await expect(
      app.multiInspector.getByRole('button', { name: 'Toggle Border Radius' }),
    ).toBeVisible();
    await expect(
      app.multiInspector.getByRole('button', { name: 'Toggle Drop Shadow' }),
    ).toBeVisible();
    await expect(app.multiInspector.getByRole('button', { name: 'Toggle Filter' })).toBeVisible();
    await expect(app.multiBoxes).toHaveCount(2);

    // A typed shared edit commits on Enter as ONE history entry across both: the
    // field reads the agreed new value; a single undo reverts BOTH (back to the
    // shared 0 — not a "mixed" half-reverted state).
    await strokeWidth.fill('8');
    await strokeWidth.press('Enter');
    await expect(strokeWidth).toHaveValue('8');

    await app.undo();
    await app.clickCanvas(inA);
    await app.shiftClickCanvas(inB);
    await expect(app.multiInspector.getByRole('spinbutton', { name: 'stroke width' })).toHaveValue(
      '0',
    );
  });
});

test.describe('Multi-select number fields: drag + realtime (D-053)', () => {
  const sel = async (app: DesignerApp) => {
    await app.newProject('Multi053');
    const cb = (await app.canvas.boundingBox())!;
    const A = { x: rnd(cb.width * 0.14), y: rnd(cb.height * 0.22) };
    const B = { x: rnd(cb.width * 0.62), y: rnd(cb.height * 0.22) };
    const inA = { x: A.x + 10, y: A.y + 8 };
    const inB = { x: B.x + 10, y: B.y + 8 };
    await app.addEllipse(A);
    await app.addEllipse(B);
    await app.clickCanvas(inA);
    await app.shiftClickCanvas(inB);
    await expect(app.multiInspector).toBeVisible();
    return { inA, inB };
  };

  test('dragging a shared number field scrubs all selected live; release is one undo', async ({
    app,
  }) => {
    const { inA, inB } = await sel(app);
    const opacity = app.multiInspector.getByRole('spinbutton', { name: 'Opacity' });
    await expect(opacity).toHaveValue('100');

    // Drag the field LEFT to scrub opacity down — drag-scrub is RE-ENABLED in the
    // multi editor (D-050 had removed it). Mid-drag, before release, the field
    // already shows a single agreed lower value (1–2 digits, NOT the mixed empty
    // state) AND both preview ellipses are faded — live across the selection.
    await app.scrubField(opacity, -40, async () => {
      await expect(opacity).toHaveValue(/^\d{1,2}$/);
      await expect.poll(() => app.canvasElementsWithOpacityBelow1()).toBe(2);
    });
    await expect(opacity).toHaveValue(/^\d{1,2}$/);

    // Release was ONE undo entry: a single undo restores BOTH to 100%.
    await app.undo();
    await app.clickCanvas(inA);
    await app.shiftClickCanvas(inB);
    await expect(app.multiInspector.getByRole('spinbutton', { name: 'Opacity' })).toHaveValue(
      '100',
    );
  });

  test('typing into a shared number field applies live across the selection; Enter is one undo', async ({
    app,
  }) => {
    const { inA, inB } = await sel(app);
    const opacity = app.multiInspector.getByRole('spinbutton', { name: 'Opacity' });
    await expect(opacity).toHaveValue('100');

    // Typing applies LIVE on keystroke (BEFORE Enter): both preview ellipses fade.
    await opacity.fill('50');
    await expect.poll(() => app.canvasElementsWithOpacityBelow1()).toBe(2);

    // Enter sets the commit boundary; ONE undo reverts BOTH back to 100%.
    await opacity.press('Enter');
    await expect(opacity).toHaveValue('50');
    await app.undo();
    await app.clickCanvas(inA);
    await app.shiftClickCanvas(inB);
    await expect(app.multiInspector.getByRole('spinbutton', { name: 'Opacity' })).toHaveValue(
      '100',
    );
  });
});
