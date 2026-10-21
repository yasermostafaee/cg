import { useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import {
  MASK_PLACEHOLDER,
  clearRange,
  emptySlots,
  eraseAt,
  formatTimeOfDay,
  isEmptyMask,
  isoOfParts,
  latinDigits,
  maskRefusal,
  maskText,
  maskTextLength,
  parsePastedDateTime,
  parseTimeOfDay,
  partState,
  partsOfInstant,
  partsOfIso,
  partsOfSlots,
  separatorCaret,
  slotsOfParts,
  slotsOfText,
  stepAtCaret,
  toGregorian,
  typeDigit,
  type CalendarDay,
  type CalendarSystem,
  type DateTimeParts,
  type DigitSet,
  type MaskContext,
  type MaskKind,
  type MaskSlots,
} from '@cg/text-shaping';

/**
 * `RUN-NEXT-VERSION-03` 2.1 — **THE MASKED DATE AND TIME, AS BEHAVIOUR.** One date input and one time
 * input, each masked (`@cg/text-shaping`'s `date-time-mask` rules), driven the same way in both apps:
 * the keys, a paste, the caret, the value the two masks name, and the pickers' setters. No markup and
 * no styles — each app renders its own inputs, icons and pickers from its own primitives (`@cg/ui`
 * stays tokens-only and components stay app-local); this hook hands them the props.
 *
 * What is STORED is unchanged: an ISO instant with this machine's offset (`datetime`), or
 * `HH:mm[:ss]` (`timeofday`), whatever calendar is shown. A mask that does not yet name a whole value
 * stores nothing — the last value stays — and a keystroke that would name an impossible one is
 * REFUSED with its reason (`refusal`), which stays until the masks name a whole value again.
 */

export type MaskedMode = 'datetime' | 'timeofday';

export interface MaskedDateTimeOptions {
  mode: MaskedMode;
  /** The stored value: ISO, or `HH:mm[:ss]`; `''` shows empty inputs. */
  value: string;
  /** Receives every WHOLE, possible value — never a half-typed one. */
  onChange: (value: string) => void;
  calendar: CalendarSystem;
  /** The Lunar Hijri day adjustment (−2 … +2); read only in that calendar. */
  adjust: number;
  /** The digits the inputs are written in (any digits are read). */
  digits: DigitSet;
  /** The clock an empty part's arrows read. */
  now?: () => number;
}

/** What one input needs: spread the handlers onto the app's own input primitive. */
export interface MaskedInput {
  readonly value: string;
  readonly placeholder: string;
  readonly maxLength: number;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => void;
  /** The input's own change (an IME, an autofill, a cut): read as the mask's text, or as a paste. */
  onText: (text: string) => void;
}

export interface MaskedDateTime {
  readonly date: MaskedInput;
  readonly time: MaskedInput;
  /** Why the last keystroke or paste was refused — `null` once the masks name a whole value. */
  readonly refusal: string | null;
  /** The Gregorian day a whole date names (the facts beside the field read it). */
  readonly gregorian: CalendarDay | null;
  /** The parts typed so far (a picker opens on them). */
  readonly parts: Partial<DateTimeParts>;
  setDate: (day: { year: number; month: number; day: number }) => void;
  setTime: (time: { hour: number; minute: number; second: number }) => void;
  /** A whole stored value (the `+5 min` shortcuts). */
  setValue: (value: string) => void;
}

interface Masks {
  readonly date: MaskSlots;
  readonly time: MaskSlots;
}

/** The masks that show a stored value (`''` or anything unreadable: empty). */
export function masksOfValue(
  value: string,
  mode: MaskedMode,
  calendar: CalendarSystem,
  adjust: number,
): Masks {
  const empty: Masks = { date: emptySlots('date'), time: emptySlots('time') };
  if (value.trim() === '') return empty;
  if (mode === 'timeofday') {
    const t = parseTimeOfDay(value);
    if (t !== undefined) {
      const [h = '0', m = '0', s = '0'] = t.split(':');
      return {
        date: emptySlots('date'),
        time: slotsOfParts('time', { hour: Number(h), minute: Number(m), second: Number(s) }),
      };
    }
  }
  const p = partsOfIso(value, calendar, adjust);
  if (p === null) return empty;
  return {
    date: mode === 'datetime' ? slotsOfParts('date', p) : emptySlots('date'),
    time: slotsOfParts('time', p),
  };
}

/**
 * The stored value two masks name — `null` while they name none. Seconds may be left out: a date
 * and time is then `…:00`, a time of day `HH:mm`.
 */
export function valueOfMasks(
  masks: Masks,
  mode: MaskedMode,
  calendar: CalendarSystem,
  adjust: number,
): string | null {
  const t = partsOfSlots('time', masks.time);
  if (t.hour === undefined || t.minute === undefined) return null;
  if (t.second === undefined && partState('time', masks.time, 'second') !== 'empty') return null;
  const second = t.second ?? 0;
  if (mode === 'timeofday') return formatTimeOfDay(t.hour, t.minute, second, second !== 0);
  const d = partsOfSlots('date', masks.date);
  if (d.year === undefined || d.month === undefined || d.day === undefined) return null;
  return isoOfParts(
    { year: d.year, month: d.month, day: d.day, hour: t.hour, minute: t.minute, second },
    calendar,
    adjust,
  );
}

const OTHER: Readonly<Record<MaskKind, MaskKind>> = { date: 'time', time: 'date' };
const NOT_ONE: Readonly<Record<MaskKind, string>> = {
  date: 'That is not a date.',
  time: 'That is not a time.',
};

export function useMaskedDateTime(o: MaskedDateTimeOptions): MaskedDateTime {
  const { mode, value, onChange, calendar, adjust, digits } = o;
  const now = o.now ?? Date.now;
  const ctx: MaskContext = { calendar, adjust };

  /*
    The masks are the operator's TEXT; the value is what is stored. A draft remembers the stored
    value and the reading (calendar, adjustment, mode) it was made against; while both still hold it
    is what the inputs show, so a part still being typed survives the echo of the operator's own edit.
    When either moves from OUTSIDE (a Discard, an apply, another row, another calendar), the draft is
    stale and the inputs show the stored value read afresh — DERIVED here, never set during render.

    🔴 `RUN-NEXT-VERSION-03` 2.2 — it was a state update during render, and that is what made the
    switch back to Jalali (the owner: "very slow") wait for some later render: in a component that
    also reads `useSyncExternalStore` (CG Control's calendar choice), React 18 does not record the
    store's new snapshot on the render-phase re-render, so a switch back to the FIRST value compares
    equal to the stale record and renders nothing — until the countdown's 15-second refresh.
  */
  const seedKey = `${calendar}|${String(adjust)}|${mode}`;
  const [draft, setDraft] = useState<{
    masks: Masks;
    refusal: string | null;
    value: string;
    seedKey: string;
  }>(() => ({
    masks: masksOfValue(value, mode, calendar, adjust),
    refusal: null,
    value,
    seedKey,
  }));
  const fresh = draft.value === value && draft.seedKey === seedKey;
  const masks = fresh ? draft.masks : masksOfValue(value, mode, calendar, adjust);
  const refusal = fresh ? draft.refusal : null;
  const setRefusal = (reason: string | null): void =>
    setDraft({ masks, refusal: reason, value, seedKey });

  // The caret an edit leaves, put back after the render that writes the new text.
  const caret = useRef<{ el: HTMLInputElement; at: number } | null>(null);
  useLayoutEffect(() => {
    const c = caret.current;
    if (c === null) return;
    caret.current = null;
    if (c.el.ownerDocument.activeElement === c.el) c.el.setSelectionRange(c.at, c.at);
  });

  const commit = (next: Masks): void => {
    const v = valueOfMasks(next, mode, calendar, adjust);
    const whole = v !== null || (isEmptyMask(next.date) && isEmptyMask(next.time));
    const stored = v !== null && v !== value ? v : value;
    // Made against the value it stores: its echo finds the draft still fresh.
    setDraft({ masks: next, refusal: whole ? null : refusal, value: stored, seedKey });
    if (stored !== value) onChange(stored);
  };

  const withKind = (kind: MaskKind, slots: MaskSlots): Masks =>
    kind === 'date' ? { ...masks, date: slots } : { ...masks, time: slots };

  const paste = (kind: MaskKind, text: string): void => {
    const own = slotsOfText(kind, text.trim());
    if (own !== null && maskRefusal(kind, own, ctx) === null) {
      commit(withKind(kind, own));
      return;
    }
    const parsed = parsePastedDateTime(text, calendar, adjust);
    const hasDate = mode === 'datetime' && parsed?.year !== undefined;
    const hasTime = parsed?.hour !== undefined;
    if (parsed === null || (!hasDate && !hasTime)) {
      setRefusal(NOT_ONE[kind]);
      return;
    }
    commit({
      date: hasDate ? slotsOfParts('date', parsed) : masks.date,
      time: hasTime ? slotsOfParts('time', parsed) : masks.time,
    });
  };

  const input = (kind: MaskKind): MaskedInput => ({
    value: maskText(kind, masks[kind], digits),
    placeholder: MASK_PLACEHOLDER[kind],
    maxLength: maskTextLength(kind),
    onKeyDown: (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.currentTarget;
      const at = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? at;
      const slots = masks[kind];
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const base: DateTimeParts = {
          ...partsOfInstant(now(), calendar, adjust),
          ...partsOfSlots(OTHER[kind], masks[OTHER[kind]]),
        };
        caret.current = { el, at };
        commit(
          withKind(kind, stepAtCaret(kind, slots, at, e.key === 'ArrowUp' ? 1 : -1, base, ctx)),
        );
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        const r = eraseAt(kind, slots, at, e.key === 'Backspace' ? 'back' : 'forward', end);
        caret.current = { el, at: r.caret };
        commit(withKind(kind, r.slots));
        return;
      }
      // Tab, the arrows across, Home, End, Enter, Escape: the input's own.
      if (e.key.length !== 1) return;
      e.preventDefault();
      const latin = latinDigits(e.key);
      if (/^[0-9]$/.test(latin)) {
        const from = end > at ? clearRange(kind, slots, at, end) : slots;
        const edit = typeDigit(kind, from, at, Number(latin), ctx);
        if (edit.refused !== undefined) {
          setRefusal(edit.refused);
          return;
        }
        caret.current = { el, at: edit.caret };
        commit(withKind(kind, edit.slots));
        return;
      }
      if (/^[/:.\-\s]$/.test(e.key)) {
        const c = separatorCaret(kind, at);
        el.setSelectionRange(c, c);
      }
      // Any other character is not part of a date or a time: nothing is typed.
    },
    onPaste: (e) => {
      e.preventDefault();
      paste(kind, e.clipboardData.getData('text'));
    },
    onText: (text) => {
      if (text === '') {
        commit(withKind(kind, emptySlots(kind)));
        return;
      }
      const own = slotsOfText(kind, text);
      if (own !== null) {
        if (maskRefusal(kind, own, ctx) === null) commit(withKind(kind, own));
        return;
      }
      // Not the mask's shape: a whole date or time dropped or autofilled is read as a paste.
      if (parsePastedDateTime(text, calendar, adjust) !== null) paste(kind, text);
    },
  });

  const d = partsOfSlots('date', masks.date);
  const gregorian =
    mode === 'datetime' && d.year !== undefined && d.month !== undefined && d.day !== undefined
      ? toGregorian({ year: d.year, month: d.month, day: d.day }, calendar, adjust)
      : null;

  return {
    date: input('date'),
    time: input('time'),
    refusal,
    gregorian,
    parts: { ...d, ...partsOfSlots('time', masks.time) },
    setDate: (day) => commit({ ...masks, date: slotsOfParts('date', day) }),
    setTime: (t) => commit({ ...masks, time: slotsOfParts('time', t) }),
    setValue: (v) => {
      setDraft({
        masks: masksOfValue(v, mode, calendar, adjust),
        refusal: null,
        value: v,
        seedKey,
      });
      if (v !== value) onChange(v);
    },
  };
}
