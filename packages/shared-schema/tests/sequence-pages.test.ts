import { describe, expect, it } from 'vitest';
import {
  CG_CONTROL_KEY,
  DynamicFieldSchema,
  readCgControl,
  SequenceElementSchema,
  SequenceItemSchema,
} from '../src/index.js';

/** `D-163` — picture items, the sequence's one fit, the page-list mark and `__cg.page`. */

const SHA = 'a'.repeat(64);

const sequence = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 'seq',
  name: 'pages',
  type: 'sequence',
  transform: {
    position: { x: 0, y: 0 },
    size: { w: 1920, h: 1080 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  },
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  font: {
    family: 'Vazirmatn',
    weight: 400,
    style: 'normal',
    size: 24,
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  color: '#FFFFFF',
  direction: 'rtl',
  items,
  ...extra,
});

describe('D-163 — the schema widening is additive', () => {
  it('🔴 a sequence authored before picture items parses to the same value, nothing injected', () => {
    const old = sequence([
      { id: 'a', text: 'اکنون' },
      { kind: 'composition', id: 'c', compositionId: 'comp' },
    ]);
    const parsed = SequenceElementSchema.parse(old);
    expect(parsed.items).toEqual(old.items);
    expect('imageFit' in parsed).toBe(false);
  });

  it('a picture item and the sequence’s one fit parse', () => {
    const parsed = SequenceElementSchema.parse(
      sequence([{ kind: 'image', id: 'p1', assetId: 'asset-1', name: 'page1.png' }], {
        imageFit: 'cover',
      }),
    );
    expect(parsed.items[0]).toEqual({
      kind: 'image',
      id: 'p1',
      assetId: 'asset-1',
      name: 'page1.png',
    });
    expect(parsed.imageFit).toBe('cover');
  });

  it('🔴 a picture item names exactly one source', () => {
    expect(
      SequenceItemSchema.safeParse({ kind: 'image', id: 'p', assetId: 'a', media: SHA }).success,
    ).toBe(false);
    expect(SequenceItemSchema.safeParse({ kind: 'image', id: 'p' }).success).toBe(false);
    expect(SequenceItemSchema.safeParse({ kind: 'image', id: 'p', media: SHA }).success).toBe(true);
    expect(
      SequenceItemSchema.safeParse({ kind: 'image', id: 'p', media: 'not-a-hash' }).success,
    ).toBe(false);
  });

  it('a list field may be marked a page list; an old list is unchanged', () => {
    const base = { id: 'f', label: 'Pages', required: false, type: 'list', default: [] };
    expect(DynamicFieldSchema.parse({ ...base, pages: true })).toMatchObject({ pages: true });
    expect('pages' in DynamicFieldSchema.parse(base)).toBe(false);
  });
});

describe('R-100 — `__cg.page` is read defensively', () => {
  const png = `/page/${SHA}.png`;

  it('reads a page turn with its picture’s address on the template’s own origin', () => {
    expect(
      readCgControl({
        [CG_CONTROL_KEY]: { page: { field: 'pages', index: 11, media: { [SHA]: png } } },
      }),
    ).toEqual({ page: { field: 'pages', index: 11, media: { [SHA]: png } } });
  });

  it('🔴 a malformed index or field drops the turn; a bad picture is dropped on its own', () => {
    expect(readCgControl({ [CG_CONTROL_KEY]: { page: { field: 'pages', index: -1 } } })).toEqual(
      {},
    );
    expect(readCgControl({ [CG_CONTROL_KEY]: { page: { field: 'pages', index: 1.5 } } })).toEqual(
      {},
    );
    expect(readCgControl({ [CG_CONTROL_KEY]: { page: { field: '', index: 1 } } })).toEqual({});
    expect(
      readCgControl({
        [CG_CONTROL_KEY]: {
          page: {
            field: 'pages',
            index: 2,
            media: {
              [SHA]: 'data:text/html;base64,PHNjcmlwdD4=',
              ['b'.repeat(64)]: 'javascript:alert(1)',
              short: png,
            },
          },
        },
      }),
    ).toEqual({ page: { field: 'pages', index: 2 } });
  });

  it('🔴 only THIS origin’s page path, for the picture it is filed under — never bytes, never a host', () => {
    const other = 'c'.repeat(64);
    const media = {
      // The bytes themselves: CasparCG keeps every CG UPDATE's bytes in memory, so never again.
      [SHA]: 'data:image/png;base64,iVBORw0KGgo=',
      // Another host, and a protocol-relative one.
      ['d'.repeat(64)]: `http://evil.example/page/${'d'.repeat(64)}.png`,
      ['e'.repeat(64)]: `//evil.example/page/${'e'.repeat(64)}.png`,
      // A path that names a DIFFERENT picture than the one it is filed under.
      ['f'.repeat(64)]: `/page/${other}.png`,
      // Not a picture type.
      [other]: `/page/${other}.svg`,
    };
    expect(
      readCgControl({ [CG_CONTROL_KEY]: { page: { field: 'pages', index: 0, media } } }),
    ).toEqual({ page: { field: 'pages', index: 0 } });
  });

  it('an older payload with no page member reads exactly as before', () => {
    expect(readCgControl({ [CG_CONTROL_KEY]: { look: 'a' } })).toEqual({ look: 'a' });
  });
});
