## ADDED Requirements

### Requirement: Programme monitors show the selected Playout channel's linked engines

CG Control SHALL show each verified Playout member's programme picture, name, physical
channel and return signal. The operator SHALL be able to see all linked members at once,
including four members in a two-by-two grid. Each signal SHALL reflect its own picture relay.
CG Control SHALL identify the active engine when the Playout answers establish its identity.

#### Scenario: Show four linked engines

- **GIVEN** the selected channel has a configured engine and three linked reserves
- **WHEN** the operator selects All in Programme
- **THEN** four named, independently monitored pictures appear in a two-by-two grid
- **AND** a stalled or missing feed affects only its own tile

### Requirement: A backup warning keeps template identity visible

CG Control SHALL keep the template name visible when individual inputs cannot play on the
backup. It SHALL provide a compact status on the row and expandable details in Inspector
identifying affected media and reasons and distinguishing live inputs limited to the primary.

#### Scenario: Inspect missing backup media and live inputs

- **GIVEN** a row has named media missing on the backup and an input limited to the primary
- **WHEN** the operator views the row and its Inspector
- **THEN** the template name and short backup status are visible
- **AND** expanding Inspector details identifies the affected media and reports the live input separately

### Requirement: Source choices show availability on each configured server

When a backup is configured, source and media choices SHALL show compact, named indicators for the physical servers. Each indicator SHALL distinguish a confirmed catalogue match, confirmed unavailability, and unverified status. The indicator SHALL provide a text equivalent as well as colour. Catalogue availability describes the engine's own source library and does not indicate programme state or command ownership.

#### Scenario: One server has a verified copy of a media item

- **GIVEN** server A lists a media item and server B has confirmed that it does not have the same fingerprint
- **WHEN** the operator opens the source picker or inspects the assigned source
- **THEN** the A indicator shows available and the B indicator shows unavailable
- **AND** an unreadable catalogue or an unavailable fingerprint shows an unverified state for the affected server

#### Scenario: A programme switch does not relabel source availability

- **WHEN** programme ownership changes from server A to server B
- **THEN** the source indicators still describe each physical server's catalogue

### Requirement: Programme sound follows one verified engine

CG Control SHALL offer one console-local sound source, chosen by the operator or by
following the verified active engine. Follow SHALL be silent when active ownership is
unknown. Changing the monitored source SHALL close the previous sound stream.

#### Scenario: Follow the active member through a transfer

- **WHEN** a verified ownership change moves active control to another monitored member
- **THEN** Follow uses that member's programme sound and the previous sound is disconnected
- **AND** a temporary disagreement between engine observations leaves Follow silent

### Requirement: The PGM meter follows the selected programme sound source

CG Control SHALL show the selected verified return's actual metered levels. It uses the
engine's meter when its binding is verified. For a verified programme stream without
that binding, it uses the stream's stereo PCM peak levels. The meter starts visible
and can be hidden independently of programme listening.

#### Scenario: Select a reserve or let Follow choose it

- **WHEN** the operator selects a verified reserve or Follow changes ownership to it
- **THEN** the meter shows only that return's levels
- **AND** a stereo PCM meter and listening share the selected authenticated stream
- **AND** when the selected return has no meter data or Follow cannot verify a source, the shown meter keeps an empty scale

#### Scenario: Hide the PGM meter

- **WHEN** the operator toggles the PGM meter
- **THEN** the vertical meter appears or is hidden without changing programme listening
- **AND** the console remembers the choice
