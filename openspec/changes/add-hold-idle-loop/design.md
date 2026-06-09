## Decisions

- **Idle loop is a replayed tail, not a skipped gap.** The loop segment
  `[holdLoopStart → outPoint]` is the end of the entrance: it plays once in full as
  part of `play()`, then repeats during hold. This is the key difference from the
  removed two-marker model (intro-end → outro-start), whose middle was never
  played. So this adds the second marker back _safely_ — as a loop-back point
  inside the played range, not a skip.
- **Opt-in; default stays one marker.** Absent `holdLoopStart`, behavior is
  identical to the single-marker frozen hold. Most templates set nothing.
- **Reuse the existing loop driver.** The `FrameDriver` already has a loop mode
  (today's behavior); bound it to `[holdLoopStart → outPoint]` for the idle loop
  rather than writing a new loop path.
- **Author a seamless cycle.** For a clean loop, the keyframe state at
  `holdLoopStart` should match the state at `outPoint`; otherwise each loop shows a
  jump. This is an authoring guideline (surface a hint in the UI), not enforced.
- **Export is metadata-only.** The scene (with `holdLoopStart`) is already inlined
  into the single-file export, so the runtime executes it; the only export work is
  surfacing `holdLoopStart` in the discoverable metadata block.

## Risks

- **Seam jump.** A non-seamless idle segment loops visibly. Mitigation: authoring
  hint; optionally a future "ping-pong" loop option (out of scope here).
- **Interaction with `loop-cycle`.** Two nested repetitions exist — the idle loop
  (within a hold) and the whole-template `loop-cycle`. The idle loop runs _during_
  each cycle's hold and must end cleanly when that cycle's exit begins. Covered by
  a compose test.
- **Marker ordering in the UI.** `holdLoopStart` must stay `≤ outPoint`; enforce in
  the timeline drag (reuse D-020's marker-invariant handling).
