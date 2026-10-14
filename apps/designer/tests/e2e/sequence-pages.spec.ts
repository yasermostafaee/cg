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
    // `page2` before `page10`: the order is the NUMBER in the name, not the characters.
    await expect(app.inspector.getByLabel(/ item \d+ picture$/)).toHaveText(
      Array.from({ length: 12 }, (_, i) => `page${String(i + 1)}.png`),
    );
    // The untouched sample items are gone, and the sequence is a book: Cut, manual, one pass.
    await expect(app.inspector.getByRole('button', { name: /^Remove .* item \d+$/ })).toHaveCount(
      12,
    );
    await expect(app.inspector.getByLabel('advance', { exact: true })).toHaveValue('manual');
    await expect(app.inspector.getByLabel('in', { exact: true })).toHaveValue('none');
    await expect(app.inspector.getByLabel('out', { exact: true })).toHaveValue('none');
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
      await expect(app.inspector.getByLabel(/ item \d+ picture$/)).toHaveText([
        'p1.png',
        'p2.png',
        'p10.png',
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
