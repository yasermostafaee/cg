# designer-dynamic-fields (D-059 delta)

## ADDED Requirements

### Requirement: Validation presets for a text field's pattern

The Inspector's "Dynamic / Data" section SHALL author a text/multiline field's `pattern` constraint
through a NAMED-PRESET select rather than a raw regex box: **None** (no pattern), the free-text
shapes **Email**, **Phone**, **Digits only**, **Letters only**, **Uppercase code**,
**Time (HH:MM)**, **URL**, and **Custom (advanced)**. Selecting a preset SHALL write that preset's
vetted regex SOURCE to the field's existing `pattern` through the existing field-meta update path,
and selecting None SHALL clear it — no new field model, no schema, runtime, or export change.

Every preset regex SHALL be ANCHORED (`^…$`) so it constrains the WHOLE value (the consumers test
with `new RegExp(source).test(value)`, a substring match), SHALL compile with NO flags, and the
digit / letter shapes SHALL accept Persian and Arabic-Indic forms alongside Latin.

**Custom (advanced)** SHALL reveal the raw regex input — the pre-existing UI — pre-filled with the
current pattern, so any regex remains authorable. Custom SHALL be a DISPLAY state, not a stored
value: the select SHALL show the preset a stored pattern spells, None when there is no pattern, and
Custom otherwise — so a pattern written before this change SHALL load as Custom with its regex
intact.

#### Scenario: Picking a preset writes its vetted anchored regex

- **WHEN** the operator picks "Email" in the Pattern select of a text field's Dynamic / Data section
- **THEN** the field's `pattern` becomes that preset's anchored regex source, the raw regex box is
  not shown, and an example of an accepted value is displayed

#### Scenario: A stored pattern shows the preset that wrote it

- **WHEN** a field whose `pattern` equals a preset's regex is selected
- **THEN** the Pattern select shows that preset (not Custom), with no raw regex box

#### Scenario: An existing hand-written pattern loads as Custom

- **WHEN** a field whose `pattern` matches no preset is selected
- **THEN** the Pattern select shows "Custom (advanced)" and the raw regex box shows the stored
  pattern unchanged

#### Scenario: Custom reveals the raw regex box over the current pattern

- **WHEN** the operator switches the Pattern select to "Custom (advanced)"
- **THEN** the raw regex input appears, pre-filled with the field's current pattern, and editing it
  commits that regex to `pattern`

#### Scenario: No pattern is None

- **WHEN** a field has no `pattern`
- **THEN** the Pattern select shows "None" with no raw regex box, and picking "None" on a field that
  has a pattern clears the constraint

#### Scenario: A preset is enforced where a hand-written regex is

- **WHEN** a field carrying a preset's regex receives a value of the wrong shape in the preview's
  data form
- **THEN** the form reports the mismatch exactly as it does for a hand-written pattern
