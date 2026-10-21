## ADDED Requirements

### Requirement: A staged value its field's pattern refuses is said under the field and never sent

CG Control SHALL check every STAGED text or multiline value against its field's `pattern` with the one rule
`valueMatchesPattern` — as typed, or read with Latin digits; an empty value and an unreadable pattern pass — before an
Update is sent, on the path the Inspector's Update and the row's UPDATE share. While a refused draft stands the field
SHALL show one line under it naming the form in the operator's words: a known preset's name and example
(`Not a Time (HH:MM), e.g. 21:30.`), else `Not in the form this field takes.` — never the regex. An Update with a refused
draft SHALL send nothing (the field, its siblings, a position, a timing or a plate) and SHALL say
`Not sent: <label> — <line>`. A field with no pattern SHALL be unaffected.

#### Scenario: A mistyped azan time

- **WHEN** an operator types `25:00` into a field whose pattern is the `Time (HH:MM)` preset and presses Update
- **THEN** the field reads `Not a Time (HH:MM), e.g. 21:30.`, the refusal reads
  `Not sent: Azan time — Not a Time (HH:MM), e.g. 21:30.`, and no update reaches the bridge

#### Scenario: A time typed in Persian digits

- **WHEN** the operator types `۲۰:۳۲` (or `20:32`) and presses Update
- **THEN** the line is gone and the update is sent

#### Scenario: No pattern

- **WHEN** a field has no pattern
- **THEN** any value is sent as before
