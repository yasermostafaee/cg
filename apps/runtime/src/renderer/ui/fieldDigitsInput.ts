import { writeDigitsInto } from '@cg/gesture';
import { fieldDigitsOf, type DynamicField } from '@cg/shared-schema';
import type { FieldDigits, FieldDigitsKind } from '@cg/text-shaping';
import { keyboardLanguage } from '../keyboardLanguage.js';

/**
 * `FIELD-DIGITS-01` — write the text in `el` in its field's digits AS IT IS TYPED, and put the
 * caret back where it was. Returns the written text for the caller to stage.
 *
 * A Windows keyboard types Latin digits on the numpad whatever its layout, and the owner's Persian
 * layout does on the top row too (`field-digits` `design.md` §0.1), so the key is never the
 * answer: the FIELD is. The one writer maps one character for one, so the selection indices
 * survive the rewrite. The DOM is written here, before the caller stages, so React's controlled
 * re-render finds the input already holding the value and leaves the caret alone — the same rule
 * `NumericInput` keeps for a console number.
 *
 * `TEXT-DIGITS-01` — `as-typed` is **Keyboard** now: a TYPED digit is written in the digits of the
 * keyboard language active as it is typed (the one detector), and a paste keeps its digits. Pass
 * the `input` event (React: `e.nativeEvent`) so what was typed can be told from what was pasted.
 * The whole rule is `@cg/gesture`'s `writeDigitsInto`, shared with CG Designer's editors.
 */
export function writeDigitsAsTyped(
  el: HTMLInputElement | HTMLTextAreaElement,
  digits: FieldDigits,
  kind: FieldDigitsKind = 'text',
  event?: Event,
): string {
  return writeDigitsInto(el, event, digits, keyboardLanguage, kind);
}

/**
 * `TEXT-DIGITS-01` — the text a template field's box stages (a text or multiline field, a list
 * cell): written in its FIELD's digits as it is typed. With NO resolved schema nothing is rewritten
 * — not knowing the author's choice is not a choice (`FIELD-DIGITS-01`), and that includes Keyboard.
 */
export function writeFieldText(
  el: HTMLInputElement | HTMLTextAreaElement,
  field: DynamicField | null | undefined,
  event?: Event,
): string {
  if (field === null || field === undefined) return el.value;
  return writeDigitsAsTyped(el, fieldDigitsOf(field), 'text', event);
}
