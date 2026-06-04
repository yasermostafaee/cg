## ADDED Requirements

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
