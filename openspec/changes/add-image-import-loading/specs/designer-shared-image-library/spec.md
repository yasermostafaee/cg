# designer-shared-image-library

## ADDED Requirements

### Requirement: Shared library import shows a loading indicator

Once a file is actually selected (not while the file picker is open), the Shared Library panel SHALL show a loading indicator (a spinner tile) during the import, cleared when the import resolves (the real thumbnail replaces it via the library refresh) or errors. Cancelling the picker — or selecting nothing — shows no indicator at all. This gives feedback during the decode/store gap and never leaves a stuck spinner. The import logic itself is unchanged.

#### Scenario: Indicator shown after a file is selected

- **WHEN** the operator picks a file to add to the shared library and the import (decode/store) is in progress
- **THEN** the panel shows a loading indicator for the pending import

#### Scenario: Indicator replaced by the thumbnail on success

- **WHEN** a pending shared-library import resolves
- **THEN** the loading indicator is cleared and the imported image appears as a thumbnail

#### Scenario: No indicator when the picker is cancelled

- **WHEN** the operator opens the file picker for the shared library but cancels it or selects nothing
- **THEN** no loading indicator is shown

#### Scenario: Indicator cleared on error

- **WHEN** a selected file's shared-library import errors
- **THEN** the loading indicator is cleared — no stuck spinner
