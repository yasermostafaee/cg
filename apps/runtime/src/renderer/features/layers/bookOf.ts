import { pageRefsOf, type TemplateInfo } from '@cg/shared-ipc';
import type { FieldValues, StackItemState } from '@cg/shared-schema';

/**
 * `R-100` — **A ROW'S BOOK, as the console shows it:** the page list it turns, the page it is on
 * (1-based) and how many pages it has. The ONE reading for the row's `12 / 300` and the
 * Inspector's book bar, so the two cannot disagree. The page number is the bridge's (`item.pages`);
 * the count is the row's APPLIED page list, else the template's own pages. `null` for a row whose
 * template has no page list — or whose page list the operator does not step (`step: false`, `D-163`):
 * that sequence runs by itself, so there is no page to state and no Previous / Next to offer.
 */
export interface RowBook {
  fieldId: string;
  page: number;
  count: number;
  /** A wrapping list (`repeat: 'infinite'`) turns past its ends; a book stops at them. */
  wrap: boolean;
  /** The row's live choice, falling back to the template's authored mode. */
  advance: 'auto' | 'manual';
}

export function bookOf(template: TemplateInfo | null, item: StackItemState | null): RowBook | null {
  const entry = template?.pageLists?.[0];
  if (template === null || item === null || entry === undefined || entry.step === false)
    return null;
  const applied: unknown = item.fields[entry.fieldId];
  const declared = template.fields.find((f) => f.id === entry.fieldId);
  const count = Array.isArray(applied)
    ? applied.length
    : declared?.type === 'list'
      ? declared.default.length
      : 0;
  const index = Math.min(item.pages?.[entry.fieldId] ?? 0, Math.max(0, count - 1));
  return {
    fieldId: entry.fieldId,
    page: count === 0 ? 0 : index + 1,
    count,
    wrap: entry.wrap,
    advance: item.pageAdvance?.[entry.fieldId] ?? entry.advance ?? 'manual',
  };
}

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.1 — **THE PAGE A TAKE WOULD SHOW, for PVW.** The bridge's own reading
 * (`#pageControl`), mirrored for the console's rehearsal: the template's FIRST page list, the page
 * the bridge holds the row on (`item.pages`), and the picture that page names when it is an operator
 * picture. Read from the values PVW is rehearsing (the staged book over the applied one), so a book
 * loaded and not yet sent is what PVW shows — at the row's page, clamped to it. `null` for a template
 * with no page list, or a book with no pages: PVW then sends no page, as a take sends none.
 */
export interface BookPage {
  fieldId: string;
  /** 0-based. */
  index: number;
  /** `false` — the author's sequence runs by itself (`D-163`): the console does not turn it. */
  step: boolean;
  /** The operator picture this page names (its SHA-256); `undefined` for an authored page. */
  media: string | undefined;
}

export function bookPageOf(
  template: TemplateInfo | null,
  item: StackItemState | null,
  fields: FieldValues,
): BookPage | null {
  const entry = template?.pageLists?.[0];
  if (template === null || item === null || entry === undefined) return null;
  const value: unknown = fields[entry.fieldId];
  const declared = template.fields.find((f) => f.id === entry.fieldId);
  const raw: unknown = Array.isArray(value)
    ? value
    : declared?.type === 'list'
      ? declared.default
      : [];
  const refs = pageRefsOf(raw);
  if (refs.length === 0) return null;
  const index = Math.min(item.pages?.[entry.fieldId] ?? 0, refs.length - 1);
  return {
    fieldId: entry.fieldId,
    index,
    step: entry.step !== false,
    media: refs[index]?.media,
  };
}
