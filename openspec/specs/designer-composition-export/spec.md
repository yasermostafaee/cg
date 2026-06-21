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
