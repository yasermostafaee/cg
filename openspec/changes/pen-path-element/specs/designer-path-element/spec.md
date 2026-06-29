# designer-path-element (D-109)

## ADDED Requirements

### Requirement: Pen tool draws a bézier path

The canvas toolbar SHALL include a Pen tool that draws a `path` element. A click SHALL place a corner
anchor; a click-drag SHALL place a smooth anchor whose two handles mirror the drag; clicking the first
anchor SHALL close the path; pressing Enter / Esc or double-clicking SHALL finish an OPEN path. In all
finishing cases the tool SHALL return to the cursor with the new path selected.

#### Scenario: Clicks place anchors; drag makes a smooth anchor

- **WHEN** the operator selects the Pen tool and clicks the canvas
- **THEN** a new path begins with a corner anchor at the click, each further click adds a corner
  anchor, and a click-drag adds a smooth anchor whose two handles mirror the drag direction/length

#### Scenario: Close by clicking the first anchor

- **WHEN** the operator clicks the first anchor
- **THEN** the path closes and the tool returns to the cursor with the path selected

#### Scenario: Finish open with Enter / Esc / double-click

- **WHEN** the operator presses Enter / Esc or double-clicks
- **THEN** the path finishes OPEN and the tool returns to the cursor with the path selected

### Requirement: Closed fills, open strokes — preview == export

A CLOSED path SHALL render fill + stroke; an OPEN path SHALL render stroke only (fill ignored). The
render SHALL be identical in the canvas preview, the `.vcg` package, and the single-file HTML export.
A single-line (degenerate) path SHALL still render its stroke.

#### Scenario: Closed renders fill + stroke

- **WHEN** a path is closed
- **THEN** it renders as `<svg><path>` with both a fill and a stroke

#### Scenario: Open renders stroke only

- **WHEN** a path is open
- **THEN** it renders with `fill: none` (stroke only), identically across preview / `.vcg` /
  single-file HTML

### Requirement: A selected path is fully editable

When a path is selected with the select tool, its anchors and handles SHALL be shown. Dragging an
anchor SHALL move it; dragging a handle SHALL reshape the adjacent segment(s); a smooth anchor SHALL
keep its two handles mirrored while a corner anchor moves each independently; a modifier (Alt) SHALL
break a mirrored pair into an independent corner. Clicking a segment SHALL insert an anchor there;
removing an anchor SHALL re-stitch the path across the gap; removing below 2 anchors SHALL delete the
whole element. Each edit gesture SHALL be one undo entry.

#### Scenario: Drag anchors and handles

- **WHEN** the operator drags an anchor or a handle on a selected path
- **THEN** the anchor moves / the adjacent segments reshape; a smooth anchor's handles stay mirrored,
  a corner anchor's move independently, and Alt breaks a mirrored pair into a corner

#### Scenario: Insert and remove anchors

- **WHEN** the operator clicks a segment (insert) or removes an anchor (Delete)
- **THEN** a new anchor is inserted preserving the path / the path re-stitches across the gap, and
  removing below 2 anchors deletes the whole element

### Requirement: Transform / opacity / filter / stroke animate like a shape

A path's transform / opacity / filter / stroke SHALL keyframe exactly like a rectangle or ellipse
(same timeline rows, same diamonds, same gizmo). The point set SHALL NOT be keyframe-able in this item
(per-point morphing is deferred to D-110).

#### Scenario: Box-style + transform properties animate

- **WHEN** a path's transform / opacity / filter / stroke is keyframed
- **THEN** it animates like a shape, and the path's point set is not keyframe-able here

### Requirement: Gizmo + outline hit-test

A selected path SHALL be tracked by the B-022 scale-aware gizmo, its size the bounding box of its
points; resizing SHALL apply a scaleX/scaleY transform and SHALL NOT re-bake the point coordinates.
Selection SHALL hit the ACTUAL outline: clicking inside a closed path's outline (point-in-polygon)
selects it, clicking near an open path's stroke (distance-to-stroke) selects it, and clicking inside
the bounding box but outside the actual shape does NOT select it.

#### Scenario: Gizmo resize scales without re-baking points

- **WHEN** a selected path is resized via the gizmo
- **THEN** the gizmo tracks it under scale + rotation and the resize applies a scaleX/scaleY transform
  without changing the stored point coordinates

#### Scenario: Outline hit-test

- **WHEN** the operator clicks inside a closed path / near an open path's stroke / inside the bbox but
  outside the shape
- **THEN** the closed path selects (point-in-polygon) / the open path selects (distance-to-stroke) /
  the bbox-but-outside click does NOT select it

### Requirement: A path round-trips with stable ids

A scene containing a path SHALL round-trip through save / reload / preview / `.vcg` / single-file HTML
and validate, and every anchor SHALL keep its stable id.

#### Scenario: Save / reload / export preserves anchors

- **WHEN** a scene with a path is saved, reloaded, previewed, and exported
- **THEN** it round-trips and validates, and every anchor keeps its stable id
