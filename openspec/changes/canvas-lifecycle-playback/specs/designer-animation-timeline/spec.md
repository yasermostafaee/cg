# designer-animation-timeline — delta (D-175)

## MODIFIED Requirements

### Requirement: Playback, export, and preview honor the active region

The Designer and runtime SHALL bound lifecycle playback, explicit playhead-only transport,
export, and live preview to the active region rather than the full `frameRange`. Ordinary forward
Play SHALL run the composition lifecycle inside that region. When the operator explicitly enables
Preview loop or ping-pong, or starts reverse playback, the authoring playhead SHALL move at the
scene's `frameRate` and wrap / reverse at the active-region bounds. Export and preview SHALL
produce only frames within the active region. Manual scrubbing SHALL remain free across the full
`frameRange` so the trailing region stays inspectable.

#### Scenario: Ordinary Play follows lifecycle boundaries inside the active region

- **WHEN** the active region is `[0, 30]` of a total `[0, 50]` scene and the operator clicks Play
  with Preview loop and ping-pong off
- **THEN** the runtime plays the authored intro / hold / outro within `[0, 30]` and never advances
  the lifecycle into the trailing frames

#### Scenario: Explicit Preview loop wraps within the active region

- **WHEN** the active region is `[0, 30]` of a total `[0, 50]` scene and Preview loop is enabled
- **THEN** the playhead advances and wraps to frame 0 at frame 30 without starting content drivers

#### Scenario: Export covers only the active region

- **WHEN** the active region is `[0, 30]` of a total `[0, 50]` scene and the scene is exported or
  previewed
- **THEN** only frames within `[0, 30]` are produced

#### Scenario: Scrubbing still reaches the trailing frames

- **WHEN** the active region is `[0, 30]` of a total `[0, 50]` scene and the operator drags the
  playhead onto frame 42
- **THEN** the playhead moves to frame 42 and the canvas shows that frame

### Requirement: The canvas renders frame-mapped media under scrub and both playback paths

The Designer canvas SHALL render each Lottie and video through its authored phase mapping. Under
manual scrub and the explicit playhead-only modes (reverse, Preview loop, ping-pong), the host SHALL
position media through `runtime.tick(frame)`. Under ordinary forward Play, the real runtime
lifecycle SHALL drive the same media and SHALL report its root frame to the Designer playhead.
Runtime-owned frame reports SHALL NOT be fed back into `runtime.tick`.

Every Lottie and video SHALL remain visible according to its mapping regardless of `drivesHold`.
At rest, the composition in-point SHALL show the mapped first frame, not a substituted poster. A
clip with no own outro SHALL keep its settled frame through the composition outro.

#### Scenario: Scrubbing positions mapped media

- **WHEN** the operator scrubs to frame N
- **THEN** each Lottie and video shows the clip position mapped to frame N

#### Scenario: Ordinary Play uses the real media lifecycle

- **WHEN** the operator presses ordinary forward Play
- **THEN** each Lottie and video runs through its runtime intro / hold / outro path and the visible
  playhead follows the root lifecycle frame

#### Scenario: Explicit playhead-only playback positions media

- **WHEN** reverse, Preview loop or ping-pong moves the playhead
- **THEN** each Lottie and video is positioned by the same frame mapping used by scrub

#### Scenario: Runtime frame feedback is inert

- **WHEN** a lifecycle-owned root frame updates the Designer playhead
- **THEN** that update does not issue a positioning tick back into the active runtime

### Requirement: Playhead-only video positioning stays paused; lifecycle video uses its real driver

During scrub, reverse, Preview loop and ping-pong, the canvas SHALL position a video by setting
`currentTime` on a paused element. A seek arriving while another seek is in flight SHALL be skipped.
Direction SHALL use the same positioning mechanism. During ordinary forward lifecycle Play, the
video SHALL instead use the runtime's real video driver so canvas and Preview share phase timing.

#### Scenario: Playhead-only video is positioned, not played

- **WHEN** scrub, reverse, Preview loop or ping-pong moves over a video
- **THEN** the video remains paused and its `currentTime` is positioned per tick

#### Scenario: Lifecycle Play uses the runtime video path

- **WHEN** ordinary forward Play starts on a canvas containing video
- **THEN** the runtime video driver owns intro, hold and outro exactly as in Preview

#### Scenario: A seek in flight is skipped

- **WHEN** a playhead-only tick arrives while a prior seek is settling
- **THEN** no additional seek is queued

### Requirement: Ticker, sequence and clock are time-driven only during lifecycle playback

A ticker, sequence and clock SHALL ignore manual scrub and every playhead-only authoring mode.
During ordinary forward Play they SHALL run on their real clocks through the same runtime lifecycle
used by Preview. They SHALL start at their authored lifecycle boundary, participate in a selected
content-driven hold, pause / resume with the lifecycle and reset only on a fresh lifecycle Play.

#### Scenario: Content ignores scrub and playhead-only modes

- **WHEN** the operator scrubs, reverses, enables Preview loop or enables ping-pong
- **THEN** ticker, sequence and clock drivers are not started or reset by those frame movements

#### Scenario: Content runs during ordinary canvas Play

- **WHEN** the operator presses ordinary forward Play
- **THEN** ticker, sequence and clock elements run on real time at the same lifecycle boundaries as
  dedicated Preview
