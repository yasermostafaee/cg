import { writeFieldDigits, type FieldDigits, type FieldDigitsKind } from '@cg/text-shaping';

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
 * `as-typed` writes nothing: the identity leaves the DOM untouched.
 */
export function writeDigitsAsTyped(
  el: HTMLInputElement | HTMLTextAreaElement,
  digits: FieldDigits,
  kind: FieldDigitsKind = 'text',
): string {
  const raw = el.value;
  const next = writeFieldDigits(raw, digits, kind);
  if (next !== raw) {
    const { selectionStart, selectionEnd, selectionDirection } = el;
    el.value = next;
    if (selectionStart !== null && selectionEnd !== null) {
      el.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
    }
  }
  return next;
}
