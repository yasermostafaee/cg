## ADDED Requirements

### Requirement: Operators can author a live layout in CG Control

CG Control SHALL author multiple frames and presets in the channel's template catalogue.

#### Scenario: Build and edit a panel layout

- **WHEN** the operator opens New live layout
- **THEN** they can add and remove frames and presets, attach a station input and title to each frame, and select each preset's membership and arrangement
- **AND** each preset stores the selected variant of Auto layout and its spacing

#### Scenario: Style the title and arrange the gap

- **WHEN** the operator edits a frame title and switches between its presets
- **THEN** its position, size, font and background follow that frame
- **AND** a preset with more than one frame shows its own horizontal and vertical gap controls beside Arrange

#### Scenario: Save shared artwork and effects

- **WHEN** the operator saves a layout with a color, image or video background and effect settings
- **THEN** the saved template renders the selected background and uses the stored effects across its presets

#### Scenario: Prepare another programme

- **WHEN** the operator creates a layout or duplicates a listed layout while a different row is on air
- **THEN** the new layout has a separate identity and the running row keeps its picture and data
- **AND** existing Designer packages are still available in the same catalogue

### Requirement: Operators can focus and return in Preview and Programme

The console SHALL let an operator focus a frame and return to its originating preset with the saved effect.

#### Scenario: Focus a guest and return to the panel

- **WHEN** the operator chooses Focus and later Return
- **THEN** the selected frame expands and the exact originating preset is restored with its applied arrangement and inputs
- **AND** the browser's Preview stays independent of all programme commands

#### Scenario: Switch between solo guests

- **WHEN** the operator chooses another already defined frame during Focus
- **THEN** they can switch directly to that frame with the saved Cut, Fade, Motion, Push or Slide over effect
- **AND** their originating preset is still the destination of Return
- **AND** the switch keeps the configured inputs for both frames
