# designer-animation-timeline Specification

## Purpose

TBD - created by archiving change add-scene-active-region. Update Purpose after archive.

## Requirements

### Requirement: Scene active region distinct from total frames

The scene SHALL carry an **active region** — a frame window used for playback,
export, and preview — that is distinct from the scene's **total** frame count.
The total is `scene.frameRange` (it drives the timeline ruler, gridlines, and
playhead scaling); the active region is `scene.activeRange` when present and
the full `scene.frameRange` when absent. The active region MUST satisfy
`frameRange.in ≤ activeRange.in ≤ activeRange.out ≤ frameRange.out` with
`activeRange.out > activeRange.in`. An absent `activeRange` MUST be treated
exactly as the full `frameRange`, so scenes authored before this change behave
unchanged.

#### Scenario: Absent active region means the full scene

- **WHEN** a scene has no `activeRange`
- **THEN** playback, export, and preview use the full `frameRange`, identical to
  the behavior before this change

#### Scenario: Active region is bounded by the total

- **WHEN** a scene defines an `activeRange`
- **THEN** `activeRange` lies within `frameRange` (`frameRange.in ≤
activeRange.in ≤ activeRange.out ≤ frameRange.out`) and spans at least one
  frame (`activeRange.out > activeRange.in`)

### Requirement: Resizing the scene bar narrows the active region, not the total

The timeline scene-duration bar's right gripper SHALL resize the active
region's out-point only. Dragging it SHALL move `activeRange.out` (clamped to
`[activeRange.in + 1, frameRange.out]`) and MUST NOT mutate `scene.frameRange`.
The ruler and gridlines SHALL keep spanning the full `frameRange` while the
gripper is dragged, so the total frame count and the trailing frames stay
visible.

#### Scenario: Dragging the gripper shortens the active region

- **WHEN** the operator drags the scene bar's right gripper from the scene end
  to an earlier frame N
- **THEN** `activeRange.out` becomes N and the scene bar visually ends at N

#### Scenario: The total frame count is preserved while resizing

- **WHEN** the operator drags the gripper to shorten the active region
- **THEN** `scene.frameRange.out` is unchanged, the ruler still shows the full
  frame count, and the frames between `activeRange.out` and `frameRange.out`
  remain visible

#### Scenario: The gripper cannot exceed the total

- **WHEN** the operator drags the gripper past the scene's last frame
- **THEN** `activeRange.out` is clamped to `frameRange.out` (growing the total
  is done through the Inspector Duration field, not the gripper)

### Requirement: Playback, export, and preview honor the active region

The Designer and runtime SHALL bound transport playback, looping frame steps,
export, and the live preview to the active region rather than the full
`frameRange`. Play SHALL advance the current frame at the scene's `frameRate`
and loop back to `activeRange.in` when it reaches `activeRange.out`. Export and
preview SHALL produce only the frames within the active region. Manual
scrubbing of the playhead SHALL remain free across the full `frameRange` so the
operator can still inspect the trailing frames.

#### Scenario: Play loops within the active region

- **WHEN** the active region is `[0, 30]` of a total `[0, 50]` scene and the
  operator clicks Play
- **THEN** the current frame advances and loops back to frame 0 when it reaches
  frame 30, never advancing past 30 during playback

#### Scenario: Export covers only the active region

- **WHEN** the active region is `[0, 30]` of a total `[0, 50]` scene and the
  scene is exported or previewed
- **THEN** only frames within `[0, 30]` are produced

#### Scenario: Scrubbing still reaches the trailing frames

- **WHEN** the active region is `[0, 30]` of a total `[0, 50]` scene and the
  operator drags the playhead onto frame 42
- **THEN** the playhead moves to frame 42 and the canvas shows that frame (the
  trailing region is inspectable even though playback does not enter it)

### Requirement: Trailing frames and their keyframes stay visible but inactive

The timeline SHALL render the region between `activeRange.out` and
`frameRange.out` in a visually de-emphasised (dimmed / hatched) and
non-interactive style. Keyframes that sit beyond `activeRange.out` SHALL remain
on their track lanes and SHALL NOT be deleted by a resize; they are simply
outside the played/exported window and have no effect on output until the
active region is widened again.

#### Scenario: Trailing region is dimmed and inactive

