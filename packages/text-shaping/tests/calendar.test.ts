import { describe, expect, it } from 'vitest';
import {
  addGregorianDays,
  clampLunarAdjust,
  daysInJalaliMonth,
  daysInLunarHijriMonth,
  daysInMonth,
  fromGregorian,
  gregorianToJalali,
  gregorianToLunarHijri,
  isJalaliLeapYear,
  jalaliToGregorian,
  lunarHijriCalculation,
  lunarHijriToGregorian,
  toGregorian,
  type CalendarDay,
} from '../src/index.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §1 — three calendars, one instant. Known dates are pinned; every
 * other day is cross-checked against the engine's OWN reading (`Intl`), so the arithmetic and ICU
 * can never quietly disagree.
 */

const g = (year: number, month: number, day: number): CalendarDay => ({ year, month, day });

function intlRead(calendar: string, day: CalendarDay): CalendarDay {
  const parts = new Intl.DateTimeFormat(`en-u-ca-${calendar}-nu-latn`, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(Date.UTC(day.year, day.month - 1, day.day));
  const num = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value.replace(/[^0-9]/g, ''));
  return { year: num('year'), month: num('month'), day: num('day') };
}

function* everyDay(from: CalendarDay, to: CalendarDay): Generator<CalendarDay> {
  for (
    let d = from;
    Date.UTC(d.year, d.month - 1, d.day) <= Date.UTC(to.year, to.month - 1, to.day);
    d = addGregorianDays(d, 1)
  ) {
    yield d;
  }
}

describe('Solar Hijri', () => {
  it('pins Nowruz and the leap day: 1 Farvardin 1405 = 2026-03-21; 30 Esfand 1403 = 2025-03-20', () => {
    expect(jalaliToGregorian(1405, 1, 1)).toEqual([2026, 3, 21]);
    expect(jalaliToGregorian(1403, 12, 30)).toEqual([2025, 3, 20]);
    expect(jalaliToGregorian(1404, 1, 1)).toEqual([2025, 3, 21]);
    expect(gregorianToJalali(2026, 10, 15)).toEqual([1405, 7, 23]);
  });

  it('a LEAP year has a 30-day Esfand; a common year 29', () => {
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(daysInJalaliMonth(1403, 12)).toBe(30);
    expect(daysInJalaliMonth(1404, 12)).toBe(29);
    // 30 Esfand exists only in a leap year.
    expect(toGregorian(g(1403, 12, 30), 'solar-hijri')).toEqual(g(2025, 3, 20));
    expect(toGregorian(g(1404, 12, 30), 'solar-hijri')).toBeNull();
  });

  it('a MONTH BOUNDARY: 31 Shahrivar → 1 Mehr, and Mehr has 30 days', () => {
    const lastOfShahrivar = toGregorian(g(1405, 6, 31), 'solar-hijri');
    const firstOfMehr = toGregorian(g(1405, 7, 1), 'solar-hijri');
    expect(lastOfShahrivar).not.toBeNull();
    expect(firstOfMehr).toEqual(addGregorianDays(lastOfShahrivar as CalendarDay, 1));
    expect(daysInJalaliMonth(1405, 7)).toBe(30);
    expect(toGregorian(g(1405, 7, 31), 'solar-hijri')).toBeNull();
  });

  it('round-trips EVERY day 2020–2032, and agrees with Intl’s Persian calendar on each', () => {
    let days = 0;
    for (const day of everyDay(g(2020, 1, 1), g(2032, 12, 31))) {
      const j = fromGregorian(day, 'solar-hijri');
      expect(j).toEqual(intlRead('persian', day));
      expect(toGregorian(j, 'solar-hijri')).toEqual(day);
      days += 1;
    }
    expect(days).toBeGreaterThan(4700);
  });
});

describe('Lunar Hijri', () => {
  it('uses Umm al-Qura where the engine has it (Node, Chrome and CEF do)', () => {
    expect(lunarHijriCalculation()).toBe('islamic-umalqura');
  });

  it('reads every day as Intl’s islamic-umalqura does, and round-trips it — 2020–2032', () => {
    for (const day of everyDay(g(2020, 1, 1), g(2032, 12, 31))) {
      const h = gregorianToLunarHijri(day);
      expect(h).toEqual(intlRead('islamic-umalqura', day));
      expect(lunarHijriToGregorian(h)).toEqual(day);
    }
  });

  it('a MONTH BOUNDARY: the last day of a lunar month is followed by day 1 of the next', () => {
    // Walk forward from a known day to the first month change and check both sides.
    let day = g(2026, 10, 1);
    let h = gregorianToLunarHijri(day);
    while (gregorianToLunarHijri(addGregorianDays(day, 1)).day !== 1) {
      day = addGregorianDays(day, 1);
      h = gregorianToLunarHijri(day);
    }
    const next = gregorianToLunarHijri(addGregorianDays(day, 1));
    expect([29, 30]).toContain(h.day);
    expect(daysInLunarHijriMonth(h.year, h.month)).toBe(h.day);
    expect(next.month).toBe(h.month === 12 ? 1 : h.month + 1);
    // The 30th of a 29-day month does not exist.
    if (h.day === 29) expect(lunarHijriToGregorian({ ...h, day: 30 })).toBeNull();
  });

  it('the ADJUSTMENT moves the reading by whole days, and entry moves the other way', () => {
    const day = g(2026, 10, 15);
    expect(gregorianToLunarHijri(day, -1)).toEqual(
      gregorianToLunarHijri(addGregorianDays(day, -1)),
    );
    expect(gregorianToLunarHijri(day, 2)).toEqual(gregorianToLunarHijri(addGregorianDays(day, 2)));
    const h = gregorianToLunarHijri(day);
    // The same written Hijri date names a Gregorian day one LATER when the reading trails by one.
    expect(lunarHijriToGregorian(h, -1)).toEqual(addGregorianDays(day, 1));
    // …and under the adjustment, reading and entry stay inverse.
    for (const adjust of [-2, -1, 0, 1, 2]) {
      expect(lunarHijriToGregorian(gregorianToLunarHijri(day, adjust), adjust)).toEqual(day);
    }
  });

  it('the adjustment is clamped to −2 … +2 whole days', () => {
    expect(clampLunarAdjust(5)).toBe(2);
    expect(clampLunarAdjust(-9)).toBe(-2);
    expect(clampLunarAdjust(0.5)).toBe(0);
    expect(clampLunarAdjust('1')).toBe(0);
    expect(clampLunarAdjust(-1)).toBe(-1);
  });
});

describe('any calendar', () => {
  it('daysInMonth follows each calendar’s own month lengths', () => {
    expect(daysInMonth('gregorian', 2028, 2)).toBe(29);
    expect(daysInMonth('gregorian', 2026, 2)).toBe(28);
    expect(daysInMonth('solar-hijri', 1405, 1)).toBe(31);
    expect([29, 30]).toContain(daysInMonth('lunar-hijri', 1448, 4));
  });

  it('one day, three spellings, one Gregorian day back', () => {
    const day = g(2026, 10, 15);
    for (const system of ['gregorian', 'solar-hijri', 'lunar-hijri'] as const) {
      expect(toGregorian(fromGregorian(day, system), system)).toEqual(day);
    }
  });

  it('a day that does not exist is null, never a rolled-over neighbour', () => {
    expect(toGregorian(g(2026, 2, 29), 'gregorian')).toBeNull();
    expect(toGregorian(g(1405, 13, 1), 'solar-hijri')).toBeNull();
    expect(toGregorian(g(1405, 1, 0), 'solar-hijri')).toBeNull();
  });
});
