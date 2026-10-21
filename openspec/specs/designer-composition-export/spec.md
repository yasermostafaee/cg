# designer-composition-export Specification

## Purpose

TBD - created by archiving change per-composition-export-and-chrome. Update Purpose after archive.

## Requirements

### Requirement: Export is scoped to the open composition and its nested closure

Exporting (both `.vcg` and single-file HTML) SHALL package the OPEN composition as the package root plus only its transitive nested closure — every composition reachable from the root by following `composition` instance references AND `repeater` references, at any depth — and SHALL NOT include sibling compositions unreachable from the root or their assets. The root composition's own layers SHALL be lifted to the runtime's play-entry (`scene.layers`) so the served package renders that composition (a raw, layerless project root would render a blank frame).

#### Scenario: The `.vcg` renders the open composition from its lifted layers

- **WHEN** a composition is exported to `.vcg`
- **THEN** the package's `scene.layers` is that composition's layers (the runtime play-entry) and the served output renders it, not a blank frame

#### Scenario: Nested children via composition AND repeater are packaged transitively

- **WHEN** the root composition nests a child through a `composition` instance and another through a `repeater`, each with further nested children
- **THEN** all of those compositions (and their referenced assets) are included in the package, at any nesting depth

#### Scenario: A sibling composition is excluded

- **WHEN** the scene contains another composition that the root does not reach through any `composition` or `repeater` reference
- **THEN** that sibling composition and the assets used only by it are NOT packaged (`.vcg`) or inlined (single-file HTML)

### Requirement: Per-composition export preflight scopes validation to the closure

Export preflight SHALL validate only the open composition and its nested closure, so a validation error confined to a composition outside the closure does NOT block the export of a valid root composition.

#### Scenario: A broken sibling does not block a valid root

- **WHEN** a sibling composition outside the root's closure has a validation error (for example a missing image asset) and the root composition is exported
- **THEN** the export is not blocked by the sibling's error and produces the package for the root and its closure

### Requirement: Per-composition Preview and Export live on a dedicated action bar

The Designer SHALL present Preview, Export `.vcg`, and Export HTML for the OPEN composition on a dedicated per-composition action bar (pinned at the foot of the left rail, off the canvas), and these SHALL be the only entry points for preview/export (the global top bar no longer carries them, and there is no project-level "export the whole scene" action). The Export actions block when the open composition has an error-severity validation issue.

#### Scenario: The action bar previews and exports the open composition

- **WHEN** a composition is open and the operator triggers Preview or Export from the per-composition action bar
- **THEN** the action targets the open composition (its nested closure), with no global-bar or project-level export entry point present

#### Scenario: Export is blocked while the open composition has errors

- **WHEN** the open composition has an error-severity validation issue
- **THEN** the bar's Export `.vcg` and Export HTML actions are disabled (Preview remains available)

### Requirement: A composition carries a persisted playout target

A composition SHALL carry an optional `playoutTarget` that persists with it (into the project and the `.vcg`) and is backward-compatible — a composition without it loads unchanged, treated as the default `casparcg` target. The visible per-composition target selector is deferred until a second target exists; this is the persisted seam only.

#### Scenario: The playout target round-trips and defaults when absent

- **WHEN** a composition with `playoutTarget: 'casparcg'` is saved and reloaded, and another composition omits the field
- **THEN** the first reloads with its target preserved and the second loads unchanged (absent ⇒ the default `casparcg`), with no visible selector required

### Requirement: Export drops fully-off-frame static elements

