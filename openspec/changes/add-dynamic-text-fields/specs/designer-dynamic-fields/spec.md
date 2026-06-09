## ADDED Requirements

### Requirement: Element Data key syncs a scene field and binding

A text element SHALL become a runtime data field when it is given a non-empty
**Data key** in the inspector. Setting the key SHALL create (or update) a
scene-level dynamic field whose `id` equals the key and a `text` binding from
that field to the element, so the scene's `fields[]` and `bindings[]` remain the
single source of truth. The Data key SHALL be unique within the composition;
clearing it SHALL remove the backing field and binding. This concept SHALL be
distinct from the element's **Name** row (relabeled from "Key"), which edits the
element name shown in the timeline.

#### Scenario: Setting a Data key creates the field and binding

- **WHEN** the operator sets a non-empty Data key on a text element
- **THEN** a scene field with `id` equal to the key and a text binding to that
  element are created, and the field appears in the Fields list

#### Scenario: A duplicate Data key is rejected

- **WHEN** the operator sets a Data key that duplicates an existing field key
- **THEN** the inspector warns and does not create a conflicting field

#### Scenario: Clearing the Data key makes the element static

- **WHEN** the operator clears a text element's Data key
- **THEN** the backing field and binding are removed and the element renders its
  static text

### Requirement: Live field editing in the preview

The preview SHALL present a data-entry form generated from the composition's
dynamic fields (text as input, multiline as textarea, number as number input,
and color/boolean/select for the other field types), labelled by each field's
title, marking required fields, validating against `pattern`, `minLength`, and
`maxLength`, and seeded from each field's default. Editing a value SHALL update
the previewed output live through the same runtime used on air, and the preview
SHALL expose Play, Stop, Next, and Reset controls.

#### Scenario: Editing a value updates the preview live

- **WHEN** the operator edits a dynamic field's value in the preview form
- **THEN** the previewed text updates live using the same runtime as on air

#### Scenario: Reset restores defaults

- **WHEN** the operator clicks Reset
- **THEN** every field returns to its default value and the preview reflects it

### Requirement: Order-independent data application and payload parsing

The runtime SHALL apply the latest field data regardless of whether `update()`
is called before or after `play()`: a `play()` with no data SHALL preserve values
set by a prior `update()`, and `play(data)` SHALL merge its data over the current
values. `update()` SHALL accept a JSON string, an already-parsed object, or the
CasparCG legacy XML payload
(`<templateData><componentData id="KEY"><data id="text" value="V"/></componentData>…`),
SHALL ignore unknown keys, and SHALL truncate a text value to its field's
`maxLength` before applying (after which the element's existing auto-size /
auto-squeeze behavior applies).

#### Scenario: update before play is retained

- **WHEN** `update({f0:"Hello"})` is called and then `play()` is called with no
  data
- **THEN** the graphic shows "Hello" (the value is not wiped by play)

#### Scenario: Legacy XML payload is parsed

- **WHEN** `update()` receives
  `<templateData><componentData id="f0"><data id="text" value="Hello"/></componentData></templateData>`
- **THEN** it is parsed to `{f0:"Hello"}` and applied, and any key with no
  matching field is ignored

#### Scenario: maxLength truncation

- **WHEN** a field with `maxLength = 5` receives the value "Hello World"
- **THEN** the element's text is set to "Hello" and its auto-size / auto-squeeze
  behavior applies

  #### Scenario: Preview opens in a modal and tears down on close

- **WHEN** the operator clicks the Preview button
- **THEN** a modal opens showing the composition's simulated output at its own
  resolution (scaled to fit) with a live field form and Play/Stop/Next/Reset
- **WHEN** the modal is closed
- **THEN** the preview instance is torn down so its timers and animation loops stop

### Requirement: Bind from canvas binds one target per field

The Fields panel's **Bind from canvas** action SHALL bind a field to exactly one
target. The button SHALL be enabled only while the field has **no** binding, and
SHALL be disabled once the field is bound. Activating it SHALL bind the next clicked
canvas element and then exit bind mode (one activation = one bind). To bind a
different target the operator SHALL first remove the existing binding (the `×` in
the field's binding list), which re-enables the button. (This intentionally limits
a field to one target for now; binding a field to several different elements at once
is out of scope and would relax this rule.)

#### Scenario: Bind from canvas is disabled while the field already has a binding

- **WHEN** a field already has a binding
- **THEN** its "Bind from canvas" button is disabled
- **WHEN** the operator removes that binding via its `×`
- **THEN** the button becomes enabled again, and a binding on a _different_ field
  never disables this field's button
