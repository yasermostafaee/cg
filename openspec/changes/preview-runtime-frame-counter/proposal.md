# Preview runtime frame counter

## Why

Preview shows elapsed rehearsal time but not the authored frame currently produced by the runtime.
Wall time is not a truthful substitute because holds park a frame and loops wrap to an earlier one.

## What changes

- Observe the root composition's authored lifecycle playhead independently from paint optimisation.
- Send that frame from the dedicated Preview iframe to its owning Preview modal.
- Show `current / total` beside elapsed time using the timeline's total-frame convention.
- Keep the lifecycle frame fixed during parked-hold content repaints, while an authored Middle loop
  advances and wraps the root frame. Report collapsed static-leg boundaries without changing their
  timing, and ignore nested playheads and duplicate reports.
- Keep elapsed time open-ended for every loop or content-driven hold until real completion/Stop.
- For a composition with no root frame-dependent paint, display the authored elapsed-time frame
  instead of exposing Runtime's intentional static-render collapse, and visibly reset it on every
  fresh Preview Play.

## Impact

Designer Preview UI and one optional, read-only template-runtime observation hook. The hook does not
change lifecycle timing, exported output, bridge commands or on-air protocol behaviour.