- **WHEN** the active region is shorter than the total
- **THEN** the timeline shows the `[activeRange.out, frameRange.out]` region in a
  dimmed/inactive style distinct from the active scene bar

#### Scenario: Keyframes beyond the active out-point are kept

- **WHEN** a track has a keyframe at frame 45 and the operator resizes the active
  region to `[0, 30]`
- **THEN** the keyframe at frame 45 still appears on its lane, is excluded from
  playback/export, and reappears in effect if the active region is widened back
  past frame 45

### Requirement: Changing the total clamps the active region

The Inspector's scene Duration field SHALL set the scene's **total** frame count
(`frameRange.out`). When the new total is smaller than the current
`activeRange.out` (or `activeRange.in`), the store SHALL clamp the active region
to stay within `[frameRange.in, frameRange.out]`.

#### Scenario: Shrinking the total clamps the active out-point

- **WHEN** the active region is `[0, 40]` and the operator sets the Duration
  field so the total becomes `[0, 30]`
- **THEN** `frameRange.out` becomes 30 and `activeRange.out` is clamped to 30

#### Scenario: Growing the total leaves the active region intact

- **WHEN** the active region is `[0, 30]` of a total `[0, 50]` scene and the
  operator increases the Duration so the total becomes `[0, 80]`
- **THEN** `frameRange.out` becomes 80 and `activeRange` stays `[0, 30]`

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

### Requirement: Keyframes carry a stable id

Every keyframe SHALL carry a stable `id`. The Designer SHALL assign an id to
each keyframe it creates, and SHALL assign ids to any keyframes that lack one
when a scene is loaded, so that the timeline can track and stack points. The id
is optional in the persisted schema so scenes authored before this field still
validate, and the runtime SHALL ignore it (playback depends only on frame,
value, and easing).

#### Scenario: New keyframes get an id

- **WHEN** the operator adds a keyframe
- **THEN** that keyframe has a non-empty `id` distinct from other keyframes'

#### Scenario: Legacy scenes are normalized on load

- **WHEN** a scene whose keyframes have no `id` is loaded
- **THEN** it validates and each keyframe is assigned an `id`, and playback is
  unchanged

### Requirement: Dragging a point onto another keeps both (stacking)

Dragging a framepoint along its track SHALL move that specific point (by id) to
the target frame WITHOUT deleting or displacing any point already on that frame.
Multiple points MAY therefore share a frame, and dragging _past_ a point SHALL
NOT remove it. A point that shares a frame with others SHALL be draggable back
off to a free frame, leaving the others in place.

#### Scenario: Drop onto an occupied frame keeps both

- **WHEN** the operator drags a point onto a frame that already holds a point
- **THEN** both points remain on that frame and neither value is lost

#### Scenario: Stacking more than two

- **WHEN** the operator drags additional points onto the same frame
- **THEN** all of them remain on that frame

#### Scenario: Dragging past a point does not delete it

- **WHEN** the operator drags a point across a frame occupied by another point
  and continues past it
- **THEN** the passed-over point is unchanged

#### Scenario: Unstacking

- **WHEN** the operator drags one of several points sharing a frame to a free
  frame
- **THEN** that point moves there and the remaining points stay on the original
  frame

### Requirement: Same-frame points render an instant step

The runtime SHALL render an instant jump when a track has two or more points on
the same frame with differing values — interpolating toward the first point's
value approaching the frame and snapping to the last point's value at and after
it — without error.

#### Scenario: Two values on one frame jump

- **WHEN** a numeric track has points `(frame 10 = 0)` and `(frame 10 = 100)` in
  that order, with a later point after frame 10
- **THEN** evaluating just before frame 10 trends toward 0 and evaluating at
  frame 10 yields 100, with no NaN or crash

### Requirement: Stacked points are visually distinguishable in the lane

The timeline lane SHALL render every keyframe (keyed by its id) and SHALL offset
points that share a frame so each is individually visible and clickable rather
than drawn exactly on top of one another.

#### Scenario: Stacked diamonds fan out

- **WHEN** two or more points share a frame on a track
- **THEN** their diamonds are drawn at distinct vertical offsets on that frame's
  column so each can be grabbed

### Requirement: Inspector controls reflect and commit the evaluated value at the current frame

