# CG Control refuses a mistyped value against its field's pattern (R-101, RUN-NEXT-VERSION-02 Q14)

## Why

`R-101` (filed by `AZAN-DESIGNER-01`): CG Control's Inspector sent any text. A time like `25:00` in an azan template's
`Time (HH:MM)` field reached the page, which refused it (`parseTimeOfDay` answers nothing) and kept the old target, as
`D-141` §4.2 requires — and its `clock-target-unparseable` report reached no console. The operator typed a new azan
time, pressed Update, and the countdown went on counting to the old one with nothing said. The owner accepted building
it (`REPORT-RUN-NEXT-VERSION-01` Q14).

## What Changes

- **One rule** — `valueMatchesPattern` (`@cg/text-shaping`): a value passes when the pattern matches it as typed OR
  read with Latin digits (`۲۰:۳۲` is a time); an empty value and an unreadable pattern pass. The Designer's preview
  form asks it too (it held the same rule inline).
- **CG Control refuses on the one Update path** (`applyDraft`, shared by the Inspector's Update and the row's UPDATE): a
  STAGED value its field refuses sends nothing — not the field, not the rest of the press — and the operator reads
  `Not sent: <field label> — Not a Time (HH:MM), e.g. 21:30.`
- **One line under the field** while the refused draft stands, naming the form in the operator's words — a preset's
  name and example (the presets moved to `@cg/shared-schema` so CG Control can name them), else
  `Not in the form this field takes.` — never the regex.

## Impact

- **Specs:** `runtime-ui` (ADDED × 1).
- **Code:** `@cg/text-shaping` (`valueMatchesPattern`), `@cg/shared-schema` (`field-patterns.ts`, moved from the
  Designer), CG Control's `patternCheck.ts`, `applyDraft`, the Inspector, `App.tsx` (passes the template's form). No
  wire change.
