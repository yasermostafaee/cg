import { describe, expect, it } from 'vitest';
import {
  bookPagesOf,
  freshTextPageId,
  withPicturesReplaced,
  type BookPage,
  type PicturePage,
} from '../src/renderer/features/book/bookPages.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.6 — a book with TEXT pages stays a book, and `Load folder…` /
 * `Replace with folder…` replace the PICTURE pages only: each text page keeps its place after the
 * picture it followed; past the new folder's end, it moves to the end.
 */

const pic = (n: number): PicturePage => ({
  id: `p${String(n)}`,
  kind: 'image',
  media: String(n).padStart(64, '0'),
});
const txt = (s: string): BookPage => ({ id: `t-${s}`, text: s });
const ids = (pages: readonly BookPage[]): string[] => pages.map((p) => p.id);

describe('1.6 — replace the pictures, keep the text pages in place', () => {
  it('🔴 a text page stays after the picture it followed', () => {
    const current = [pic(1), txt('a'), pic(2), pic(3), txt('b')];
    const next = withPicturesReplaced(current, [pic(11), pic(12), pic(13)]);
    expect(ids(next)).toEqual(['p11', 't-a', 'p12', 'p13', 't-b']);
  });

  it('text before the first picture stays first', () => {
    expect(ids(withPicturesReplaced([txt('intro'), pic(1)], [pic(9)]))).toEqual(['t-intro', 'p9']);
  });

  it('🔴 a shorter folder: the text pages past its end move to the end, in their order', () => {
    const current = [pic(1), pic(2), txt('x'), pic(3), txt('y'), pic(4), txt('z')];
    expect(ids(withPicturesReplaced(current, [pic(21), pic(22)]))).toEqual([
      'p21',
      'p22',
      't-x',
      't-y',
      't-z',
    ]);
  });

  it('a longer folder adds pictures after the last text page’s anchor', () => {
    expect(ids(withPicturesReplaced([pic(1), txt('a')], [pic(5), pic(6), pic(7)]))).toEqual([
      'p5',
      't-a',
      'p6',
      'p7',
    ]);
  });

  it('a value is read defensively; a fresh text page id is unique', () => {
    expect(bookPagesOf([pic(1), { id: 'c', kind: 'composition' }, txt('a'), 3])).toHaveLength(2);
    expect(freshTextPageId([{ id: 'text-1', text: '' }, pic(1)])).toBe('text-2');
  });
});
