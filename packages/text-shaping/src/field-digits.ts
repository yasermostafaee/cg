import { arabicIndicDigits, latinDigits, persianDigits } from './digits.js';
import type { DigitSet } from './numerals.js';

/**
 * `FIELD-DIGITS-01` — the digits a template field's value is written in: the author's choice,
 * or `as-typed` for none. `@cg/shared-schema` spells the same list as the field's `digits`
 * enum; every call site passes that enum here, so a value added there and not here fails to
 * compile.
 */
export type FieldDigits = 'as-typed' | DigitSet;

/** What the value is: text keeps its punctuation; a number's decimal mark follows its digits. */
export type FieldDigitsKind = 'text' | 'number';

/**
 * `FIELD-DIGITS-01` — **THE ONE WRITER of a template value in its field's digits**, used by CG
 * Control's Inspector as the operator types, by the page as it draws, and so by the Designer's
 * preview, which is the page.
 *
 * Every `0-9`, `۰-۹` and `٠-٩` becomes the same digit in the chosen set, one character for one.
 * In `text` nothing else changes: `F-16` is `F-۱۶` and `ساعت 12:30` is `ساعت ۱۲:۳۰`. In a
 * `number` the decimal mark — `.` or `٫` — is written `٫` for Persian and Arabic-Indic and `.`
 * for Latin, and no grouping is ever added. `as-typed` is the identity, and the function is
 * idempotent: writing its own output again changes nothing, so the page may apply it to a value
 * the Inspector already wrote.
 *
 * ⚠ A number's WIRE value is never this text. The Inspector reads its box back through
 * `readLocalizedNumber` and sends the number; this function only decides how it is shown.
 */
export function writeFieldDigits(
  value: string,
  digits: FieldDigits,
  kind: FieldDigitsKind = 'text',
): string {
  if (digits === 'as-typed') return value;
  const latin = latinDigits(value);
  const written =
    digits === 'persian'
      ? persianDigits(latin)
      : digits === 'arabic-indic'
        ? arabicIndicDigits(latin)
        : latin;
  if (kind === 'text') return written;
  return written.replace(/[.٫]/g, digits === 'latin' ? '.' : '٫');
}
