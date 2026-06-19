# designer-project-assets

## ADDED Requirements

### Requirement: Project Assets import shows a loading indicator

While an asset import into the Project Assets panel is in progress, the panel SHALL show a loading indicator (a spinner tile) for the in-progress import, cleared when the import resolves (the real thumbnail replaces it via the asset-list refresh) or rejects (cancel or error). This gives feedback during the decode/store gap and never leaves a stuck spinner. The import logic itself is unchanged.

#### Scenario: Indicator shown while a project-asset import is pending

- **WHEN** the operator adds an asset (image or font) and the import is in progress
- **THEN** the panel shows a loading indicator for the pending import

#### Scenario: Indicator replaced by the thumbnail on success

- **WHEN** a pending project-asset import resolves
- **THEN** the loading indicator is cleared and the imported asset appears as a thumbnail

#### Scenario: Indicator cleared on cancel or error

- **WHEN** a pending project-asset import rejects (the operator cancels the file dialog, or the import errors)
- **THEN** the loading indicator is cleared — no stuck spinner
