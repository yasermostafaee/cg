## Decisions

- **New capability, phases inside `activeRange`.** `designer-animation-timeline`
  owns `frameRange`/`activeRange` and keyframes and is left untouched. The
  lifecycle capability adds `introEndFrame`/`outroStartFrame` **within** the
  active region, so the active region remains the outer playable window and the
  two specs compose.
- **Hold = the held intro-end frame.** For v1 the HOLD is simply the frame held at
  `introEndFrame`. Frames between `introEndFrame` and `outroStartFrame` are an
  optional idle/loop segment — defer unless cheap; most templates will set
  `introEndFrame == outroStartFrame`.
- **Self-running timing, operator does on/off.** `auto-out` and `loop-cycle` run
  inside the runtime from the `playout` config (like Loopic's crawler self-loop,
  but declarative and no-code). The operator never schedules cycles; a looping
  logo just loops once played.
- **Replace the unconditional loop.** `FrameDriver` currently maps elapsed time to
  `range.in + (frames % span)` — an infinite loop. Change it to play a sub-range
  once and stop at its end (for IN→hold and for OUT), and add a cycle orchestrator
  for `loop-cycle`. The old continuous-loop behavior remains available for a
  genuinely looping background (e.g. a `manual` composition with no outro), but is
  no longer the default for templates with lifecycle phases.
- **`content-driven` is declared here, computed by the ticker.** The mode and the
  orchestrator hook exist now; the width→duration computation lands with the
  ticker item so this change stays the generic foundation.
- **Outro duration is exported** so the control layer can later schedule a precise
  timed auto-out (the old "pause before the out-animation, stop at the scheduled
  time" behavior) without re-deriving it.

## Risks

- **Backward compatibility.** Existing scenes have no `lifecycle`/`playout`; they
  must behave exactly as before (full active region, current driver behavior).
  Covered by an "absent lifecycle" test.
- **Pause on air.** `pause`/`resume` are runtime methods; standard AMCP has no CG
  pause, but `CG INVOKE "pause"` (no-arg) can reach `window.pause` later — out of
  scope here, but the method must take no args to keep that path open.
- **Outro from arbitrary state.** `stop()` during the intro should still exit
  cleanly — jump to `outroStartFrame` and play the outro rather than snapping.
