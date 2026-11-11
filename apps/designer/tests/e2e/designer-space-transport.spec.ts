import { expect, test } from './fixtures/designer.js';

test('B-430 — Space plays, pauses and resumes the authoring timeline', async ({ app }) => {
  await app.newProject('Space timeline');
  await app.setSceneDuration(200);
  const transport = app.page.getByLabel('Playback transport');
  const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
  const frame = () => ruler.evaluate((node) => Number(node.getAttribute('aria-valuenow')));
  await app.scrubToFrame(0);
  await app.page.keyboard.press('Space');
  await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(frame).toBeGreaterThan(0);

  await app.page.keyboard.press('Space');
  await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const pausedFrame = await frame();
  expect(pausedFrame).toBeGreaterThan(0);
  expect(pausedFrame).toBeLessThan(200);
  const heldFrames = await ruler.evaluate(async (node) => {
    const samples: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push(Number(node.getAttribute('aria-valuenow')));
    }
    return samples;
  });
  expect(heldFrames.every((sample) => sample === pausedFrame)).toBe(true);

  await app.page.keyboard.press('Space');
  await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(frame).toBeGreaterThan(pausedFrame);
});

test('B-430 — Space plays Rehearse and stops through the authored Outro', async ({ app }) => {
  await app.newProject('Space rehearsal');
  await app.setSceneDuration(200);
  await app.addRectangle({ x: 240, y: 130 });
  const outroStart = 150;
  await app.scrubToFrame(outroStart);
  await app.toggleInspectorKeyframe('opacity');
  await app.scrubToFrame(200);
  await app.setInspectorNumber('Opacity', 0);
  await app.addOutPoint();
  await app.setPlayoutTiming('manual');

  const transport = app.page.getByLabel('Playback transport');
  const rehearse = transport.getByRole('button', { name: 'Rehearse preview' });
  const play = transport.getByRole('button', { name: 'Play', exact: true });
  const stop = transport.getByRole('button', { name: 'Stop', exact: true });
  const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
  const body = app.canvasFrame.locator('body');
  const graphic = app.canvasFrame.locator('[data-cg-element-id]').first();
  await rehearse.click();
  await app.page.keyboard.press('Space');
  await expect(rehearse).toHaveAttribute('aria-pressed', 'true');
  await expect(play).toBeDisabled();
  await expect(stop).toBeEnabled();
  await expect(ruler).toHaveAttribute('aria-valuenow', String(outroStart));
  await expect(graphic).toBeVisible();

  await app.page.keyboard.press('Space');
  await expect(stop).toBeDisabled();
  await expect(play).toBeDisabled();
  await expect(body).not.toHaveClass(/cg-rehearse-cleared/);
  await expect
    .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
    .toBeGreaterThan(outroStart);
  await app.page.keyboard.press('Space');
  await expect(body).toHaveClass(/cg-rehearse-cleared/);
  await expect(graphic).toBeHidden();
  await expect(play).toBeEnabled();

  await app.page.keyboard.press('Space');
  await expect(graphic).toBeVisible();
  await expect(stop).toBeEnabled();
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
