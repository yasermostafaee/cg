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

### Requirement: Operators can review the Pan interaction in PVW

CG Control SHALL show the Pan practice tool in PVW. The gesture SHALL move only the overflowing
axis and preserve the plate's boundaries and input assignment. PGM SHALL show its programme
return without Pan controls or crop guides.

#### Scenario: The Pan controls are discoverable before an input can be edited

- **WHEN** the operator opens the monitors **THEN** the PVW header shows Pan and the PGM header has no Pan action
- **WHEN** the operator enables or closes Pan **THEN** its pressed appearance follows the active tool state
- **WHEN** Pan displays a plate guide **THEN** the guide has a strong blue border with a dark edge for contrast over the picture
- **WHEN** the operator opens Pan in PVW with a visible Crop edges plate **THEN** a clearly labelled
  practice image can be dragged inside that plate's footprint
- **WHEN** the preset has no visible Crop edges plate **THEN** no practice plate appears
- **WHEN** the practice image moves or the operator closes it **THEN** the authored plate, source,
  staged focus and programme output stay as they were

#### Scenario: The crop guide moves smoothly over the source

- **WHEN** the operator opens Pan in PVW **THEN** the complete practice image and current crop guide are visible inside the plate
- **WHEN** the operator drags the guide **THEN** it follows the pointer locally without a Bridge command
- **WHEN** the operator presses `Center` **THEN** the crop guide returns to the centre of the practice image

#### Scenario: Source and plate have different ratios

- **WHEN** a 4:3 source is cropped into a 16:9 plate **THEN** the crop uses the source width and can move vertically
- **WHEN** a wider source is cropped into a narrower plate **THEN** the crop uses the source height and can move horizontally
- **THEN** the source and crop guide keep their respective ratios throughout the gesture
- **WHEN** both ratios match **THEN** the whole image is visible and there is no panning range
