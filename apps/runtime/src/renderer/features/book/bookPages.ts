import { naturalCompare } from '@cg/text-shaping';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.6 — **A BOOK'S PAGES, as CG Control edits them: pictures and TEXT pages.**
 *
 * The owner's decision: a sequence of pictures and text pages is still a book. A picture page names
 * its picture (`media`, an operator's; `assetId`, the author's); a text page is `{ id, text }` and
 * travels as text — never as a picture. Pure, so the Inspector's `Load pages…` and `Manage pages…`
 * apply the same rules.
 */

export interface PicturePage {
  readonly id: string;
  readonly kind: 'image';
  readonly media?: string;
  readonly assetId?: string;
  readonly name?: string;
}

export interface TextPage {
  readonly id: string;
  readonly kind?: 'text';
  readonly text: string;
}

export type BookPage = PicturePage | TextPage;

export function isPicturePage(item: unknown): item is PicturePage {
  return typeof item === 'object' && item !== null && (item as { kind?: unknown }).kind === 'image';
}

export function isTextPage(item: unknown): item is TextPage {
  if (typeof item !== 'object' || item === null) return false;
  const o = item as { kind?: unknown; text?: unknown };
  return (o.kind === undefined || o.kind === 'text') && typeof o.text === 'string';
}

/** A book value's pages, defensively: anything that is neither a picture nor a text page is dropped. */
export function bookPagesOf(raw: unknown): BookPage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((i): i is BookPage => isPicturePage(i) || isTextPage(i));
}

/**
 * 🔴 **A LOAD IN THE BOOK BLOCK (`Pictures…`, `Folder…`, a drop) AND `Replace with folder…` REPLACE THE
 * PICTURE PAGES ONLY.** Each text page keeps
 * its place after the picture it followed (the text pages before the first picture stay first); when
 * the new pictures are fewer, the text pages that followed a picture past their end move to the end,
 * in their order. The result is what Update sends — `Manage pages…` shows it before.
 */
export function withPicturesReplaced(
  current: readonly BookPage[],
  pictures: readonly PicturePage[],
): BookPage[] {
  /** Text pages by the number of pictures before them. */
  const after = new Map<number, TextPage[]>();
  let seen = 0;
  for (const page of current) {
    if (isPicturePage(page)) {
      seen += 1;
      continue;
    }
    const list = after.get(seen) ?? [];
    list.push(page);
    after.set(seen, list);
  }
  const out: BookPage[] = [...(after.get(0) ?? [])];
  pictures.forEach((picture, i) => {
    out.push(picture);
    out.push(...(after.get(i + 1) ?? []));
  });
  for (const [n, pages] of [...after].sort(([a], [b]) => a - b)) {
    if (n > pictures.length) out.push(...pages);
  }
  return out;
}

/**
 * `RUN-NEXT-VERSION-03` 1.5 — **Sort by name**: the pictures in natural order of their file names
 * (`MRN (2)` before `MRN (10)`), each text page keeping its PLACE — the Designer's own rule for a mixed
 * sequence (`sortPicturesByName`), so the two apps sort one book the same way.
 */
export function withPicturesSortedByName(pages: readonly BookPage[]): BookPage[] {
  const sorted = pages
    .filter(isPicturePage)
    .sort((a, b) => naturalCompare(pictureFileName(a.name), pictureFileName(b.name)));
  let next = 0;
  return pages.map((p) => (isPicturePage(p) ? (sorted[next++] ?? p) : p));
}

function pictureFileName(name: string | undefined): string {
  if (name === undefined) return '';
  const slash = name.lastIndexOf('/');
  return slash < 0 ? name : name.slice(slash + 1);
}

/**
 * `RUN-NEXT-VERSION-03` 1.5 — pictures APPENDED to a book (`Add pictures…`, `Add folder…`), their ids made
 * unique among the pages already there: an id is how the bridge follows the page on screen through an
 * edit (`pageAfterBookChange`), so two pages may never share one.
 */
export function withUniqueIds(
  existing: readonly BookPage[],
  added: readonly PicturePage[],
): PicturePage[] {
  const taken = new Set(existing.map((p) => p.id));
  return added.map((p) => {
    let id = p.id;
    for (let n = 2; taken.has(id); n += 1) id = `${p.id}~${String(n)}`;
    taken.add(id);
    return id === p.id ? p : { ...p, id };
  });
}

/** Move the page `from` to just before the page now at `to` (both 0-based); `to === length` appends. */
export function movePage(pages: readonly BookPage[], from: number, to: number): BookPage[] {
  if (from < 0 || from >= pages.length) return [...pages];
  const out = [...pages];
  const [moved] = out.splice(from, 1);
  if (moved === undefined) return [...pages];
  const at = Math.max(0, Math.min(out.length, to > from ? to - 1 : to));
  out.splice(at, 0, moved);
  return out;
}

/** A fresh text page's id: unique among `taken`. */
export function freshTextPageId(taken: readonly BookPage[]): string {
  const ids = new Set(taken.map((p) => p.id));
  for (let n = 1; ; n += 1) {
    const id = `text-${String(n)}`;
    if (!ids.has(id)) return id;
  }
}

/**
 * 🔴 `RUN-NEXT-VERSION-03` delta A — **THE STRIP'S PAGES: up to three that EXIST, around the current one.**
 * The owner (2026-10-22): on page 1 the strip showed an empty box where no page before it exists. The
 * window (0-based indices) is the page before, the current page and the page after where all three exist;
 * on the first page it is pages 1–3, on the last page the last three, and a one- or two-page book shows
 * only its own pages. `current` is clamped by the caller. NOT the Designer's `stripWindow` (its card keeps
 * the first items and slides only past its end): a different rule for a different surface, so a
 * different name.
 */
export function pagesAroundCurrent(count: number, current: number): number[] {
  const shown = Math.min(3, Math.max(0, count));
  const start = Math.min(Math.max(0, current - 1), count - shown);
  return Array.from({ length: shown }, (_, i) => start + i);
}
