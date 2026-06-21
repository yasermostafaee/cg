# designer-shell (delta)

## ADDED Requirements

### Requirement: Global top bar shows the project name and Save, not export actions

The global top bar SHALL show the project-wide menus (Home / File / Edit / View / Help), a centered project name, and the Save control (with its unsaved-amber indicator) adjacent to the name; it SHALL NOT carry Preview or Export (`.vcg` / HTML) actions, and the File menu SHALL NOT offer an "Export…" item — those live on the per-composition action bar above the canvas (the export engine is per-composition).

#### Scenario: The global bar shows the project name + Save, no export

- **WHEN** a project is open
- **THEN** the global top bar shows the centered project name and the Save control, and shows no Preview / Export `.vcg` / Export HTML buttons

#### Scenario: The File menu has no Export item

- **WHEN** the operator opens the File menu
- **THEN** there is no "Export…" item (export is triggered from the per-composition action bar)
