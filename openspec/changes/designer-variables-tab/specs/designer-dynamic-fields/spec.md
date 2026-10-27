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

#### Scenario: A narrow Inspector still reads as one table

- **WHEN** Variables is viewed in the normal narrow Designer right pane
- **THEN** each field's key, title, type/binding and compact actions remain on one aligned row under
  the matching column headings, without a separate action footer or repeated Variables heading

#### Scenario: Empty Sequence namespaces add no noise

- **WHEN** a Sequence contains composition items whose aggregates have no dynamic fields
- **THEN** those namespaces produce no row, heading or “no fields” text, while a sibling or deeper
  namespace that has a field remains visible

#### Scenario: A composition with no variables has one empty state

- **WHEN** the open composition's complete field aggregate is empty
- **THEN** Variables shows one concise empty state and Inspector shows no Fields section
