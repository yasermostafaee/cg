# runtime-playout-sources

## MODIFIED Requirements

### Requirement: What the Playout stops offering SHALL become unavailable and SHALL never be deleted

An entry the Playout stops offering SHALL become `unavailable` — an input a successful D10 read no longer lists, or
a bound media id a successful `ids=` read leaves out — and every binding to it SHALL be kept and shown tagged. A
listed entry the Playout marks unavailable SHALL remain bindable for off-air preparation but SHALL NOT be seatable.
A take or a look switch whose destination look would show it SHALL be refused before any AMCP with
`source-unavailable`, even when the destination reuses a `plateId` already punched by the outgoing look but binds it
to a different source. A row that owns live seats SHALL likewise refuse an Update which introduces a new or changed
unavailable binding, before any field, binding, picture or geometry changes. Every refusal SHALL name `Plate N`, the
source and its unavailable reason; what is already on air SHALL be untouched. A binding which is unchanged SHALL NOT
become a refusal for an otherwise valid text-only or unrelated repair Update merely because the Playout marked its
source unavailable after it was bound. A later read that lists or marks the entry available again SHALL clear the tag.
Nothing SHALL ever be deleted because of a Playout read; only an operator action removes a binding.

An emergency live-source swap SHALL refuse an unavailable newly requested target before writing its override. An
unchanged invalid binding outside that repair SHALL NOT prevent a healthy target from being applied.

#### Scenario: An input the Playout removed

- **WHEN** the Playout removes `Studio 1` and the next read succeeds **THEN** it reads unavailable, the binding is
  kept, a take is refused with `… “Studio 1” is not in the Playout's input list.` and nothing is sent, and a row
  already on air with it is untouched
- **AND** when the Playout lists it again, the take plays (the control)

#### Scenario: No prune across a restart

- **WHEN** the bridge restarts after that removal **THEN** the assignment is still in the store

#### Scenario: A new unavailable binding in an on-air Update

- **GIVEN** a row owns live seats and its plate shows an available source
- **WHEN** one Update changes that frame to a listed source the Playout marks unavailable
- **THEN** the complete Update is refused with `source-unavailable` before any AMCP, its fields and bindings remain in
  force as before, its previous picture and geometry are untouched, and the sentence names the plate, source and
  reason

#### Scenario: The unchanged binding does not block a text correction

- **GIVEN** a source became unavailable after its binding was already in force
- **WHEN** an Update changes only text and carries the same binding
- **THEN** source availability alone does not refuse that Update, and no source substitution is attempted

#### Scenario: Prepare off air, refuse at the air boundary

- **GIVEN** a row owns no live seats
- **WHEN** the operator binds a listed unavailable source **THEN** the preset is stored without AMCP
- **AND WHEN** a later take or look switch would show that source **THEN** the action is refused before any AMCP and
  the prior on-air state, if any, remains whole

#### Scenario: The source becomes available again

- **WHEN** the Playout marks the same entry available and the catalogue refreshes
- **THEN** the same Update, take or switch may pass the availability gate (the control)

#### Scenario: Emergency repair validates only what it changes

- **GIVEN** a live row has an unchanged unavailable preset outside the repair
- **WHEN** the operator swaps another plate to a healthy source **THEN** the repair may proceed
- **AND WHEN** the operator instead targets a listed unavailable source **THEN** the swap is refused with
  `source-unavailable` before its override or any other state changes
