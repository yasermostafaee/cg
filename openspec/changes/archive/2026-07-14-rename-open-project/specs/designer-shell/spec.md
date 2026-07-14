# designer-shell — rename the open project

## MODIFIED Requirements

### Requirement: Global top bar shows the project name and Save, not export actions

The global top bar SHALL show the project-wide menus (Home / File / Edit / View / Help), a centered project name, and the Save control (with its unsaved-amber indicator) adjacent to the name; it SHALL NOT carry Preview or Export (`.vcg` / HTML) actions, and the File menu SHALL NOT offer an "Export…" item — those live on the per-composition action bar above the canvas (the export engine is per-composition).

The centered project name SHALL be RENAMEABLE in place: it becomes an inline text input on double-click, and the File menu SHALL offer a "Rename Project…" entry that activates the SAME inline edit (one affordance, two entry points). A rename SHALL write the scene-ROOT `name` — never the active composition's name — as ONE undo entry, and SHALL NOT rename the on-disk file.

#### Scenario: The global bar shows the project name + Save, no export

- **WHEN** a project is open
- **THEN** the global top bar shows the centered project name and the Save control, and shows no Preview / Export `.vcg` / Export HTML buttons

#### Scenario: The File menu has no Export item

- **WHEN** the operator opens the File menu
- **THEN** there is no "Export…" item (export is triggered from the per-composition action bar)

#### Scenario: Double-clicking the project name starts an inline rename

- **WHEN** the operator double-clicks the project name in the global top bar
- **THEN** the name is replaced in place by a text input, focused, seeded with the current name and with its text selected, so typing replaces the name

#### Scenario: File → "Rename Project…" activates the same inline edit

- **WHEN** the operator picks File → "Rename Project…"
- **THEN** the same inline edit on the top-bar project name is activated (focused, current name selected) — behavior identical to the double-click path
- **AND** the entry is disabled when no project is open

#### Scenario: Enter or blur commits the rename as one undo entry

- **WHEN** the operator types a new name into the inline input and presses Enter, or blurs the input
- **THEN** the scene's root `name` is updated as exactly ONE undo entry, and both the top-bar name and the browser tab title show the new name
- **AND** a single undo restores the previous name

#### Scenario: Escape cancels the rename

- **WHEN** the operator presses Escape while the inline input is open
- **THEN** the edit is cancelled, the previous name is displayed again, and no store write (and therefore no undo entry) occurs

#### Scenario: Renaming while a composition is active renames the PROJECT

- **WHEN** a composition is the active document and the operator commits a rename from the top bar
- **THEN** the scene-root `name` changes and the active composition's own name is left untouched

#### Scenario: An empty or whitespace-only name is rejected

- **WHEN** the operator commits an empty or whitespace-only name
- **THEN** the previous name is kept, no store write occurs, and no undo entry is created

#### Scenario: A rename marks the document dirty without renaming the file

- **WHEN** a rename is committed
- **THEN** the document becomes dirty (the content hash includes `scene.name`), SAVE enables, and the tab shows the unsaved marker `* <name>`
- **AND** the on-disk file is NOT renamed (the saved file handle is untouched; Save As remains the way to change the filename)
