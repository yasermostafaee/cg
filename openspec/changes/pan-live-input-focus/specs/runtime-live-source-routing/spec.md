## MODIFIED Requirements

### Requirement: A live plate's picture is FITTED into its box by a selectable mode, and is never cut under the default

A `cover` fit SHALL accept an optional normalized crop focus and optional uniform magnification.
The Bridge SHALL obtain framing from the active look and pass it to the same shared function that
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

CG Control SHALL show the Pan tool in PVW. The gesture SHALL move only on axes with crop travel
and preserve the plate's boundaries and input assignment. PGM SHALL show its programme
return without Pan controls or crop guides.

#### Scenario: The Pan controls are discoverable before an input can be edited

- **WHEN** the operator opens the monitors **THEN** the PVW header shows Pan and the PGM header has no Pan action
- **WHEN** the operator enables or closes Pan **THEN** its pressed appearance follows the active tool state
- **WHEN** Pan displays a plate guide **THEN** the guide has a strong blue border with a dark edge for contrast over the picture
- **WHEN** the operator opens Pan in PVW with a visible Crop edges plate **THEN** a clearly labelled
  source picture or Bars guide can be dragged inside that plate's footprint
- **WHEN** the preset has no visible Crop edges plate **THEN** no practice plate appears
- **WHEN** the practice crop moves **THEN** its position is drafted locally and can be applied with Update or reset with Discard
- **AND** the authored plate, source assignment and programme output stay as they were

#### Scenario: The crop guide moves smoothly over the source

- **WHEN** the operator opens Pan in PVW **THEN** the available input picture or Bars guide fills its fitted source area, including around the crop
- **AND** the unused plate margins are opaque checkerboard
- **WHEN** the pointer moves across the source or onto a resize handle **THEN** the picture and checkerboard colors stay the same
- **WHEN** the operator drags the guide **THEN** it follows the pointer locally without a Bridge command
- **WHEN** the operator drags or resizes the crop **THEN** a matte dims the image outside the crop while the selected picture stays clear
- **WHEN** the gesture ends or is canceled **THEN** the matte clears
- **WHEN** the operator presses `Center` **THEN** the crop guide returns to the centre of the source picture or Bars guide at its current size

#### Scenario: Source and plate have different ratios

- **WHEN** a 4:3 source is cropped into a 16:9 plate **THEN** the crop uses the source width and can move vertically
- **WHEN** a wider source is cropped into a narrower plate **THEN** the crop uses the source height and can move horizontally
- **THEN** the source and crop guide keep their respective ratios throughout the gesture
- **WHEN** both ratios match at the largest crop size **THEN** the whole image is visible and there is no panning range

#### Scenario: The operator resizes the crop window

- **WHEN** the operator moves a crop corner in PVW
- **THEN** the crop resizes proportionally around the opposite corner, limited to the source bounds
- **AND** the largest crop is the existing cover window, including the full image for matching aspects
- **AND** a smaller crop can move on both axes while the plate and the source assignment stay fixed
- **AND** the resized crop becomes an Inspector draft with its position and size

### Requirement: Pan displays available pictures from the assigned source

Bridge SHALL pair each measured source JPEG with normalized active bounds, display aspect and a
stable source, producer and geometry revision. It SHALL only supply that mapping when the source
SAR is known, the decoded visible source is fully covered, source and applied rotation are zero,
and the visible source transformed into the JPEG agrees with the delivered active rectangle.
CG Control SHALL display the picture of the assigned input and preserve its aspect. When active
bounds are available it SHALL clip the JPEG delivery padding. A JPEG with unavailable or unmatched
geometry SHALL be labelled as a preview picture when the crop is ready. Bars SHALL remain available
when the assigned input has no usable JPEG.

#### Scenario: A compatible active rectangle fills the Pan source picture

- **GIVEN** a full visible source is delivered as a letterboxed JPEG with validated geometry
- **WHEN** the measured source identity and display aspect match the current Take target
- **THEN** Pan shows the active source at its display aspect and excludes the delivered padding
- **AND** the crop moves along the overflowing axis of that active source

#### Scenario: Frame refresh and geometry changes have different effects on a drag

- **WHEN** a new JPEG arrives with the same source, producer and geometry revision
- **THEN** the image refreshes without restarting the gesture
- **WHEN** the revision or source changes during a drag
- **THEN** the gesture ends without staging its old coordinates
- **AND** existing drafts retain their Take-token identity

#### Scenario: The assigned preview picture is available without exact Take geometry

- **WHEN** the assigned JPEG is available and measured geometry is unavailable or its display aspect disagrees with Take
- **THEN** Pan shows the assigned preview picture fitted to the guide without stretching
- **AND** a verified Take target remains required to save framing to the station
- **WHEN** the assigned JPEG is unavailable **THEN** Pan shows Bars across the source area

### Requirement: A verified PVW crop applies to the matching source

CG Control SHALL allow staging a normalized crop for a row on PVW with a visible cover-fit plate
and known source geometry. Bridge SHALL match its look, plate, source and geometry before applying
it. A legacy rehearsal requires leaving PVW before Take. Independent browser-only PVW may stay open.

#### Scenario: A staged crop is the first fit applied on air

- **GIVEN** the active look has a visible Crop edges plate with known source geometry
- **WHEN** the operator moves, resizes or centres the crop **THEN** its framing becomes an Inspector draft
- **AND** the draft survives turning ON PVW off and back on
- **WHEN** the operator discards the draft **THEN** the last applied crop is restored
- **WHEN** the operator clicks Update on the off-air row **THEN** Bridge validates and saves its crop drafts together without a mixer or producer command
- **WHEN** the operator leaves PVW and takes the row **THEN** the first hidden FILL uses the saved crop before the producer becomes visible

#### Scenario: Update on air applies the staged crop to programme

- **GIVEN** the PVW row also owns the verified live cover-fit plate in PGM
- **WHEN** the operator drags or resizes the crop **THEN** it becomes an Inspector draft without changing the programme
- **WHEN** the operator presses Update on air **THEN** the seated source is reframed inside its existing clip without a producer restart or volume change
- **AND** the Inspector clears the crop draft only after Bridge confirms it
- **WHEN** the row, preset, input or seat has changed or the engine refuses the crop **THEN** Bridge reports the refusal and CG Control keeps the draft
- **WHEN** Pan stays open across a Take **THEN** it checks the seated source as soon as the row settles

#### Scenario: An unavailable or stale crop cannot affect another input

- **WHEN** Bridge cannot supply a valid Take crop target **THEN** a generic Pan guide remains practice only
- **WHEN** the look, plate, source or fit has changed **THEN** the old target cannot stage a new edit on the changed input
- **WHEN** Take resolves a different target **THEN** the earlier stage does not override that target's authored or centred crop

#### Scenario: A previous Bridge still supports PVW practice

- **WHEN** Bridge capabilities omit the optional PVW crop channel **THEN** the console offers practice, with the reason shown in Pan
- **AND** the absent optional channel sends no crop request and does not raise the global Bridge compatibility warning
- **WHEN** a Bridge supports saving position but does not advertise resize for a verified target
- **THEN** the verified guide keeps positional Pan without sending a resize edit

#### Scenario: Preview keeps the saved framing with Pan closed

- **WHEN** the operator applies a crop and closes Pan
- **THEN** normal PVW renders the saved framing for the current verified plate, source and look
- **AND** closing Pan sends no playout command
