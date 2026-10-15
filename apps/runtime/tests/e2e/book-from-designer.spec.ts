import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpack } from '@cg/vcg-format';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';
import { stopChild } from './fixtures/child-process.js';

/**
 * 🔴 `BOOK-EXPORT-01` — **A BOOK MADE IN THE DESIGNER IS A BOOK IN CG CONTROL.** The owner: a
 * Sequence, `Add folder…`, `Export (.vcg)`, then CG Control's `Import a .vcg` — which refused the file
 * as a "Corrupted zip" (it was 0 bytes). No spec had ever carried a Designer export into CG Control:
 * each app tested its half against a package built by hand.
 *
 * Here the REAL Designer (its built app, served beside this suite) fills a Sequence through the real
 * `Add folder…`, gives it a Data key (the page list CG Control turns), and exports; CG Control imports
 * those exact bytes, loads them on a row, takes it, and turns the pages: Next, Previous, Go.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const DESIGNER = path.resolve(here, '../../../designer');

/** A 1×1 PNG with its own tail, so every page has its own SHA-256. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const page = (name: string): Buffer => Buffer.concat([PNG_1X1, Buffer.from(name)]);

let designer: ChildProcess | null = null;
let designerUrl = '';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

test.beforeAll(async () => {
  // The Designer's BUILT app: CI builds the workspace before the suites; `turbo` orders
  // `@cg/runtime#test:e2e` after `@cg/designer#build` locally. Missing is a failure, never a skip.
  const index = path.join(DESIGNER, 'dist', 'index.html');
  if (!fs.existsSync(index)) throw new Error(`the Designer is not built: ${index} is missing`);
  const port = await freePort();
  designerUrl = `http://127.0.0.1:${String(port)}`;
  designer = spawn(
    process.execPath,
    [
      path.join(DESIGNER, 'node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--port',
      String(port),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    { cwd: DESIGNER, stdio: 'ignore' },
  );
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const up = await fetch(designerUrl).then(
      (r) => r.ok,
      () => false,
    );
    if (up) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`the Designer did not start on ${designerUrl}`);
});

test.afterAll(async () => {
  await stopChild(designer);
  designer = null;
});

/** The owner's clicks in the Designer, ending in the exported bytes. */
async function exportBookFromDesigner(tab: Page, folder: string): Promise<Uint8Array> {
  await tab.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.CG_E2E = true;
    w.__CG_SPLASH_DISABLED__ = true;
    // No save dialog: the export downloads, which is the bytes this test carries over.
    for (const k of ['showSaveFilePicker', 'showOpenFilePicker', 'showDirectoryPicker']) {
      Object.defineProperty(window, k, { configurable: true, value: undefined });
    }
  });
  await tab.goto(designerUrl);
  await tab.getByRole('button', { name: 'New project' }).click({ timeout: 30_000 });
  const create = tab.getByRole('dialog', { name: 'New project' });
  await create.getByLabel('Project name').fill('telavat');
  await create.getByRole('button', { name: 'Create' }).click();
  const canvas = tab.getByTestId('canvas-surface');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await tab.getByRole('button', { name: 'Sequence', exact: true }).click();
  await canvas.click({ position: { x: 200, y: 200 } });

  const chooser = tab.waitForEvent('filechooser');
  await tab.getByRole('button', { name: 'Add folder…', exact: true }).first().click();
  await (await chooser).setFiles(folder);
  await expect(tab.getByTestId('sequence-page-count')).toHaveText('3 pages');

  // The Data key makes the pages a PAGE LIST — what CG Control turns with Previous and Go.
  const key = tab.getByRole('textbox', { name: 'Data key', exact: true });
  if (!(await key.isVisible()))
    await tab.getByRole('button', { name: 'Toggle Dynamic / Data' }).click();
  await key.fill('pages');
  await key.press('Enter');

  const download = tab.waitForEvent('download');
  await tab.getByRole('button', { name: 'Export .vcg', exact: true }).click();
  const file = await download;
  await expect(tab.getByRole('status')).toHaveText(/^Exported .+\.vcg · \d+ KB$/);
  const chunks: Buffer[] = [];
  for await (const c of await file.createReadStream()) chunks.push(Buffer.from(c));
  return new Uint8Array(Buffer.concat(chunks));
}

test('🔴 a book exported by the Designer imports, loads, takes and turns its pages in CG Control', async ({
  app,
}) => {
  test.setTimeout(120_000);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-book-designer-'));
  let bytes: Uint8Array;
  try {
    for (const n of ['p10.png', 'p2.png', 'p1.png'])
      fs.writeFileSync(path.join(folder, n), page(n));
    const tab = await app.page.context().newPage();
    try {
      bytes = await exportBookFromDesigner(tab, folder);
    } finally {
      await tab.close();
    }
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
  expect(bytes.byteLength).toBeGreaterThan(0);
  const { manifest } = await unpack(bytes);

  // CG Control: Import a .vcg, onto a row — the owner's door.
  const layer = await app.importVcg('telavat.vcg', bytes);
  await expect(app.error).toHaveCount(0);
  await app.selectStackRow(manifest.id);
  const counter = app.inspector.getByTestId('book-counter');
  await expect(counter).toHaveText('1 / 3');

  // TAKE.
  const row = app.layerRow(layer);
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(app.layerState(layer)).toHaveText(/ON AIR/);

  // Next, Previous, and the page box + Go.
  await app.inspector.getByRole('button', { name: 'Next page' }).click();
  await expect(counter).toHaveText('2 / 3');
  await app.inspector.getByRole('button', { name: 'Previous page' }).click();
  await expect(counter).toHaveText('1 / 3');
  await app.inspector.getByRole('textbox', { name: 'Page number' }).fill('3');
  await app.inspector.getByRole('button', { name: 'Go to page' }).click();
  await expect(counter).toHaveText('3 / 3');
  // A book stops at its last page.
  await expect(app.inspector.getByRole('button', { name: 'Next page' })).toBeDisabled();

  // STOP takes it off air; the row keeps its template.
  await row.getByRole('button', { name: 'STOP' }).click();
  await expect(app.layerState(layer)).not.toHaveText(/ON AIR/);
});
