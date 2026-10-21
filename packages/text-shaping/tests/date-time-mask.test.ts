import { describe, expect, it } from 'vitest';
import {
  MASK_PLACEHOLDER,
  caretOfSlot,
  clearRange,
  daysInMonth,
  emptySlots,
  eraseAt,
  isEmptyMask,
  maskRefusal,
  maskSlotCount,
  maskText,
  maskTextLength,
  partState,
  partsOfSlots,
  pickerMonth,
  segmentAtCaret,
  separatorCaret,
  slotAtCaret,
  slotsOfParts,
  slotsOfText,
  stepAtCaret,
  toGregorian,
  typeDigit,
  type MaskContext,
  type MaskKind,
  type MaskSlots,
} from '../src/index.js';

/**
 * `RUN-NEXT-VERSION-03` 2.1 — one masked date input and one masked time input: the rules, typed the
 * way an operator types. 2.2 — a picker month costs one conversion and one month length.
 */

const JALALI: MaskContext = { calendar: 'solar-hijri', adjust: 0 };
const GREG: MaskContext = { calendar: 'gregorian', adjust: 0 };
const LUNAR: MaskContext = { calendar: 'lunar-hijri', adjust: 0 };

/** Type `keys` from `caret` 0 into an empty mask; a refused key leaves the text and caret as they were. */
function typed(
  kind: MaskKind,
  keys: string,
  ctx: MaskContext,
  start: { slots?: MaskSlots; caret?: number } = {},
): { text: string; refusals: string[]; slots: MaskSlots; caret: number } {
  let slots = start.slots ?? emptySlots(kind);
  let caret = start.caret ?? 0;
  const refusals: string[] = [];
  for (const k of keys) {
    if (/[/:]/.test(k)) {
      caret = separatorCaret(kind, caret);
      continue;
    }
    const edit = typeDigit(kind, slots, caret, Number(k), ctx);
    if (edit.refused !== undefined) {
      refusals.push(edit.refused);
      continue;
    }
    slots = edit.slots;
    caret = edit.caret;
  }
  return { text: maskText(kind, slots, 'latin'), refusals, slots, caret };
}

describe('the mask’s shape', () => {
  it('a date is YYYY/MM/DD (8 digits, 10 characters); a time HH:MM:SS (6 and 8)', () => {
    expect([maskSlotCount('date'), maskTextLength('date')]).toEqual([8, 10]);
    expect([maskSlotCount('time'), maskTextLength('time')]).toEqual([6, 8]);
    expect(MASK_PLACEHOLDER).toEqual({ date: 'YYYY/MM/DD', time: 'HH:MM:SS' });
  });

  it('caret ↔ slot: a separator is stepped over; the caret’s part', () => {
    expect([0, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => slotAtCaret('date', c))).toEqual([
      0, 3, 4, 4, 5, 6, 6, 7, 8,
    ]);
    expect([0, 3, 4, 5, 7, 8].map((s) => caretOfSlot('date', s))).toEqual([0, 3, 5, 6, 9, 10]);
    expect([0, 4, 5, 7, 8, 10].map((c) => segmentAtCaret('date', c))).toEqual([
      'year',
      'year',
      'month',
      'month',
      'day',
      'day',
    ]);
    expect(segmentAtCaret('time', 99)).toBe('second');
  });

  it('an empty mask is no text; a partial one shows a letter where no digit is', () => {
    expect(maskText('date', emptySlots('date'), 'latin')).toBe('');
    expect(isEmptyMask(emptySlots('time'))).toBe(true);
    const slots = slotsOfParts('date', { year: 1405, month: 7 });
    expect(maskText('date', slots, 'latin')).toBe('1405/07/DD');
    expect(maskText('date', slots, 'persian')).toBe('۱۴۰۵/۰۷/DD');
    expect(maskText('time', slotsOfParts('time', { hour: 9 }), 'arabic-indic')).toBe('٠٩:MM:SS');
    expect(partState('date', slots, 'year')).toBe('complete');
    expect(partState('date', slots, 'day')).toBe('empty');
    expect(partState('date', [1, 4, 0, null, null, null, null, null], 'year')).toBe('partial');
  });

  it('slots ↔ parts round-trip; a part with a missing digit is absent', () => {
    const slots = slotsOfParts('date', { year: 1405, month: 12, day: 29 });
    expect(partsOfSlots('date', slots)).toEqual({ year: 1405, month: 12, day: 29 });
    expect(partsOfSlots('time', [2, 1, 4, null, 0, 0])).toEqual({ hour: 21, second: 0 });
    // Not a part of this mask, or not a whole number: nothing is written for it.
    expect(isEmptyMask(slotsOfParts('time', { year: 1405, hour: -1 }))).toBe(true);
  });

  it('the mask’s own text reads back — any digits, letters for the empty positions; another shape is null', () => {
    expect(slotsOfText('date', '۱۴۰۵/۰۷/DD')).toEqual([1, 4, 0, 5, 0, 7, null, null]);
    expect(slotsOfText('time', '21:45:SS')).toEqual([2, 1, 4, 5, null, null]);
    expect(slotsOfText('date', '1405-07-23')).toBeNull();
    expect(slotsOfText('date', '1405/07/2')).toBeNull();
    expect(slotsOfText('date', '1405/0x/23')).toBeNull();
  });
});

