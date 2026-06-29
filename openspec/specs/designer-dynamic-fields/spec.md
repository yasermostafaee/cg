# designer-dynamic-fields Specification

## Purpose

TBD - created by archiving change add-dynamic-text-fields. Update Purpose after archive.

## Requirements

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
dynamic fields — text and multiline values render in a real, auto-growing multi-line
textarea (text disallows newlines, multiline allows them), number as a number input,
and color/boolean/select for the other field types — labelled by each field's title,
marking required fields, validating against `pattern`, `minLength`, and `maxLength`,
and seeded from each field's default. Editing a field value SHALL NOT update the
previewed output in realtime; the edited (pending) value SHALL be decoupled from the
applied value and SHALL change the stage ONLY when an explicit Update is invoked. The
form SHALL offer exactly ONE global "Update all" that applies every pending field at
once and, for EACH editable INPUT with a pending change, its OWN per-input Update
control that applies only that input while the other pending inputs stay pending — a
scalar field's single input has its own Update, and a `list` field (ticker / sequence
items) gives EACH item input its own per-item Update instead of one whole-list Update.
Applying an
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

#### Scenario: Each pending input has its own Update control plus one global Update all

- **WHEN** the operator edits three scalar fields so all three are pending
- **THEN** the form shows three per-input Update controls (one per pending input)
  and exactly one global "Update all" (there is no second global "Update"); clicking
  a per-input Update applies only that input while the others stay pending, and
  clicking "Update all" applies the rest

#### Scenario: A list field's items each get their own per-item Update

- **WHEN** a ticker / sequence binds to a `list` field and the operator edits one of
  its item inputs
- **THEN** that item shows its OWN per-item Update control (enabled only for the
  edited item; the whole `list` field has no single per-field Update), and applying
  it commits ONLY that item IN PLACE — the other edited items stay pending and the
  held background is untouched

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

### Requirement: Fields are scoped per composition

Dynamic fields SHALL be owned per composition: each composition carries its own `fields` and `bindings`, and the inspector and preview SHALL show ONLY the open composition's own fields (plus its nested children's, aggregated — see below), never all fields across the project. Within a single composition data keys SHALL stay flat and unique (the duplicate-key warning still applies). A standalone composition (no nested instances) SHALL be unchanged — flat keys, no namespace, no migration of its own data.

#### Scenario: A standalone composition shows only its own fields

- **WHEN** a composition with no nested child instances is open
- **THEN** its data-key list (inspector and preview) shows exactly that
  composition's own fields, flat, with no namespaces

#### Scenario: A field added in one composition is not visible in another

- **WHEN** a field is added while composition A is open and then composition B is
  opened
- **THEN** the field appears under A and not under B

### Requirement: Nested child instances expose fields under a per-instance namespace

A composition nested as a child instance SHALL expose its fields in the parent under that instance's namespace, as a nested object, where the namespace key is the instance's user-editable name. Different children SHALL get different namespaces; the SAME child instanced twice SHALL produce two independent namespaces (e.g. `home`/`away`) whose values are set independently; arbitrary nesting depth SHALL nest deeper (`a.b.c`). The parent's data and GDD SHALL use nested objects (e.g. `{ "home": { "teamName": …, "score": … }, "away": { … } }`). Instance names SHALL be unique within a parent.

#### Scenario: A parent shows its children's fields grouped/namespaced

- **WHEN** a parent composition nests a child instance named `home`
- **THEN** the parent's fields include the child's fields grouped under the `home`
  namespace, and the data/GDD represent them as a nested `home` object

#### Scenario: The same child instanced twice has two independent namespaces

- **WHEN** the same child composition is instanced twice as `home` and `away`
- **THEN** the parent exposes two namespaces with independent values, so setting
  `home`'s field does not change `away`'s

#### Scenario: Instance names stay unique within a parent

- **WHEN** a second instance is added (or an instance is renamed) to a name already
  used by another instance in the same parent
- **THEN** the name is made unique (e.g. `Scoreboard 2`) so each namespace is
  distinct

### Requirement: Parent preview routes namespaced values to the right nested child

Setting a namespaced field value in a parent SHALL update the element inside the correct nested child instance. The runtime `update()` SHALL consume the nested data object and route each namespace to its instance, so the same child instanced twice updates independently; a missing namespace SHALL fall back to the child's field defaults.

#### Scenario: Updating a namespaced field updates the right nested child's element

- **WHEN** the operator sets `home.teamName` in the parent preview
- **THEN** the element inside the `home` instance updates to that value while the
  `away` instance keeps its own value
