# designer-project-persistence — delta (the compatibility floor, P-031)

## ADDED Requirements

### Requirement: A document that predates the current format fails loudly

A document whose form or schema version predates the current one SHALL be REFUSED at the point
it is read, with a message an author can act on. It SHALL NOT be silently reinterpreted,
partially loaded, or converted.

`schemaVersion` SHALL be validated as an exact literal. A document declaring any other version
SHALL fail to parse. There SHALL NOT be a schema-migration registry: a registry no load path
walks is a conversion that never runs while presenting itself as the place a conversion goes,
which is worse than having none at all.

Parse-time normalization SHALL remain the mechanism by which input is reshaped at the door.
What is retired is its use for LEGACY spellings, not the mechanism itself.

#### Scenario: A stale schema version is refused, not converted

- **WHEN** a document declaring a schema version other than the current one is parsed
- **THEN** the parse fails
- **AND** no migration is attempted, because no migration registry exists to attempt one

#### Scenario: A legacy key does not stand in for its replacement

- **WHEN** a document carries a legacy key whose replacement is required, and not the replacement
- **THEN** the parse fails, naming the required key that is missing
- **AND** the legacy key is not read as the replacement's value

#### Scenario: A pre-package project document is refused by name

- **WHEN** a bare pre-package project document is opened
- **THEN** the read throws with a message naming what the file is and telling the author to
  re-create it in the current format
- **AND** nothing is partially opened

### Requirement: The compatibility floor is the first shipped release

Until the first release delivered to a client, backward compatibility SHALL NOT be owed: a path
that exists only to open an older file MAY be deleted, and the default when it costs a branch, a
second document shape, or a second derivation SHALL be to delete it and fail loudly.

From the first release a client holds, this SHALL reverse. A file that release could open SHALL
keep opening, compatibility paths SHALL become requirements with tests, and removing one SHALL be
a breaking change requiring its own decision.

#### Scenario: The reversal is discoverable, not folklore

- **WHEN** a developer looks for the project's compatibility policy
- **THEN** both halves are recorded together — the current licence AND the release that ends it
- **AND** the record states that the licence is scoped to the fact that nothing has shipped, so
  it cannot be cited after a release has gone out
