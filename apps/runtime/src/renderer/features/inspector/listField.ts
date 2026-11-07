import {
  fieldOperatorEditable,
  type FieldValue,
  type ListItem,
  type ListItemField,
} from '@cg/shared-schema';

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

/**
 * A structured workbook/CSV does not carry the Repeater editor's private row identities.
 * Parsing therefore assigns deterministic `file-N` ids, but those ids are not operator data:
 * replacing an otherwise identical applied row's id would make the Inspector report a draft
 * before the operator changed anything.
 *
 * Preserve the current identity by position wherever one exists. New file rows keep their
 * parsed id, with a collision-safe suffix for the unusual case where an authored id already
 * uses that spelling. This is shared by direct Repeaters and Repeaters paged by a Sequence so
 * the two file-input paths cannot disagree about whether unchanged data is dirty.
 */
export function withStableListItemIds(
  current: readonly ListItem[],
  loaded: readonly ListItem[],
): ListItem[] {
  const used = new Set<string>();
  return loaded.map((row, index) => {
    const existingId = current[index]?.id;
    let id = existingId !== undefined && !used.has(existingId) ? existingId : row.id;
    if (used.has(id)) {
      const stem = row.id;
      let suffix = index + 1;
      do {
        id = `${stem}-${String(suffix)}`;
        suffix += 1;
      } while (used.has(id));
    }
    used.add(id);
    return id === row.id ? row : { ...row, id };
  });
}

/** Keep author-locked Repeater columns unchanged when CG Control loads/reloads a workbook. */
export function preserveLockedListItemFields(
  current: readonly ListItem[],
  loaded: readonly ListItem[],
  fields: readonly ListItemField[] | undefined,
): ListItem[] {
  const locked = (fields ?? []).filter((field) => !fieldOperatorEditable(field));
  if (locked.length === 0) return [...loaded];
  if (current.length !== loaded.length) {
    throw new Error(
      `This template has locked columns, so the workbook must keep exactly ${String(current.length)} rows; found ${String(loaded.length)}.`,
    );
  }
  return loaded.map((row, index) => {
    const previous = current[index];
    const next: Record<string, unknown> = { ...row };
    for (const field of locked) {
      const authored = previous?.[field.id];
      if (authored !== undefined) {
        next[field.id] = authored;
      } else {
        throw new Error(`Locked column “${field.label || field.id}” has no authored row value.`);
      }
    }
    return next as ListItem;
  });
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

/** Which edge of the hovered item a drag would land on. */
export type DropEdge = 'before' | 'after';

/**
 * The index `from` must move to so it lands on `edge` of item `over` — the whole of
 * the drag-reorder arithmetic, kept pure and out of the component so it can be
 * tested without a DOM (native drag events are not synthesizable in jsdom).
 *
 * The correction exists because {@link moveItem} REMOVES before it inserts: once the
 * dragged item is lifted out, every index above it shifts down by one, so a raw
 * "drop before item 3" would insert one slot too high whenever the item came from
 * below that point.
 */
export function dropTargetIndex(from: number, over: number, edge: DropEdge): number {
  if (edge === 'before') return from < over ? over - 1 : over;
  return from > over ? over + 1 : over;
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
