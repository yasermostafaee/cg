# designer-path-element (B-058…B-063 / D-124 delta)

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
double-clicking SHALL finish an OPEN path. While a draft is in progress, pressing Esc OR
RIGHT-CLICKING the canvas SHALL CANCEL it — identical semantics either way: the created element
(if any) is removed from the scene, one undo restores the whole canceled path, and the browser
context menu never shows. A right-click with the pen armed but NO draft in progress SHALL change
nothing. After ANY finish (close-click / Enter / double-click) the pen SHALL STAY armed with the
finished path selected, and the next pointer-down SHALL start a NEW independent element — N
consecutive draws yield N independent path elements, none mutating an earlier one. Returning to
the cursor SHALL be explicit: the toolbar, or Esc while no draft is in progress. An in-progress
draft SHALL be finished-or-canceled on ANY exit from the pen tool (tool switch, composition
switch, canvas overlay unmount): a draft with at least 2 anchors is FINISHED (open), a draft with
fewer is canceled — a draft can never leak into a later pen session. If the draft's committed
element is removed or altered OUTSIDE the pen mid-draw (Delete on the auto-selected element, undo
stepping the scene back), the draft SHALL be discarded — the next pointer-down starts a fresh
element and the removed/undone geometry is never resurrected. Each pen element SHALL receive a
collision-safe unique id (the store's shared element-id generator).

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

#### Scenario: Right-click cancels an in-progress draft

- **WHEN** the operator right-clicks anywhere on the canvas while a pen draft is in progress
- **THEN** the draft is canceled with the exact Esc-cancel semantics (element removed, one undo
  restores the whole path), no browser context menu shows, and the pen stays armed — while a
  right-click with the pen armed but idle changes nothing

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

Path editing SHALL be a dedicated POINT-EDIT MODE, unified with the other element kinds: a single
click on a path (select tool) SHALL select it and show ONLY the selection box — no anchors or
handles; DOUBLE-clicking a path SHALL enter point-edit mode, showing the anchor/handle overlay and
hiding the transform gizmo (point editing is its own mode, like inline text editing). In edit
mode: dragging an anchor SHALL move it; dragging a handle SHALL reshape the adjacent segment(s); a
smooth anchor SHALL keep its two handles mirrored while a corner anchor moves each independently;
a modifier (Alt) SHALL break a mirrored pair into an independent corner. Point INSERTION SHALL be
modifier-gated: while Ctrl (or Cmd on macOS) is held, segments SHALL show the add-point affordance
(cursor + hit surface) and a click SHALL insert a CORNER / a click-DRAG SHALL insert a SMOOTH
anchor with mirrored drag-defined handles (decided at pointer-up, one undo entry); WITHOUT the
modifier, clicking a segment SHALL do nothing special. The insertion point SHALL be the NEAREST
point on the real curved segment under the cursor. Right-clicking an anchor square SHALL open
the anchor context menu — rendered with the SAME shared context-menu chrome as the app's other
right-click menus — whose Delete point removes THAT anchor with the keyboard-delete semantics
(re-stitch; below 2 anchors deletes the whole element; one undo entry); right-clicking a SEGMENT
(not an anchor) SHALL open the same menu with **Add point** (corner) and **Add curve point**
(smooth with tangent-aligned mirrored handles), inserting at the nearest point on the curve under
the cursor through the same insert route; the menu keeps its accessible keyboard behavior
(menu/menuitem roles, focus-first, Arrow/Enter/Esc; an Esc that closes the menu is consumed by
it), and the segment affordance/hit surface SHALL follow the true curved, rotated outline (never
the straight chord). Exiting edit mode: Esc OR a click on empty pasteboard SHALL
return to plain selection (selection KEPT — the NEXT Esc/empty click deselects as before); Esc
precedence is menu-close > edit-mode-exit > deselect. Selecting a different element, entering edit
mode on another path, switching composition, or switching tools SHALL clear the mode. Each edit
gesture SHALL be one undo entry. Edit affordances remain SELECT-TOOL-ONLY: while the pen tool is
armed, neither the anchor/handle overlay nor the transform gizmo SHALL be mounted or interactive —
a pen click near an existing path starts or extends the draft and SHALL NOT edit that path.

#### Scenario: Single click selects with box only

- **WHEN** the operator single-clicks a path with the select tool
- **THEN** the path is selected and shows only the selection box — no anchors, no handles

#### Scenario: Double-click enters point-edit mode

- **WHEN** the operator double-clicks a path
- **THEN** the anchor/handle overlay appears and the transform gizmo hides — all anchor
  interactions (drag anchor/handle, modifier-gated insert, right-click menu) are available

#### Scenario: Esc or an empty-pasteboard click exits edit mode

- **WHEN** the operator presses Esc or clicks empty pasteboard while a path is in point-edit mode
- **THEN** edit mode exits back to plain selection (the path STAYS selected, box only), and the
  action does not also deselect — a SECOND Esc/empty click deselects as before

#### Scenario: Modifier-gated point insertion

- **WHEN** the operator holds Ctrl (Cmd on macOS) in edit mode
- **THEN** segments show the add-point affordance and a click inserts a corner / a click-drag
  inserts a smooth anchor with mirrored handles — while without the modifier a segment click does
  nothing special and no affordance shows

#### Scenario: Drag anchors and handles

- **WHEN** the operator drags an anchor or a handle in point-edit mode
- **THEN** the anchor moves / the adjacent segments reshape; a smooth anchor's handles stay
  mirrored, a corner anchor's move independently, and Alt breaks a mirrored pair into a corner

#### Scenario: Right-click a segment offers Add point / Add curve point

- **WHEN** the operator right-clicks a selected path's segment (not an anchor) in edit mode
- **THEN** the shared context menu opens with Add point and Add curve point; choosing one inserts
  a corner / a smooth anchor (tangent-aligned mirrored handles) at the nearest point on the curve
  under the cursor, as one undo entry — while a pen-draft right-click still cancels the draft

#### Scenario: The anchor menu matches the app's context menus and deletes the point

- **WHEN** the operator right-clicks an anchor in edit mode and chooses Delete point
- **THEN** the menu renders with the shared context-menu chrome (same look as the timeline layer
  menu), no native menu shows, and THAT anchor is removed with the keyboard-delete semantics
  (re-stitch; below 2 anchors deletes the element; one undo restores)

#### Scenario: The mode clears when leaving the path

- **WHEN** the operator selects a different element, switches composition, or switches tools while
  a path is in point-edit mode
- **THEN** the mode is cleared — returning to the path later starts at plain selection again

#### Scenario: Pen clicks are never hijacked by edit affordances

- **WHEN** a path element is selected, the pen tool is armed, and the operator clicks near that
  path's outline or bounding box
- **THEN** the click goes to the pen (starting or extending a draft) — no anchor is inserted into
  the selected path and no resize/rotate gesture starts

### Requirement: Gizmo + outline hit-test

A path's stored geometry SHALL follow the size==visualBBox model (owner decision 2026-07-10): the
points live with their VISUAL (curve-aware) bounding box — the union of each cubic segment's exact
bézier extents — at local (0,0), and `transform.size` SHALL equal that box's extents, so the B-022
gizmo box, the Inspector W/H, snap targets, and the off-frame export filter all enclose the
visible curved outline with NO path-specific mapping (a path whose curve is visible in-frame is
never dropped because its anchors sit off-frame). A STATIC resize (gizmo drag or Inspector W/H)
SHALL scale the anchor coordinates and handle vectors like a rectangle's corners — the invariant
holds afterwards, so a later anchor edit never snaps the size back — while `size.w`/`size.h`
KEYFRAMES keep their render-stretch semantics unchanged. LEGACY content (the anchors-bbox
convention) SHALL be migrated by ONE pure, deterministic transform applied at Designer scene load
AND at runtime scene ingestion — so saved projects and existing `.vcg` packages (whose
integrity/signing forbids rewriting) render pixel-identically without visual jumps; the migration
compensates `size.*` keyframe values (constant ratio), `position.*` keyframe values (constant
shift), and the static rotation/scale pivot. The anchor/handle EDIT overlay SHALL track the
element's full Scale·Rotate-about-anchor transform (a rotated path's anchors, handles, and segment
affordances sit on the rotated shape; drags invert the same transform). Selection SHALL hit the
ACTUAL outline as RENDERED, including bézier curvature: the hit-test SHALL follow the same cubic
segments the runtime draws, so a curve that bulges outside the anchors' polygon selects under the
bulge, a concavity that cuts inside the anchors' polygon does NOT select in the cut-away region,
clicking inside a closed path's curved outline selects it, clicking near an open path's curved
stroke (distance-to-stroke within the grab margin) selects it, and clicking inside the bounding
box but outside the actual shape does NOT select it.

