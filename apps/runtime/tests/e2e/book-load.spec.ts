import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';
import { solidPng } from './fixtures/pictures.js';
import { buildTelavat2Vcg } from '../support/telavat2Vcg.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` delta A — **ONE LOAD BUTTON, AND A DROP** (the owner's choice, 2026-10-22).
 *
 * `Load pictures…` and `Load folder…` were two buttons. There is one, `Load pages… ▾`, whose menu holds
 * `Pictures…` and `Folder…` (a browser's picker takes files OR a folder, never both); beside it,
 * `Manage pages…`, on one line. Files or a folder DROPPED on the book block replace its pictures, and
 * dropped on `Manage pages…` they are added — through the same fitting and the same text-page rule.
 *
 * The drop is Chrome's own (`Input.dispatchDragEvent` with real paths on disk), so a dropped folder
 * reaches the page as a real directory entry, exactly as one dragged out of Explorer does.
 */

function folderOf(name: string, pictures: readonly string[]): { dir: string; folder: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-book-load-'));
  const folder = path.join(dir, name);
  fs.mkdirSync(folder);
  pictures.forEach((file, i) =>
    fs.writeFileSync(path.join(folder, file), solidPng(64, 36, [60 * (i + 1), 90, 120])),
  );
  return { dir, folder };
}

/** Drop paths on disk onto `target`, as a drag out of the file manager does. */
async function dropPaths(page: Page, target: Locator, files: readonly string[]): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box === null) throw new Error('drop target has no box');
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 40);
  const cdp = await page.context().newCDPSession(page);
  const data = { items: [], files: [...files], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
    await cdp.send('Input.dispatchDragEvent', { type, x, y, data });
  }
  await cdp.detach();
}

const sources = (block: Locator): Locator => block.locator('[data-book-source]');

test('🔴 delta A — one Load pages… button: its menu holds Pictures… and Folder…, beside Manage pages…, on one line', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  const templateId = 'tpl-e2e-load-menu';
  await app.importVcg('load-menu.vcg', await buildTelavat2Vcg({ templateId, pages: 3 }));
  await app.selectStackRow(templateId);
  const block = app.inspector.locator('[data-book]');
  const row = block.locator('[data-book-load]');

  // The row: exactly two controls, one height, one top.
  const buttons = row.getByRole('button');
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveText(/^Load pages…/);
  await expect(buttons.nth(1)).toHaveText(/^Manage pages…/);
  const a = await buttons.nth(0).boundingBox();
  const b = await buttons.nth(1).boundingBox();
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 1))).toBeLessThan(1);
  expect(Math.abs((a?.height ?? 0) - (b?.height ?? 1))).toBeLessThan(1);

  // The menu: Pictures… and Folder…, each saying it replaces the book's pictures.
  const load = block.getByRole('button', { name: 'Load pages for Sequence' });
  await expect(load).toHaveAttribute('aria-haspopup', 'menu');
  await load.scrollIntoViewIfNeeded();
  await load.click();
  const menu = page.getByRole('menu', { name: 'Load pages for Sequence' });
  await expect(menu.getByRole('menuitem')).toHaveText(['Pictures…', 'Folder…']);
  for (const item of await menu.getByRole('menuitem').all()) {
    await expect(item).toHaveAttribute('title', /^Replaces the book's pictures/);
  }
  // Folder… opens a folder picker (the browser's `webkitdirectory` chooser).
  const chooser = page.waitForEvent('filechooser');
  await menu.getByRole('menuitem', { name: 'Folder…' }).click();
  const picker = await chooser;
  expect(await picker.element().evaluate((i) => (i as HTMLInputElement).webkitdirectory)).toBe(
    true,
  );
  await expect(menu).toHaveCount(0);
});

