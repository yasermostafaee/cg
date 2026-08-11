# designer-project-persistence Specification

## Purpose

TBD - created by archiving change desktop-save-mechanism. Update Purpose after archive.

## Requirements

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

The Designer SHALL select the persistence path by capability: File-System-Access handle first,
else the sandboxed path-model store (reopenable via Recent), else a download as the last resort.

Every tier SHALL write the same self-contained package. A tier SHALL NOT be permitted to write
a form that omits the assets — degrading the storage mechanism SHALL NOT degrade the document.

#### Scenario: Sandboxed fallback when File System Access is unavailable

- **WHEN** Save runs on a browser without `showSaveFilePicker` but with the sandboxed store
- **THEN** the package is written to the path-model store and is reopenable via Recent

#### Scenario: Download fallback when no storage is available

- **WHEN** Save runs in a context with neither File System Access nor a sandboxed store
- **THEN** the package is offered as a download as the last resort
- **AND** the downloaded file is the same self-contained package, assets included

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

The Designer SHALL save projects as a `.cgproj` package: a deterministic zip containing the
authoring scene as `project.json`, a `manifest.json` declaring the project-package format and
its asset index, and the asset bytes under `assets/<kind>/<sha>.<ext>`.

The package SHALL be the ONLY form the Designer opens. A file that predates it SHALL be
REFUSED with a message that names what the file is and what the author must do about it,
rather than opened into a partially-populated project. There SHALL NOT be a second document
form, and consumers of a read document SHALL NOT have to branch on which form they were given.

(Superseded 2026-08-11 by the owner's compatibility-floor decision — `P-031`. This requirement
previously mandated a CONVERSION path for pre-package `.cg.json` projects, with a
non-destructive forced-Save-As rule to protect the original bytes. Nothing has shipped to a
client, so no such document has to keep opening, and the conversion cost a second document
shape that every consumer branched on. The removal, and the reversal that will end this
licence at the first release, are recorded in `P-031`.)

#### Scenario: Saved file format

- **WHEN** a project is saved
- **THEN** the file is a `.cgproj` package whose manifest declares the project-package format
- **AND** it contains the authoring scene and the bytes of every asset the project holds

#### Scenario: A pre-package project is refused, by name

- **WHEN** the author opens a `.cg.json` file authored before this change
- **THEN** the open fails with a message naming the file as a pre-package project and telling
  the author to re-create it as a package
- **AND** nothing is partially opened — there is no project with a scene and no assets

#### Scenario: A read document has exactly one form

- **WHEN** any entry point reads a project document
- **THEN** it yields the package form or it throws
- **AND** no consumer branches on a document form, and no manifest is nullable

### Requirement: A saved project is a self-contained package that carries its assets

A project's durable form SHALL be a self-contained package that contains every asset the
project needs, so that the artifact the author points at is sufficient on its own. Persisting a
project SHALL NOT depend on asset bytes stored anywhere outside the package.

The package SHALL contain the full authoring scene — including editor-only fields such as the
canvas backdrop — so that saving and reopening round-trips the document the author was editing,
losing nothing. This is the property that distinguishes a project package from an exported
broadcast artifact, which deliberately strips editor-only state.

The package SHALL be produced and read through the SAME packaging primitives the export path
uses. There SHALL NOT be a second zip, hashing, or archive implementation in the codebase.

An asset's content hash SHALL be reused from the value already computed when the asset was
imported; a save SHALL NOT re-hash asset bytes it already has a hash for.

#### Scenario: A saved project contains its own assets

- **WHEN** a project containing imported image and font assets is saved
- **THEN** the written artifact is a single package that contains the scene AND the bytes of
  every asset the scene references
- **AND** reading that package back yields the same scene and the same asset bytes, with no
  read of any other location

#### Scenario: The authoring scene round-trips exactly

- **WHEN** a project whose scene carries editor-only state is saved and reopened
- **THEN** the reopened scene equals the saved scene, including the editor-only state
- **AND** an exported broadcast artifact of the same scene still strips that editor-only state

#### Scenario: A project package is not a broadcast artifact

- **WHEN** a project package is inspected
- **THEN** its manifest declares the project-package format, distinct from the export format
- **AND** attempting to open an exported broadcast artifact as a project is refused with a
  message that names the correct action, rather than failing obscurely

### Requirement: Assets survive a storage-root change, including a full browser restart

Reopening a saved project SHALL yield its assets even when the workspace storage root
resolves differently than it did when the project was saved — the case a full browser restart
produces, because the browser does not retain a directory handle's permission grant across
restarts.

This SHALL hold with NO asset bytes present anywhere in the workspace: the package alone is
sufficient.

#### Scenario: The workspace root changes between save and open

- **WHEN** a project with assets is saved
- **AND** the project is later opened against a workspace whose root is a different store than
  the one it was saved from, with none of the project's asset bytes present in it
- **THEN** every asset resolves from the package, is listed in the assets panel, and renders

#### Scenario: A full browser restart

- **WHEN** a project with image assets is saved, the browser is fully quit and reopened, and the
  project is reopened from its package
- **THEN** the images are present and render, and no asset is reported missing

### Requirement: The workspace storage root is never silently substituted

Workspace initialization SHALL report which storage root it selected and WHY. When the
selected root is not the one the author configured, or is a store that does not survive the tab
closing, the Designer SHALL say so where the author will see it.

Initialization SHALL NOT discard the reason a preferred root was unavailable. A failure to
reopen a connected folder and an absent sandboxed store are DIFFERENT conditions with different
remedies, and SHALL be reported as different conditions.

Session-only in-memory storage SHALL never be an unannounced state. When it is the active
store, the Designer SHALL state plainly that nothing is being saved and that closing the tab
discards the work.

Reconnecting a lost folder SHALL be offered as an action the author can take from that notice,
because re-granting a directory permission requires a user gesture and therefore cannot happen
during startup.

#### Scenario: A remembered folder can no longer be reopened

- **WHEN** the Designer starts and the previously connected folder cannot be reopened, because
  its permission did not survive the restart
- **THEN** the Designer reports that the connected folder could not be reopened, names it, and
  offers to reconnect it
- **AND** it does NOT silently continue against a different storage root as though nothing
  happened

#### Scenario: Session-only storage is active

- **WHEN** the active storage root is the in-memory store, for any reason
- **THEN** the Designer shows a persistent notice stating that storage is session-only and that
  closing the tab discards everything not saved to a file
- **AND** the notice states the reason the in-memory store is in use

#### Scenario: The normal case stays quiet

- **WHEN** the Designer starts and the expected storage root is available
- **THEN** no storage notice is shown
