# text-digits — every text that shows digits has one Digits choice; "Keyboard" follows the keyboard language

Prompt: `TEXT-DIGITS-01` (v2). It follows `FIELD-DIGITS-01` (landed at `67909f96`; `template-value-digits` and
`field-digits` archived 2026-09-27) and MODIFIES their living requirements in `template-value-digits`.

## Why

`FIELD-DIGITS-01` measured the owner's keyboard: the Windows Persian layout (`00000429`) types LATIN digits
from the top row and the numpad, and Persian (Standard) types Latin on the numpad. So the digits of typed
text are the product's decision, never the keyboard's. The owner then checked by eye (2026-09-27):

1. a field set to Persian shows and airs Persian digits — good;
2. a static title typed in the Designer cannot have Persian digits: static text has no setting;
3. "As typed" only ever gives Latin, even on the Persian layout, so it is useless;
4. in the Designer, a double-click to edit a value shows Latin; it must show the chosen digits
   (`FIELD-DIGITS-01`'s choice 5, "the Designer's own value boxes are unchanged", is reversed);
5. the digits stay a CHOICE, not Persian everywhere — every text, the clock, the ticker and the rest.

List fields had no setting (`FIELD-DIGITS-01` choice 1), and a sequence item's field had no Designer surface
(its choice 6).

## What Changes

- **One Digits choice wherever digits are drawn**, with the clock's control and the same words everywhere:
  typed text — static text elements, text and multiline fields, list fields, a sequence's item fields — offers
  **Keyboard · Persian · Latin · Arabic-Indic**; number fields and the computed clock and countdown offer
  Persian · Latin · Arabic-Indic. A DATE is a field's binding transform, not an element: it is drawn in its
  FIELD's choice, and Keyboard (or none) keeps the transform's own digits — Persian for `date-fa`, today's
  behaviour (`design.md` choice 1).
- **"As typed" becomes "Keyboard"** (the stored value keeps the name `as-typed`, which old documents read): a
  typed digit follows the keyboard language active when it is typed — Persian → Persian digits, Arabic →
  Arabic-Indic, English → Latin; a paste keeps its digits; a language that cannot be known leaves the digit as
  the key sent it. Persian is never guessed.
- **One detection module** (`@cg/gesture`'s `createKeyboardLanguage`) answers `persian` / `arabic` / `latin` /
  `unknown` for every editor, from the desktop shell's ONE new read-only command (`keyboard_language`, both
  shells, one source file) and, in a browser, from the letters typed.
- **Defaults:** a new element or field starts on Persian; a template made before this draws its stored text
  exactly as today (absent = Keyboard, the identity on the page). No migration.
- **What is being edited looks like what goes on air:** every editing surface writes the element's or field's
  choice as it is typed, with the caret kept — in the Designer the canvas's double-click edit, the Inspector's
  text boxes, a field's Value box and the preview form; in CG Control the Inspector's fields, list cells and
  sequence items.
- **The page** draws each text by its own setting — the element's for the text its author typed, the field's for
  a value bound from a field — through the one writer, `writeFieldDigits`.

## What does NOT change

- `PERSIAN-DIGITS-01`'s reader and its refusal line; a number's wire value is still a NUMBER.
- The Designer's chrome numbers (position, size).
- Nothing else in either Tauri shell than the one read-only command.

## Impact

- `packages/text-shaping` (the keyboard's digits, the entered-text writer, a date read in any digit set),
  `packages/gesture` (the detector, the editors' writer), `packages/shared-schema` (`digits` on the text, ticker
  and sequence elements and on list fields), `packages/template-runtime` (static text, list values, the date's
  output, the clock), `apps/designer` (controls, editing surfaces, bridge), `apps/runtime` (list cells, sequence
  items, Keyboard mode, bridge), `apps/designer/src-tauri` + `apps/runtime/src-tauri` (the command),
  `Cargo.lock`, `pnpm-lock.yaml`.
- Specs: MODIFIED and ADDED in `template-value-digits`.
