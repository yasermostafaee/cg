import { describe, expect, it } from 'vitest';
import { writeFieldDigits, type FieldDigits } from '../src/field-digits.js';

/** `FIELD-DIGITS-01` §2 — the prompt's own five values. */
const VALUES = ['12.5', '-3', '1234567', 'ساعت 12:30', 'F-16'] as const;
const CHOICES: readonly FieldDigits[] = ['as-typed', 'persian', 'latin', 'arabic-indic'];
const KINDS = ['text', 'number'] as const;
const ANY_DIGIT = /[0-9۰-۹٠-٩]/;

describe('writeFieldDigits (FIELD-DIGITS-01)', () => {
  it('writes a number in each set, with its decimal mark and no grouping', () => {
    expect(writeFieldDigits('12.5', 'persian', 'number')).toBe('۱۲٫۵');
    expect(writeFieldDigits('12.5', 'arabic-indic', 'number')).toBe('١٢٫٥');
    expect(writeFieldDigits('12.5', 'latin', 'number')).toBe('12.5');
    expect(writeFieldDigits('-3', 'persian', 'number')).toBe('-۳');
    expect(writeFieldDigits('-3', 'arabic-indic', 'number')).toBe('-٣');
    expect(writeFieldDigits('1234567', 'persian', 'number')).toBe('۱۲۳۴۵۶۷');
    expect(writeFieldDigits('1234567', 'arabic-indic', 'number')).toBe('١٢٣٤٥٦٧');
  });

  it('brings a number typed in any set to the chosen one', () => {
    expect(writeFieldDigits('۱۲٫۵', 'latin', 'number')).toBe('12.5');
    expect(writeFieldDigits('١٢.٥', 'persian', 'number')).toBe('۱۲٫۵');
    expect(writeFieldDigits('۱۲٫۵', 'arabic-indic', 'number')).toBe('١٢٫٥');
  });

  it('writes the digits of text in the chosen set and leaves its punctuation as typed', () => {
    expect(writeFieldDigits('ساعت 12:30', 'persian')).toBe('ساعت ۱۲:۳۰');
    expect(writeFieldDigits('ساعت 12:30', 'arabic-indic')).toBe('ساعت ١٢:٣٠');
    expect(writeFieldDigits('ساعت ۱۲:۳۰', 'latin')).toBe('ساعت 12:30');
    expect(writeFieldDigits('F-16', 'persian')).toBe('F-۱۶');
    expect(writeFieldDigits('F-16', 'arabic-indic')).toBe('F-١٦');
    // Text keeps the `.` it was typed with; only a NUMBER's mark follows its digits.
    expect(writeFieldDigits('12.5', 'persian')).toBe('۱۲.۵');
    expect(writeFieldDigits('۱۲٫۵', 'latin')).toBe('12٫5');
  });

  it('as-typed is the identity, for text and for a number (the control)', () => {
    for (const value of [...VALUES, '۱۲٫۵', 'mixed ۱2٣', '']) {
      expect(writeFieldDigits(value, 'as-typed')).toBe(value);
      expect(writeFieldDigits(value, 'as-typed', 'number')).toBe(value);
    }
  });

  it('text without a digit is unchanged by every choice (the control)', () => {
    for (const choice of CHOICES) {
      for (const kind of KINDS) {
        expect(writeFieldDigits('خبر فوری — Breaking!', choice, kind)).toBe('خبر فوری — Breaking!');
      }
    }
  });

  it('is idempotent', () => {
    for (const value of VALUES) {
      for (const choice of CHOICES) {
        for (const kind of KINDS) {
          const once = writeFieldDigits(value, choice, kind);
          expect(writeFieldDigits(once, choice, kind)).toBe(once);
        }
      }
    }
  });

  it('changes one character for one, and nothing that is not a digit in text', () => {
    for (const value of VALUES) {
      for (const choice of CHOICES) {
        const typed = [...value];
        const written = [...writeFieldDigits(value, choice)];
        expect(written).toHaveLength(typed.length);
        typed.forEach((ch, i) => {
          if (!ANY_DIGIT.test(ch)) expect(written[i]).toBe(ch);
        });
      }
    }
  });
});
