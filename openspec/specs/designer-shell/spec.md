# designer-shell Specification

## Purpose

TBD - created by archiving change redesign-studio-loopic-style. Update Purpose after archive.

## Requirements

### Requirement: Landing view as the entry screen

The Designer SHALL render a Landing view whenever no scene is open.
The Landing view MUST display a list of starter (demo) projects, a
list of recent projects, and a "New project" affordance.

#### Scenario: Designer opens with no active scene

- **WHEN** the Designer is opened and no scene is active
- **THEN** the entire viewport is filled by the Landing view (no
  studio shell is rendered)

#### Scenario: Operator picks a starter

- **WHEN** the operator clicks a starter card on the Landing view
- **THEN** the matching starter scene is loaded as the active scene
  and the Designer switches to the Studio view

#### Scenario: Operator picks a recent project

- **WHEN** the operator clicks a recent-project entry on the Landing
  view
- **THEN** the project at that path is opened and the Designer
  switches to the Studio view

### Requirement: New Project modal collects size + frame rate

The "New project" affordance SHALL open a modal that collects a name,
a resolution (preset or custom W×H), and a frame rate (from the v1
set: 25, 29.97, 50, 59.94, 60). Confirming the modal MUST create the
scene with those settings and switch to the Studio view; cancelling
MUST close the modal and leave the Designer on the Landing view.

#### Scenario: Operator creates a custom-size project

- **WHEN** the operator opens the New Project modal, sets resolution
  to 1280×720 and frame rate to 25, types a name, and confirms
- **THEN** a new scene is created with `resolution: 1280×720`,
  `frameRate: 25`, the chosen name, and the Designer switches to the
  Studio view with that scene active

#### Scenario: Operator cancels the New Project modal

- **WHEN** the modal is open and the operator clicks Cancel (or
  presses Escape)
- **THEN** the modal closes and the Designer remains on the Landing
  view with no scene created

### Requirement: Studio view has a top toolbar with six tools

The Studio view SHALL render a top toolbar above the canvas. The
toolbar MUST contain six tool buttons in this order: cursor,
rectangle, text, ellipse, hand, image. Clicking a button activates
that tool in the store.

#### Scenario: Operator switches tools from the top toolbar

- **WHEN** the operator clicks the rectangle button on the top
  toolbar
- **THEN** `tool === 'shape'` in the store and clicks on the canvas
  drop a new rectangle (existing tool semantics)

#### Scenario: Hand tool is available

- **WHEN** the operator clicks the hand button on the top toolbar
- **THEN** `tool === 'hand'` in the store and click+drag on the
  canvas pans the viewport without selecting or creating elements

### Requirement: Return to the Landing view

The Studio view SHALL provide a "back to projects" affordance that
returns to the Landing view and clears the active scene.

#### Scenario: Operator returns to projects

- **WHEN** the operator clicks "back to projects" in the Studio view
- **THEN** the active scene is cleared and the Designer switches
  back to the Landing view

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

### Requirement: The starter catalog is the five D-119 Persian broadcast demos

The starter catalog SHALL consist of exactly five starters — `irib-news`,
`ticker`, `logo-bug`, `title`, `sequence`, in that landing order — each a
schema-valid, fully animated Persian (RTL, Vazirmatn) scene with a real
playout lifecycle, and none SHALL carry the "New" badge. Each starter SHALL
follow the two-comp structure: a small on-air footprint composition (recorded
via an `onair:<compId>` scene metadata tag and its own lifecycle/playout)
nested inside a full 1920×1080 composition that is the `entryCompositionId`
and therefore the default preview/export root.

#### Scenario: Only the five D-119 starters appear

- **WHEN** the Landing view lists starters
- **THEN** exactly `irib-news`, `ticker`, `logo-bug`, `title`, `sequence`
  appear, in that order, each with a poster and no "New" badge

#### Scenario: Every starter runs a real playout lifecycle in preview

- **WHEN** any starter's entry composition is previewed and played
- **THEN** it runs entrance → hold → exit per its authored playout mode —
  `manual` starters (`irib-news`, `ticker`) hold on air until the operator's
  stop/out intent and then play their authored exit, `auto-out` starters
  (`title`, `sequence`) self-close after their hold, and the `logo-bug` sting
  re-plays on its loop-cycle cadence (~every 10 s) until stopped

#### Scenario: The composite's panel rotates one state at a time

- **WHEN** the `irib-news` starter plays
- **THEN** its right panel shows exactly one state at a time — the live
  Tehran wall clock, then the live Greenwich wall clock, then the "@IRIBNEWS"
  brand text — rotating on a loop while the headline crawl rolls

#### Scenario: Operator-editable data keys drive the content

- **WHEN** the operator edits a starter's bound data key (a ticker/sequence
  `list` field or a text field) in the preview form
- **THEN** the on-air content updates through the binding (list updates
  reconcile by item id without restarting the crawl/rotation)

### Requirement: A starter's bound text field carries a real Persian default

Every bound TEXT field in a starter SHALL follow the hand-authored binding
shape: the element's base text is a real Persian display value that is ALSO the
field's `default`, and the data key is layered on top via a binding that carries
NO `placeholder` (absent placeholder = the value replaces the full text). A raw
`{{token}}` SHALL NOT appear as any element's authored text. This keeps the
Designer canvas showing broadcast copy, makes the same string the on-air
fallback when the operator sends no value, and lets the Designer's inspector
recognise the binding as the element's Data key (it treats only a
placeholder-less text binding as an element's convenience binding).

#### Scenario: A loaded starter shows real Persian copy, not a raw token

- **WHEN** the operator opens a starter in the Studio
- **THEN** each bound text element shows its Persian default value (e.g. the
  `logo-bug` wordmark shows «شبکه جدید») and no `{{token}}` is visible on the
  canvas

#### Scenario: On air with no operator value, the default renders

- **WHEN** a starter is played with no value for a bound text field
- **THEN** that field's element renders the field's Persian `default`

#### Scenario: An operator value replaces the default on air

- **WHEN** a starter is played with a value for a bound text field
- **THEN** that value replaces the default in the rendered element

### Requirement: Starter asset seeding rewrites every font-bearing element

When a starter ships font assets, the seeding step SHALL rewrite the
placeholder `asset-<key>` font family to the imported `asset-<assetId>` on
EVERY font-bearing element kind — `text`, `ticker`, `clock`, and `sequence`
(recursing through containers) — and on the scene's `fonts` entries, so a
seeded face resolves wherever the scene uses it.

#### Scenario: A ticker element resolves its seeded face

- **WHEN** a starter that ships a Vazirmatn font asset is loaded and its
  scene contains a `ticker`, `clock`, or `sequence` element referencing the
  placeholder family
- **THEN** after seeding, that element's `font.family` is the imported
  `asset-<assetId>` (not the unresolved placeholder)
