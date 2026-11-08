import { describe, expect, it } from 'vitest';
import { listFieldMaxItems, withListLimits, type DynamicField, type Scene } from '../src/index.js';

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q3 / Q4 — the most items a list field takes is the row limit of the
 * repeater it drives: one derivation for the Designer's preview, the GDD and CG Control's import.
 */

const T = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 400 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const repeater = (id: string, maxItems?: number) => ({
  id,
  name: id,
  type: 'repeater',
  transform: T,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  compositionId: 'row',
  items: [],
  ...(maxItems !== undefined ? { maxItems } : {}),
});
const list = (id: string, extra: Record<string, unknown> = {}): DynamicField =>
  ({ id, label: id, required: false, type: 'list', default: [], ...extra }) as DynamicField;
const doc = (children: unknown[], fields: DynamicField[], bindings: unknown[]) =>
  ({
    layers: [{ id: 'L', name: 'L', visible: true, locked: false, children }],
    fields,
    bindings,
    compositions: [],
  }) as unknown as Scene;
const drives = (fieldId: string, elementId: string) => ({
  fieldId,
  target: { kind: 'repeater-items', elementId },
});

describe('listFieldMaxItems', () => {
  it('a list driving a repeater with max items 4 takes 4; with none, no limit', () => {
    const d = doc(
      [repeater('r', 4), repeater('free')],
      [],
      [drives('a', 'r'), drives('b', 'free')],
    );
    expect(listFieldMaxItems(d, 'a')).toBe(4);
    expect(listFieldMaxItems(d, 'b')).toBeUndefined();
    expect(listFieldMaxItems(d, 'nobody')).toBeUndefined();
  });

  it('a list driving two repeaters takes the smaller limit', () => {
    const d = doc(
      [repeater('r1', 4), repeater('r2', 2)],
      [],
      [drives('a', 'r1'), drives('a', 'r2')],
    );
    expect(listFieldMaxItems(d, 'a')).toBe(2);
  });
});

describe('withListLimits', () => {
  it('stamps the limit, and drops one nothing justifies', () => {
    const d = doc([repeater('r', 3)], [], [drives('a', 'r')]);
    const out = withListLimits(d, d, {
      fields: [list('a'), list('b', { maxItems: 9 })],
      groups: [],
    });
    expect(out.fields[0]).toMatchObject({ id: 'a', maxItems: 3 });
    expect(out.fields[1]).not.toHaveProperty('maxItems');
  });

  it('derives the flat child field schema for a Repeater list', () => {
    const row = doc(
      [],
      [
        {
          id: 'city',
          label: 'City',
          required: false,
          type: 'text',
          default: '',
        },
        {
          id: 'icon',
          label: 'Icon',
          required: false,
          type: 'image',
          accept: ['png'],
        },
        list('nested'),
      ],
      [],
    );
    const d = doc([repeater('r', 3)], [], [drives('weather', 'r')]);
    d.compositions = [{ ...row, id: 'row', name: 'row' }] as Scene['compositions'];
    const out = withListLimits(d, d, { fields: [list('weather')], groups: [] });
    expect(out.fields[0]).toMatchObject({
      id: 'weather',
      itemFields: [
        { id: 'city', type: 'text' },
        { id: 'icon', type: 'image' },
      ],
    });
  });

  it('adds operator-facing image choices to root and Repeater-row image fields', () => {
    const row = doc(
      [],
      [
        {
          id: 'icon',
          label: 'Icon',
          required: false,
          type: 'image',
          accept: ['png'],
        },
      ],
      [],
    );
    const d = doc([repeater('r')], [], [drives('weather', 'r')]);
    d.compositions = [{ ...row, id: 'row', name: 'row' }] as Scene['compositions'];
    const pictures = [{ assetId: 'sun', label: 'sunny.png' }];
    const out = withListLimits(
      d,
      d,
      {
        fields: [
          list('weather'),
          { id: 'hero', label: 'Hero', required: false, type: 'image', accept: ['png'] },
        ],
        groups: [],
      },
      pictures,
    );
    expect(out.fields[0]).toMatchObject({
      itemFields: [{ id: 'icon', assetOptions: pictures }],
    });
    expect(out.fields[1]).toMatchObject({ assetOptions: pictures });
  });

  it('preserves an authored image subset and does not invent choices for upload-only fields', () => {
    const authored = [{ assetId: 'sun', label: 'Sunny', source: 'shared' as const }];
    const packaged = [
      { assetId: 'sun', label: 'sun.svg' },
      { assetId: 'rain', label: 'rain.svg' },
    ];
    const d = doc([], [], []);
    const out = withListLimits(
      d,
      d,
      {
        fields: [
          {
            id: 'icon',
            label: 'Icon',
            required: false,
            type: 'image',
            accept: ['svg'],
            inputMode: 'choices',
            assetOptions: authored,
          },
          {
            id: 'upload',
            label: 'Upload',
            required: false,
            type: 'image',
            accept: ['svg'],
            inputMode: 'upload',
          },
        ],
        groups: [],
      },
      packaged,
    );
    expect(out.fields[0]).toMatchObject({
      assetOptions: [{ assetId: 'sun', label: 'sun.svg', source: 'shared' }],
    });
    expect(out.fields[1]).not.toHaveProperty('assetOptions');
  });

  it('B-413 — an explicit image mode with no authored checks packages an empty allowlist', () => {
    const row = doc(
      [],
      [
        {
          id: 'icon',
          label: 'Icon',
          required: false,
          type: 'image',
          accept: ['png'],
          inputMode: 'choices',
        },
      ],
      [],
    );
    const d = doc([repeater('r')], [], [drives('weather', 'r')]);
    d.compositions = [{ ...row, id: 'row', name: 'row' }] as Scene['compositions'];
    const out = withListLimits(
      d,
      d,
      {
        fields: [
          list('weather'),
          {
            id: 'hero',
            label: 'Hero',
            required: false,
            type: 'image',
            accept: ['png'],
            inputMode: 'choices-and-upload',
          },
        ],
        groups: [],
      },
      [{ assetId: 'sun', label: 'sunny.png' }],
    );

    expect(out.fields[0]).toMatchObject({
      itemFields: [{ id: 'icon', assetOptions: [] }],
    });
    expect(out.fields[1]).toMatchObject({ assetOptions: [] });
  });
});
