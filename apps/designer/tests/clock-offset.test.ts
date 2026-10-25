import { describe, expect, it } from 'vitest';
import {
  editUtcOffsetMask,
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

  it('owns the sign and separators, ignores letters, and fills the four digit slots', () => {
    let edit = editUtcOffsetMask('+00:00', '-', 0, 6);
    expect(edit).toMatchObject({ text: '-HH:MM', caret: 1 });
    for (const key of ['0', '3', '3', '0']) {
      edit = editUtcOffsetMask(edit.text, key, edit.caret);
    }
    expect(edit).toMatchObject({ text: '-03:30', caret: 6 });
    expect(parseUtcOffset(edit.text)).toBe(-210);

    expect(editUtcOffsetMask(edit.text, 'x', 2)).toEqual({ text: '-03:30', caret: 2 });
    expect(editUtcOffsetMask(edit.text, ':', 2)).toEqual({ text: '-03:30', caret: 2 });
  });

  it('refuses an impossible edit before it appears in the mask', () => {
    const tooLarge = editUtcOffsetMask('+1H:00', '5', 2);
    expect(tooLarge.text).toBe('+1H:00');
    expect(tooLarge.refused).toContain('−14:00');

    const beyondBoundary = editUtcOffsetMask('+14:00', '1', 5);
    expect(beyondBoundary.text).toBe('+14:00');
    expect(beyondBoundary.refused).toContain('+14:00');
  });
});
