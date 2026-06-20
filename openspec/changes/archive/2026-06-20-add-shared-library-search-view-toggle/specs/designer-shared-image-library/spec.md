# designer-shared-image-library

## ADDED Requirements

### Requirement: Shared library search and grid/list view toggle

The Shared Library panel SHALL provide a filename search and a grid/list view toggle at parity with the Project Assets panel, reusing the same controls and idiom. The search filters the listed images by filename as a case-insensitive substring match; an empty query shows every image. The view toggle switches the thumbnail layout between grid and list and persists the choice across the session, independently of the Project Assets view setting.

#### Scenario: Searching filters the library by filename

- **WHEN** the operator types a query into the Shared Library search field
- **THEN** the list shows only images whose filename contains the query (case-insensitive), and an empty query shows every image

#### Scenario: Toggling the view switches and persists the layout

- **WHEN** the operator toggles the Shared Library view between grid and list
- **THEN** the thumbnails re-render in the chosen layout, and the choice persists across the session (and a panel re-mount), independently of the Project Assets view setting
