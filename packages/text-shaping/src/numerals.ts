import { arabicIndicDigits, latinDigits, persianDigits } from './digits.js';

/**
 * `PERSIAN-DIGITS-01` — **THE ONE READER of a number-shaped template value, whatever keyboard typed
 * it.** A Persian layout emits `۰–۹` (U+06F0–U+06F9) and `٫` (U+066B) for the decimal mark; some
 * layouts emit Arabic-Indic `٠–٩` (U+0660–U+0669); `٬` (U+066C) groups thousands. All three are
 * digits to the operator, so every surface in both apps — and the on-air bundle — reads a
 * number, a time of day and a duration HERE. No surface keeps its own copy of the digit ranges
 * (golden rule 6): a second copy is how one app comes to accept what the other refuses.
 *
 * ⚠ READING IS NOT REWRITING. These functions answer "what number did the operator mean"; they
 * never produce the text a field shows or a text value sends, which keep their digits exactly as
 * typed. `formatNumberLike` is the one writer, and it writes a NEW number the way the operator's
 * own text was written.
 */

const DIGIT = '0-9\\u06F0-\\u06F9\\u0660-\\u0669';
const D = `[${DIGIT}]`;
/** `+`, `-`, and the typographic minus U+2212. */
const SIGN = '[+\\-\\u2212]';
/** The decimal mark: `.` or the Persian `٫` (U+066B). */
const DEC = '[.\\u066B]';
/** The Persian thousands separator `٬` (U+066C) — only BETWEEN digit groups. */
const GROUP = '\\u066C';
const INT = `${D}+(?:${GROUP}${D}+)*`;

/** A whole number: an integer part (optionally with a fraction), or a bare fraction. */
const NUMBER = new RegExp(`^(${SIGN})?(?:(${INT})(?:${DEC}(${D}*))?|${DEC}(${D}+))$`);
/**
 * Text that more typing can still turn into a number: nothing, a lone sign, a lone decimal mark,
 * or digits that end on a group separator (`۱٬` on the way to `۱٬۲۳۴`).
 */
const INCOMPLETE = new RegExp(`^${SIGN}?(?:${INT}${GROUP}|${DEC})?$`);

/**
 * Invisible direction marks — LRM, RLM, ALM and the embedding/isolate controls. A value pasted from
 * a Persian document routinely carries one; it is not part of the number and not the operator's
 * mistake, so it is read past rather than refused.
 */
const BIDI_MARKS = /[‎‏؜‪-‮⁦-⁩]/g;

function clean(text: string): string {
  return text.replace(BIDI_MARKS, '').trim();
}

/** What a number-shaped entry means — the three answers a field has to tell apart. */
export type NumberReading =
  | { readonly kind: 'number'; readonly value: number }
  /** Not a number YET — say nothing, stage nothing. */
  | { readonly kind: 'incomplete' }
  /** Can never become a number by typing more — refuse, in one line. */
  | { readonly kind: 'invalid' };

/**
 * Read a number typed in Latin, Persian or Arabic-Indic digits.
 *
 * INCOMPLETE is its own answer because a field that refuses half-typed text puts a red sentence
 * under itself for the whole of typing a correct value, and an operator taught to read past a
 * refusal will read past the real one. Refuse the impossible, never the incomplete.
 *
 * ⚠ A Latin `,` is NOT a separator: in several locales it is the decimal mark, and `1,5` quietly
 * read as fifteen is worse than a refusal.
 */
export function readLocalizedNumber(text: string): NumberReading {
  const s = clean(text);
  const m = NUMBER.exec(s);
  if (m !== null) {
    const [, sign, int, fraction, bareFraction] = m;
    const whole = int === undefined ? '0' : latinDigits(int.replace(/٬/g, ''));
    const part = latinDigits(fraction ?? bareFraction ?? '');
    const magnitude = Number(part === '' ? whole : `${whole}.${part}`);
    const value = sign === '-' || sign === '−' ? -magnitude : magnitude;
    // -0 is a number nobody typed on purpose, and it formats as `0` anyway.
    return { kind: 'number', value: value === 0 ? 0 : value };
  }
  return INCOMPLETE.test(s) ? { kind: 'incomplete' } : { kind: 'invalid' };
}

/** {@link readLocalizedNumber}'s number, or `null` for anything that is not one yet. */
export function parseLocalizedNumber(text: string): number | null {
  const reading = readLocalizedNumber(text);
  return reading.kind === 'number' ? reading.value : null;
}

