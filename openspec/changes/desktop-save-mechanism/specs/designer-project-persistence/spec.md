# designer-project-persistence

## ADDED Requirements

### Requirement: Save As picks and persists a file handle

The Designer SHALL implement Save As with `showSaveFilePicker`, keep the chosen
`FileSystemFileHandle` as the active project's file, and persist that handle in IndexedDB
keyed by the project id so it survives reload.

#### Scenario: Save As keeps the chosen handle

- **WHEN** the operator triggers Save As
- **THEN** `showSaveFilePicker` opens (suggesting `<name>.cg.json`)
- **AND** the returned handle becomes the active project's file and is persisted in
  IndexedDB keyed by the project id
- **AND** the scene is written to that file

#### Scenario: Save As is cancelled

- **WHEN** the operator dismisses the Save As dialog
- **THEN** nothing is written and the project keeps any handle it already had

### Requirement: Save writes through the handle or falls back to Save As

WHEN a handle exists the Designer SHALL write to it with no picker; WHEN no handle exists
Save SHALL behave as Save As.

#### Scenario: Save with an existing handle

- **WHEN** the operator triggers Save AND the active project has a handle
- **THEN** the scene is written via `createWritable`/`write`/`close` with no picker

#### Scenario: Save with no handle

- **WHEN** the operator triggers Save AND the active project has no handle
- **THEN** Save behaves as Save As (opens the save picker)

#### Scenario: Save after reload re-acquires permission

- **WHEN** the app has reloaded, the operator re-opens a previously-saved project, and
  triggers Save (write permission re-acquired in the click gesture)
- **THEN** if permission is still granted the scene is written to the same file with no
  new picker

#### Scenario: A write to the saved file throws

- **WHEN** writing to the cached handle THROWS (permission revoked, a disk error, or an
  invalid handle)
- **THEN** the Designer does not crash the save
- **AND** it falls back to Save As and shows the notice "Couldn't write to the file —
  choose where to save."

#### Scenario: The saved file was deleted on disk

- **WHEN** the saved file is deleted on disk and the operator triggers Save while the
  handle is still valid
- **THEN** the browser recreates the file at the same handle location (the write does not
  throw) and the scene is written — with no Save As prompt

### Requirement: Open carries a writable handle with a no-FS-Access fallback

The Designer SHALL open projects with `showOpenFilePicker` so the opened file carries a
writable handle; the hidden-input path SHALL remain only as the no-FS-Access fallback.

#### Scenario: Open via the file picker

- **WHEN** the operator opens a project on a File-System-Access browser
- **THEN** `showOpenFilePicker` is used and the opened file carries a writable handle, so a
  subsequent Save writes back to that file with no picker

#### Scenario: Open without File System Access

- **WHEN** the operator opens a project on a browser without File System Access
- **THEN** the hidden-input path yields a `File` with no handle
- **AND** a subsequent Save routes to the OPFS / download fallback (not the handle path)

### Requirement: Tiered persistence fallback

The Designer SHALL select the persistence path by capability: File-System-Access handle
first, else the OPFS path-model (reopenable via Recent), else a download as the last resort.

#### Scenario: OPFS fallback when File System Access is unavailable

- **WHEN** Save runs on a browser without `showSaveFilePicker` but with OPFS
- **THEN** the scene is written to the OPFS path-model and is reopenable via Recent

#### Scenario: Download fallback when no storage is available

- **WHEN** Save runs in an insecure / in-memory context (no FS-Access, no OPFS)
- **THEN** the scene is offered as a download as the last resort

### Requirement: Dirty tracks the document model by content hash

The Designer SHALL compute dirty from the document model (`Scene`) only, excluding
`metadata.updatedAt` and all UI / transient state, via a canonical content hash:
`set()` marks dirty optimistically on a scene-identity change, and history-boundary and
`markSaved` reconcile authoritatively as `savedHash !== currentHash`. On save and load BOTH
the saved scene baseline and `savedHash = currentHash` are set. The hash MUST NOT be
recomputed per mutation during a drag.

#### Scenario: Editing makes the project dirty

- **WHEN** the document model differs from the last save
- **THEN** the project is dirty

#### Scenario: Editing then reverting to identical content is clean

- **WHEN** the operator edits and then reverts to byte-identical document content
- **THEN** the project is clean again (the content hash matches the saved hash)

#### Scenario: Undoing back to the saved state is clean

