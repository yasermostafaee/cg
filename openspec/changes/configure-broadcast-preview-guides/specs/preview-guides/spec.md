## ADDED Requirements

### Requirement: Preview guides SHALL support reusable app-local reference profiles

Designer canvas and CG Control PVW SHALL offer Auto, 16:9, landscape 4:3 and Custom
reference frames, contained and centred inside the active picture. Each app SHALL
let users edit the frame profile. CG Control SHALL let users add, hide, rename, reposition and remove horizontal/vertical guides by
percentage of the chosen reference. The ratio, broadcast-box choice and custom set
SHALL persist for that app across projects and restarts. The two apps SHALL keep
independent local settings. Designer's master display toggle SHALL remain default-off session state. CG Control SHALL share and persist the master display toggle for PVW and New live layout; it SHALL default to hidden if no visibility was saved. Guide settings SHALL NOT alter projects, exported pages, PGM or
programme commands.

The common guide colour SHALL default to white and SHALL apply to reference,
broadcast and inherited custom lines. Users SHALL be able to override a custom
line's colour and restore inheritance. Saved v1 records without colour SHALL use
white without discarding existing guide definitions or changing storage keys.

Users SHALL be able to enter the width and height of a custom aspect ratio. The
reference SHALL remain centered inside the project output or active picture.
Each custom ratio SHALL persist in the same app-local profile and remain available
after temporarily selecting another reference. Standard boxes and percentage
guides SHALL use the selected reference.

#### Scenario: A custom portrait guide is reused on a different output

- **GIVEN** the user selects Custom and enters 3:4 as the aspect ratio
- **WHEN** the reference is shown on a 1280×720 output
- **THEN** it is centered and measures 540×720
- **AND** a different output applies the same ratio to its own dimensions

#### Scenario: Common and custom colours remain independent

- **GIVEN** old v1 preferences contain reference and line definitions without colours
- **WHEN** the user opens guide settings
- **THEN** the existing definitions remain and all guide strokes default to white
- **AND WHEN** the common colour or a custom override changes
- **THEN** only the corresponding preview strokes change and persist across reloads
- **AND** restoring inheritance makes that custom line follow the common colour again

#### Scenario: One saved guide set is used in a different project

- **GIVEN** the user saved a named 75% horizontal guide and a 4:3 reference
- **WHEN** another project opens or the app restarts
- **THEN** the same profile is available without modifying either project
- **AND** enabling guides shows the line at 75% of the centred 4:3 reference
- **AND** other app installations/origins remain independent

#### Scenario: Saved guide data is invalid or storage is blocked

- **GIVEN** the saved preference is malformed, unsupported, oversized or out of range
- **WHEN** the app reads it
- **THEN** defaults are used without interpreting invalid guide positions
- **AND** failed storage access does not prevent in-memory guide editing

#### Scenario: The preview changes size or channel raster

- **GIVEN** a selected reference and custom percentage lines are visible
- **WHEN** the canvas zooms/pans, the PVW resizes, or its raster changes
- **THEN** the reference remains contained in the active picture
- **AND** guide percentages remain relative to that reference, excluding letterbox
- **AND** no guide content enters template pages or programme output

#### Scenario: New live layout shares CG Control's guide profile

- **GIVEN** a guide profile is configured in CG Control
- **WHEN** the operator opens the normal New live layout preview
- **THEN** that preview can display the same reference frame and custom lines
- **AND** both previews share a single display setting; toggling either updates both
- **AND** changing guides does not edit layout data or output graphics

#### Scenario: A layer profile restores CG Control Safe Areas

- **GIVEN** a CG Control layer profile is saved with the current guide preferences and visibility
- **WHEN** that layer profile is successfully loaded
- **THEN** PVW and New live layout use those same saved guide preferences and visibility
- **AND** older profiles without guide preferences keep the console's current settings

#### Scenario: Multiple safe frames are visible at once

- **GIVEN** the user enables a standard aspect and two custom aspects
- **WHEN** they enable and color individual 100%, 93%, 90% and 80% borders
- **THEN** each visible border is drawn in its own color or inherits its frame color
- **AND** its label identifies the ratio and percentage
- **AND** help identifies Action 93% and Graphics 90% as the EBU R 95 recommendations for 16:9
- **AND** choosing a frame to edit leaves the other visible frames on the canvas

#### Scenario: Designer snaps to visible safe area borders

- **GIVEN** Safe Areas and the existing Snap control are enabled
- **WHEN** the user moves or resizes an element near a visible border
- **THEN** the existing Snap gesture can align to that border
- **AND** hiding the border or using the existing temporary Snap bypass removes its attraction
- **AND** Designer continues to edit horizontal and vertical ruler guides through the existing rulers
- **AND** Shift+S toggles Safe Areas when focus is outside an editable field
