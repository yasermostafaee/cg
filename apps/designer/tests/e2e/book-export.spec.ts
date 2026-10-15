import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { unpack, verify } from '@cg/vcg-format';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DesignerApp } from './fixtures/designer.js';

/**
 * 🔴 `BOOK-EXPORT-01` — **A BOOK EXPORTS, AND EVERY EXPORT IS ANSWERED.** The owner: a Sequence,
 * `Add folder…`, `Export (.vcg)` — no message, and a `telavat.vcg` of 0 bytes that CG Control called a
 * "Corrupted zip". Measured: Chrome's save dialog makes the file EMPTY when the name is chosen, the
 * export then threw, and the rejection reached no one (`B-349`).
 *
 * These boot the Designer the way the owner's Chrome does — the persistent OPFS workspace, not the
 * fixture's memory one — and give it a save dialog that behaves as Chrome's: a REAL file handle
 * (OPFS), created empty the moment the name is chosen. Everything after that is the product's own
 * code: the real folder pick, the real export, the real writable and its `remove()`.
 */

const png = (name: string): Buffer => Buffer.concat([DesignerApp.PNG_1X1, Buffer.from(name)]);

async function boot(page: Page): Promise<DesignerApp> {
  await page.addInitScript(() => {
    (window as unknown as { __CG_SPLASH_DISABLED__: boolean }).__CG_SPLASH_DISABLED__ = true;
    const w = window as unknown as {
      __picks: number;
      showSaveFilePicker: () => Promise<FileSystemFileHandle>;
    };
    w.__picks = 0;
    // The author types the owner's name in the dialog, as he did: `telavat.vcg`.
    w.showSaveFilePicker = async () => {
      w.__picks += 1;
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('saved-by-dialog', { create: true });
      const handle = await dir.getFileHandle('telavat.vcg', { create: true });
      const empty = await handle.createWritable();
      await empty.truncate(0);
      await empty.close();
      return handle;
    };
  });
  page.on('dialog', (d) => void d.dismiss());
  const app = new DesignerApp(page);
  await app.goto();
  return app;
}

/** A folder of pictures, picked through the real `Add folder…`, as the owner did. */
async function bookFromFolder(app: DesignerApp, names: string[]): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-book-export-'));
  try {
    for (const n of names) fs.writeFileSync(path.join(dir, n), png(n));
    await app.newProject('telavat');
    await app.addSequence({ x: 200, y: 200 });
    const chooser = app.page.waitForEvent('filechooser');
    await app.inspector.getByRole('button', { name: 'Add folder…', exact: true }).click();
    await (await chooser).setFiles(dir);
    await expect(app.inspector.getByTestId('sequence-page-count')).toHaveText(
      `${String(names.length)} pages`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The file the save dialog made: its bytes (base64), or `null` when it is gone. */
async function savedFile(page: Page, name: string): Promise<Buffer | null> {
  const b64 = await page.evaluate(async (n) => {
    const root = await navigator.storage.getDirectory();
    try {
      const dir = await root.getDirectoryHandle('saved-by-dialog');
      const file = await (await dir.getFileHandle(n)).getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return btoa(s);
    } catch {
      return null;
    }
  }, name);
  return b64 === null ? null : Buffer.from(b64, 'base64');
}

/** Record every label the Export button shows, from before the press. */
async function recordExportLabels(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __labels: string[] }).__labels = seen;
    const button = document.querySelector('button[aria-label="Export .vcg"]');
    if (button === null) throw new Error('no Export button');
    new MutationObserver(() => seen.push(button.textContent ?? '')).observe(button, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  return () => page.evaluate(() => (window as unknown as { __labels: string[] }).__labels);
}

const exportVcg = (page: Page) => page.getByRole('button', { name: 'Export .vcg', exact: true });

test.describe('BOOK-EXPORT-01 — a book exports, and every export is answered', () => {
  test('🔴 a book filled by Add folder… exports: progress on the button, then the file’s name and size; the package verifies', async ({
    page,
  }) => {
    const app = await boot(page);
    await bookFromFolder(app, ['p1.png', 'p2.png', 'p3.png']);
    const labels = await recordExportLabels(page);

    await exportVcg(page).click();

    const notice = page.getByRole('status');
    await expect(notice).toHaveText(/^Exported telavat\.vcg · \d+ KB$/);
    expect(await labels()).toContain('Exporting…');
    await expect(exportVcg(page)).toHaveText('Export (.vcg)');
    await expect(exportVcg(page)).toBeEnabled();

    // The file the dialog made holds the whole package, and it is the size the notice said.
    const bytes = await savedFile(page, 'telavat.vcg');
    expect(bytes).not.toBeNull();
    const kb = Number(/· (\d+) KB/.exec((await notice.textContent()) ?? '')?.[1]);
    expect(Math.max(1, Math.round((bytes?.byteLength ?? 0) / 1024))).toBe(kb);
    const vcg = new Uint8Array(bytes ?? []);
    expect((await verify(vcg)).ok).toBe(true);
    const { manifest } = await unpack(vcg);
    // Every page travels: three pictures, each its own asset.
    expect(manifest.assetIndex.filter((e) => e.kind === 'image')).toHaveLength(3);
  });

  test('🔴 a page that cannot be read: the sentence names it, stays, and the empty file is REMOVED', async ({
    page,
  }) => {
    const app = await boot(page);
    await bookFromFolder(app, ['p1.png', 'p2.png', 'p3.png']);
    // The picture's bytes leave the workspace while the project still lists it — what a disk
    // error, or a folder cleaned by hand, leaves behind.
    const sha = crypto.createHash('sha256').update(png('p2.png')).digest('hex');
    const removed = await page.evaluate(async (name) => {
      type Dir = FileSystemDirectoryHandle & {
        entries(): AsyncIterable<[string, FileSystemHandle]>;
      };
      const walk = async (dir: Dir): Promise<number> => {
        let n = 0;
        for await (const [entry, h] of dir.entries()) {
          if (h.kind === 'directory') n += await walk(h as Dir);
          else if (entry.startsWith(name)) {
            await dir.removeEntry(entry);
            n += 1;
          }
        }
        return n;
      };
      return walk((await navigator.storage.getDirectory()) as Dir);
    }, sha);
    expect(removed, 'the instrument found the picture it removes').toBe(1);

    await exportVcg(page).click();

    // Said in the author's words — which file, which element, and what became of the .vcg —
    // and still there long after a transient notice would have gone.
    const notice = page.getByRole('status');
    await expect(notice).toHaveText(
      /^Export failed: p2\.png in ".+" could not be read from the project\. telavat\.vcg was removed; nothing was saved\.$/,
    );
    await page.waitForTimeout(6000);
    await expect(notice).toContainText('Export failed');
    // The save dialog DID make the file (the instrument is live)…
    expect(await page.evaluate(() => (window as unknown as { __picks: number }).__picks)).toBe(1);
    // …and no empty file is left behind.
    expect(await savedFile(page, 'telavat.vcg')).toBeNull();
    // The element at fault is the one selected: the book's own Inspector card is showing.
    await expect(app.inspector.getByTestId('sequence-page-count')).toHaveText('3 pages');
  });
});
