# designer-dynamic-fields (D-106 delta)

## MODIFIED Requirements

### Requirement: Live field editing in the preview

The preview SHALL present a data-entry form generated from the composition's
dynamic fields — text and multiline values render in a real, auto-growing multi-line
textarea (text disallows newlines, multiline allows them), number as a number input,
and color/boolean/select for the other field types — labelled by each field's title,
marking required fields, validating against `pattern`, `minLength`, and `maxLength`,
and seeded from each field's default. Editing a field value SHALL NOT update the
previewed output in realtime; the edited (pending) value SHALL be decoupled from the
applied value and SHALL change the stage ONLY when an explicit Update is invoked. The
form SHALL offer exactly ONE global "Update all" that applies every pending field at
once and, for EACH field with a pending change, its OWN per-field Update control that
applies only that field while the other pending fields stay pending. Applying an
Update SHALL update the bound values IN PLACE on the currently-held graphic, leaving
the background and every other element / animation untouched — the CG UPDATE standard:
no scene rebuild, no playout reset / replay, no background teardown. A field edited
but not yet applied SHALL show a pending / unapplied indicator (reusing the
unsaved-amber treatment from the desktop-save work). A long text value SHALL stay
fully visible — the textarea wraps and auto-grows to show the whole value, never
truncating it to a single line. The preview SHALL expose Play, Stop, Next, and Reset
controls.

#### Scenario: Editing a value does not change the preview until Update

- **WHEN** the operator edits a dynamic field's value in the preview form
- **THEN** the previewed output does NOT change, and the field shows a pending /
  unapplied indicator until an Update is applied

#### Scenario: Each pending field has its own Update control plus one global Update all

- **WHEN** the operator edits three fields so all three are pending
- **THEN** the form shows three per-field Update controls (one per pending field)
  and exactly one global "Update all" (there is no second global "Update"); clicking
  a per-field Update applies only that field while the others stay pending, and
  clicking "Update all" applies the rest

#### Scenario: Update applies in place and keeps the held background

- **WHEN** an Update (global or per-field) is applied while a graphic is held on the
  stage
- **THEN** only the bound values change on the held graphic, and the background and
  every other element / animation stay exactly as they were — no scene rebuild, no
  playout reset / replay, no background teardown

#### Scenario: A long value stays fully visible in a multi-line textarea

- **WHEN** a field holds long text (e.g. a ticker / sequence headline)
- **THEN** it renders in a real multi-line textarea that wraps and auto-grows so the
  full value is visible, never truncated to a single line

#### Scenario: Reset restores defaults

- **WHEN** the operator clicks Reset
- **THEN** every field returns to its default value and the preview reflects it
