# designer-path-element Specification

## Purpose

TBD - created by archiving change pen-path-element. Update Purpose after archive.

## Requirements

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

### Requirement: Transform / opacity / filter / stroke animate like a shape

A path's transform / opacity / filter / stroke SHALL keyframe exactly like a rectangle or ellipse
(same timeline rows, same diamonds, same gizmo). The point set SHALL additionally be keyframe-able
as a whole through the single **Path** property track (D-110) — per-anchor tracks SHALL NOT exist.

#### Scenario: Box-style + transform properties animate

- **WHEN** a path's transform / opacity / filter / stroke is keyframed
- **THEN** it animates like a shape, independently of (and combinable with) the Path shape track

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

### Requirement: A path round-trips with stable ids

A scene containing a path SHALL round-trip through save / reload / preview / `.vcg` / single-file HTML
and validate, and every anchor SHALL keep its stable id.

#### Scenario: Save / reload / export preserves anchors

- **WHEN** a scene with a path is saved, reloaded, previewed, and exported
- **THEN** it round-trips and validates, and every anchor keeps its stable id

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

### Requirement: Path Style edits apply

A `path` element's static Path Style edits SHALL apply: editing the solid fill colour, stroke
colour, stroke width, or dash array SHALL mutate the element model, re-render in the canvas
preview, and carry through the `.vcg` and single-file HTML exports, exactly as the same edits do
on a shape. This SHALL hold
whether or not the property has a keyframe track (a track routes the edit to a keyframe at the
playhead, as before; without one the static base value SHALL be written — never silently
dropped). The content-driven kinds (ticker / clock / sequence) SHALL continue to REFUSE static
stroke writes (no dead `stroke` data on kinds that carry no box).

#### Scenario: Static style edits mutate and render

- **WHEN** the operator edits a pen path's stroke width, stroke colour, dash array, or solid fill
  colour in the Inspector with no keyframe track on the property
- **THEN** the element model changes accordingly and the canvas preview re-renders the path with
  the new style

#### Scenario: Edited style survives export

- **WHEN** a pen path styled this way is exported
- **THEN** the exported output renders the same fill, stroke colour, stroke width, and dash

#### Scenario: Content-driven kinds still refuse stroke writes

- **WHEN** a static stroke write is attempted on a ticker, clock, or sequence
- **THEN** the write is refused and no `stroke` data appears on the element

### Requirement: Path shape morphs between snapshot keyframes

A `path` element SHALL support a `path` animatable property whose keyframe value is a SNAPSHOT of
the whole ordered anchor set (each anchor's stable id, x/y, optional in/out handle deltas, smooth
flag) in the element's local space. Between two path keyframes the runtime SHALL interpolate
PER ANCHOR BY STABLE ID: an anchor present in both snapshots tweens its x/y and its in/out handle
deltas along the segment's eased progress — the SAME easing machinery as every other track
(`step` snaps, named presets and custom cubic-bézier curves shape the progress). A handle absent
on one side of a matched pair SHALL interpolate from/to the zero vector (a corner↔smooth change
morphs smoothly; a zero-length handle renders as the straight segment). The EDITOR GUARANTEES
that every keyframe of a path shares ONE anchor set (the structure-lock requirement below), so
Designer-authored scenes always interpolate over matching ids. For hand-edited or legacy EXTERNAL
input with mismatched sets the runtime SHALL keep a DEFENSIVE fallback (owner decision
2026-07-11: keep the guard — never crash on malformed data): the interpolated point set keeps
the LEADING keyframe's anchor order; an id present ONLY in the leading snapshot HOLDS its leading
value across the segment; an id present ONLY in the trailing snapshot appears exactly at the
trailing keyframe's frame — differing point sets SHALL never crash or abort playback. Before the
first / after the last keyframe the snapshot SHALL clamp like every other track. Each frame's
interpolated point set SHALL feed the SAME `d`-string builder the static render uses; the
closed/fill rule (closed ⇒ fill+stroke, open ⇒ stroke only) SHALL hold while points animate; the
element's local coordinate space (viewBox from the STATIC geometry, size==visualBBox) SHALL stay
fixed during the morph with the SVG overflow visible, so a snapshot exceeding the static bounds
still renders and `size.w/h` keyframes keep their render-stretch semantics.

