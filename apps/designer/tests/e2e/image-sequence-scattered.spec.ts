import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test } from './fixtures/designer.js';
import type { Page } from '@playwright/test';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-I` — **PICTURES NAMED BY FAR-APART NUMBERS ARE NOT A SEQUENCE, AND
 * THEY NEVER TAKE THE TAB DOWN.** The owner's folder: about 38 separate pictures named by large,
 * unrelated numbers. Through `Image sequence…` the tab died ("Aw, Snap! Out of Memory"); through
 * `Image sequence folder…` nothing happened. His folder of consecutive frames imported fine — the
 * specs had only ever fed this path consecutive frames.
 *
 * Here: 38 small PNGs named by 13-digit numbers far apart (the shape of a camera's or a phone's
 * time-stamped names), picked through BOTH real menu items. The page must stay alive and answer
 * with one sentence naming what it found; nothing is imported.
 */

const SIZE = 16;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** A tiny opaque RGBA PNG, its grey set by `shade` so each picture is its own. */
function png(shade: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y++) {
    const row = y * (1 + SIZE * 4);
    for (let x = 0; x < SIZE; x++) raw.fill(shade & 255, row + 1 + x * 4, row + 1 + x * 4 + 3);
    for (let x = 0; x < SIZE; x++) raw[row + 1 + x * 4 + 3] = 255;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 38 pictures named by 13-digit numbers, each far from the next (deterministic). */
function writeScatteredFolder(): { dir: string; files: string[] } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-scattered-'));
  const files: string[] = [];
  let n = 1_696_830_000_000;
  for (let i = 0; i < 38; i++) {
    n += 1_000_000_000 + ((i * 7_919_993) % 900_000_000);
    const file = path.join(dir, `${String(n)}.png`);
    fs.writeFileSync(file, png(i * 6));
    files.push(file);
  }
  return { dir, files };
}

async function openAddMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test.describe('-I — pictures named by far-apart numbers are not a sequence', () => {
  for (const door of ['Image sequence…', 'Image sequence folder…'] as const) {
    test(`🔴 ${door}: the tab stays alive and says these 38 pictures are not a sequence`, async ({
      app,
      page,
    }) => {
      test.setTimeout(60_000);
      const { dir, files } = writeScatteredFolder();
      let crashed = false;
      page.on('crash', () => {
        crashed = true;
      });
      try {
        await app.newProject('Scattered');
        await page.getByRole('button', { name: 'Project assets' }).click();
        const chooser = page.waitForEvent('filechooser');
        await openAddMenu(page, door);
        await (await chooser).setFiles(door === 'Image sequence…' ? files : dir);

        // One sentence, in the author's words — never a crash, never silence.
        await expect(page.getByRole('status')).toContainText('not an image sequence', {
          timeout: 15_000,
        });
        await expect(page.getByRole('status')).toContainText('38 pictures');
        await expect(page.getByRole('dialog', { name: 'Image sequence' })).toHaveCount(0);
        expect(crashed, 'the tab crashed').toBe(false);
        // The page still answers.
        expect(await page.evaluate(() => 1 + 1)).toBe(2);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
