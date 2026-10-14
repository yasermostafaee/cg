import { describe, expect, it } from 'vitest';
import {
  PAGE_MAX_BYTES,
  pageRefsOf,
  pageRefusalMessage,
  pageTarget,
  probeImage,
} from '../src/index.js';

/**
 * `R-100` — a book's pure rules, tested where they live (coverage is per package): what a picture
 * is from its bytes, where a page turn lands, how a page-list value reads, and the refusal words.
 * CG Bridge, CG Control's test-mode runtime and the console's pre-check all call these.
 */

const be32 = (n: number): number[] => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
const be16 = (n: number): number[] => [(n >>> 8) & 255, n & 255];
const le16 = (n: number): number[] => [n & 255, (n >>> 8) & 255];
const le24 = (n: number): number[] => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const text = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

function png(w: number, h: number): Uint8Array {
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be32(13),
    ...text('IHDR'),
    ...be32(w),
    ...be32(h),
    8,
    2,
    0,
    0,
    0,
  ]);
}

/** SOI, an APP0 segment, optional fill byte and RST marker, then SOF0 with the size. */
function jpeg(w: number, h: number, extras = false): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...be16(16),
    ...new Array<number>(14).fill(0),
    ...(extras ? [0xff, 0xd0, 0xff] : []),
    0xff,
    0xc0,
    ...be16(17),
    8,
    ...be16(h),
    ...be16(w),
    3,
    ...new Array<number>(12).fill(0),
  ]);
}

function webp(chunk: 'VP8 ' | 'VP8L' | 'VP8X', w: number, h: number): Uint8Array {
  const head = [...text('RIFF'), ...be32(0), ...text('WEBP'), ...text(chunk), ...be32(0)];
  let body: number[];
  if (chunk === 'VP8 ') body = [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)];
  else if (chunk === 'VP8L') {
    const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
    body = [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255];
  } else body = [0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)];
  return Uint8Array.from([...head, ...body, ...new Array<number>(8).fill(0)]);
}

describe('R-100 — probeImage reads a picture from its own bytes', () => {
  it('🔴 PNG, JPEG and every WebP kind, with their size', () => {
    expect(probeImage(png(1920, 1080))).toEqual({ mime: 'image/png', width: 1920, height: 1080 });
    expect(probeImage(jpeg(640, 480))).toEqual({ mime: 'image/jpeg', width: 640, height: 480 });
    expect(probeImage(jpeg(800, 600, true))).toEqual({
      mime: 'image/jpeg',
      width: 800,
      height: 600,
    });
    expect(probeImage(webp('VP8 ', 320, 240))).toEqual({
      mime: 'image/webp',
      width: 320,
      height: 240,
    });
    expect(probeImage(webp('VP8L', 1024, 768))).toEqual({
      mime: 'image/webp',
      width: 1024,
      height: 768,
    });
    expect(probeImage(webp('VP8X', 3840, 2160))).toEqual({
      mime: 'image/webp',
      width: 3840,
      height: 2160,
    });
  });

  it('🔴 anything else is not a picture — whatever its name says', () => {
    expect(
      probeImage(Uint8Array.from(text('hello, this is plain text, not a picture'))),
    ).toBeNull();
    expect(probeImage(Uint8Array.from(text('GIF89a')))).toBeNull();
    expect(probeImage(png(1920, 1080).subarray(0, 20))).toBeNull(); // cut short
    expect(probeImage(png(0, 1080))).toBeNull(); // no width
    const noIhdr = png(10, 10);
    noIhdr[12] = 0x58;
    expect(probeImage(noIhdr)).toBeNull();
    const badVp8 = webp('VP8 ', 10, 10);
    badVp8[23] = 0;
    expect(probeImage(badVp8)).toBeNull();
    const badVp8l = webp('VP8L', 10, 10);
    badVp8l[20] = 0;
    expect(probeImage(badVp8l)).toBeNull();
    const otherChunk = webp('VP8X', 10, 10);
    otherChunk.set(text('ALPH'), 12);
    expect(probeImage(otherChunk)).toBeNull();
    // A JPEG whose segment chain breaks is refused, not guessed at.
    expect(
      probeImage(Uint8Array.from([0xff, 0xd8, 0x00, 0x00, ...new Array<number>(20).fill(0)])),
    ).toBeNull();
    expect(
      probeImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, ...new Array<number>(20).fill(0)])),
    ).toBeNull();
  });
});

