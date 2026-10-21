import { describe, expect, it } from 'vitest';
import {
  bookPagesOf,
  freshTextPageId,
  movePage,
  withPicturesReplaced,
  withPicturesSortedByName,
  withUniqueIds,
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

  it('🔴 1.5 — Sort by name: natural order (MRN (2) before MRN (10)); text pages keep their places', () => {
    const named = (n: number, name: string): PicturePage => ({ ...pic(n), name });
    const sorted = withPicturesSortedByName([
      named(1, 'IN/MRN (10).jpg'),
      txt('note'),
      named(2, 'IN/MRN (2).jpg'),
      named(3, 'IN/MRN (1).jpg'),
    ]);
    expect(ids(sorted)).toEqual(['p3', 't-note', 'p2', 'p1']);
  });

  it('1.5 — appended pictures never share an id with a page already there; a move lands where it is dropped', () => {
    const added = withUniqueIds([pic(1), pic(2)], [pic(2), pic(3)]);
    expect(added.map((p) => p.id)).toEqual(['p2~2', 'p3']);
    const pages = [pic(1), pic(2), pic(3), pic(4)];
    expect(ids(movePage(pages, 3, 0))).toEqual(['p4', 'p1', 'p2', 'p3']);
    expect(ids(movePage(pages, 0, 2))).toEqual(['p2', 'p1', 'p3', 'p4']);
    expect(ids(movePage(pages, 1, 4))).toEqual(['p1', 'p3', 'p4', 'p2']);
  });

  it('a value is read defensively; a fresh text page id is unique', () => {
    expect(bookPagesOf([pic(1), { id: 'c', kind: 'composition' }, txt('a'), 3])).toHaveLength(2);
    expect(freshTextPageId([{ id: 'text-1', text: '' }, pic(1)])).toBe('text-2');
  });
});
