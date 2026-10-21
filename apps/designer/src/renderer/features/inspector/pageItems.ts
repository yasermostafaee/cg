import { sequenceItemsBinding, type SequenceImageItem, type SequenceItem } from '@cg/shared-schema';
import { naturalCompare } from '@cg/text-shaping';

/**
 * `D-163` — the edits the Pages manager makes on a sequence's items, as pure functions. Each
 * returns a NEW array; the caller commits it with ONE store edit, so one gesture is one undo step.
 */

export const isPicture = (item: SequenceItem): item is SequenceImageItem => item.kind === 'image';

/**
 * Move the items whose ids are in `ids` — keeping their own order — so they land before the item
 * now at `toIndex` (`items.length` = the end). Moving a selection onto itself changes nothing.
 */
export function moveItems(
  items: readonly SequenceItem[],
  ids: ReadonlySet<string>,
  toIndex: number,
): SequenceItem[] {
  const moving = items.filter((i) => ids.has(i.id));
  if (moving.length === 0) return [...items];
  const at = Math.max(0, Math.min(toIndex, items.length));
  // The insertion point, counted among the items that stay.
  const before = items.slice(0, at).filter((i) => !ids.has(i.id)).length;
  const staying = items.filter((i) => !ids.has(i.id));
  return [...staying.slice(0, before), ...moving, ...staying.slice(before)];
}

/** One step earlier (`-1`) or later (`1`) — the keyboard's and the buttons' move. */
export function stepItem(items: readonly SequenceItem[], id: string, by: -1 | 1): SequenceItem[] {
  const out = [...items];
  const i = out.findIndex((item) => item.id === id);
  const a = out[i];
  const b = out[i + by];
  if (i < 0 || a === undefined || b === undefined) return out;
  out[i] = b;
  out[i + by] = a;
  return out;
}

export function removeItems(
  items: readonly SequenceItem[],
  ids: ReadonlySet<string>,
): SequenceItem[] {
  return items.filter((i) => !ids.has(i.id));
}

/**
 * The pictures in natural file-name order (`page2` before `page10`, in any digit set), in the
 * places pictures already hold — a text or composition item stays exactly where it is.
 */
export function sortPicturesByName(items: readonly SequenceItem[]): SequenceItem[] {
  const pictures = items
    .filter(isPicture)
    .sort((a, b) => naturalCompare(a.name ?? '', b.name ?? ''));
  let next = 0;
  return items.map((item) => {
    if (!isPicture(item)) return item;
    const sorted = pictures[next];
    next += 1;
    return sorted ?? item;
  });
}

/**
 * `RUN-NEXT-VERSION-03` 1.7 — what one of a sequence's items is called: a `page` of a book (its
 * pictures AND its text pages — 1.6, the schema's one rule, `sequenceItemsBinding`), an `item` of
 * anything else (a sequence with a composition item, a text rotation).
 */
export function itemWord(items: readonly SequenceItem[]): 'page' | 'item' {
  return sequenceItemsBinding(items) === 'pages' ? 'page' : 'item';
}

/** `3 pages` / `1 item` — the Inspector card's count and the Pages manager's, one wording. */
export function itemCountText(items: readonly SequenceItem[]): string {
  const n = items.length;
  return `${String(n)} ${itemWord(items)}${n === 1 ? '' : 's'}`;
}

/**
 * `RUN-NEXT-VERSION-03` 1.7 — the items the Inspector card's strip draws: `size` of them from the
 * start, or — when the author is working on an item past them — a window that holds it (two before
 * it, one after, where there are). `[from, to)`.
 */
export function stripWindow(
  count: number,
  focus: number | null,
  size: number,
): { from: number; to: number } {
  const span = Math.min(count, size);
  if (focus === null || focus < span) return { from: 0, to: span };
  const from = Math.max(0, Math.min(focus - (size - 2), count - span));
  return { from, to: from + span };
}

/** The words a page's card shows: a picture's file name, a text item's text. */
export function itemLabel(item: SequenceItem): string {
  if (isPicture(item)) return item.name ?? 'Picture';
  if ('text' in item) return item.text;
  return 'Composition';
}
