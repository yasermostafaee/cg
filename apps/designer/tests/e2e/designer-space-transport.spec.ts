import { expect, test } from './fixtures/designer.js';

test('B-430 — Space starts the timeline and the selected Rehearse transport', async ({ app }) => {
  await app.newProject('Space transport');
  await app.setSceneDuration(100);
  await app.addRectangle({ x: 240, y: 130 });
  await app.deselect();
  await app.addOutPoint();
  await app.setPlayoutTiming('manual');

  const transport = app.page.getByLabel('Playback transport');
  const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
  await app.scrubToFrame(0);
  await app.page.keyboard.press('Space');
  await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect
    .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
    .toBeGreaterThan(0);

  const rehearse = transport.getByRole('button', { name: 'Rehearse preview' });
  await rehearse.click();
  await app.page.keyboard.press('Space');
  await expect(rehearse).toHaveAttribute('aria-pressed', 'true');
  await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(transport.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await expect
    .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
    .toBeGreaterThan(0);
});

test('B-430 — Space belongs to an active text editor', async ({ app }) => {
  await app.newProject('Space in text');
  await app.addTextElement({ x: 240, y: 130 });
  const painted = app.canvasFrame.locator('[data-cg-element-id]').first();
  const bounds = await painted.boundingBox();
  if (bounds === null) throw new Error('Text is missing from the canvas');
  await app.selectTool('Select');
  await app.page.mouse.dblclick(bounds.x + 12, bounds.y + 8);
  const editor = app.page.locator('[contenteditable="true"]');
  await expect(editor).toBeFocused();
  await editor.fill('متن');
  await app.page.keyboard.press('End');
  await app.page.keyboard.press('Space');
  await app.page.keyboard.type('تست');
  await expect(editor).toHaveText('متن تست');
  await expect(
    app.page.getByLabel('Playback transport').getByRole('button', { name: 'Play', exact: true }),
  ).toBeEnabled();
});
