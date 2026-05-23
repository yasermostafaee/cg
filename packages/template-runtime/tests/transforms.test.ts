import { describe, expect, it } from 'vitest';
import { applyTransform, stringifyValue } from '../src/transforms.js';

describe('applyTransform', () => {
  it('identity (undefined transform) returns the input', () => {
    expect(applyTransform('abc', undefined)).toBe('abc');
  });
  it('identity (explicit) returns the input', () => {
    expect(applyTransform('abc', 'identity')).toBe('abc');
  });
  it('uppercase', () => {
    expect(applyTransform('hello', 'uppercase')).toBe('HELLO');
  });
  it('lowercase', () => {
    expect(applyTransform('HELLO', 'lowercase')).toBe('hello');
  });
  it('truncate applies default 100 char limit', () => {
    const long = 'a'.repeat(200);
    expect(applyTransform(long, 'truncate').length).toBeLessThanOrEqual(100);
  });
  it('persian-digits converts Latin digits', () => {
    expect(applyTransform('قیمت 123 تومان', 'persian-digits')).toBe('قیمت ۱۲۳ تومان');
  });
  it('latin-digits converts Persian digits', () => {
    expect(applyTransform('قیمت ۱۲۳ تومان', 'latin-digits')).toBe('قیمت 123 تومان');
  });
  it('date-en parses an ISO date', () => {
    expect(applyTransform('2026-05-19T12:00:00Z', 'date-en')).toMatch(/^2026-05-(19|20)$/);
  });
  it('date-fa returns Persian-digit Jalali', () => {
    expect(applyTransform('2024-03-20T12:00:00Z', 'date-fa')).toMatch(/^۱۴۰[۲۳]/);
  });
});

describe('stringifyValue', () => {
  it('passes strings through', () => {
    expect(stringifyValue('hello')).toBe('hello');
  });
  it('renders numbers', () => {
    expect(stringifyValue(42)).toBe('42');
  });
  it('renders booleans', () => {
    expect(stringifyValue(true)).toBe('true');
    expect(stringifyValue(false)).toBe('false');
  });
  it('returns empty for null/undefined', () => {
    expect(stringifyValue(null)).toBe('');
    expect(stringifyValue(undefined)).toBe('');
  });
  it('extracts assetId from image-value objects', () => {
    expect(stringifyValue({ assetId: 'asset-logo' })).toBe('asset-logo');
  });
});
