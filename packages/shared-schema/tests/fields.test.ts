import { describe, expect, it } from 'vitest';
import {
  DynamicFieldSchema,
  FieldValuesSchema,
  fieldDigitsOf,
  numberFieldAllowedValues,
  numberFieldValueAlias,
  numberFieldValueError,
  numberFieldValueFromAlias,
  numberFieldValueLabel,
} from '../src/fields.js';

const baseField = { id: 'headline', label: 'Headline', required: true };

describe('DynamicField variants', () => {
  it('text', () => {
    const f = {
      ...baseField,
      type: 'text' as const,
      default: 'Breaking',
      direction: 'rtl' as const,
    };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });
  it('multiline', () => {
    const f = { ...baseField, type: 'multiline' as const, default: 'one\ntwo', maxLines: 3 };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });
  it('image with accept list', () => {
    const f = {
      ...baseField,
      type: 'image' as const,
      accept: ['png', 'webp'] as ('png' | 'webp')[],
    };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });
  it('color', () => {
    const f = { ...baseField, type: 'color' as const, default: '#E11D48' };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });
  it('boolean', () => {
    const f = { ...baseField, type: 'boolean' as const, default: true };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });
  it('number with bounds', () => {
    const f = {
      ...baseField,
      type: 'number' as const,
      default: 5,
      min: 0,
      max: 10,
      step: 0.5,
      unit: 'px',
    };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });
  it('number with exact choices', () => {
    const f = {
      ...baseField,
      type: 'number' as const,
      default: 2,
      allowedValues: [0, 2, 5],
    };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
    expect(numberFieldAllowedValues(f)).toEqual([0, 2, 5]);
    expect(numberFieldValueError(f, 5)).toBeUndefined();
    expect(numberFieldValueError(f, 1)).toBe('Must be one of: 0, 2, 5.');
  });
  it('number choices can carry unique operator-facing aliases', () => {
    const f = {
      ...baseField,
      type: 'number' as const,
      default: 0,
      allowedValues: [0, 1],
      allowedValueLabels: { '0': 'بارانی', '1': 'آفتابی' },
    };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
    expect(numberFieldValueAlias(f, 0)).toBe('بارانی');
    expect(numberFieldValueLabel(f, 1)).toBe('آفتابی');
    expect(numberFieldValueFromAlias(f, ' آفتابی ')).toBe(1);
    expect(numberFieldValueLabel(f, 2)).toBe('2');
  });
  it('number choice aliases must be unique', () => {
    expect(() =>
      DynamicFieldSchema.parse({
        ...baseField,
        type: 'number',
        default: 0,
        allowedValues: [0, 1],
        allowedValueLabels: { '0': 'Rain', '1': 'rain' },
      }),
    ).toThrow(/unique/i);
  });
  it('number rejects duplicate exact choices', () => {
    expect(() =>
      DynamicFieldSchema.parse({
        ...baseField,
        type: 'number',
        default: 0,
        allowedValues: [0, 1, 1],
      }),
    ).toThrow(/unique/i);
  });
  it('select', () => {
    const f = {
      ...baseField,
      type: 'select' as const,
      default: 'a',
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ],
    };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });
  it('text accepts minLength / maxLength / pattern (D-018)', () => {
    const f = {
      ...baseField,
      type: 'text' as const,
      default: 'Breaking',
      minLength: 2,
      maxLength: 40,
      pattern: '^[A-Z].*$',
    };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });
  it('multiline accepts minLength / pattern (D-018)', () => {
    const f = {
      ...baseField,
      type: 'multiline' as const,
      default: 'a\nb',
      minLength: 0,
      pattern: '\\S',
    };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });
  it('text rejects an invalid regex pattern', () => {
    expect(() =>
      DynamicFieldSchema.parse({ ...baseField, type: 'text', default: 'x', pattern: '([' }),
    ).toThrow();
  });
  it('text rejects a negative minLength', () => {
    expect(() =>
      DynamicFieldSchema.parse({ ...baseField, type: 'text', default: 'x', minLength: -1 }),
    ).toThrow();
  });
  it('image rejects empty accept list', () => {
    expect(() => DynamicFieldSchema.parse({ ...baseField, type: 'image', accept: [] })).toThrow();
  });
  it('select rejects empty options', () => {
    expect(() =>
      DynamicFieldSchema.parse({ ...baseField, type: 'select', default: 'a', options: [] }),
    ).toThrow();
  });
});

