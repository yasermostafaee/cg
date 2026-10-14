import { daysInMonth, fromGregorian, toGregorian, type CalendarSystem } from './calendar.js';
import { arabicIndicDigits, latinDigits, persianDigits } from './digits.js';
import type { DigitSet } from './numerals.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1 — **THE SEGMENTS OF A TYPED DATE AND TIME.**
 *
 * A date and time is entered as six typed segments, `YYYY / MM / DD` and `HH : MM : SS`, 24-hour, in
 * any calendar ({@link CalendarSystem}) and any digit set. These are the pure rules both apps'
 * control applies: what a segment accepts, what Up / Down does to it, what a paste fills, and the
 * ISO instant the six segments name. What is STORED is always ISO with the offset of the machine the
 * operator typed on, so the instant is exact whatever calendar was shown.
 */

export type DateTimeSegment = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

export const DATE_SEGMENTS: readonly DateTimeSegment[] = ['year', 'month', 'day'];
export const TIME_SEGMENTS: readonly DateTimeSegment[] = ['hour', 'minute', 'second'];

/** The segments of a date and time in one calendar, local wall-clock time. */
export interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** How many digits each segment is written with. */
export const SEGMENT_WIDTH: Readonly<Record<DateTimeSegment, number>> = {
  year: 4,
  month: 2,
  day: 2,
  hour: 2,
  minute: 2,
  second: 2,
};

/** A segment's whole number from text in any digit set, or `null` when it holds no number. */
export function readSegment(text: string): number | null {
  const latin = latinDigits(text).trim();
  if (!/^[0-9]+$/.test(latin)) return null;
  return Number(latin);
}

/** A segment's value written in `digits`, zero-padded to its width. */
export function writeSegment(value: number, segment: DateTimeSegment, digits: DigitSet): string {
  const latin = String(value).padStart(SEGMENT_WIDTH[segment], '0');
  if (digits === 'persian') return persianDigits(latin);
  if (digits === 'arabic-indic') return arabicIndicDigits(latin);
  return latin;
}

/** The inclusive range a segment may hold, given the other segments (a month's own length). */
export function segmentRange(
  parts: DateTimeParts,
  segment: DateTimeSegment,
  system: CalendarSystem,
  adjust = 0,
): { min: number; max: number } {
  switch (segment) {
    case 'year':
      return { min: 1, max: 9999 };
    case 'month':
      return { min: 1, max: 12 };
    case 'day':
      return { min: 1, max: daysInMonth(system, parts.year, parts.month, adjust) };
    case 'hour':
      return { min: 0, max: 23 };
    default:
      return { min: 0, max: 59 };
  }
}

/** `parts` with its day pulled back inside its month (a 31 that became Esfand). */
export function clampDay(parts: DateTimeParts, system: CalendarSystem, adjust = 0): DateTimeParts {
  const max = daysInMonth(system, parts.year, parts.month, adjust);
  return parts.day > max ? { ...parts, day: max } : parts;
}

/**
 * `parts` with `segment` set to `value`, kept inside its range: an hour of 27 is 23, a day of 31 in
 * a 30-day month is 30. The day is re-clamped when the year or month changes underneath it.
 */
export function setSegment(
  parts: DateTimeParts,
  segment: DateTimeSegment,
  value: number,
  system: CalendarSystem,
  adjust = 0,
): DateTimeParts {
  const { min, max } = segmentRange(parts, segment, system, adjust);
  const next = { ...parts, [segment]: Math.min(max, Math.max(min, Math.trunc(value))) };
  return segment === 'year' || segment === 'month' ? clampDay(next, system, adjust) : next;
}

/**
 * Up / Down on a focused segment: `delta` steps, WRAPPING inside the segment's range (23 → 00,
 * the 30th of a 30-day month → the 1st), the way a clock's own hands do.
 */
export function stepSegment(
  parts: DateTimeParts,
  segment: DateTimeSegment,
  delta: number,
  system: CalendarSystem,
  adjust = 0,
): DateTimeParts {
  const { min, max } = segmentRange(parts, segment, system, adjust);
  if (segment === 'year') return setSegment(parts, 'year', parts.year + delta, system, adjust);
  const span = max - min + 1;
  const value = (((parts[segment] - min + delta) % span) + span) % span;
  return setSegment(parts, segment, min + value, system, adjust);
}

