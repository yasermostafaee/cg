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

- **WHEN** the operator opens Advanced plate controls
- **THEN** they can choose Fit or Crop edges, set Move and Resize permissions, and define rectangular mask windows
- **AND** the canvas reflects the input fit and masks
- **AND** the live layer uses the existing PVW tools for allowed edits
- **AND** the editor groups the authored aspect ratio, input fit, border and mask under Plate appearance, and groups Move, Resize and mask-editing access under Operator permissions in CG Control
- **AND** a shared frame uses its authored geometry settings in each regular preset and Focus look

#### Scenario: Style the plate border

- **WHEN** the operator opens Advanced plate controls and enters border color and width
- **THEN** the outline is drawn inside the plate and follows it across preview, presets and Focus
- **AND** the authored stroke remains equally thick on every side of a landscape or portrait plate
- **AND** the editor draws its selection outline outside the authored stroke

#### Scenario: Identify a selected plate in a close grid

- **WHEN** the operator selects a plate with a neighboring plate or stage edge touching it
- **THEN** the editor shows the selection outline above the pictures, clipped inside the stage where needed to show every side
- **AND** the selection keeps the authored picture, overlay and mask paint order.

#### Scenario: Edit a preset name and clear the gaps

- **WHEN** the operator adds a preset
- **THEN** its name field is focused in the Preset tab
- **AND WHEN** the operator presses Zero gap beside the spacing controls
- **THEN** both gaps in the selected preset become zero and its margin values do not change.
- **AND** plates and their pictures have square corners, including when reopening a package with a previously saved radius
- **AND** a zero-width border is hidden
- **AND** the border is saved in the VCG without changing the input crop or mask

#### Scenario: Frame one input differently in two presets

- **WHEN** the operator gives a three-plate preset a 3:4 aspect ratio and Crop edges
- **THEN** each plate uses a centered crop to fill its portrait box
- **AND** each plate can override the preset ratio and input fit
- **AND** a separate single-plate preset can show the same input at 16:9 with Fit whole picture
- **AND** the editor, PVW and Programme use the saved preset framing
- **AND** during editor motion the framing changes continuously with the plate while the input keeps its aspect ratio

#### Scenario: See the current editing selection

- **WHEN** the operator selects a preset or a frame in the editor
- **THEN** the selected entry stays visibly distinct when focus moves away
- **AND** the editor gives the preview room to show the layout while keeping its controls reachable
- **AND** a preset with more than one frame shows its own horizontal and vertical gap controls beside Arrange in the main scroll area
- **AND** Start with this preset stays in the same place when the current preset changes

#### Scenario: Preview assigned pictures in a preset

- **WHEN** a visible frame in the selected preset has an available direct NDI or routed input
- **THEN** the editor preview shows the assigned picture with that frame's saved fit and aspect ratio
- **AND** the editor keeps each picture with its assigned frame through a preset switch
- **AND** switching presets leaves programme commands and audio untouched

#### Scenario: Attach a graphic to a frame

- **WHEN** the operator attaches a VCG in Plate graphics
- **THEN** the graphic is present on that frame in each regular preset and Focus view that includes it
- **AND** it moves and transitions with that frame in PVW and PGM
- **AND** reopening a package with legacy preset-specific artwork preserves the earlier placements

#### Scenario: Save shared artwork and effects

- **WHEN** the operator wants to change the layout's shared effects
- **THEN** the Layout effects disclosure is available in the Plate tab and the choices apply to the whole layout
- **WHEN** the operator saves a layout with a color, image or video background and effect settings
- **THEN** the saved template renders the selected background and uses the stored effects across its presets

#### Scenario: Export and import a saved layout

- **WHEN** the operator selects a saved live layout in Templates and chooses Export .vcg
- **THEN** CG Control saves the layout's verified package as a file
- **AND** Import a .vcg restores the authored presets, settings, embedded assets and Edit layout action

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

### Requirement: Each plate can show an authored fallback

New live layouts SHALL let the operator choose bars, a solid colour or an image as a plate's
fallback. The chosen fallback SHALL appear beneath the plate picture in the editor and in PVW.
Show fallback on air SHALL independently control whether it appears in Programme. The saved
layout package SHALL retain the fallback settings and image assets for editing and export.
Layouts saved before this setting existed SHALL keep their Programme output.

#### Scenario: Use a fallback image while rehearsing a plate

- **WHEN** the operator chooses an image for a plate and turns off Show fallback on air
- **THEN** the image remains visible in the editor and in PVW when the source leaves the plate empty
- **AND** the Programme plate remains transparent in that area
- **AND** reopening the saved layout restores the image and the switch

### Requirement: The author can manually preview an assigned video in its plate

The live-layout editor preview SHALL offer a Play control on each visible plate assigned an
eligible video. Its sound SHALL start muted. The plate displays the decoded clip through its
current crop and mask. Playback, Pause and Reset are local to that plate and send no playout
command.

#### Scenario: Preview a preset with both NDI and media

- **WHEN** the author opens a preset with a plate assigned to NDI and a plate assigned to a video
- **THEN** each plate shows its own source and only the video plate offers Play, Pause and Reset
- **AND** playing, pausing or resetting a video does not replace the NDI picture.

#### Scenario: A plate clip starts only on request and resets to its start

- **WHEN** the editor preview shows two plates assigned video
- **THEN** each shows its library poster if available and offers Play without starting automatically
- **WHEN** the operator starts or pauses the first plate
- **THEN** only the first plate's clip responds
- **WHEN** the operator resets the first plate after playing
- **THEN** it pauses at the first frame and the second plate retains its current state

#### Scenario: Restore the selected preset's arrangement

- **WHEN** the operator edits gaps, margins, aspect, fit or custom placement and selects Reset to defaults in Arrange
- **THEN** the selected preset returns to the standard arrangement for its plate count, with the standard gaps, margins, fit and aspect
- **AND** the layout retains the selected preset's sources, artwork and plate-specific settings.

### Requirement: A linked overlay follows a base plate in all authored presets

The layout SHALL store a linked plate's base and relative rectangle with that plate. Its source
and mask SHALL remain independently editable. A linked plate SHALL be composited above the
base whenever the base belongs to an authored preset, without using a separate grid slot.

#### Scenario: Link an already placed and masked plate

- **WHEN** the operator places an upper plate inside a base plate, adds a mask and selects that base in Overlay on
- **THEN** the current relative rectangle and mask carry to each preset with the base, including one-base presets
- **AND** a preset without that base does not show the upper plate.

#### Scenario: Save, rehearse and play a linked overlay

- **WHEN** the operator saves the layout and switches between presets using the base plate
- **THEN** Edit live layout, PVW and Programme use the same placement and foreground order with two independent sources
- **AND** the separate Focus action keeps its established solo behaviour
- **AND** when moving between looks, the mask, border, title and artwork move with their plate
  through the transition.

#### Scenario: Focus a preset containing a linked overlay

- **WHEN** a preset has a base plate with one or more linked overlays
- **THEN** Edit live layout, PVW and Programme offer Focus only for independent plates
- **AND** Return restores the preset with its linked overlays
- **AND** Overlay on appears under Focus label when editing a plate.

#### Scenario: Leave a legacy overlay-only Focus

- **WHEN** a layout package compiled on an older version contains an independent overlay Focus
- **THEN** CG Bridge refuses a request to enter that look without changing Programme
- **AND** an existing on-air row in that look can switch to an independent Focus or return to the originating preset.
