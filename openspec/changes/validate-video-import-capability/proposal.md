# Change — validate video-import capability before conversion

## Why

Video selection currently checks only a broad container extension. A recognized container can still
carry an undecodable codec, and a failed poster is treated as optional, so the operator may wait
through a long conversion before receiving a technical failure. A valid QTRLE MOV with non-square
pixels also converts successfully but then fails dimension verification because coded and displayed
geometry are confused.

## What changes

- Show concise, proven video export presets before selection, with the broader container list and
  codec distinction available through contextual help.
- Keep extension rejection immediate and make its message video-specific and actionable.
- Require a bounded first-frame decode during the existing fast probe before enabling conversion,
  while retaining the current poster-less success path when fallback decode succeeds.
- Parse sample-aspect ratio and normalize non-square sources into a square-pixel canonical WebM while
  preserving their intended display shape.
- Keep no-track, decode/file incompatibility and internal converter failures as separate UI states.

## IDs

- `B-383`
- `D-190`
