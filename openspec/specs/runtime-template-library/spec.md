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

The registered field schema SHALL be the template's **full field closure** — the entry
composition's own fields PLUS the fields of every nested composition instance,
namespaced by that instance's stable name — not the entry composition's flat fields
alone. A template whose fields live only inside a nested composition (the D-119 starter
shape: a graphic composition nested in a full-frame positioning composition) SHALL
therefore present those fields to the operator, not an empty form.

#### Scenario: A verified `.vcg` is registered

- **WHEN** the operator uploads a `.vcg` **THEN** it is verified
  (`@cg/vcg-format.verify`) and added to the template registry

#### Scenario: A registered template loads onto the stack with its fields

- **WHEN** a registered template is selected **THEN** it can be loaded onto the
  stack with its field schema in the Inspector

#### Scenario: A package that fails verification registers nothing

- **WHEN** a `.vcg` fails verification **THEN** the operator sees a clear error
  and nothing is registered

#### Scenario: A two-composition starter exposes its nested fields

- **WHEN** a starter whose editable fields live in a NESTED composition (a graphic
  composition nested inside a full-frame composition) is imported **THEN** the
  registered template's field schema includes those nested fields, grouped under the
  nested instance's namespace — the Inspector does NOT show "No fields."

#### Scenario: Nested field values seed and travel under the instance namespace

- **WHEN** such a template is loaded onto the stack **THEN** its field values are seeded
  as a NESTED value object keyed by the composition instance's stable name, and the
  `stack.load` / `stack.update` payload carries that same nested shape unchanged

### Requirement: The operator Inspector edits structured list fields without coercion

