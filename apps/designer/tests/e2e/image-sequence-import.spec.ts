import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test } from './fixtures/designer.js';
import type { Page } from '@playwright/test';

/**
 * 🔴 `D-164` — **A NUMBERED PNG SEQUENCE IMPORTS AS ONE VIDEO LAYER**, in the REAL built app: pick
 * a folder (or files) → the sequence step names every gap → the SAME crop/convert modal a clip uses
 * (real ffmpeg.wasm, the `image2` input) → ONE stored WebM and ONE `video` element.
 *
 * The frames are made here, as real RGBA PNGs: a horizontal WHITE-TO-TRANSPARENT ramp (alpha 255 at
 * the left edge to 0 at the right), white under every alpha. Straight alpha survives only if, after
 * the conversion, the ramp composites over BLACK as its own alpha and over WHITE as white — a
 * premultiply or a matte would darken the second, which is the dirty edge the hard stop forbids.
 */

const SIZE = 64;

/** CRC-32 (PNG's), table-driven. */
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

/** The ramp's alpha at column `x`: 255 at the left edge, 0 at the right. */
const rampAlpha = (x: number): number => Math.round(255 * (1 - x / (SIZE - 1)));

/**
 * A 64×64 RGBA PNG: the white ramp, plus (when `mark` is given) an opaque black 4×4 square in the
 * bottom rows at `x = mark * 4`, so each frame is its own picture.
 */
function rampPng(mark?: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y++) {
    const row = y * (1 + SIZE * 4);
    raw[row] = 0; // filter: none
    for (let x = 0; x < SIZE; x++) {
      const at = row + 1 + x * 4;
      const inMark = mark !== undefined && y >= SIZE - 4 && x >= mark * 4 && x < mark * 4 + 4;
      raw[at] = inMark ? 0 : 255;
      raw[at + 1] = inMark ? 0 : 255;
      raw[at + 2] = inMark ? 0 : 255;
      raw[at + 3] = inMark ? 255 : rampAlpha(x);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function openAddMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** Decode the stored WebM and read one row of the ramp composited over black and over white. */
async function readRamp(page: Page) {
  return page.evaluate(async (size) => {
    const assets = await window.cg.assets.list();
    const vid = assets.find((a) => a.kind === 'video');
    if (vid === undefined) return { ok: false as const, why: 'no stored video asset' };
    const url = await window.cg.assets.url(vid.assetId);
    if (url === null) return { ok: false as const, why: 'no url' };
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    const loaded = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 10_000);
      v.onloadeddata = () => {
        clearTimeout(t);
        resolve(true);
      };
      v.onerror = () => {
        clearTimeout(t);
        resolve(false);
      };
      v.src = url;
    });
    if (!loaded) return { ok: false as const, why: 'decode failed' };
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      v.currentTime = v.duration / 2;
    });
    const over = (bg: string): number[] => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      if (g === null) return [];
      g.fillStyle = bg;
      g.fillRect(0, 0, size, size);
      g.drawImage(v, 0, 0);
      const row = g.getImageData(0, size / 2, size, 1).data;
      return Array.from({ length: size }, (_, x) => row[x * 4] ?? -1);
    };
    return {
      ok: true as const,
      width: v.videoWidth,
      height: v.videoHeight,
      duration: v.duration,
      overBlack: over('#000'),
      overWhite: over('#fff'),
      provenance: vid.provenance ?? null,
      filename: vid.filename,
    };
  }, SIZE);
}

