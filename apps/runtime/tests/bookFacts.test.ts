import { describe, expect, it } from 'vitest';
import {
  bookSent,
  bookSource,
  bookSourceText,
  bookTitle,
  pictureName,
} from '../src/renderer/features/book/bookFacts.js';
import { authoredPictureUrls } from '../src/renderer/features/book/authoredPictures.js';
import { produceTemplateDelivery } from '../src/renderer/features/library/templateDelivery.js';
import { buildTelavat2Vcg } from './support/telavat2Vcg.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.4 — what the Inspector's book block says, in the operator's words: a
 * heading that is never the field id, where the pages come from, and whether they are on the row.
 */

const op = (n: number, name: string) => ({
  id: `p${String(n)}`,
  kind: 'image' as const,
  media: String(n).padStart(64, '0'),
  name,
});

describe('1.4 — the heading is the book’s name, never its field id', () => {
  it('the field’s Title when the author gave one; else the sequence’s name; else Book', () => {
    expect(bookTitle({ id: 'a1', label: 'Holy book' }, 'Sequence')).toBe('Holy book');
    expect(bookTitle({ id: 'a1', label: 'a1' }, 'Sequence')).toBe('Sequence');
    expect(
      bookTitle({ id: 'pages-el-1792581663991', label: 'pages-el-1792581663991' }, undefined),
    ).toBe('Book');
  });
});

describe('1.4 — where the pages come from, and whether they are on the row', () => {
  it('🔴 the template’s own, one folder’s, or picked; text pages counted', () => {
    expect(bookSourceText(bookSource([], false))).toBe("Template's pictures");
    expect(
      bookSourceText(bookSource([op(1, 'IN/MRN (1).jpg'), op(2, 'IN/MRN (2).jpg')], true)),
    ).toBe('Folder "IN" · 2 pictures');
    expect(bookSourceText(bookSource([op(1, 'a.png'), op(2, 'b.png')], true))).toBe(
      'Picked pictures · 2',
    );
    expect(
      bookSourceText(
        bookSource([op(1, 'IN/a.png'), { id: 't', text: 'یادداشت' }, op(2, 'IN/b.png')], true),
      ),
    ).toBe('Folder "IN" · 2 pictures · 1 text page');
    expect(pictureName('IN/MRN (1).jpg')).toBe('MRN (1).jpg');
  });

  it('Not sent — press Update, or On the row', () => {
    expect(bookSent(true)).toBe('Not sent — press Update');
    expect(bookSent(false)).toBe('On the row');
  });
});

describe('1.4 — the template’s own pictures, read from the page CG Control baked', () => {
  it('🔴 every authored page’s picture, by its asset id, as the data: URL the page draws', async () => {
    const { html } = await produceTemplateDelivery(await buildTelavat2Vcg({ pages: 3 }));
    const urls = authoredPictureUrls(html);
    expect(Object.keys(urls).sort()).toEqual(['page-asset-1', 'page-asset-2', 'page-asset-3']);
    expect(urls['page-asset-1']).toMatch(/^data:image\/png;base64,/);
  });

  it('a page that is not one of ours carries nothing', () => {
    expect(authoredPictureUrls('<html><script>var assetUrls: 3</script></html>')).toEqual({});
  });
});
