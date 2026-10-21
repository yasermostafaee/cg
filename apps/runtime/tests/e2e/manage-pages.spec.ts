import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';
import { solidPng } from './fixtures/pictures.js';
import { buildTelavat2Vcg } from '../support/telavat2Vcg.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.5 — **`Manage pages…`, THE OPERATOR'S TOOL FOR A BOOK.** The owner's check, in
 * his order: reorder, remove, sort by name, add a text page, Replace with folder (the text page keeps its
 * place), Discard — then again, with Update. Its edits STAGE: nothing reaches the row before Update. And
 * the dialog fits at 1280×720 and at 200 % (a 640×360 viewport), in RTL, its footer inside it.
 */

const dialog = (page: Page): Locator => page.getByRole('dialog', { name: /Manage pages/ });

async function tileNames(page: Page): Promise<string[]> {
  return dialog(page)
    .locator('[data-page-tile] .cg-page-tile__name')
    .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
}

function folderOf(pictures: readonly string[]): { dir: string; folder: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-manage-'));
  const folder = path.join(dir, 'NEW');
  fs.mkdirSync(folder);
  pictures.forEach((name, i) =>
    fs.writeFileSync(path.join(folder, name), solidPng(64, 36, [60 * (i + 1), 90, 120])),
  );
  return { dir, folder };
}

async function boxInside(inner: Locator, outer: Locator): Promise<boolean> {
  const a = await inner.boundingBox();
  const b = await outer.boundingBox();
  if (a === null || b === null) return false;
  return (
    a.x >= b.x - 0.5 &&
    a.y >= b.y - 0.5 &&
    a.x + a.width <= b.x + b.width + 0.5 &&
    a.y + a.height <= b.y + b.height + 0.5
  );
}

test('🔴 1.5 — reorder, remove, sort by name, a text page, Replace with folder; Discard, then Update', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  const templateId = 'tpl-e2e-manage';
  await app.importVcg('manage.vcg', await buildTelavat2Vcg({ templateId, pages: 3 }));
  await app.selectStackRow(templateId);
  const block = app.inspector.locator('[data-book]');
  const manage = block.getByRole('button', { name: 'Manage pages of Sequence' });

  await manage.click();
  await expect(dialog(page)).toBeVisible();
  expect(await tileNames(page)).toEqual(['MRN (1).jpg', 'MRN (2).jpg', 'MRN (3).jpg']);

  // Reorder (the keyboard path), remove, sort by name.
  await dialog(page).getByRole('button', { name: 'Move page 3 earlier' }).click();
  expect(await tileNames(page)).toEqual(['MRN (1).jpg', 'MRN (3).jpg', 'MRN (2).jpg']);
  await dialog(page).getByRole('button', { name: 'Remove page 1' }).click();
  expect(await tileNames(page)).toEqual(['MRN (3).jpg', 'MRN (2).jpg']);
  await dialog(page).getByRole('button', { name: 'Sort by name' }).click();
  expect(await tileNames(page)).toEqual(['MRN (2).jpg', 'MRN (3).jpg']);

  // A text page, written in place, after the first picture.
  await dialog(page).getByRole('button', { name: 'Add text page' }).click();
  await dialog(page).getByRole('textbox', { name: 'Text of page 3' }).fill('یادداشت سردبیر');
  await dialog(page).getByRole('button', { name: 'Done editing' }).click();
  await dialog(page).getByRole('button', { name: 'Move page 3 earlier' }).click();
  expect(await tileNames(page)).toEqual(['MRN (2).jpg', 'یادداشت سردبیر', 'MRN (3).jpg']);

  // Replace with folder: the pictures go, the text page keeps its place after the first.
  const { dir, folder } = folderOf(['b (10).png', 'b (2).png', 'b (1).png']);
  const chooser = page.waitForEvent('filechooser');
  await dialog(page).getByRole('button', { name: 'Replace with folder…' }).click();
  await (await chooser).setFiles(folder);
  await expect
    .poll(() => tileNames(page))
    .toEqual(['b (1).png', 'یادداشت سردبیر', 'b (2).png', 'b (10).png']);

  // Done STAGES: the block says so; nothing is on the row yet. Discard puts the row's book back.
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(block.locator('[data-book-sent]')).toHaveText('Not sent — press Update');
  await expect(block.getByTestId('page-count-a1')).toHaveText('4 pages');
  await app.inspector.getByRole('button', { name: 'Discard staged edits' }).click();
  await expect(block.locator('[data-book-sent]')).toHaveText('On the row');
  await expect(block.getByTestId('page-count-a1')).toHaveText('3 pages');

  // Again, and this time Update: the row holds it.
  await manage.click();
  await dialog(page).getByRole('button', { name: 'Add text page' }).click();
  await dialog(page).getByRole('textbox', { name: 'Text of page 4' }).fill('پایان');
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await app.applyEdits();
  await expect(block.locator('[data-book-sent]')).toHaveText('On the row');
  await expect(block.getByTestId('book-counter')).toHaveText('1 / 4');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('1.5 — the dialog fits at 1280×720 and at 200 %, in RTL, its footer inside it', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  const templateId = 'tpl-e2e-manage-fit';
  await app.importVcg('manage-fit.vcg', await buildTelavat2Vcg({ templateId, pages: 12 }));
  await app.selectStackRow(templateId);
  await app.inspector.getByRole('button', { name: 'Manage pages of Sequence' }).click();
  const box = dialog(page);
  await expect(box).toBeVisible();
  const done = box.getByRole('button', { name: 'Done', exact: true });
  const cancel = box.getByRole('button', { name: 'Cancel', exact: true });

  const nameHeightAtRest =
    (await box.locator('[data-page-tile] .cg-page-tile__name').first().boundingBox())?.height ?? 0;
  /*
    "200 % text" is the root font size doubled (the browser's or the OS's text size), with RTL on top.
    Browser ZOOM at 200 % is the next test: it keeps this layout only on a screen big enough to show the
    Inspector at all (a 1280×720 window zoomed 200 % is a 640×360 page, below the console's 1100×700
    floor, where the Inspector — and this dialog's book — is folded away).
  */
  for (const [label, size, dir] of [
    ['1280×720', '', 'ltr'],
    ['200 % text', '200%', 'ltr'],
    ['200 % text in RTL', '200%', 'rtl'],
    ['1280×720 in RTL', '', 'rtl'],
  ] as const) {
    await page.evaluate(
      ([s, d]) => {
        document.documentElement.style.fontSize = s;
        document.documentElement.dir = d;
      },
      [size, dir] as const,
    );
    await expect.poll(() => boxInside(done, box), `${label}: Done inside the dialog`).toBe(true);
    await expect
      .poll(() => boxInside(cancel, box), `${label}: Cancel inside the dialog`)
      .toBe(true);
    const window = page.locator('html');
    await expect
      .poll(() => boxInside(box, window), `${label}: the dialog inside the window`)
      .toBe(true);
    if (size === '200%') {
      // The positive control: the text really grew — a tile's name line is taller.
      const tall =
        (await box.locator('[data-page-tile] .cg-page-tile__name').first().boundingBox())?.height ??
        0;
      expect(tall, `${label}: the text did not grow`).toBeGreaterThan(nameHeightAtRest * 1.5);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
    document.documentElement.dir = 'ltr';
  });
});

