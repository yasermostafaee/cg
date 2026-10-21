import { daysInGregorianMonth, daysInMonth, toGregorian, type CalendarSystem } from './calendar.js';
import {
  setSegment,
  stepSegment,
  type DateTimeParts,
  type DateTimeSegment,
} from './date-segments.js';
import { arabicIndicDigits, latinDigits, persianDigits } from './digits.js';
import type { DigitSet } from './numerals.js';

/**
 * `RUN-NEXT-VERSION-03` 2.1 — **ONE DATE INPUT AND ONE TIME INPUT, MASKED.** The owner: six separate
 * boxes are not good. A date is typed into ONE input as `YYYY/MM/DD` in the calendar shown, a time
 * into ONE input as `HH:MM:SS`, 24-hour, and the MASK makes a wrong value impossible to type:
 *
 * - the separators are the mask's own — never typed, never erased;
 * - a digit OVERWRITES the position under the caret and the caret moves on (across a separator), so
 *   typing in the middle of a value works — at the START of a part it begins that part afresh; a key
 *   that is not a digit changes nothing;
 * - a two-digit part whose first digit can only begin `0x` gets its `0` (`7` in the month is `07`);
 * - a value that cannot exist is REFUSED with its reason, and the text stays as it was: month 13, the
 *   31st of a 30-day month in that calendar, 25 o'clock, 61 minutes;
 * - Up / Down step the part under the caret (`stepSegment`'s wrapping rules).
 *
 * What a mask holds is one digit per POSITION (`MaskSlots`, `null` — not typed yet); its text is
 * drawn in the field's digits with a letter where no digit is. The rules are pure and shared: both
 * apps' control reads them through `@cg/gesture`'s `useMaskedDateTime`.
 */

export type MaskKind = 'date' | 'time';

/** One digit per position, in reading order; `null` — not typed yet. */
export type MaskSlots = readonly (number | null)[];

/** The parts a mask holds, in order. */
export const MASK_SEGMENTS: Readonly<Record<MaskKind, readonly DateTimeSegment[]>> = {
  date: ['year', 'month', 'day'],
  time: ['hour', 'minute', 'second'],
};

export const MASK_SEPARATOR: Readonly<Record<MaskKind, string>> = { date: '/', time: ':' };

/** The mask as a placeholder: `YYYY/MM/DD`, `HH:MM:SS`. */
export const MASK_PLACEHOLDER: Readonly<Record<MaskKind, string>> = {
  date: 'YYYY/MM/DD',
  time: 'HH:MM:SS',
};

const WIDTH: Readonly<Record<DateTimeSegment, number>> = {
  year: 4,
  month: 2,
  day: 2,
  hour: 2,
  minute: 2,
  second: 2,
};

/** The letter a position shows while it has no digit. */
const LETTER: Readonly<Record<DateTimeSegment, string>> = {
  year: 'Y',
  month: 'M',
  day: 'D',
  hour: 'H',
  minute: 'M',
  second: 'S',
};

/**
 * A two-digit part whose first digit above this can only be `0x`: the `0` is put in for it. FIXED,
 * never the month's own length: a `3` in a 29-day month waits for its second digit, and `30` is then
 * refused with its reason — read against the month, a `3` would silently become `03`.
 */
const LEAD_MAX: Partial<Record<DateTimeSegment, number>> = {
  month: 1,
  day: 3,
  hour: 2,
  minute: 5,
  second: 5,
};

interface Span {
  readonly segment: DateTimeSegment;
  /** The first slot of the part. */
  readonly slot: number;
  readonly width: number;
  /** Where the part's text starts. */
  readonly at: number;
}

function spansOf(kind: MaskKind): readonly Span[] {
  const out: Span[] = [];
  let slot = 0;
  let at = 0;
  for (const segment of MASK_SEGMENTS[kind]) {
    out.push({ segment, slot, width: WIDTH[segment], at });
    slot += WIDTH[segment];
    at += WIDTH[segment] + 1;
  }
  return out;
}

const SPANS: Readonly<Record<MaskKind, readonly Span[]>> = {
  date: spansOf('date'),
  time: spansOf('time'),
};

/** How many digits a mask holds: 8 for a date, 6 for a time. */
export function maskSlotCount(kind: MaskKind): number {
  return MASK_SEGMENTS[kind].reduce((n, s) => n + WIDTH[s], 0);
}

/** How long a mask's text is: 10 for a date, 8 for a time. */
export function maskTextLength(kind: MaskKind): number {
  return maskSlotCount(kind) + MASK_SEGMENTS[kind].length - 1;
}

