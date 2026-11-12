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

### Requirement: The imported Templates catalogue displays package previews

With a capable Bridge, CG Control SHALL show a thumbnail in each visible imported template row
and a larger preview of the selected template in Details. Each preview SHALL contain the full
picture within its slot. CG Bridge SHALL serve bounded preview data for the listed template
version on the current channel. A valid embedded PNG SHALL be saved separately during import or
reload for that version, including when the source package exceeds the retention limit. A bounded
retained package MAY supply an embedded thumbnail or a scriptless authored still. Preview
availability SHALL be independent of import, selection, reload and load.

#### Scenario: Browse imported templates on another console

- **GIVEN** the channel catalogue contains packages imported from Shared folder and the local chooser
- **WHEN** a fresh console opens Templates
- **THEN** the rows show the saved thumbnail or a preview from the retained package
- **WHEN** the operator selects a row
- **THEN** Details shows a larger, contained preview of that template
- **WHEN** the operator selects another row
- **THEN** Details follows the new selection

#### Scenario: A large package carries an embedded thumbnail

- **WHEN** a package with a valid embedded PNG exceeds the source retention limit
- **THEN** its listed version can still show the saved thumbnail

#### Scenario: The catalogue stays usable without preview data

- **WHEN** a listed template has no usable preview
- **THEN** the row keeps its icon and remains selectable
- **WHEN** the Bridge does not support the optional route
- **THEN** the catalogue remains usable with the existing icons and no preview request

### Requirement: Template previews show transparent areas on a checkerboard

CG Control SHALL display a checkerboard behind the transparent areas of template previews
in Shared folder, catalogue rows and Details. Embedded images and scriptless authored stills
SHALL retain their visible colors and opacity.

#### Scenario: Browse artwork with transparent and white areas

- **WHEN** an embedded or generated preview has transparent pixels
- **THEN** the checkerboard is visible in those areas
- **AND** opaque white artwork remains white
