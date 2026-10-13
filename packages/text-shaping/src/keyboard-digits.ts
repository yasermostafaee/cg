import { writeFieldDigits, type FieldDigits, type FieldDigitsKind } from './field-digits.js';
import type { DigitSet } from './numerals.js';

/**
 * `TEXT-DIGITS-01` — the keyboard language a digit is typed in: the answer of the ONE detection
 * module both apps ask (`@cg/gesture`'s `keyboardLanguage`). `unknown` when it cannot be known —
 * and then a digit stays exactly as the key sent it. Never a guess.
 */
export type KeyboardLanguage = 'persian' | 'arabic' | 'latin' | 'unknown';

/** Every answer, in one list, for a source whose reply must be checked before it is believed. */
export const KEYBOARD_LANGUAGES: readonly KeyboardLanguage[] = [
  'persian',
  'arabic',
  'latin',
  'unknown',
];

/** Is `value` one of the four answers? A shell's reply is data, so it is checked. */
export function isKeyboardLanguage(value: unknown): value is KeyboardLanguage {
  return typeof value === 'string' && (KEYBOARD_LANGUAGES as readonly string[]).includes(value);
}

/**
 * The digits a keyboard language types: Persian digits for Persian, Arabic-Indic for Arabic, Latin
 * for English — and `null` for `unknown`, which writes nothing.
 */
export function keyboardDigits(language: KeyboardLanguage): DigitSet | null {
  switch (language) {
    case 'persian':
      return 'persian';
    case 'arabic':
      return 'arabic-indic';
    case 'latin':
      return 'latin';
    case 'unknown':
      return null;
  }
}

/**
 * Letters only a Persian layout types: پ چ ژ ک گ ی ۀ. MEASURED (`text-digits` design §0.3, every key
 * with and without Shift through `ToUnicodeEx`): no Arabic layout — 101, 102, 102 AZERTY — types one.
 */
const PERSIAN_ONLY = /[پچژکگیۀ]/;
/**
 * The one letter every Arabic layout types and no Persian layout does: ى (U+0649). Measured with the
 * list above: the Persian layouts type ة and ي too, and Persian (Standard) ك, so none of those three
 * proves Arabic.
 */
const ARABIC_ONLY = /ى/;
/** Any letter of the Arabic script — shared by both, so it proves neither. */
const ARABIC_SCRIPT = /[ؠ-يٮ-ۓۺ-ۿ]/;
const LATIN_LETTER = /[A-Za-zÀ-ɏ]/;

/**
 * What ONE typed letter proves about the keyboard: `persian` for a letter only the Persian layout
 * types, `arabic` for one only an Arabic layout types, `latin` for a Latin letter — and `null` for
 * everything else, a letter both Arabic-script layouts share included (`ا`, `س`): it proves the
 * script, not the language, and the language is never guessed.
 */
export function languageOfLetter(key: string): KeyboardLanguage | null {
  if ([...key].length !== 1) return null;
  if (PERSIAN_ONLY.test(key)) return 'persian';
  if (ARABIC_ONLY.test(key)) return 'arabic';
  if (ARABIC_SCRIPT.test(key)) return null;
  if (LATIN_LETTER.test(key)) return 'latin';
  return null;
}

/**
 * What the keyboard language is after one more typed `key`, given what the letters before it proved
 * (`previous`, `null` for nothing proven): a proving letter replaces it; a letter both Arabic-script
 * layouts share keeps a Persian or Arabic proof — the same script, and no switch between — and
 * forgets a Latin one, which it disproves; anything that is not a letter changes nothing.
 */
export function followLetter(
  previous: KeyboardLanguage | null,
  key: string,
): KeyboardLanguage | null {
  const proven = languageOfLetter(key);
  if (proven !== null) return proven;
  if ([...key].length === 1 && ARABIC_SCRIPT.test(key)) {
    return previous === 'persian' || previous === 'arabic' ? previous : null;
  }
  return previous;
}

/** How text reached an editor: typed from the keyboard, or anything else (a paste, a drop, undo). */
export interface EnteredText {
  readonly how: 'typed' | 'other';
  /** Where that text now sits in the value: `[start, end)`. */
  readonly start: number;
  readonly end: number;
}

/**
 * `TEXT-DIGITS-01` — **WHAT AN EDITOR WRITES WHEN TEXT IS ENTERED** into a value whose digits are
 * `digits`, so what is being edited looks like what goes on air:
 *
 * - a digit set (`persian`, `latin`, `arabic-indic`): the whole value in that set — a paste
 *   included;
 * - `as-typed` (the **Keyboard** choice): only TYPED text changes, its digits written in the set of
 *   the keyboard language active as it was typed (`keyboard`, from {@link keyboardDigits}); a paste
 *   keeps its digits, and so does a digit typed while the language is unknown (`keyboard` null).
 *
 * Every digit is written by {@link writeFieldDigits} — the one writer — one character for one, so
 * the value keeps its length and a caret index holds.
 */
export function writeEnteredDigits(
  value: string,
  entered: EnteredText,
  digits: FieldDigits,
  keyboard: DigitSet | null,
  kind: FieldDigitsKind = 'text',
): string {
  if (digits !== 'as-typed') return writeFieldDigits(value, digits, kind);
  if (entered.how !== 'typed' || keyboard === null) return value;
  const start = Math.max(0, Math.min(entered.start, value.length));
  const end = Math.max(start, Math.min(entered.end, value.length));
  return (
    value.slice(0, start) +
    writeFieldDigits(value.slice(start, end), keyboard, 'text') +
    value.slice(end)
  );
}
