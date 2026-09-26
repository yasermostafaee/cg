## ADDED Requirements

### Requirement: A row's PLAY SHALL be unavailable while the bridge would refuse its take

A row's PLAY SHALL be disabled while the bridge would refuse its take — the row is on air or
unsettled, or the published live-layers ledger holds a seat for it; the same `ownsLiveSeats` the
bridge refuses with — naming the row: _"<row> is already on air — take it out first."_ A take
the bridge refuses with `already-on-air` (a race, or another console's take) SHALL be reported in the
same sentence, in the row's own name. PLAY SHALL be available again once the row has left air or its
take has resolved as refused.

#### Scenario: An unconfirmed row does not offer PLAY

- **WHEN** a take's reply is overdue and the row reads `unconfirmed`
- **THEN** PLAY is disabled, is not lit in the air colour, and its title is the row's sentence

#### Scenario: A row whose plates are seated does not offer PLAY

- **WHEN** the ledger holds a seat for a row whose status reads loaded (adopted at a bridge restart)
- **THEN** PLAY is disabled with the row's sentence
- **AND** once CLEAR has taken the row out, PLAY is available

#### Scenario: A refused take can be tried again

- **WHEN** the row's take was refused and it reads ERROR
- **THEN** PLAY is available
