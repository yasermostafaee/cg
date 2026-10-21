import {
  MONTH_NAMES,
  formatTimeOfDay,
  fromGregorian,
  isoOfInstant,
  pickerMonth,
  weekStartOf,
  writeFieldDigits,
  type CalendarDay,
  type CalendarSystem,
  type DigitSet,
  type FieldDigits,
  type LunarHijriCalculation,
} from '@cg/text-shaping';

/**
 * `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1 — **THE DATE AND TIME CONTROL'S RULES, without React**,
 * the ones that are CG Control's own: which digits the inputs are written in, a shortcut's stored
 * value, the month grid's shape, and the words beside the field.
 *
 * `RUN-NEXT-VERSION-03` 2.1 — the typing itself (one masked date input and one masked time input)
 * moved to `@cg/text-shaping`'s `date-time-mask` and `@cg/gesture`'s `useMaskedDateTime`, shared with
 * the Designer; the six segments' draft rules that lived here went with them.
 */

export type DateTimeMode = 'datetime' | 'timeofday';

/**
 * The digits the inputs are written in: the field's own set, or — for a field whose digits are as
 * typed — Persian in the two Hijri calendars and Latin in the Gregorian (the app's digit rule:
 * Persian where the reading is Persian).
 */
export function segmentDigits(field: FieldDigits, system: CalendarSystem): DigitSet {
  if (field !== 'as-typed') return field;
  return system === 'gregorian' ? 'latin' : 'persian';
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

/** One month's grid — `pickerMonth`'s bounded cost (`RUN-NEXT-VERSION-03` 2.2): one conversion. */
export function monthGrid(
  system: CalendarSystem,
  year: number,
  month: number,
  adjust: number,
): MonthGrid {
  const start = weekStartOf(system);
  const names = WEEKDAY_HEADS[system === 'gregorian' ? 'en' : 'fa'];
  const heads = Array.from({ length: 7 }, (_, i) => names[(start + i) % 7] ?? '');
  const { days, leading } = pickerMonth(system, year, month, adjust, start);
  return { heads, leading, days };
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

/** The operator's words for the Lunar Hijri calculation this engine provides. */
export function lunarCalculationName(calc: LunarHijriCalculation): string {
  switch (calc) {
    case 'islamic-umalqura':
      return 'Umm al-Qura';
    case 'islamic-civil':
      return 'Civil (tabular)';
    case 'tabular':
      return 'Tabular';
  }
}

/** A Lunar Hijri adjustment in words: `+1 day`, `−2 days`, `As calculated`. */
export function lunarAdjustWords(days: number): string {
  if (days === 0) return 'As calculated';
  const n = Math.abs(days);
  return `${days > 0 ? '+' : '−'}${String(n)} ${n === 1 ? 'day' : 'days'}`;
}

/** The same Gregorian day in each of `systems`. */
export function sameDayIn(
  gregorian: CalendarDay,
  systems: readonly CalendarSystem[],
  adjust: number,
): { system: CalendarSystem; day: CalendarDay }[] {
  return systems.map((system) => ({ system, day: fromGregorian(gregorian, system, adjust) }));
}
