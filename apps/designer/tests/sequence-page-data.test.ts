import { describe, expect, it } from 'vitest';
import type { AggregatedFields, ListItemField } from '@cg/shared-schema';
import {
  buildSequencePageDataSample,
  buildSequenceRowsCsvSample,
  chunkSequenceRows,
  parseSequencePageData,
  parseSequenceRowsCsv,
} from '../src/renderer/features/fields/sequence-page-data.js';

const itemFields: ListItemField[] = [
  { id: 'city', label: 'نام شهر', required: true, type: 'text', default: '' },
  { id: 'temperature', label: 'دمای شهر', required: true, type: 'number', default: 0 },
  {
    id: 'weather',
    label: 'نوع آب و هوا',
    required: true,
    type: 'number',
    default: 0,
    allowedValues: [0, 1],
    allowedValueLabels: { '0': 'بارانی', '1': 'آفتابی' },
  },
];

function page(): AggregatedFields {
  return {
    fields: [
      {
        id: 'cities',
        label: 'لیست شهرها',
        required: true,
        type: 'list',
        default: [],
        maxItems: 3,
        itemFields,
      },
    ],
    groups: [],
  };
}

describe('D-180 — Sequence page data JSON', () => {
  it('maps page and row titles to stable ids and creates deterministic row ids', () => {
    const parsed = parseSequencePageData(
      JSON.stringify({
        pages: [
          {
            'لیست شهرها': [
              { 'نام شهر': 'تهران', 'دمای شهر': 20, 'نوع آب و هوا': 0 },
              { id: 'tabriz', city: 'تبریز', temperature: '-12', weather: 1 },
            ],
          },
          { cities: [{ city: 'شیراز', temperature: 22, weather: 1 }] },
        ],
      }),
      [{ aggregate: page() }, { aggregate: page() }],
    );

    expect(parsed).toEqual([
      {
        cities: [
          { id: 'file-1', city: 'تهران', temperature: 20, weather: 0 },
          { id: 'tabriz', city: 'تبریز', temperature: -12, weather: 1 },
        ],
      },
      { cities: [{ id: 'file-1', city: 'شیراز', temperature: 22, weather: 1 }] },
    ]);
  });

  it('rejects an unknown key, an oversized page and more pages than the Sequence', () => {
    expect(() => parseSequencePageData('[{"unknown": []}]', [{ aggregate: page() }])).toThrow(
      'Page 1, field or group “unknown”',
    );
    expect(() =>
      parseSequencePageData(
        JSON.stringify([
          {
            cities: [
              { city: '1', temperature: 1, weather: 0 },
              { city: '2', temperature: 2, weather: 0 },
              { city: '3', temperature: 3, weather: 0 },
              { city: '4', temperature: 4, weather: 0 },
            ],
          },
        ]),
        [{ aggregate: page() }],
      ),
    ).toThrow('allows 3');
    expect(() => parseSequencePageData('[{}, {}]', [{ aggregate: page() }])).toThrow('2 pages');
  });

  it('generates a self-documenting sample for the exact page schema that can be loaded as-is', () => {
    const sample = buildSequencePageDataSample({ id: 'weather-sequence', name: 'Weather pages' }, [
      {
        aggregate: page(),
        label: 'Weather page 1',
        defaultValues: {
          cities: [{ id: 'tehran', city: 'تهران', temperature: 20, weather: 0 }],
        },
      },
    ]);
    const document = JSON.parse(sample) as Record<string, unknown>;

    expect(document['format']).toBe('cg.sequence-pages/v1');
    expect(document['sequence']).toEqual({
      id: 'weather-sequence',
      name: 'Weather pages',
      pageCount: 1,
    });
    expect(document['pageSchemas']).toEqual([
      expect.objectContaining({
        page: 1,
        title: 'Weather page 1',
        fields: [
          expect.objectContaining({
            id: 'cities',
            title: 'لیست شهرها',
            type: 'list',
            maxItems: 3,
            rowFields: itemFields.map((field) =>
              expect.objectContaining({ id: field.id, title: field.label, type: field.type }),
            ),
          }),
        ],
      }),
    ]);
    expect(parseSequencePageData(sample, [{ aggregate: page() }])).toEqual([
      { cities: [{ id: 'tehran', city: 'تهران', temperature: 20, weather: 0 }] },
    ]);
  });

  it('maps nested composition groups by stable key or unique title', () => {
    const nested: AggregatedFields = {
      fields: [],
      groups: [
        {
          instanceId: 'badge-instance',
          name: 'badge',
          label: 'Badge data',
          compositionId: 'badge-composition',
          aggregate: {
            fields: [
              {
                id: 'headline',
                label: 'Headline',
                required: true,
                type: 'text',
                default: '',
              },
            ],
            groups: [],
          },
        },
      ],
    };

    expect(
      parseSequencePageData('{"pages":[{"Badge data":{"Headline":"Breaking"}}]}', [
        { aggregate: nested },
      ]),
    ).toEqual([{ badge: { headline: 'Breaking' } }]);
  });

  it('round-trips an Excel-friendly CSV by column title and preserves typed values', () => {
    const field = page().fields[0];
    if (field?.type !== 'list') throw new Error('test fixture must contain a list field');
    const rows = [
      { id: 'tehran', city: 'تهران', temperature: 20, weather: 0 },
      { id: 'rasht', city: 'رشت', temperature: 14, weather: 1 },
    ];
    const csv = buildSequenceRowsCsvSample(field, rows);

    expect(csv.startsWith('\uFEFFنام شهر,دمای شهر,نوع آب و هوا\r\n')).toBe(true);
    expect(csv).toContain('تهران,20,بارانی');
    expect(csv).toContain('رشت,14,آفتابی');
    expect(parseSequenceRowsCsv(csv, field)).toEqual([
      { id: 'file-1', city: 'تهران', temperature: 20, weather: 0 },
      { id: 'file-2', city: 'رشت', temperature: 14, weather: 1 },
    ]);
  });

  it('automatically makes enough pages for a long spreadsheet', () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      id: `city-${String(index + 1)}`,
      city: `City ${String(index + 1)}`,
    }));

    const pages = chunkSequenceRows(rows, 3);
    expect(pages).toHaveLength(14);
    expect(pages[0]).toHaveLength(3);
    expect(pages[13]).toHaveLength(1);
    expect(chunkSequenceRows([], 3)).toEqual([[]]);
  });

  it('rejects a weather code outside the authored 0/1 contract', () => {
    const field = page().fields[0];
    if (field?.type !== 'list') throw new Error('test fixture must contain a list field');
    expect(() => parseSequenceRowsCsv('نام شهر,دمای شهر,نوع آب و هوا\nتهران,20,2', field)).toThrow(
      /بارانی.*0.*آفتابی.*1/i,
    );
  });
});
