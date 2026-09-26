import { describe, expect, it } from 'vitest';
import {
  digitSetOf,
  formatNumberLike,
  latinNumerals,
  parseDurationMs,
  parseLocalizedNumber,
  parseTimeOfDay,
  readLocalizedDuration,
  readLocalizedNumber,
} from '../src/numerals.js';

/**
 * `PERSIAN-DIGITS-01` §2 B — THE ONE READER of a number-shaped template value, whatever keyboard
 * typed it. Every rule below is paired with its control: a reader that accepted everything would
 * pass every "accepts" line and fail the refusals, and one that refused everything the reverse.
 *
 * Invisible characters are written as escapes, never as literal bytes (golden rule 9).
 */

describe('readLocalizedNumber — the three digit sets are one number', () => {
  it('reads twelve and a half in Persian, Arabic-Indic and Latin', () => {
    expect(parseLocalizedNumber('۱۲٫۵')).toBe(12.5);
    expect(parseLocalizedNumber('١٢٫٥')).toBe(12.5);
    expect(parseLocalizedNumber('12.5')).toBe(12.5);
  });

  it('reads the Latin point beside Persian digits, and ٫ beside Latin ones', () => {
    expect(parseLocalizedNumber('۱۲.۵')).toBe(12.5);
    expect(parseLocalizedNumber('12٫5')).toBe(12.5);
  });

  it('reads ٬ (U+066C) as a thousands separator between digit groups', () => {
    expect(parseLocalizedNumber('۱٬۲۳۴')).toBe(1234);
    expect(parseLocalizedNumber('۱٬۲۳۴٬۵۶۷٫۸')).toBe(1234567.8);
  });

  it('reads a sign, including the typographic minus (U+2212)', () => {
    expect(parseLocalizedNumber('-۴۰')).toBe(-40);
    expect(parseLocalizedNumber('−۴۰')).toBe(-40);
    expect(parseLocalizedNumber('+۷')).toBe(7);
  });

  it('ignores surrounding space and the bidi marks a paste from a Persian document carries', () => {
    expect(parseLocalizedNumber('  ۱۲  ')).toBe(12);
    expect(parseLocalizedNumber('‏۱۲‎')).toBe(12);
    expect(parseLocalizedNumber('؜۱۲')).toBe(12);
  });

  it('reads a Latin integer exactly as Number() does (the Latin control)', () => {
    for (const s of ['0', '7', '128', '5250', '-3', '0.25']) {
      expect(parseLocalizedNumber(s)).toBe(Number(s));
    }
  });
});

describe('readLocalizedNumber — the impossible is INVALID, the half-typed is INCOMPLETE', () => {
  it('refuses a letter, whatever digits surround it', () => {
    expect(readLocalizedNumber('۱۲a')).toEqual({ kind: 'invalid' });
    expect(readLocalizedNumber('12a')).toEqual({ kind: 'invalid' });
    expect(readLocalizedNumber('ده')).toEqual({ kind: 'invalid' });
  });

  it('refuses shapes more typing can never repair', () => {
    for (const s of ['1.2.3', '۱٫۲٫۳', '1٬٬2', '٬12', '12٬.5', '1 234', '--1', '1-']) {
      expect(readLocalizedNumber(s), s).toEqual({ kind: 'invalid' });
    }
  });

  it('refuses a Latin comma as a separator — `1,5` must never quietly read as fifteen', () => {
    expect(readLocalizedNumber('1,5')).toEqual({ kind: 'invalid' });
    expect(readLocalizedNumber('1,234')).toEqual({ kind: 'invalid' });
  });

  it('calls empty, a lone sign, a lone separator and a trailing ٬ INCOMPLETE — not an error', () => {
    for (const s of ['', '   ', '-', '+', '−', '.', '٫', '-٫', '۱٬', '۱٬۲۳۴٬']) {
      expect(readLocalizedNumber(s), JSON.stringify(s)).toEqual({ kind: 'incomplete' });
    }
  });

  it('reads a trailing decimal mark as the integer it already is (typing `۱۲٫` on the way)', () => {
    expect(readLocalizedNumber('۱۲٫')).toEqual({ kind: 'number', value: 12 });
    expect(readLocalizedNumber('12.')).toEqual({ kind: 'number', value: 12 });
  });

  it('parseLocalizedNumber is null for anything that is not a number', () => {
    expect(parseLocalizedNumber('۱۲a')).toBeNull();
    expect(parseLocalizedNumber('')).toBeNull();
    expect(parseLocalizedNumber('-')).toBeNull();
  });

  it('never returns negative zero', () => {
    expect(Object.is(parseLocalizedNumber('-۰'), 0)).toBe(true);
  });
});

