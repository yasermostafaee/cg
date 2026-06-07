import { describe, expect, it } from 'vitest';
import type { DynamicField } from '@cg/shared-schema';
import { seedDefaults, validateField } from '../src/renderer/features/fields/PreviewFieldForm.js';

function textField(extra: Record<string, unknown>): DynamicField {
  return {
    id: 't',
    label: 'T',
    required: false,
    type: 'text',
    default: '',
    ...extra,
  } as DynamicField;
}

describe('PreviewFieldForm helpers', () => {
  it('seeds preview values from each field default', () => {
    const fields: DynamicField[] = [
      { id: 't', label: 'T', required: false, type: 'text', default: 'Hi' },
      { id: 'n', label: 'N', required: false, type: 'number', default: 7 },
      { id: 'b', label: 'B', required: false, type: 'boolean', default: true },
      {
        id: 'i',
        label: 'I',
        required: false,
        type: 'image',
        accept: ['png'],
        defaultAssetId: 'a1',
      },
    ];
    expect(seedDefaults(fields)).toEqual({ t: 'Hi', n: 7, b: true, i: { assetId: 'a1' } });
  });

  it('validates text minLength / maxLength / pattern / required', () => {
    expect(validateField(textField({ minLength: 3 }), 'ab')).toMatch(/Min 3/);
    expect(validateField(textField({ maxLength: 3 }), 'abcd')).toMatch(/Max 3/);
    expect(validateField(textField({ pattern: '^x' }), 'yz')).toMatch(/match/);
    expect(validateField(textField({ required: true }), '')).toBe('Required');
    expect(
      validateField(textField({ minLength: 1, maxLength: 5, pattern: '^h' }), 'hello'),
    ).toBeNull();
  });

  it('does not validate non-text fields', () => {
    const num: DynamicField = { id: 'n', label: 'N', required: true, type: 'number', default: 0 };
    expect(validateField(num, 0)).toBeNull();
  });
});
