# Live frame placement effects

The effect belongs to the operator's frame placement update. It uses the already playing live
inputs and the resident artwork pages. It applies to live frame moves and resizes, including
Reset frames and an arrangement saved through the same frame placement update.

The Bridge converts duration to channel frames. A motion-only update drives FILL and CLIP with
the same tween. Fade divides the effect into equal phases, reducing the selected frames' opacity
before restoring it. Cut with Fade changes geometry at zero opacity. Combined effects move
through the midpoint while changing opacity, using two portions of the selected easing curve.
The page receives the same frame-space endpoints and curve. When a foreground is present,
the Bridge sends the phase to both pages so each update is acknowledged. Other updates keep
the existing page-to-page forwarding.

An effect requires a supporting resident page and verified input ownership. Each phase commits
the affected mixer parameters together. Release the channel's mixer lease between phases and
validate the output before the next phase. Restore the applied pose and opacity on a refused
phase when ownership is retained. Stop, Clear and emergency silence take priority over pending
phases.

The duration setting is 100–1000 ms. The console stores the selection in browser local storage.
A new console or an invalid preference uses Cut with Fade off and a duration of 400 ms.
Cut without Fade uses the existing immediate placement path.
Off-air Update stores only the placement. Existing pages keep Cut until a compatible page is on air.

## Preset switches

For a live preset switch, the same effect preference applies from the row's preset picker.
The existing switch verifies the incoming sources and prerolls any new seats before the effect
starts. A shared plate must have the same authored definition, artwork and verified running
seat in both presets. Its outgoing artwork, native picture and mask fragments follow the same
phase endpoints. Fade applies to the shared frame. The regular preset commit brings in the
remaining frames and parks outgoing-only frames once the shared frame reaches its destination.
If native layer order would make the shared frame cross a departing group incorrectly, the
Bridge first hides that group's picture, mask fragments, fallback and nested artwork while
the shared frame holds its pose. It then starts the selected effect at the configured duration.
The terminal mixer batch parks the group and restores its usual parked opacity. A refused
switch restores the previously applied view while the Bridge still owns the output.
The transition requires compatible resident pages and a verified group containing only departing
plates. The switch uses Cut if the paint order is still unsafe or there is no verified shared
frame. Existing manual frame permissions still constrain operator edits.
