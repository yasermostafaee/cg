# Change: move Hold behaviour to the composition

## Why

Freeze/Loop is currently expressed on individual media while native composition animation also has
its own Hold loop. That creates two authoring surfaces and, more importantly, one looping root
playhead rewinds every native element even when only one should repeat. Mixed Hold playback needs a
composition-owned policy with independent element clocks.

## What changes

- Playback owns one Freeze/Loop-middle choice for the composition.
- Freeze parks every element and the root cursor on the composition Out point; no media-specific
  Freeze-frame value may choose another picture.
- Loop middle exposes a checklist of repeat participants.
- Checked elements follow the looping Middle cursor.
- Unchecked animated elements and media advance once to their end on a local clock.
- Content-driver clocks remain independent and are not restarted at a loop seam.
- Automatic content-driven completion drains the Middle pass currently on screen to Out point,
  then continues into Outro; operator Stop remains immediate.
- Video/Lottie On hold selectors and the Follow-Video Freeze-frame override are removed; legacy
  stored values remain parseable but inert.

## Impact

- Shared scene schema and Designer persistence
- Designer Playback and media Inspector surfaces
- Template runtime controller, native animation application, Video and Lottie drivers
- Preview telemetry and lifecycle tests
- PRD D-187
