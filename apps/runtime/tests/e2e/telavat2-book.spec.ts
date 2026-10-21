import { expect, test } from './fixtures/runtime.js';
import { buildTelavat2Vcg, TELAVAT2_ID, TELAVAT2_SEQUENCE } from '../support/telavat2Vcg.js';

/**
 * 🔴 `B-353` — **THE OWNER'S BOOK, IMPORTED AS IT IS, IS A BOOK.** `telavat2.vcg` (2026-10-15): 87
 * pictures behind a Data key `a1` that had lost its `pages` mark, and `advance: 'auto'`. CG Control
 * showed `FIELDS · a1` with six empty text boxes — no book bar, no Load folder…. The package below is
 * that file's exact shape with small pictures, imported through the real Import a .vcg path and
 * never re-exported.
 */

test('🔴 telavat2’s shape imports as a book: the bar, 1 / 87, Next, Previous, Go, Load folder…', async ({
  app,
}) => {
  await app.importVcg('telavat2.vcg', await buildTelavat2Vcg());
  await app.selectStackRow(TELAVAT2_ID);

  // No text boxes for pictures: the book's own editor, with its folder door.
  await expect(app.inspector.getByRole('textbox', { name: /^a1 item \d+$/ })).toHaveCount(0);
  await expect(app.inspector.getByRole('button', { name: 'Load a folder for a1' })).toBeVisible();
  await expect(app.inspector.getByRole('button', { name: 'Load a folder for a1' })).toHaveText(
    /Load folder…/,
  );

  const counter = app.inspector.getByTestId('book-counter');
  await expect(counter).toHaveText('1 / 87');
  await app.inspector.getByRole('button', { name: 'Next page' }).click();
  await expect(counter).toHaveText('2 / 87');
  await app.inspector.getByRole('button', { name: 'Previous page' }).click();
  await expect(counter).toHaveText('1 / 87');
  await app.inspector.getByRole('textbox', { name: 'Page number' }).fill('۸۷');
  await app.inspector.getByRole('button', { name: 'Go to page' }).click();
  await expect(counter).toHaveText('87 / 87');
  await expect(app.inspector.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

test('BOOK-EXPORT Q2 — the same book with no Data key is a book too', async ({ app }) => {
  const templateId = 'tpl-e2e-telavat2-keyless';
  await app.importVcg(
    'keyless.vcg',
    await buildTelavat2Vcg({ templateId, pages: 4, keyed: false }),
  );
  await app.selectStackRow(templateId);
  await expect(app.inspector.getByTestId('book-counter')).toHaveText('1 / 4');
  await expect(
    app.inspector.getByRole('button', { name: `Load a folder for pages-${TELAVAT2_SEQUENCE}` }),
  ).toBeVisible();
});
