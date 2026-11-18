## ADDED Requirements

### Requirement: Preview guides SHALL support reusable app-local reference profiles

Designer canvas and CG Control PVW SHALL offer Auto, 16:9 and landscape 4:3
reference frames, contained and centred inside the active picture. Each app SHALL
let users add, hide, rename, reposition and remove horizontal/vertical guides by
percentage of the chosen reference. The ratio, broadcast-box choice and custom set
SHALL persist for that app across projects and restarts. The two apps SHALL keep
independent local settings. The master display toggle SHALL remain default-off
session state. Guide settings SHALL NOT alter projects, exported pages, PGM or
programme commands.

The common guide colour SHALL default to white and SHALL apply to reference,
broadcast and inherited custom lines. Users SHALL be able to override a custom
line's colour and restore inheritance. Saved v1 records without colour SHALL use
white without discarding existing guide definitions or changing storage keys.

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
- **AND** its visibility switch is independent from PVW's switch
- **AND** changing guides does not edit layout data or output graphics
