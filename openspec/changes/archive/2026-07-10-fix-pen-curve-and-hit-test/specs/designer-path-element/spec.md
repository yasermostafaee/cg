# designer-path-element (B-057 / B-056 / B-055 delta)

## MODIFIED Requirements

### Requirement: Pen tool draws a bézier path

The canvas toolbar SHALL include a Pen tool that draws a `path` element. A click SHALL place a
corner anchor; a click-drag SHALL place a smooth anchor whose two handles mirror the drag — and
corner vs smooth SHALL be DECIDED AT POINTER-UP by the gesture's total displacement against a
SCREEN-pixel guard (zoom-independent): a click-sized gesture (any jitter below the guard) places a
CORNER with no handles on its side, even when the mid-hold preview briefly showed a curve, while a
genuine drag places the SMOOTH anchor. Placing a corner after a smooth anchor SHALL leave the
previous anchor's handles untouched — the shared segment keeps its smooth side as the prior anchor
defines (Illustrator semantics). Clicking the first anchor SHALL close the path; pressing Enter or
double-clicking SHALL finish an OPEN path. While a draft is in progress, pressing Esc SHALL CANCEL
it — the created element (if any) is removed from the scene. After ANY finish (close-click / Enter
/ double-click) the pen SHALL STAY armed with the finished path selected, and the next pointer-down
SHALL start a NEW independent element — N consecutive draws yield N independent path elements, none
mutating an earlier one. Returning to the cursor SHALL be explicit: the toolbar, or Esc while no
draft is in progress. An in-progress draft SHALL be finished-or-canceled on ANY exit from the pen
tool (tool switch, composition switch, canvas overlay unmount): a draft with at least 2 anchors is
FINISHED (open), a draft with fewer is canceled — a draft can never leak into a later pen session.
If the draft's committed element is removed or altered OUTSIDE the pen mid-draw (Delete on the
auto-selected element, undo stepping the scene back), the draft SHALL be discarded — the next
pointer-down starts a fresh element and the removed/undone geometry is never resurrected. Each pen
element SHALL receive a collision-safe unique id (the store's shared element-id generator).

#### Scenario: Clicks place anchors; drag makes a smooth anchor

- **WHEN** the operator selects the Pen tool and clicks the canvas
- **THEN** a new path begins with a corner anchor at the click, each further click adds a corner
  anchor, and a click-drag adds a smooth anchor whose two handles mirror the drag direction/length

#### Scenario: A click-sized slip still places a corner

- **WHEN** the operator places an anchor with a click whose incidental motion stays below the
  screen-px guard (ordinary mouse jitter), at any zoom
- **THEN** the anchor is a CORNER — no smooth flag, no handles on its side — because the decision
  is made at pointer-up from the total displacement, not incrementally during the hold

#### Scenario: A corner after a smooth anchor keeps the smooth side

- **WHEN** the operator places a smooth anchor (drag) and then a corner anchor (click)
- **THEN** the new anchor is a corner and the previous anchor's handles are untouched — the
  segment between them keeps its curve on the previous anchor's side only

#### Scenario: Close by clicking the first anchor

- **WHEN** the operator clicks the first anchor
- **THEN** the path closes and stays selected, and the pen STAYS armed — the next pointer-down
  starts a new independent path

#### Scenario: Finish open with Enter / double-click

- **WHEN** the operator presses Enter or double-clicks
- **THEN** the path finishes OPEN and stays selected, and the pen STAYS armed

#### Scenario: Esc cancels an in-progress draft

- **WHEN** the operator presses Esc while a pen draft is in progress
- **THEN** the draft is canceled — its created element is removed from the scene and nothing of the
  draft persists — and a subsequent undo restores the WHOLE canceled path as one step (never a
  partial phantom)

#### Scenario: Esc with no draft returns to the cursor

- **WHEN** the pen tool is armed with no draft in progress and the operator presses Esc
- **THEN** the active tool returns to the cursor

#### Scenario: Consecutive draws create independent elements

- **WHEN** the operator finishes a path and draws again without re-picking the tool
- **THEN** a second independent path element is created and the first path's anchors/geometry are
  unchanged

#### Scenario: A draft never survives a pen exit

- **WHEN** the operator switches tools (or compositions) while a pen draft is in progress
- **THEN** a draft with at least 2 anchors is finished as an OPEN path and a smaller draft is
  canceled, and the next pen session starts a fresh element — never appending to the previous one

#### Scenario: An externally removed or undone draft element kills the draft

- **WHEN** the in-progress draft's element is deleted (or the scene is stepped back by undo)
  mid-draw
- **THEN** the draft is discarded — the next pointer-down starts a fresh element and the removed
  geometry is not resurrected

### Requirement: A selected path is fully editable

When a path is selected with the select tool, its anchors and handles SHALL be shown. Dragging an
anchor SHALL move it; dragging a handle SHALL reshape the adjacent segment(s); a smooth anchor SHALL
keep its two handles mirrored while a corner anchor moves each independently; a modifier (Alt) SHALL
break a mirrored pair into an independent corner. Clicking a segment SHALL insert a CORNER anchor
there; click-DRAGGING a segment SHALL insert a SMOOTH anchor whose mirrored handles follow the drag
(the pen's drag-to-smooth gesture, applied on insertion; corner vs smooth decided at pointer-up by
the same screen-px guard, the whole insertion one undo entry). Removing an anchor SHALL re-stitch
the path across the gap; removing below 2 anchors SHALL delete the whole element. Each edit gesture
SHALL be one undo entry. Edit affordances are SELECT-TOOL-ONLY: while the pen tool is armed,
neither the anchor/handle overlay nor the transform gizmo SHALL be mounted or interactive over the
canvas — a pen click near an existing (even selected) path starts or extends the draft and SHALL
NOT insert an anchor into, resize, or otherwise edit that path.

#### Scenario: Drag anchors and handles

- **WHEN** the operator drags an anchor or a handle on a selected path
- **THEN** the anchor moves / the adjacent segments reshape; a smooth anchor's handles stay mirrored,
  a corner anchor's move independently, and Alt breaks a mirrored pair into a corner

#### Scenario: Insert and remove anchors

- **WHEN** the operator clicks a segment (insert) or removes an anchor (Delete)
- **THEN** a new anchor is inserted preserving the path / the path re-stitches across the gap, and
  removing below 2 anchors deletes the whole element

#### Scenario: A segment click-drag inserts a smooth anchor

- **WHEN** the operator presses on a selected path's segment and drags before releasing
- **THEN** the inserted anchor is SMOOTH with mirrored handles following the drag — the path curves
  through it — while a plain segment click still inserts a corner

#### Scenario: Pen clicks are never hijacked by edit affordances

- **WHEN** a path element is selected, the pen tool is armed, and the operator clicks near that
  path's outline or bounding box
- **THEN** the click goes to the pen (starting or extending a draft) — no anchor is inserted into
  the selected path and no resize/rotate gesture starts

### Requirement: Gizmo + outline hit-test

A selected path SHALL be tracked by the B-022 scale-aware gizmo, its size the bounding box of its
points; resizing SHALL apply a scaleX/scaleY transform and SHALL NOT re-bake the point coordinates.
Selection SHALL hit the ACTUAL outline as RENDERED, including bézier curvature: the hit-test SHALL
follow the same cubic segments the runtime draws (control points from the anchors' out/in handles),
so a curve that bulges outside the anchors' polygon selects under the bulge, a concavity that cuts
inside the anchors' polygon does NOT select in the cut-away region, clicking inside a closed path's
curved outline selects it, clicking near an open path's curved stroke (distance-to-stroke within
the grab margin) selects it, and clicking inside the bounding box but outside the actual shape does
NOT select it.

#### Scenario: Gizmo resize scales without re-baking points

- **WHEN** a selected path is resized via the gizmo
- **THEN** the gizmo tracks it under scale + rotation and the resize applies a scaleX/scaleY transform
  without changing the stored point coordinates

#### Scenario: Outline hit-test

- **WHEN** the operator clicks inside a closed path / near an open path's stroke / inside the bbox but
  outside the shape
- **THEN** the closed path selects / the open path selects / the bbox-but-outside click does NOT
  select it

#### Scenario: Curved outlines hit like they render

- **WHEN** the operator clicks under a bézier bulge outside the anchors' polygon, or in a concave
  cut inside the anchors' polygon, or near an open path's curved stroke away from its straight
  chord
- **THEN** the bulge click and the curved-stroke click SELECT the path, and the concavity click
  does NOT
