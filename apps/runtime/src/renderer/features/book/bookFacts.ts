import { isPicturePage, isTextPage, type BookPage } from './bookPages.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.4 — **WHAT THE INSPECTOR'S BOOK BLOCK STATES**, in the operator's words
 * (golden rule 11). Pure, so the words are pinned without a browser.
 */

/**
 * The book's heading: the field's Title when its author gave one, else the sequence's name, else
 * `Book` — never the field's id (`pages-el-1792581663991` means nothing to an operator; the id stays
 * in the heading's tooltip).
 */
export function bookTitle(
  field: { readonly id: string; readonly label: string },
  sequenceName: string | undefined,
): string {
  const label = field.label.trim();
  if (label !== '' && label !== field.id) return label;
  const name = sequenceName?.trim() ?? '';
  return name !== '' ? name : 'Book';
}

/** The folder a picture came from, when its name carries one (`IN/MRN (1).jpg` → `IN`). */
function folderOf(name: string | undefined): string | null {
  if (name === undefined) return null;
  const slash = name.indexOf('/');
  return slash > 0 ? name.slice(0, slash) : null;
}

/** A picture's name for people: its file name, without the folder it came from. */
export function pictureName(name: string | undefined): string {
  if (name === undefined) return '';
  const slash = name.lastIndexOf('/');
  return slash < 0 ? name : name.slice(slash + 1);
}

/** Where a book's pages come from — the parts, so a folder's name renders isolated (`<bdi>`). */
export interface BookSource {
  readonly kind: 'template' | 'folder' | 'picked';
  /** The folder's name, for `folder`. */
  readonly folder?: string;
  readonly pictures: number;
  readonly texts: number;
}

/**
 * Where the book's pages come from, always shown: the template's own (nothing loaded), one folder's,
 * or pictures picked one by one.
 */
export function bookSource(pages: readonly BookPage[], loaded: boolean): BookSource {
  const pictures = pages.filter(isPicturePage);
  const texts = pages.filter(isTextPage).length;
  const operator = pictures.filter((p) => p.media !== undefined);
  if (!loaded || operator.length === 0)
    return { kind: 'template', pictures: pictures.length, texts };
  const folders = new Set(operator.map((p) => folderOf(p.name)));
  const [only] = [...folders];
  if (folders.size === 1 && only !== null && only !== undefined) {
    return { kind: 'folder', folder: only, pictures: pictures.length, texts };
  }
  return { kind: 'picked', pictures: pictures.length, texts };
}

/** The part after the source: `87 pictures` / `12`, and `· 2 text pages` when there are any. */
function countPart(source: BookSource): string {
  const texts =
    source.texts === 0
      ? ''
      : ` · ${String(source.texts)} text ${source.texts === 1 ? 'page' : 'pages'}`;
  if (source.kind === 'template') return texts;
  if (source.kind === 'picked') return ` · ${String(source.pictures)}${texts}`;
  return ` · ${String(source.pictures)} ${source.pictures === 1 ? 'picture' : 'pictures'}${texts}`;
}

/**
 * The words of {@link BookSource}: `Template's pictures`, `Folder "IN" · 87 pictures`,
 * `Picked pictures · 12` — `head` before the folder's name, `tail` after it, so the name itself can
 * be rendered isolated between them.
 */
export function bookSourceWords(source: BookSource): { head: string; tail: string } {
  if (source.kind === 'template')
    return { head: `Template's pictures${countPart(source)}`, tail: '' };
  if (source.kind === 'picked') return { head: `Picked pictures${countPart(source)}`, tail: '' };
  return { head: 'Folder "', tail: `"${countPart(source)}` };
}

/** The whole line as one string — for a title, and for tests. */
export function bookSourceText(source: BookSource): string {
  const { head, tail } = bookSourceWords(source);
  return `${head}${source.folder ?? ''}${tail}`;
}

/** Whether what the block shows is what the row holds. */
export function bookSent(dirty: boolean): string {
  return dirty ? 'Not sent — press Update' : 'On the row';
}
