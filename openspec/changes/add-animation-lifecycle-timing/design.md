## Decisions

- **New capability, phases inside `activeRange`.** `designer-animation-timeline`
  owns `frameRange`/`activeRange` and keyframes and is left untouched. The
  lifecycle capability adds `introEndFrame`/`outroStartFrame` **within** the
  active region, so the active region remains the outer playable window and the
  two specs compose.
- **Hold = the idle segment, looped.** The HOLD plays the frames between
  `introEndFrame` and `outroStartFrame` on a loop (a spinning logo, a pulsing
  dot), so animation in that region is visible while the graphic is held. When
  `introEndFrame == outroStartFrame` there is no segment, so the graphic simply
  holds the frozen intro-end frame (the common lower-third case). This is cheap —
  it reuses the FrameDriver's existing loop mode over the sub-range.
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