export function emptySlots(kind: MaskKind): MaskSlots {
  return Array.from({ length: maskSlotCount(kind) }, () => null);
}

function spanOfSlot(kind: MaskKind, slot: number): Span {
  const spans = SPANS[kind];
  return spans.find((s) => slot >= s.slot && slot < s.slot + s.width) ?? (spans.at(-1) as Span);
}

/** Where a slot's digit stands in the text. */
export function caretOfSlot(kind: MaskKind, slot: number): number {
  if (slot >= maskSlotCount(kind)) return maskTextLength(kind);
  const span = spanOfSlot(kind, slot);
  return span.at + (slot - span.slot);
}

/** The slot a digit typed at `caret` fills — a separator under the caret is stepped over. */
export function slotAtCaret(kind: MaskKind, caret: number): number {
  for (const span of SPANS[kind]) {
    if (caret <= span.at) return span.slot;
    if (caret < span.at + span.width) return span.slot + (caret - span.at);
  }
  return maskSlotCount(kind);
}

/** The part the caret is in: the one it stands in, or — at a separator — the one it just left. */
export function segmentAtCaret(kind: MaskKind, caret: number): DateTimeSegment {
  const spans = SPANS[kind];
  for (const span of spans) {
    if (caret <= span.at + span.width) return span.segment;
  }
  return (spans.at(-1) as Span).segment;
}

/**
 * A separator typed at `caret` moves the caret to the start of the next part — unless the caret is
 * already at the start of a part (the mask moved it there as the last part filled: the operator is
 * typing the separator the mask already shows), where it stays.
 */
export function separatorCaret(kind: MaskKind, caret: number): number {
  const spans = SPANS[kind];
  if (spans.some((s) => s.at > 0 && s.at === caret)) return caret;
  const i = spans.findIndex((s) => s.segment === segmentAtCaret(kind, caret));
  const next = spans[i + 1];
  return next === undefined ? caret : next.at;
}

/** The parts' digits as slots (a part not given is left empty). */
export function slotsOfParts(kind: MaskKind, parts: Partial<DateTimeParts>): MaskSlots {
  const out: (number | null)[] = [...emptySlots(kind)];
  for (const span of SPANS[kind]) {
    const v = parts[span.segment];
    if (v === undefined || !Number.isInteger(v) || v < 0) continue;
    const text = String(v).padStart(span.width, '0').slice(-span.width);
    for (let k = 0; k < span.width; k += 1) out[span.slot + k] = Number(text[k]);
  }
  return out;
}

/** The parts whose every digit is typed (a part still being typed is absent). */
export function partsOfSlots(
  kind: MaskKind,
  slots: MaskSlots,
): Partial<Record<DateTimeSegment, number>> {
  const out: Partial<Record<DateTimeSegment, number>> = {};
  for (const span of SPANS[kind]) {
    const digits = slots.slice(span.slot, span.slot + span.width);
    if (digits.some((d) => d === null || d === undefined)) continue;
    out[span.segment] = Number(digits.join(''));
  }
  return out;
}

/** `empty` — no digit in the part; `complete` — every digit; else `partial`. */
export function partState(
  kind: MaskKind,
  slots: MaskSlots,
  segment: DateTimeSegment,
): 'empty' | 'partial' | 'complete' {
  const span = SPANS[kind].find((s) => s.segment === segment);
  if (span === undefined) return 'empty';
  const digits = slots.slice(span.slot, span.slot + span.width);
  const typed = digits.filter((d) => d !== null && d !== undefined).length;
  return typed === 0 ? 'empty' : typed === span.width ? 'complete' : 'partial';
}

export function isEmptyMask(slots: MaskSlots): boolean {
  return slots.every((d) => d === null);
}

function writeDigit(d: number, digits: DigitSet): string {
  const latin = String(d);
  if (digits === 'persian') return persianDigits(latin);
  if (digits === 'arabic-indic') return arabicIndicDigits(latin);
  return latin;
}

/** The mask's text in `digits` — a letter where no digit is; `''` when nothing is typed. */
export function maskText(kind: MaskKind, slots: MaskSlots, digits: DigitSet): string {
  if (isEmptyMask(slots)) return '';
  return SPANS[kind]
    .map((span) =>
      Array.from({ length: span.width }, (_, k) => {
        const d = slots[span.slot + k];
        return d === null || d === undefined ? LETTER[span.segment] : writeDigit(d, digits);
      }).join(''),
    )
    .join(MASK_SEPARATOR[kind]);
}

