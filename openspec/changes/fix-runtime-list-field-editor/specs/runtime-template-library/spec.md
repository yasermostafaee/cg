# runtime-template-library (B-040 — operator list-field editor)

## ADDED Requirements

### Requirement: The operator Inspector edits structured list fields without coercion

The Runtime operator Inspector SHALL edit a `list` (array) dynamic field — e.g. a
ticker's Data key — with a **structured items editor**, preserving the field value's
`ListItem[]` structure through display, edit, and the committed `stack.update`
payload. The editor SHALL preserve each item's stable `id` and any other (unknown)
fields, and SHALL support add / remove / reorder. A list value SHALL NEVER be
rendered in a plain text input nor `String()`-coerced (which produces
`"[object Object]"`); a non-array value (including a legacy `"[object Object]"`
string) SHALL yield an empty items editor, not a corrupted text field. The committed
field value SHALL be the structured array, so the `CG ADD` / `CG UPDATE` JSON carries
real items, not a stringified array.

#### Scenario: A list field renders an items editor, not "[object Object]"

- **WHEN** a stack item with a `list` field (e.g. a ticker's `_tickerTexts`) is
  selected **THEN** the Inspector renders an items editor (one editable input per
  item showing the item's text) and never displays `"[object Object]"`

#### Scenario: Editing an item preserves structure and ships structured JSON

- **WHEN** the operator edits an item's text (or adds / removes / reorders items)
  **THEN** the Inspector commits the value via `stack.update` as a structured
  `ListItem[]` array (each item keeping its `id` + other fields) — not a
  `String()`-coerced string — so the on-air `CG UPDATE` payload carries real items

#### Scenario: A non-array value does not corrupt the editor

- **WHEN** the field value is not an array (undefined, or a legacy stringified
  value) **THEN** the editor shows no items (ready to add) rather than a text input
  containing `"[object Object]"`
