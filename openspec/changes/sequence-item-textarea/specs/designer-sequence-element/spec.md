# designer-sequence-element (D-118 delta)

## ADDED Requirements

### Requirement: Multi-line textarea for sequence item text

A sequence's per-item TEXT field SHALL be a multi-line, vertically resizable textarea (the shared
`renderer/ui/Textarea` design-system primitive), not a single-line input — comfortably sized for long
Persian copy — in BOTH the inspector (properties panel) AND the operator preview field form, so the
two match. Pressing Enter in it SHALL insert a `\n` into the item text and SHALL NOT commit/close the
field. Edits SHALL commit through the existing item-update store path (`setSequenceItems`, one undo
entry per edit), so an embedded `\n` round-trips through the store; in the inspector the textarea
SHALL apply the element's `direction` (`dir`) for RTL/mixed text. A composition item's picker is
unaffected (only the TEXT item gets the textarea).

#### Scenario: The item-text control is a textarea

- **WHEN** editing a sequence TEXT item's text in the inspector
- **THEN** the control is a multi-line textarea (the shared primitive), not a single-line input

#### Scenario: The preview field form matches the inspector

- **WHEN** editing a sequence-bound list field's item text in the operator PREVIEW field form
- **THEN** the control is the same multi-line textarea (not a single-line input) — the preview matches
  the properties panel

#### Scenario: Enter inserts a newline, not a commit

- **WHEN** the operator presses Enter in the item-text textarea
- **THEN** a `\n` is inserted into the item text and the field is NOT committed/closed

#### Scenario: Edits commit via the existing path and round-trip the newline

- **WHEN** the operator types multi-line text (including `\n`) into a sequence item
- **THEN** it commits through the existing `setSequenceItems` item-update path (one undo entry per
  edit), the value round-trips with the embedded `\n`, and undo reverts the edit

#### Scenario: RTL item text edits in reading order

- **WHEN** the sequence element's `direction` is `rtl`
- **THEN** the item-text textarea is `dir="rtl"` so Persian text edits in reading order