describe('parseTimeOfDay — a time typed in any digit set, returned canonical', () => {
  it('reads HH:mm and HH:mm:ss in all three sets', () => {
    expect(parseTimeOfDay('۲۰:۳۲')).toBe('20:32');
    expect(parseTimeOfDay('٢٠:٣٢')).toBe('20:32');
    expect(parseTimeOfDay('20:32')).toBe('20:32');
    expect(parseTimeOfDay('۰۵:۰۰:۰۷')).toBe('05:00:07');
  });

  it('ignores bidi marks and surrounding space', () => {
    expect(parseTimeOfDay('‏۲۰:۳۲ ')).toBe('20:32');
  });

  it('refuses what is not a time of day (the control)', () => {
    for (const v of ['۲۵:۳۲', '24:00', '۲۰:۶۰', '۲۰', '2:30', 'nonsense', '', '۲۰٫۳۲']) {
      expect(parseTimeOfDay(v), v).toBeUndefined();
    }
    expect(parseTimeOfDay(2032)).toBeUndefined();
    expect(parseTimeOfDay(undefined)).toBeUndefined();
  });
});

describe('parseDurationMs — `۰۰:۳۰` is thirty seconds', () => {
  it('reads m:ss in all three sets', () => {
    expect(parseDurationMs('۰۰:۳۰')).toBe(30_000);
    expect(parseDurationMs('٠٠:٣٠')).toBe(30_000);
    expect(parseDurationMs('00:30')).toBe(30_000);
    expect(parseDurationMs('۱:۰۵')).toBe(65_000);
  });

  it('reads h:mm:ss', () => {
    expect(parseDurationMs('۱:۰۰:۰۰')).toBe(3_600_000);
  });

  it('reads a bare number as SECONDS, in any set, with either decimal mark', () => {
    expect(parseDurationMs('۳۰')).toBe(30_000);
    expect(parseDurationMs('۲٫۵')).toBe(2_500);
    expect(parseDurationMs('2.5')).toBe(2_500);
  });

  it('refuses what is not a duration (the control)', () => {
    for (const v of ['۰۰:۶۰', '1:5', '-۳۰', '۱۲a', '', '1:2:3:4', ':30']) {
      expect(parseDurationMs(v), v).toBeNull();
    }
  });
});

describe('readLocalizedDuration — the half-typed is INCOMPLETE, the impossible INVALID', () => {
  it('reads a complete duration', () => {
    expect(readLocalizedDuration('۰۰:۳۰')).toEqual({ kind: 'number', value: 30_000 });
    expect(readLocalizedDuration('۲٫۵')).toEqual({ kind: 'number', value: 2_500 });
  });

  it('calls a duration on its way to being typed INCOMPLETE', () => {
    for (const s of ['', '۰۰:', '۰۰:۳', '۱:۰۰:', '۱:۰۰:۵', '.']) {
      expect(readLocalizedDuration(s), JSON.stringify(s)).toEqual({ kind: 'incomplete' });
    }
  });

  it('calls what no more typing repairs INVALID', () => {
    for (const s of ['۰۰:۶۰', '۱۲a', '-۳۰', ':30', '1:2:3:4', '۱:۰۰۰']) {
      expect(readLocalizedDuration(s), s).toEqual({ kind: 'invalid' });
    }
  });
});

describe('latinNumerals — what a pattern check reads', () => {
  it('reads digits, ٫ and ٬ as Latin and leaves every other character', () => {
    expect(latinNumerals('ساعت ۲۱:۳۰')).toBe('ساعت 21:30');
    expect(latinNumerals('۱٬۲۳۴٫۵')).toBe('1,234.5');
    expect(latinNumerals('IRN۲')).toBe('IRN2');
  });

  it('leaves a Latin value byte-identical (the control)', () => {
    expect(latinNumerals('news@channel.tv 21:30')).toBe('news@channel.tv 21:30');
  });
});

describe('digitSetOf / formatNumberLike — a number written back the way it was typed', () => {
  it('names the set the text is written in (its first digit decides)', () => {
    expect(digitSetOf('۱۲٫۵')).toBe('persian');
    expect(digitSetOf('١٢')).toBe('arabic-indic');
    expect(digitSetOf('12')).toBe('latin');
    expect(digitSetOf('')).toBe('latin');
  });

  it('writes a new value in the typed set and with the typed decimal mark', () => {
    expect(formatNumberLike(13.5, '۱۲٫۵')).toBe('۱۳٫۵');
    expect(formatNumberLike(13.5, '۱۲.۵')).toBe('۱۳.۵');
    expect(formatNumberLike(13.5, '١٢٫٥')).toBe('١٣٫٥');
    expect(formatNumberLike(-4, '۵')).toBe('-۴');
    expect(formatNumberLike(13.5, '12٫5')).toBe('13٫5');
  });

  it('uses ٫ for a new fraction in Persian text that had none', () => {
    expect(formatNumberLike(2.5, '۲')).toBe('۲٫۵');
  });

  it('keeps ٬ grouping when the typed text used it', () => {
    expect(formatNumberLike(1235, '۱٬۲۳۴')).toBe('۱٬۲۳۵');
  });

  it('writes Latin for Latin text — exactly String(n) (the control)', () => {
    for (const n of [0, 5, 13.5, -40, 1234]) expect(formatNumberLike(n, '12')).toBe(String(n));
  });

  it('round-trips through the reader', () => {
    for (const [n, sample] of [
      [13.5, '۱۲٫۵'],
      [1235, '۱٬۲۳۴'],
      [-7, '١'],
    ] as const) {
      expect(parseLocalizedNumber(formatNumberLike(n, sample))).toBe(n);
    }
  });
});
