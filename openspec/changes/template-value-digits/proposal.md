# template-value-digits — a template value takes digits exactly as the keyboard types them

Prompt `PERSIAN-DIGITS-01`. Builds on [[R-020]] (archived — the Runtime numeric-input half) and
[[D-130]] (queued — the Designer numeric-input half). Supersedes the part of both that said a
template value's number is DISPLAYED in Latin digits.

## Why

The client's operators write numbers in Persian digits (۰–۹, U+06F0–U+06F9) almost everywhere;
some layouts emit Arabic-Indic (٠–٩, U+0660–U+0669). The owner's rule: **a template value takes
digits exactly as the keyboard types them, and goes on air as typed.** It is needed for the first
client version.

Measured in a real browser before this change (Chromium; the fake CasparCG's decoded `CG UPDATE`
data; the Designer's exported single-file page driven through `update()`):

- **Text fields were already right, everywhere.** `۱۲۳`, `١٢٣`, `123` and `ساعت ۱۲:۳۰` are kept
  verbatim in the Designer's default and preview, in CG Control's Inspector, on the wire and on the
  on-air page.
- **The Designer's number inputs DESTROYED Persian digits.** Both are native `type="number"`: `۱۲`
  typed into a number field's default left the box empty and stored `0`; `۱۲٫۵` typed into the
  preview form's number field became `0`.
- **CG Control's number field rewrote the operator's text and could send a wrong number.** `۱۲٫۵`
  displayed as `12.5`; `۱٬۲۳۴` reached air as **1**; `۱۲a` reached air as **12** — the last prefix
  that parsed was silently kept, and nothing said a word.
- **A time typed in Persian was rejected.** The Designer's `Time (HH:MM)` preset refused `۲۱:۳۰`
  (`Doesn't match …`), and the countdown's `clock-target` parse — `\d` without the `u` flag —
  refuses `۲۰:۳۲`, keeping the old target on air.

## What changes

- **One reader for number-shaped template values**, in `@cg/text-shaping` (`numerals.ts`) — the
  package both apps and the on-air bundle already depend on. It accepts all three digit sets,
  `٫` (U+066B) beside `.`, `٬` (U+066C) between digit groups, and classifies text as a NUMBER, as
  INCOMPLETE (empty, a lone sign, a trailing separator) or as INVALID. Beside it: the
  time-of-day reader (`HH:mm[:ss]`), the duration reader (`[h:]m:ss` or seconds), and
  `latinNumerals` for pattern checks.
- **Number-typed template inputs keep the typed text on screen** and stage the parsed number:
  CG Control's Inspector number field; the Designer's number-field default, preview-form number
  field, repeater number columns and per-item dwell.
- **An impossible entry is refused in one line and stages nothing**; an incomplete one stages
  nothing and says nothing.
- **The countdown's `clock-target` accepts a time in any digit set.** The template re-targets to
  the canonical time; an unparseable value still applies nothing.
- **A field `pattern` accepts a value whose digits match it in any set** (the Designer's preview
  form — the only place a pattern is checked).

## What does NOT change

- **The wire contract of a `number` field.** It still carries a JSON NUMBER, as its GDD type
  `number` says, so the template renders it through `String(n)` — **Latin digits**. Carrying the
  typed spelling to air is a schema change (the default is `z.number()`), so it is an OWNER
  DECISION, recorded in `design.md` with a proposal, not built here.
- **Every operator-chrome number** — ports, device indexes, layers, position offsets, timing
  overrides, the lock PIN — keeps R-020's normalise-and-display-Latin behaviour (§1 E).
- Text values are not touched; no normalisation is added in either direction.
- No new direction mechanism: the Inspector keeps `dir="auto"`, the page keeps the Unicode bidi
  algorithm, and both were measured correct for `ساعت ۱۲:۳۰`.
- No schema, no persisted key, no AMCP verb. Numbers the template computes itself (clock,
  countdown) are unchanged — they already show Persian digits by default (measured).

## Impact

- `@cg/text-shaping` — new `numerals.ts` + tests.
- `@cg/template-runtime` — `clock-driver.ts` (time-of-day via the shared reader), `bindings.ts`
  (a `transform` target reads a localized number when `Number()` cannot). **On-air source.**
- `apps/runtime` — `NumericInput` gains an as-typed mode; the Inspector's number field uses it,
  refuses in one line and withdraws its draft on text that is not a number (`unstageField`).
- `apps/designer` — `LocalizedNumberInput` primitive; the number-field default, preview form,
  repeater number cells and dwell use it; `validateField` reads patterns through
  `latinNumerals`; `rebuildField` reads a text default through the shared reader.
- Specs: NEW capability `template-value-digits`; MODIFIED `runtime-ui` (the R-020 requirement is
  scoped to console numbers); the pending `add-azan-countdown` delta amended in place.
