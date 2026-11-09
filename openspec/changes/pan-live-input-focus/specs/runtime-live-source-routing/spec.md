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

## ADDED Requirements

### Requirement: Operators can pan the visible input on the CG Control monitors

CG Control SHALL offer direct dragging on a visible, cropped live plate using the actual picture.
The gesture SHALL move only the overflowing image axes and preserve the plate's boundaries and
input assignment. PVW SHALL stage the change before Take, and PGM SHALL apply a scoped change to the
current on-air plate.

#### Scenario: The same interaction targets two different monitor contexts

- **WHEN** an operator drags a cropped input in PVW **THEN** the local preview changes without a
  programme write
- **WHEN** an operator applies a drag to a cropped input in PGM **THEN** the on-air plate shows the
  chosen region with the same clip and audio
