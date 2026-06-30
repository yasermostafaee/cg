import { describe, expect, it } from 'vitest';
import type { ListItem } from '@cg/shared-schema';
import {
  addItem,
  itemText,
  moveItem,
  removeItem,
  setItemText,
  toListItems,
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
