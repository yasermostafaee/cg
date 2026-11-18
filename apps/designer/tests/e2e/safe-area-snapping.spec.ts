import { expect, test, type DesignerApp } from './fixtures/designer.js';

async function setBox(
  app: DesignerApp,
  x: number,
  y: number,
  width = 320,
  height = 120,
): Promise<void> {
  await app.setInspectorNumber('X position', x);
  await app.setInspectorNumber('Y position', y);
  await app.setInspectorNumber('Width', width);
  await app.setInspectorNumber('Height', height);
}

async function nativeZoom(app: DesignerApp): Promise<number> {
  const frame = await app.canvasFrame.locator('.cg-stage').boundingBox();
  if (frame === null) throw new Error('Missing composition picture');
  return frame.width / 1920;
}

async function dragSelectedTo(app: DesignerApp, x: number, y: number, alt = false): Promise<void> {
  const startX = await app.getInspectorNumber('X position');
  const startY = await app.getInspectorNumber('Y position');
  const box = await app.gizmoFrame.boundingBox();
  if (box === null) throw new Error('Missing selected element');
  const zoom = await nativeZoom(app);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (alt) await app.page.keyboard.down('Alt');
  await app.page.mouse.move(start.x, start.y);
  await app.page.mouse.down();
  await app.page.mouse.move(start.x + (x - startX) * zoom, start.y + (y - startY) * zoom, {
    steps: 8,
  });
  await app.page.mouse.up();
  if (alt) await app.page.keyboard.up('Alt');
}

async function enableSafeAreas(app: DesignerApp): Promise<void> {
  await app.page.getByRole('button', { name: 'Safe areas', exact: true }).click();
  await expect(app.page.locator('[data-safe-area="graphics"]')).toBeVisible();
}

test('moving an element snaps to visible safe edges and respects Safe Areas, Snap and Alt', async ({
  app,
  page,
}) => {
  await app.newProject('Safe area move snapping');
  await app.addRectangle();
  await app.selectTool('Select');
  await setBox(app, 240, 200);
  await enableSafeAreas(app);
  await dragSelectedTo(app, 106, 200);
  await expect(app.inspector.getByRole('spinbutton', { name: 'X position' })).toHaveValue('96');

  await setBox(app, 240, 200);
  await dragSelectedTo(app, 106, 200, true);
  await expect(app.inspector.getByRole('spinbutton', { name: 'X position' })).toHaveValue('106');

  await setBox(app, 240, 200);
  await page.getByRole('button', { name: 'Safe areas', exact: true }).click();
  await dragSelectedTo(app, 106, 200);
  await expect(app.inspector.getByRole('spinbutton', { name: 'X position' })).toHaveValue('106');

  await setBox(app, 240, 200);
  await enableSafeAreas(app);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const snapping = page.getByRole('menuitemcheckbox', { name: 'Snapping', exact: true });
  await expect(snapping).toHaveAttribute('aria-checked', 'true');
  await snapping.click();
  await dragSelectedTo(app, 106, 200);
  await expect(app.inspector.getByRole('spinbutton', { name: 'X position' })).toHaveValue('106');
});

test('a resize edge lands on the visible graphics boundary without moving its fixed edge', async ({
  app,
  page,
}) => {
  await app.newProject('Safe area resize snapping');
  await app.addRectangle();
  await app.selectTool('Select');
  await setBox(app, 1500, 300, 200, 100);
  await enableSafeAreas(app);
  const box = await app.gizmoFrame.boundingBox();
  if (box === null) throw new Error('Missing selected element');
  const zoom = await nativeZoom(app);
  await page.mouse.move(box.x + box.width, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + (1814 - 1700) * zoom, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(app.inspector.getByRole('spinbutton', { name: 'X position' })).toHaveValue('1500');
  await expect(app.inspector.getByRole('spinbutton', { name: 'Width', exact: true })).toHaveValue(
    '324',
  );
});

test('a selected group follows the safe-edge snap as one move', async ({ app, page }) => {
  await app.newProject('Safe area group snapping');
  await app.addRectangle();
  await setBox(app, 240, 200, 100, 80);
  await app.addRectangle();
  await setBox(app, 500, 400, 100, 80);
  await app.selectTool('Select');
  await enableSafeAreas(app);
  const shapes = app.canvasFrame.locator('[data-cg-element-id]');
  const first = await shapes.nth(0).boundingBox();
  const second = await shapes.nth(1).boundingBox();
  if (first === null || second === null) throw new Error('Missing group members');
  await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.click(second.x + second.width / 2, second.y + second.height / 2);
  await page.keyboard.up('Shift');
  await expect(app.multiBoxes).toHaveCount(2);
  const zoom = await nativeZoom(app);
  const start = { x: first.x + first.width / 2, y: first.y + first.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + (106 - 240) * zoom, start.y, { steps: 8 });
  await page.mouse.up();
  const frame = await app.canvasFrame.locator('.cg-stage').boundingBox();
  if (frame === null) throw new Error('Missing composition picture');
  await expect
    .poll(async () => {
      const moved = await shapes.nth(0).boundingBox();
      return moved === null ? Infinity : (moved.x - frame.x) / zoom;
    })
    .toBeCloseTo(96, 1);
  await expect
    .poll(async () => {
      const moved = await shapes.nth(1).boundingBox();
      return moved === null ? Infinity : (moved.x - frame.x) / zoom;
    })
    .toBeCloseTo(356, 1);
});
