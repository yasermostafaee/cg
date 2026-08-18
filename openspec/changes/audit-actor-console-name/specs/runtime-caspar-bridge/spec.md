# runtime-caspar-bridge — delta (the audit actor names the acting console, B-141 follow-up)

## ADDED Requirements

### Requirement: The audit record names the console that acted

Every audited action SHALL record the operator name declared by the console that requested
it, rather than one constant for all consoles. The name SHALL be per-console: two consoles
driving one rundown SHALL be distinguishable in the record.

The name SHALL travel with each control request. Exactly ONE site on the sending side SHALL
attach it and exactly ONE site on the recording side SHALL resolve it, so that a newly added
channel or a newly added audit append cannot silently lose attribution by omitting a
parameter.

The recording side SHALL NOT trust the value as received. It SHALL normalise it by the same
rule the sender used, so that a blank or whitespace-only value cannot become an actor that
names nobody while appearing to name somebody.

Requests SHALL still be served when no name is declared. An unnamed request is recorded, not
refused.

#### Scenario: A configured name reaches the record

- **WHEN** a console with an operator name performs an audited action
- **THEN** the row written to the audit record carries that name

#### Scenario: Two consoles are told apart

- **WHEN** two consoles with different operator names each perform an audited action on the
  same bridge
- **THEN** each action's row carries its own console's name

#### Scenario: A blank name never becomes an actor

- **WHEN** a console declares a name that is empty or only whitespace
- **THEN** the action is recorded as unattributed, not as a name-shaped value

#### Scenario: An action with no console behind it is unattributed

- **WHEN** an audited action occurs outside any control request
- **THEN** it is recorded as unattributed, because no console caused it

### Requirement: An unconfigured console is legible as unconfigured

A console that has not been given an operator name SHALL record a value that reads as a
STATE rather than as a role or a plausible person. It SHALL NOT record the previous constant
`operator`, which — once some rows carry a typed name — cannot be told apart from a console
somebody chose to name `operator`.

#### Scenario: The default is a state, not a name

- **WHEN** an action is performed from a console with no operator name set
- **THEN** the row records `unattributed`, and never `operator`

#### Scenario: Clearing the name returns to unattributed

- **WHEN** an operator empties this console's name
- **THEN** subsequent actions record `unattributed` again

### Requirement: The operator is told what the recorded name is worth

The surface on which the operator sets and reads the name SHALL state, in the operator's own
terms, that the name is self-declared and unverified — that it identifies the CONSOLE as
labelled and not the PERSON, and that it does not change when somebody else takes the chair.

This statement SHALL appear where the audit record is READ, not only in design
documentation. A limit that only the implementer can see is the same defect as not knowing
it: the operator is the one who acts on the record.

The surface SHALL also state what an empty name records, so that leaving it blank is an
informed choice rather than an unnoticed default.

#### Scenario: The caveat is beside the record it qualifies

- **WHEN** the operator opens the audit surface
- **THEN** the name control and its unverified-identity caveat are visible together with the
  actor column they describe

#### Scenario: The empty case is stated on the surface

- **WHEN** the operator reads the name control
- **THEN** it says what is recorded when the field is left empty

### Requirement: The per-console name is stored per console

The operator name SHALL be stored locally to the console that set it, and SHALL NOT be
shared with other consoles connected to the same bridge. A value shared across the gallery
would answer nothing that a single constant did not already answer.

The name SHALL be read at the moment each request is sent, so that renaming a console takes
effect on its next action without a reload.

#### Scenario: One console's name does not become another's

- **WHEN** one console sets an operator name
- **THEN** another console connected to the same bridge is unaffected and keeps its own

#### Scenario: A rename takes effect immediately

- **WHEN** an operator changes this console's name and then performs an audited action
- **THEN** the action is recorded under the new name
