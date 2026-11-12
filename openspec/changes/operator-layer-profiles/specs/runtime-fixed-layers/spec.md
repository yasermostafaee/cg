## ADDED Requirements

### Requirement: Operators can save and load prepared layer profiles

CG Control SHALL export a versioned JSON profile of the active channel's bound fixed layers in
stack order, including referenced template IDs, applied fields, position, and the selected
channel's keyboard shortcut settings. Loading a profile SHALL show the destination channel and
ask before replacing prepared layers.

#### Scenario: Save the profile from CG Control

- **WHEN** an operator selects Save profile in CG Control
- **THEN** the file chooser offers a JSON filename for the selected channel
- **AND** the dialog confirms the chosen filename after the file is written
- **AND** cancelling the chooser makes no write and leaves the profile dialog open
- **AND** a browser without the file chooser starts a download and reports that it started

#### Scenario: Restore an operator profile

- **WHEN** an operator loads a profile on a declared channel whose prepared layers can be replaced
- **THEN** each available template loads Ready on its recorded layer with its applied fields and position
- **AND** text in Persian round-trips verbatim
- **AND** missing templates and incompatible layer numbers are reported individually

#### Scenario: Keep the programme running

- **WHEN** a layer on the destination channel is on air or transitioning
- **THEN** loading the profile is refused before replacing any row

#### Scenario: Restore the selected channel's shortcuts

- **WHEN** a station admin loads a profile that carries keyboard shortcut settings
- **THEN** the Bridge validates the assignments against the destination channel's configured layers and chord conflicts
- **AND** a valid configuration replaces the destination's Play, Next, Stop, Clear and Space settings
- **AND** the absence of individual maps restores their saved state, including virtual defaults when all settings were absent
- **AND** explicitly empty maps and a cleared Space assignment are preserved in the file
- **AND** the other channels keep their own shortcuts

#### Scenario: Load rows without restoring shortcuts

- **WHEN** a profile omits keyboard shortcut settings
- **THEN** the destination channel keeps its current shortcuts
- **WHEN** the profile includes shortcuts and the settings are malformed, incompatible, unsupported by the Bridge, or the user is an operator without station admin access
- **THEN** the destination channel keeps its current shortcuts
- **AND** valid prepared rows still load and CG Control reports why the shortcuts were skipped

#### Scenario: Leave occupied layers available for inspection

- **WHEN** an off-air layer holds a producer or awaits occupancy verification
- **THEN** the Bridge preserves that row and reports it in the profile result
- **AND** loading a profile issues no commands to the playout engine
