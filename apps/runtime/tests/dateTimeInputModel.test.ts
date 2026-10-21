import { describe, expect, it } from 'vitest';
import { isoOfInstant } from '@cg/text-shaping';
import {
  EMPTY_DRAFTS,
  addMonths,
  dayInWords,
  draftsOfValue,
  monthGrid,
  normalizeDrafts,
  pasteDrafts,
  readDrafts,
  segmentDigits,
  stepDrafts,
  valueAt,
  writeDraft,
  type Drafts,
} from '../src/renderer/ui/dateTimeInputModel.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1 — the date and time control's rules, without React.
 *
 * Every instant here is built on THIS machine's clock (`new Date(y, m, d, …)`) and stored through
 * `isoOfInstant`, exactly as the control stores it, so the file passes in any time zone: what is
 * pinned is that three calendars and three digit sets name ONE stored value.
 *
 * Reference day: 2026-10-15 (Gregorian) = 1405/07/23 (Jalali) =1448/05/04 (Lunar Hijri,
 * Umm al-Qura) — read off `@cg/text-shaping`'s own conversions.
 */

const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0): string =>
  isoOfInstant(new Date(y, m - 1, d, h, mi, s).getTime());

const EVENT = at(2026, 10, 15, 21, 45, 0);

const drafts = (d: Partial<Drafts>): Drafts => ({ ...EMPTY_DRAFTS, ...d });

describe('segmentDigits — the field decides, as typed follows the calendar', () => {
  it('as-typed: Persian in the Hijri calendars, Latin in the Gregorian', () => {
    expect(segmentDigits('as-typed', 'solar-hijri')).toBe('persian');
    expect(segmentDigits('as-typed', 'lunar-hijri')).toBe('persian');
    expect(segmentDigits('as-typed', 'gregorian')).toBe('latin');
  });
  it('a field’s own set wins in every calendar', () => {
    expect(segmentDigits('latin', 'solar-hijri')).toBe('latin');
    expect(segmentDigits('arabic-indic', 'gregorian')).toBe('arabic-indic');
  });
  it('a draft keeps only digits, in the shown set, at most its width', () => {
    expect(writeDraft('14a05', 'year', 'persian')).toBe('۱۴۰۵');
    expect(writeDraft('٠٧', 'month', 'latin')).toBe('07');
    expect(writeDraft('123', 'month', 'latin')).toBe('12');
  });
});

describe('three calendars, one stored value', () => {
  it('Jalali, Gregorian and Lunar Hijri drafts of one day round-trip to the SAME ISO', () => {
    const time = { hour: '21', minute: '45', second: '00' };
    const solar = readDrafts(
      drafts({ year: '1405', month: '07', day: '23', ...time }),
      'datetime',
      'solar-hijri',
      0,
    );
    const greg = readDrafts(
      drafts({ year: '2026', month: '10', day: '15', ...time }),
      'datetime',
      'gregorian',
      0,
    );
    const lunar = readDrafts(
      drafts({ year: '1448', month: '05', day: '04', ...time }),
      'datetime',
      'lunar-hijri',
      0,
    );
    expect(solar.value).toBe(EVENT);
    expect(greg.value).toBe(EVENT);
    expect(lunar.value).toBe(EVENT);
    expect(solar.gregorian).toEqual({ year: 2026, month: 10, day: 15 });
  });

  it('digits in any of the three sets read the same', () => {
    const persian = drafts({
      year: '۱۴۰۵',
      month: '۰۷',
      day: '۲۳',
      hour: '۲۱',
      minute: '۴۵',
      second: '۰۰',
    });
    const arabic = drafts({
      year: '١٤٠٥',
      month: '٠٧',
      day: '٢٣',
      hour: '٢١',
      minute: '٤٥',
      second: '٠٠',
    });
    expect(readDrafts(persian, 'datetime', 'solar-hijri', 0).value).toBe(EVENT);
    expect(readDrafts(arabic, 'datetime', 'solar-hijri', 0).value).toBe(EVENT);
  });

  it('the stored value shows back in each calendar, in the shown digits', () => {
    expect(draftsOfValue(EVENT, 'datetime', 'solar-hijri', 0, 'persian')).toEqual({
      year: '۱۴۰۵',
      month: '۰۷',
      day: '۲۳',
      hour: '۲۱',
      minute: '۴۵',
      second: '۰۰',
    });
    expect(draftsOfValue(EVENT, 'datetime', 'gregorian', 0, 'latin')).toMatchObject({
      year: '2026',
      month: '10',
      day: '15',
    });
    expect(draftsOfValue(EVENT, 'datetime', 'lunar-hijri', 0, 'latin')).toMatchObject({
      year: '1448',
      month: '05',
      day: '04',
    });
    expect(draftsOfValue('', 'datetime', 'solar-hijri', 0, 'persian')).toEqual(EMPTY_DRAFTS);
  });
});