test.describe('1.5 — at 200 % browser zoom on a large screen', () => {
  // A 2560×1440 screen at 200 %: the page is 1280×720 CSS pixels drawn at two device pixels each.
  test.use({ deviceScaleFactor: 2 });
  test('the dialog fits, its footer inside it', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1280, height: 720 });
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    const templateId = 'tpl-e2e-manage-zoom';
    await app.importVcg('manage-zoom.vcg', await buildTelavat2Vcg({ templateId, pages: 12 }));
    await app.selectStackRow(templateId);
    await app.inspector.getByRole('button', { name: 'Manage pages of Sequence' }).click();
    const box = dialog(page);
    await expect(box).toBeVisible();
    for (const name of ['Done', 'Cancel']) {
      await expect
        .poll(() => boxInside(box.getByRole('button', { name, exact: true }), box))
        .toBe(true);
    }
    await expect.poll(() => boxInside(box, page.locator('html'))).toBe(true);
  });
});

test('🔴 1.5 — the page on air is marked, its removal says what takes its place, and a drag reorders', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  const templateId = 'tpl-e2e-manage-air';
  const layer = await app.importVcg(
    'manage-air.vcg',
    await buildTelavat2Vcg({ templateId, pages: 4 }),
  );
  await app.layerRow(layer).getByRole('button', { name: 'PLAY' }).click();
  await app.selectStackRow(templateId);
  await app.inspector.getByRole('button', { name: 'Next page of Sequence' }).click();
  await expect(app.inspector.getByTestId('book-counter')).toHaveText('2 / 4');
  await app.inspector.getByRole('button', { name: 'Manage pages of Sequence' }).click();
  const box = dialog(page);

  // Page 2 is the one on air.
  await expect(box.locator('[data-page-tile="2"] [data-page-mark="air"]')).toHaveText('On air');
  await expect(box.locator('[data-page-mark="air"]')).toHaveCount(1);

  // A drag: page 4 dropped on page 1's place.
  await box.locator('[data-page-tile="4"]').dragTo(box.locator('[data-page-tile="1"]'));
  expect(await tileNames(page)).toEqual([
    'MRN (4).jpg',
    'MRN (1).jpg',
    'MRN (2).jpg',
    'MRN (3).jpg',
  ]);
  // Moved, the page on air simply stays: nothing is said.
  await expect(box.locator('[data-page-tile="3"] [data-page-mark="air"]')).toHaveCount(1);

  // Removed: the dialog says which page takes its place at Update — and nothing has reached the row.
  await box.getByRole('button', { name: 'Remove page 3' }).click();
  await expect(
    box.getByText('Page 2 is on air and is removed; at Update, page 2 takes its place.'),
  ).toBeVisible();
  await box.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(app.inspector.locator('[data-book-sent]')).toHaveText('Not sent — press Update');
  await expect(app.inspector.getByTestId('book-counter')).toHaveText('2 / 4');
  await app.applyEdits();
  // The bridge's rule, read back: the page that followed it (old page 3) now stands at page 2 of 3.
  await expect(app.inspector.getByTestId('book-counter')).toHaveText('2 / 3');
});
