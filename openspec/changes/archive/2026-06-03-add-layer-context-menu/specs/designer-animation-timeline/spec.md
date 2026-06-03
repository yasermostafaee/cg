## ADDED Requirements

### Requirement: Layer right-click context menu

The timeline SHALL open a context menu when the operator right-clicks a layer
(element) row — on either its label or its lane. The menu SHALL appear at the
cursor, clamp itself within the viewport, select the right-clicked element, and
offer the actions: Color (with a color submenu), Fit workspace, Copy, Cut,
Paste, Duplicate, and Delete. The menu SHALL close when the operator clicks
outside it or presses `Escape`. ("Move to nested composition" is intentionally
not offered until nested compositions exist.)

#### Scenario: Right-click opens the menu at the cursor
- **WHEN** the operator right-clicks a layer row
- **THEN** a context menu opens at the cursor position showing Color, Fit
  workspace, Copy, Cut, Paste, Duplicate, and Delete, and the right-clicked
  element becomes the selection

#### Scenario: Clicking outside or pressing Escape closes the menu
- **WHEN** the menu is open and the operator clicks outside it or presses
  `Escape`
- **THEN** the menu closes without performing an action

### Requirement: Layer color via the Color submenu

The context menu's Color item SHALL open a submenu of named color swatches.
Choosing a swatch SHALL set that element's `timelineColor`, and the element's
timeline lifespan bar SHALL render in the chosen color. When an element has no
`timelineColor`, the lifespan bar SHALL fall back to a default color chosen by
the element's kind (e.g. green for rectangles, blue for ellipses, amber for
text), so each kind reads consistently across the timeline.

#### Scenario: Choosing a swatch recolors the lifespan bar
- **WHEN** the operator opens Color and clicks a swatch
- **THEN** the element's `timelineColor` is set to that swatch's color and its
  lifespan bar renders in that color

#### Scenario: Unset color falls back to a per-kind default
- **WHEN** an element has no `timelineColor`
- **THEN** its lifespan bar uses the default color for its kind (e.g. a
  rectangle's bar is green, an ellipse's blue)

### Requirement: Fit workspace sets the lifespan to the active region

The context menu's Fit workspace action SHALL set the element's `lifespan` to
the scene's active region (`activeRange` when set, otherwise the full
`frameRange`), clamped to the scene frame range.

#### Scenario: Fit workspace snaps the lifespan to the active region
- **WHEN** the scene's active region is `[0, 20]` and the operator clicks Fit
  workspace on a layer
- **THEN** that element's `lifespan` becomes `{ in: 0, out: 20 }`

### Requirement: Copy, Cut, Paste, Duplicate, and Delete on layers

The context menu SHALL provide clipboard and lifecycle actions on the layer:

- **Copy** SHALL place a snapshot of the element on an in-memory clipboard.
- **Cut** SHALL copy the element and then remove it from the scene.
- **Paste** SHALL insert a fresh clone of the clipboard element — with new ids
  assigned recursively to it and any container children — and select it; Paste
  SHALL be disabled when the clipboard is empty.
- **Duplicate** SHALL insert a fresh clone directly after the original in the
  same layer and select it.
- **Delete** SHALL remove the element from the scene.

The clipboard SHALL be cleared when a different scene is loaded so an element
cannot be pasted across projects.

#### Scenario: Copy then Paste inserts a clone with a new id
- **WHEN** the operator copies a layer and then pastes
- **THEN** a new element with a different id is inserted into the timeline and
  becomes the selection, leaving the original in place

#### Scenario: Paste is a no-op with an empty clipboard
- **WHEN** nothing has been copied or cut and the operator triggers Paste
- **THEN** the scene is unchanged

#### Scenario: Cut removes the original and keeps it pasteable
- **WHEN** the operator cuts a layer
- **THEN** the element is removed from the scene and the clipboard holds it, so a
  subsequent Paste re-inserts a clone with a new id

#### Scenario: Duplicate inserts directly after the original
- **WHEN** the operator clicks Duplicate on a layer
- **THEN** a clone with a new id is inserted immediately after the original in
  the same layer and becomes the selection

#### Scenario: Delete removes the layer
- **WHEN** the operator clicks Delete on a layer
- **THEN** that element is removed from the scene

#### Scenario: Clipboard clears on scene switch
- **WHEN** the operator copies a layer and then a different scene is loaded
- **THEN** the clipboard is empty (Paste is disabled)
