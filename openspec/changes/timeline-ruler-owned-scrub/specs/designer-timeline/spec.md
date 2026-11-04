## ADDED Requirements

### Requirement: Timeline scrubbing SHALL require a ruler-owned gesture

The frame ruler SHALL move the playhead only for a primary-pointer gesture whose press began on the
ruler. A held gesture that began on any other surface SHALL remain inert when it crosses the ruler.

#### Scenario: A foreign drag crosses the ruler

- **GIVEN** the pointer button was pressed outside the frame ruler
- **WHEN** the held pointer enters or moves across the ruler
- **THEN** the playhead does not move

#### Scenario: A ruler scrub retains and releases ownership

- **WHEN** the primary pointer is pressed on the ruler and moved
- **THEN** the ruler scrubs with that pointer
- **AND WHEN** the pointer is released, cancelled or loses capture
- **THEN** later moves from that pointer do not scrub until a new press begins on the ruler
