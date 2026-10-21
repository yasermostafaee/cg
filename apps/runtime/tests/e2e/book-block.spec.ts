import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from './fixtures/runtime.js';
import { solidPng } from './fixtures/pictures.js';
import { buildTelavat2Vcg } from '../support/telavat2Vcg.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.4 — **THE INSPECTOR'S BOOK BLOCK: named, visibly bound, tidy.**
 *
 * The owner (2026-10-21): the book was headed `Sequence pages-el-1792581663991`, the buttons were not
 * aligned, and nothing said whether a chosen folder was bound or sent. Measured in Chrome (golden rule
 * 12 c): the heading is the book's NAME and no field id is on the panel; the source and sent facts
 * follow a real `Load folder…` and an Update; the strip shows the pages around the current one; and the
 * turning row's four controls share one height and one centre line, inside the Inspector, at 1280×720.
 */

test('🔴 1.4 — the book is named, its pages’ source and state are said, and its turning row is one aligned line', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  const templateId = 'tpl-e2e-book-block';
  // The owner's shape: a field `a1` whose Title is its key, on a sequence named `Sequence`.
  await app.importVcg('block.vcg', await buildTelavat2Vcg({ templateId, pages: 5 }));
  await app.selectStackRow(templateId);
  const block = app.inspector.locator('[data-book]');
  await expect(block).toHaveCount(1);

  // The heading is the book's name; its key is only in the heading's tooltip.
  await expect(app.inspector.locator('[data-field-heading="a1"]')).toHaveText('Sequence');
  await expect(app.inspector.getByText('a1', { exact: true })).toHaveCount(0);

  // Nothing loaded yet: the template's own pictures, on the row; the strip shows pages 1 and 2.
  await expect(block.locator('[data-book-source]')).toHaveText("Template's pictures");
  await expect(block.locator('[data-book-sent]')).toHaveText('On the row');
  await expect(block.getByTestId('book-counter')).toHaveText('1 / 5');
  // Test mode holds no page to read the template's own pictures from (the real-bridge spec draws
  // them): the face is the wordless placeholder, its file name only in the tooltip.
  const currentFace = block.locator('[data-book-thumb="current"] img');
  await expect(currentFace).toHaveAttribute('title', 'MRN (1).jpg');
  await expect(block.locator('[data-book-thumb="current"]')).not.toContainText('MRN');

  // A real folder named `IN`, through Load folder…: bound and staged, then sent.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-book-block-'));
  const folder = path.join(dir, 'IN');
  fs.mkdirSync(folder);
  for (const [i, rgb] of (
    [
      [200, 40, 40],
      [40, 200, 40],
      [40, 40, 200],
    ] as const
  ).entries()) {
    fs.writeFileSync(path.join(folder, `MRN (${String(i + 1)}).png`), solidPng(64, 36, rgb));
  }
  const chooser = page.waitForEvent('filechooser');
  await block.getByRole('button', { name: 'Load a folder for Sequence' }).click();
  await (await chooser).setFiles(folder);
  await expect(block.locator('[data-book-source]')).toHaveText('Folder "IN" · 3 pictures');
  await expect(block.locator('[data-book-sent]')).toHaveText('Not sent — press Update');
  await app.applyEdits();
  await expect(block.locator('[data-book-sent]')).toHaveText('On the row');
  await expect(block.getByTestId('book-counter')).toHaveText('1 / 3');
  await expect(block.locator('[data-book-thumb="current"] img')).toHaveAttribute('src', /^blob:/);

  // The turning row: Previous · [page] / 3 · Next · Go — one height, one centre line, named for the book.
  await block.getByRole('button', { name: 'Next page of Sequence' }).click();
  await expect(block.getByTestId('book-counter')).toHaveText('2 / 3');
  await expect(block.getByRole('textbox', { name: 'Page number of Sequence' })).toHaveValue('2');
  const boxes = await Promise.all(
    [
      block.getByRole('button', { name: 'Previous page of Sequence' }),
      block.getByRole('textbox', { name: 'Page number of Sequence' }),
      block.getByRole('button', { name: 'Next page of Sequence' }),
      block.getByRole('button', { name: 'Go to page in Sequence' }),
    ].map(async (l) => {
      const b = await l.boundingBox();
      if (b === null) throw new Error('a turning control has no box');
      return b;
    }),
  );
  const centre = (b: { y: number; height: number }): number => b.y + b.height / 2;
  for (const b of boxes) {
    expect(Math.abs(centre(b) - centre(boxes[0]!))).toBeLessThan(1);
    expect(Math.abs(b.height - boxes[0]!.height)).toBeLessThan(1);
  }
  // Left to right in reading order, nothing overlapping.
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 0.5);
  }
  // The block fits the Inspector at 1280×720: nothing runs past its right edge.
  const panel = await app.inspector.boundingBox();
  const blockBox = await block.boundingBox();
  expect(panel).not.toBeNull();
  expect(blockBox).not.toBeNull();
  expect(blockBox!.x + blockBox!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 0.5);
  fs.rmSync(dir, { recursive: true, force: true });
});
