import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PAGE_MAX_BYTES, pageRefsOf, pageTarget, probeImage } from '@cg/shared-ipc';
import { PageStore } from '../src/page-store.js';
import { jpegBytes, pngBytes, webpBytes } from './support/pictures.js';

/** `R-100` — what a picture is, how CG Bridge keeps a book's pages, and where a page turn lands. */

let dir: string | null = null;
afterEach(() => {
  if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});
const tempDir = (): string => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-pages-'));
  return dir;
};

describe('R-100 — a picture is read from its own bytes', () => {
  it('PNG, JPEG and WebP, with their size', () => {
    expect(probeImage(pngBytes(1920, 1080))).toEqual({
      mime: 'image/png',
      width: 1920,
      height: 1080,
    });
    expect(probeImage(jpegBytes(1240, 1754))).toEqual({
      mime: 'image/jpeg',
      width: 1240,
      height: 1754,
    });
    expect(probeImage(webpBytes(800, 600))).toEqual({
      mime: 'image/webp',
      width: 800,
      height: 600,
    });
  });

  it('🔴 anything else is not a picture, whatever it is called', () => {
    expect(probeImage(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(probeImage(Buffer.from('GIF89a'))).toBeNull();
    expect(probeImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('R-100 — the page store', () => {
  it('🔴 the same picture twice is ONE file, and both answers name it', async () => {
    const store = new PageStore(tempDir());
    const a = await store.put(pngBytes(100, 100, 7), 'page1.png');
    const b = await store.put(pngBytes(100, 100, 7), 'copy-of-page1.png');
    expect(a.ok && b.ok && a.page.sha256 === b.page.sha256).toBe(true);
    expect(fs.readdirSync(dir!)).toHaveLength(1);
  });

  it('🔴 a picture over a limit is refused in the operator’s words, and nothing is stored', async () => {
    const store = new PageStore(tempDir());
    const big = await store.put(pngBytes(100, 100, 1, PAGE_MAX_BYTES), 'scan-01.png');
    expect(big).toMatchObject({ ok: false, code: 'page-too-large' });
    expect(big.ok ? '' : big.message).toMatch(
      /^scan-01\.png is 4\.0 MB; a page may be at most 4\.0 MB\.$/,
    );
    const wide = await store.put(pngBytes(5000, 2000, 2), 'panorama.png');
    expect(wide).toMatchObject({ ok: false, code: 'page-too-many-pixels' });
    expect(wide.ok ? '' : wide.message).toContain('panorama.png is 5000 × 2000 pixels');
    const text = await store.put(Buffer.from('hello'), 'notes.png');
    expect(text).toMatchObject({ ok: false, code: 'page-not-a-picture' });
    expect(fs.readdirSync(dir!)).toHaveLength(0);
  });

  it('🔴 a page is named by its ADDRESS on the template origin, and read back as its own bytes', async () => {
    const store = new PageStore(null);
    const bytes = jpegBytes(640, 480, 3);
    const put = await store.put(bytes, 'p.jpg');
    if (!put.ok) throw new Error(put.message);
    // The address a page turn carries — never the bytes (CasparCG keeps every CG UPDATE's bytes).
    expect(store.pathOf(put.page.sha256)).toBe(`/page/${put.page.sha256}.jpg`);
    const read = await store.read(put.page.sha256);
    expect(read?.mime).toBe('image/jpeg');
    expect(read?.bytes.equals(bytes)).toBe(true);
    expect(store.pathOf('e'.repeat(64))).toBeNull();
    expect(await store.read('e'.repeat(64))).toBeNull();
  });

  it('🔴 a restart re-reads the store from its file names, and keeps every page', async () => {
    const d = tempDir();
    const first = new PageStore(d);
    const put = await first.put(webpBytes(320, 240, 9), 'p.webp');
    if (!put.ok) throw new Error(put.message);
    const again = new PageStore(d);
    expect(again.get(put.page.sha256)).toMatchObject({
      mime: 'image/webp',
      width: 320,
      height: 240,
    });
    expect(again.pathOf(put.page.sha256)).toBe(`/page/${put.page.sha256}.webp`);
    expect((await again.read(put.page.sha256))?.mime).toBe('image/webp');
  });

  it('🔴 the sweep deletes a NAMED page no row names, at once; an unnamed new one waits its grace', async () => {
    const store = new PageStore(tempDir());
    const named = await store.put(pngBytes(10, 10, 1), 'a.png');
    const fresh = await store.put(pngBytes(10, 10, 2), 'b.png');
    if (!named.ok || !fresh.ok) throw new Error('put');
    store.markNamed([named.page.sha256]);
    expect(await store.sweep(new Set())).toBe(1); // the named one, now named by nobody
    expect(store.get(named.page.sha256)).toBeUndefined();
    expect(store.get(fresh.page.sha256)).toBeDefined(); // still waiting for its list
    // Past the grace, an unnamed page goes too — and after a restart nothing is recent.
    expect(await store.sweep(new Set(), Date.now() + 31 * 60_000)).toBe(1);
    expect(fs.readdirSync(dir!)).toHaveLength(0);
  });
});

describe('R-100 — where a page turn lands', () => {
  it('🔴 a book stops at its ends; a wrapping list wraps both ways; Go to clamps', () => {
    expect(pageTarget(299, 300, false, 'next')).toBe(299);
    expect(pageTarget(0, 300, false, 'previous')).toBe(0);
    expect(pageTarget(299, 300, true, 'next')).toBe(0);
    expect(pageTarget(0, 300, true, 'previous')).toBe(299);
    expect(pageTarget(4, 300, false, 12)).toBe(11);
    expect(pageTarget(4, 300, false, 999)).toBe(299);
    expect(pageTarget(4, 300, false, 'next')).toBe(5);
  });

  it('a page list value is read one ref per item, so indices stay aligned', () => {
    const sha = 'f'.repeat(64);
    expect(
      pageRefsOf([
        { id: '1', kind: 'image', media: sha, name: 'p1.png' },
        { id: '2', text: 'not a page' },
        { id: '3', kind: 'image', assetId: 'a3' },
        { id: '4', kind: 'image', media: 'not-a-hash' },
      ]),
    ).toEqual([{ media: sha, name: 'p1.png' }, {}, { assetId: 'a3' }, {}]);
  });
});
