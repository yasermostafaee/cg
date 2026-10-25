import { describe, expect, it } from 'vitest';
import {
  formatUtcOffset,
  parseUtcOffset,
} from '../src/renderer/features/inspector/clock-offset.js';

describe('clock custom UTC offset (D-134)', () => {
  it('formats stored minutes as canonical signed HH:MM', () => {
    expect(formatUtcOffset(0)).toBe('+00:00');
    expect(formatUtcOffset(210)).toBe('+03:30');
    expect(formatUtcOffset(-240)).toBe('-04:00');
    expect(formatUtcOffset(765)).toBe('+12:45');
  });

  it('parses Latin, Persian and Arabic-Indic digits', () => {
    expect(parseUtcOffset('+03:30')).toBe(210);
    expect(parseUtcOffset('-۰۴:۰۰')).toBe(-240);
    expect(parseUtcOffset('+٠٥:٤٥')).toBe(345);
  });

  it('accepts the boundaries and rejects malformed or out-of-range drafts', () => {
    expect(parseUtcOffset('-14:00')).toBe(-840);
    expect(parseUtcOffset('+14:00')).toBe(840);
    for (const invalid of ['03:30', '+3:30', '+03:60', '+14:01', '-15:00', 'UTC+03:30', '']) {
      expect(parseUtcOffset(invalid)).toBeUndefined();
    }
  });
});
