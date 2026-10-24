import { describe, expect, it } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { MockRuntime } from '../src/platform/MockRuntime.js';
import { bookOf } from '../src/renderer/features/layers/bookOf.js';
import { layerRowActions } from '../src/renderer/features/layers/layerRowActions.js';
import { buttonActions } from '../src/renderer/ui/rowAction.js';
import { bindingFor, itemWith, rowDeps, templateWith } from './support/layerRow.js';

/**
 * `R-100` — a row's BOOK in CG Control: the one reading of `12 / 300`, the test-mode runtime's page
 * turns and refusals (the bridge's arithmetic and wording), and the row's NEXT / PREV on a book row.
 */

const BOOK = templateWith({
  templateId: 'tpl-book',
  templateType: 'custom',
  fields: [
    { id: 'pages', label: 'Pages', required: false, type: 'list', default: [], pages: true },
  ],
  pageLists: [{ fieldId: 'pages', wrap: false }],
});

/** Minimal PNG header bytes, base64 — what the shared probe reads. */
function png(width: number, height: number, seed: number): string {
  const b = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    (width >>> 24) & 255,
    (width >>> 16) & 255,
    (width >>> 8) & 255,
    width & 255,
    (height >>> 24) & 255,
    (height >>> 16) & 255,
    (height >>> 8) & 255,
    height & 255,
    8,
    2,
    0,
    0,
    0,
    seed & 255,
    (seed >> 8) & 255,
  ];
  return btoa(String.fromCharCode(...b));
}

describe('R-100 — bookOf, the one reading of a row’s book', () => {
  const item = (over: Partial<StackItemState> = {}): StackItemState =>
    itemWith('on-air', { templateId: 'tpl-book', ...over });

  it('the applied book and the bridge’s page number, 1-based', () => {
    const pages = Array.from({ length: 300 }, (_, i) => ({ id: `p${String(i)}`, kind: 'image' }));
    expect(bookOf(BOOK, item({ fields: { pages }, pages: { pages: 11 } }))).toEqual({
      fieldId: 'pages',
      page: 12,
      count: 300,
      wrap: false,
      advance: 'manual',
    });
  });

  it('the authored advance mode is the default and the row override wins', () => {
    const authoredAuto = {
      ...BOOK,
      pageLists: [{ fieldId: 'pages', wrap: false, advance: 'auto' as const }],
    };
    expect(bookOf(authoredAuto, item({ fields: { pages: [{ id: 'p1' }] } }))?.advance).toBe('auto');
    expect(
      bookOf(
        authoredAuto,
        item({ fields: { pages: [{ id: 'p1' }] }, pageAdvance: { pages: 'manual' } }),
      )?.advance,
    ).toBe('manual');
  });

  it('no page list ⇒ no book; an empty book reads 0 / 0', () => {
    expect(bookOf(templateWith(), item())).toBeNull();
    expect(bookOf(BOOK, item({ fields: {} }))).toMatchObject({ page: 0, count: 0 });
  });

  it('🔴 D-163 — a list the operator does not step is no book: no counter, no Previous / Next', () => {
    const selfRunning = {
      ...BOOK,
      pageLists: [{ fieldId: 'pages', wrap: false, step: false as const }],
    };
    expect(bookOf(selfRunning, item({ fields: { pages: [] } }))).toBeNull();
  });
});