describe('R-100 — pageTarget: where a page turn lands (0-based)', () => {
  it('🔴 a BOOK stops at its ends', () => {
    expect(pageTarget(0, 3, false, 'next')).toBe(1);
    expect(pageTarget(2, 3, false, 'next')).toBe(2);
    expect(pageTarget(1, 3, false, 'previous')).toBe(0);
    expect(pageTarget(0, 3, false, 'previous')).toBe(0);
  });

  it('a WRAPPING list goes round both ways', () => {
    expect(pageTarget(2, 3, true, 'next')).toBe(0);
    expect(pageTarget(0, 3, true, 'previous')).toBe(2);
  });

  it('Go to takes the operator’s 1-based number, clamped to the book', () => {
    expect(pageTarget(0, 300, false, 12)).toBe(11);
    expect(pageTarget(0, 300, false, 999)).toBe(299);
    expect(pageTarget(5, 300, false, 0)).toBe(0);
    expect(pageTarget(0, 300, false, 3.9)).toBe(2);
  });

  it('an empty book stays on 0, and a page past a shorter book is read as its last', () => {
    expect(pageTarget(7, 0, false, 'next')).toBe(0);
    expect(pageTarget(9, 3, false, 'previous')).toBe(1);
  });
});

describe('R-100 — pageRefsOf reads a page-list value defensively', () => {
  it('one ref per item, so indices stay aligned; only what is well-formed is kept', () => {
    const sha = 'a'.repeat(64);
    expect(
      pageRefsOf([
        { id: '1', kind: 'image', media: sha, name: 'page1.png' },
        { id: '2', kind: 'image', assetId: 'asset-2' },
        { id: '3', text: 'a text item' },
        { id: '4', kind: 'image', media: 'not-a-hash', name: 4 },
        null,
        'page',
      ]),
    ).toEqual([{ media: sha, name: 'page1.png' }, { assetId: 'asset-2' }, {}, {}, {}, {}]);
    expect(pageRefsOf('not a list')).toEqual([]);
    expect(pageRefsOf(undefined)).toEqual([]);
  });
});

describe('R-100 — the refusal words, one per code', () => {
  it('🔴 each names the file and the limit, in the operator’s words', () => {
    expect(pageRefusalMessage('page-not-a-picture', { name: 'notes.png' })).toBe(
      'notes.png is not a PNG, JPEG or WebP picture.',
    );
    expect(pageRefusalMessage('page-too-large', { name: 'scan.png', bytes: 6 * 1024 * 1024 })).toBe(
      `scan.png is 6.0 MB; a page may be at most ${(PAGE_MAX_BYTES / 1048576).toFixed(1)} MB.`,
    );
    expect(
      pageRefusalMessage('page-too-many-pixels', { name: 'pano.png', width: 5000, height: 2000 }),
    ).toBe(
      'pano.png is 5000 × 2000 pixels; a page may be at most 3840 × 2160 (and 4096 on a side).',
    );
    expect(pageRefusalMessage('page-too-many', { count: 501 })).toBe(
      '501 pages is more than a row can hold (500).',
    );
    expect(pageRefusalMessage('page-missing', { name: 'lost.png' })).toBe(
      'lost.png is not on CG Bridge any more. Load the pages again.',
    );
  });

  it('D-163 — a list the template turns by itself is refused in one sentence', () => {
    expect(pageRefusalMessage('page-not-stepped', {})).toBe(
      'This template turns these pages by itself; they are not turned from the console.',
    );
  });

  it('with no name, the sentence still reads', () => {
    expect(pageRefusalMessage('page-not-a-picture', {})).toBe(
      'This picture is not a PNG, JPEG or WebP picture.',
    );
    expect(pageRefusalMessage('page-too-large', {})).toMatch(/^This picture is 0\.0 MB/);
    expect(pageRefusalMessage('page-too-many-pixels', {})).toMatch(/^This picture is 0 × 0 pixels/);
    expect(pageRefusalMessage('page-too-many', {})).toMatch(/^0 pages/);
  });
});
