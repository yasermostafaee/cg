import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';

/**
 * `R-100` — **A ROW'S BOOK, as the console shows it:** the page list it turns, the page it is on
 * (1-based) and how many pages it has. The ONE reading for the row's `12 / 300` and the
 * Inspector's book bar, so the two cannot disagree. The page number is the bridge's (`item.pages`);
 * the count is the row's APPLIED page list, else the template's own pages. `null` for a row whose
 * template has no page list.
 */
export interface RowBook {
  fieldId: string;
  page: number;
  count: number;
  /** A wrapping list (`repeat: 'infinite'`) turns past its ends; a book stops at them. */
  wrap: boolean;
}

export function bookOf(template: TemplateInfo | null, item: StackItemState | null): RowBook | null {
  const entry = template?.pageLists?.[0];
  if (template === null || item === null || entry === undefined) return null;
  const applied: unknown = item.fields[entry.fieldId];
  const declared = template.fields.find((f) => f.id === entry.fieldId);
  const count = Array.isArray(applied)
    ? applied.length
    : declared?.type === 'list'
      ? declared.default.length
      : 0;
  const index = Math.min(item.pages?.[entry.fieldId] ?? 0, Math.max(0, count - 1));
  return { fieldId: entry.fieldId, page: count === 0 ? 0 : index + 1, count, wrap: entry.wrap };
}