- **WHEN** the operator undoes back to the saved state
- **THEN** the project is clean

#### Scenario: Volatile metadata does not count as dirty

- **WHEN** only `metadata.updatedAt` differs from the saved scene
- **THEN** the project is NOT dirty

### Requirement: Tab title and Save control reflect dirty

The Designer SHALL show the dirty state in `document.title` and on the Save control (D-089).

#### Scenario: Dirty project

- **WHEN** the active project is dirty
- **THEN** `document.title` is `* <name>`
- **AND** the Save control is enabled with `border-top: 2px solid #ffdd40`

#### Scenario: Clean project

- **WHEN** the active project is clean
- **THEN** `document.title` is `<name>`
- **AND** the Save control is disabled and is NOT the blue/primary variant

#### Scenario: No project open

- **WHEN** no project is open
- **THEN** `document.title` is `cg Designer`

### Requirement: Unsaved-changes guards

The Designer SHALL guard against losing unsaved work on tab-close/refresh and on in-app
project switches, and Home SHALL close the project.

#### Scenario: Tab close or refresh while dirty

- **WHEN** the operator closes the tab or refreshes AND the project is dirty
- **THEN** a `beforeunload` prompt fires (generic browser text)

#### Scenario: Switching projects while dirty

- **WHEN** the operator triggers New / Open / Close / Home AND the project is dirty
- **THEN** the SaveBeforeSwitch modal runs first
- **AND** on Save or Discard the switch proceeds; on Cancel it does not

#### Scenario: Home closes the project

- **WHEN** the operator activates Home
- **THEN** the project is closed (scene, saved baseline, handle reference, and hashes are reset)
- **AND** the landing/picker page does NOT re-prompt the unsaved-changes modal

### Requirement: Recent is handle-keyed with a legacy fallback

The Designer SHALL record saved/opened projects in Recent as
`{ projectId, name, lastSavedAt, handleKey }`; opening from Recent re-acquires permission in
the click and falls back to `showOpenFilePicker` on stale/denied/missing handles; legacy
path-keyed entries still open and upgrade to a handle on next save.

#### Scenario: Saving records a handle-keyed Recent entry

- **WHEN** a project is saved or opened via a handle
- **THEN** it appears in Recent as `{ projectId, name, lastSavedAt, handleKey }`

#### Scenario: Opening from Recent

- **WHEN** the operator clicks a handle-keyed Recent entry
- **THEN** write permission is re-acquired in the click and the file is opened with its handle

#### Scenario: Recent entry is stale or denied

- **WHEN** a Recent entry's handle is denied, stale, or its file is gone
- **THEN** the Designer falls back to `showOpenFilePicker` with a clear notice and does not crash

#### Scenario: Legacy path-keyed Recent entry

- **WHEN** the operator clicks a legacy path-keyed Recent entry
- **THEN** it still opens (via the OPFS path-model) and upgrades to a handle on next save

### Requirement: Remove from Recent is non-destructive

The Designer SHALL let the operator remove a Recent entry (and optionally clear all). Removal
drops only the list entry and, for a handle-backed entry, forgets the persisted handle +
granted permission (`forgetFileHandle`); it MUST NOT delete or modify the underlying file
(real disk or OPFS `projects/*.cg.json`). The change persists across reload.

#### Scenario: Remove one Recent entry

- **WHEN** the operator removes a Recent entry ("Remove from recent")
- **THEN** it disappears from the list and the other entries remain
- **AND** the underlying file is untouched and re-openable via Open / the OPFS path
- **AND** a handle-backed entry's persisted handle + permission are forgotten

#### Scenario: Removal persists across reload

- **WHEN** a Recent entry is removed and the app reloads
- **THEN** the removed entry stays gone and the others remain

#### Scenario: Removed project re-opens normally

- **WHEN** the operator later re-opens a removed project (Open → `showOpenFilePicker`, or the
  OPFS path)
- **THEN** it opens normally — removal is reversible / non-destructive

#### Scenario: Clear all Recent

- **WHEN** the operator clears all Recent
- **THEN** the list is emptied and every cached handle is forgotten, with no file deleted

### Requirement: Stable file format

The Designer SHALL keep the `.cg.json` extension, a JSON payload, and `schemaVersion` `1`.

#### Scenario: Saved file format

- **WHEN** a project is saved
- **THEN** the file is `.cg.json`, the payload is JSON, and `schemaVersion` is `1`