describe('the Lunar Hijri day adjustment — display and entry, nothing else', () => {
  it('+1 day: the same instant reads one lunar day later, and that entry stores the same ISO', () => {
    expect(draftsOfValue(EVENT, 'datetime', 'lunar-hijri', 1, 'latin')).toMatchObject({
      year: '1448',
      month: '05',
      day: '05',
    });
    const entered = drafts({
      year: '1448',
      month: '05',
      day: '05',
      hour: '21',
      minute: '45',
      second: '00',
    });
    expect(readDrafts(entered, 'datetime', 'lunar-hijri', 1).value).toBe(EVENT);
    // …and it moves only the Lunar reading: the Jalali entry is untouched by it.
    const solar = drafts({
      year: '1405',
      month: '07',
      day: '23',
      hour: '21',
      minute: '45',
      second: '00',
    });
    expect(readDrafts(solar, 'datetime', 'solar-hijri', 2).value).toBe(EVENT);
  });

  it('a lunar month boundary: the 30th exists in a 30-day month and not in a 29-day one', () => {
    const base = { hour: '12', minute: '00', second: '00' };
    expect(
      readDrafts(
        drafts({ year: '1448', month: '04', day: '30', ...base }),
        'datetime',
        'lunar-hijri',
        0,
      ).value,
    ).not.toBeNull();
    const short = readDrafts(
      drafts({ year: '1448', month: '03', day: '30', ...base }),
      'datetime',
      'lunar-hijri',
      0,
    );
    expect(short.value).toBeNull();
    expect(short.invalid.has('day')).toBe(true);
  });
});

describe('what an incomplete, an impossible and a seconds-free draft store', () => {
  it('incomplete stores nothing and marks nothing', () => {
    const r = readDrafts(
      drafts({ year: '1405', month: '', day: '23' }),
      'datetime',
      'solar-hijri',
      0,
    );
    expect(r.value).toBeNull();
    expect([...r.invalid]).toEqual([]);
  });

  it('impossible marks its segment: a 13th month, the 31st of Mehr, Esfand 30 of a common year', () => {
    const time = { hour: '10', minute: '00', second: '00' };
    expect(
      readDrafts(
        drafts({ year: '1405', month: '13', day: '01', ...time }),
        'datetime',
        'solar-hijri',
        0,
      ).invalid,
    ).toEqual(new Set(['month']));
    expect(
      readDrafts(
        drafts({ year: '1405', month: '07', day: '31', ...time }),
        'datetime',
        'solar-hijri',
        0,
      ).invalid,
    ).toEqual(new Set(['day']));
    expect(
      readDrafts(
        drafts({ year: '1404', month: '12', day: '30', ...time }),
        'datetime',
        'solar-hijri',
        0,
      ).invalid,
    ).toEqual(new Set(['day']));
    // …and a leap year's Esfand 30 is a real day.
    expect(
      readDrafts(
        drafts({ year: '1403', month: '12', day: '30', ...time }),
        'datetime',
        'solar-hijri',
        0,
      ).value,
    ).not.toBeNull();
  });

  it('seconds left out: a date and time stores :00, a time of day stores HH:mm', () => {
    expect(
      readDrafts(
        drafts({ year: '1405', month: '07', day: '23', hour: '21', minute: '45' }),
        'datetime',
        'solar-hijri',
        0,
      ).value,
    ).toBe(EVENT);
    expect(
      readDrafts(drafts({ hour: '۲۱', minute: '۴۵' }), 'timeofday', 'solar-hijri', 0).value,
    ).toBe('21:45');
    expect(
      readDrafts(drafts({ hour: '21', minute: '45', second: '07' }), 'timeofday', 'gregorian', 0)
        .value,
    ).toBe('21:45:07');
  });

  it('a time of day shows back with or without its seconds', () => {
    expect(draftsOfValue('21:45', 'timeofday', 'solar-hijri', 0, 'persian')).toMatchObject({
      hour: '۲۱',
      minute: '۴۵',
      second: '',
    });
    expect(draftsOfValue('21:45:07', 'timeofday', 'gregorian', 0, 'latin')).toMatchObject({
      second: '07',
    });
  });
});

