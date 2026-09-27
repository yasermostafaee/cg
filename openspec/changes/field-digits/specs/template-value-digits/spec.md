## ADDED Requirements

### Requirement: A template field says which digits its value is written in

A template field SHALL carry an optional `digits` value: on a `text` or `multiline` field one of `as-typed`,
`persian`, `latin` or `arabic-indic`; on a `number` field one of `persian`, `latin` or `arabic-indic`. An absent
value SHALL read as `as-typed` for a text field and `latin` for a number field, so a template made before this
setting existed renders exactly as it did, and no migration SHALL write the key. Every surface SHALL read a
field's effective choice through the one function `fieldDigitsOf`; with no field definition it SHALL read
`as-typed`.

#### Scenario: An old template renders unchanged

- **WHEN** a template whose fields carry no `digits` is loaded and played
- **THEN** a text value draws exactly as typed and a number draws through `String(n)`, as before

#### Scenario: The effective choice

- **WHEN** a text field, a multiline field and a number field carry no `digits`, and a number field carries
  `persian`
- **THEN** they read `as-typed`, `as-typed`, `latin` and `persian`

### Requirement: One function writes a value's digits in its field's choice

`@cg/text-shaping` SHALL provide ONE function, `writeFieldDigits`, used by CG Control's Inspector, the page and the
Designer's preview, that writes every `0-9`, `۰-۹` and `٠-٩` of a value in the chosen set, one character for one.
In a text value every other character SHALL stay as typed; in a number the decimal mark SHALL be written `٫` for
Persian and Arabic-Indic and `.` for Latin, and no grouping SHALL be added. `as-typed` SHALL be the identity, and
the function SHALL be idempotent.

#### Scenario: Each choice

- **WHEN** `12.5`, `-3`, `1234567`, `ساعت 12:30` and `F-16` are written as a number or as text in `persian`,
  `latin` and `arabic-indic`
- **THEN** as a number `12.5` is `۱۲٫۵`, `12.5` and `١٢٫٥`; `-3` keeps its sign; `1234567` gains no separator; and as
  text `ساعت 12:30` is `ساعت ۱۲:۳۰` and `F-16` is `F-۱۶` in Persian, their punctuation untouched
- **AND** `as-typed` returns every value unchanged, and writing any result a second time changes nothing

### Requirement: CG Control writes a field's digits as the operator types

CG Control's Inspector SHALL write each digit the operator enters into a text, multiline or number field in that
field's choice as it is typed — whatever key produced it, the numpad included — with the caret where it was. A
number field's box SHALL show the choice's digits and decimal mark; its reader, its refusal line and its staging
SHALL be `PERSIAN-DIGITS-01`'s, and the value it sends SHALL stay a JSON number. A field set to `as-typed`, and a
field whose template schema is not resolved, SHALL be left as typed.

#### Scenario: The numpad and the top row type Persian into a Persian field

- **WHEN** the events a Windows keyboard sends for `1` (`key: '1'`, with `code: 'Numpad1'` and with
  `code: 'Digit1'`) reach an Inspector field set to `persian`
- **THEN** the box reads `۱`
- **AND** in a field set to `as-typed` it reads `1` (the control)

#### Scenario: A Persian text field on the wire

- **WHEN** the operator types `12:30` into a text field set to `persian` and presses Update
- **THEN** the box shows `۱۲:۳۰` and the `CG UPDATE` data carries `۱۲:۳۰`
- **AND** a field set to `latin` shows and sends `12:30` (the control)

#### Scenario: A Persian number field stays a number

- **WHEN** the operator types `12.5` into a number field set to `persian` and presses Update
- **THEN** the box shows `۱۲٫۵` and the `CG UPDATE` data carries the number `12.5`

### Requirement: The page draws a value in its field's digits

The template page SHALL write a bound text or multiline value, and a bound number, in its field's choice
wherever it writes that field's text — a text element, a Lottie text layer and a sequence text item — before the
binding's own transform, so a value from any source draws the same.

#### Scenario: The page follows the field

- **WHEN** a text field set to `persian` receives `12:30` and a number field set to `persian` receives `12.5`
- **THEN** the page draws `۱۲:۳۰` and `۱۲٫۵`, each number's digits in one face
- **AND** a field set to `latin` draws `12:30` (the control)

### Requirement: The Designer sets a field's digits, and a new field starts on Persian

The Designer SHALL show a `digits` setting on each text, multiline and number field that backs a Data key — the
clock's own control and words, with `as-typed` added for text — and a field made through a Data key SHALL start on
`persian`, text and number alike. The canvas and the preview SHALL draw what air draws.

#### Scenario: New fields and old documents

- **WHEN** the author gives a text element a Data key, and switches that field to a number
- **THEN** the setting reads `persian` both times
- **AND** in a document saved before this setting, a text field reads `as-typed` and a number field `latin`

#### Scenario: The preview follows the choice

- **WHEN** a field's setting is changed from `latin` to `persian`
- **THEN** the preview draws its value in Persian digits
