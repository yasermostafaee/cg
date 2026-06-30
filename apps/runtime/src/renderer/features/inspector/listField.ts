import type { FieldValue, ListItem } from '@cg/shared-schema';

/**
 * B-040 — pure transforms for the operator Inspector's `list`-field editor. Kept
 * React-free (and JSX-free) so they unit-test in the node env. Every transform
 * preserves each item's stable `id` and any other (unknown) fields per the
 * extensible `ListItem` shape, and ALWAYS returns a structured array — a list value
 * is never `String()`-coerced (the exact B-040 defect: `String([{…}])` →
 * `"[object Object]"`).
 */

/** The item's `text` for display ('' when absent / non-string). Never coerces the item. */
export function itemText(item: ListItem): string {
  const t = (item as Record<string, unknown>).text;
  return typeof t === 'string' ? t : '';
}

/**
 * Coerce a field value to a structured `ListItem[]` for the editor. An array passes
 * through; anything else — undefined, or a legacy stringified `"[object Object]"`
 * value — yields `[]`. We NEVER turn an array into a text string.
 */
export function toListItems(value: FieldValue | undefined): ListItem[] {
  return Array.isArray(value) ? (value as ListItem[]) : [];
}

/** Set the item at `index`'s `text`, preserving its `id` + every other field. */
export function setItemText(items: readonly ListItem[], index: number, text: string): ListItem[] {
  return items.map((it, i) => (i === index ? { ...it, text } : it));
}

/** Append a new text item with the given stable `id`. */
export function addItem(items: readonly ListItem[], id: string): ListItem[] {
  return [...items, { id, text: '' }];
}

/** Remove the item at `index`. */
export function removeItem(items: readonly ListItem[], index: number): ListItem[] {
  return items.filter((_, i) => i !== index);
}

/** Move the item at `from` to `to` (out-of-range → an unchanged copy). */
export function moveItem(items: readonly ListItem[], from: number, to: number): ListItem[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...items];
  next.splice(to, 0, moved);
  return next;
}
