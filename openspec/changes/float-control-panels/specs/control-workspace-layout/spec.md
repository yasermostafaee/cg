## ADDED Requirements

### Requirement: CG Control can detach workspace panels on Windows

CG Control SHALL allow operators to detach PGM, PVW, Layers and Inspector into independent windows of the same session and return each panel to the main window.

#### Scenario: Float and maximize a monitor

- **WHEN** the operator moves a detached PGM or PVW window to the second display and maximizes it
- **THEN** its window contains the monitor and its controls
- **AND** Layers and Inspector retain their locations.

#### Scenario: Maximize a docked monitor

- **WHEN** the operator maximizes a docked PGM or PVW inside the main window
- **THEN** the existing companion choices remain available for docked companions
- **AND** each detached companion retains its independent window.

#### Scenario: Show or hide the remaining docked monitor

- **WHEN** PGM or PVW is detached
- **THEN** the toolbar toggle names and controls the remaining docked monitor
- **AND** operating it leaves the detached monitor visible
- **WHEN** both monitors are detached
- **THEN** the main toolbar has no monitor toggle
- **AND** redocking a monitor shows it and restores the corresponding toggle.

#### Scenario: Read a toolbar tooltip over docked panels

- **WHEN** the operator hovers over or keyboard-focuses a main toolbar button whose tooltip crosses the docked panels
- **THEN** the entire tooltip is visible above the panels and does not intercept pointer input
- **AND** Escape dismisses the entire tooltip
- **AND** the tooltip stays inside the main window.

#### Scenario: Select a row while Inspector is detached

- **WHEN** the operator clicks the selected row again
- **THEN** the layer remains selected and Inspector stays open
- **WHEN** the operator selects a different row
- **THEN** the same Inspector shows that row.

#### Scenario: Return to the main window

- **WHEN** the operator presses Exit floating
- **THEN** the same panel returns to its prior position
- **AND** the current selection, drafts, preview and audio state survive.
- **WHEN** the operating system requests a close of a detached window independently
- **THEN** the panel remains available in its window.

#### Scenario: Restore the workspace on another display arrangement

- **WHEN** the operator restores a UI profile
- **THEN** the saved detached windows restore their placement
- **AND** any window whose display is absent opens in visible desktop space.

#### Scenario: Rearrange a running workspace

- **WHEN** a panel is detached, restored, maximized or redocked during preview or programme monitoring
- **THEN** the operator session, command ownership, live previews and monitoring audio remain continuous
- **AND** the layout action issues no playout commands.
