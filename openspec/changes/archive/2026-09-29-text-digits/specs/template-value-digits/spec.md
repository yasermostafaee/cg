## MODIFIED Requirements

### Requirement: A text template value keeps every digit as typed

A text-type template value SHALL keep its digits as its field's `digits` choice writes them, and a field set to
`as-typed` — shown as **Keyboard** (`text-digits`, 2026-09-27) — or carrying no setting SHALL keep each digit as it
was entered: a TYPED digit in the digits of the keyboard language active as it was typed (Persian digits for
Persian, Arabic-Indic for Arabic, Latin for English, and exactly as the key sent it when the language cannot be
known), a PASTED digit as pasted, and a value from any other source as it came. No surface SHALL normalise such a
value afterwards — in the field, in stored state, in the `CG ADD` / `CG UPDATE` data or in what the template renders.
This covers `text`, `multiline` and list-item text, in the Designer (a field's default, the preview form) and in CG
Control (the Inspector, `Update on air`).

#### Scenario: A Persian, an Arabic-Indic and a Latin number reach CasparCG as entered

- **WHEN** the operator pastes `۱۲۳`, then `١٢٣`, then `123` into an on-air row's Keyboard text field in CG Control's
  Inspector and presses Update each time
- **THEN** each `CG UPDATE` carries that exact string, code point for code point
- **AND** a Latin value is carried unchanged (the positive control)

#### Scenario: The Designer keeps a Persian default and previews it

- **WHEN** the author pastes `۱۲۳` as a Keyboard text field's default, and `١٢٣` into the preview form
- **THEN** the default is stored as `۱۲۳`, the canvas shows `۱۲۳`, and the preview shows `١٢٣`

### Requirement: One reader turns a number-typed template input into a number

Every number-typed template input SHALL read its text through ONE function in `@cg/text-shaping`
(`readLocalizedNumber`) that accepts Latin, Persian and Arabic-Indic digits, the decimal separator
`.` or `٫` (U+066B), the thousands separator `٬` (U+066C) between digit groups, and an optional
sign. The inputs are CG Control's Inspector number field, and the Designer's number-field default,
preview-form number field and repeater number columns. The input SHALL display its text in its field's `digits`
choice — in CG Control's Inspector and, from `text-digits` (2026-09-27), in the Designer's number-field default and
preview-form number field too — and the value it stages, stores and sends is the parsed NUMBER, so a `number` field
still reaches the template as a JSON number and renders there in its field's digits: Latin, through `String(n)`,
when the field carries no setting. No surface SHALL keep a second copy of the digit ranges.

#### Scenario: Three spellings of twelve and a half

- **WHEN** `۱۲٫۵`, `١٢٫٥` and `12.5` are read
- **THEN** each reads as the number 12.5, and `۱٬۲۳۴` reads as 1234

#### Scenario: The operator's text stays on screen; the number goes to the wire

- **WHEN** the operator types `۱۲٫۵` into the Inspector's number field set to `persian` and presses Update
- **THEN** the field still shows `۱۲٫۵`, and the `CG UPDATE` data carries the number `12.5`

#### Scenario: The Designer's number inputs no longer lose Persian digits

- **WHEN** the author types `12` into a number field's default set to `persian`, or `12.5` into the preview form's
  number field of the same field
- **THEN** the box shows `۱۲` and `۱۲٫۵`, and the stored or previewed value is 12 or 12.5, never empty and never `0`

### Requirement: A template field says which digits its value is written in

A template field SHALL carry an optional `digits` value: on a `text`, `multiline` or `list` field one of `as-typed`,
`persian`, `latin` or `arabic-indic`; on a `number` field one of `persian`, `latin` or `arabic-indic`. An absent
value SHALL read as `as-typed` (Keyboard) for a text, multiline or list field and `latin` for a number field, so a
template made before this setting existed renders exactly as it did, and no migration SHALL write the key. Every
surface SHALL read a field's effective choice through the one function `fieldDigitsOf`; with no field definition
it SHALL read `as-typed`.

#### Scenario: An old template renders unchanged

- **WHEN** a template whose fields carry no `digits` is loaded and played
- **THEN** a text value and a list's items draw exactly as stored and a number draws through `String(n)`, as before

#### Scenario: The effective choice

- **WHEN** a text field, a multiline field, a list field and a number field carry no `digits`, and a number field
  carries `persian`
- **THEN** they read `as-typed`, `as-typed`, `as-typed`, `latin` and `persian`

### Requirement: CG Control writes a field's digits as the operator types

CG Control's Inspector SHALL write each digit the operator enters into a text, multiline, list-cell or number field
in that field's choice as it is typed — whatever key produced it, the numpad included — with the caret where it was.
A field set to `as-typed` (Keyboard) SHALL write a TYPED digit in the digits of the keyboard language active as it
is typed, asked of the one detection module, and SHALL keep a pasted digit, and a digit typed while the language is
`unknown`, exactly as entered. A number field's box SHALL show the choice's digits and decimal mark; its reader, its
refusal line and its staging SHALL be `PERSIAN-DIGITS-01`'s, and the value it sends SHALL stay a JSON number. A field
whose template schema is not resolved SHALL be left as typed.

#### Scenario: The numpad and the top row type Persian into a Persian field

- **WHEN** the events a Windows keyboard sends for `1` (`key: '1'`, with `code: 'Numpad1'` and with
  `code: 'Digit1'`) reach an Inspector field set to `persian`
- **THEN** the box reads `۱`
- **AND** in a Keyboard field whose keyboard language is `latin` it reads `1` (the control)

#### Scenario: A Persian text field on the wire

- **WHEN** the operator types `12:30` into a text field set to `persian` and presses Update
- **THEN** the box shows `۱۲:۳۰` and the `CG UPDATE` data carries `۱۲:۳۰`
- **AND** a field set to `latin` shows and sends `12:30` (the control)

#### Scenario: A Persian number field stays a number

- **WHEN** the operator types `12.5` into a number field set to `persian` and presses Update
- **THEN** the box shows `۱۲٫۵` and the `CG UPDATE` data carries the number `12.5`

#### Scenario: A Persian list cell

- **WHEN** the operator types `12` into a cell of a list field set to `persian` and presses Update
- **THEN** the cell shows `۱۲` and the `CG UPDATE` data carries `۱۲`

#### Scenario: A Keyboard field follows the keyboard

- **WHEN** the keyboard language is `persian` and the operator types `12` into a Keyboard field, then the language
  becomes `latin` and they type `34`
- **THEN** the box reads `۱۲34`
- **AND** a paste of `۱۲ and 12` is kept exactly (the control)

### Requirement: The page draws a value in its field's digits

The template page SHALL write a bound text or multiline value, a bound number, and each item of a bound list, in its
field's choice wherever it writes that field's text — a text element, a Lottie text layer, a sequence text item, a
ticker's and a sequence's list items — before the binding's own transform, so a value from any source draws the
same. A date binding (`date-fa`, `date-en`) SHALL read its value's digits in any set and write the DATE in its
field's choice; with `as-typed` (Keyboard) or no choice it keeps the transform's own digits — Persian for `date-fa`,
Latin for `date-en`.

#### Scenario: The page follows the field

- **WHEN** a text field set to `persian` receives `12:30`, a number field set to `persian` receives `12.5`, and a list
  field set to `persian` receives the items `12` and `34`
- **THEN** the page draws `۱۲:۳۰`, `۱۲٫۵`, `۱۲` and `۳۴`, each number's digits in one face
- **AND** a field set to `latin` draws `12:30` (the control)

#### Scenario: A date in its field's digits

- **WHEN** a `date-fa` binding's field is set to `latin`, and another's to `persian`, and both receive `۲۰۲۶-۰۵-۱۹`
- **THEN** the first draws `1405/02/29` and the second `۱۴۰۵/۰۲/۲۹`, and neither throws
- **AND** with no choice it draws `۱۴۰۵/۰۲/۲۹`, as before (the control)

### Requirement: The Designer sets a field's digits, and a new field starts on Persian

The Designer SHALL show a Digits setting on each text, multiline, number and list field — including a sequence
item's field, beside its data key — with the clock's own control and the words **Keyboard · Persian · Latin ·
Arabic-Indic** (a number field: Persian · Latin · Arabic-Indic), and a field it makes SHALL start on `persian`. The
canvas and the preview SHALL draw what air draws.

#### Scenario: New fields and old documents

- **WHEN** the author gives a text element a Data key, switches that field to a number, gives a ticker a Data key,
  and gives a sequence item a data key
- **THEN** each new field's setting reads `persian`
- **AND** in a document saved before this setting, a text or list field reads `as-typed` and a number field `latin`

#### Scenario: The preview follows the choice

- **WHEN** a field's setting is changed from `latin` to `persian`
- **THEN** the preview draws its value in Persian digits

#### Scenario: The words

- **WHEN** the author opens a text field's Digits setting and a number field's
- **THEN** they read Keyboard, Persian, Latin, Arabic-Indic and Persian, Latin, Arabic-Indic, and each stores
  `as-typed`, `persian`, `latin` or `arabic-indic`

## ADDED Requirements

### Requirement: Text typed into an element is drawn in the element's Digits choice

A text, ticker or sequence element SHALL carry an optional `digits` value — `as-typed` (Keyboard), `persian`, `latin`
or `arabic-indic` — for the text its author typed INTO it: a text element's text, a ticker's authored items and
separator, a sequence's authored text items. The page SHALL draw that text through `writeFieldDigits` in the
element's choice, idempotently, and a value bound from a field SHALL be drawn by the field's choice, each part by its
own rule where one element holds both. An absent value SHALL read as `as-typed`, the identity on the page, and no
migration SHALL write it; an element the Designer makes SHALL start on `persian`. The Designer SHALL show the
element's Digits setting — the same control and words — while the element's text is its own, and the bound field's
setting instead while a Data key binds it.

#### Scenario: A Persian static title

- **WHEN** the author types `اخبار ساعت 14` into a new text element and exports the template
- **THEN** the canvas and the exported page draw `اخبار ساعت ۱۴`, its digits in one face
- **AND** the same title set to `latin` draws `اخبار ساعت 14` (the control)

#### Scenario: An old template's title

- **WHEN** a template saved before this setting holds a title `Score 12`
- **THEN** it draws `Score 12`, and a save adds no `digits` key

#### Scenario: Each part by its own rule

- **WHEN** a text element set to `persian` holds `ساعت 10 — {v}` and a placeholder binding writes `{v}` from a field
  set to `latin` receiving `25`
- **THEN** the page draws `ساعت ۱۰ — 25`

### Requirement: The Keyboard choice follows the active keyboard language

A digit typed into text whose choice is `as-typed` (Keyboard) SHALL be written in the digits of the keyboard language
active when it is typed, as answered by ONE detection module in each app (`@cg/gesture`'s `createKeyboardLanguage`),
which SHALL answer `persian`, `arabic`, `latin` or `unknown` from, in this order: the desktop shell's report; the
letters typed since the last layout-switch shortcut (only a letter one layout alone types proves a language); and
otherwise `unknown`. An `unknown` answer SHALL leave the digit exactly as the key sent it, and the module SHALL never
guess Persian. A paste SHALL keep its digits.

#### Scenario: The signal switches mid-typing

- **WHEN** the detection module answers `latin` while `12` is typed and `persian` while `34` is typed
- **THEN** the text reads `12۳۴`

#### Scenario: No evidence

- **WHEN** nothing proves a language — no shell, and only letters both Arabic-script layouts share
- **THEN** a typed `1` stays `1`

### Requirement: The desktop shells report the keyboard language with one read-only command

CG Designer's and CG Control's shells SHALL each provide ONE read-only command, `keyboard_language`, built from one
source file, that answers the language of the keyboard layout active on the thread that owns the webview's input
window — `persian`, `arabic`, `latin` or `unknown` — and changes nothing. CG Control SHALL grant it only to the
console page its bridge serves.

#### Scenario: The installed apps answer

- **WHEN** the installed CG Designer and CG Control are asked on a machine whose active layout is English
- **THEN** each answers `latin`

### Requirement: Every editing surface shows the chosen digits as it is typed

Every surface where digits are typed SHALL write the element's or field's choice as the text is entered, with the
caret kept, so what is being edited looks like what goes on air: in the Designer the canvas's double-click edit, a
field's Value box, the preview form, list items, sequence items and the ticker's separator; in CG Control the
Inspector's fields, list cells and sequence items. In a digit set every digit of the value SHALL be written in that
set, a paste included; in Keyboard only typed digits change.

#### Scenario: A Persian title double-click edited

- **WHEN** the author double-clicks a Persian title and types `14` into it
- **THEN** the editor shows `۱۴` while typing, with the caret after it
- **AND** a Latin title shows `14` (the control)

#### Scenario: The Value box and the preview form

- **WHEN** a Persian text field's Value box and its preview-form box are typed `12:30`
- **THEN** both show `۱۲:۳۰`

### Requirement: The clock writes its digits through the one writer

The clock and countdown SHALL write their formatted text in their `digits` choice through `writeFieldDigits`, the one
writer, and SHALL offer the choice with the same control and words as every other Digits setting (Persian · Latin ·
Arabic-Indic).

#### Scenario: A Persian countdown

- **WHEN** a countdown set to `persian` shows ninety minutes as `mm:ss`
- **THEN** it reads `۹۰:۰۰`
- **AND** set to `latin` it reads `90:00` (the control)
