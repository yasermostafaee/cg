import { buildBookVcg, expect, test } from './fixtures/runtime.js';

/**
 * `R-100` — the OPERATOR loads a book of pictures on a row and turns its pages, in test mode (the
 * console's runtime turns pages with the bridge's arithmetic and checks pictures with its probe).
 *
 * Each "picture" is a real PNG header — what the bridge reads — with its own tail, so every file has
 * its own SHA-256.
 */
function png(seed: number): Buffer {
  return Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    0,
    0,
    0x07,
    0x80,
    0,
    0,
    0x04,
    0x38,
    8,
    2,
    0,
    0,
    0,
    seed & 0xff,
    0x55,
    0xaa,
  ]);
}

test('🔴 a folder’s pictures load in natural order; Next, Previous and Go to move the counter', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-book';
  await app.importVcg('book.vcg', await buildBookVcg(templateId));
  await app.selectStackRow(templateId);

  // Load three pictures picked out of order: they stage, then apply like any field.
  await (
    await app.chooseBookPages('Pictures…', 'pages')
  ).setFiles(
    ['page10.png', 'page2.png', 'page1.png'].map((name, i) => ({
      name,
      mimeType: 'image/png',
      buffer: png(i),
    })),
  );
  await expect(app.inspector.getByTestId('page-count-pages')).toHaveText('3 pages');
  await app.applyEdits();

  // The book bar and the row agree: page 1 of 3.
  const counter = app.inspector.getByTestId('book-counter');
  await expect(counter).toHaveText('1 / 3');
  const rowCounter = app.stackRow(templateId).first().locator('[data-page-counter]');
  await expect(rowCounter).toHaveText('1 / 3');

  // Measured in the engine (golden rule 12 c): the book row keeps the table's shape — its verbs
  // on one line under their headers (PREV is in the row's menu, not a seventh button) — and the
  // book bar's page box sits on the line beside Go.
  const bookRowBox = await app.stackRow(templateId).first().boundingBox();
  const emptyRowBox = await app.layers
    .locator('[data-layer]:not([data-item-id])')
    .first()
    .boundingBox();
  expect(bookRowBox).not.toBeNull();
  expect(emptyRowBox).not.toBeNull();
  expect(bookRowBox!.height).toBeLessThanOrEqual(emptyRowBox!.height + 1);
  const pageBox = await app.inspector.getByRole('textbox', { name: 'Page number' }).boundingBox();
  const goBox = await app.inspector.getByRole('button', { name: 'Go to page' }).boundingBox();
  expect(pageBox).not.toBeNull();
  expect(goBox).not.toBeNull();
  expect(Math.abs(pageBox!.y + pageBox!.height / 2 - (goBox!.y + goBox!.height / 2))).toBeLessThan(
    2,
  );

  await app.inspector.getByRole('button', { name: 'Next page' }).click();
  await expect(counter).toHaveText('2 / 3');
  await app.inspector.getByRole('button', { name: 'Previous page' }).click();
  await expect(counter).toHaveText('1 / 3');
  // The operator's page number, typed in Persian digits.
  await app.inspector.getByRole('textbox', { name: 'Page number' }).fill('۳');
  await app.inspector.getByRole('button', { name: 'Go to page' }).click();
  await expect(counter).toHaveText('3 / 3');
  await expect(rowCounter).toHaveText('3 / 3');
  // Off air there is nothing to transition out, so the terminal turn stays unavailable.
  const next = app.inspector.getByRole('button', { name: 'Next page' });
  await expect(next).toBeDisabled();

  // On air, the same last-page Next is an exit verb: the real template plays the page's
  // configured transition and reports completion. Test mode has no page to animate, so its
  // faithful stand-in reports immediately; the row stops and PLAY becomes available again.
  const row = app.stackRow(templateId).first();
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row.getByLabel('status SIM ON AIR')).toBeVisible();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(row.getByLabel('status READY')).toBeVisible();
  await expect(row.getByRole('button', { name: 'PLAY' })).toBeEnabled();
  await expect(next).toBeDisabled();
});

/*
  `RUN-NEXT-VERSION-03` 1.2 SUPERSEDED this test's old subject — "a picture over the limit is refused".
  The owner's decision is FIT, NOT REFUSE (`book-fit.spec.ts` proves a real 6000 × 4000 picture loads,
  fitted). What is still refused, by name, is a file that cannot be read as a picture: this one has a
  PNG header saying 5000 × 2000 and nothing a decoder can draw, so it cannot be fitted either.
*/
test('a file that cannot be read as a picture is refused with a sentence naming it, and nothing is staged', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-book-big';
  await app.importVcg('book-big.vcg', await buildBookVcg(templateId));
  await app.selectStackRow(templateId);
  const wide = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x13,
    0x88, 0, 0, 0x07, 0xd0, 8, 2, 0, 0, 0, 1, 2, 3,
  ]);
  await (
    await app.chooseBookPages('Pictures…')
  ).setFiles({ name: 'panorama.png', mimeType: 'image/png', buffer: wide });
  await expect(
    app.inspector.getByText(/panorama\.png is not a PNG, JPEG or WebP picture/),
  ).toBeVisible();
  await expect(app.inspector.getByTestId('page-count-pages')).toHaveText('0 pages');
});
