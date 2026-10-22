import { expect, test } from './fixtures/runtime.js';
import { buildTelavat2Vcg, TELAVAT2_ID, TELAVAT2_SEQUENCE } from '../support/telavat2Vcg.js';
import { solidPng } from './fixtures/pictures.js';

/**
 * 🔴 `B-353` — **THE OWNER'S BOOK, IMPORTED AS IT IS, IS A BOOK.** `telavat2.vcg` (2026-10-15): 87
 * pictures behind a Data key `a1` that had lost its `pages` mark, and `advance: 'auto'`. CG Control
 * showed `FIELDS · a1` with six empty text boxes — no book bar, no Load folder…. The package below is
 * that file's exact shape with small pictures, imported through the real Import a .vcg path and
 * never re-exported.
 */

test('🔴 telavat2’s shape imports as a book: the bar, 1 / 87, Next, Previous, Go, Load pages…', async ({
  app,
}) => {
  await app.importVcg('telavat2.vcg', await buildTelavat2Vcg());
  await app.selectStackRow(TELAVAT2_ID);

  // No text boxes for pictures: the book's own editor, with its folder door.
  await expect(app.inspector.getByRole('textbox', { name: /^a1 item \d+$/ })).toHaveCount(0);
  // `RUN-NEXT-VERSION-03` 1.4 — the book is named by its sequence (`Sequence`), never its key `a1`.
  await expect(
    app.inspector.getByRole('button', { name: 'Load pages for Sequence' }),
  ).toBeVisible();
  await expect(app.inspector.getByRole('button', { name: 'Load pages for Sequence' })).toHaveText(
    /Load pages…/,
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
  // `RUN-NEXT-VERSION-03` 1.4 — its field is `pages-${TELAVAT2_SEQUENCE}`; the operator reads its name.
  await expect(
    app.inspector.getByRole('button', { name: 'Load pages for Sequence' }),
  ).toBeVisible();
  await expect(app.inspector.getByText(`pages-${TELAVAT2_SEQUENCE}`)).toHaveCount(0);
});

/*
  🔴 `RUN-NEXT-VERSION-03` 1.6 — A BOOK WITH A TEXT PAGE IS STILL A BOOK (the owner's decision). It used to
  lose its binding in the Designer, and CG Control its Load folder… and page tools. And a load replaces
  the PICTURE pages only: the text page keeps its place after the picture it followed.
*/
test('🔴 1.6 — a book with a text page is a book, and a load keeps the text page in place', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-telavat2-text-page';
  await app.importVcg(
    'text-page.vcg',
    // Picture 1, the text page, pictures 2 and 3.
    await buildTelavat2Vcg({ templateId, pages: 3, textPageAfter: 1 }),
  );
  await app.selectStackRow(templateId);
  await expect(app.inspector.getByTestId('book-counter')).toHaveText('1 / 4');
  await expect(app.inspector.getByRole('button', { name: /^Load pages for / })).toBeVisible();

  // Two new pictures for three: picture 1, the text page after it, picture 2 — three pages.
  await (
    await app.chooseBookPages('Pictures…')
  ).setFiles(
    ['new1.png', 'new2.png'].map((name, i) => ({
      name,
      mimeType: 'image/png',
      buffer: solidPng(64, 36, [40 * (i + 1), 90, 160]),
    })),
  );
  await expect(app.inspector.getByTestId('page-count-a1')).toHaveText('3 pages');
  await app.applyEdits();
  const pages = await app.page.evaluate(async () => {
    const w = window as unknown as {
      cg: { stack: { snapshot: () => Promise<{ fields: Record<string, unknown> }[]> } };
    };
    const item = (await w.cg.stack.snapshot()).find((i) => Array.isArray(i.fields['a1']));
    return ((item?.fields['a1'] ?? []) as { kind?: string; name?: string; text?: string }[]).map(
      (p) => (p.kind === 'image' ? `picture ${p.name ?? ''}` : `text ${p.text ?? ''}`),
    );
  });
  expect(pages).toEqual(['picture new1.png', 'text یادداشت سردبیر', 'picture new2.png']);
  await expect(app.inspector.getByTestId('book-counter')).toHaveText('1 / 3');
  await app.inspector.getByRole('button', { name: /^Next page/ }).click();
  await expect(app.inspector.getByTestId('book-counter')).toHaveText('2 / 3');
});
