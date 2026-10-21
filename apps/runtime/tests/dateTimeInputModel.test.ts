import { describe, expect, it } from 'vitest';
import { masksOfValue, valueOfMasks } from '@cg/gesture';
import {
  emptySlots,
  isoOfInstant,
  maskRefusal,
  maskText,
  slotsOfParts,
  type CalendarSystem,
  type DateTimeParts,
} from '@cg/text-shaping';
import {
  addMonths,
  dayInWords,
  monthGrid,
  segmentDigits,
  valueAt,
} from '../src/renderer/ui/dateTimeInputModel.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1 — the date and time control's rules, without React.
 * `RUN-NEXT-VERSION-03` 2.1 — the typing moved to the shared mask (`@cg/text-shaping`'s
 * `date-time-mask`, `@cg/gesture`'s `useMaskedDateTime`); what is pinned here is unchanged: three
 * calendars and three digit sets name ONE stored value, the Lunar Hijri adjustment moves only the Lunar
 * reading, and a time of day keeps its two spellings.
 *
 * Every instant is built on THIS machine's clock (`new Date(y, m, d, …)`) and stored through
 * `isoOfInstant`, exactly as the control stores it, so the file passes in any time zone.
 *
 * Reference day: 2026-10-15 (Gregorian) = 1405/07/23 (Jalali) = 1448/05/04 (Lunar Hijri,
 * Umm al-Qura) — read off `@cg/text-shaping`'s own conversions.
 */

const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0): string =>
  isoOfInstant(new Date(y, m - 1, d, h, mi, s).getTime());

const EVENT = at(2026, 10, 15, 21, 45, 0);

/** The two masks a date and time names. */
const masks = (p: Partial<DateTimeParts>) => ({
  date: slotsOfParts('date', p),
  time: slotsOfParts('time', p),
});
const stored = (p: Partial<DateTimeParts>, calendar: CalendarSystem, adjust = 0) =>
  valueOfMasks(masks(p), 'datetime', calendar, adjust);

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
});

describe('three calendars, one stored value', () => {
  it('Jalali, Gregorian and Lunar Hijri masks of one day name the SAME ISO', () => {
    const time = { hour: 21, minute: 45, second: 0 };
    expect(stored({ year: 1405, month: 7, day: 23, ...time }, 'solar-hijri')).toBe(EVENT);
    expect(stored({ year: 2026, month: 10, day: 15, ...time }, 'gregorian')).toBe(EVENT);
    expect(stored({ year: 1448, month: 5, day: 4, ...time }, 'lunar-hijri')).toBe(EVENT);
  });

  it('the stored value shows back in each calendar, in the shown digits', () => {
    const jalali = masksOfValue(EVENT, 'datetime', 'solar-hijri', 0);
    expect(maskText('date', jalali.date, 'persian')).toBe('۱۴۰۵/۰۷/۲۳');
    expect(maskText('time', jalali.time, 'persian')).toBe('۲۱:۴۵:۰۰');
    expect(maskText('date', masksOfValue(EVENT, 'datetime', 'gregorian', 0).date, 'latin')).toBe(
      '2026/10/15',
    );
    expect(
      maskText('date', masksOfValue(EVENT, 'datetime', 'lunar-hijri', 0).date, 'arabic-indic'),
    ).toBe('١٤٤٨/٠٥/٠٤');
    expect(masksOfValue('', 'datetime', 'solar-hijri', 0).date).toEqual(emptySlots('date'));
  });
});

describe('the Lunar Hijri day adjustment — display and entry, nothing else', () => {
  it('+1 day: the same instant reads one lunar day later, and that entry stores the same ISO', () => {
    expect(maskText('date', masksOfValue(EVENT, 'datetime', 'lunar-hijri', 1).date, 'latin')).toBe(
      '1448/05/05',
    );
    const time = { hour: 21, minute: 45, second: 0 };
    expect(stored({ year: 1448, month: 5, day: 5, ...time }, 'lunar-hijri', 1)).toBe(EVENT);
    // …and it moves only the Lunar reading: the Jalali entry is untouched by it.
    expect(stored({ year: 1405, month: 7, day: 23, ...time }, 'solar-hijri', 2)).toBe(EVENT);
  });

  it('a lunar month boundary: the 30th exists in a 30-day month and is refused in a 29-day one', () => {
    const ctx = { calendar: 'lunar-hijri' as const, adjust: 0 };
    expect(maskRefusal('date', slotsOfParts('date', { year: 1448, month: 4, day: 30 }), ctx)).toBe(
      null,
    );
    expect(maskRefusal('date', slotsOfParts('date', { year: 1448, month: 3, day: 30 }), ctx)).toBe(
      'This month has 29 days.',
    );
  });
});

describe('what an incomplete date and a seconds-free time store', () => {
  it('incomplete stores nothing', () => {
    expect(stored({ year: 1405, day: 23, hour: 21, minute: 45 }, 'solar-hijri')).toBeNull();
  });

  it('seconds left out: a date and time stores :00, a time of day stores HH:mm', () => {
    const noSeconds = {
      date: slotsOfParts('date', { year: 1405, month: 7, day: 23 }),
      time: slotsOfParts('time', { hour: 21, minute: 45 }),
    };
    expect(valueOfMasks(noSeconds, 'datetime', 'solar-hijri', 0)).toBe(EVENT);
    expect(valueOfMasks(noSeconds, 'timeofday', 'solar-hijri', 0)).toBe('21:45');
    expect(
      valueOfMasks(
        {
          date: emptySlots('date'),
          time: slotsOfParts('time', { hour: 21, minute: 45, second: 7 }),
        },
        'timeofday',
        'gregorian',
        0,
      ),
    ).toBe('21:45:07');
  });

  it('a time of day shows back as HH:MM:SS whichever spelling is stored', () => {
    expect(
      maskText('time', masksOfValue('21:45', 'timeofday', 'solar-hijri', 0).time, 'persian'),
    ).toBe('۲۱:۴۵:۰۰');
    expect(
      maskText('time', masksOfValue('21:45:07', 'timeofday', 'gregorian', 0).time, 'latin'),
    ).toBe('21:45:07');
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
