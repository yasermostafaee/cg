# runtime-template-library Specification

## Purpose

TBD - created by archiving change import-vcg-template. Update Purpose after archive.

## Requirements

### Requirement: Import a `.vcg` template into the runtime library

The Runtime SHALL let the operator upload a `.vcg` file, verify it with
`@cg/vcg-format.verify` in the browser, and — on success — register it in the
template library so it can be loaded onto the stack with its field schema shown
in the Inspector. A package that fails verification SHALL register nothing and
surface a clear error. Verification and unpacking run in the renderer (the format
is isomorphic), so no Node APIs are imported into browser code.

#### Scenario: A verified `.vcg` is registered

- **WHEN** the operator uploads a `.vcg` **THEN** it is verified
  (`@cg/vcg-format.verify`) and added to the template registry

#### Scenario: A registered template loads onto the stack with its fields

- **WHEN** a registered template is selected **THEN** it can be loaded onto the
  stack with its field schema in the Inspector

#### Scenario: A package that fails verification registers nothing

- **WHEN** a `.vcg` fails verification **THEN** the operator sees a clear error
  and nothing is registered

### Requirement: The operator Inspector edits structured list fields without coercion

The Runtime operator Inspector SHALL edit a `list` (array) dynamic field — e.g. a
ticker's Data key — with a **structured items editor**, preserving the field value's
`ListItem[]` structure through display, edit, and the committed `stack.update`
payload. The editor SHALL preserve each item's stable `id` and any other (unknown)
fields, and SHALL support add / remove / reorder. Item text MAY span multiple
lines: the per-item editor SHALL be a multi-line control that preserves newlines in
an item's `text` on display AND on commit (lines are never joined/flattened), and
pressing Enter inside it SHALL insert a newline — never commit or submit. A list
value SHALL NEVER be rendered in a plain text input nor `String()`-coerced (which
produces `"[object Object]"`); a non-array value (including a legacy
`"[object Object]"` string) SHALL yield an empty items editor, not a corrupted text
field. The committed field value SHALL be the structured array, so the `CG ADD` /
`CG UPDATE` JSON carries real items, not a stringified array.

#### Scenario: A list field renders an items editor, not "[object Object]"

- **WHEN** a stack item with a `list` field (e.g. a ticker's `_tickerTexts`) is
  selected **THEN** the Inspector renders an items editor (one editable multi-line
  control per item showing the item's text) and never displays `"[object Object]"`

#### Scenario: Editing an item preserves structure and ships structured JSON

- **WHEN** the operator edits an item's text (or adds / removes / reorders items)
  **THEN** the Inspector commits the value via `stack.update` as a structured
  `ListItem[]` array (each item keeping its `id` + other fields) — not a
  `String()`-coerced string — so the on-air `CG UPDATE` payload carries real items

#### Scenario: A non-array value does not corrupt the editor

- **WHEN** the field value is not an array (undefined, or a legacy stringified
  value) **THEN** the editor shows no items (ready to add) rather than a text input
  containing `"[object Object]"`

#### Scenario: A multi-line item survives editing (newline never flattened)

- **WHEN** the operator types a two-line item text — pressing Enter for the line
  break — and commits (blur) **THEN** Enter inserts a newline (it does not commit
  or submit), the committed `ListItem[]` carries the item's `text` with the `\n`
  intact, and the editor keeps displaying both lines (the lines are never joined)