The Runtime operator Inspector SHALL edit a `list` (array) dynamic field — e.g. a
ticker's Data key — with a **structured items editor**, preserving the field value's
`ListItem[]` structure through display, edit, and the applied `stack.update`
payload. The editor SHALL preserve each item's stable `id` and any other (unknown)
fields, and SHALL support add / remove / reorder. Item text MAY span multiple
lines: the per-item editor SHALL be a multi-line control that preserves newlines in
an item's `text` on display AND when applied (lines are never joined/flattened),
and pressing Enter inside it SHALL insert a newline — never commit or submit. A
list value SHALL NEVER be rendered in a plain text input nor `String()`-coerced
(which produces `"[object Object]"`); a non-array value (including a legacy
`"[object Object]"` string) SHALL yield an empty items editor, not a corrupted text
field. Edits (item text, add, remove, reorder) SHALL stage locally and reach the
bridge ONLY when the operator applies the item (the Update button — see "The
operator Inspector stages edits"); the applied field value SHALL be the structured
array, so the `CG ADD` / `CG UPDATE` JSON carries real items, not a stringified
array.

#### Scenario: A list field renders an items editor, not "[object Object]"

- **WHEN** a stack item with a `list` field (e.g. a ticker's `_tickerTexts`) is
  selected **THEN** the Inspector renders an items editor (one editable multi-line
  control per item showing the item's text) and never displays `"[object Object]"`

#### Scenario: Editing an item preserves structure and ships structured JSON

- **WHEN** the operator edits an item's text (or adds / removes / reorders items)
  and then applies the item **THEN** the Inspector sends the value via `stack.update`
  as a structured `ListItem[]` array (each item keeping its `id` + other fields) —
  not a `String()`-coerced string — so the on-air `CG UPDATE` payload carries real
  items

#### Scenario: A non-array value does not corrupt the editor

- **WHEN** the field value is not an array (undefined, or a legacy stringified
  value) **THEN** the editor shows no items (ready to add) rather than a text input
  containing `"[object Object]"`

#### Scenario: A multi-line item survives editing (newline never flattened)

- **WHEN** the operator types a two-line item text — pressing Enter for the line
  break — and applies the item **THEN** Enter inserts a newline (it does not commit
  or submit), the applied `ListItem[]` carries the item's `text` with the `\n`
  intact, and the editor keeps displaying both lines (the lines are never joined)

### Requirement: The operator Inspector stages edits until an explicit apply

Inspector edits SHALL stage locally and SHALL NOT reach the bridge on change,
blur, or Enter. All field kinds stage — scalars, textareas, and list operations
(item text, add, remove, reorder). Enter in a textarea SHALL insert a newline;
Enter in a single-line input SHALL commit nothing.

The item's staged field-set SHALL be applied by an explicit control — the stack
row's Update button, with an equivalent apply control in the Inspector — as ONE
atomic `stack.update` carrying the complete field-set (no per-field sends). The
apply control SHALL remain usable even when nothing is staged, so an operator can
re-send unchanged values (the B-048 recovery workaround); staged state SHALL be
communicated by dirty markers, not by disabling apply.

Staged-but-unapplied state SHALL be visible: dirty fields carry a marker, a
Discard control reverts drafts to the last applied values, and a dirty item is
marked in the stack row so the operator sees that on-air values differ from the
draft. Drafts SHALL be per stack item and SHALL survive selection changes within
the session.

Take, Out, and Remove SHALL NOT apply drafts: Take plays the last applied values
and the item stays visibly dirty. Incoming stack-state pushes SHALL NOT clobber
in-progress drafts — an un-staged field follows the pushed value, a staged field
keeps its draft, and neither a push nor a commit re-mounts the editor (the first
click on a list control always lands; typing during a push never loses keystrokes).

#### Scenario: Edits stage and never reach air on blur or Enter

- **WHEN** the operator types in a field and blurs or presses Enter **THEN** no
  `stack.update` is sent, the on-air values are unchanged, and the field shows a
  dirty marker

#### Scenario: Update applies the whole staged set atomically

- **WHEN** the operator has staged several field edits and clicks Update **THEN**
  the Inspector sends exactly one `stack.update` carrying the complete field-set,
  the B-044 lifecycle settles the badge, and the dirty markers clear

#### Scenario: Discard reverts drafts to the applied values

- **WHEN** the operator has staged edits and clicks Discard **THEN** every field
  reverts to the last applied value and no `stack.update` is sent

#### Scenario: Apply is available with nothing staged (B-048 workaround)

- **WHEN** no edit is staged **THEN** the Update control still sends the item's
  current applied values (the operator's recovery path), rather than being disabled

#### Scenario: Drafts survive selection changes and are per item

- **WHEN** the operator stages an edit, selects another stack item, then returns
  **THEN** the draft is intact and unrelated items carry no draft

#### Scenario: Take does not apply a draft

- **WHEN** an item has a staged edit and the operator clicks Take **THEN** the last
  applied values play (not the draft) and the item stays visibly dirty

#### Scenario: A state push does not clobber an in-progress draft

- **WHEN** a stack-state push arrives while a field is staged **THEN** the staged
  field keeps its draft value, un-staged fields reflect the push, the editor does
  not re-mount, and the first click on a list add/remove/reorder control still lands

### Requirement: The operator Inspector edits nested-composition fields

The Runtime operator Inspector SHALL render a template's nested-composition fields as
labelled groups — one per composition instance, labelled by the instance's display label
(falling back to its namespace name) — with the entry composition's own fields rendered
at the top level as today. Groups SHALL nest to arbitrary depth.

An edit to a nested field SHALL stage, apply, and reach the wire through the SAME
staged-edit path as a flat field (R-003): it stages into the item's draft, applies as one
atomic `stack.update`, and arrives in the `CG UPDATE` data payload under the SAME nested
key (`{ instanceName: { fieldId: value } }`) that the template's binding resolves at
render. Two fields with the SAME id in different compositions SHALL remain distinct,
because each is addressed within its own instance namespace.

#### Scenario: Nested fields render as labelled groups

- **WHEN** the operator selects a stack item whose template has nested-composition fields
  **THEN** the Inspector shows a labelled group per composition instance containing that
  composition's fields

#### Scenario: A nested field edit round-trips to the wire under its binding key

- **WHEN** the operator edits a nested field and applies **THEN** the `stack.update`
  payload nests the value under the instance namespace, and the `CG UPDATE` data argument
  carries `{ "<instanceName>": { "<fieldId>": <value> } }` — the exact key the template
  runtime's binding reads, so the graphic re-renders with the new value

#### Scenario: Same-named fields in different compositions stay distinct

- **WHEN** two nested composition instances each declare a field with the same id
  **THEN** editing one does NOT change the other, because each value is addressed under
  its own instance namespace

### Requirement: The library presents a template by its display name

The Runtime template Library SHALL identify a registered template to the operator by its
**display name** — the `.vcg` manifest's `name` — not by its raw `templateId`. The id
SHALL remain discoverable as secondary information on the row, so an operator can still
correlate a row with a served `/template/<id>` URL or a stack item's `templateId`.

The registry metadata (`TemplateInfo`) SHALL carry the name as an **optional** field,
populated at import from the manifest (falling back to the scene's name) and, for a
bundled starter, from the starter's label. Optionality is deliberate: a `TemplateInfo`
without a name SHALL remain valid and SHALL display exactly as it does today.

A template with **no usable name** — absent, or present but blank after trimming, which
the manifest schema permits — SHALL fall back to displaying its `templateId`. The Library
SHALL NEVER show an empty primary line.

The display name SHALL be presentation only: it SHALL NOT become an identity. The
`templateId` remains the sole key for the registry, the stack item's `templateId`, the
served template URL, and every lookup — the name is never matched, keyed, or routed on,
and it never reaches an AMCP command argument.

#### Scenario: An imported template's row shows its manifest name

- **WHEN** the operator imports a `.vcg` whose manifest carries a display name **THEN**
  the Library row shows that name as its primary line, with the `templateId` still visible
  as secondary information

#### Scenario: A bundled starter shows its label, not its id

- **WHEN** the template library is seeded from the bundled starter pack **THEN** each
  starter's row shows the starter's display label, not its raw id

#### Scenario: A template with no usable name falls back to the id

- **WHEN** a registered template has no name, or a name that is blank after trimming
  **THEN** its row shows the `templateId` as the primary line — never an empty line

#### Scenario: The name is display-only and changes no identity

- **WHEN** a named template is loaded onto the stack **THEN** the `stack.load` payload,
  the registry lookup, and the served template URL all still key on `templateId` —
  the display name reaches no AMCP command argument and no lookup key
