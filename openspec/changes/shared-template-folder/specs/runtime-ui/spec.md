## ADDED Requirements

### Requirement: Templates can be imported from the station shared folder

CG Control SHALL list subfolders and `.vcg` files under the folder configured in Shared files.
CG Bridge SHALL resolve requested files within that folder. A selected package SHALL pass
through the same validation and import as a package selected from the console's computer.

#### Scenario: Select a shared package

- **WHEN** an operator opens Shared folder from Templates and selects a package in a subfolder
- **THEN** CG Control imports the package into the active channel's catalogue
- **AND** the import alone loads no layer
