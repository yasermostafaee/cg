import { describe, expect, it } from 'vitest';
import {
  autoPageListFieldId,
  isPageListField,
  migratePageListMarks,
  migrateScene,
  pageListsOf,
  sequenceItemsBinding,
  withAutoPageLists,
  withPageLists,
  type DynamicField,
  type Scene,
} from '../src/index.js';

/**
 * 🔴 `B-353` — **A LIST BOUND TO A PICTURE SEQUENCE IS A PAGE LIST, WHATEVER ITS MARK SAYS.** The owner's
 * `telavat2.vcg` (2026-10-15): 87 JPG pages, a Data key `a1`, and CG Control showed six empty text
 * boxes — the field had lost its `pages` mark in the Designer. The fixtures below are that file's
 * shape (ids, keys and order as read from its `template.json`), with three pages instead of 87.
 */

const T = {
  position: { x: 0, y: 0 },
  size: { w: 1924, h: 1080 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 },
};

const page = (n: number) => ({
  id: `page-mv9wduov-${String(n)}`,
  kind: 'image',
  assetId: `asset-${String(n)}`,
  name: `MRN (${String(n)}).jpg`,
});
const PAGES = [page(1), page(2), page(3)];

function sequence(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: 'Sequence',
    type: 'sequence',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: T,
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'start',
    verticalAlign: 'middle',
    direction: 'ltr',
    items: PAGES,
    defaultDwellMs: 5000,
    advance: 'auto',
    transitionIn: 'fade',
    transitionOut: 'fade',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    repeat: 1,
    digits: 'persian',
    imageFit: 'cover',
    ...over,
  };
}

/** `telavat2`'s `a1`, exactly: last written by the Designer's field rebuild, so no `pages`. */
const A1 = {
  id: 'a1',
  label: 'a1',
  required: false,
  type: 'list',
  default: PAGES,
  digits: 'persian',
  allowFileSource: true,
};

function scene(
  children: Record<string, unknown>[],
  fields: Record<string, unknown>[],
  bindings: Record<string, unknown>[],
): Scene {
  return {
    schemaVersion: 1,
    id: '5c3c6424-3208-44e9-b235-2e9b4a23ef1b',
    name: 'comp1',
    layers: [{ id: 'L1792090411157', name: 'Layer 1', visible: true, locked: false, children }],
    fields,
    bindings,
    compositions: [],
  } as unknown as Scene;
}

const SEQ = 'el-1792090411157';
const bindA1 = { fieldId: 'a1', target: { kind: 'sequence-items', elementId: SEQ } };
const telavat2 = (): Scene => scene([sequence(SEQ)], [A1], [bindA1]);

describe('🔴 B-353 — isPageListField, the one answer', () => {
  it('telavat2’s a1 — pictures, no mark — IS a page list', () => {
    expect(isPageListField(A1 as DynamicField, { items: PAGES as never })).toBe(true);
  });

  it('a list of TEXT is never one, marked or not', () => {
    const text = [{ id: 'a', text: 'متن' }];
    const marked = { ...A1, default: text, pages: true } as DynamicField;
    expect(isPageListField(marked, { items: text as never })).toBe(false);
    // Pictures in the sequence, but only text in the field's own default: not a book either.
    expect(
      isPageListField({ ...A1, default: text } as DynamicField, { items: PAGES as never }),
    ).toBe(false);
  });

  /*
    🔴 `RUN-NEXT-VERSION-03` 1.6 — the owner's decision SUPERSEDES "a mixed sequence is never one": a
    sequence of pictures AND text pages is still a book (a text page travels as text).
  */
  it('🔴 1.6 — pictures with text pages ARE a book; a composition item never is', () => {
    // A text item's `kind` is optional (absent ⇒ text), as the schema's own item type says.
    const text: { id: string; kind?: string; text: string } = { id: 't1', text: 'متن' };
    const mixed = [page(1), text, page(2)];
    expect(sequenceItemsBinding(mixed)).toBe('pages');
    expect(
      isPageListField({ ...A1, default: mixed } as DynamicField, { items: mixed as never }),
    ).toBe(true);
    const withComposition = [...mixed, { id: 'c', kind: 'composition', compositionId: 'comp-1' }];
    expect(sequenceItemsBinding(withComposition)).toBeNull();
    expect(
      isPageListField({ ...A1, default: mixed } as DynamicField, {
        items: withComposition as never,
      }),
    ).toBe(false);
  });

  it('🔴 1.6 — a stepped book with a text page and no Data key gets its page list at export', () => {
    const mixed = [page(1), { id: 't1', text: 'متن' }, page(2)];
    const s = withPageLists(scene([sequence(SEQ, { items: mixed })], [], []));
    expect(pageListsOf(s).map((l) => l.fieldId)).toEqual([autoPageListFieldId(SEQ)]);
  });

  it('an EMPTY sequence keeps the author’s mark — a book the operator fills', () => {
    const empty = { items: [] as never };
    expect(isPageListField({ ...A1, default: [], pages: true } as DynamicField, empty)).toBe(true);
    expect(isPageListField({ ...A1, default: [] } as DynamicField, empty)).toBe(false);
  });
});