#### Scenario: Mid-frame morph tweens matched anchors

- **WHEN** a path has two path keyframes with the SAME id set but different anchor positions and
  handle deltas, and the playhead sits between them
- **THEN** each anchor renders at the id-matched interpolation of its x/y and handle deltas, and
  the rendered `d` is the same builder's output for that interpolated set

#### Scenario: Easing shapes the morph

- **WHEN** the leading path keyframe carries a non-linear easing (a named preset or a custom
  cubic-bézier) or `step`
- **THEN** the anchors interpolate along the EASED progress (not raw linear t) — and `step` holds
  the leading snapshot for the whole segment

#### Scenario: A corner↔smooth change morphs from the zero vector

- **WHEN** an anchor has no `out` handle in the leading keyframe but a defined `out` delta in the
  trailing keyframe
- **THEN** the handle interpolates from the zero vector to the trailing delta, so the segment
  bends progressively — no snap

#### Scenario: Malformed external input degrades honestly (defensive guard)

- **WHEN** a hand-edited or legacy `.vcg`/scene carries path keyframes where an anchor id exists
  in only ONE of the two keyframes bracketing the playhead (the editor itself can no longer
  author this — structure lock)
- **THEN** a leading-only id holds its leading value across the segment and a trailing-only id
  appears exactly at the trailing frame; matched ids still tween; nothing crashes; preflight
  surfaces the `path-morph-anchor-mismatch` warning

#### Scenario: Closed fill and local space hold while animating

- **WHEN** a CLOSED path's shape morphs to a snapshot whose points exceed the static bounds
- **THEN** the fill+stroke render (and an open path's stroke-only render) is preserved every
  frame, and the outgrown region renders instead of clipping at the static box

#### Scenario: The morph is identical in preview and both exports

- **WHEN** a scene with a path track is previewed, exported to `.vcg`, and exported to
  single-file HTML
- **THEN** every frame's interpolated shape is identical in all three (one runtime, no
  export-time baking), and the saved scene round-trips with ids and snapshots intact and
  ascending-frame validation holding

#### Scenario: A Designer morph .vcg crosses into the Runtime app

- **WHEN** a `.vcg` carrying a path track is imported into the RUNTIME app (verify → unpack →
  standalone render — the operator's actual cross-app boundary)
- **THEN** it validates, registers, and its rendered template carries the track verbatim — a
  schema drift between the apps (a new animatable property or keyframe-value variant reaching
  one app's build but not the other's) fails the boundary tests loudly instead of surfacing as
  an operator-facing import rejection (owner-reported 2026-07-11)

### Requirement: A single Path timeline row authors the morph

A selected `path` element SHALL show ONE additional property row — **Path** — in the timeline
(alongside its transform / path-style / filter rows), present ONLY for path elements. The row
SHALL carry the standard keyframe affordances: the add-keyframe diamond captures the EVALUATED
point set at the playhead (never the static base), diamonds select/drag/stack like every other
track, and each keyframe's outgoing easing is editable through the standard Keyframe Inspector
(named presets and the graphical cubic-bézier editor). Point edits in the path edit overlay SHALL
route track-aware exactly like transform: with NO path track the edit updates the element's
static points as today; with a track, the edit lands as a whole-shape snapshot keyframe at the
playhead — REPLACING the snapshot when a path keyframe sits on that frame, AUTO-RECORDING a new
keyframe otherwise — and the element's static points (and therefore its local space: size,
position, viewBox) stay unchanged. Anchor ids SHALL be preserved across keyframes by the edit
overlay so morphs stay matched. STRUCTURAL edits propagate per the structure-lock requirement
below. A STATIC resize (gizmo or Inspector W/H) of a path with a path track SHALL scale the
static points AND every snapshot uniformly, so all keyframes stay in the one local space.

