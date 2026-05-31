## ADDED Requirements

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

### Requirement: Per-property track rows for the selected element

The timeline dock SHALL show one track row per animatable property for the
selected element. The property set SHALL be the eight M12 numeric properties:
Position X, Position Y, Scale X, Scale Y, Rotation, Width, Height, Opacity.
Each row SHALL include an "add keyframe" affordance and SHALL display every
keyframe currently on that track as a diamond marker positioned by frame.

#### Scenario: Operator selects a shape
- **WHEN** the operator selects a single shape on the canvas
- **THEN** the timeline dock shows eight track rows (Position X, Position Y,
  Scale X, Scale Y, Rotation, Width, Height, Opacity) for that shape with an
  add-keyframe button on each row

#### Scenario: Existing keyframes render on their tracks
- **WHEN** a selected element already has keyframes on one or more tracks
- **THEN** each keyframe is drawn as a diamond marker on its track row at
  the x-position corresponding to its frame

#### Scenario: Selection is empty or multi
- **WHEN** the operator has zero or more than one element selected
- **THEN** the timeline dock shows the ruler and transport but an empty hint
  in the track area ("Select a single element to add keyframes")

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
