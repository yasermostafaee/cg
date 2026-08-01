import { describe, expect, it } from 'vitest';
import type { ListItem } from '@cg/shared-schema';
import {
  addItem,
  dropTargetIndex,
  itemText,
  moveItem,
  removeItem,
  setItemText,
  toListItems,
  type DropEdge,
} from '../src/renderer/features/inspector/listField.js';

/**
 * B-040 — the Runtime Inspector's list-field editing logic. The defect was that a
 * `list` (array) value hit the default text input → `String(array)` →
 * "[object Object]". These prove the value stays a STRUCTURED array end-to-end and
 * is never `String()`-coerced.
 */

const seed: ListItem[] = [
  { id: 'a', text: 'سلام', kind: 'text' },
  { id: 'b', text: 'اخبار', dwellMs: 4000 },
];

describe('toListItems — never String()-coerces an array', () => {
  it('passes a real array through', () => {
    expect(toListItems(seed)).toEqual(seed);
  });

  it('returns [] for a non-array (undefined, string, object) — not "[object Object]"', () => {
    expect(toListItems(undefined)).toEqual([]);
    // the exact legacy corruption must NOT round-trip back into items
    expect(toListItems('[object Object],[object Object]' as never)).toEqual([]);
    expect(toListItems({ assetId: 'x' } as never)).toEqual([]);
    expect(toListItems(42 as never)).toEqual([]);
  });
});

describe('itemText', () => {
  it('reads the item text, falling back to "" for a non-string', () => {
    expect(itemText({ id: 'a', text: 'hi' })).toBe('hi');
    expect(itemText({ id: 'a' } as ListItem)).toBe('');
  });
});

describe('edits preserve structure (id + unknown fields) and return arrays', () => {
  it('setItemText changes only text, keeping id + other fields', () => {
    const next = setItemText(seed, 0, 'درود');
    expect(next[0]).toEqual({ id: 'a', text: 'درود', kind: 'text' });
    expect(next[1]).toEqual(seed[1]); // untouched, incl. dwellMs
    expect(Array.isArray(next)).toBe(true);
  });

  it('addItem appends a new {id, text} without touching others', () => {
    const next = addItem(seed, 'c');
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ id: 'c', text: '' });
    expect(next.slice(0, 2)).toEqual(seed);
  });

  it('removeItem drops the indexed item', () => {
    expect(removeItem(seed, 0)).toEqual([seed[1]]);
  });

  it('moveItem reorders; out-of-range is an unchanged copy', () => {
    expect(moveItem(seed, 0, 1).map((i) => i.id)).toEqual(['b', 'a']);
    expect(moveItem(seed, 0, 5)).toEqual(seed);
    expect(moveItem(seed, -1, 0)).toEqual(seed);
  });

  it('a committed value serializes as a JSON ARRAY of objects, never "[object Object]"', () => {
    const committed = setItemText(addItem(seed, 'c'), 2, 'تازه');
    const json = JSON.stringify(committed);
    expect(json.startsWith('[')).toBe(true);
    expect(json).not.toContain('[object Object]');
    expect(JSON.parse(json)).toHaveLength(3);
    // Persian survives intact in the structured payload.
    expect(JSON.parse(json)[2]).toEqual({ id: 'c', text: 'تازه' });
  });
});

describe('multi-line item text is never flattened (2026-07-07 live finding)', () => {
  const twoLines = 'Now: خط یک\nخط دوم';

  it('setItemText preserves a newline in the text (id + other fields intact)', () => {
    const next = setItemText(seed, 0, twoLines);
    expect(next[0]).toEqual({ id: 'a', text: twoLines, kind: 'text' });
    expect(itemText(next[0] as ListItem)).toBe(twoLines);
  });

  it('toListItems passes multi-line items through untouched', () => {
    const items: ListItem[] = [{ id: 'x', text: 'یک\nدو\nسه' }];
    expect(toListItems(items)).toEqual(items);
  });

  it('a committed multi-line item round-trips through JSON with the newline intact', () => {
    const committed = setItemText(seed, 1, twoLines);
    const parsed = JSON.parse(JSON.stringify(committed)) as ListItem[];
    // The JSON layer escapes the newline (\n, two chars) and restores it byte-exact —
    // the payload never carries a flattened/joined string.
    expect(parsed[1]).toEqual({ id: 'b', text: twoLines, dwellMs: 4000 });
    expect((parsed[1] as { text: string }).text).toContain('\n');
  });
});

/**
 * dev-r028-b4 item 3 — drag-to-reorder. The pointer half cannot be exercised in
 * jsdom (native drag events are not synthesizable), so the whole of the reorder
 * ARITHMETIC lives in `dropTargetIndex` and is proved here. The component only
 * decides which edge the pointer is nearest.
 *
 * The correction under test: `moveItem` removes before it inserts, so every index
 * above the lifted item shifts down by one. An uncorrected "drop before item N"
 * therefore lands one slot too high whenever the item came from BELOW N.
 */
describe('dropTargetIndex — drag-reorder arithmetic', () => {
  const abc: ListItem[] = [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ];
  const order = (from: number, over: number, edge: DropEdge): string[] =>
    moveItem(abc, from, dropTargetIndex(from, over, edge)).map((i) => itemText(i));

  it('drags DOWN onto a later row (the case the shift correction exists for)', () => {
    expect(order(0, 1, 'after')).toEqual(['B', 'A', 'C']);
    expect(order(0, 2, 'before')).toEqual(['B', 'A', 'C']);
    expect(order(0, 2, 'after')).toEqual(['B', 'C', 'A']);
  });

  it('drags UP onto an earlier row', () => {
    expect(order(2, 1, 'before')).toEqual(['A', 'C', 'B']);
    expect(order(2, 0, 'after')).toEqual(['A', 'C', 'B']);
    expect(order(2, 0, 'before')).toEqual(['C', 'A', 'B']);
  });

  it('dropping on EITHER edge of the dragged row itself is a no-op, not a shuffle', () => {
    expect(order(1, 1, 'before')).toEqual(['A', 'B', 'C']);
    expect(order(1, 1, 'after')).toEqual(['A', 'B', 'C']);
  });

  it('never loses, duplicates or mutates an item — the drag only reorders', () => {
    for (const from of [0, 1, 2]) {
      for (const over of [0, 1, 2]) {
        for (const edge of ['before', 'after'] as DropEdge[]) {
          const next = moveItem(abc, from, dropTargetIndex(from, over, edge));
          expect(next).toHaveLength(3);
          expect([...next].sort((x, y) => x.id.localeCompare(y.id))).toEqual(abc);
        }
      }
    }
  });
});
