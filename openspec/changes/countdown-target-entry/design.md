# Design: Countdown target authoring and rehearsal

Target entry uses the shared date/time parsing and masked-control behavior, while each app keeps
its own UI primitives. A fresh accelerated rehearsal rebases only its session clock; authored
absolute deadlines and real-time output remain unchanged.

## CG Control target dialog

The summary uses the same mask formatting, calendar preference and station adjustment as the
existing target editor. The modal holds its target locally. Done passes the final value to the
ordinary Inspector draft store and Cancel drops the modal value. Relative durations resolve
from the console time at the click through the existing preset clock and target formatting.
Time-of-day targets retain a daily wall time, so a custom duration there must be below 24 hours.

## Stopped authoring versus playback

The stopped Canvas is an editing surface, not a live wall-clock rehearsal. It must retain authored
base visibility and usable countdown digits so an expired target cannot make the design impossible
to select. This is an authoring-only runtime/session distinction: it does not rewrite deadlines,
Steps, authored visibility, or exported scenes. Intentionally hidden elements are not force-shown.
Explicit Step rehearsal remains deliberate and normal playback still evaluates the actual target.

Tests must distinguish idle open/edit, active Canvas playback, dedicated Preview and a return to
stopped editing, including nested clocks. An expired target in playback is the negative control:
fixing editing must not make a real past target count down again.

## Separate authored zero policies

Close-on-zero compositions finish their ordinary outro before clearing. The current gallery Azan
lower third instead hides its timer, reveals the prayer announcement and holds until manual Stop.
The earlier full-screen generic starter requirement is superseded, not a hidden runtime exception.

This change does not address D-186 Follow-media Freeze-frame parity. Its existing pending
verification remains in `../align-follow-media-cursor-and-freeze-frame/tasks.md`.
