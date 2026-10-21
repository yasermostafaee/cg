import { readProjectDocument, unpack } from '@cg/vcg-format';
import type { Download, Page } from '@playwright/test';
import { test, expect } from './fixtures/designer.js';

/**
 * 🔴 `B-352` — **ONE PACKAGE ID PER COMPOSITION, AND A COPY IS ANOTHER PROJECT.** Every composition of
 * a project used to export with the PROJECT's id, so CG Control replaced one with the next; and Save
 * As kept that id, so a project saved as a copy exported over its original. Driven on the DOWNLOAD
 * tier (as `project-package.spec.ts` is) because that tier hands the test the real bytes.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function bytesOf(download: Download): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** `Export (.vcg)` on the download tier, read back: the package's id. */
async function exportedId(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .vcg' }).click();
  return (await unpack(new Uint8Array(await bytesOf(await download)))).manifest.id;
}

/** File ▸ Save or Save As on the download tier, read back: the project's id. */
async function savedProjectId(page: Page, item: RegExp): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
  return (await readProjectDocument(new Uint8Array(await bytesOf(await download)))).scene.id;
}

test('🔴 Save As writes a copy with its own id, and the copy’s compositions export under new ids', async ({
  app,
  page,
}) => {
  // The download tier: no `showSaveFilePicker` (the harness removes it) and no sandboxed store.
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
    } catch {
      /* ignore */
    }
  });
  await app.goto();
  await app.newProject('Telavat');

  // An image the project references, so the copy has assets to carry.
  await page.getByRole('button', { name: 'Project assets', exact: true }).click();
  await page.getByRole('button', { name: 'Add asset', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Image…', exact: true }).click();
  await (await chooser).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  const tile = page
    .locator('aside[aria-label="Project assets"]')
    .locator('[draggable="true"]')
    .filter({ hasText: 'logo' })
    .first();
  await tile.dragTo(app.canvas, { targetPosition: { x: 220, y: 140 } });

  const original = await savedProjectId(page, /^Save(?! As)/);
  const exportedBefore = await exportedId(page);
  expect(exportedBefore).not.toBe(original); // the composition's id, not the project's
  expect(await exportedId(page)).toBe(exportedBefore); // re-exported: the same id

  const copy = await savedProjectId(page, /^Save As/);
  expect(copy).not.toBe(original);
  expect(await exportedId(page)).not.toBe(exportedBefore);

  // The copy still has its picture: its assets were written under its own id.
  await expect(app.canvasFrame.locator('img[data-cg-asset-id]').first()).toHaveAttribute(
    'src',
    /.+/,
  );
  // And a plain Save of the copy keeps the copy's id.
  expect(await savedProjectId(page, /^Save(?! As)/)).toBe(copy);
});
