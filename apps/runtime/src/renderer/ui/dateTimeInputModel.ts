import {
  DATE_SEGMENTS,
  MONTH_NAMES,
  SEGMENT_WIDTH,
  TIME_SEGMENTS,
  daysInMonth,
  formatTimeOfDay,
  fromGregorian,
  isoOfInstant,
  isoOfParts,
  parsePastedDateTime,
  parseTimeOfDay,
  partsOfInstant,
  partsOfIso,
  readSegment,
  segmentRange,
  setSegment,
  stepSegment,
  toGregorian,
  weekStartOf,
  weekdayOf,
  writeFieldDigits,
  writeSegment,
  type CalendarDay,
  type CalendarSystem,
  type DateTimeParts,
  type DateTimeSegment,
  type DigitSet,
  type FieldDigits,
} from '@cg/text-shaping';

/**
 * `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1 — **THE DATE AND TIME CONTROL'S RULES, without React.**
 *
 * The control shows six typed segments (`YYYY / MM / DD`, `HH : MM : SS`) — or the three time ones
 * for a time-of-day target — as DRAFT TEXT, because a half-typed segment (`1`, on its way to `12`)
 * is a state the operator is allowed to be in. Every rule that turns drafts into the STORED value,
 * and back, lives here and only reads `@cg/text-shaping`'s pure date rules, so the control and its
 * tests agree by construction:
 *
 * - the stored value of a date and time is ISO with this console's offset (`isoOfParts`), in any
 *   calendar; of a time of day `HH:mm`, or `HH:mm:ss` when seconds were given (`formatTimeOfDay`);
 * - a draft is READ in any digit set (`readSegment`) and WRITTEN in the field's digits;
 * - an incomplete draft stores nothing (the last value stays staged) — refuse the impossible,
 *   never the incomplete; an impossible one (a 13th month, the 31st of Mehr) marks its segment.
 */

export type DateTimeMode = 'datetime' | 'timeofday';

export type Drafts = Readonly<Record<DateTimeSegment, string>>;

export const EMPTY_DRAFTS: Drafts = {
  year: '',
  month: '',
  day: '',
  hour: '',
  minute: '',
  second: '',
};

/** The segments a mode shows, in Tab order. */
export function segmentsOf(mode: DateTimeMode): readonly DateTimeSegment[] {
  return mode === 'datetime' ? [...DATE_SEGMENTS, ...TIME_SEGMENTS] : TIME_SEGMENTS;
}

/**
 * The digits the segments are written in: the field's own set, or — for a field whose digits are
 * as typed — Persian in the two Hijri calendars and Latin in the Gregorian (the app's digit rule:
 * Persian where the reading is Persian).
 */
export function segmentDigits(field: FieldDigits, system: CalendarSystem): DigitSet {
  if (field !== 'as-typed') return field;
  return system === 'gregorian' ? 'latin' : 'persian';
}

/** A segment's draft, written: only digits survive, in `digits`, at most the segment's width. */
export function writeDraft(raw: string, segment: DateTimeSegment, digits: DigitSet): string {
  return writeFieldDigits(raw.replace(/[^0-9۰-۹٠-٩]/g, ''), digits).slice(
    0,
    SEGMENT_WIDTH[segment],
  );
}

function draftsOfParts(
  parts: Partial<DateTimeParts>,
  digits: DigitSet,
  base: Drafts = EMPTY_DRAFTS,
): Drafts {
  const out: Record<DateTimeSegment, string> = { ...base };
  for (const seg of [...DATE_SEGMENTS, ...TIME_SEGMENTS]) {
    const v = parts[seg];
    if (v !== undefined) out[seg] = writeSegment(v, seg, digits);
  }
  return out;
}

