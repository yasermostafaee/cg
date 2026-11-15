import type { Locator } from '@playwright/test';
import { test, expect } from './fixtures/designer.js';

function textPlacement(box: Locator): Promise<{ boxY: number; glyphY: number }> {
  return box.evaluate((node) => {
    const glyphs = node.querySelector('[data-cg-text]') ?? node;
    const ink = document.createRange();
    ink.selectNodeContents(glyphs);
    return {
      boxY: node.getBoundingClientRect().top,
      glyphY: ink.getBoundingClientRect().top,
    };
  });
}

test('moves text within its fixed box and keeps the offset when sizing changes', async ({
  app,
}) => {
  await app.newProject('Text vertical offset');
  await app.addTextElement({ x: 300, y: 200 });
  const offset = app.inspector.getByLabel('Text vertical offset', { exact: true });
  const id = (await app.timelineRowIds())[0]!;
  const box = app.canvasFrame.locator(`[data-cg-element-id="${id}"]`);
  const before = await textPlacement(box);

  await offset.scrollIntoViewIfNeeded();
  await app.scrubField(offset, 20, async () => {
    await expect(offset).toHaveValue('20');
    await expect.poll(async () => (await textPlacement(box)).glyphY).toBeGreaterThan(before.glyphY);
  });
  await app.undo();
  await app.selectElementById(id);
  await expect(offset).toHaveValue('0');
  await offset.fill('-12');
  await offset.press('Enter');
  await expect
    .poll(async () => (await textPlacement(box)).glyphY - before.glyphY)
    .toBeCloseTo(-12, 0);
  expect((await textPlacement(box)).boxY).toBeCloseTo(before.boxY, 0);

  await app.selectTool('Select');
  await app.canvas.dblclick({ position: { x: 330, y: 215 } });
  const editor = app.page.locator('[contenteditable="true"]');
  await expect(editor).toBeFocused();
  const editOffset = await editor.evaluate(
    (node) => node.getBoundingClientRect().top - node.parentElement!.getBoundingClientRect().top,
  );
  expect(editOffset).toBeLessThan(0);
  await editor.fill('A considerably longer studio title');
  await editor.press('Enter');

  const toggle = (row: string, option: string) =>
    app.inspector.locator(
      `xpath=.//span[normalize-space(text())="${row}"]/following-sibling::div//button[normalize-space(text())="${option}"]`,
    );
  await toggle('Text Wrap', 'No').click();
  await toggle('Shrink to Fit', 'Yes').click();
  await offset.fill('0');
  await offset.press('Enter');
  const fontSize = () => box.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  await expect.poll(fontSize).toBeLessThan(48);
  const fittedSize = await fontSize();
  const fittedPlacement = await textPlacement(box);
  await offset.fill('36');
  await offset.press('Enter');
  await expect
    .poll(async () => (await textPlacement(box)).glyphY - fittedPlacement.glyphY)
    .toBeCloseTo(36, 0);
  expect(await fontSize()).toBe(fittedSize);

  await app.inspector.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect(offset).toBeDisabled();
  await app.inspector.getByRole('button', { name: 'Fixed', exact: true }).click();
  await expect(offset).toBeEnabled();
  await expect(offset).toHaveValue('36');
});

test('shows the same signed control for Ticker, Clock and Sequence text', async ({ app }) => {
  await app.newProject('Text offset controls');
  const offset = app.inspector.getByLabel('Text vertical offset', { exact: true });

  await app.addTicker();
  await expect(offset).toBeEnabled();
  await offset.fill('-5');
  await offset.press('Enter');
  await expect(offset).toHaveValue('-5');

  await app.addClock();
  await expect(offset).toBeEnabled();
  await expect(offset).toHaveValue('0');

  await app.addSequence();
  await expect(offset).toBeEnabled();
  await expect(offset).toHaveValue('0');
});
