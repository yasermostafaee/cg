# designer-path-element (D-110 delta)

## MODIFIED Requirements

### Requirement: Transform / opacity / filter / stroke animate like a shape

A path's transform / opacity / filter / stroke SHALL keyframe exactly like a rectangle or ellipse
(same timeline rows, same diamonds, same gizmo). The point set SHALL additionally be keyframe-able
as a whole through the single **Path** property track (D-110) — per-anchor tracks SHALL NOT exist.

#### Scenario: Box-style + transform properties animate

- **WHEN** a path's transform / opacity / filter / stroke is keyframed
- **THEN** it animates like a shape, independently of (and combinable with) the Path shape track

## ADDED Requirements

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
