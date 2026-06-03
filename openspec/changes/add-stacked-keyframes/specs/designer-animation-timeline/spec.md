## ADDED Requirements

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