describe('🔴 typing — a wrong value cannot be typed', () => {
  it('a whole date and time typed, digits only; the separators are the mask’s', () => {
    expect(typed('date', '14050723', JALALI).text).toBe('1405/07/23');
    expect(typed('time', '214500', JALALI).text).toBe('21:45:00');
    // A separator typed where the mask already moved on is the mask's own: it skips nothing.
    expect(typed('date', '1405/07/23', JALALI).text).toBe('1405/07/23');
    // …and one typed inside a part moves to the next part.
    const r = typed('date', '1405/0', JALALI);
    expect(separatorCaret('date', r.caret)).toBe(8);
    expect(separatorCaret('time', 7)).toBe(7);
  });

  it('🔴 the owner’s `1405/13/40`: month 13 is refused, with its reason', () => {
    const r = typed('date', '1405/13/40', JALALI);
    expect(r.refusals[0]).toBe('There is no month 13.');
    expect(partsOfSlots('date', r.slots).month).toBeUndefined();
  });

  it('🔴 the 31st of a 30-day month in THAT calendar is refused; Esfand 30 only in a leap year', () => {
    // Mehr 1405 has 30 days (Jalali months 7–11).
    expect(typed('date', '1405/07/31', JALALI).refusals).toEqual(['This month has 30 days.']);
    expect(typed('date', '1405/07/30', JALALI).text).toBe('1405/07/30');
    // Esfand: 29 days in 1404, 30 in 1403 (a leap year).
    expect(typed('date', '1404/12/30', JALALI).refusals).toEqual(['This month has 29 days.']);
    expect(typed('date', '1403/12/30', JALALI).text).toBe('1403/12/30');
    // Gregorian: April has 30; February 2027 28.
    expect(typed('date', '2027/04/31', GREG).refusals).toEqual(['This month has 30 days.']);
    expect(typed('date', '2027/02/29', GREG).refusals).toEqual(['This month has 28 days.']);
    // The year not yet typed: the day is judged against the longest that month can be.
    expect(typed('date', '0731', JALALI, { caret: 5 }).refusals).toEqual([
      'This month has 30 days.',
    ]);
    expect(typed('date', '1230', JALALI, { caret: 5 }).text).toBe('YYYY/12/30');
  });

  it('🔴 25 o’clock and 61 minutes are refused', () => {
    expect(typed('time', '25', JALALI).refusals).toEqual(['Hours run from 00 to 23.']);
    expect(typed('time', '2359', JALALI).text).toBe('23:59:SS');
    const late = typed('time', '24', JALALI);
    expect(late.refusals).toEqual(['Hours run from 00 to 23.']);
    expect(late.text).toBe('2H:MM:SS');
  });

  it('a first digit that can only begin 0x gets its 0 (the month 7, the hour 9, the 4th)', () => {
    expect(typed('date', '14057', JALALI).text).toBe('1405/07/DD');
    expect(typed('time', '9', JALALI).text).toBe('09:MM:SS');
    expect(typed('time', '216', JALALI).text).toBe('21:06:SS');
    expect(typed('date', '1405074', JALALI).text).toBe('1405/07/04');
    // A 3 is the first digit of 30 or 31, never silently 03 — even where the month has no 30th:
    // February's `30` is then refused, with its reason.
    expect(typed('date', '1405073', JALALI).text).toBe('1405/07/3D');
    const feb = typed('date', '20270230', GREG);
    expect(feb.text).toBe('2027/02/3D');
    expect(feb.refusals).toEqual(['This month has 28 days.']);
  });

  it('typing in the middle overwrites one digit; at the start of a part it begins the part afresh', () => {
    const full = slotsOfParts('date', { year: 1405, month: 7, day: 23 });
    // The caret after `140`: a 6 makes 1406.
    expect(typed('date', '6', JALALI, { slots: full, caret: 3 }).text).toBe('1406/07/23');
    // At the month's start: `1` over `07` is `1_` (never 17, refused), then `2` makes 12.
    expect(typed('date', '1', JALALI, { slots: full, caret: 5 }).text).toBe('1405/1M/23');
    expect(typed('date', '12', JALALI, { slots: full, caret: 5 }).text).toBe('1405/12/23');
    // At the end of the mask a digit changes nothing.
    expect(typed('date', '9', JALALI, { slots: full, caret: 10 }).text).toBe('1405/07/23');
  });

  it('year 0000, month 00 and day 00 are refused', () => {
    expect(typed('date', '0000', JALALI).refusals).toEqual(['There is no year 0.']);
    expect(typed('date', '140500', JALALI).refusals).toEqual(['There is no month 0.']);
    expect(typed('date', '14050700', JALALI).refusals).toEqual(['There is no day 0.']);
  });

  it('a Lunar Hijri day past the month’s reading is refused', () => {
    // Some Lunar Hijri month of 1448 has 29 days: its 30th is refused, the 29th is not.
    const month = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find(
      (m) => daysInMonth('lunar-hijri', 1448, m) === 29,
    );
    expect(month).toBeDefined();
    const mm = String(month).padStart(2, '0');
    expect(typed('date', `1448${mm}30`, LUNAR).refusals).toEqual(['This month has 29 days.']);
    expect(typed('date', `1448${mm}29`, LUNAR).refusals).toEqual([]);
  });

  it('the refusal is judged on complete parts only', () => {
    expect(maskRefusal('date', slotsOfParts('date', { year: 1405 }), JALALI)).toBeNull();
    expect(maskRefusal('time', slotsOfParts('time', { minute: 60 }), JALALI)).toBe(
      'Minutes run from 00 to 59.',
    );
    expect(maskRefusal('time', slotsOfParts('time', { second: 60 }), JALALI)).toBe(
      'Seconds run from 00 to 59.',
    );
    expect(maskRefusal('date', slotsOfParts('date', { day: 32 }), JALALI)).toBe(
      'There is no day 32.',
    );
  });
});

