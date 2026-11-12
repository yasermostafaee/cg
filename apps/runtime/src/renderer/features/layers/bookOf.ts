import { pageIdsOf, pageRefsOf, type PageRef, type TemplateInfo } from '@cg/shared-ipc';
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
 * The rehearsal book uses the staged list over the applied one. Its initial page comes
 * from the row, while Preview's Next advances within this list in the browser.
 */
export interface RehearsalBook {
  fieldId: string;
  /** The row's initial page, 0-based and clamped to the effective list. */
  index: number;
  /** `false` — the author's sequence runs by itself (`D-163`): the console does not turn it. */
  step: boolean;
  wrap: boolean;
  pages: readonly (PageRef & { id?: string })[];
  /** Ordered page identities and picture references, independent of unrelated field edits. */
  identity: string;
  /** The index was reset at programme exit and is only for the next Play. */
  rewound?: true;
}

export function rehearsalBookOf(
  template: TemplateInfo | null,
  item: StackItemState | null,
  fields: FieldValues,
): RehearsalBook | null {
  const entry = template?.pageLists?.[0];
  if (template === null || item === null || entry === undefined) return null;
  const value: unknown = fields[entry.fieldId];
  const declared = template.fields.find((f) => f.id === entry.fieldId);
  const raw = Array.isArray(value) ? value : declared?.type === 'list' ? declared.default : [];
  const refs = pageRefsOf(raw);
  if (refs.length === 0) return null;
  const ids = pageIdsOf(raw);
  const pages = refs.map((picture, index) => {
    const id = ids[index];
    return { ...picture, ...(id !== undefined && { id }) };
  });
  const index = Math.min(item.pages?.[entry.fieldId] ?? 0, refs.length - 1);
  return {
    fieldId: entry.fieldId,
    index,
    step: entry.step !== false,
    wrap: entry.wrap,
    pages,
    identity: JSON.stringify([
      entry.fieldId,
      entry.step,
      entry.wrap,
      pages.map(({ id, media, assetId }) => [id, media, assetId]),
    ]),
    ...(item.pageRewinds?.includes(entry.fieldId) === true && { rewound: true as const }),
  };
}
