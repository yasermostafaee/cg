/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.6 — **A BOOK'S PAGES, as CG Control edits them: pictures and TEXT pages.**
 *
 * The owner's decision: a sequence of pictures and text pages is still a book. A picture page names
 * its picture (`media`, an operator's; `assetId`, the author's); a text page is `{ id, text }` and
 * travels as text — never as a picture. Pure, so the Inspector's `Load folder…` and `Manage pages…`
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
 * 🔴 **`Load folder…` AND `Replace with folder…` REPLACE THE PICTURE PAGES ONLY.** Each text page keeps
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

/** A fresh text page's id: unique among `taken`. */
export function freshTextPageId(taken: readonly BookPage[]): string {
  const ids = new Set(taken.map((p) => p.id));
  for (let n = 1; ; n += 1) {
    const id = `text-${String(n)}`;
    if (!ids.has(id)) return id;
  }
}
