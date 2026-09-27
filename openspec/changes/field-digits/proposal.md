# field-digits — Persian digits on air whatever key the operator presses: a Digits setting on every template field

Prompt: `FIELD-DIGITS-01` (v1). It finishes `template-value-digits` (`PERSIAN-DIGITS-01`, landed at `27542771`,
not archived); the owner archives the two together.

## Why

The owner, 2026-09-27, on `dev:station --fake`: typing into a CG Control template field with the Windows
Persian keyboard — the top row and the numpad — put LATIN digits in the field. `PERSIAN-DIGITS-01`'s tests
passed only because they injected Persian characters directly. Measured on this machine (`design.md` §0.1): the
installed `Persian` layout (`00000429`) types U+0030–0039 on the top row AND the numpad, and even
`Persian (Standard)` (`00050429`) types Latin on the numpad. The app converts nothing; the keyboard never sends a
Persian digit. The product may not depend on a keyboard setting.

## What changes

- **Schema:** one optional `digits` value per field — on `text` and `multiline`: `as-typed` · `persian` · `latin` ·
  `arabic-indic`; on `number`: `persian` · `latin` · `arabic-indic`. Absent (every template made before this) means
  `as-typed` for a text field and `latin` for a number field, so nothing on air changes by itself; no migration
  rewrites a saved template. One reader of the effective choice, `fieldDigitsOf`.
- **One function, `writeFieldDigits` in `@cg/text-shaping`,** used by CG Control's Inspector, the page and so the
  Designer's preview: only `0-9`, `۰-۹` and `٠-٩` change, one character for one; a text value's punctuation
  stays as typed; a number's decimal point is drawn `٫` for Persian and Arabic-Indic, and no grouping is added.
  `as-typed` is the identity; the function is idempotent.
- **CG Control's Inspector:** as the operator types, each digit is written in the field's choice, the caret where
  it was — whatever key produced it, the numpad included. A number field's box shows the choice's digits; the
  reader, the refusal line and the staging are `PERSIAN-DIGITS-01`'s, and the wire stays a NUMBER.
- **The page** writes a bound value's digits in its field's choice, wherever it writes that field's text.
- **The Designer:** a `digits` setting on each text and number field (the clock's control and words); a NEW field
  starts on `persian`, text and number alike; the preview draws what air draws.
- `template-value-digits`' pending requirements that said a text value is never re-digited, and that a number
  renders in Latin, are amended IN PLACE (a second delta on the same header would collide at archive).

## What does NOT change

- A number field's wire value is a NUMBER. No bridge change.
- `PERSIAN-DIGITS-01`'s reader, its refusal line and its staging.
- Clocks, countdowns and the Jalali date. The Designer's chrome numbers (position, size).

## Impact

- `packages/text-shaping` (`writeFieldDigits`), `packages/shared-schema` (`digits`, `fieldDigitsOf`),
  `packages/template-runtime` (bindings), `apps/runtime` (Inspector, `NumericInput`), `apps/designer` (field
  meta, new-field default).
- Specs: ADDED to `template-value-digits`; `openspec/changes/template-value-digits` amended in place.
