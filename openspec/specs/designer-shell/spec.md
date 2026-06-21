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

#### Scenario: The global bar shows the project name + Save, no export

- **WHEN** a project is open
- **THEN** the global top bar shows the centered project name and the Save control, and shows no Preview / Export `.vcg` / Export HTML buttons

#### Scenario: The File menu has no Export item

- **WHEN** the operator opens the File menu
- **THEN** there is no "Export…" item (export is triggered from the per-composition action bar)