/** The local wall-clock segments of an instant, read in `system`. */
export function partsOfInstant(ms: number, system: CalendarSystem, adjust = 0): DateTimeParts {
  const d = new Date(ms);
  const day = fromGregorian(
    { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() },
    system,
    adjust,
  );
  return { ...day, hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
}

/** The segments of a stored ISO value, or `null` when it is not one. */
export function partsOfIso(iso: string, system: CalendarSystem, adjust = 0): DateTimeParts | null {
  const ms = Date.parse(latinDigits(iso));
  return Number.isNaN(ms) ? null : partsOfInstant(ms, system, adjust);
}

/** The instant six segments name on this machine's clock, or `null` when the date does not exist. */
export function instantOfParts(
  parts: DateTimeParts,
  system: CalendarSystem,
  adjust = 0,
): number | null {
  const g = toGregorian(parts, system, adjust);
  if (g === null) return null;
  if (parts.hour > 23 || parts.minute > 59 || parts.second > 59) return null;
  if (parts.hour < 0 || parts.minute < 0 || parts.second < 0) return null;
  return new Date(g.year, g.month - 1, g.day, parts.hour, parts.minute, parts.second).getTime();
}

const pad = (n: number, w = 2): string => String(Math.abs(n)).padStart(w, '0');

/** `+03:30` — an offset in minutes EAST of UTC, written the ISO way. */
export function formatOffset(minutesEast: number): string {
  const sign = minutesEast < 0 ? '-' : '+';
  return `${sign}${pad(Math.floor(Math.abs(minutesEast) / 60))}:${pad(Math.abs(minutesEast) % 60)}`;
}

/**
 * An instant as the STORED value: ISO 8601 with this machine's offset at that instant
 * (`2026-10-15T21:45:00+03:30`), Latin digits — the same instant `Date.parse` reads back.
 */
export function isoOfInstant(ms: number): string {
  const d = new Date(ms);
  return (
    `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    formatOffset(-d.getTimezoneOffset())
  );
}

/** Six segments as the stored ISO value, or `null` when the date does not exist. */
export function isoOfParts(
  parts: DateTimeParts,
  system: CalendarSystem,
  adjust = 0,
): string | null {
  const ms = instantOfParts(parts, system, adjust);
  return ms === null ? null : isoOfInstant(ms);
}

/** A time of day as `HH:mm`, or `HH:mm:ss` when `withSeconds` (the schema's two spellings). */
export function formatTimeOfDay(
  hour: number,
  minute: number,
  second: number,
  withSeconds: boolean,
): string {
  return withSeconds ? `${pad(hour)}:${pad(minute)}:${pad(second)}` : `${pad(hour)}:${pad(minute)}`;
}

/**
 * A pasted date and/or time, in any digit set, as the segments it fills. Recognised:
 *
 * - a full ISO instant (`2026-10-15T21:45:00+03:30`, or `Z`) — read as the instant it is;
 * - `YYYY-MM-DD` (dashes) — ISO, so GREGORIAN whatever calendar is shown;
 * - `YYYY/MM/DD` or `YYYY.MM.DD` — in the SHOWN calendar, unless its year is 1900 or later while a
 *   Hijri calendar is shown, which can only be a Gregorian date;
 * - either date followed by `HH:MM` or `HH:MM:SS` (a space or `T` between);
 * - `HH:MM` / `HH:MM:SS` alone — the time segments only.
 *
 * Anything else is `null`: nothing is filled from a paste that is not a date or a time.
 */
export function parsePastedDateTime(
  text: string,
  system: CalendarSystem,
  adjust = 0,
): Partial<DateTimeParts> | null {
  const s = latinDigits(text).trim().replace(/\s+/g, ' ');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    return partsOfIso(s, system, adjust);
  }
  const time = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (time !== null) {
    const hour = Number(time[1]);
    const minute = Number(time[2]);
    const second = Number(time[3] ?? '0');
    return hour < 24 && minute < 60 && second < 60 ? { hour, minute, second } : null;
  }
  const m = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m === null) return null;
  const date = { year: Number(m[1]), month: Number(m[3]), day: Number(m[4]) };
  const gregorian = m[2] === '-' || (system !== 'gregorian' && date.year >= 1900);
  const shown = gregorian
    ? toGregorian(date, 'gregorian') === null
      ? null
      : fromGregorian(date, system, adjust)
    : toGregorian(date, system, adjust) === null
      ? null
      : date;
  if (shown === null) return null;
  if (m[5] === undefined) return shown;
  const hour = Number(m[5]);
  const minute = Number(m[6]);
  const second = Number(m[7] ?? '0');
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { ...shown, hour, minute, second };
}

/** `DELTA-RUN-NEXT-VERSION-01-B` §2 — the `Now + …` shortcuts, in milliseconds. */
export const NOW_PLUS_SHORTCUTS: readonly { label: string; ms: number }[] = [
  { label: '+1 min', ms: 60_000 },
  { label: '+5 min', ms: 300_000 },
  { label: '+1 h', ms: 3_600_000 },
];

/**
 * The instant a shortcut sets: `nowMs + addMs`, rounded DOWN to the whole second the segments can
 * show — so the field shows exactly the instant that is stored.
 */
export function nowPlus(nowMs: number, addMs: number): number {
  return Math.floor((nowMs + addMs) / 1000) * 1000;
}
