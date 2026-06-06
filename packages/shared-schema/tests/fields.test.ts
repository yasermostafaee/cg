import { describe, expect, it } from 'vitest';
import { DynamicFieldSchema, FieldValuesSchema } from '../src/fields.js';

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
