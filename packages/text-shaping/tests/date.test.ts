import { describe, expect, it } from 'vitest';
import { dateEn, dateFa, gregorianToJalali } from '../src/date.js';

describe('gregorianToJalali', () => {
  // Reference points cross-checked against jdate / momentjs-jalaali.
  it.each<[gy: number, gm: number, gd: number, expected: [number, number, number]]>([
    [2026, 5, 19, [1405, 2, 29]],
    [2024, 3, 20, [1403, 1, 1]], // Nowruz (Persian new year) 1403
    [2024, 3, 21, [1403, 1, 2]],
    [2000, 1, 1, [1378, 10, 11]],
    [1979, 2, 11, [1357, 11, 22]], // historical reference
    [2026, 12, 31, [1405, 10, 10]],
  ])('Gregorian %i-%i-%i → Jalali %s', (gy, gm, gd, expected) => {
    expect(gregorianToJalali(gy, gm, gd)).toEqual(expected);
  });
});

describe('dateEn', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(dateEn(new Date(2026, 4, 19))).toBe('2026-05-19');
  });
  it('zero-pads single-digit months and days', () => {
    expect(dateEn(new Date(2024, 0, 5))).toBe('2024-01-05');
  });
  it('accepts an ISO string', () => {
    // Use noon UTC to avoid any timezone date-shifting noise.
    expect(dateEn('2026-05-19T12:00:00Z')).toMatch(/^2026-05-(19|20)$/);
  });
  it('accepts a numeric timestamp', () => {
    const ts = new Date(2026, 4, 19).getTime();
    expect(dateEn(ts)).toBe('2026-05-19');
  });
  it('throws on invalid input', () => {
    expect(() => dateEn('not-a-date')).toThrow();
  });
});

describe('dateFa', () => {
  it('formats with Persian digits and slashes', () => {
    expect(dateFa(new Date(2026, 4, 19))).toBe('۱۴۰۵/۰۲/۲۹');
  });
  it('zero-pads single-digit Jalali month/day', () => {
    expect(dateFa(new Date(2024, 2, 20))).toBe('۱۴۰۳/۰۱/۰۱'); // Nowruz
  });
});
