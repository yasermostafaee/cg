import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-076 / D-077 — selection-aware layer clipboard. The store ops, one-undo
 * coalescing, and the fit / color EFFECTS are unit-tested
 * (`tests/store-layer-actions.test.ts`); this guards the integrated UI: the
 * right-click layer menu and the Ctrl/Cmd+C/X/V shortcuts acting on the WHOLE
 * selection, plus the standard-editor target normalization (right-clicking an
 * unselected row retargets to just it).
 *
 * "Layers" are the timeline element rows. Shapes are placed at distinct canvas
 * points and multi-selected via the canvas (the selection is shared with the
 * timeline rows), then acted on through the layer menu / keyboard.
 */
const rnd = (n: number): number => Math.round(n);
interface Pt {
  x: number;
  y: number;
}

async function threeRects(app: DesignerApp): Promise<{ inA: Pt; inB: Pt; inC: Pt }> {
  await app.newProject('Clip');
  const cb = (await app.canvas.boundingBox())!;
  const A = { x: rnd(cb.width * 0.16), y: rnd(cb.height * 0.22) };
  const B = { x: rnd(cb.width * 0.6), y: rnd(cb.height * 0.22) };
  const C = { x: rnd(cb.width * 0.16), y: rnd(cb.height * 0.62) };
  await app.addRectangle(A);
  await app.addRectangle(B);
  await app.addRectangle(C);
  expect(await app.rowCount()).toBe(3);
  return {
    inA: { x: A.x + 10, y: A.y + 8 },
    inB: { x: B.x + 10, y: B.y + 8 },
    inC: { x: C.x + 10, y: C.y + 8 },
  };
}

async function selectTwo(app: DesignerApp, inA: Pt, inB: Pt): Promise<void> {
  await app.clickCanvas(inA);
  await app.shiftClickCanvas(inB);
  expect(await app.selectedRowCount()).toBe(2);
}

test.describe('D-076 — selection-aware layer context menu', () => {
  test('copy a multi-selection, then paste, clones every copied layer (one undo)', async ({
    app,
  }) => {
    const { inA, inB } = await threeRects(app);
    await selectTwo(app, inA, inB);

    // Right-clicking a SELECTED row keeps the whole selection → Copy covers both.
    await app.openMenuOnSelectedRow();
    await app.layerMenuItem('Copy').click();
    await app.openMenuOnSelectedRow();
    await app.layerMenuItem('Paste').click();
    await expect.poll(() => app.rowCount()).toBe(5); // 3 + 2 fresh clones

    await app.undo(); // ONE undo removes both pasted clones
    await expect.poll(() => app.rowCount()).toBe(3);
  });

  test('cut removes every selected layer; the cut layers paste back', async ({ app }) => {
    const { inA, inB } = await threeRects(app);
    await selectTwo(app, inA, inB);

    await app.openMenuOnSelectedRow();
    await app.layerMenuItem('Cut').click();
    await expect.poll(() => app.rowCount()).toBe(1); // both selected removed

    await app.page.keyboard.press('Control+v'); // the cut pair pastes back
    await expect.poll(() => app.rowCount()).toBe(3);
  });

  test('duplicate on a 2-selection makes a clone of each selected layer (one undo)', async ({
    app,
  }) => {
    const { inA, inB } = await threeRects(app);
    await selectTwo(app, inA, inB);

    await app.openMenuOnSelectedRow();
    await app.layerMenuItem('Duplicate').click();
    await expect.poll(() => app.rowCount()).toBe(5); // 3 + 2 clones

    await app.undo();
    await expect.poll(() => app.rowCount()).toBe(3);
  });

  test('delete on a multi-selection removes every selected layer in one step', async ({ app }) => {
    const { inA, inB } = await threeRects(app);
    await selectTwo(app, inA, inB);

    await app.openMenuOnSelectedRow();
    await app.layerMenuItem('Delete').click();
    await expect.poll(() => app.rowCount()).toBe(1); // both selected gone

    await app.undo();
    await expect.poll(() => app.rowCount()).toBe(3);
  });

  test('right-clicking an UNSELECTED layer retargets the menu to just it', async ({ app }) => {
    const { inA, inB } = await threeRects(app);
    await selectTwo(app, inA, inB); // A + B selected, the 3rd row is not

    // The menu retargets to the unselected row → Delete removes ONLY it (not A+B).
    await app.openMenuOnUnselectedRow();
    await app.layerMenuItem('Delete').click();
    await expect.poll(() => app.rowCount()).toBe(2); // A + B remain
  });
});

test.describe('D-077 — copy / cut / paste keyboard shortcuts', () => {
  test('Ctrl+C then Ctrl+V copy & paste the whole selection; Ctrl+X cuts it', async ({ app }) => {
    const { inA, inB } = await threeRects(app);
    await selectTwo(app, inA, inB);

    await app.page.keyboard.press('Control+c');
    await app.page.keyboard.press('Control+v');
    await expect.poll(() => app.rowCount()).toBe(5);
    await app.undo();
    await expect.poll(() => app.rowCount()).toBe(3);

    // Ctrl+X cuts the (re-made) selection
    await selectTwo(app, inA, inB);
    await app.page.keyboard.press('Control+x');
    await expect.poll(() => app.rowCount()).toBe(1);
  });

  test('the shortcut does nothing while a text field is focused (native clipboard wins)', async ({
    app,
  }) => {
    const { inA } = await threeRects(app);
    await app.clickCanvas(inA); // single selection → inspector shows the name field

    await app.elementNameInput.focus();
    await app.page.keyboard.press('Control+x'); // must NOT cut the layer
    await expect.poll(() => app.rowCount()).toBe(3);
  });

  test('Ctrl+V with an empty clipboard is inert', async ({ app }) => {
    const { inA } = await threeRects(app);
    await app.clickCanvas(inA); // fresh project → clipboard empty

    await app.page.keyboard.press('Control+v');
    await expect.poll(() => app.rowCount()).toBe(3);
  });
});