/** The drafts that show a stored `value` ('' or anything unreadable shows empty segments). */
export function draftsOfValue(
  value: string,
  mode: DateTimeMode,
  system: CalendarSystem,
  adjust: number,
  digits: DigitSet,
): Drafts {
  if (mode === 'datetime') {
    const parts = value.trim() === '' ? null : partsOfIso(value, system, adjust);
    return parts === null ? EMPTY_DRAFTS : draftsOfParts(parts, digits);
  }
  const time = parseTimeOfDay(value);
  if (time !== undefined) {
    const [h = '0', m = '0', s] = time.split(':');
    return draftsOfParts(
      { hour: Number(h), minute: Number(m), ...(s !== undefined ? { second: Number(s) } : {}) },
      digits,
    );
  }
  // The page lets the value decide: an ISO date and time in a time-of-day field shows its time.
  const parts = value.trim() === '' ? null : partsOfIso(value, system, adjust);
  return parts === null
    ? EMPTY_DRAFTS
    : draftsOfParts({ hour: parts.hour, minute: parts.minute, second: parts.second }, digits);
}

/** What the drafts say: the stored value they name (or `null`), and which segments are wrong. */
export interface DraftReading {
  readonly value: string | null;
  readonly invalid: ReadonlySet<DateTimeSegment>;
  /** The Gregorian day a complete date names — the facts beside the field read it. */
  readonly gregorian: CalendarDay | null;
}

