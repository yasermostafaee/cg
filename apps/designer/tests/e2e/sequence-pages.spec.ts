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
    // The sequence is a book: a Crossfade between pages (never a jump), manual, one pass.
    await expect(app.inspector.getByLabel('advance', { exact: true })).toHaveValue('manual');
    await expect(app.inspector.getByLabel('transition', { exact: true })).toHaveValue('crossfade');
    await expect(app.inspector.getByLabel('in', { exact: true })).toHaveValue('fade');
    await expect(app.inspector.getByLabel('out', { exact: true })).toHaveValue('fade');
    // ONE field is "transition" (which one) and one is "transition time" (how long) — and the time is
    // in SECONDS, the dwell's unit (the owner: one in ms beside one in s was wrong).
    await expect(app.inspector.getByLabel('transition', { exact: true })).toHaveCount(1);
    const time = app.inspector.getByLabel('transition time', { exact: true });
    await expect(time).toBeEnabled();
    await expect(time).toHaveValue('0.4');
    const unitOf = (label: string) =>
      app.inspector
        // `has:` is resolved INSIDE each candidate field, so it is rooted at the page, not the Inspector.
        .locator('.cg-field', { has: app.page.getByLabel(label, { exact: true }) })
        .locator('.cg-unit');
    await expect(unitOf('transition time')).toHaveText('s');
    await expect(unitOf('default dwell')).toHaveText('s');
    // Cut swaps at once: its time is withheld, and says why.
    await app.inspector.getByLabel('transition', { exact: true }).selectOption('cut');
    await expect(time).toBeDisabled();
    await expect(time).toHaveAttribute('title', /Cut swaps at once/);
    await app.inspector.getByLabel('transition', { exact: true }).selectOption('crossfade');
    await expect(time).toBeEnabled();
    // The drift crossfade: the current item fades in place, the next fades in with a nudge.
    await app.inspector
      .getByLabel('transition', { exact: true })
      .selectOption('crossfade-drift-right');
    await expect(app.inspector.getByLabel('in', { exact: true })).toHaveValue('fade-right');
    await expect(app.inspector.getByLabel('out', { exact: true })).toHaveValue('fade');

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
    await manager.getByRole('button', { name: 'Move item 1 later', exact: true }).click();
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

  test('🔴 the grid and the Inspector add every kind — pictures, text, a composition — and say what each does', async ({
    app,
  }) => {
    // The owner's report: only the List view could add a text or composition item, the
    // Inspector card only pictures, and the buttons had no tooltips.
    await app.newProject('BookKinds');
    await app.newComposition('Logo');
    await app.openComposition('comp1');
    await app.addSequence({ x: 200, y: 200 });
    const chooser = app.page.waitForEvent('filechooser');
    await app.inspector.getByRole('button', { name: 'Add pictures…', exact: true }).click();
    await (
      await chooser
    ).setFiles(
      ['p1.png', 'p2.png'].map((name) => ({ name, mimeType: 'image/png', buffer: png(name) })),
    );
    await expect(app.inspector.getByTestId('sequence-page-count')).toHaveText('2 pages');

    // The Inspector's card adds a text item too: a book has no item list there.
    await app.inspector.getByRole('button', { name: 'Add text', exact: true }).click();
    const manage = app.inspector.getByRole('button', { name: 'Manage pages…', exact: true });
    await expect(manage).toHaveAttribute('title', /\S/);
    await manage.click();
    const manager = app.page.getByRole('dialog', { name: /^Pages — / });
    // `RUN-NEXT-VERSION-03` 1.7 — a book's text page is a page (1.6); a composition item makes items.
    await expect(manager.getByTestId('pages-manager-count')).toHaveText('3 pages');

    // In the GRID: the text item is typed where it stands, and a composition item is added.
    await manager.getByRole('textbox', { name: 'Item 3 text', exact: true }).fill('سرخط خبر');
    await manager.getByRole('button', { name: 'Add composition', exact: true }).click();
    await expect(manager.getByTestId('pages-manager-count')).toHaveText('4 items');
    await expect(
      manager
        .getByRole('combobox', { name: 'Item 4 composition', exact: true })
        .locator('option:checked'),
    ).toHaveText('Logo');

    // Every control says what it does.
    for (const name of ['Add pictures…', 'Add folder…', 'Add text', 'Add composition']) {
      await expect(manager.getByRole('button', { name, exact: true })).toHaveAttribute(
        'title',
        /\S/,
      );
    }
    for (const name of ['Sort by name', 'Select all', 'Move item 1 later', 'Remove item 1']) {
      await expect(manager.getByRole('button', { name, exact: true })).toHaveAttribute(
        'title',
        /\S/,
      );
    }

    // …and the tooltip is SEEN over the dialog: the owner's report was that it drew underneath.
    await manager.getByRole('button', { name: 'Sort by name', exact: true }).hover();
    const tip = app.page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('file-name order');
    const stacked = await tip.evaluate((el) => {
      const dialog = document.querySelector('[role="dialog"]');
      const backdrop = dialog?.parentElement ?? null;
      return {
        onBody: el.parentElement === document.body,
        tip: Number(getComputedStyle(el).zIndex),
        dialog: backdrop === null ? NaN : Number(getComputedStyle(backdrop).zIndex),
      };
    });
    expect(stacked.onBody).toBe(true);
    expect(stacked.tip).toBeGreaterThan(stacked.dialog);

    // One sequence, two views: the List view holds the same text.
    await manager.getByRole('button', { name: 'List view', exact: true }).click();
    await expect(manager.getByLabel('Sequence item 3', { exact: true })).toHaveValue('سرخط خبر');
  });

  test('🔴 a sequence the operator does not step offers no Next — on by default for every sequence', async ({
    app,
  }) => {
    // The owner: clocks of several cities turning beside a strap run by themselves.
    await app.newProject('Clocks');
    await app.addSequence({ x: 200, y: 200 });
    const steps = app.inspector.getByRole('checkbox', { name: 'operator steps', exact: true });
    await expect(steps).toBeChecked();
    await app.openPreviewModal();
    await expect(
      app.previewDialog.getByRole('button', { name: 'Next', exact: true }),
    ).toBeEnabled();
    // Closed by its own ✕ (Escape would also clear the canvas selection).
    await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(app.previewDialog).toBeHidden();

    await steps.uncheck();
    await app.openPreviewModal();
    await expect(
      app.previewDialog.getByRole('button', { name: 'Next', exact: true }),
    ).toBeDisabled();
    await expect(
      app.previewDialog.getByRole('button', { name: 'Previous', exact: true }),
    ).toBeDisabled();
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
