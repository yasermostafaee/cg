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
