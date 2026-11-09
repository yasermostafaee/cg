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

#### Scenario: The Pan controls are discoverable before an input can be edited

- **WHEN** the operator opens the monitors **THEN** both headers show Pan
- **WHEN** PGM has no selected on-air row or the active engine's return is unavailable **THEN**
  its Pan action is disabled and no Bridge edit is requested
- **WHEN** the operator opens Pan in PVW **THEN** a clearly labelled practice image can be dragged
  inside the existing Crop edges plate's footprint, or inside a sample plate when none is present
- **WHEN** the practice image moves or the operator closes it **THEN** the authored plate, source,
  staged focus and programme output stay as they were

#### Scenario: The crop guide moves smoothly over the source

- **WHEN** the operator opens Pan in PVW **THEN** the complete practice image and current crop guide are visible
- **WHEN** the operator chooses an on-air crop with a compatible Bridge **THEN** PGM shows the proportional source extent and current crop guide
- **WHEN** the operator drags the guide **THEN** it follows the pointer locally and the console sends at most one scoped PGM crop command on release
- **WHEN** the operator presses `Center` **THEN** the supported axes return to the centred crop, with the same plate, clip, source and sound
- **WHEN** source pixels outside the programme clip are unavailable **THEN** the map identifies itself as geometry