describe('leaving a segment, Up / Down, a paste and the shortcuts', () => {
  it('leaving a segment writes it whole and pulls it inside its range', () => {
    const out = normalizeDrafts(
      drafts({ year: '1405', month: '7', day: '31', hour: '9', minute: '5' }),
      'datetime',
      'solar-hijri',
      0,
      'persian',
    );
    expect(out).toEqual({
      year: '۱۴۰۵',
      month: '۰۷',
      day: '۳۰',
      hour: '۰۹',
      minute: '۰۵',
      second: '۰۰',
    });
  });

  it('Up on 23 wraps to 00; Down on the 1st of Mehr wraps to its 30th', () => {
    const d = drafts({
      year: '1405',
      month: '07',
      day: '01',
      hour: '23',
      minute: '45',
      second: '00',
    });
    expect(stepDrafts(d, 'hour', 1, 'datetime', 'solar-hijri', 0, 'latin', 0).hour).toBe('00');
    expect(stepDrafts(d, 'day', -1, 'datetime', 'solar-hijri', 0, 'latin', 0).day).toBe('30');
  });

  it('an EMPTY segment steps from now; a time of day without seconds keeps them out', () => {
    const now = new Date(2026, 9, 15, 8, 30, 12).getTime();
    const out = stepDrafts(
      drafts({ hour: '', minute: '10' }),
      'hour',
      1,
      'timeofday',
      'gregorian',
      0,
      'latin',
      now,
    );
    expect(out).toMatchObject({ hour: '09', minute: '10', second: '' });
  });

  it('a pasted date and time fills every segment, in the shown calendar', () => {
    expect(
      pasteDrafts('2026-10-15 21:45', EMPTY_DRAFTS, 'datetime', 'solar-hijri', 0, 'persian'),
    ).toEqual({
      year: '۱۴۰۵',
      month: '۰۷',
      day: '۲۳',
      hour: '۲۱',
      minute: '۴۵',
      second: '۰۰',
    });
    expect(pasteDrafts(EVENT, EMPTY_DRAFTS, 'datetime', 'gregorian', 0, 'latin')).toMatchObject({
      year: '2026',
      month: '10',
      day: '15',
      hour: '21',
    });
  });

  it('a pasted time of day keeps its seconds out; text that is no date or time pastes nothing', () => {
    expect(
      pasteDrafts('۲۱:۴۵', EMPTY_DRAFTS, 'timeofday', 'solar-hijri', 0, 'persian'),
    ).toMatchObject({ hour: '۲۱', minute: '۴۵', second: '' });
    expect(pasteDrafts('hello', EMPTY_DRAFTS, 'datetime', 'solar-hijri', 0, 'persian')).toBeNull();
  });

  it('a shortcut stores the instant for the mode', () => {
    const ms = new Date(2026, 9, 15, 21, 50, 0).getTime();
    expect(valueAt(ms, 'datetime')).toBe(at(2026, 10, 15, 21, 50, 0));
    expect(valueAt(ms, 'timeofday')).toBe('21:50');
    expect(valueAt(ms + 7_000, 'timeofday')).toBe('21:50:07');
  });
});

describe('the month grid', () => {
  it('Mehr 1405: thirty days, the week starting Saturday, the 1st under its own weekday', () => {
    const grid = monthGrid('solar-hijri', 1405, 7, 0);
    expect(grid.days).toBe(30);
    expect(grid.heads[0]).toBe('ش');
    // 1 Mehr 1405 is Wednesday 2026-09-23: Sat Sun Mon Tue come first.
    expect(grid.leading).toBe(4);
  });

  it('October 2026: Monday first, the 1st (a Thursday) after three blanks', () => {
    const grid = monthGrid('gregorian', 2026, 10, 0);
    expect(grid.heads[0]).toBe('Mo');
    expect(grid.leading).toBe(3);
    expect(grid.days).toBe(31);
  });

  it('months step across a year', () => {
    expect(addMonths({ year: 1405, month: 12 }, 1)).toEqual({ year: 1406, month: 1 });
    expect(addMonths({ year: 1405, month: 1 }, -1)).toEqual({ year: 1404, month: 12 });
  });

  it('a day in words, in that calendar’s month names and the shown digits', () => {
    expect(dayInWords({ year: 2026, month: 10, day: 15 }, 'gregorian', 'latin')).toBe(
      '15 October 2026',
    );
    expect(dayInWords({ year: 1405, month: 7, day: 23 }, 'solar-hijri', 'persian')).toBe(
      '۲۳ مهر ۱۴۰۵',
    );
  });
});