#### Scenario: One Path row, path elements only

- **WHEN** the operator selects a path element / a non-path element
- **THEN** the timeline shows exactly one Path property row for the path (never one row per
  anchor) / no Path row for the non-path

#### Scenario: The diamond captures the evaluated snapshot

- **WHEN** the operator moves the playhead and clicks the Path row's add-keyframe diamond
- **THEN** a keyframe is created at that frame whose value is the full anchor snapshot as
  currently EVALUATED at the playhead (ids, x/y, handle deltas), inserted in ascending frame
  order

#### Scenario: Editing points at a new frame auto-records

- **WHEN** the Path property has a track, the playhead is at a frame with NO path keyframe, and
  the operator drags an anchor or handle in the edit overlay
- **THEN** a NEW keyframe with the edited whole-shape snapshot is recorded at that frame, other
  keyframes are untouched, and the element's static points are unchanged

#### Scenario: Editing on a keyframe's frame updates that keyframe

- **WHEN** the playhead sits exactly on an existing path keyframe and the operator edits points
- **THEN** THAT keyframe's snapshot is updated in place — no new keyframe, no static change

#### Scenario: The first edit without a track stays static

- **WHEN** a path has NO path track and the operator edits points
- **THEN** the static points update exactly as before D-110 (bbox reframe included) and no
  keyframe is created

#### Scenario: Scrubbing shows the morph while editing stays possible

