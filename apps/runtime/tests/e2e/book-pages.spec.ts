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
  const chooser = app.page.waitForEvent('filechooser');
  await app.inspector.getByRole('button', { name: 'Load pictures for pages' }).click();
  await (
    await chooser
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

  await app.inspector.getByRole('button', { name: 'Next page' }).click();
  await expect(counter).toHaveText('2 / 3');
  await app.inspector.getByRole('button', { name: 'Previous page' }).click();
  await expect(counter).toHaveText('1 / 3');
  // The operator's page number, typed in Persian digits.
  await app.inspector.getByRole('textbox', { name: 'Page number' }).fill('۳');
  await app.inspector.getByRole('button', { name: 'Go to page' }).click();
  await expect(counter).toHaveText('3 / 3');
  await expect(rowCounter).toHaveText('3 / 3');
  // A book stops at its last page.
  await expect(app.inspector.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

test('a picture over the limit is refused with a sentence naming it, and nothing is staged', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-book-big';
  await app.importVcg('book-big.vcg', await buildBookVcg(templateId));
  await app.selectStackRow(templateId);
  // 5000 × 2000 pixels: over the 3840 × 2160 limit.
  const wide = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x13,
    0x88, 0, 0, 0x07, 0xd0, 8, 2, 0, 0, 0, 1, 2, 3,
  ]);
  const chooser = app.page.waitForEvent('filechooser');
  await app.inspector.getByRole('button', { name: 'Load pictures for pages' }).click();
  await (await chooser).setFiles({ name: 'panorama.png', mimeType: 'image/png', buffer: wide });
  await expect(app.inspector.getByText(/panorama\.png is 5000 × 2000 pixels/)).toBeVisible();
  await expect(app.inspector.getByTestId('page-count-pages')).toHaveText('0 pages');
});