/**
 * Digits, `٫` and `٬` read as Latin (`0-9`, `.`, `,`); every other character unchanged.
 *
 * For CHECKING a value against a pattern written with Latin classes — never for storing or
 * sending one. A value is accepted when the pattern matches it as typed OR read this way.
 */
export function latinNumerals(text: string): string {
  return latinDigits(text).replace(/٫/g, '.').replace(/٬/g, ',');
}

/**
 * The `HH:mm[:ss]` shape, over CANONICAL Latin digits. The on-air countdown, the schema's
 * `timeofday` target (`@cg/shared-schema`, author-time) and this reader must agree; the schema
 * spells the same constraint and is not imported here to keep zod out of the on-air bundle.
 */
const TIME_OF_DAY = /^([01][0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/;

/**
 * A time of day typed in any digit set, as the CANONICAL Latin `HH:mm` or `HH:mm:ss` — or
 * `undefined` when it is not one. `۲۰:۳۲`, `٢٠:٣٢` and `20:32` are the same time.
 *
 * A bound value reaching a template is untrusted (a GDD client is not obliged to enforce a
 * field's `pattern`), so the caller applies NOTHING on `undefined`.
 */
export function parseTimeOfDay(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const latin = latinDigits(clean(raw));
  return TIME_OF_DAY.test(latin) ? latin : undefined;
}

const CLOCK_PART = /^[0-9]{2}$/;
const SECONDS_PART = /^([0-9]{2})(?:\.([0-9]+))?$/;

/**
 * A duration typed in any digit set, in milliseconds: `ss`, `m:ss` or `h:mm:ss` — `۰۰:۳۰` is
 * 30 000 — or a bare number, read as SECONDS so a field that always took seconds keeps its
 * meaning. `null` when it is not a duration. Never negative.
 */
export function parseDurationMs(text: string): number | null {
  const s = latinNumerals(clean(text));
  if (s === '') return null;
  if (!s.includes(':')) {
    const seconds = parseLocalizedNumber(s);
    return seconds === null || seconds < 0 ? null : Math.round(seconds * 1000);
  }
  const parts = s.split(':');
  if (parts.length > 3) return null;
  const [first, ...rest] = parts;
  if (first === undefined || !/^[0-9]+$/.test(first)) return null;
  const secondsText = rest[rest.length - 1] ?? '';
  const sec = SECONDS_PART.exec(secondsText);
  if (sec === null) return null;
  const seconds = Number(`${sec[1] ?? '0'}.${sec[2] ?? '0'}`);
  if (seconds >= 60) return null;
  let minutes: number;
  let hours = 0;
  if (rest.length === 2) {
    const mid = rest[0] ?? '';
    if (!CLOCK_PART.test(mid) || Number(mid) >= 60) return null;
    hours = Number(first);
    minutes = Number(mid);
  } else {
    minutes = Number(first);
  }
  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

/** The digit set a piece of text is written in. */
export type DigitSet = 'latin' | 'persian' | 'arabic-indic';

/** The set of the text's FIRST digit — `latin` when it has none. */
export function digitSetOf(text: string): DigitSet {
  const first = /[0-9۰-۹٠-٩]/.exec(text)?.[0];
  if (first === undefined || /[0-9]/.test(first)) return 'latin';
  return /[۰-۹]/.test(first) ? 'persian' : 'arabic-indic';
}

/**
 * Write `value` the way `sample` — the operator's own text — was written: in its digit set, with
 * its decimal mark and, if it grouped thousands with `٬`, grouped the same way. A number that
 * changes under the operator (a scrub, a Discard, an undo) then stays in the digits they chose.
 * Latin text gets exactly `String(value)`.
 */
export function formatNumberLike(value: number, sample: string): string {
  const set = digitSetOf(sample);
  const base = String(value);
  if (set === 'latin' && !sample.includes('٫') && !sample.includes('٬')) return base;
  const negative = base.startsWith('-');
  const [intPart = '', fraction] = (negative ? base.slice(1) : base).split('.');
  const grouped = sample.includes('٬')
    ? intPart.replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '٬')
    : intPart;
  // The mark the operator used wins; a sample with no fraction gets its set's own mark.
  const mark = sample.includes('٫') ? '٫' : sample.includes('.') || set === 'latin' ? '.' : '٫';
  const plain = fraction === undefined ? grouped : `${grouped}${mark}${fraction}`;
  const digits =
    set === 'persian'
      ? persianDigits(plain)
      : set === 'arabic-indic'
        ? arabicIndicDigits(plain)
        : plain;
  const sign = sample.includes('−') ? '−' : '-';
  return negative ? `${sign}${digits}` : digits;
}
