## MODIFIED Requirements

### Requirement: A live plate's picture is FITTED into its box by a selectable mode, and is never cut under the default

A `cover` fit SHALL accept an optional normalized crop focus and keep that source point inside the
plate. The Bridge SHALL obtain focus from the active look and pass it to the same shared function that
already produces `MIXER FILL` and `MIXER CLIP`. The clip SHALL remain the authored plate. Absence SHALL
be byte-identical to a centred focus, and `contain` SHALL ignore focus.

#### Scenario: Focus moves the cropped source without moving the plate

- **GIVEN** a wide source in a narrower `cover` plate
- **WHEN** horizontal focus changes from 0 to 1
- **THEN** the `MIXER FILL` moves from the source's first horizontal edge to its last
- **AND** `MIXER CLIP` remains exactly on the plate

#### Scenario: Per-look focus reaches air

- **GIVEN** one source appears with different focus in two looks
- **WHEN** the active look changes
- **THEN** the Bridge resolves that look's focus and recomputes the live-source geometry
