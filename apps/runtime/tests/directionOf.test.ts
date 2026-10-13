import { describe, expect, it } from 'vitest';
import { directionOf } from '../src/renderer/ui/OperatorNames.js';

/**
 * 🔴 `B-303` — **A NAME'S OWN DIRECTION.** `dir="auto"` reads the FIRST strong letter, so the owner's
 * `NDI کانالِ ۱ (APASAI)` was laid out left to right. A name with any right-to-left letter is laid out
 * right to left; a name with none, left to right; a digit is not a letter.
 */
describe('directionOf', () => {
  it('🔴 a Persian name that starts with a Latin word is RTL', () => {
    expect(directionOf('NDI کانالِ ۱ (APASAI)')).toBe('rtl');
  });

  it('a Persian name, and an Arabic or Hebrew one, are RTL', () => {
    expect(directionOf('دوربین خبر')).toBe('rtl');
    expect(directionOf('قناة ١')).toBe('rtl');
    expect(directionOf('ערוץ 2')).toBe('rtl');
  });

  it('CONTROL — a Latin name, with parentheses and digits, stays LTR', () => {
    expect(directionOf('Studio 1')).toBe('ltr');
    expect(directionOf('MTA (APASAI)')).toBe('ltr');
    expect(directionOf('')).toBe('ltr');
  });

  it('Persian and Arabic-Indic DIGITS alone are not letters: LTR', () => {
    expect(directionOf('۱۲۳')).toBe('ltr');
    expect(directionOf('٤٥')).toBe('ltr');
    expect(directionOf('Clip ۰۰۱')).toBe('ltr');
  });
});