test.describe('D-164 — a numbered image sequence imports as ONE video layer', () => {
  test('🔴 a FOLDER with a gap: the gap is named, one video asset + element, and the alpha ramp survives exactly', async ({
    app,
    page,
  }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-pngseq-'));
    try {
      // f_01 … f_10 with f_05 missing; written out of order (the folder's order is not the frames').
      for (const n of [10, 3, 1, 7, 2, 9, 4, 6, 8]) {
        fs.writeFileSync(path.join(dir, `f_${String(n).padStart(2, '0')}.png`), rampPng(n));
      }
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a frame');
      await app.newProject('PngSequence');
      await app.setSceneDuration(250);
      await page.getByRole('button', { name: 'Project assets' }).click();

      const chooser = page.waitForEvent('filechooser');
      await openAddMenu(page, 'Image sequence folder…');
      await (await chooser).setFiles(dir);

      // ---- the sequence step: the gap NAMED before anything converts ----
      const step = page.getByRole('dialog', { name: 'Image sequence' });
      await expect(step.getByTestId('sequence-summary')).toContainText('64×64');
      await expect(step.getByTestId('sequence-missing')).toContainText('f_05.png');
      await expect(step.getByTestId('sequence-ignored')).toContainText('Left out: 1 file');
      await expect(step.getByRole('spinbutton', { name: 'Frame rate' })).toHaveValue('50');
      await step.getByRole('button', { name: 'Continue', exact: true }).click();

      // ---- the SAME modal a clip uses ----
      const convert = page.getByRole('dialog', { name: 'Import image sequence' });
      await expect(convert.getByTestId('video-probe-meta')).toContainText('64×64');
      await convert.getByRole('button', { name: 'Convert & import' }).click();
      await convert.getByRole('button', { name: 'Place element' }).click({ timeout: 30_000 });
      await expect(convert).not.toBeAttached();

      // ---- ONE video asset; its provenance says it was a sequence ----
      const ramp = await readRamp(page);
      expect(ramp, JSON.stringify(ramp).slice(0, 400)).toMatchObject({ ok: true });
      if (!ramp.ok) return;
      expect(ramp.filename).toBe('f.webm');
      expect(ramp.provenance?.sequence).toEqual({
        firstFile: 'f_01.png',
        lastFile: 'f_10.png',
        frameCount: 10, // 1 … 10, the gap HELD — never closed up
        fps: 50,
      });
      expect([ramp.width, ramp.height]).toEqual([SIZE, SIZE]);
      expect(ramp.duration).toBeGreaterThan(0.15);
      expect(ramp.duration).toBeLessThan(0.3); // 10 frames at 50 fps = 0.2 s

      // ---- 🔴 THE ALPHA: straight, exact within VP8's lossy alpha plane ----
      // Over BLACK the white ramp reads as its own alpha; over WHITE it stays white (no darkening —
      // a premultiplied or matted path would put ~191 at the midpoint here).
      const blackErr = ramp.overBlack.map((v, x) => Math.abs(v - rampAlpha(x)));
      const worstWhite = Math.min(...ramp.overWhite);
      expect(Math.max(...blackErr), `over black: ${ramp.overBlack.join(',')}`).toBeLessThanOrEqual(
        8,
      );
      expect(worstWhite, `over white: ${ramp.overWhite.join(',')}`).toBeGreaterThanOrEqual(247);
      // The instrument is live: the ramp really spans opaque → transparent.
      expect(ramp.overBlack[0]).toBeGreaterThanOrEqual(247);
      expect(ramp.overBlack[SIZE - 1]).toBeLessThanOrEqual(8);

      // ---- ONE video element on the canvas, rendering a real <video> ----
      await expect(app.inspector.getByRole('textbox', { name: 'Element name' })).toHaveValue(
        'Video',
      );
      await expect(app.inspector.getByTestId('video-provenance-sequence')).toContainText(
        '10 frames · 50 fps',
      );
      await expect(
        page.frameLocator('iframe[title="cgpreview"]').locator('video[data-cg-asset-id]'),
      ).toBeAttached({ timeout: 15_000 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('🔴 TWO sequences in one pick: the author picks one; the SAME frames again are offered back, not re-encoded', async ({
    app,
    page,
  }) => {
    const files = [
      ...[1, 2, 3, 4].map((n) => ({ name: `a_${String(n)}.png`, buffer: rampPng(n) })),
      ...[1, 2, 3].map((n) => ({ name: `b_${String(n)}.png`, buffer: rampPng(n + 5) })),
    ].map((f) => ({ ...f, mimeType: 'image/png' }));
    await app.newProject('PngSequenceTwice');
    await app.setSceneDuration(250);
    await page.getByRole('button', { name: 'Project assets' }).click();

    for (const attempt of [1, 2]) {
      const chooser = page.waitForEvent('filechooser');
      await openAddMenu(page, 'Image sequence…');
      await (await chooser).setFiles(files);
      const step = page.getByRole('dialog', { name: 'Image sequence' });
      const choice = step.getByRole('combobox', { name: 'Sequence' });
      await expect(choice.locator('option')).toHaveText([
        'a_1.png … a_4.png (4 frames)',
        'b_1.png … b_3.png (3 frames)',
      ]);
      await choice.selectOption({ label: 'b_1.png … b_3.png (3 frames)' });
      await expect(step.getByTestId('sequence-summary')).toContainText('b_1.png … b_3.png');
      await step.getByRole('button', { name: 'Continue', exact: true }).click();

      const convert = page.getByRole('dialog', { name: 'Import image sequence' });
      await expect(convert.getByTestId('video-probe-meta')).toContainText('64×64');
      await convert.getByRole('button', { name: 'Convert & import' }).click();
      if (attempt === 1) {
        await convert.getByRole('button', { name: 'Place element' }).click({ timeout: 30_000 });
      } else {
        // 🔴 The same frames at the same rate: offered back BEFORE any encode.
        await expect(convert.getByText('already imported')).toBeVisible({ timeout: 25_000 });
        await convert.getByRole('button', { name: 'Use existing' }).click();
      }
      await expect(convert).not.toBeAttached();
    }
    const videos = await page.evaluate(
      async () => (await window.cg.assets.list()).filter((a) => a.kind === 'video').length,
    );
    expect(videos, 'the second import stored a second copy').toBe(1);
  });

  test('🔴 Cancel leaves the project unchanged — at the sequence step and at the convert step', async ({
    app,
    page,
  }) => {
    const files = [1, 2, 3].map((n) => ({
      name: `c_${String(n)}.png`,
      mimeType: 'image/png',
      buffer: rampPng(n),
    }));
    await app.newProject('PngSequenceCancel');
    await page.getByRole('button', { name: 'Project assets' }).click();

    // At the sequence step.
    let chooser = page.waitForEvent('filechooser');
    await openAddMenu(page, 'Image sequence…');
    await (await chooser).setFiles(files);
    const step = page.getByRole('dialog', { name: 'Image sequence' });
    await step.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(step).not.toBeAttached();

    // At the convert step, after the probe.
    chooser = page.waitForEvent('filechooser');
    await openAddMenu(page, 'Image sequence…');
    await (await chooser).setFiles(files);
    await step.getByRole('button', { name: 'Continue', exact: true }).click();
    const convert = page.getByRole('dialog', { name: 'Import image sequence' });
    await expect(convert.getByTestId('video-probe-meta')).toContainText('64×64');
    await convert.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(convert).not.toBeAttached();

    const stored = await page.evaluate(async () => (await window.cg.assets.list()).length);
    expect(stored).toBe(0);
    await expect(app.inspector.getByRole('textbox', { name: 'Element name' })).not.toBeAttached();
  });
});
