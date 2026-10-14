import { describe, expect, it } from 'vitest';
import {
  hasNextStep,
  pageListsOf,
  SequenceElementSchema,
  sequenceStepsByOperator,
  type Scene,
} from '../src/index.js';

/**
 * `D-163` (the owner, 2026-10-14) — **a sequence the operator does not step.** Clocks of several
 * cities turning beside a strap run by themselves; CG Control must offer no NEXT for them. One
 * predicate answers it, and the NEXT verdict (`hasNextStep`) and the page lists both read it. Absent
 * is "steps", so every template authored before keeps its NEXT.
 */

const T = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 80 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function sequence(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: id,
    type: 'sequence',
    transform: T,
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
    items: [{ id: 'a', text: 'تهران ۱۲:۰۰' }],
    ...over,
  };
}

function scene(children: Record<string, unknown>[], extras: Partial<Scene> = {}): Scene {
  return {
    layers: [{ id: 'L', name: 'L', visible: true, locked: false, blendMode: 'normal', children }],
    fields: [],
    bindings: [],
    ...extras,
  } as unknown as Scene;
}

describe('D-163 — sequenceStepsByOperator, the one answer', () => {
  it('absent is yes — every older sequence keeps its NEXT; false is no', () => {
    expect(sequenceStepsByOperator({})).toBe(true);
    expect(sequenceStepsByOperator({ operatorSteps: true })).toBe(true);
    expect(sequenceStepsByOperator({ operatorSteps: false })).toBe(false);
    const parsed = SequenceElementSchema.parse(sequence('s'));
    expect('operatorSteps' in parsed).toBe(false);
    expect(SequenceElementSchema.parse(sequence('s', { operatorSteps: false })).operatorSteps).toBe(
      false,
    );
  });
});

describe('D-163 — hasNextStep reads it', () => {
  it('🔴 a template whose only sequence runs by itself has NO next step', () => {
    expect(hasNextStep(scene([sequence('clocks', { operatorSteps: false })]), [])).toBe(false);
  });

  it('a steppable sequence beside it still gives the template its NEXT', () => {
    expect(
      hasNextStep(scene([sequence('clocks', { operatorSteps: false }), sequence('news')]), []),
    ).toBe(true);
    expect(hasNextStep(scene([sequence('news')]), [])).toBe(true);
  });
});

describe('D-163 — a page list says when the operator does not step it', () => {
  it('🔴 the list is still the operator’s to load, marked step: false', () => {
    const book = (over: Record<string, unknown>) =>
      scene([sequence('book', { repeat: 1, ...over })], {
        fields: [
          { id: 'pages', label: 'Pages', required: false, type: 'list', default: [], pages: true },
        ],
        bindings: [{ fieldId: 'pages', target: { kind: 'sequence-items', elementId: 'book' } }],
      } as unknown as Partial<Scene>);
    expect(pageListsOf(book({}))).toEqual([{ fieldId: 'pages', wrap: false }]);
    expect(pageListsOf(book({ operatorSteps: false }))).toEqual([
      { fieldId: 'pages', wrap: false, step: false },
    ]);
  });
});

describe('🔴 B-249 — pageListsOf resolves the ENTRY by id, and a miss is NOT FOUND', () => {
  // A composition holding a book, as a template's ENTRY composition would.
  const withEntry = (entryCompositionId: string): Scene =>
    scene([], {
      entryCompositionId,
      compositions: [
        {
          id: 'C',
          name: 'C',
          layers: [
            {
              id: 'LC',
              name: 'LC',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [sequence('book', { repeat: 1 })],
            },
          ],
          fields: [
            {
              id: 'pages',
              label: 'Pages',
              required: false,
              type: 'list',
              default: [],
              pages: true,
            },
          ],
          bindings: [{ fieldId: 'pages', target: { kind: 'sequence-items', elementId: 'book' } }],
        },
      ],
    } as unknown as Partial<Scene>);

  it('an id that names the composition reads its page list', () => {
    expect(pageListsOf(withEntry('C'))).toEqual([{ fieldId: 'pages', wrap: false }]);
  });

  it('a DANGLING id reads nothing — never "whichever composition is first"', () => {
    expect(pageListsOf(withEntry('comp-flattened-away'))).toEqual([]);
  });
});
