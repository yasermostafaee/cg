import { describe, expect, it } from 'vitest';
import { arabicIndicDigits, latinDigits, persianDigits } from '../src/digits.js';

describe('persianDigits', () => {
  it('converts Latin to Persian', () => {
    expect(persianDigits('1234567890')).toBe('۱۲۳۴۵۶۷۸۹۰');
  });
  it('preserves non-digits', () => {
    expect(persianDigits('قیمت 123 تومان')).toBe('قیمت ۱۲۳ تومان');
  });
  it('no-op when there are no digits', () => {
    expect(persianDigits('hello')).toBe('hello');
  });
  it('no-op on Persian digits', () => {
    expect(persianDigits('۱۲۳')).toBe('۱۲۳');
  });
});

describe('arabicIndicDigits', () => {
  it('converts Latin to Arabic-Indic', () => {
    expect(arabicIndicDigits('1234567890')).toBe('١٢٣٤٥٦٧٨٩٠');
  });
});

describe('latinDigits', () => {
  it('converts Persian to Latin', () => {
    expect(latinDigits('۱۲۳۴۵۶۷۸۹۰')).toBe('1234567890');
  });
  it('converts Arabic-Indic to Latin', () => {
    expect(latinDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890');
  });
  it('converts mixed Persian and Arabic-Indic', () => {
    expect(latinDigits('۱۲٣۴')).toBe('1234');
  });
  it('preserves non-digit Persian text', () => {
    expect(latinDigits('قیمت ۱۲۳ تومان')).toBe('قیمت 123 تومان');
  });
});