- **WHEN** the operator scrubs between two path keyframes
- **THEN** the canvas shows the interpolated shape, and an edit at that frame starts from the
  interpolated snapshot (captured as the new keyframe's base)

#### Scenario: Easing edits apply to the path segment

- **WHEN** the operator selects a path keyframe and changes its outgoing easing to a preset or a
  custom bézier curve
- **THEN** scrubbing the segment shows the morph progressing along the eased curve — same
  behavior as a numeric track

### Requirement: A path's anchor set is invariant across its keyframes

A keyframed path's anchor SET (ids and count) SHALL be identical across the static base and
EVERY keyframe at all times (AE-style structure lock, owner decision 2026-07-11). SHAPE edits
(moving an anchor, dragging a handle) SHALL keep recording into the current frame's snapshot
only — that is the morph itself. STRUCTURAL edits SHALL propagate:

- **Insert** (Ctrl-click corner / Ctrl-drag smooth / the segment context menu's Add point / Add
  curve point): ONE new anchor with ONE shared new id is added to the static base and to EVERY
  keyframe, positioned on the CORRESPONDING segment of each point set at the SAME parametric t
  (each set's own cubic evaluated at t — the existing insert-on-segment placement math applied
  per set). A corner insert adds a handle-less corner everywhere; a Ctrl-DRAG smooth insert
  writes the SAME drag-defined mirrored handle deltas everywhere (what the operator shaped is
  what every keyframe gets); the menu's Add curve point derives tangent-aligned mirrored handles
  from EACH set's own local curve at t. Because the id is shared, the new anchor tweens
  correctly between keyframes — no pop.
- **Delete** (keyboard / context menu): the anchor id is removed from the static base and EVERY
  keyframe; deleting below 2 anchors still deletes the whole element.
- **Corner↔smooth toggle** (Alt-break): the `smooth` FLAG propagates to the static base and
  every keyframe (structure); the handle VALUES stay per-keyframe (shape).

After a structural edit the static base SHALL be re-normalized to the size==visualBBox
convention and every snapshot SHALL be shifted by the same local-frame delta, so all point sets
remain in the ONE local space and the render is unchanged at every frame. Consequence: adjacent
keyframes can never have mismatched anchor sets in Designer-authored scenes; the runtime's
hold/pop fallback and the `path-morph-anchor-mismatch` preflight warning remain ONLY as
defensive guards for hand-edited or legacy external input.

#### Scenario: Inserting a point adds it to every keyframe and it tweens

- **WHEN** a path has two path keyframes and the operator Ctrl-clicks a segment
- **THEN** one new anchor with one shared id exists in BOTH keyframes (and the static base),
  each positioned on that keyframe's own segment at the same parametric t, and scrubbing shows
  the new anchor tweening smoothly between its two positions — no hold, no pop, no preflight
  warning

#### Scenario: A smooth insert carries the dragged handles into every keyframe

- **WHEN** the operator Ctrl-drags on a segment of a keyframed path (smooth insert)
- **THEN** every keyframe's copy of the new anchor carries the same drag-defined mirrored
  handle deltas, and the interpolated shape at the playhead matches what the operator shaped
  during the drag

#### Scenario: Deleting a point removes it from every keyframe

- **WHEN** the operator deletes an anchor of a keyframed path (Delete key or context menu)
- **THEN** that anchor id is gone from the static base and every keyframe; the anchor sets
  still match; deleting below 2 anchors removes the whole element

#### Scenario: Shape edits still record only the current frame

- **WHEN** the operator moves an anchor or drags a handle (no structural change) on a keyframed
  path
- **THEN** only the current frame's snapshot is created/updated — every other keyframe's
  snapshot is untouched

#### Scenario: Alt-break propagates the flag, not the handles

- **WHEN** the operator Alt-drags a smooth anchor's handle on a keyframed path
- **THEN** the anchor's `smooth` flag becomes false in the static base and every keyframe,
  while each keyframe's handle VALUES keep their own (possibly different) deltas

### Requirement: Selection bounds follow the live morphed shape

For a path with a `path` track, the selection gizmo box and the Inspector W/H SHALL reflect the
ACTUAL interpolated outline at the current playhead frame: the curve-aware visual bounds of the
EVALUATED point set (including growth beyond and shrinkage below the static base bounds),
composed through the element's full Scale·Rotate-about-anchor transform — a rotated, morphing
path's box SHALL stay glued to the rendered shape. Resizing from the live box (gizmo drag or a
typed Inspector W/H value) SHALL scale the shape so the LIVE extent matches the gesture/typed
value (the uniform static+snapshot bake, expressed against the live bounds). ALL path
hit-testing and spatial targeting SHALL likewise use the EVALUATED point set at the current
frame — single-click selection, double-click-to-enter-point-edit, and the segment
affordances/hit-lines — over the same curve-aware flattened outline the static hit-test uses
(B-055), so a region the morph GREW into hits and a region it left does not. This liveness is
PATH-SPECIFIC (owner decision 2026-07-11): a path's shape itself changes over time, unlike a
scaled/moved rectangle whose local box is constant — other element kinds keep their existing
bounds behavior. The evaluation SHALL be cheap (once per rendered frame, not per anchor
listener) so scrubbing stays smooth.

#### Scenario: The box hugs the morph at mid-frames

- **WHEN** the operator scrubs between two path keyframes whose shapes differ in extent
- **THEN** the selection box and the Inspector W/H grow and shrink with the interpolated
  outline at every frame — never frozen at the static base bounds

#### Scenario: A rotated morphing path's box stays correct

- **WHEN** a path is rotated (and/or scaled) and its shape morphs between keyframes
- **THEN** the live box corners sit on the rotated, scaled, morphed outline's bounds at every
  frame (the same transform composition as the renderer)

#### Scenario: The grown region is clickable

- **WHEN** the playhead sits on a frame where the morph has grown beyond the base shape and the
  operator double-clicks (or single-clicks) a point inside the grown region but outside the
  base outline
- **THEN** the path is hit — the double-click enters point-edit mode and the single-click
  selects — because the hit region is the evaluated outline at that frame, not the static one

#### Scenario: Other element kinds are unaffected

- **WHEN** a rectangle/ellipse/text with animated position/scale/size is selected
- **THEN** its selection box and Inspector W/H behave exactly as before — the live-bounds rule
  applies only to keyframed paths