describe('🔴 B-353 — pageListsOf reads the owner’s file as a book', () => {
  it('telavat2 has ONE page list, a1, that stops at its ends', () => {
    expect(pageListsOf(telavat2())).toEqual([
      { fieldId: 'a1', wrap: false, name: 'Sequence', fit: 'cover' },
    ]);
  });

  it('🔴 delta A — the list carries the sequence’s picture fit (absent: contain)', () => {
    // The owner's file is `cover`; a sequence that names no fit is drawn `contain`.
    expect(pageListsOf(telavat2())[0]?.fit).toBe('cover');
    const plain = scene([sequence(SEQ, { imageFit: undefined })], [A1], [bindA1]);
    expect(pageListsOf(plain)[0]?.fit).toBe('contain');
  });

  it('…and the same list with `operatorSteps: false` is a page list the operator does not step', () => {
    const s = scene([sequence(SEQ, { operatorSteps: false })], [A1], [bindA1]);
    expect(pageListsOf(s)).toEqual([
      { fieldId: 'a1', wrap: false, step: false, name: 'Sequence', fit: 'cover' },
    ]);
  });
});

describe('🔴 B-353 — migratePageListMarks, a registered scene migration', () => {
  it('puts the lost mark back, and nothing else changes', () => {
    const input = telavat2();
    const fixed = migratePageListMarks(input);
    expect(fixed.fields.find((f) => f.id === 'a1')).toEqual({ ...A1, pages: true });
    expect(fixed.layers).toBe(input.layers);
    expect(fixed.bindings).toBe(input.bindings);
  });

  it('is identity-preserving: a clean scene comes back as the SAME object', () => {
    const clean = scene([sequence(SEQ)], [{ ...A1, pages: true }], [bindA1]);
    expect(migratePageListMarks(clean)).toBe(clean);
    const text = scene(
      [sequence(SEQ, { items: [{ id: 'a', text: 'x' }] })],
      [{ ...A1, default: [{ id: 'a', text: 'x' }] }],
      [bindA1],
    );
    expect(migratePageListMarks(text)).toBe(text);
  });

  it('clears a stale mark on a list whose sequence went back to text', () => {
    const text = [{ id: 'a', text: 'x' }];
    const stale = scene(
      [sequence(SEQ, { items: text })],
      [{ ...A1, default: text, pages: true }],
      [bindA1],
    );
    expect(migratePageListMarks(stale).fields[0]).not.toHaveProperty('pages');
  });

  it('repairs a mark inside a COMPOSITION too (the Designer’s project keeps fields per composition)', () => {
    const project = {
      ...scene([], [], []),
      compositions: [
        {
          id: 'comp-1',
          name: 'comp1',
          layers: [{ id: 'L', name: 'L', visible: true, locked: false, children: [sequence(SEQ)] }],
          fields: [A1],
          bindings: [bindA1],
        },
      ],
    } as unknown as Scene;
    const fixed = migratePageListMarks(project);
    expect(fixed.compositions?.[0]?.fields?.[0]).toMatchObject({ id: 'a1', pages: true });
  });

  it('runs on every load: migrateScene includes it', () => {
    expect(migrateScene(telavat2()).fields[0]).toMatchObject({ id: 'a1', pages: true });
  });
});

describe('🔴 B-353 (BOOK-EXPORT Q2) — a stepped picture sequence is a book without a Data key', () => {
  const keyless = (): Scene => scene([sequence(SEQ)], [], []);

  it('gains a page list: a stable id, the sequence’s name, the pages, a binding', () => {
    const out = withAutoPageLists(keyless());
    const id = autoPageListFieldId(SEQ);
    expect(id).toBe(`pages-${SEQ}`);
    expect(out.fields).toEqual([
      { id, label: 'Sequence', required: false, type: 'list', default: PAGES, pages: true },
    ]);
    expect(out.bindings).toEqual([
      { fieldId: id, target: { kind: 'sequence-items', elementId: SEQ } },
    ]);
    expect(pageListsOf(out)).toEqual([
      { fieldId: id, wrap: false, name: 'Sequence', fit: 'cover' },
    ]);
  });

  it('the same sequence exported twice gets the same id', () => {
    expect(withAutoPageLists(keyless()).fields[0]?.id).toBe(
      withAutoPageLists(keyless()).fields[0]?.id,
    );
  });

  it('nothing for a keyed book, a sequence that runs by itself, text, or an empty sequence', () => {
    const keyed = telavat2();
    expect(withAutoPageLists(keyed)).toBe(keyed);
    for (const over of [
      { operatorSteps: false },
      { items: [{ id: 'a', text: 'x' }] },
      { items: [] },
    ]) {
      const s = scene([sequence(SEQ, over)], [], []);
      expect(withAutoPageLists(s)).toBe(s);
    }
  });

  it('never takes an id a field already has', () => {
    const taken = scene(
      [sequence(SEQ)],
      [{ id: `pages-${SEQ}`, label: 'x', required: false, type: 'text', default: '' }],
      [],
    );
    expect(withAutoPageLists(taken).fields.map((f) => f.id)).toEqual([
      `pages-${SEQ}`,
      `pages-${SEQ}-2`,
    ]);
  });

  it('withPageLists does both: the owner’s file is a book, a keyless one is too', () => {
    expect(pageListsOf(withPageLists(telavat2()))).toEqual([
      { fieldId: 'a1', wrap: false, name: 'Sequence', fit: 'cover' },
    ]);
    expect(withPageLists(telavat2()).fields).toHaveLength(1);
    expect(pageListsOf(withPageLists(keyless()))).toHaveLength(1);
  });
});
