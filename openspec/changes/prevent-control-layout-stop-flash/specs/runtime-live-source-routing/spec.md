## ADDED Requirements

### Requirement: Settled Control layouts leave output without a background-only teardown interval

The Bridge SHALL hide a rendered Control layout together when stopped, cleared or permissibly removed.
It SHALL hide its owned native pictures, foreground and background with one channel mixer
commit before clearing any of those pictures. Each hide SHALL require the current primary's
acknowledgement. Native pictures SHALL be staged first and the covering background page last,
so a partial/refused batch cannot expose an unhidden picture. Non-Control authored outros and
Control layouts without rendered native pictures SHALL retain their existing stop semantics.
An occupied or orphaned mixer channel SHALL use existing emergency teardown without waiting
for a new visibility batch. A later legitimate Take SHALL restore the resident Control page's
opacity only after its pictures have been seated. Any ambiguous restore or Play failure SHALL
re-hide the owned composition before removing pictures during rollback.

#### Scenario: A single preset or focused Control plate is stopped on either engine

- **GIVEN** a Control layout is showing a single-plate preset or focused plate on A or mapped promoted B
- **WHEN** the operator presses Stop or row Clear
- **THEN** the covering page and owned pictures become invisible in the same committed phase before native Clear
- **AND** the selected preset/Focus remains unchanged and a later Take can resume the resident stopped page

#### Scenario: A native hide or later Take acknowledgement fails

- **WHEN** a native hide is refused or succeeds only on a non-authoritative peer
- **THEN** the covering page is not staged hidden ahead of any unhidden native picture
- **WHEN** visibility restoration or resident Play applies but its acknowledgement fails
- **THEN** rollback hides the exact owned composition before clearing its pictures and preserves normal retry/interlock rules