#### Scenario: The selection box encloses the curved shape

- **WHEN** a path with bézier bulges beyond its anchors is selected (e.g. a two-anchor curved arc)
- **THEN** the selection box encloses the whole visible outline and the Inspector W/H report the
  visual extents — never a box hugging only the anchors

#### Scenario: Resize scales the points; a later anchor edit never snaps back

- **WHEN** the operator resizes a path (gizmo or Inspector W/H), then enters point-edit mode and
  drags an anchor
- **THEN** the resize scaled the anchor coordinates (like a rectangle), the visible shape keeps
  the resized scale through the anchor drag, and `transform.size` still equals the visual bounds

#### Scenario: Legacy scenes and packages render identically after migration

- **WHEN** a scene or `.vcg` package saved under the old anchors-bbox convention is loaded by the
  Designer or ingested by the runtime
- **THEN** every path renders pixel-identically (including statically rotated/scaled ones and
  `size`/`position` keyframe values), the package file itself is not rewritten, and the migrated
  in-memory form satisfies size==visualBBox

#### Scenario: The edit overlay tracks a rotated path

- **WHEN** a rotated path is in point-edit mode
- **THEN** the anchors, handles, and segment affordances sit ON the rotated outline, and dragging
  an anchor or handle moves it exactly under the pointer (the drag inverts the rotation)

#### Scenario: Editing a rotated path never shifts the untouched points

- **WHEN** the operator drags one anchor (or handle) of a ROTATED and/or scaled path in
  point-edit mode
- **THEN** every OTHER anchor's rendered position stays fixed throughout the drag and at release —
  the per-edit bbox/size reframing is render-neutral under the full transform (the moving pivot
  is compensated in `position`), with no mid-drag wobble and no jump at gesture end

#### Scenario: Outline hit-test

- **WHEN** the operator clicks inside a closed path / near an open path's stroke / inside the bbox
  but outside the shape
- **THEN** the closed path selects / the open path selects / the bbox-but-outside click does NOT
  select it

#### Scenario: Curved outlines hit like they render

- **WHEN** the operator clicks under a bézier bulge outside the anchors' polygon, or in a concave
  cut inside the anchors' polygon, or near an open path's curved stroke away from its straight
  chord
- **THEN** the bulge click and the curved-stroke click SELECT the path, and the concavity click
  does NOT
