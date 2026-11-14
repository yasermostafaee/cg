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
Bounce and Elastic use a bounded sequence of native linear and quadratic tweens. Rebounds stay
between authored endpoints, so clip dimensions are always valid.
A new console or an invalid preference uses Cut with Fade off and a duration of 400 ms.
Cut without Fade uses the existing immediate placement path.
Off-air Update stores only the placement. Existing pages keep Cut until a compatible page is on air.

## Preset switches

The Bridge verifies the incoming sources and prerolls new seats while hidden. A moving shared
plate uses the same authored definition, artwork and verified running seat in both presets.
The configured duration is divided between the applicable exit, motion and entrance stages.
An outgoing group fades as a unit while the retained frame holds. If the existing native layer
order would obscure a retained frame, the overlapping group is hidden before the shared motion.
The switch parks departing seats with their normal opacity and then fades in the arriving group
at its destination. An unsafe or unverifiable change continues to use the existing guarded
preset path. A refused effect restores applied geometry and opacity while the row still owns
the output. Existing manual frame permissions continue to constrain operator edits.

The runtime's phase payload addresses an artwork group by its fully qualified instance key and
fences it by preset ID. When the destination hides an outgoing shared title, the runtime keeps
that title hidden through the move and then applies the destination's authored visibility.

On a connection loss, the Bridge reserves any seats the arrival actually started. On recovery it
mutes and hides those seats before the shared mixer buffer is committed, clears them, and
reasserts the prior mixer ledger. A guarded update restores the previous preset on the surviving
artwork passes. The page accepts recovery only for the effect it received. A new take, Stop, or
loss of the resident pages ends that ownership.

## Rehearsal

Preview uses the exact exported page and the same phase planner. The Inspector can choose a PVW
preset independently of the row's programme preset. Preview frame effect rehearses an applied
placement to a draft. A local dissolve holds the current picture until the incoming snapshot is
available, then fades to it inside the same plate. Browser-local changes leave programme output
under the existing on-air verbs.

## Input changes and masks

Input effect defaults to Cut. Fade prerolls one replacement into a verified spare seat in the
same band, keeping the working source visible. The visual dissolve precedes the audio handover.
The binding transaction owns cleanup and rollback, including a dropped connection to the same
engine. Fade requires an independently seated unmasked picture, a suitable free layer and one
configured engine. Cut remains available for mirrored output and other ineligible cases.

The Bridge omits mask-owning plates from the crop targets, and the Preview and Inspector use
the same eligibility. The authored fit and focus continue to guide a masked plate's picture.
