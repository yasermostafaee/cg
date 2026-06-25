import { describe, expect, it } from 'vitest';
import { normalizeHexColor } from '../src/renderer/color.js';

describe('normalizeHexColor (D-079)', () => {
  it('expands 1/2/3-char shorthand to 6 chars', () => {
    expect(normalizeHexColor('f')).toBe('#FFFFFF');
    expect(normalizeHexColor('f0')).toBe('#F0F0F0');
    expect(normalizeHexColor('fe2')).toBe('#FE2FE2');
  });

  it('passes 6- and 8-char (alpha) values through, uppercased', () => {
    expect(normalizeHexColor('ffaa00')).toBe('#FFAA00');
    expect(normalizeHexColor('ffaa0080')).toBe('#FFAA0080');
  });

  it('tolerates a leading # and surrounding whitespace', () => {
    expect(normalizeHexColor('#ffaa00')).toBe('#FFAA00');
    expect(normalizeHexColor('  fe2 ')).toBe('#FE2FE2');
  });

  it('returns null for invalid input (non-hex, empty, or length 4/5/7/>8)', () => {
    expect(normalizeHexColor('gtd')).toBeNull();
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor('   ')).toBeNull();
    expect(normalizeHexColor('fe2a')).toBeNull(); // 4
    expect(normalizeHexColor('fe2ab')).toBeNull(); // 5
    expect(normalizeHexColor('fe2abc1')).toBeNull(); // 7
    expect(normalizeHexColor('fe2abc1234')).toBeNull(); // >8
  });
});
