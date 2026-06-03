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
Multiple points MAY therefore share a frame, and dragging *past* a point SHALL
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

