import { describe, expect, it } from 'vitest';
import type { SequenceItem } from '@cg/shared-schema';
import {
  itemLabel,
  moveItems,
  removeItems,
  sortPicturesByName,
  stepItem,
} from '../src/renderer/features/inspector/pageItems.js';

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
