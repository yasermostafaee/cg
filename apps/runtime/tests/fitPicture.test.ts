import { describe, expect, it } from 'vitest';
import { PAGE_MAX_BYTES } from '@cg/shared-ipc';
import { fitInside, fitLine, fitNeeded } from '../src/renderer/features/book/fitPicture.js';
import { notLoadedLine } from '../src/renderer/features/book/loadPictures.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.2 — a page is FITTED, not refused: the rules, without a browser. The
 * decode and the encode are the browser's and are proved by `book-fit.spec.ts` in Chrome.
 */

const HD = { width: 1920, height: 1080 };
const probe = (width: number, height: number) => ({ mime: 'image/jpeg' as const, width, height });

describe('1.2 — what a picture needs', () => {
  it('larger than the frame on either side → resized; within it and over the cap → re-encoded; else nothing', () => {
    expect(fitNeeded(probe(6000, 4000), 9_000_000, HD)).toBe('resize');
    expect(fitNeeded(probe(1080, 1920), 500_000, HD)).toBe('resize');
    expect(fitNeeded(probe(1600, 900), PAGE_MAX_BYTES + 1, HD)).toBe('reencode');
    expect(fitNeeded(probe(1920, 1080), PAGE_MAX_BYTES, HD)).toBe('none');
  });

  it('fits INSIDE the frame, the aspect kept, never upscaled', () => {
    expect(fitInside(6000, 4000, HD)).toEqual({ width: 1620, height: 1080 });
    expect(fitInside(4000, 1000, HD)).toEqual({ width: 1920, height: 480 });
    expect(fitInside(1080, 1920, HD)).toEqual({ width: 608, height: 1080 });
    expect(fitInside(640, 360, HD)).toEqual({ width: 640, height: 360 });
  });
});

describe('1.2 — the lines it says', () => {
  it('one line for what fitting did; none when nothing changed', () => {
    expect(fitLine(12, 0, HD)).toBe('12 pictures were resized to fit 1920×1080');
    expect(fitLine(1, 1, HD)).toBe(
      '1 picture was resized to fit 1920×1080 · 1 picture was made smaller than 4 MB',
    );
    expect(fitLine(0, 0, HD)).toBeNull();
  });

  it('the pictures that did not load, by name', () => {
    expect(notLoadedLine(['scan.png'], [])).toBe(
      'scan.png could not be made smaller than 4 MB and was not loaded.',
    );
    expect(notLoadedLine(['a.png', 'b.png'], ['notes.png'])).toBe(
      'a.png, b.png could not be made smaller than 4 MB and were not loaded. notes.png is not a PNG, JPEG or WebP picture.',
    );
    expect(notLoadedLine([], [])).toBeNull();
  });
});
