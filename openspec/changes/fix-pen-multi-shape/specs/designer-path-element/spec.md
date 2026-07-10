# designer-path-element (B-037 delta)

## MODIFIED Requirements

### Requirement: Pen tool draws a bézier path

The canvas toolbar SHALL include a Pen tool that draws a `path` element. A click SHALL place a
corner anchor; a click-drag SHALL place a smooth anchor whose two handles mirror the drag; clicking
the first anchor SHALL close the path; pressing Enter or double-clicking SHALL finish an OPEN path.
While a draft is in progress, pressing Esc SHALL CANCEL it — the created element (if any) is
removed from the scene. After ANY finish (close-click / Enter / double-click) the pen SHALL STAY
armed with the finished path selected, and the next pointer-down SHALL start a NEW independent
element — N consecutive draws yield N independent path elements, none mutating an earlier one.
Returning to the cursor SHALL be explicit: the toolbar, or Esc while no draft is in progress. An
in-progress draft SHALL be finished-or-canceled on ANY exit from the pen tool (tool switch,
composition switch, canvas overlay unmount): a draft with at least 2 anchors is FINISHED (open), a
draft with fewer is canceled — a draft can never leak into a later pen session. If the draft's
committed element is removed or altered OUTSIDE the pen mid-draw (Delete on the auto-selected
element, undo stepping the scene back), the draft SHALL be discarded — the next pointer-down starts
a fresh element and the removed/undone geometry is never resurrected. Each pen element SHALL
receive a collision-safe unique id (the store's shared element-id generator).

#### Scenario: Clicks place anchors; drag makes a smooth anchor

- **WHEN** the operator selects the Pen tool and clicks the canvas
- **THEN** a new path begins with a corner anchor at the click, each further click adds a corner
  anchor, and a click-drag adds a smooth anchor whose two handles mirror the drag direction/length

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
break a mirrored pair into an independent corner. Clicking a segment SHALL insert an anchor there;
removing an anchor SHALL re-stitch the path across the gap; removing below 2 anchors SHALL delete the
whole element. Each edit gesture SHALL be one undo entry. Edit affordances are SELECT-TOOL-ONLY:
while the pen tool is armed, neither the anchor/handle overlay nor the transform gizmo SHALL be
mounted or interactive over the canvas — a pen click near an existing (even selected) path starts or
extends the draft and SHALL NOT insert an anchor into, resize, or otherwise edit that path.

#### Scenario: Drag anchors and handles

- **WHEN** the operator drags an anchor or a handle on a selected path
- **THEN** the anchor moves / the adjacent segments reshape; a smooth anchor's handles stay mirrored,
  a corner anchor's move independently, and Alt breaks a mirrored pair into a corner

#### Scenario: Insert and remove anchors

- **WHEN** the operator clicks a segment (insert) or removes an anchor (Delete)
- **THEN** a new anchor is inserted preserving the path / the path re-stitches across the gap, and
  removing below 2 anchors deletes the whole element

#### Scenario: Pen clicks are never hijacked by edit affordances

- **WHEN** a path element is selected, the pen tool is armed, and the operator clicks near that
  path's outline or bounding box
- **THEN** the click goes to the pen (starting or extending a draft) — no anchor is inserted into
  the selected path and no resize/rotate gesture starts

## ADDED Requirements

### Requirement: Pen draw-state feedback

While a pen draft is in progress the canvas SHALL show non-interactive draw-state feedback: the
draft's placed anchors SHALL be marked; a live rubber-band preview segment SHALL run from the last
anchor to the pointer (following the last anchor's out handle when it is smooth, so the preview
reflects a smooth-drag in progress); and once the draft has at least 2 anchors the FIRST anchor
SHALL show a visible close affordance whenever the pointer is within the close radius — the same
radius the close-click uses. The feedback layer SHALL NOT intercept pointer events and SHALL use
the app's theme tokens.

#### Scenario: Rubber band follows the pointer

- **WHEN** a draft has at least one anchor and the operator moves the pointer
- **THEN** a preview segment is drawn from the last anchor to the pointer, updating live

#### Scenario: Close affordance within the close radius

- **WHEN** a draft has at least 2 anchors and the pointer moves within the close radius of the
  first anchor
- **THEN** the first anchor shows a highlighted close affordance, and clicking there closes the path