For an animatable property, the inspector's property control SHALL DISPLAY the
**evaluated value at the current playhead frame** when the property has keyframes
(falling back to the element's static value when it has none), so the control stays
in lock-step with what the canvas renders — for numeric and colour properties
alike. Adding a keyframe via **any** add-keyframe diamond — both the inspector
property rows AND the timeline track rows — SHALL CAPTURE that same evaluated value
at the current frame (not the element's static base), for every value kind
(transform numbers, dimensions, opacity, colour); and editing a control's value
SHALL commit a keyframe at the current frame. This makes the inspector and timeline
consistent with the canvas drag path, which already samples the evaluated value.

#### Scenario: Diamond captures the evaluated value, not the static base

- **WHEN** a property has a keyframe at frame F1 holding value V, the playhead is at
  a later frame F2 with no keyframe there, and the operator clicks the property's
  add-keyframe diamond
- **THEN** a keyframe is added at F2 with value V (the evaluated value the field
  shows and the canvas renders), and the element does not jump to its static base
  value

#### Scenario: Timeline diamond captures the evaluated value for every value kind

- **WHEN** a keyframe at F1 holds a moved/edited value V for ANY animatable property
  kind (a transform number, a dimension, opacity, or a colour), the playhead is at a
  later frame F2, and the operator clicks that row's add-keyframe diamond in the
  timeline
- **THEN** the shared add-keyframe path adds a keyframe at F2 with the evaluated
  value V (not the property's stale static base), and the element does not jump —
  identically for numeric and colour value kinds

#### Scenario: Colour field display stays in sync with the shape

- **WHEN** a colour property is animated and the operator edits the colour at the
  current frame
- **THEN** the edit commits a keyframe at that frame AND the colour control's
  displayed value updates to the edited colour, so the control and the rendered
  shape stay in sync

### Requirement: Timeline dock with frame ruler and playhead

The Designer SHALL render an animation timeline dock below the canvas
whenever a scene is open. The dock SHALL show a frame ruler that spans
`scene.frameRange.in..frameRange.out` and a draggable playhead indicating
the current frame. Frame `frameRange.in` (typically frame 0) MUST visually
align with the left edge of every track row's keyframe lane — never with
the left edge of the dock — so that a keyframe diamond at frame N sits at
exactly the x-position the ruler labels as N.

#### Scenario: Dock appears when a scene is open

- **WHEN** a scene is open
- **THEN** the timeline dock is visible at the bottom of the Designer shell
  with a frame ruler covering the scene's frame range and the current frame
  shown at the playhead

#### Scenario: Frame 0 lines up with the keyframe lanes

- **WHEN** the dock is rendered with track rows
- **THEN** the ruler's `frameRange.in` tick sits at the same x-position as
  the left edge of every track row's lane (the label column sits to the
  ruler's left and contains no frame ticks)

#### Scenario: Operator scrubs the playhead

- **WHEN** the operator drags the playhead (or clicks somewhere on the ruler)
- **THEN** the Designer's current frame updates to the clicked frame and any
  subsequent "add keyframe" actions use that frame as the authoring position

### Requirement: Element tree with collapsible per-element track groups

The timeline dock SHALL render a tree of every element in the scene.
Each element SHALL appear as a header row containing a chevron (to
expand / collapse the element's track group), the element name, small
visibility / lock indicators, and a colored _lifespan bar_ spanning the
element's active frame range. Below the header — when expanded — the
dock SHALL show a nested `▾ TRANSFORM` group that, when also expanded,
renders eight property TrackRows (Position X, Position Y, Scale X,
Scale Y, Rotation, Width, Height, Opacity). The element row and its
TRANSFORM group MUST be independently collapsible.

#### Scenario: Each scene element shows in the timeline tree

- **WHEN** the scene has three elements (a shape, a text, and an image)
- **THEN** the timeline dock shows three element header rows, in order,
  each with its own chevron, name, indicators, and lifespan bar

#### Scenario: Expanding an element shows its TRANSFORM group + property tracks

- **WHEN** the operator clicks the chevron on an element header row that
  was collapsed
- **THEN** a `▾ TRANSFORM` group appears below it, and inside that group
  eight property TrackRows render (Position X, Position Y, Scale X,
  Scale Y, Rotation, Width, Height, Opacity) — each with the row's
  current value and a keyframe indicator on the left, and the lane
  with any existing keyframe diamonds on the right

#### Scenario: Clicking an element header selects it

- **WHEN** the operator clicks an element row (not its chevron)
- **THEN** that element becomes the canvas selection and the right
  Inspector switches to its Element view

#### Scenario: Existing keyframes render on their tracks

- **WHEN** an element has keyframes on one or more tracks
- **THEN** each keyframe is drawn as a diamond marker on its track row at
  the x-position corresponding to its frame

### Requirement: Add a keyframe at the current frame

The Designer SHALL let the operator add a keyframe at the current playhead
frame on any of the eight animatable properties of the selected element. The
new keyframe's value SHALL be the element's current value for that property,
and it SHALL be inserted into `element.animation.tracks[property].keyframes`
in ascending frame order. If a keyframe already exists at the same frame on
the same track, the existing keyframe's value SHALL be overwritten with the
current value (no duplicate keyframes).

#### Scenario: Operator adds a keyframe on a new track

- **WHEN** the operator selects a shape, moves the playhead to frame N, and
  clicks the add-keyframe button on the Position X row
- **THEN** the element's `animation.tracks['position.x']` is created with a
  single keyframe at frame N whose value equals the element's current
  `transform.position.x`

#### Scenario: Operator adds a keyframe at a frame that already has one

- **WHEN** a track for the property already has a keyframe at the current
  frame and the operator clicks the add-keyframe button again
- **THEN** the existing keyframe's value is replaced by the element's current
  value at that frame (no duplicate is added)

### Requirement: Move and delete keyframes

The Designer SHALL let the operator drag a keyframe along its track to
change its frame and SHALL let the operator delete the selected keyframe
with `Delete` or `Backspace`. Deleting the last keyframe in a track SHALL
remove the track entry from `element.animation.tracks` so empty arrays do
not persist.

#### Scenario: Operator drags a keyframe to a new frame

- **WHEN** the operator drags a keyframe diamond from frame N to frame M
- **THEN** the keyframe's `frame` field becomes M and the track's keyframes
  are kept sorted by ascending `frame`

#### Scenario: Operator deletes the only keyframe on a track

- **WHEN** the operator selects the only keyframe on a track and presses
  `Delete`
- **THEN** the keyframe is removed and the property's entry is removed from
  `element.animation.tracks`

### Requirement: Track-aware editing builds the animation

The Designer SHALL route every value edit on the eight animatable
properties (made through the Inspector, the canvas Gizmo, or a drag on the
canvas) based on whether a track already exists for that property on the
selected element:

- WHEN the property has **no** track yet — the edit SHALL update the
  element's static value as before; no keyframe is created.
- WHEN the property already has a track (the operator has added at least
  one keyframe for it) — the edit SHALL land as a keyframe at the current
  playhead frame: replacing the keyframe on that frame if one already
  exists there, or inserting a new keyframe at that frame otherwise. The
  element's static value SHALL remain unchanged once a track exists.

This rule is what builds the animation: after the operator authors the
first keyframe by hand, every subsequent edit at a new frame extends the
track instead of overwriting a single static value.

#### Scenario: First edit on a never-animated property updates the static value

- **WHEN** the playhead is at frame N and the selected element has no
  track for `position.x`, and the operator edits Position X
- **THEN** the element's static `transform.position.x` is updated as before
  and no keyframe is created

#### Scenario: Edit at an existing keyframe replaces that keyframe's value

- **WHEN** the playhead is at frame N, the selected element has a keyframe
  at frame N on `position.x`, and the operator edits Position X
- **THEN** that keyframe's `value` is updated to the new number, no
  keyframe is added or moved, and the element's static
  `transform.position.x` is unchanged

#### Scenario: Edit at a new frame on an animated property auto-adds a keyframe

- **WHEN** the operator first adds a `position.x` keyframe at frame 10 by
  clicking the add-keyframe button, then scrubs to frame 30 and drags the
  shape (or types a new value into Inspector → Position X)
- **THEN** a new keyframe is inserted at frame 30 on the `position.x`
  track with the new value, the keyframe at frame 10 is left unchanged,
  and the element's static `transform.position.x` is unchanged

### Requirement: Single-click vs double-click on a keyframe diamond

A single-click on a keyframe diamond in the timeline lane SHALL select
the point and scrub the playhead to its frame, but MUST keep the right
Inspector on the Element view — only the diamond glyph, the matching
indicator next to the track label, and the matching indicator on the
right Inspector's row turn yellow. The operator SHALL open the dedicated
Keyframe Inspector by **double-clicking** the diamond (or by an explicit
"edit point" action). Closing the Keyframe Inspector SHALL preserve the
selection so the yellow indicators stay lit.

#### Scenario: Single-click selects without changing the right panel

- **WHEN** the operator single-clicks a keyframe diamond on the Position
  X row
- **THEN** the diamond turns yellow, the matching indicator in the
  TrackRow label column turns yellow, the matching diamond on the right
  Inspector's Position row turns yellow, the playhead scrubs to that
  frame, and the right Inspector keeps showing the Element view (the
  Keyframe Inspector does not open)

#### Scenario: Double-click opens the dedicated Keyframe Inspector

- **WHEN** the operator double-clicks a keyframe diamond
- **THEN** the right Inspector switches to a Keyframe Inspector for that
  point, showing the element name, property, frame, value, and easing,
  and exposing a "back" affordance that closes it without dropping the
  selection

#### Scenario: Editing the keyframe inspector mutates only that keyframe

- **WHEN** the Keyframe Inspector is shown and the operator types a new
  value or changes the easing
- **THEN** only the selected keyframe's `value` / `easing` change; other
  keyframes on the track are left untouched

#### Scenario: Inspector returns to the Element view on close

- **WHEN** the Keyframe Inspector is open and the operator clicks its
  back affordance (or removes the keyframe, or selects a different
  element)
- **THEN** the Inspector falls back to the Element / Scene view; the
  selection is preserved when the operator just clicked "back"

### Requirement: Per-property keyframe indicators in the right Inspector

The Element Inspector SHALL render a small diamond indicator next to
each of the eight animatable rows (Position, Size, Scale, Rotation,
Opacity). The indicator SHALL reflect the row's track / keyframe state:
empty outline (no track), filled accent (track exists, no keyframe at
the current frame), highlighted accent (keyframe at the current frame),
or yellow (the keyframe at the current frame is the currently-selected
point). Clicking the indicator SHALL toggle a keyframe at the current
frame on that property.

#### Scenario: Indicator state mirrors the track

- **WHEN** an element has no track on `opacity`
- **THEN** the opacity row in the Inspector shows an empty/outlined
  indicator, and the matching TrackRow label indicator shows the same
  state

#### Scenario: Indicator turns yellow when its keyframe is selected

- **WHEN** the operator single-clicks a keyframe diamond on the Width
  track
- **THEN** the Inspector's Size-row indicator (which covers both Width
  and Height) renders in the selected-yellow style at the same time as
  the TrackRow label indicator

#### Scenario: Click the indicator to add a keyframe

- **WHEN** the operator clicks the indicator next to Rotation in the
  Inspector while the playhead is at frame N and no keyframe is there
- **THEN** a keyframe is added on `rotation` at frame N with the
  element's current rotation value, the indicator becomes selected, and
  a diamond appears on the timeline's Rotation lane at the matching
  x-position

#### Scenario: Click the indicator on an existing keyframe to remove it

- **WHEN** the operator clicks the indicator next to Rotation while a
  keyframe for `rotation` sits on the current frame
- **THEN** that keyframe is removed; if it was the last keyframe on the
  track, the track is pruned

### Requirement: Transport controls (play, pause, step, stop)

The timeline dock SHALL provide transport controls — play/pause, stop, step
forward, step back — that advance or rewind the Designer's current frame.
Play SHALL advance the current frame at the scene's `frameRate` and loop
back to `frameRange.in` when it reaches `frameRange.out`; Stop SHALL halt
playback at the current frame.

#### Scenario: Operator plays the animation

- **WHEN** the operator clicks Play
- **THEN** the Designer's current frame advances at the scene's frame rate,
  looping at `frameRange.out` back to `frameRange.in`, and the timeline's
  playhead visibly moves with it

#### Scenario: Operator steps frame-by-frame

- **WHEN** the operator clicks Step Forward
- **THEN** the current frame advances by exactly 1 (clamped to
  `frameRange.out`); Step Back decrements by 1 (clamped to `frameRange.in`)

#### Scenario: Operator stops playback

- **WHEN** playback is running and the operator clicks Stop
- **THEN** the current frame stops advancing and remains at the last value
  reached

### Requirement: Click to open the Keyframe Inspector

The Designer SHALL open the Keyframe Inspector on a single click of a keyframe
point or of the interpolation segment between two points (the segment opens its
start point). A double-click SHALL NOT be required. Clicking a point SHALL also
scrub the playhead to it.

#### Scenario: Single click opens the inspector

- **WHEN** the operator clicks a keyframe point
- **THEN** the Keyframe Inspector opens for that point and the playhead scrubs
  to its frame

#### Scenario: Clicking a segment opens its start point

- **WHEN** the operator clicks the line between two points
- **THEN** the Keyframe Inspector opens for the segment's start (left) point

### Requirement: Multi-select keyframes for shared easing

The Designer SHALL let the operator select multiple keyframes by Shift/Ctrl/Cmd-
clicking points (toggling each in the selection), and SHALL highlight every
selected point on the timeline. When more than one point is selected, the
Keyframe Inspector SHALL hide the per-point frame, value, and property fields and
show only the easing editor; applying an easing change SHALL set it on every
selected point. The remove action SHALL be labelled "Remove keyframes" and SHALL
remove all of them. Pressing Delete SHALL remove every selected point.

#### Scenario: Shift-click accumulates a multi-selection

- **WHEN** the operator clicks one point, then Shift-clicks another
- **THEN** both points are selected and highlighted

#### Scenario: Multi-select inspector shows only shared easing

- **WHEN** two or more points are selected
- **THEN** the inspector hides frame/value/property and shows the easing editor
  plus a "Remove keyframes" button

#### Scenario: Easing change applies to all selected

- **WHEN** several points are selected and the operator changes the easing curve
- **THEN** every selected point receives that curve

#### Scenario: Delete removes all selected

- **WHEN** several points are selected and the operator presses Delete
- **THEN** all of them are removed

#### Scenario: Mixed easings show a warning

- **WHEN** the selected points do not all share the same easing curve
- **THEN** the inspector shows a warning ("There are multiple different easings
  selected") and the curve editor shows a neutral line until the operator picks
  one, which then applies to all

### Requirement: Per-keyframe cubic-bézier easing

The runtime SHALL support an optional custom cubic-bézier easing
`[x1, y1, x2, y2]` on a keyframe. When set, the runtime and the Designer's
preview SHALL ease the keyframe's outgoing segment through that curve; when
absent they SHALL use the keyframe's named `easing` (`step` always snaps). The
bézier's time components (x1, x2) SHALL be clamped to [0, 1]. Scenes authored
before this field SHALL remain valid and play unchanged.

#### Scenario: A custom curve drives interpolation

- **WHEN** a keyframe has `bezier = [0.42, 0, 0.58, 1]` and the playhead is in
  its outgoing segment
- **THEN** the interpolated value follows that ease-in-out curve, matching the
  canvas and the exported output

#### Scenario: No bézier falls back to the named easing

- **WHEN** a keyframe has no `bezier`
- **THEN** interpolation uses its named `easing` exactly as before

### Requirement: Graphical easing editor in the Keyframe Inspector

The Keyframe Inspector SHALL keep the element, property, frame, and value fields,
and SHALL present the easing as a **Keyframe interpolation** editor: a Preset
dropdown (Linear, Ease In, Ease Out, Ease In-Out, Sine, Custom), a curve graph
(progress vs. time) showing the bézier with two draggable control handles, and
editable P1 and P2 X/Y fields. Choosing a preset SHALL set the curve and control
points; dragging a handle or editing a P1/P2 field SHALL update the curve and
SHALL show "Custom" when the curve no longer matches a preset.

#### Scenario: Choosing a preset

- **WHEN** the operator selects the "Sine" preset
- **THEN** the curve and P1/P2 fields update to the sine control points and the
  keyframe eases through that curve

#### Scenario: Dragging a control handle

- **WHEN** the operator drags the P1 handle on the curve graph
- **THEN** the curve and the P1 X/Y fields update, the preset shows "Custom",
  and the keyframe's easing follows the new curve

#### Scenario: Editing a control-point field

- **WHEN** the operator types a new P2 X value
- **THEN** the handle and curve move accordingly (the X value clamped to [0, 1])

### Requirement: Delete/Backspace removes the selection (keyframe precedence)

Pressing **Delete** or **Backspace** SHALL remove the current selection, handled
globally so it works whether focus is on the canvas or the timeline. Because
clicking a keyframe selects **both** the keyframe and its parent layer/shape, the
key SHALL apply a precedence: when **any** keyframe is selected it SHALL delete
**all** selected keyframes and leave the layer/shape; only when **no** keyframe is
selected SHALL it delete **all** selected layers/shapes. The key SHALL be ignored
when an editable field is focused (`input` / `textarea` / `select` /
contentEditable), so typing Delete in a field never deletes a layer. The deletion
SHALL be undoable as a single step, and SHALL be a no-op when nothing is selected.

#### Scenario: Keyframe selected → the keyframe is deleted, not the layer

- **WHEN** a keyframe is selected (which also selects its parent layer/shape) and
  the operator presses Delete or Backspace
- **THEN** the selected keyframe is removed and the parent layer/shape remains

#### Scenario: No keyframe selected → the selected layer/shape is deleted

- **WHEN** a layer/shape is selected, no keyframe is selected, and the operator
  presses Delete or Backspace
- **THEN** the selected layer/shape is removed

#### Scenario: Multi-select deletes all of the prioritised kind

- **WHEN** several keyframes are selected and Delete is pressed
- **THEN** all selected keyframes are removed; **and WHEN** instead several
  layers/shapes are selected with no keyframe selected
- **THEN** all selected layers/shapes are removed

#### Scenario: Editable field focused → nothing is deleted

- **WHEN** an `input` / `textarea` / `select` / contentEditable element is focused
  and the operator presses Delete or Backspace
- **THEN** no layer/shape or keyframe is deleted (the keypress edits the field)

#### Scenario: Delete is a single undo step

- **WHEN** a Delete removes one or more keyframes (or layers/shapes)
- **THEN** a single undo restores everything that delete removed

### Requirement: Reorder layers by dragging a timeline row

Dragging a timeline layer row up or down by its name region SHALL reorder that element within its sibling set, changing the z-stack so the displayed top→bottom order maps to descending `zIndex` (the top row is front-most). The gesture is pointer-based (no drag-and-drop library), matching the existing keyframe / lifespan drags: a pointer movement below a small threshold (~4px) leaves the existing click-to-select behavior intact, and only past the threshold does a reorder drag begin (capturing the pointer). While dragging, a horizontal drop-indicator line SHALL be shown at the target gap (above or below the hovered row), visible only during an active drag. On release, when the target position differs from the origin the element SHALL be moved and its sibling set's `zIndex` renumbered (as one undo entry); a release at the origin position SHALL be a no-op. The reorder is confined to the dragged element's own sibling set — it MUST NOT move an element across layers or into/out of a container. Both the canvas and timeline derive from the same element list, so the reorder is reflected in both.

#### Scenario: Dragging a row to a new position changes the z-stack

- **WHEN** the operator drags a layer row past the start threshold and releases it over a different gap in the list
- **THEN** the element moves to that position in the top→bottom order and the sibling set's `zIndex` is renumbered so the top row has the highest `zIndex` (front-most) and the bottom row the lowest, and the rendered paint order (children sorted ascending by `zIndex`) matches the new order

#### Scenario: A horizontal drop indicator marks the target gap

- **WHEN** a reorder drag is active
- **THEN** a horizontal indicator line is shown at the gap where the row would drop (above or below the hovered row), and it is hidden when no drag is active

#### Scenario: Below-threshold press still selects

- **WHEN** the operator presses a layer row's name and releases without moving past the start threshold
- **THEN** no reorder happens and the row's normal click-to-select behavior stands

#### Scenario: Dropping at the origin is a no-op

- **WHEN** the operator drags a row and releases it at its original position
- **THEN** nothing changes — no reorder, no `zIndex` change, and no undo entry is added

#### Scenario: A single undo reverts the reorder

- **WHEN** a reorder has been applied
- **THEN** one undo restores the previous order and `zIndex` values

#### Scenario: Reorder stays within the sibling set

- **WHEN** the operator drags a row toward a position that would fall outside its own sibling set (another layer or another container's children)
- **THEN** the element is reordered only within its own siblings (clamped to that set) and is never moved across layers or into/out of a container