test('🔴 delta A — a folder, then files, dropped on the book block replace its pictures', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  const templateId = 'tpl-e2e-load-drop';
  await app.importVcg('load-drop.vcg', await buildTelavat2Vcg({ templateId, pages: 4 }));
  await app.selectStackRow(templateId);
  const block = app.inspector.locator('[data-book]');
  await expect(sources(block)).toHaveText("Template's pictures");

  // A folder `IN` of three pictures: the book is that folder, in natural order, staged.
  const { dir, folder } = folderOf('IN', ['p (10).png', 'p (2).png', 'p (1).png']);
  await dropPaths(page, block, [folder]);
  await expect(sources(block)).toHaveText('Folder "IN" · 3 pictures');
  await expect(block.getByTestId('page-count-a1')).toHaveText('3 pages');
  await expect(block.locator('[data-book-sent]')).toHaveText('Not sent — press Update');

  // Two loose files: they replace the pictures again.
  await dropPaths(page, block, [path.join(folder, 'p (1).png'), path.join(folder, 'p (2).png')]);
  await expect(sources(block)).toHaveText('Picked pictures · 2');
  await expect(block.getByTestId('page-count-a1')).toHaveText('2 pages');
  await app.applyEdits();
  await expect(block.getByTestId('book-counter')).toHaveText('1 / 2');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('🔴 delta A — files and a folder dropped on Manage pages… are added at the end', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  const templateId = 'tpl-e2e-load-manage';
  await app.importVcg('load-manage.vcg', await buildTelavat2Vcg({ templateId, pages: 2 }));
  await app.selectStackRow(templateId);
  await app.inspector.getByRole('button', { name: 'Manage pages of Sequence' }).click();
  const dialog = page.getByRole('dialog', { name: /Manage pages/ });
  const names = (): Promise<string[]> =>
    dialog.locator('[data-page-tile] .cg-page-tile__name').allTextContents();
  await expect.poll(names).toEqual(['MRN (1).jpg', 'MRN (2).jpg']);

  const { dir, folder } = folderOf('NEW', ['b.png', 'a.png']);
  await dropPaths(page, dialog.locator('[data-manage-pages]'), [folder]);
  await expect.poll(names).toEqual(['MRN (1).jpg', 'MRN (2).jpg', 'a.png', 'b.png']);
  await dropPaths(page, dialog.locator('[data-manage-pages]'), [path.join(folder, 'a.png')]);
  await expect.poll(names).toEqual(['MRN (1).jpg', 'MRN (2).jpg', 'a.png', 'b.png', 'a.png']);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('delta A — the book block at 1280×720 and 200 % text, in RTL: no empty box, its rows inside the Inspector', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  const templateId = 'tpl-e2e-load-fit';
  await app.importVcg('load-fit.vcg', await buildTelavat2Vcg({ templateId, pages: 4 }));
  await app.selectStackRow(templateId);
  const block = app.inspector.locator('[data-book]');
  const caption = block.locator('[data-book-thumb][data-current] figcaption');
  const captionAtRest = (await caption.boundingBox())?.height ?? 0;

  for (const [label, size, dir] of [
    ['1280×720', '', 'ltr'],
    ['1280×720 in RTL', '', 'rtl'],
    ['200 % text', '200%', 'ltr'],
    ['200 % text in RTL', '200%', 'rtl'],
  ] as const) {
    await page.evaluate(
      ([s, d]) => {
        document.documentElement.style.fontSize = s;
        document.documentElement.dir = d;
      },
      [size, dir] as const,
    );
    // Page 1 of 4: three faces, every one a page.
    const thumbs = block.locator('[data-book-thumb]');
    await expect(thumbs, label).toHaveCount(3);
    for (const thumb of await thumbs.all()) {
      await expect(thumb.locator('img, .cg-book-thumb__text'), label).toHaveCount(1);
    }
    // The block, its strip and its load row inside the Inspector, side to side.
    const panel = await app.inspector.boundingBox();
    for (const part of ['.cg-book__strip', '[data-book-load]']) {
      const box = await block.locator(part).boundingBox();
      expect(box, `${label}: ${part}`).not.toBeNull();
      expect(box?.x ?? 0, `${label}: ${part} left`).toBeGreaterThanOrEqual((panel?.x ?? 0) - 0.5);
      expect((box?.x ?? 0) + (box?.width ?? 0), `${label}: ${part} right`).toBeLessThanOrEqual(
        (panel?.x ?? 0) + (panel?.width ?? 0) + 0.5,
      );
    }
    for (const button of await block.locator('[data-book-load]').getByRole('button').all()) {
      const box = await button.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0), `${label}: a load button`).toBeLessThanOrEqual(
        (panel?.x ?? 0) + (panel?.width ?? 0) + 0.5,
      );
    }
    if (size === '200%') {
      // The positive control: the text really grew.
      expect((await caption.boundingBox())?.height ?? 0, label).toBeGreaterThan(
        captionAtRest * 1.5,
      );
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
    document.documentElement.dir = 'ltr';
  });
});
