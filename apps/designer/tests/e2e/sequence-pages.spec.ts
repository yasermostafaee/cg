import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DesignerApp, test, expect } from './fixtures/designer.js';

/**
 * `D-163` — a book's pages added many at a time. The pick is the real file chooser the Designer
 * opens; each "picture" is the 1×1 PNG with its own name appended, so every file has its own
 * SHA-256 and none collapses under the asset store's dedupe.
 */
const png = (name: string): Buffer => Buffer.concat([DesignerApp.PNG_1X1, Buffer.from(name)]);

test.describe('D-163 — Add pictures / Add folder on a sequence', () => {
  test('🔴 twelve files picked out of order become twelve pages in natural order, as a book', async ({
    app,
  }) => {
    await app.newProject('Book');
    await app.addSequence({ x: 200, y: 200 });

    const shuffled = [12, 3, 1, 10, 2, 11, 4, 9, 5, 8, 6, 7].map((n) => `page${String(n)}.png`);
    const chooser = app.page.waitForEvent('filechooser');
    await app.inspector.getByRole('button', { name: 'Add pictures…', exact: true }).click();
    await (
      await chooser
    ).setFiles(shuffled.map((name) => ({ name, mimeType: 'image/png', buffer: png(name) })));

    await expect(app.inspector.getByTestId('sequence-page-count')).toHaveText('12 pages');
    // The Inspector stays a CARD — no row per page (the owner's report: 88 rows filled it).
    await expect(app.inspector.getByRole('button', { name: /^Remove .* item \d+$/ })).toHaveCount(
      0,
    );
    // The sequence is a book: Cut, manual, one pass.
    await expect(app.inspector.getByLabel('advance', { exact: true })).toHaveValue('manual');
    await expect(app.inspector.getByLabel('in', { exact: true })).toHaveValue('none');
    await expect(app.inspector.getByLabel('out', { exact: true })).toHaveValue('none');

    // Every page is in the Pages manager — the untouched samples gone, and `page2` before
    // `page10`: the order is the NUMBER in the name, not the characters.
    await app.inspector.getByRole('button', { name: 'Manage pages…', exact: true }).click();
    const manager = app.page.getByRole('dialog', { name: /^Pages — / });
    await expect(manager.getByTestId('pages-manager-count')).toHaveText('12 pages');
    await expect(manager.locator('[data-page-name]')).toHaveText(
      Array.from({ length: 12 }, (_, i) => `page${String(i + 1)}.png`),
    );
  });

  test('🔴 the Pages manager: drag a page, step one, remove a selection, sort by name', async ({
    app,
  }) => {
    await app.newProject('BookManager');
    await app.addSequence({ x: 200, y: 200 });
    const chooser = app.page.waitForEvent('filechooser');
    await app.inspector.getByRole('button', { name: 'Add pictures…', exact: true }).click();
    await (
      await chooser
    ).setFiles(
      [1, 2, 3, 4, 5].map((n) => ({
        name: `p${String(n)}.png`,
        mimeType: 'image/png',
        buffer: png(`p${String(n)}`),
      })),
    );
    await app.inspector.getByRole('button', { name: 'Manage pages…', exact: true }).click();
    const manager = app.page.getByRole('dialog', { name: /^Pages — / });
    const names = manager.locator('[data-page-name]');
    const cards = manager.locator('[data-page-card]');
    await expect(names).toHaveText(['p1.png', 'p2.png', 'p3.png', 'p4.png', 'p5.png']);

    // Drag page 4 onto the leading half of page 1: it becomes page 1.
    await cards
      .nth(3)
      .locator('[data-page-name]')
      .dragTo(cards.nth(0), { targetPosition: { x: 6, y: 30 } });
    await expect(names).toHaveText(['p4.png', 'p1.png', 'p2.png', 'p3.png', 'p5.png']);

    // One step later, from the card's own button (the keyboard's way).
    await manager.getByRole('button', { name: 'Move page 1 later', exact: true }).click();
    await expect(names).toHaveText(['p1.png', 'p4.png', 'p2.png', 'p3.png', 'p5.png']);

    // Select two pages and remove them together.
    await manager.getByRole('button', { name: 'Page 2: p4.png', exact: true }).click();
    await manager.getByRole('button', { name: 'Page 5: p5.png', exact: true }).click();
    await manager.getByRole('button', { name: 'Remove selected', exact: true }).click();
    await expect(names).toHaveText(['p1.png', 'p2.png', 'p3.png']);
    await expect(manager.getByTestId('pages-manager-count')).toHaveText('3 pages');

    // Out of order again, then Sort by name puts it back.
    await cards
      .nth(2)
      .locator('[data-page-name]')
      .dragTo(cards.nth(0), { targetPosition: { x: 6, y: 30 } });
    await expect(names).toHaveText(['p3.png', 'p1.png', 'p2.png']);
    await manager.getByRole('button', { name: 'Sort by name', exact: true }).click();
    await expect(names).toHaveText(['p1.png', 'p2.png', 'p3.png']);

    // Done closes; the Inspector's card reads the book as it now is.
    await manager.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(manager).toBeHidden();
    await expect(app.inspector.getByTestId('sequence-page-count')).toHaveText('3 pages');
  });

  test('🔴 the pages RENDER — on the canvas and in Preview, with the Assets panel closed', async ({
    app,
  }) => {
    // The owner's report: `missing image` on both, because only the Assets panel primed new assets.
    await app.newProject('BookRender');
    await app.addSequence({ x: 200, y: 200 });
    const chooser = app.page.waitForEvent('filechooser');
    await app.inspector.getByRole('button', { name: 'Add pictures…', exact: true }).click();
    await (
      await chooser
    ).setFiles(
      ['p1.png', 'p2.png'].map((name) => ({ name, mimeType: 'image/png', buffer: png(name) })),
    );
    await expect(app.inspector.getByTestId('sequence-page-count')).toHaveText('2 pages');
    // A real picture's blob URL — not the placeholder's `data:image/svg+xml`.
    await expect(app.canvasFrame.locator('img[data-cg-asset-id]').first()).toHaveAttribute(
      'src',
      /^blob:/,
    );
    await app.openPreviewModal();
    await expect(
      app.previewDialog.frameLocator('iframe').locator('img[data-cg-asset-id]').first(),
    ).toHaveAttribute('src', /^blob:/);
  });

  test('🔴 the preview’s six playout commands all sit inside the panel — Next is not pushed off', async ({
    app,
  }) => {
    await app.newProject('BookPreview');
    await app.addSequence({ x: 200, y: 200 });
    await app.openPreviewModal();
    const group = app.previewDialog.getByRole('group', { name: 'Playout commands' });
    const groupBox = await group.boundingBox();
    const dialogBox = await app.previewDialog.boundingBox();
    expect(groupBox).not.toBeNull();
    expect(dialogBox).not.toBeNull();
    // Measured in the engine, not asserted from the stylesheet (golden rule 12 c).
    expect(groupBox!.x + groupBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width);
    for (const name of [/Play|Resume/, 'Pause', 'Out', 'Stop', 'Previous', 'Next']) {
      const button = group.getByRole('button', {
        name,
        ...(typeof name === 'string' && { exact: true }),
      });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box, String(name)).not.toBeNull();
      expect(box!.x, String(name)).toBeGreaterThanOrEqual(groupBox!.x - 0.5);
      expect(box!.x + box!.width, String(name)).toBeLessThanOrEqual(
        groupBox!.x + groupBox!.width + 0.5,
      );
    }
  });

  test('a FOLDER of pictures is added the same way', async ({ app }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-book-'));
    try {
      for (const n of [10, 2, 1]) {
        fs.writeFileSync(path.join(dir, `p${String(n)}.png`), png(`p${String(n)}`));
      }
      await app.newProject('BookFolder');
      await app.addSequence({ x: 200, y: 200 });
      const chooser = app.page.waitForEvent('filechooser');
      await app.inspector.getByRole('button', { name: 'Add folder…', exact: true }).click();
      await (await chooser).setFiles(dir);
      await expect(app.inspector.getByTestId('sequence-page-count')).toHaveText('3 pages');
      await app.inspector.getByRole('button', { name: 'Manage pages…', exact: true }).click();
      await expect(
        app.page.getByRole('dialog', { name: /^Pages — / }).locator('[data-page-name]'),
      ).toHaveText(['p1.png', 'p2.png', 'p10.png']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