describe('erasing and stepping', () => {
  const full = slotsOfParts('date', { year: 1405, month: 7, day: 23 });

  it('Backspace empties the position before the caret (over a separator); Delete the one after', () => {
    const back = eraseAt('date', full, 8, 'back');
    expect(maskText('date', back.slots, 'latin')).toBe('1405/0M/23');
    expect(back.caret).toBe(6);
    const fwd = eraseAt('date', full, 4, 'forward');
    expect(maskText('date', fwd.slots, 'latin')).toBe('1405/M7/23');
    expect(fwd.caret).toBe(4);
    expect(eraseAt('date', full, 0, 'back').slots).toBe(full);
    expect(eraseAt('date', full, 10, 'forward').slots).toBe(full);
  });

  it('a selection is emptied whole, whatever the key', () => {
    const r = eraseAt('date', full, 5, 'back', 10);
    expect(maskText('date', r.slots, 'latin')).toBe('1405/MM/DD');
    expect(r.caret).toBe(5);
    expect(isEmptyMask(clearRange('date', full, 0, 10))).toBe(true);
  });

  it('Up / Down step the part under the caret, wrapping; an empty part starts from now', () => {
    const base = { year: 1405, month: 1, day: 1, hour: 12, minute: 0, second: 0 };
    const time = slotsOfParts('time', { hour: 23, minute: 45, second: 0 });
    expect(maskText('time', stepAtCaret('time', time, 1, 1, base, JALALI), 'latin')).toBe(
      '00:45:00',
    );
    expect(maskText('time', stepAtCaret('time', time, 4, -1, base, JALALI), 'latin')).toBe(
      '23:44:00',
    );
    // Mehr 30 → the 1st (the 30th is Mehr's last).
    const mehr30 = slotsOfParts('date', { year: 1405, month: 7, day: 30 });
    expect(maskText('date', stepAtCaret('date', mehr30, 9, 1, base, JALALI), 'latin')).toBe(
      '1405/07/01',
    );
    // Nothing typed: the step starts from `base`.
    expect(
      maskText('date', stepAtCaret('date', emptySlots('date'), 0, 1, base, JALALI), 'latin'),
    ).toBe('1406/01/01');
  });
});

describe('🔴 2.2 — a picker month at a bounded cost', () => {
  it('Mehr 1405: 30 days, the 1st a Wednesday (four empty cells in a Saturday week)', () => {
    const m = pickerMonth('solar-hijri', 1405, 7, 0, 6);
    expect(m).toEqual({ days: 30, leading: 4, first: { year: 2026, month: 9, day: 23 } });
  });

  it('🔴 ONE conversion and ONE month length per month, in every calendar — never one per day', () => {
    for (const calendar of ['solar-hijri', 'gregorian', 'lunar-hijri'] as const) {
      for (let month = 1; month <= 12; month += 1) {
        let conversions = 0;
        let lengths = 0;
        const m = pickerMonth(calendar, calendar === 'gregorian' ? 2026 : 1405, month, 0, 6, {
          toGregorian: (...a: Parameters<typeof toGregorian>) => {
            conversions += 1;
            return toGregorian(...a);
          },
          daysInMonth: (...a: Parameters<typeof daysInMonth>) => {
            lengths += 1;
            return daysInMonth(...a);
          },
        });
        expect(m.days).toBeGreaterThanOrEqual(28);
        expect([calendar, month, conversions, lengths]).toEqual([calendar, month, 1, 1]);
      }
    }
  });

  it('a month the calendar cannot read has no 1st and no empty cells', () => {
    expect(pickerMonth('solar-hijri', 1405, 13, 0, 6)).toEqual({
      days: 0,
      leading: 0,
      first: null,
    });
  });
});
