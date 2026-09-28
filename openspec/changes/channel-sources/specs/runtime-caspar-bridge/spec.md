## ADDED Requirements

### Requirement: A take refused for having no plate band SHALL be carried on its row

A take the bridge refuses because no Live Source layer band is declared SHALL be recorded on its row as a take
refusal carrying the code `live-source-no-layer-range` and no plate — the band is the station's, not a box's — and
SHALL be answered as a refusal the row carries, exactly as a take refused for a plate is. Nothing SHALL be sent to
the server. A take of that row that lands SHALL withdraw it.

#### Scenario: The no-band refusal is on the row

- **WHEN** a template with plates is taken on a station with no band declared **THEN** the take is refused with
  `live-source-no-layer-range`, the row carries the refusal with that code, the reply says the row carries it, and
  no AMCP line was sent for the take
- **WHEN** the row is later taken and the take lands **THEN** the refusal is withdrawn
