import { describe, expect, it } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { produceTemplateDelivery } from '../src/renderer/features/library/templateDelivery.js';
import { bookOf } from '../src/renderer/features/layers/bookOf.js';
import { newItemFields } from '../src/renderer/features/library/newItemFields.js';
import { buildTelavat2Vcg, TELAVAT2_SEQUENCE } from './support/telavat2Vcg.js';

/**
 * 🔴 `B-353` — **THE OWNER'S BOOK IS A BOOK IN CG CONTROL, WITHOUT A RE-EXPORT.** `telavat2.vcg` reached
 * CG Control with a Data key `a1` bound to its pictures and no `pages` mark, and the row's Inspector
 * showed six empty text boxes with no book bar. The import now reads every list bound to a picture
 * sequence as a page list (`withPageLists`), so the SAME bytes, imported again, are a book.
 */

const row = (fields: Record<string, unknown>): StackItemState =>
  ({ itemId: 'i1', templateId: 't', fields, status: 'loaded' }) as unknown as StackItemState;

describe('🔴 B-353 — importing telavat2.vcg as it is', () => {
  it('records a1 as the template’s page list, a book that stops at its ends', async () => {
    const { template } = await produceTemplateDelivery(await buildTelavat2Vcg({ pages: 3 }));
    expect(template.pageLists).toEqual([{ fieldId: 'a1', wrap: false }]);
    expect(template.fields.find((f) => f.id === 'a1')).toMatchObject({ type: 'list', pages: true });
  });

  it('the row reads 1 / N from it — the book bar’s numbers', async () => {
    const { template } = await produceTemplateDelivery(await buildTelavat2Vcg({ pages: 3 }));
    expect(bookOf(template, row(newItemFields(template)))).toEqual({
      fieldId: 'a1',
      page: 1,
      count: 3,
      wrap: false,
    });
  });

  it('BOOK-EXPORT Q2 — the same book with NO Data key is a book too', async () => {
    const { template } = await produceTemplateDelivery(
      await buildTelavat2Vcg({ pages: 3, keyed: false }),
    );
    const id = `pages-${TELAVAT2_SEQUENCE}`;
    expect(template.pageLists).toEqual([{ fieldId: id, wrap: false }]);
    expect(template.fields.find((f) => f.id === id)).toMatchObject({
      label: 'Sequence',
      type: 'list',
      pages: true,
    });
  });
});
