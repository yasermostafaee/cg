# designer-dynamic-fields (D-106 delta)

## MODIFIED Requirements

### Requirement: Live field editing in the preview

The preview SHALL present a data-entry form generated from the composition's
dynamic fields (text as a single-line input OR an optional multi-line textarea,
multiline as a textarea, number as number input, and color/boolean/select for the
other field types), labelled by each field's title, marking required fields,
validating against `pattern`, `minLength`, and `maxLength`, and seeded from each
field's default. Editing a field value SHALL NOT update the previewed output in
realtime; the edited (pending) value SHALL be decoupled from the applied value and
SHALL change the stage ONLY when an explicit Update is invoked — a global "Update
all" that applies every pending field at once, AND a per-field Update that applies
only that one field. A field edited but not yet applied SHALL show a pending /
unapplied indicator (reusing the unsaved-amber treatment from the desktop-save
work). Long values MAY be shown in a multi-line textarea (optional / expandable /
auto-grow), defaulting to a textarea for typically-long fields (ticker / sequence
text). The preview SHALL expose Play, Stop, Next, and Reset controls.

#### Scenario: Editing a value does not change the preview until Update

- **WHEN** the operator edits a dynamic field's value in the preview form
- **THEN** the previewed output does NOT change, and the field shows a pending /
  unapplied indicator until an Update is applied

#### Scenario: Global Update applies all pending; a per-field Update applies one

- **WHEN** the operator clicks the global "Update all"
- **THEN** every pending field change is applied to the preview at once and the
  pending indicators clear; **and WHEN** a per-field Update is clicked instead,
  only that field's pending value is applied while other pending fields stay pending

#### Scenario: A long value can be shown as a multi-line textarea

- **WHEN** a field holds long text (e.g. a ticker / sequence headline)
- **THEN** it can be shown as a multi-line textarea (optional / expandable /
  auto-grow) so the full value is visible

#### Scenario: Reset restores defaults

- **WHEN** the operator clicks Reset
- **THEN** every field returns to its default value and the preview reflects it