/**
 * A mask's text read back (any digit set, a letter or a space where no digit is) — `null` when the
 * text is not the mask's shape. The input's own change path (an IME, an autofill) goes through it.
 */
export function slotsOfText(kind: MaskKind, text: string): MaskSlots | null {
  const latin = latinDigits(text);
  if (latin.length !== maskTextLength(kind)) return null;
  const out: (number | null)[] = [...emptySlots(kind)];
  for (const span of SPANS[kind]) {
    if (span.at > 0 && latin[span.at - 1] !== MASK_SEPARATOR[kind]) return null;
    for (let k = 0; k < span.width; k += 1) {
      const ch = latin[span.at + k] ?? '';
      if (/[0-9]/.test(ch)) out[span.slot + k] = Number(ch);
      else if (ch !== LETTER[span.segment] && ch !== ' ' && ch !== '_') return null;
    }
  }
  return out;
}

/** The calendar a refusal is judged in, and its Lunar Hijri adjustment. */
export interface MaskContext {
  readonly calendar: CalendarSystem;
  readonly adjust: number;
}

/** The longest a month can be in a calendar, whatever the year. */
function longestMonth(calendar: CalendarSystem, month: number): number {
  if (calendar === 'gregorian') return daysInGregorianMonth(2000, month);
  if (calendar === 'lunar-hijri') return 30;
  return month <= 6 ? 31 : 30;
}

/** The most days a day may be, given the month and year typed beside it. */
function dayMax(p: Partial<Record<DateTimeSegment, number>>, ctx: MaskContext): number {
  if (p.month === undefined || p.month < 1 || p.month > 12) return 31;
  return p.year === undefined || p.year < 1
    ? longestMonth(ctx.calendar, p.month)
    : daysInMonth(ctx.calendar, p.year, p.month, ctx.adjust);
}

/**
 * Why the typed parts name something that cannot exist — or `null`. Only COMPLETE parts are judged
 * (a part still being typed is not wrong yet); the day against its month and year once those are
 * typed, else against the longest that month can be.
 */
export function maskRefusal(kind: MaskKind, slots: MaskSlots, ctx: MaskContext): string | null {
  const p = partsOfSlots(kind, slots);
  if (kind === 'time') {
    if (p.hour !== undefined && p.hour > 23) return 'Hours run from 00 to 23.';
    if (p.minute !== undefined && p.minute > 59) return 'Minutes run from 00 to 59.';
    if (p.second !== undefined && p.second > 59) return 'Seconds run from 00 to 59.';
    return null;
  }
  if (p.year !== undefined && p.year < 1) return 'There is no year 0.';
  if (p.month !== undefined && (p.month < 1 || p.month > 12)) {
    return `There is no month ${String(p.month)}.`;
  }
  if (p.day === undefined) return null;
  if (p.day < 1) return 'There is no day 0.';
  const max = dayMax(p, ctx);
  if (p.day > max) {
    return p.month === undefined
      ? `There is no day ${String(p.day)}.`
      : `This month has ${String(max)} days.`;
  }
  // The Lunar Hijri month's length is a reading of the calendar: confirm the day exists in it.
  if (
    p.year !== undefined &&
    p.month !== undefined &&
    toGregorian({ year: p.year, month: p.month, day: p.day }, ctx.calendar, ctx.adjust) === null
  ) {
    return `This month has ${String(max)} days.`;
  }
  return null;
}

/** An edit's result: the new slots and caret — or why the keystroke was refused. */
export type MaskEdit =
  | { readonly slots: MaskSlots; readonly caret: number; readonly refused?: undefined }
  | { readonly refused: string };

/**
 * A digit typed at `caret`: it overwrites the position there (a separator stepped over) and the caret
 * moves on; a two-digit part that can only begin `0x` gets its `0`. Refused — the text unchanged —
 * when the result names something that cannot exist. At the end of the mask it changes nothing.
 */
