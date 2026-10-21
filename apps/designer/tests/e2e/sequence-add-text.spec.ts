import { DesignerApp, test, expect } from './fixtures/designer.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.7 — **`Add text` SHOWS ITS RESULT, EVERY CLICK.** The owner pressed the
 * sequence Inspector's `Add text` on a book and saw nothing happen: the card counted pictures only,
 * its strip drew pictures only, and the canvas kept drawing page 1 — the new, empty item was at the
 * end of the list where nothing looked. Now each click selects the new item (its text box, in the
 * card, has the focus), the canvas shows it, and the card's count moves; and each click is ONE undo
 * step (two clicks inside the history's coalescing window used to be one).
 */
const png = (name: string): Buffer => Buffer.concat([DesignerApp.PNG_1X1, Buffer.from(name)]);

async function bookOfTwo(app: DesignerApp, name: string): Promise<void> {
  await app.newProject(name);
  await app.addSequence({ x: 200, y: 200 });
  const chooser = app.page.waitForEvent('filechooser');
  await app.inspector.getByRole('button', { name: 'Add pictures…', exact: true }).click();
  await (
    await chooser
  ).setFiles(['p1.png', 'p2.png'].map((n) => ({ name: n, mimeType: 'image/png', buffer: png(n) })));
  await expect(app.inspector.getByTestId('sequence-page-count')).toHaveText('2 pages');
}

test('🔴 1.7 — each Add text: the new item selected, on the canvas, counted; one undo step each', async ({
  app,
}) => {
  await bookOfTwo(app, 'BookAddText');
  const count = app.inspector.getByTestId('sequence-page-count');
  const canvasPictures = app.canvasFrame.locator('img[data-cg-asset-id]');
  const canvasText = app.canvasFrame.locator('[data-cg-sequence-item]');
  // Before: the canvas draws page 1, a picture.
  await expect(canvasPictures).toHaveCount(1);

  const addText = app.inspector.getByRole('button', { name: 'Add text', exact: true });
  await addText.click();
  // Counted: a text page is a page of the book (`RUN-NEXT-VERSION-03` 1.6).
  await expect(count).toHaveText('3 pages');
  // Selected: the card holds the new item's text box, with the focus.
  const third = app.inspector.getByRole('textbox', { name: 'Text of page 3', exact: true });
  await expect(third).toBeFocused();
  await expect(app.inspector.locator('[data-strip-current]')).toHaveAttribute(
    'data-strip-current',
    '3',
  );
  // On the canvas: the picture gives way to the new item, and what is typed is drawn.
  await expect(canvasPictures).toHaveCount(0);
  await third.fill('سرخط خبر');
  await expect(canvasText).toHaveText('سرخط خبر');

  // Again: a fourth page, selected and shown (empty), counted.
  await addText.click();
  await expect(count).toHaveText('4 pages');
  await expect(
    app.inspector.getByRole('textbox', { name: 'Text of page 4', exact: true }),
  ).toBeFocused();
  await expect(canvasText).toHaveText('');

  // Two clicks at once, then Undo once: ONE page goes, not two.
  await addText.click();
  await addText.click();
  await expect(count).toHaveText('6 pages');
  await addText.focus(); // undo is skipped while a text box has the focus
  const sequenceId = await app.page
    .locator('.cg-tl-row[data-element-id]')
    .first()
    .getAttribute('data-element-id');
  expect(sequenceId).not.toBeNull();
  await app.undo();
  await app.selectElementById(sequenceId!);
  await expect(count).toHaveText('5 pages');
  await addText.focus();
  await app.undo();
  await app.selectElementById(sequenceId!);
  await expect(count).toHaveText('4 pages');
  // Undo cleared the selection; the canvas is back on page 1.
  await expect(canvasPictures).toHaveCount(1);
});

test('1.6 — a book whose Data key is set keeps it when a text page is added', async ({ app }) => {
  await bookOfTwo(app, 'BookKeyText');
  await app.setDataKey('pages');
  await expect(app.dataKeyInput).toHaveValue('pages');
  await app.inspector.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect(app.inspector.getByTestId('sequence-page-count')).toHaveText('3 pages');
  await expect(app.dataKeyInput).toHaveValue('pages');
});
