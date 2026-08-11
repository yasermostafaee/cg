# designer-project-persistence — delta (the project IS the package, B-104 / D-150)

## ADDED Requirements

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

## MODIFIED Requirements

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
