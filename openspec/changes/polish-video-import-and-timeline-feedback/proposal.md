# Polish Video import and timeline feedback

## Why

Video import spends most of its visible space on two troubleshooting corrections that are rarely
needed, while Crop—the routine option—competes with their technical copy. On the authoring canvas,
timeline scrubs are also ignored after Play is paused because the lifecycle still owns the media,
and the reported playhead stays parked even while a content-driven Middle loop (including
time-driven Video/Lottie) is visibly moving.

## What changes

- Keep Crop in the normal Video-import flow and put Premultiplied alpha and Alpha bleed in a closed
  Advanced corrections section, with detailed teaching behind information actions.
- Treat a ruler-owned scrub after Pause as an explicit return to static authoring, then position the
  Video through the existing scrub path.
- Report root hold-loop frames to Designer/Preview so the playhead advances and wraps with the
  visible Middle loop even when composition paint is collapsed. Content drivers remain independent
  and are not restarted by the wrap.

## Impact

- Designer Video-import modal and its focused DOM coverage
- Designer preview iframe scrub scheduling and browser coverage
- Template-runtime root-frame observation and hold-loop tests
- PRD D-185, B-375 and B-376
