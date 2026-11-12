## ADDED Requirements

### Requirement: Templates can be imported from the station shared folder

CG Control SHALL list subfolders and `.vcg` files under the folder configured in Shared files.
CG Bridge SHALL resolve requested files within that folder. A selected package SHALL pass
through the same validation and import as a package selected from the console's computer.

#### Scenario: Select a shared package

- **WHEN** an operator opens Shared folder from Templates and selects a package in a subfolder
- **THEN** CG Control imports the package into the active channel's catalogue
- **AND** the import alone loads no layer

### Requirement: Operators can identify packages and navigate the shared path

CG Control SHALL clearly highlight the selected package and show the current folder. Up SHALL open
the parent of the current folder and stop at the configured shared root. For visible package rows,
CG Control SHALL show an available embedded thumbnail or a bounded still of the authored scene.
CG Bridge SHALL read preview data within the shared root and SHALL keep preview failures independent
of listing and import. The browser SHALL treat preview content as data.

#### Scenario: Choose a template inside a subfolder

- **GIVEN** a subfolder has a valid package with preview data
- **WHEN** the operator opens the subfolder and selects that package
- **THEN** the package has a visible selected state and its preview is shown
- **AND** Up opens the parent and is unavailable at the shared root

#### Scenario: A package has no usable preview

- **WHEN** a package's preview is missing or cannot be read
- **THEN** the package remains selectable with an icon in its preview slot
