import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-G` — **A REAL CHOOSER, WITH TIME TO THINK.** The owner, in a normal
 * Chrome: `Image sequence…` with ten frames, and `Image sequence folder…` — NOTHING happened, no
 * import and no message.
 *
 * Measured cause: the picker's `<input type=file>` was created DETACHED and nothing held it, so
 * Chrome could garbage-collect it while its dialog was still open; the `change` event then never
 * fired and the pick never settled. A quick single pick usually beat the collector; a ten-file
 * multi-select or a folder (with Chrome's "upload N files?" confirmation) gave it the time.
 *
 * Playwright's own `filechooser` API cannot see this: it holds a handle on the input. So these
 * specs drive the chooser through raw CDP the way Chrome's own dialog does — by node id only, no JS
 * handle — and run a garbage collection while the "dialog" is open, as the owner's long pick did.
 */

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A 16×16 RGBA PNG, half transparent — a frame with alpha. */
function framePng(n: number): Buffer {
  const W = 16;
  const raw = Buffer.alloc((W * 4 + 1) * W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const o = y * (W * 4 + 1) + 1 + x * 4;
      raw[o] = (n * 20) & 255;
      raw[o + 1] = 255;
      raw[o + 2] = 255;
      raw[o + 3] = 128;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(W, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Ten numbered frames with alpha, in a fresh folder. */
function tenFrames(): { dir: string; paths: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'cg-seq-'));
  const paths: string[] = [];
  for (let n = 1; n <= 10; n++) {
    const p = join(dir, `frame_${String(n).padStart(4, '0')}.png`);
    writeFileSync(p, framePng(n));
    paths.push(p);
  }
  return { dir, paths };
}

/**
 * Open the Add menu's `item`, let Chrome's chooser open, COLLECT GARBAGE while it is open, then
 * deliver `files` to the node the chooser was opened for — Chrome's own dialog path.
 */
async function pickThroughRealChooser(page: Page, item: string, files: string[]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true });
  const opened = new Promise<{ backendNodeId: number }>((resolve) => {
    cdp.on('Page.fileChooserOpened', (e) => resolve(e as { backendNodeId: number }));
  });
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  const { backendNodeId } = await opened;
  // The owner's pick took seconds; Chrome is free to collect in that time.
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
  // A collected input has no node left to receive the files — the pick can never settle.
  await cdp.send('DOM.setFileInputFiles', { files, backendNodeId });
  await cdp.send('Page.setInterceptFileChooserDialog', { enabled: false });
  await cdp.detach();
}

test.describe('🔴 DELTA-G — a picker that survives the time a real pick takes', () => {
  test('Image sequence… with TEN frames opens the sequence step — never silence', async ({
    app,
    page,
  }) => {
    const { dir, paths } = tenFrames();
    try {
      await app.newProject('SeqTen');
      await page.getByRole('button', { name: 'Project assets' }).click();
      await pickThroughRealChooser(page, 'Image sequence…', paths);
      const step = page.getByRole('dialog', { name: 'Image sequence' });
      await expect(step.getByTestId('sequence-summary')).toContainText(
        'frame_0001.png … frame_0010.png (10 frames)',
      );
      await expect(step.getByTestId('sequence-summary')).toContainText('16×16');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Image sequence folder… opens the sequence step for the folder — never silence', async ({
    app,
    page,
  }) => {
    const { dir } = tenFrames();
    try {
      await app.newProject('SeqFolder');
      await page.getByRole('button', { name: 'Project assets' }).click();
      await pickThroughRealChooser(page, 'Image sequence folder…', [dir]);
      const step = page.getByRole('dialog', { name: 'Image sequence' });
      await expect(step.getByTestId('sequence-summary')).toContainText('(10 frames)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('ONE picture in Image sequence… is answered with a sentence, never a one-frame video', async ({
    app,
    page,
  }) => {
    const { dir, paths } = tenFrames();
    try {
      await app.newProject('SeqOne');
      await page.getByRole('button', { name: 'Project assets' }).click();
      await pickThroughRealChooser(page, 'Image sequence…', [paths[0] as string]);
      await expect(page.getByText('One picture is not a sequence', { exact: false })).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'Image sequence' })).not.toBeAttached();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