The export projection `scopeSceneToComposition` SHALL drop an element from the exported scene only
when it is CERTAIN never to reach the frame, and SHALL otherwise KEEP it (conservative — never drop
content that could be visible). This projection feeds `.vcg`, single-file HTML, and the broadcast
preview. An element is dropped IFF ALL hold: (1) it has NO geometry animation track (`position.*` /
`size.*` / `scale.*` / `rotation`); AND (2) none of its ancestor containers up to the frame are
animated (the whole ancestor chain is static); AND (3) it is neither a `repeater` nor inside a
repeater-template composition (stamping can place rows at on-frame positions); AND (4) its
scene-space AABB — computed from its four corners through its static scale/rotation/anchor and
its static ancestor transforms — lies STRICTLY outside its own composition's frame `[0,0,W,H]`
(touching or crossing an edge is partially-on = KEPT; a degenerate or non-finite box is KEPT).
The check SHALL be applied per-composition (the projected frame plus each non-repeater-template
closure composition, each against its OWN resolution). This is EXPORT-ONLY: the editor projection
(`editSceneOf`) and Save (which writes the full scene JSON) SHALL NOT drop anything, so off-frame
STAGING shapes stay visible/editable and persist in the saved `.cg.json`. The output is unchanged
— off-frame content was already clipped invisible by the runtime's `.cg-stage { overflow:
hidden }`; this only stops its bytes from bloating the package (its image asset is never
gathered).

#### Scenario: A fully-off-frame static element is dropped and its asset is not gathered

- **WHEN** a composition is exported and it contains a STATIC element whose AABB is fully outside
  the frame
- **THEN** the element is absent from the exported scene and its image asset is not inlined /
  packaged (the image-collection walk never sees it)

#### Scenario: Save and the editor keep the off-frame element

- **WHEN** the same scene is projected for editing (`editSceneOf`) or written by Save
- **THEN** the off-frame element is present and unchanged — the exclusion is export-only

#### Scenario: An element animating onto the frame is kept

- **WHEN** an element is off-frame at its base transform but carries a `position` / `scale` /
  `rotation` / `size` keyframe track (e.g. a slide-in)
- **THEN** it is KEPT in the export (it can reach the frame during playback)

#### Scenario: A partially-on or edge-touching element is kept

- **WHEN** an element's AABB crosses or merely touches a frame edge
- **THEN** it is KEPT (its on-frame part renders, clipped to the frame)

#### Scenario: An off-frame element under an animated container or inside a repeater is kept

- **WHEN** a static off-frame element sits inside an ANIMATED container, OR inside a composition
  used as a `repeater` template
- **THEN** it is KEPT (the animated container can move it on-frame; a repeater can stamp the row
  at an on-frame position)

#### Scenario: A rotated element is judged by its rotated AABB

- **WHEN** a static element is rotated/scaled
- **THEN** the drop decision uses the AABB of its four transformed corners — a rotated element
  whose corner reaches the frame is KEPT; one whose rotated AABB is fully outside is dropped

### Requirement: A per-composition export carries no project entry pointer

A per-composition export SHALL omit the project's `entryCompositionId`: the chosen composition is
flattened into the ROOT, so the root IS the entry and the pointer has nothing to say. The export
SHALL NOT copy the project's value through (it would name a composition the package does not
contain, or a nested composition a reader would take for the entry), and SHALL NOT rewrite it. A
reader that resolves an entry id SHALL treat a miss as not found, never as a positional fallback.
The project itself SHALL keep its `entryCompositionId`.

#### Scenario: Exporting the main composition writes no pointer

- **WHEN** the project's main composition `R` is exported on its own
- **THEN** the package's `template.json` has no `entryCompositionId`

#### Scenario: Exporting a composition that nests the project main writes no pointer

- **WHEN** the project's main is `C` and the exported composition `R` instances `C`
- **THEN** the export has no `entryCompositionId`, so `C` is never read as the entry

#### Scenario: A dangling entry id is not found

- **WHEN** a scene's `entryCompositionId` names no composition it contains
- **THEN** a reader of the entry composition (its page lists) reads nothing from it, rather than
  the first composition

### Requirement: Each composition exports under its own package id

A composition's `.vcg` SHALL carry a package id of its own (`manifest.id` and the scene's `id`), derived from the
project's id and the composition's id (`compositionPackageId`, `@cg/vcg-format`), never the project's id: two
compositions of one project SHALL export under two ids, and the same composition exported again SHALL keep its id, so
CG Control updates its template rather than adding one. A duplicated composition SHALL export under an id of its own.

#### Scenario: Two compositions of one project

- **WHEN** two compositions of one project are exported
- **THEN** their packages carry two different ids, neither of them the project's

#### Scenario: The same composition exported again

- **WHEN** a composition is exported twice, under any file names
- **THEN** both packages carry the same id

#### Scenario: A duplicated composition

- **WHEN** a composition is duplicated and both are exported
- **THEN** the two packages carry different ids

### Requirement: Every export ends in an answer the author can read

Every `.vcg` and single-file HTML export SHALL end in an answer the author can read, never in silence. The template
SHALL be validated BEFORE the save dialog opens, so a template with an error makes no file and is answered as the
button's own refusal (the offenders selected, the Issues panel opened). While an export runs, both export buttons SHALL
wait and the pressed one SHALL show how far it is (`Exporting… 60 %`). A written file SHALL be named with its size. A
failure SHALL be a sentence naming the cause in the author's words that stays until it is dismissed, with the element
at fault selected, and SHALL say what became of the file the save dialog made: an EMPTY file is removed where the
browser allows and the removal is claimed only when reading the file back finds nothing; a file that still holds bytes
is never removed; otherwise the author is told to delete it. A picture, clip or sound the template shows whose bytes
cannot be read SHALL fail the export, naming the file and the element; a book page naming an asset the project does
not have SHALL be a preflight error, as an image element's is.

#### Scenario: A book exports, with progress, and is named with its size

- **WHEN** the author fills a Sequence with `Add folder…` and presses `Export (.vcg)`, and names the file in the save
  dialog
- **THEN** the button reads `Exporting…` (then a percentage) while both export buttons wait, and the export ends with
  `Exported telavat.vcg · <size>`, and the file holds a package that verifies, with every page in it

#### Scenario: A failure is said, stays, and leaves no empty file behind

- **WHEN** a page's bytes cannot be read from the project after the save dialog has made the file
- **THEN** the author reads this sentence, still there after a transient notice would have gone, the sequence is
  selected, and no empty file remains:
  `Export failed: <page> in "<sequence>" could not be read from the project. telavat.vcg was removed; nothing was saved.`

#### Scenario: A file the browser will not remove is named for the author to delete

- **WHEN** an export fails after the dialog made an empty file, and the browser cannot remove it
- **THEN** the sentence ends `<file> was left empty; delete it.`, and a file that still holds its earlier bytes is
  never removed (`<file> was not changed.`)

#### Scenario: An error found before the dialog makes no file

- **WHEN** the template has a preflight error at the moment `Export (.vcg)` is pressed
- **THEN** no save dialog opens, the offenders are selected and the Issues panel is opened

### Requirement: A template too large for CG Control is refused before the save dialog

The `.vcg` export SHALL refuse, before the save dialog opens, a template whose pictures, clips, sounds and fonts
exceed `TEMPLATE_MEDIA_MAX_BYTES` (45 MB: CG Bridge's 64 MiB frame, less 4 MiB for the page itself, before base64),
because CG Control renders an imported package into one page and sends it to CG Bridge in one frame. The refusal SHALL
be a preflight error on the heaviest element naming how many pictures, how many MB and the limit, and the way around it:
loading the pages in CG Control (BOOK-EXPORT Q1: the limit stays). The single-file HTML export, which never goes
through CG Bridge, SHALL NOT be refused by it.

#### Scenario: The owner-sized book is refused in one sentence

- **WHEN** a Sequence holds 150 pictures of 672 MB and the author presses `Export (.vcg)`
- **THEN** no save dialog opens, and the Issues panel reads:
  `"<sequence>" makes this template too large for CG Control: 150 pictures, 672 MB of pictures and media; one template can carry at most 45 MB. Use fewer or smaller pictures, or load the pages in CG Control instead (Load folder…).`

#### Scenario: The HTML export is not refused by the CG Control limit

- **WHEN** the only error is that the template is too large for CG Control
- **THEN** `Export (.vcg)` is marked blocked and `HTML` is not
