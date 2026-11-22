import { describe, expect, it } from 'vitest';
import {
  operatorFieldError,
  operatorFieldRefusals,
  operatorFieldUpdateRefusal,
  type DynamicField,
} from '../src/index.js';

const text = {
  id: 'text',
  label: 'Headline',
  type: 'text',
  default: 'New text',
  required: true,
  minLength: 2,
  maxLength: 8,
} as const satisfies DynamicField;

describe('authored operator field constraints', () => {
  it('rejects blank and whitespace-only required values and counts text code points', () => {
    expect(operatorFieldError(text, '')?.line).toBe('A value is required.');
    expect(operatorFieldError(text, '  \t')?.line).toBe('A value is required.');
    expect(operatorFieldError(text, '😀')?.line).toBe('Enter at least 2 characters.');
    expect(operatorFieldError(text, '123456789')?.line).toBe('Enter at most 8 characters.');
    expect(operatorFieldError(text, '😀ن')).toBeUndefined();
    expect(operatorFieldError({ ...text, required: false }, '')).toBeUndefined();
  });

  it('keeps localized patterns, and enforces multiline, numeric, choice and list constraints', () => {
    const clock = { ...text, pattern: '^[0-2][0-9]:[0-5][0-9]$' };
    expect(operatorFieldError(clock, '۲۰:۳۲')).toBeUndefined();
    expect(operatorFieldError(clock, '30:32')?.code).toBe('pattern');
    expect(
      operatorFieldError({ ...text, type: 'multiline', maxLines: 2 }, 'one\r\ntwo\nthree'),
    ).toMatchObject({ line: 'Enter at most 2 lines.' });
    const number = {
      id: 'number',
      label: 'Score',
      type: 'number',
      required: true,
      default: 2,
    } as const;
    expect(operatorFieldError({ ...number, min: 2, max: 4 }, '۳')).toBeUndefined();
    expect(operatorFieldError({ ...number, max: 4 }, 5)?.line).toBe('Must be at most 4.');
    expect(operatorFieldError({ ...number, allowedValues: [0, 1] }, 2)?.line).toBe(
      'Must be 0 or 1.',
    );
    expect(operatorFieldError({ ...number, allowedValues: [0, 1] }, 0)).toBeUndefined();
    expect(
      operatorFieldError(
        {
          id: 'choice',
          label: 'Choice',
          required: false,
          type: 'select',
          default: 'v',
          options: [{ value: 'v', label: 'Visible' }],
        },
        'x',
      )?.line,
    ).toBe('Choose one of: Visible.');
    const rows = {
      id: 'rows',
      label: 'Rows',
      type: 'list',
      required: true,
      default: [],
      maxItems: 1,
      itemFields: [text],
    } as const satisfies DynamicField;
    expect(operatorFieldError(rows, [])?.line).toBe('A value is required.');
    expect(operatorFieldError(rows, [{ id: 'r', text: '' }])?.line).toBe(
      'Row 1 · Headline: A value is required.',
    );
    expect(operatorFieldError(rows, [{ id: '1' }, { id: '2' }])?.line).toBe('Use at most 1 items.');
  });

  it('checks staged nested values and preserves unchanged legacy or inherited values', () => {
    const group = {
      instanceId: 'instance',
      name: 'Guest',
      compositionId: 'composition',
      aggregate: { fields: [text], groups: [] },
      defaultValues: { text: 'Guest' },
    };
    const form = {
      fields: [{ ...text, id: 'caption', label: 'Caption', required: false }],
      groups: [group],
    };
    const invalid = { Guest: { text: '' } };
    expect(operatorFieldRefusals(form, invalid)).toEqual([
      { code: 'invalid-field', line: 'A value is required.', label: 'Headline' },
    ]);
    expect(operatorFieldRefusals(form, { caption: 'Valid' })).toEqual([]);
    expect(
      operatorFieldUpdateRefusal(form, invalid, { ...invalid, caption: 'Valid' }, 'merge'),
    ).toBeUndefined();
    expect(operatorFieldUpdateRefusal(form, {}, invalid, 'merge')).toEqual({
      errorCode: 'invalid-field',
      message: 'Not sent: Headline — A value is required.',
    });
    expect(
      operatorFieldUpdateRefusal(form, { Guest: { text: 'Valid' } }, { Guest: {} }, 'replace'),
    ).toBeUndefined();
    const defaultBlank = {
      fields: [],
      groups: [{ ...group, defaultValues: { text: '' } }],
    };
    expect(
      operatorFieldUpdateRefusal(defaultBlank, { Guest: { text: 'Valid' } }, {}, 'replace'),
    ).toMatchObject({ errorCode: 'invalid-field' });
  });
});
