# designer-animation-timeline — delta (D-135 design phase, 2026-08-12)

Encodes what the PLAYHEAD DRIVES on the canvas, and what deliberately does not follow it.
Implementation is a later PR, gated on `design.md` §9 — see this change's `tasks.md` §0.

## ADDED Requirements

### Requirement: The canvas renders frame-mapped media at the playhead, under scrub AND play alike

The Designer canvas SHALL render each **Lottie** and each **video** element at the frame
corresponding to the playhead, through that element's phase mapping where one is set. This SHALL
hold under BOTH ways the playhead moves — dragging it (scrub) and timeline PLAY — and the two SHALL
be the SAME mechanism rather than two paths that agree by inspection.

The canvas is an iframe hosting `@cg/template-runtime`, and the playhead reaches it as exactly one
message (`{ action: 'scrub', frame }` → `runtime.tick(frame)`). Timeline PLAY is a STREAM of that
same message, because the transport advances the store's `currentFrame` and nothing else. The
requirement is therefore a requirement about `tick(frame)`: it SHALL position the frame-mapped
drivers, which today it does not — it reaches keyframed properties, stamped repeater rows and
lifespan gates only.

When the playhead is outside an element's timeline span the canvas SHALL show that element's
resting state consistently with today's rules, under scrub and under play alike.

#### Scenario: Scrubbing moves a Lottie to the frame under the playhead

- **WHEN** a composition contains a Lottie element and the operator drags the playhead to frame N
- **THEN** the canvas shows that Lottie at the clip frame its phase mapping assigns to composition
  frame N

#### Scenario: Timeline PLAY animates a Lottie on the canvas

- **WHEN** the operator presses PLAY on the timeline
- **THEN** each Lottie element on the canvas renders its motion live, advancing with the playhead
  through the SAME frame↔time mapping the scrub case uses

#### Scenario: Scrubbing moves a video to the frame under the playhead

- **WHEN** a composition contains a video element and the operator drags the playhead to frame N
- **THEN** the canvas shows that video positioned at the clip time its phase mapping assigns to
  composition frame N

#### Scenario: Timeline PLAY advances a video on the canvas

- **WHEN** the operator presses PLAY on the timeline
- **THEN** each video element on the canvas advances with the playhead by the same mapping

#### Scenario: Outside its span, an element keeps its resting state under play too

- **WHEN** the playhead is outside a Lottie's or a video's timeline span, under scrub or under play
- **THEN** the canvas shows that element's resting state, exactly as it does today under scrub

### Requirement: The canvas positions a video by `currentTime`; it never lets the element play itself

The canvas SHALL drive a `<video>` by **setting `currentTime` on a PAUSED element**, once per
playhead tick. It SHALL NOT call `play()` on a canvas element and re-anchor it against a clock.

This is required rather than preferred, because the alternative cannot express the shipped
transport. The Designer transport plays BACKWARD (the `J` key) and BOUNCES (reversing direction at
every boundary), and a `<video>` cannot do either — `playbackRate` must be positive. A design that
lets the element advance itself has no behaviour at all for two of the three shipped transport
modes. It is also what keeps scrub and play the same call.

A tick that finds a seek still in flight SHALL **skip** rather than queue another, reusing the
existing seek-in-flight guard. The canvas therefore shows the NEAREST DECODABLE frame rather than
every frame, and this is the specified contract, not a degradation: **canvas video is not
frame-accurate during playback and will visibly drop frames under decoder pressure.** The Preview
keeps the real driver path and remains the frame-true rendition.

The element node SHALL be resolved through the driver's `live()` re-resolution on every access, and
never through a reference captured at build time. The canvas is a second host that reparents
`<video>` nodes across a scene rebuild, which is exactly the shape of B-137 — a healthy driver
commanding a detached orphan while the viewer watches a frozen picture.

#### Scenario: A canvas video is paused and positioned, not playing

- **WHEN** the operator presses PLAY on the timeline with a video element on the canvas
- **THEN** the `<video>` element remains paused and its `currentTime` is set per tick
- **AND** no `play()` call is made on the canvas element

#### Scenario: A seek in flight is skipped, not queued

- **WHEN** a playhead tick arrives while the canvas video is still settling a previous seek
- **THEN** that tick issues no new seek, and the canvas keeps showing the frame it has

#### Scenario: A reparented node is re-resolved, not commanded detached

- **WHEN** the canvas rebuilds the scene and the host transplants the live `<video>` node
- **THEN** the next playhead tick positions the node that is IN THE DOCUMENT, not the one captured
  when the driver was built

### Requirement: Ticker, sequence and clock stay time-driven and do NOT follow the playhead

A **ticker**, a **sequence** and a **clock** SHALL remain deliberately time-driven and SHALL NOT
follow the playhead — under scrub and under PLAY alike. This carve-out is stated as its own
requirement rather than as a note on the one above, because it is the kind of rule that erodes: a
later change extending the playhead to "all content elements" would break it in one line while
believing it was completing this feature.

The reason is that the carve-out is not an inconsistency. A Lottie and a video have a
DETERMINISTIC frame↔time mapping — frame N of the clip is a fact. A ticker's crawl position, a
sequence's step and a wall clock's time are functions of REAL time, not of composition frame: there
is no frame N to show, and an invented mapping would disagree with what goes on air.

#### Scenario: A ticker ignores the playhead under scrub

- **WHEN** a composition contains a ticker and the operator drags the playhead
- **THEN** the ticker's crawl position is unaffected by the playhead

#### Scenario: A ticker ignores the playhead under PLAY

- **WHEN** the operator presses PLAY on the timeline with a ticker on the scene
- **THEN** the ticker keeps running on real time and does not advance or reset with the playhead

#### Scenario: A sequence and a clock are unaffected by either half

- **WHEN** a sequence or a clock is on the scene, under scrub or under play
- **THEN** neither follows the playhead
