import { persianDigits } from './digits.js';

/**
 * Gregorian → Jalali (Persian) calendar conversion.
 *
 * Algorithm by Roozbeh Pournader and Mohammad Toossi, public domain. Widely
 * cited in Persian-locale software (jdate, momentjs-jalaali, etc.). Accurate
 * for all practical broadcast dates; ±9999 years.
 *
 * Input is 1-based month and day (matching JS `Date.prototype` API
 * conventions when callers do `month + 1`).
 */
export function gregorianToJalali(
  gy: number,
  gm: number,
  gd: number,
): [year: number, month: number, day: number] {
  const gDaysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

  let jy: number;
  let gy2: number;
  if (gy <= 1600) {
    jy = 0;
    gy2 = gy - 621;
  } else {
    jy = 979;
    gy2 = gy - 1600;
  }
  const gyAdj = gm > 2 ? gy2 + 1 : gy2;
  let days =
    365 * gy2 +
    Math.floor((gyAdj + 3) / 4) -
    Math.floor((gyAdj + 99) / 100) +
    Math.floor((gyAdj + 399) / 400) -
    80 +
    gd +
    (gDaysInMonth[gm - 1] ?? 0);

  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function asDate(d: Date | string | number): Date {
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date input: ${String(d)}`);
  }
  return parsed;
}

/**
 * Format a date as Persian (Jalali) `YYYY/MM/DD` with Persian digits.
 * E.g. 2026-05-19 → "۱۴۰۵/۰۲/۲۹".
 */
export function dateFa(d: Date | string | number): string {
  const date = asDate(d);
  const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return persianDigits(`${jy}/${pad2(jm)}/${pad2(jd)}`);
}

/**
 * Format a date as ISO-short `YYYY-MM-DD` with Latin digits. E.g.
 * 2026-05-19 → "2026-05-19".
 */
export function dateEn(d: Date | string | number): string {
  const date = asDate(d);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
