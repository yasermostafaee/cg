import { describe, expect, it } from 'vitest';
import type { SequenceItem } from '@cg/shared-schema';
import {
  itemCountText,
  itemLabel,
  moveItems,
  removeItems,
  sortPicturesByName,
  stepItem,
  stripWindow,
} from '../src/renderer/features/inspector/pageItems.js';
import { shownItemIndex } from '../src/renderer/state/slices/view.js';

/** `D-163` — the Pages manager's edits, as pure functions over a sequence's items. */

const page = (n: number, name = `page${String(n)}.png`): SequenceItem => ({
  id: `p${String(n)}`,
  kind: 'image',
  assetId: `a${String(n)}`,
  name,
});
const ids = (items: readonly SequenceItem[]): string[] => items.map((i) => i.id);
const book = [1, 2, 3, 4, 5].map((n) => page(n));

describe('D-163 — moving pages', () => {
  it('🔴 a page dropped before another lands there; the rest keep their order', () => {
    expect(ids(moveItems(book, new Set(['p4']), 1))).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
    expect(ids(moveItems(book, new Set(['p1']), 5))).toEqual(['p2', 'p3', 'p4', 'p5', 'p1']);
  });

  it('🔴 several selected pages move together, in their own order', () => {
    expect(ids(moveItems(book, new Set(['p5', 'p2']), 0))).toEqual(['p2', 'p5', 'p1', 'p3', 'p4']);
  });

  it('dropping a page on itself changes nothing', () => {
    expect(ids(moveItems(book, new Set(['p3']), 2))).toEqual(ids(book));
    expect(ids(moveItems(book, new Set(['p3']), 3))).toEqual(ids(book));
  });

  it('one step earlier or later; the ends stay put', () => {
    expect(ids(stepItem(book, 'p3', -1))).toEqual(['p1', 'p3', 'p2', 'p4', 'p5']);
    expect(ids(stepItem(book, 'p3', 1))).toEqual(['p1', 'p2', 'p4', 'p3', 'p5']);
    expect(ids(stepItem(book, 'p1', -1))).toEqual(ids(book));
    expect(ids(stepItem(book, 'p5', 1))).toEqual(ids(book));
  });
});

describe('D-163 — removing and sorting pages', () => {
  it('removes exactly the selected pages', () => {
    expect(ids(removeItems(book, new Set(['p2', 'p4'])))).toEqual(['p1', 'p3', 'p5']);
  });

  it('🔴 sorts pictures in NATURAL name order — page2 before page10, Persian digits as numbers', () => {
    const shuffled = [page(1, 'page10.png'), page(2, 'page2.png'), page(3, 'page1.png')];
    expect(sortPicturesByName(shuffled).map(itemLabel)).toEqual([
      'page1.png',
      'page2.png',
      'page10.png',
    ]);
    const persian = [page(1, 'برگ ۱۰.png'), page(2, 'برگ ۲.png')];
    expect(sortPicturesByName(persian).map(itemLabel)).toEqual(['برگ ۲.png', 'برگ ۱۰.png']);
  });

  it('a text item in a mixed sequence keeps its place while the pictures sort around it', () => {
    const text: SequenceItem = { id: 't', text: 'سرخط' };
    const mixed = [page(1, 'b.png'), text, page(2, 'a.png')];
    expect(ids(sortPicturesByName(mixed))).toEqual(['p2', 't', 'p1']);
    expect(itemLabel(text)).toBe('سرخط');
  });
});

/*
  `RUN-NEXT-VERSION-03` 1.7 — `Add text` showed nothing: the card counted pictures only and drew the
  first four pictures, so a text page added at the end changed neither. Now the count is every page of a
  book (its text pages too — 1.6), and the strip holds the item the author is working on.
*/
describe('1.7 — the card counts every page and its strip holds the item being worked on', () => {
  const text = (id: string): SequenceItem => ({ id, text: '' });

  it('🔴 a book counts its text pages; a composition item makes it items; one wording', () => {
    expect(itemCountText([page(1), page(2)])).toBe('2 pages');
    expect(itemCountText([page(1), page(2), text('t')])).toBe('3 pages');
    expect(itemCountText([page(1)])).toBe('1 page');
    const comp: SequenceItem = { id: 'c', kind: 'composition', compositionId: 'logo' };
    expect(itemCountText([page(1), text('t'), comp])).toBe('3 items');
    expect(itemCountText([text('a')])).toBe('1 item');
  });

  it('🔴 the strip starts at page 1, and moves to hold the item being worked on', () => {
    expect(stripWindow(6, null, 4)).toEqual({ from: 0, to: 4 });
    expect(stripWindow(6, 2, 4)).toEqual({ from: 0, to: 4 });
    // The sixth page — the one just added — is in the strip: two before it, none after.
    expect(stripWindow(6, 5, 4)).toEqual({ from: 2, to: 6 });
    // Mid-book: two before, one after.
    expect(stripWindow(10, 6, 4)).toEqual({ from: 4, to: 8 });
    expect(stripWindow(2, 1, 4)).toEqual({ from: 0, to: 2 });
  });

  it('🔴 the item being worked on: only while its sequence is the one selected, only while it exists', () => {
    const items = [page(1), text('t')];
    const focus = { elementId: 'seq', itemId: 't' };
    expect(
      shownItemIndex({ sequenceItemFocus: focus, selection: new Set(['seq']) }, 'seq', items),
    ).toBe(1);
    // Undo clears the selection; a second element joins it; another sequence asks.
    expect(
      shownItemIndex({ sequenceItemFocus: focus, selection: new Set() }, 'seq', items),
    ).toBeNull();
    expect(
      shownItemIndex({ sequenceItemFocus: focus, selection: new Set(['seq', 'x']) }, 'seq', items),
    ).toBeNull();
    expect(
      shownItemIndex({ sequenceItemFocus: focus, selection: new Set(['x']) }, 'x', items),
    ).toBeNull();
    // The item is gone (undone, removed): the sequence rests on page 1.
    expect(
      shownItemIndex({ sequenceItemFocus: focus, selection: new Set(['seq']) }, 'seq', [page(1)]),
    ).toBeNull();
  });
});
