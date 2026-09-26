## ADDED Requirements

### Requirement: A text template value keeps every digit as typed

A text-type template value SHALL keep every digit exactly as typed — Persian (U+06F0–U+06F9),
Arabic-Indic (U+0660–U+0669) or Latin, mixed if so typed — in the field, in stored state, in the
`CG ADD` / `CG UPDATE` data and in what the template renders. No surface SHALL normalise a text
value's digits in either direction. This covers `text`, `multiline` and list-item text, in the
Designer (a field's default, the preview form) and in CG Control (the Inspector, `Update on air`).

#### Scenario: A Persian, an Arabic-Indic and a Latin number reach CasparCG as typed

- **WHEN** the operator types `۱۲۳`, then `١٢٣`, then `123` into an on-air row's text field in CG
  Control's Inspector and presses Update each time
- **THEN** each `CG UPDATE` carries that exact string, code point for code point
- **AND** a Latin value is carried unchanged (the positive control)

#### Scenario: The Designer keeps a Persian default and previews it

- **WHEN** the author types `۱۲۳` as a text field's default, and `١٢٣` into the preview form
- **THEN** the default is stored as `۱۲۳`, the canvas shows `۱۲۳`, and the preview shows `١٢٣`

### Requirement: One reader turns a number-typed template input into a number

Every number-typed template input SHALL read its text through ONE function in `@cg/text-shaping`
(`readLocalizedNumber`) that accepts Latin, Persian and Arabic-Indic digits, the decimal separator
`.` or `٫` (U+066B), the thousands separator `٬` (U+066C) between digit groups, and an optional
sign. The inputs are CG Control's Inspector number field, and the Designer's number-field default,
preview-form number field and repeater number columns. The input SHALL display its text as typed;
the value it stages, stores and sends is the parsed NUMBER, so a `number` field still reaches the
template as a JSON number and renders there through `String(n)`, in Latin digits. No surface SHALL
keep a second copy of the digit ranges.

#### Scenario: Three spellings of twelve and a half

- **WHEN** `۱۲٫۵`, `١٢٫٥` and `12.5` are read
- **THEN** each reads as the number 12.5, and `۱٬۲۳۴` reads as 1234

#### Scenario: The operator's text stays on screen; the number goes to the wire

- **WHEN** the operator types `۱۲٫۵` into the Inspector's number field and presses Update
- **THEN** the field still shows `۱۲٫۵`, and the `CG UPDATE` data carries the number `12.5`

#### Scenario: The Designer's number inputs no longer lose Persian digits

- **WHEN** the author types `۱۲` into a number field's default, or `۱۲٫۵` into the preview form's
  number field
- **THEN** the box keeps showing what was typed and the stored or previewed value is 12 or 12.5,
  never empty and never `0`

### Requirement: A number-typed input refuses the impossible in one line and stages nothing it cannot read

A number-typed template input whose text can never become a number SHALL show a one-line refusal
beside the field and mark the field invalid, and SHALL stage nothing: the value an Update would
send for that field is the value on air, never a prefix of the refused text. Text that is merely
INCOMPLETE — empty, a lone sign, a lone decimal separator, digits ending in `٬` — SHALL raise no
refusal and SHALL also stage nothing.

#### Scenario: `۱۲a` is refused and does not reach air

- **WHEN** the operator types `۱۲a` into the Inspector's number field
- **THEN** the field keeps `۱۲a`, one line says it is not a number, and Update sends the value
  that was already on air for that field
- **AND** `۱۲` typed into the same field stages the number 12 with no refusal (the control)

#### Scenario: A half-typed number is not an error

- **WHEN** the field holds `-`, or `۱٬` on the way to `۱٬۲۳۴`
- **THEN** no refusal is shown

### Requirement: A time or a duration may be typed in any digit set

A time-of-day or duration template value SHALL be read with its digits in any of the three sets
through the one reader: `parseTimeOfDay` returns the canonical Latin `HH:mm` or `HH:mm:ss`, and
`parseDurationMs` reads `ss`, `m:ss` or `h:mm:ss` (a bare number is seconds). The countdown's
`clock-target` binding SHALL re-target a live countdown from `۲۰:۳۲`, `٢٠:٣٢` or `20:32` alike,
and SHALL still apply nothing for a value that is not a time. A list item's dwell SHALL accept a
duration in any digit set.

#### Scenario: A Persian azan time re-targets the countdown

- **WHEN** an update carries `۲۰:۳۲` for a field bound to a countdown's `clock-target`
- **THEN** the countdown re-targets to 20:32, exactly as it does for `20:32`
- **AND** `۲۵:۳۲` still applies nothing and is reported (the control)

#### Scenario: Thirty seconds

- **WHEN** `۰۰:۳۰` is read as a duration
- **THEN** it is 30 000 ms, as are `٠٠:٣٠`, `00:30` and `۳۰`

### Requirement: A field pattern reads a value's digits in any set

The check of a field's `pattern` SHALL accept a value that matches the pattern as typed, or whose
digits, `٫` and `٬` read as Latin (`latinNumerals`) match it. The value itself SHALL NOT be
rewritten, and no stored pattern SHALL be rewritten.

#### Scenario: The Time (HH:MM) preset accepts a Persian time

- **WHEN** a field carrying the `Time (HH:MM)` preset is given `۲۱:۳۰` in the Designer's preview
  form
- **THEN** no mismatch is shown, and the value stays `۲۱:۳۰`
- **AND** `۲۱:۷۰` is still refused (the control)

### Requirement: Persian digits render with real glyphs, one face per number

A template value's Persian and Arabic-Indic digits SHALL render with real glyphs — in the
template's own face when it has them, and otherwise in the bundled Vazirmatn that every element's
font stack names second and the single-file export inlines — and all the digits of one number
SHALL be drawn by one face, in the template on air, in the Designer's canvas and preview, and in
CG Control's fields.

#### Scenario: Ten Persian digits in the template

- **WHEN** a template text value is `۱۲۳۴۵۶۷۸۹۰` and the element's face has no Persian digits
- **THEN** the engine draws all ten with ONE face, and that face is Vazirmatn
- **AND** `1234567890` in the same run is drawn with glyphs too (the control)

### Requirement: A number inside Persian text reads in order

A value such as `ساعت ۱۲:۳۰` SHALL read with its digits in order and its colon in place, in CG
Control's Inspector field and in the template, through the existing direction handling (the
editor's `dir="auto"`, the Unicode bidi algorithm on the page), with no new direction mechanism.

#### Scenario: `ساعت ۱۲:۳۰` in the field and on air

- **WHEN** `ساعت ۱۲:۳۰` is typed into the Inspector and rendered by the template
- **THEN** in both, left to right, the characters read `۱`, `۲`, `:`, `۳`, `۰`, and the word
  `ساعت` sits to their right
- **AND** a Latin-only value reads left to right unchanged (the control)