export function typeDigit(
  kind: MaskKind,
  slots: MaskSlots,
  caret: number,
  digit: number,
  ctx: MaskContext,
): MaskEdit {
  const slot = slotAtCaret(kind, caret);
  if (slot >= maskSlotCount(kind)) return { slots, caret };
  const span = spanOfSlot(kind, slot);
  const next = [...slots];
  // A digit at the START of a part begins it afresh (`1` over `07` is `1_`, on its way to `12` —
  // never `17`, refused); anywhere else it overwrites one digit, so a value is edited in the middle.
  if (slot === span.slot) {
    for (let k = 1; k < span.width; k += 1) next[slot + k] = null;
  }
  let last = slot;
  const lead = LEAD_MAX[span.segment];
  if (span.width === 2 && slot === span.slot && lead !== undefined && digit > lead) {
    next[slot] = 0;
    next[slot + 1] = digit;
    last = slot + 1;
  } else {
    next[slot] = digit;
  }
  const refused = maskRefusal(kind, next, ctx);
  if (refused !== null) return { refused };
  return { slots: next, caret: caretOfSlot(kind, last + 1) };
}

/** The slots with every position in the text range `[from, to)` emptied. */
export function clearRange(kind: MaskKind, slots: MaskSlots, from: number, to: number): MaskSlots {
  const next = [...slots];
  for (let slot = 0; slot < next.length; slot += 1) {
    const at = caretOfSlot(kind, slot);
    if (at >= from && at < to) next[slot] = null;
  }
  return next;
}

/**
 * Backspace (`back`) or Delete (`forward`) at `caret`: one position emptied — the one before the
 * caret (a separator stepped over) or the one after it. A selection empties its positions instead.
 */
export function eraseAt(
  kind: MaskKind,
  slots: MaskSlots,
  caret: number,
  direction: 'back' | 'forward',
  selectionEnd: number = caret,
): { slots: MaskSlots; caret: number } {
  if (selectionEnd > caret) {
    return { slots: clearRange(kind, slots, caret, selectionEnd), caret };
  }
  if (direction === 'forward') {
    const slot = slotAtCaret(kind, caret);
    if (slot >= maskSlotCount(kind)) return { slots, caret };
    const next = [...slots];
    next[slot] = null;
    return { slots: next, caret };
  }
  for (let slot = maskSlotCount(kind) - 1; slot >= 0; slot -= 1) {
    const at = caretOfSlot(kind, slot);
    if (at < caret) {
      const next = [...slots];
      next[slot] = null;
      return { slots: next, caret: at };
    }
  }
  return { slots, caret };
}

/**
 * Up / Down on the part under `caret`: one step, WRAPPING (`stepSegment`) — a part not yet typed is
 * taken from `base` first (now, with the other mask's typed parts over it), so the arrows always have
 * something to move. Every part of the mask comes back typed.
 */
export function stepAtCaret(
  kind: MaskKind,
  slots: MaskSlots,
  caret: number,
  delta: number,
  base: DateTimeParts,
  ctx: MaskContext,
): MaskSlots {
  let parts: DateTimeParts = { ...base };
  for (const [segment, v] of Object.entries(partsOfSlots(kind, slots))) {
    parts = setSegment(parts, segment as DateTimeSegment, v, ctx.calendar, ctx.adjust);
  }
  const next = stepSegment(parts, segmentAtCaret(kind, caret), delta, ctx.calendar, ctx.adjust);
  return slotsOfParts(kind, next);
}

/**
 * `RUN-NEXT-VERSION-03` 2.2 — **A PICKER MONTH, AT A BOUNDED COST.** The grid of one month in one
 * calendar: how many days, how many empty cells before the 1st (its week starting where the
 * calendar's does), and the Gregorian day of the 1st. ONE conversion and ONE month length, whatever
 * the month — never a conversion per day (each day's weekday follows from the 1st's). The calendar's
 * two functions are a parameter only so a test can count them.
 */
export interface PickerMonth {
  readonly days: number;
  readonly leading: number;
  /** The 1st, in the Gregorian calendar — `null` for a month the calendar cannot read. */
  readonly first: { year: number; month: number; day: number } | null;
}

export interface CalendarMath {
  toGregorian: typeof toGregorian;
  daysInMonth: typeof daysInMonth;
}

const MATH: CalendarMath = { toGregorian, daysInMonth };

export function pickerMonth(
  calendar: CalendarSystem,
  year: number,
  month: number,
  adjust: number,
  weekStart: number,
  math: CalendarMath = MATH,
): PickerMonth {
  const first = math.toGregorian({ year, month, day: 1 }, calendar, adjust);
  const days = first === null ? 0 : math.daysInMonth(calendar, year, month, adjust);
  const weekday =
    first === null
      ? weekStart
      : new Date(Date.UTC(first.year, first.month - 1, first.day)).getUTCDay();
  return { days, leading: (weekday - weekStart + 7) % 7, first };
}
