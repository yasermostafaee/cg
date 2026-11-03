import { describe, expect, it } from 'vitest';
import type { DynamicField } from '@cg/shared-schema';
import { columnsForFields } from '../src/renderer/features/fields/repeater-columns.js';

describe('repeater editor columns (D-030)', () => {
  it('derives one typed/defaulted column per child field', () => {
    const fields: DynamicField[] = [
      { id: 'name', label: 'Team name', required: true, type: 'text', default: '' },
      {
        id: 'score',
        label: '',
        required: false,
        type: 'number',
        default: 0,
        min: 0,
        max: 1,
        step: 1,
        allowedValues: [0, 1],
      },
      {
        id: 'note',
        label: 'Note',
        required: false,
        type: 'multiline',
        default: '',
        digits: 'persian',
      },
      {
        id: 'icon',
        label: 'Weather icon',
        required: false,
        type: 'image',
        accept: ['png'],
        defaultAssetId: 'sunny',
      },
      {
        id: 'visible',
        label: 'Visible',
        required: false,
        type: 'boolean',
        default: true,
      },
    ];
    // TEXT-DIGITS-01 — a text column carries its child field's Digits (absent reads Keyboard).
    expect(columnsForFields(fields, [{ value: 'sunny', label: 'Sunny' }])).toEqual([
      { key: 'name', label: 'Team name', digits: 'as-typed', defaultValue: '' },
      {
        key: 'score',
        label: 'score',
        kind: 'number',
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 1,
        allowedValues: [0, 1],
      },
      { key: 'note', label: 'Note', digits: 'persian', defaultValue: '' },
      {
        key: 'icon',
        label: 'Weather icon',
        kind: 'image',
        defaultValue: { assetId: 'sunny' },
        choices: [{ value: 'sunny', label: 'Sunny' }],
      },
      { key: 'visible', label: 'Visible', kind: 'boolean', defaultValue: true },
    ]);
  });

  it('a field-less child yields no columns (the editor falls back to text rows)', () => {
    expect(columnsForFields(undefined)).toEqual([]);
    expect(columnsForFields([])).toEqual([]);
  });
});
