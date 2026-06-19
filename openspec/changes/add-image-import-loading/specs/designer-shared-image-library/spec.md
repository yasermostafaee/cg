# designer-shared-image-library

## ADDED Requirements

### Requirement: Shared library import shows a loading indicator

While an image import into the shared library is in progress, the Shared Library panel SHALL show a loading indicator (a spinner tile) for the in-progress import, cleared when the import resolves (the real thumbnail replaces it via the library refresh) or rejects (cancel or error). This gives feedback during the decode/store gap and never leaves a stuck spinner. The import logic itself is unchanged.

#### Scenario: Indicator shown while a shared-library import is pending

- **WHEN** the operator adds an image to the shared library and the import is in progress
- **THEN** the panel shows a loading indicator for the pending import

#### Scenario: Indicator replaced by the thumbnail on success

- **WHEN** a pending shared-library import resolves
- **THEN** the loading indicator is cleared and the imported image appears as a thumbnail

#### Scenario: Indicator cleared on cancel or error

- **WHEN** a pending shared-library import rejects (the operator cancels the file dialog, or the import errors)
- **THEN** the loading indicator is cleared — no stuck spinner
