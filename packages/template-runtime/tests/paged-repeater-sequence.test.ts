import { describe, expect, it } from 'vitest';
import type { Composition, Scene, SequenceElement } from '@cg/shared-schema';
import { pagedRepeaterItems, pagedRepeaterSequenceOf } from '../src/paged-repeater-sequence.js';

const sequence = {
  id: 'weather-pages',
  items: Array.from({ length: 4 }, (_, index) => ({
    kind: 'composition' as const,
    id: `page-${String(index + 1)}`,
    compositionId: 'weather-page',
  })),
} as SequenceElement;

const composition = {
  id: 'weather-page',
  fields: [
    {
      id: 'cities',
      type: 'list',
      label: 'Cities',
      required: false,
      default: [],
      maxItems: 8,
      itemFields: [{ id: 'city', type: 'text', label: 'City', required: true, default: '' }],
    },
  ],
  bindings: [{ fieldId: 'cities', target: { kind: 'repeater-items', elementId: 'rows' } }],
} as unknown as Composition;

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `city-${String(index + 1)}`,
    city: `City ${String(index + 1)}`,
  }));
}

describe('operator-sized paged Repeater Sequence', () => {
  it('derives one page for 5 rows and five pages for 33 rows', () => {
    const definition = pagedRepeaterSequenceOf(
      { compositions: [composition] } as Pick<Scene, 'compositions'>,
      sequence,
    );
    expect(definition).toBeDefined();
    if (definition === undefined) return;

    const onePage = pagedRepeaterItems(definition, rows(5));
    expect(onePage).toHaveLength(1);
    expect(onePage[0]?.fieldValues?.['cities']).toHaveLength(5);

    const fivePages = pagedRepeaterItems(definition, rows(33));
    expect(fivePages).toHaveLength(5);
    expect(
      fivePages.map((page) => (page.fieldValues?.['cities'] as unknown[] | undefined)?.length),
    ).toEqual([8, 8, 8, 8, 1]);
    expect(fivePages.map((page) => page.id)).toEqual([
      'page-1',
      'page-2',
      'page-3',
      'page-4',
      'weather-pages:data-page:5',
    ]);
  });
});
