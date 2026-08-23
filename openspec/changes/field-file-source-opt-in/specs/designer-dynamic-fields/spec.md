# designer-dynamic-fields — the author grants a field its file source

## ADDED Requirements

### Requirement: A field's file source is an authored per-field grant

A field's **Dynamic / Data** metadata SHALL carry an authored grant deciding whether the Runtime
operator may source that field's value from a text file. The grant is a property of the FIELD,
authored beside the field's other properties (Title, Description, Required, length limits,
Pattern), not a property of the field's TYPE.

The grant SHALL be expressible only on the field kinds that can carry file content — `text`,
`multiline` and `list`. On every other kind it SHALL be un-settable rather than
settable-and-ignored: it is absent from the schema variant, so it cannot be written, stored or
read back.

A newly authored field SHALL default to NOT granted. Switching a field to a kind that cannot
carry file content SHALL DROP the grant rather than retain it invisibly; switching back SHALL
leave it un-granted until the author sets it again.

The grant SHALL survive the round trips a field already survives — Designer project save/load
and `.vcg` pack/unpack — by riding the field itself, with no second copy in the package manifest.

#### Scenario: The author grants a long-copy field its file source

- **WHEN** the author selects a text, multiline or list field's element and opens **Dynamic /
  Data** **THEN** an "Allow file source" control is shown beside the field's other authored
  properties, and setting it records the grant on that field alone

#### Scenario: A new field is not granted

- **WHEN** a field is created **THEN** it carries no file-source grant, so the Runtime offers no
  from-file control for it until the author grants one

#### Scenario: A kind that cannot carry file content cannot be granted

- **WHEN** the field's kind is `number` (or any other kind that cannot carry file content)
  **THEN** no "Allow file source" control is offered and the field carries no grant

#### Scenario: Switching a granted field to a number drops the grant

- **WHEN** a granted text field's Field type is switched to `number` **THEN** the grant is
  dropped from the field rather than retained invisibly, and switching back to `text` leaves it
  un-granted

#### Scenario: The grant survives save/load and a `.vcg` round trip

- **WHEN** a project carrying a granted field is saved and re-opened, or exported to `.vcg` and
  unpacked **THEN** the field still carries its grant, and the `TemplateInfo` the Runtime builds
  from the unpacked scene carries it to the operator's Inspector
