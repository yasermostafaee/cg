import { gregorianToJalali } from './date.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §1 — **THREE CALENDARS, ONE INSTANT.** A date an operator types or
 * reads may be written in the Gregorian, the Solar Hijri (Jalali, شمسی) or the Lunar Hijri (قمری)
 * calendar; what is STORED is always the ISO instant, so no template or row file changes format.
 * These are the pure conversions every surface shares (the Designer's and CG Control's date and
 * time control, and the facts beside it).
 *
 * - **Solar Hijri** — arithmetic (Pournader & Toossi, the same algorithm {@link gregorianToJalali}
 *   already uses), both directions; accurate for every broadcast date.
 * - **Lunar Hijri** — `Intl`'s `islamic-umalqura` calendar: an astronomical calculation every
 *   engine we run ships (Chrome, CasparCG's CEF, Node), nearer to sighting-based dates than the
 *   tabular civil calendar. The officially announced lunar date in Iran is decided by sighting and
 *   can still differ from ANY calculation by a day, so every Lunar Hijri reading and entry takes a
 *   station-wide **adjustment** in days ({@link LUNAR_ADJUST_MIN}…{@link LUNAR_ADJUST_MAX}). An
 *   engine without `islamic-umalqura` falls back to `islamic-civil`, then to the tabular arithmetic
 *   below — {@link lunarHijriCalculation} says which one is in use.
 */

export type CalendarSystem = 'solar-hijri' | 'gregorian' | 'lunar-hijri';

/** The order a calendar choice is offered in — Solar Hijri first, the default for this product. */
export const CALENDAR_SYSTEMS: readonly CalendarSystem[] = [
  'solar-hijri',
  'gregorian',
  'lunar-hijri',
];

export const DEFAULT_CALENDAR: CalendarSystem = 'solar-hijri';

/** The operator's words for each calendar. */
export const CALENDAR_LABELS: Readonly<Record<CalendarSystem, string>> = {
  'solar-hijri': 'Solar Hijri',
  gregorian: 'Gregorian',
  'lunar-hijri': 'Lunar Hijri',
};

export function isCalendarSystem(value: unknown): value is CalendarSystem {
  return value === 'solar-hijri' || value === 'gregorian' || value === 'lunar-hijri';
}

/** A calendar day, 1-based month and day, in some calendar. */
export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/** The station-wide Lunar Hijri adjustment, in whole days. */
export const LUNAR_ADJUST_MIN = -2;
export const LUNAR_ADJUST_MAX = 2;

/** A stored adjustment, clamped to its range; anything that is not a whole number is 0. */
export function clampLunarAdjust(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 0;
  return Math.min(LUNAR_ADJUST_MAX, Math.max(LUNAR_ADJUST_MIN, value));
}

// — Gregorian ———————————————————————————————————————————————————————————————————————

export function isGregorianLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInGregorianMonth(y: number, m: number): number {
  return [31, isGregorianLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
}

/** Days since 1970-01-01 of a Gregorian day (proleptic, UTC — no time zone involved). */
function epochDay(g: CalendarDay): number {
  return Math.round(Date.UTC(g.year, g.month - 1, g.day) / 86_400_000);
}

function fromEpochDay(n: number): CalendarDay {
  const d = new Date(n * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** `g` moved by `days` whole days. */
export function addGregorianDays(g: CalendarDay, days: number): CalendarDay {
  return fromEpochDay(epochDay(g) + days);
}

// — Solar Hijri ——————————————————————————————————————————————————————————————————————

/**
 * Jalali → Gregorian, the inverse of {@link gregorianToJalali} (Pournader & Toossi, public domain).
 * 1-based month and day in and out.
 */
export function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number,
): [year: number, month: number, day: number] {
  let gy: number;
  let y = jy;
  if (y > 979) {
    gy = 1600;
    y -= 979;
  } else {
    gy = 621;
  }
  let days =
    365 * y +
    Math.floor(y / 33) * 8 +
    Math.floor(((y % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    days -= 1;
    gy += 100 * Math.floor(days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  let gm = 1;
  for (; gm <= 12; gm += 1) {
    const len = daysInGregorianMonth(gy, gm);
    if (gd <= len) break;
    gd -= len;
  }
  return [gy, gm, gd];
}

export function isJalaliLeapYear(jy: number): boolean {
  const [ay, am, ad] = jalaliToGregorian(jy, 1, 1);
  const [by, bm, bd] = jalaliToGregorian(jy + 1, 1, 1);
  return (
    epochDay({ year: by, month: bm, day: bd }) - epochDay({ year: ay, month: am, day: ad }) === 366
  );
}

export function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

// — Lunar Hijri ——————————————————————————————————————————————————————————————————————

/** Which Lunar Hijri calculation this engine provides. */
export type LunarHijriCalculation = 'islamic-umalqura' | 'islamic-civil' | 'tabular';

let lunarFormatter: { calc: LunarHijriCalculation; fmt: Intl.DateTimeFormat | null } | null = null;

function lunar(): { calc: LunarHijriCalculation; fmt: Intl.DateTimeFormat | null } {
  if (lunarFormatter !== null) return lunarFormatter;
  for (const calc of ['islamic-umalqura', 'islamic-civil'] as const) {
    try {
      const fmt = new Intl.DateTimeFormat(`en-u-ca-${calc}-nu-latn`, {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
      if (fmt.resolvedOptions().calendar === calc) {
        lunarFormatter = { calc, fmt };
        return lunarFormatter;
      }
    } catch {
      // An engine without this calendar: try the next one.
    }
  }
  lunarFormatter = { calc: 'tabular', fmt: null };
  return lunarFormatter;
}

/** The Lunar Hijri calculation in use on this engine (reported beside the setting). */
export function lunarHijriCalculation(): LunarHijriCalculation {
  return lunar().calc;
}

/** Julian Day Number of a Gregorian day. */
function jdnOfGregorian(g: CalendarDay): number {
  return epochDay(g) + 2_440_588;
}

/** Tabular (civil) Lunar Hijri → JDN; 1 Muharram 1 AH is JDN 1 948 440. */
function jdnOfTabularHijri(h: CalendarDay): number {
  return (
    h.day +
    Math.ceil(29.5 * (h.month - 1)) +
    (h.year - 1) * 354 +
    Math.floor((3 + 11 * h.year) / 30) +
    1_948_439
  );
}

function tabularHijriOfJdn(jdn: number): CalendarDay {
  const year = Math.floor((30 * (jdn - 1_948_440) + 10_646) / 10_631);
  const month = Math.min(
    12,
    Math.ceil((jdn - (29 + jdnOfTabularHijri({ year, month: 1, day: 1 }))) / 29.5) + 1,
  );
  const day = jdn - jdnOfTabularHijri({ year, month, day: 1 }) + 1;
  return { year, month, day };
}

/** The UNADJUSTED Lunar Hijri reading of a Gregorian day. */
function rawLunarOf(g: CalendarDay): CalendarDay {
  const { fmt } = lunar();
  if (fmt === null) return tabularHijriOfJdn(jdnOfGregorian(g));
  const parts = fmt.formatToParts(Date.UTC(g.year, g.month - 1, g.day));
  const num = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value.replace(/[^0-9]/g, '') ?? 'NaN');
  return { year: num('year'), month: num('month'), day: num('day') };
}

/**
 * The Lunar Hijri date of a Gregorian day, with the station's `adjust` in days applied: an adjust
 * of −1 reads the date one day EARLIER than the calculation (the announcement trails it by a day).
 */
export function gregorianToLunarHijri(g: CalendarDay, adjust = 0): CalendarDay {
  return rawLunarOf(addGregorianDays(g, clampLunarAdjust(adjust)));
}

/**
 * The Gregorian day a Lunar Hijri date names, under `adjust` — or `null` when that day does not
 * exist (the 30th of a 29-day month). Found by reading candidate days around an arithmetic
 * estimate through the same calculation {@link gregorianToLunarHijri} uses, so the two directions
 * can never disagree.
 */
export function lunarHijriToGregorian(h: CalendarDay, adjust = 0): CalendarDay | null {
  if (h.month < 1 || h.month > 12 || h.day < 1 || h.day > 30) return null;
  const estimate = fromEpochDay(jdnOfTabularHijri(h) - 2_440_588);
  for (const offset of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
    const candidate = addGregorianDays(estimate, offset);
    const read = rawLunarOf(candidate);
    if (read.year === h.year && read.month === h.month && read.day === h.day) {
      return addGregorianDays(candidate, -clampLunarAdjust(adjust));
    }
  }
  return null;
}

export function daysInLunarHijriMonth(hy: number, hm: number, adjust = 0): number {
  return lunarHijriToGregorian({ year: hy, month: hm, day: 30 }, adjust) === null ? 29 : 30;
}

// — Any calendar ————————————————————————————————————————————————————————————————————————

/** A Gregorian day read in `system`. */
export function fromGregorian(g: CalendarDay, system: CalendarSystem, adjust = 0): CalendarDay {
  if (system === 'gregorian') return { ...g };
  if (system === 'solar-hijri') {
    const [year, month, day] = gregorianToJalali(g.year, g.month, g.day);
    return { year, month, day };
  }
  return gregorianToLunarHijri(g, adjust);
}

/** The Gregorian day a date written in `system` names, or `null` when that day does not exist. */
export function toGregorian(
  d: CalendarDay,
  system: CalendarSystem,
  adjust = 0,
): CalendarDay | null {
  if (!Number.isInteger(d.year) || !Number.isInteger(d.month) || !Number.isInteger(d.day)) {
    return null;
  }
  if (d.year < 1 || d.month < 1 || d.month > 12 || d.day < 1) return null;
  if (d.day > daysInMonth(system, d.year, d.month, adjust)) return null;
  if (system === 'gregorian') return { ...d };
  if (system === 'solar-hijri') {
    const [year, month, day] = jalaliToGregorian(d.year, d.month, d.day);
    return { year, month, day };
  }
  return lunarHijriToGregorian(d, adjust);
}

export function daysInMonth(
  system: CalendarSystem,
  year: number,
  month: number,
  adjust = 0,
): number {
  if (system === 'gregorian') return daysInGregorianMonth(year, month);
  if (system === 'solar-hijri') return daysInJalaliMonth(year, month);
  return daysInLunarHijriMonth(year, month, adjust);
}

const ZWNJ = '‌';

/** Month names, 1-based by index + 1, in the language each calendar is read in here. */
export const MONTH_NAMES: Readonly<Record<CalendarSystem, readonly string[]>> = {
  gregorian: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  'solar-hijri': [
    'فروردین',
    'اردیبهشت',
    'خرداد',
    'تیر',
    'مرداد',
    'شهریور',
    'مهر',
    'آبان',
    'آذر',
    'دی',
    'بهمن',
    'اسفند',
  ],
  'lunar-hijri': [
    'محرم',
    'صفر',
    `ربیع${ZWNJ}الاول`,
    `ربیع${ZWNJ}الثانی`,
    `جمادی${ZWNJ}الاول`,
    `جمادی${ZWNJ}الثانی`,
    'رجب',
    'شعبان',
    'رمضان',
    'شوال',
    `ذی${ZWNJ}القعده`,
    `ذی${ZWNJ}الحجه`,
  ],
};

/**
 * The weekday (0 = Sunday … 6 = Saturday) of a Gregorian day — the month grid's column. A Persian
 * week starts on Saturday; {@link weekStartOf} says where each calendar's grid begins.
 */
export function weekdayOf(g: CalendarDay): number {
  return new Date(Date.UTC(g.year, g.month - 1, g.day)).getUTCDay();
}

/** The first column of a calendar's month grid: Saturday for the Hijri calendars, Monday otherwise. */
export function weekStartOf(system: CalendarSystem): number {
  return system === 'gregorian' ? 1 : 6;
}
