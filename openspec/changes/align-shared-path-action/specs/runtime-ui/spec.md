## ADDED Requirements

### Requirement: Shared-files path and action SHALL share one aligned control row

CG Control SHALL place the Shared files path input and its Save path action in one vertically aligned control row for a station admin. The input SHALL consume the row's available width after the intrinsic-width action so that long server paths remain readable.

#### Scenario: Station admin edits the path

- **WHEN** a station admin opens Shared files folder **THEN** the path input and Save path button are vertically aligned in one row
- **AND THEN** the path input consumes the remaining row width while Save path uses only its required width