describe('a field says which digits its value is written in (FIELD-DIGITS-01)', () => {
  const text = { ...baseField, type: 'text' as const, default: '' };
  const multiline = { ...baseField, type: 'multiline' as const, default: '' };
  const number = { ...baseField, type: 'number' as const, default: 0 };

  it('text and multiline take all four choices; a number takes the three sets', () => {
    for (const digits of ['as-typed', 'persian', 'latin', 'arabic-indic'] as const) {
      expect(DynamicFieldSchema.parse({ ...text, digits })).toEqual({ ...text, digits });
      expect(DynamicFieldSchema.parse({ ...multiline, digits })).toEqual({ ...multiline, digits });
    }
    for (const digits of ['persian', 'latin', 'arabic-indic'] as const) {
      expect(DynamicFieldSchema.parse({ ...number, digits })).toEqual({ ...number, digits });
    }
  });

  it('a number field refuses as-typed, and no field takes a set that does not exist', () => {
    expect(() => DynamicFieldSchema.parse({ ...number, digits: 'as-typed' })).toThrow();
    expect(() => DynamicFieldSchema.parse({ ...text, digits: 'hindi' })).toThrow();
  });

  it('an old field carries no key and none is written on the way in', () => {
    expect(DynamicFieldSchema.parse(text)).not.toHaveProperty('digits');
    expect(DynamicFieldSchema.parse(number)).not.toHaveProperty('digits');
  });

  it('the effective choice: absent is as-typed for text, latin for a number', () => {
    expect(fieldDigitsOf(DynamicFieldSchema.parse(text))).toBe('as-typed');
    expect(fieldDigitsOf(DynamicFieldSchema.parse(multiline))).toBe('as-typed');
    expect(fieldDigitsOf(DynamicFieldSchema.parse(number))).toBe('latin');
    expect(fieldDigitsOf(DynamicFieldSchema.parse({ ...number, digits: 'persian' }))).toBe(
      'persian',
    );
    expect(fieldDigitsOf(DynamicFieldSchema.parse({ ...text, digits: 'arabic-indic' }))).toBe(
      'arabic-indic',
    );
  });

  it('no field, or a kind with no setting, rewrites nothing', () => {
    expect(fieldDigitsOf(null)).toBe('as-typed');
    expect(fieldDigitsOf(undefined)).toBe('as-typed');
    expect(fieldDigitsOf({ ...baseField, type: 'select', default: 'a', options: [] })).toBe(
      'as-typed',
    );
  });
});

describe('FieldValues', () => {
  it('accepts mixed value types', () => {
    const v = {
      headline: 'خبر فوری',
      count: 7,
      live: true,
      themeColor: '#E11D48',
      logo: { assetId: 'asset-logo' },
    };
    expect(FieldValuesSchema.parse(v)).toEqual(v);
  });
  it('accepts an empty record', () => {
    expect(FieldValuesSchema.parse({})).toEqual({});
  });
});

describe('ListField (D-028)', () => {
  it('accepts a list field with {id, text} default items', () => {
    const f = {
      ...baseField,
      type: 'list' as const,
      default: [
        { id: 'i1', text: 'یک' },
        { id: 'i2', text: 'دو' },
      ],
    };
    expect(DynamicFieldSchema.parse(f)).toEqual(f);
  });
  it('keeps the item shape OPEN — extra fields pass through (repeater/sequence reuse)', () => {
    const f = {
      ...baseField,
      type: 'list' as const,
      default: [{ id: 'p1', name: 'Player', number: 9, text: 'optional' }],
    };
    const parsed = DynamicFieldSchema.parse(f);
    expect(parsed).toEqual(f);
    if (parsed.type === 'list') {
      expect(parsed.default[0]).toMatchObject({ name: 'Player', number: 9 });
    }
  });
  it('rejects an item missing the required id', () => {
    expect(() =>
      DynamicFieldSchema.parse({ ...baseField, type: 'list', default: [{ text: 'x' }] }),
    ).toThrow();
  });
  it('a list value round-trips through FieldValues', () => {
    const v = {
      headlines: [
        { id: 'i1', text: 'خبر' },
        { id: 'i2', text: 'Brand X' },
      ],
    };
    expect(FieldValuesSchema.parse(v)).toEqual(v);
  });
  it('rejects a list value whose items lack ids', () => {
    expect(() => FieldValuesSchema.parse({ headlines: [{ text: 'x' }] })).toThrow();
  });
});

describe('a list field says which digits its items are written in (TEXT-DIGITS-01)', () => {
  const list = { ...baseField, type: 'list' as const, default: [{ id: 'i1', text: 'خبر 1' }] };

  it('takes all four choices and keeps them', () => {
    for (const digits of ['as-typed', 'persian', 'latin', 'arabic-indic'] as const) {
      expect(DynamicFieldSchema.parse({ ...list, digits })).toEqual({ ...list, digits });
    }
    expect(() => DynamicFieldSchema.parse({ ...list, digits: 'hindi' })).toThrow();
  });

  it('an old list carries no key and none is written on the way in', () => {
    expect(DynamicFieldSchema.parse(list)).not.toHaveProperty('digits');
  });

  it('the effective choice: absent is Keyboard (as-typed), a choice is itself', () => {
    expect(fieldDigitsOf(DynamicFieldSchema.parse(list))).toBe('as-typed');
    expect(fieldDigitsOf(DynamicFieldSchema.parse({ ...list, digits: 'persian' }))).toBe('persian');
  });
});
