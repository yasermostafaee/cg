## ADDED Requirements

### Requirement: Operators can author a live layout in CG Control

CG Control SHALL author multiple frames and presets in the channel's template catalogue.

#### Scenario: Build and edit a panel layout

- **WHEN** the operator opens New live layout
- **THEN** it has no frames or presets, and either can be added first
- **AND** they can add and remove frames and presets, attach a station input and title to each frame, and select each preset's membership and arrangement
- **AND** each preset stores the selected variant of Auto layout and its spacing

#### Scenario: Style titles together and override a frame

- **WHEN** the operator edits the shared title style
- **THEN** all titles inherit the style and individual frame overrides take precedence in every preset
- **AND** the operator can adjust box size, padding, vertical offset, alignment, text and background colors, stroke, shadows, corner radius and wrapping
- **AND** fonts added to the layout are available to its titles and remain embedded when the layout is saved and reopened
- **AND** Advanced Digits formats titles and operator edits in Persian, Latin or Arabic-Indic, with Keyboard retaining the entered digits

#### Scenario: Add several texts to one frame

- **WHEN** the operator adds a second text to the frame
- **THEN** it has its own editable value, placement and overrides
- **AND** each added text inherits the frame title style and remains bound to the frame in each preset and Focus

#### Scenario: Choose a frame's position and Focus label

- **WHEN** the operator selects another position in the current preset
- **THEN** the frames in those two positions swap, including while Reverse is enabled
- **AND** a frame's Focus label is used in both Preview and Programme with its number available when the label is blank

#### Scenario: Author advanced frame geometry

- **WHEN** the operator opens Advanced frame controls
- **THEN** they can choose Fit or Crop edges, set Move and Resize permissions, and define rectangular mask windows
- **AND** the canvas reflects the input fit and masks
- **AND** the live layer uses the existing PVW tools for allowed edits
- **AND** a shared frame uses its authored geometry settings in each regular preset and Focus look

#### Scenario: See the current editing selection

- **WHEN** the operator selects a preset or a frame in the editor
- **THEN** the selected entry stays visibly distinct when focus moves away
- **AND** the editor gives the preview room to show the layout while keeping its controls reachable
- **AND** a preset with more than one frame shows its own horizontal and vertical gap controls beside Arrange in the main scroll area
- **AND** Start with this preset stays in the same place when the current preset changes

#### Scenario: Attach a graphic to a frame

- **WHEN** the operator attaches a VCG in Frame graphics
- **THEN** the graphic is present on that frame in each regular preset and Focus view that includes it
- **AND** it moves and transitions with that frame in PVW and PGM
- **AND** reopening a package with legacy preset-specific artwork preserves the earlier placements

#### Scenario: Save shared artwork and effects

- **WHEN** the operator saves a layout with a color, image or video background and effect settings
- **THEN** the saved template renders the selected background and uses the stored effects across its presets

#### Scenario: Save a layout with no background

- **WHEN** the operator selects None for the background
- **THEN** the areas outside the frames and artwork are transparent in every preset and Focus
- **AND** saving and reopening the layout restores the transparent background choice

#### Scenario: Read a frame's input levels in the editor

- **WHEN** the operator enables VU meters above the layout preview
- **THEN** live inputs and Playlist output show equal-width, full-height vertical rails for each measured channel flush with their frames
- **AND** the meter shows two empty rails before the first measurement and retains the last measured channel count with empty rails while the reading is stale
- **AND** opening the editor starts with preview meters off and Station setup, the frame list and each input picker attach compact vertical meters to their source thumbnails
- **AND** a frame assigned a media asset has no meter

#### Scenario: Prepare another programme

- **WHEN** the operator creates a layout or duplicates a listed layout while a different row is on air
- **THEN** the new layout has a separate identity and the running row keeps its picture and data
- **AND** existing Designer packages are still available in the same catalogue

### Requirement: Operators can focus and return in Preview and Programme

The console SHALL let an operator focus a frame and return to its originating preset with the saved effect.

#### Scenario: Focus a guest and return to the panel

- **WHEN** the operator chooses Focus and later Return
- **THEN** the selected frame expands and the exact originating preset is restored with its applied arrangement and inputs
- **AND** every frame in a multi-frame editor rehearsal shows its own Focus action
- **AND** the browser's Preview stays independent of all programme commands

#### Scenario: Switch between solo guests

- **WHEN** the operator chooses another already defined frame during Focus
- **THEN** they can switch directly to that frame with the saved Cut, Fade, Motion, Push or Slide over effect
- **AND** their originating preset is still the destination of Return
- **AND** the switch keeps the configured inputs for both frames
- **AND** the editor rehearsal and PVW show the selected effect between the two solo views, including when the console's interface uses reduced motion
- **AND** on Push and Slide over, artwork attached to either frame follows its movement and disappears behind the same edge as its picture on PVW and Programme
- **AND** a title hidden by Show title in Focus stays hidden in the solo view and keeps its regular preset visibility on Return