describe('R-100 — test mode turns a book with the bridge’s rules', () => {
  async function mockWithBook(count: number): Promise<{ mock: MockRuntime; shas: string[] }> {
    const mock = new MockRuntime();
    mock.templateImport(BOOK);
    const shas: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const put = await mock.putPage(`page${String(i + 1)}.png`, png(1920, 1080, i));
      expect(put.accepted).toBe(true);
      shas.push(put.sha256!);
    }
    expect(mock.load('item-1', 'tpl-book', {}).accepted).toBe(true);
    const pages = shas.map((media, i) => ({ id: `${String(i + 1)}`, kind: 'image', media }));
    expect(mock.update('item-1', { pages }, 'merge').accepted).toBe(true);
    return { mock, shas };
  }

  it('🔴 Next, Previous and Go to move the page; a book stops at its ends', async () => {
    const { mock } = await mockWithBook(3);
    expect(mock.page('item-1', 'pages', 'previous')).toMatchObject({ accepted: true, page: 1 });
    expect(mock.page('item-1', 'pages', 'next')).toMatchObject({ page: 2, count: 3 });
    expect(mock.page('item-1', 'pages', 3)).toMatchObject({ page: 3 });
    expect(mock.page('item-1', 'pages', 'next')).toMatchObject({ page: 3 });
    expect(mock.stackSnapshot().find((i) => i.itemId === 'item-1')?.pages).toEqual({ pages: 2 });
  });

  it('🔴 Auto/Manual is row-local state in test mode too', async () => {
    const { mock } = await mockWithBook(2);
    expect(mock.setPageAdvance('item-1', 'pages', 'auto')).toEqual({ ok: true });
    expect(mock.stackSnapshot().find((i) => i.itemId === 'item-1')?.pageAdvance).toEqual({
      pages: 'auto',
    });
    expect(mock.setPageAdvance('missing', 'pages', 'manual')).toMatchObject({
      ok: false,
      reason: 'unknown-item',
    });
  });

  it('🔴 Next on the last on-air page self-stops the mock row, as the live page reports', async () => {
    const { mock } = await mockWithBook(2);
    expect(mock.page('item-1', 'pages', 2)).toMatchObject({ page: 2 });
    expect(mock.take('item-1').accepted).toBe(true);
    expect(mock.page('item-1', 'pages', 'next')).toMatchObject({ accepted: true, page: 2 });
    expect(mock.stackSnapshot().find((item) => item.itemId === 'item-1')?.status).toBe('exiting');
    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(mock.stackSnapshot().find((item) => item.itemId === 'item-1')?.status).toBe('loaded');
  });

  it('🔴 D-163 — a list the template turns by itself is not turned: the bridge’s refusal', () => {
    const mock = new MockRuntime();
    mock.templateImport({ ...BOOK, pageLists: [{ fieldId: 'pages', wrap: false, step: false }] });
    expect(mock.load('item-1', 'tpl-book', {}).accepted).toBe(true);
    expect(mock.page('item-1', 'pages', 'next')).toEqual({
      accepted: false,
      errorCode: 'page-not-stepped',
      message: 'This template turns these pages by itself; they are not turned from the console.',
    });
  });

  it('🔴 a picture over the limit, or not a picture, is refused in the operator’s words', async () => {
    const mock = new MockRuntime();
    expect(await mock.putPage('panorama.png', png(5000, 2000, 1))).toMatchObject({
      accepted: false,
      errorCode: 'page-too-many-pixels',
      message: expect.stringContaining('panorama.png is 5000 × 2000 pixels') as unknown as string,
    });
    expect(await mock.putPage('notes.png', btoa('hello'))).toMatchObject({
      errorCode: 'page-not-a-picture',
      message: 'notes.png is not a PNG, JPEG or WebP picture.',
    });
  });

  it('🔴 a page list naming a picture never stored is refused; a shorter book stays on its last page', async () => {
    const { mock, shas } = await mockWithBook(4);
    mock.page('item-1', 'pages', 4);
    expect(
      mock.update(
        'item-1',
        { pages: [{ id: 'x', kind: 'image', media: 'e'.repeat(64), name: 'lost.png' }] },
        'merge',
      ),
    ).toEqual({
      accepted: false,
      errorCode: 'page-missing',
      message: 'lost.png is not on CG Bridge any more. Load the pages again.',
    });
    expect(
      mock.update(
        'item-1',
        {
          pages: shas.slice(0, 2).map((media, i) => ({ id: `${String(i)}`, kind: 'image', media })),
        },
        'merge',
      ).accepted,
    ).toBe(true);
    // `RUN-NEXT-VERSION-03` 1.5 — the same book's first two pages: page 4, on screen, was removed, so the
    // page standing in its place — the new last page — is on screen (`pageAfterBookChange`, the bridge's
    // rule); `R-100` went to page 1.
    expect(mock.stackSnapshot().find((i) => i.itemId === 'item-1')?.pages).toEqual({ pages: 1 });
  });
});

describe('R-100 — the row’s verbs on a book row', () => {
  const bookRow = (page: number, count: number, status: StackItemState['status'] = 'loaded') =>
    rowDeps({
      binding: bindingFor(itemWith(status, { templateId: 'tpl-book' })),
      book: { fieldId: 'pages', page, count, wrap: false },
      page: () => Promise.resolve({ accepted: true }),
    });

  it('🔴 NEXT turns the page (not CG NEXT), PREV appears, and both work OFF air', () => {
    const actions = layerRowActions(bookRow(5, 300));
    const next = actions.find((a) => a.label === 'NEXT');
    const prev = actions.find((a) => a.label === 'PREV');
    expect(next?.key).toBe('page-next');
    expect(next?.disabled).toBe(false);
    expect(prev?.disabled).toBe(false);
  });

  it('🔴 a book row has the same six buttons as any row: PREV is in the row’s menu', () => {
    // The button row's columns are fixed by the sticky header; a seventh button wrapped CLEAR
    // onto a second line and moved every verb off its column.
    const labels = (deps: Parameters<typeof layerRowActions>[0]): string[] =>
      buttonActions(layerRowActions(deps)).map((a) => a.label);
    const sameRowNoBook = rowDeps({
      binding: bindingFor(itemWith('loaded', { templateId: 'tpl-book' })),
    });
    expect(labels(bookRow(5, 300))).toEqual(labels(sameRowNoBook));
    expect(layerRowActions(bookRow(5, 300)).find((a) => a.label === 'PREV')?.surface).toBe('menu');
  });

  it('a book stops at its ends: PREV off on page 1, NEXT off on the last page', () => {
    expect(layerRowActions(bookRow(1, 300)).find((a) => a.label === 'PREV')?.disabled).toBe(true);
    expect(layerRowActions(bookRow(300, 300)).find((a) => a.label === 'NEXT')?.disabled).toBe(true);
    expect(
      layerRowActions(bookRow(300, 300, 'on-air')).find((a) => a.label === 'NEXT')?.disabled,
    ).toBe(false);
  });

  it('a row with no book keeps exactly its old verbs: no PREV, NEXT is CG NEXT', () => {
    const actions = layerRowActions(rowDeps());
    expect(actions.some((a) => a.label === 'PREV')).toBe(false);
    expect(actions.find((a) => a.label === 'NEXT')?.key).toBe('next');
  });
});