export function readDrafts(
  drafts: Drafts,
  mode: DateTimeMode,
  system: CalendarSystem,
  adjust: number,
): DraftReading {
  const invalid = new Set<DateTimeSegment>();
  const segments = segmentsOf(mode);
  const parts: DateTimeParts = { year: 2000, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  let complete = true;
  for (const seg of segments) {
    const text = drafts[seg];
    const n = readSegment(text);
    if (n === null) {
      // Seconds may be left out — a time of day is then `HH:mm`, a date and time `…:00`.
      if (text.trim() === '' && seg === 'second') continue;
      if (text.trim() !== '') invalid.add(seg);
      complete = false;
      continue;
    }
    const { min, max } = segmentRange(parts, seg, system, adjust);
    if (n < min || n > max) {
      invalid.add(seg);
      complete = false;
      continue;
    }
    parts[seg] = n;
  }
  if (!complete) return { value: null, invalid, gregorian: null };
  if (mode === 'timeofday') {
    const withSeconds = drafts.second.trim() !== '';
    return {
      value: formatTimeOfDay(parts.hour, parts.minute, parts.second, withSeconds),
      invalid,
      gregorian: null,
    };
  }
  const iso = isoOfParts(parts, system, adjust);
  if (iso === null) {
    invalid.add('day');
    return { value: null, invalid, gregorian: null };
  }
  return { value: iso, invalid, gregorian: toGregorian(parts, system, adjust) };
}

/** Every present segment pulled inside its range and written whole (`7` → `07`), on leaving it. */
export function normalizeDrafts(
  drafts: Drafts,
  mode: DateTimeMode,
  system: CalendarSystem,
  adjust: number,
  digits: DigitSet,
): Drafts {
  let parts: DateTimeParts = { year: 2000, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  const present = new Set<DateTimeSegment>();
  for (const seg of segmentsOf(mode)) {
    const n = readSegment(drafts[seg]);
    if (n === null) continue;
    parts = setSegment(parts, seg, n, system, adjust);
    present.add(seg);
  }
  const out: Record<DateTimeSegment, string> = { ...drafts };
  for (const seg of present) out[seg] = writeSegment(parts[seg], seg, digits);
  // A date and time with everything but its seconds names `…:00`; show it.
  const rest = segmentsOf(mode).filter((s) => s !== 'second');
  if (mode === 'datetime' && !present.has('second') && rest.every((s) => present.has(s))) {
    out.second = writeSegment(0, 'second', digits);
  }
  return out;
}

/** The parts the drafts hold, a missing segment taken from `nowMs`. */
function partsOrNow(
  drafts: Drafts,
  mode: DateTimeMode,
  system: CalendarSystem,
  adjust: number,
  nowMs: number,
): DateTimeParts {
  let parts = partsOfInstant(nowMs, system, adjust);
  for (const seg of segmentsOf(mode)) {
    const n = readSegment(drafts[seg]);
    if (n !== null) parts = setSegment(parts, seg, n, system, adjust);
  }
  return parts;
}

/**
 * Up / Down on a focused segment: one step, WRAPPING (`stepSegment`). A segment still empty is
 * filled from now first, so the arrows always have something to move. A time of day that left its
 * seconds out keeps them out unless the seconds are the segment being stepped.
 */
export function stepDrafts(
  drafts: Drafts,
  segment: DateTimeSegment,
  delta: number,
  mode: DateTimeMode,
  system: CalendarSystem,
  adjust: number,
  digits: DigitSet,
  nowMs: number,
): Drafts {
  const base = partsOrNow(drafts, mode, system, adjust, nowMs);
  const next = stepSegment(base, segment, delta, system, adjust);
  const out = draftsOfParts(next, digits);
  if (mode === 'timeofday' && drafts.second.trim() === '' && segment !== 'second') {
    return { ...out, second: '' };
  }
  return out;
}

/**
 * A paste on any segment: a full date and/or time fills every segment it names
 * (`parsePastedDateTime`); a time of day keeps its seconds left out when the paste left them out.
 * `null` when the text is neither — the paste then lands in the segment as typed text would.
 */
export function pasteDrafts(
  text: string,
  drafts: Drafts,
  mode: DateTimeMode,
  system: CalendarSystem,
  adjust: number,
  digits: DigitSet,
): Drafts | null {
  if (mode === 'timeofday') {
    const time = parseTimeOfDay(text.trim());
    if (time !== undefined) return draftsOfValue(time, 'timeofday', system, adjust, digits);
  }
  const pasted = parsePastedDateTime(text, system, adjust);
  if (pasted === null) return null;
  const wanted: Partial<DateTimeParts> =
    mode === 'datetime'
      ? pasted
      : {
          ...(pasted.hour !== undefined ? { hour: pasted.hour } : {}),
          ...(pasted.minute !== undefined ? { minute: pasted.minute } : {}),
          ...(pasted.second !== undefined ? { second: pasted.second } : {}),
        };
  if (Object.keys(wanted).length === 0) return null;
  return draftsOfParts(wanted, digits, drafts);
}

/** A `Now + …` shortcut's stored value for the mode. */
export function valueAt(ms: number, mode: DateTimeMode): string {
  if (mode === 'datetime') return isoOfInstant(ms);
  const d = new Date(ms);
  return formatTimeOfDay(d.getHours(), d.getMinutes(), d.getSeconds(), d.getSeconds() !== 0);
}

// — The month grid ———————————————————————————————————————————————————————————————————————

/** Short weekday heads, by weekday (0 = Sunday). */
const WEEKDAY_HEADS: Readonly<Record<'fa' | 'en', readonly string[]>> = {
  fa: ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
};

export interface MonthGrid {
  /** The heads, in the grid's column order (its week start first). */
  readonly heads: readonly string[];
  /** Empty cells before the 1st. */
  readonly leading: number;
  readonly days: number;
}

export function monthGrid(
  system: CalendarSystem,
  year: number,
  month: number,
  adjust: number,
): MonthGrid {
  const start = weekStartOf(system);
  const names = WEEKDAY_HEADS[system === 'gregorian' ? 'en' : 'fa'];
  const heads = Array.from({ length: 7 }, (_, i) => names[(start + i) % 7] ?? '');
  const first = toGregorian({ year, month, day: 1 }, system, adjust);
  const leading = first === null ? 0 : (weekdayOf(first) - start + 7) % 7;
  return { heads, leading, days: daysInMonth(system, year, month, adjust) };
}

/** `{ year, month }` moved by `delta` months. */
export function addMonths(
  view: { year: number; month: number },
  delta: number,
): { year: number; month: number } {
  const index = view.year * 12 + (view.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** A day written in its calendar's words and the digits the control writes that calendar in. */
export function dayInWords(day: CalendarDay, system: CalendarSystem, digits: DigitSet): string {
  const month = MONTH_NAMES[system][day.month - 1] ?? '';
  const n = (v: number): string => writeFieldDigits(String(v), digits);
  return `${n(day.day)} ${month} ${n(day.year)}`;
}

/** The same Gregorian day in each of `systems`. */
export function sameDayIn(
  gregorian: CalendarDay,
  systems: readonly CalendarSystem[],
  adjust: number,
): { system: CalendarSystem; day: CalendarDay }[] {
  return systems.map((system) => ({ system, day: fromGregorian(gregorian, system, adjust) }));
}
