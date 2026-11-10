## ADDED Requirements

### Requirement: A layer can be on PVW and on air at the same time

On a capable Bridge, CG Control SHALL make the ON PVW and Play controls independent. A row's pending Inspector values SHALL render in its browser PVW without modifying programme output. Play SHALL take the last applied values. Update on air SHALL commit the staged values to the active output, and off-air Update SHALL save them for a later Take without putting the row on air.

#### Scenario: Preview a row that is on air

- **WHEN** a bound row is on air and the operator clicks ON PVW
- **THEN** its preview opens, Play remains active, and programme continues unchanged

#### Scenario: Stage an edit and apply only on request

- **WHEN** the operator edits an Inspector value with the row on PVW
- **THEN** the preview renders the draft immediately
- **AND** the programme keeps its applied value until Update on air

#### Scenario: Take a row with a draft in PVW

- **WHEN** the operator presses Play while the row is on PVW and its Inspector has unapplied edits
- **THEN** Take uses the applied fields and the draft stays visible in PVW
