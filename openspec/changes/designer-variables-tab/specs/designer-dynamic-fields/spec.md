# designer-dynamic-fields — composition Variables surface

## ADDED Requirements

### Requirement: Dynamic fields live in one composition-level Variables tab

The Designer right pane SHALL offer **Inspector** and **Variables** as peer tabs. Variables SHALL
show the open composition's root fields and non-empty nested composition namespaces in a compact
table, with every field's key, title, type, binding and existing edit/remove actions. The selected
tab SHALL NOT change merely because an element or the canvas is selected.

The table SHALL use stable **Key**, **Title**, **Type / binding** and **Actions** columns. A field's
actions SHALL remain aligned in the same row as that field rather than wrapping into a card footer,
and the panel SHALL NOT repeat the Variables title already carried by the selected tab.

A direct nested-composition namespace SHALL keep its instance name as the stable operator-payload
key while its visible heading follows the referenced composition's current name. Values clipped by
the compact table SHALL disclose their complete text on hover. Focusing an editable Title SHALL give
it the adjacent Type / binding space while keeping Actions fixed in its original column.

Each root field SHALL use one fixed-position Bind/Unbind toggle with complete accessible names. Its
unbound state SHALL use a link glyph and its bound state SHALL use an unlink glyph without moving the
control. Hover and active Bind states SHALL use the binding violet rather than the ordinary blue
selection/accent colour, while hover on the Unbind state SHALL use danger red. While
Bind-from-canvas is active, the dark editing surround SHALL show a violet inset frame and soft shadow
without changing the output frame itself, and the canvas and pasteboard SHALL use a clear
link-badged pointer. A compact instruction SHALL say **Select an element** and name the element
families compatible with the active field type. A compatible hovered element SHALL show a target
frame whose colour and treatment are distinct from ordinary selection and whose geometry follows the
rendered element. The target frame SHALL disappear on leave, cancel or commit and SHALL NOT expose
resize/rotate handles. The instruction and editing-surround frame SHALL disappear on cancel or
commit.

The Inspector SHALL contain no duplicate Fields section. A nested namespace SHALL be omitted when
neither it nor any descendant declares a dynamic field. If the complete aggregate is empty, the
Variables tab SHALL show one concise empty state rather than one message per Sequence item.

#### Scenario: Variables remains visible while element selection changes

- **WHEN** the author opens Variables and then selects an element or the canvas
- **THEN** Variables remains the active composition-level surface and still shows the same field
  model

#### Scenario: Existing field actions work from the compact table

- **WHEN** the author relabels, binds, unbinds or deletes a field from Variables
- **THEN** the existing composition field/binding model changes exactly as it did from the former
  Inspector controls

#### Scenario: Bind and Unbind share one stable action

- **WHEN** an unbound field is shown in Variables
- **THEN** its binding toggle shows a link glyph and the accessible name “Bind from canvas”
- **WHEN** that field becomes bound
- **THEN** the same control in the same location changes to an unlink glyph and the accessible name
  “Unbind”
- **WHEN** the author hovers the Bind state or activates Bind mode
- **THEN** the toggle uses the binding violet rather than the blue selection/action colour
- **WHEN** the author hovers the Unbind state
- **THEN** the toggle uses danger red

#### Scenario: A narrow Inspector still reads as one table

- **WHEN** Variables is viewed in the normal narrow Designer right pane
- **THEN** each field's key, title, type/binding and compact actions remain on one aligned row under
  the matching column headings, without a separate action footer or repeated Variables heading

#### Scenario: Renaming a nested composition refreshes only its display label

- **WHEN** the author renames a composition referenced by another composition
- **THEN** its Variables namespace heading shows the current composition name while the stable
  payload namespace key remains unchanged

#### Scenario: Long values remain readable and Title remains editable

- **WHEN** a Title or Type / binding summary does not fit its compact column
- **THEN** hover exposes the complete value, and focusing Title expands its input into the adjacent
  Type / binding space without moving the Actions column

#### Scenario: Bind mode identifies a compatible target before commit

- **WHEN** the author activates Bind
- **THEN** a violet shadowed inset frame identifies the dark editing surround as the pending action
  area while the output boundary stays unchanged, and a compact instruction names the compatible
  element families
- **WHEN** the author then hovers a compatible visible element
- **THEN** the link-badged pointer and distinct target frame identify the pending target without
  changing selection or showing transform handles

#### Scenario: Bind targeting cleans up

- **WHEN** the pointer leaves the target, the author cancels Bind or the binding is committed
- **THEN** the target frame disappears and ordinary pointer/selection presentation returns

#### Scenario: Empty Sequence namespaces add no noise

- **WHEN** a Sequence contains composition items whose aggregates have no dynamic fields
- **THEN** those namespaces produce no row, heading or “no fields” text, while a sibling or deeper
  namespace that has a field remains visible

#### Scenario: A composition with no variables has one empty state

- **WHEN** the open composition's complete field aggregate is empty
- **THEN** Variables shows one concise empty state and Inspector shows no Fields section

## MODIFIED Requirements

### Requirement: Bind from canvas binds one target per field

The Variables panel's single binding toggle SHALL bind a field to exactly one target. When the field
has no binding, the control SHALL offer **Bind from canvas** and activating it SHALL bind the next
compatible clicked canvas element, then exit Bind mode (one activation = one bind). Once bound, the
same control SHALL offer **Unbind** instead of becoming disabled; activating it SHALL remove the
existing relationship and return the control to Bind. A binding on another field SHALL NOT affect
this field's toggle.

#### Scenario: The binding action toggles in place

- **WHEN** a field has no binding
- **THEN** its fixed binding control offers Bind from canvas
- **WHEN** a compatible target is committed
- **THEN** that same control offers Unbind and Bind mode exits
- **WHEN** the author activates Unbind
- **THEN** the field has no binding and the same control offers Bind from canvas again
