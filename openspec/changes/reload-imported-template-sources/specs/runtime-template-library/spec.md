# runtime-template-library — original-source Reload

## ADDED Requirements

### Requirement: Template management SHALL not require an empty row

CG Control SHALL provide a direct main-header Templates door for the current channel. It SHALL open
the catalogue without a row destination and SHALL expose import, search, details, Reload and removal
without offering a Load commit. Row LOAD SHALL remain the only action that binds a template to a
layer.

#### Scenario: Every row is occupied

- **GIVEN** the current channel has no empty layer
- **WHEN** the operator presses the main-header Templates button
- **THEN** the current channel's catalogue opens
- **AND** Reload and other catalogue actions remain available without a destination or Load action

### Requirement: Chooser imports SHALL remember a reloadable source on that console

When a `.vcg` is imported through the file chooser, CG Control SHALL retain a browser-local file
handle for that template and channel. The handle SHALL re-read the current bytes at the original
local or network location and SHALL NOT be synchronized to other consoles. A drag/drop import MAY
remain without a reloadable source and SHALL explain how to establish one.

#### Scenario: A shared package is saved again

- **GIVEN** a template was imported from a shared file through the chooser
- **AND** the author saves a newer valid package at the same path
- **WHEN** the operator invokes Reload
- **THEN** CG Control reads and imports the newer bytes without another browse step

#### Scenario: Another console has no local capability

- **WHEN** another CG Control opens the same Bridge channel
- **THEN** the template remains in the shared catalogue
- **AND** Reload remains unavailable there until that console imports the source through its chooser

### Requirement: Reload SHALL preserve the target catalogue entry

CG Control SHALL remember a verified package's identity separately from its channel catalogue id.
Reload SHALL target the existing catalogue id, preserving the label, row bindings and matching
Source defaults. A missing file, denied permission or unreadable source SHALL produce a visible
refusal. A changed package identity SHALL require explicit approval through single Reload before
any Bridge registration. Bulk Reload SHALL report and skip such a file.

#### Scenario: The share path now contains another package

- **GIVEN** template `weather` remembers `weather.vcg`
- **AND** that path is replaced by a package whose template id is `league`
- **WHEN** the operator reloads `weather` individually
- **THEN** the operator is asked whether to replace that entry using the verified file
- **AND** cancelling leaves the catalogue and row data unchanged
- **AND** approving replaces the package under the original catalogue id and records the new file identity

#### Scenario: A duplicate catalogue entry reloads its own source

- **GIVEN** an imported copy has its own catalogue id and a remembered source handle
- **WHEN** the source still contains the recorded package id
- **THEN** Reload updates that copy without modifying the other entry

### Requirement: Reload SHALL ask which row-data authority wins

Before reading one or all remembered sources, CG Control SHALL offer **keep current data** and **use
file defaults**. Keeping data SHALL update packages without changing existing row field maps. Using
file defaults SHALL replace fields on rows holding those templates on the current channel through
the normal stack Update path.

#### Scenario: Current newsroom data is retained

- **WHEN** the operator reloads a package and chooses **keep current data**
- **THEN** the package updates
- **AND** every row already holding it retains its current field values

#### Scenario: Reloaded defaults replace row data

- **WHEN** the operator reloads a package and chooses **use file defaults**
- **THEN** the package updates
- **AND** every current-channel row holding it is replaced with the reloaded package defaults

### Requirement: A reloaded page reaches an already-bound row

CG Control SHALL refresh the listed page of an already-bound row in PVW after the template is
reloaded. The next explicit Take of that off-air row SHALL prepare the updated page, including any
foreground pass, with the row's applied data. Registering the reloaded template SHALL leave the
producer of a row currently on air in place until the operator stops and takes that row again.

#### Scenario: Reload a template already loaded on a layer

- **GIVEN** the operator previously loaded a template on a layer
- **WHEN** the operator reloads a newer package into the same catalogue entry
- **THEN** PVW can play the updated page of the same bound row
- **AND** the next Take uses the updated page with the chosen row data policy

#### Scenario: Reload while the template is on air

- **GIVEN** a row is playing the old page
- **WHEN** the operator reloads the same catalogue entry and keeps current data
- **THEN** the row keeps playing the same page until the operator stops it
- **AND** its next Take seats the updated page on the same layer

### Requirement: Reload all SHALL include every remembered source in the current list

The Templates dialog SHALL offer Reload all when at least one visible template has a source
remembered on this console. It SHALL run the same identity, permission and row-data policy checks for
each source and SHALL visibly report full or partial failure.

#### Scenario: One shared file is unavailable

- **GIVEN** two visible templates have remembered sources
- **AND** one source is currently unavailable
- **WHEN** the operator runs Reload all
- **THEN** the accessible template reloads
- **AND** the dialog reports that the other reload failed
