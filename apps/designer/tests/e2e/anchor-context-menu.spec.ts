import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * D-123 — right-click anchor context menu (Delete point) on a finished path with
 * the cursor tool. The menu reuses the EXISTING removeAnchor semantics: re-stitch,
 * below-2-anchors deletes the element, one undo restores; Esc closes the menu
 * without touching the selection or tool (B-037 Esc ownership).
 */

const paths = (app: DesignerApp) => app.canvasFrame.locator('[data-cg-element-id] path');
const anchors = (app: DesignerApp) => app.page.locator('[data-cg-anchor]');
const menu = (app: DesignerApp) => app.page.getByRole('menu', { name: 'Anchor actions' });

async function drawTriangle(app: DesignerApp): Promise<void> {
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await app.canvas.click({ position: { x: 210, y: 240 } });
  await app.page.keyboard.press('Enter'); // open path, selected, pen stays armed
  await app.selectTool('Select'); // PathEditor mounts
  await expect(anchors(app)).toHaveCount(3);
}

test('right-click an anchor → menu → Delete point removes it; undo restores; below 2 deletes the element', async ({
  app,
}) => {
  await app.newProject('AnchorMenu');
  await drawTriangle(app);
  const dBefore = await paths(app).first().getAttribute('d');

  // Right-click the SECOND anchor: the menu opens at the pointer (the native
  // menu never renders into the DOM; the app suppresses it and Playwright would
  // not show it regardless — the assertion is our menu appearing and working).
  await anchors(app).nth(1).click({ button: 'right' });
  await expect(menu(app)).toBeVisible();

  await app.page.getByRole('menuitem', { name: 'Delete point' }).click();
  await expect(menu(app)).toHaveCount(0);
  await expect(anchors(app)).toHaveCount(2); // re-stitched, element intact
  expect(await paths(app).first().getAttribute('d')).not.toBe(dBefore);

  // One undo restores the pre-delete path (undo clears the selection by design,
  // so assert the scene truth via the rendered d, then re-select to edit again).
  await app.undo();
  await expect(paths(app).first()).toHaveAttribute('d', dBefore ?? '');
  await app.clickCanvas({ x: 210, y: 130 }); // re-select on the top segment's stroke
  await expect(anchors(app)).toHaveCount(3);

  // Delete down past the 2-anchor floor: the whole element goes.
  await anchors(app).nth(1).click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Delete point' }).click();
  await expect(anchors(app)).toHaveCount(2);
  await anchors(app).nth(0).click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Delete point' }).click();
  await expect(paths(app)).toHaveCount(0);
});

test('Esc closes the menu without disturbing the selection or the tool', async ({ app }) => {
  await app.newProject('AnchorMenuEsc');
  await drawTriangle(app);

  await anchors(app).nth(0).click({ button: 'right' });
  await expect(menu(app)).toBeVisible();

  await app.page.keyboard.press('Escape');
  await expect(menu(app)).toHaveCount(0);
  // The path is STILL selected (its edit overlay still shows) and the Select
  // tool is still active — the menu owned that Esc.
  await expect(anchors(app)).toHaveCount(3);
  await expect(app.page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Nothing was deleted.
  await expect(paths(app)).toHaveCount(1);
});
