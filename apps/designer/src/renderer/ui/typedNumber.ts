import { useState } from 'react';
import { formatNumberLike, readLocalizedNumber, type NumberReading } from '@cg/text-shaping';

/**
 * 🔴 `PERSIAN-DIGITS-01` — **A TEMPLATE VALUE'S NUMBER, TYPED ON WHATEVER KEYBOARD THE AUTHOR HAS.**
 *
 * The Designer's number inputs for TEMPLATE VALUES — a number field's preview value, a repeater's
 * number column, a list item's dwell — were native `type="number"` boxes. Measured in Chromium: a
 * Persian `۱۲` left the box EMPTY and `۱۲٫۵` stored `0`, because such a box drops every digit that
 * is not ASCII before script can see it.
 *
 * This hook is what those inputs share instead: the box shows the author's text EXACTLY as typed,
 * `@cg/text-shaping`'s one reader decides what number it means, and the caller commits only a
 * NUMBER. The Inspector's own chrome numbers (position, size, …) are not template values and do
 * not use it.
 *
 * ⚠ The buffer is the TEXT, re-seeded only when the value changes from OUTSIDE (undo, another
 * control, the stage) — and then written in the digits the author was using, so an undo on `۱۲`
 * does not answer in Latin.
 */

/** The one sentence a number-typed template input says when its text can never be a number. */
export const NOT_A_NUMBER = 'Not a number';

export interface TypedNumber {
  /** What the box shows — the author's own text. */
  readonly text: string;
  /** {@link NOT_A_NUMBER} while the text can never become a number; `null` otherwise. */
  readonly refusal: string | null;
  /**
   * The box's text changed. Returns the reading so the caller commits a `number` reading's value
   * (and, where the input may be cleared, treats an EMPTY text as "unset"); anything else commits
   * nothing.
   */
  readonly change: (raw: string) => NumberReading;
}

export interface TypedNumberOptions {
  /** How the text is read. Default: a plain number. */
  read?: (text: string) => NumberReading;
  /** How a value from outside is written back, in the digits of `sample`. Default: as a number. */
  write?: (value: number, sample: string) => string;
}

export function useTypedNumber(
  value: number | undefined,
  opts: TypedNumberOptions = {},
): TypedNumber {
  const read = opts.read ?? readLocalizedNumber;
  const write = opts.write ?? formatNumberLike;
  const [text, setText] = useState(() => (value === undefined ? '' : write(value, '')));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // "Adjust state during render": a value that changed from outside re-seeds the text, unless
    // the text already MEANS that value (the author's own edit coming back round).
    setSeen(value);
    const reading = read(text);
    const represents =
      value === undefined
        ? reading.kind !== 'number'
        : reading.kind === 'number' && reading.value === value;
    if (!represents) setText(value === undefined ? '' : write(value, text));
  }
  return {
    text,
    refusal: read(text).kind === 'invalid' ? NOT_A_NUMBER : null,
    change: (raw) => {
      setText(raw);
      const reading = read(raw);
      if (reading.kind === 'number') setSeen(reading.value);
      return reading;
    },
  };
}
