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
The configured duration is converted to display frames and divided between the applicable
exit, motion and entrance stages. PVW uses that same frame budget and only reserves a move
stage when a shared frame actually moves or fades. Selected Fade dips the retained picture
during that stage. A short dissolve requires at least two output frames.
An outgoing group fades as a unit while the retained frame holds. The operator can add motion
toward any screen edge. The mixed input, any mask fragments, and its artwork receive the same
translation. A higher native seat that would cross a retained frame falls back to Fade in place.
If the existing native layer order would already obscure a retained frame, the overlapping
group is hidden before the shared motion.
The switch parks departing seats with their normal opacity. The arriving group fades in at its
destination or enters from its independently selected edge while fading. Before directional
entrance, the new group is held hidden while its pictures and artwork are prepared. An unsafe
or unverifiable change continues to use the existing guarded
preset path. A refused effect restores applied geometry and opacity while the row still owns
the output. Existing manual frame permissions continue to constrain operator edits.

The runtime's phase payload addresses an artwork group by its fully qualified instance key and
fences it by preset ID. During an animated preset switch, it hides text inside affected frame
compositions, including a title belonging to a group whose plates are all switching. Preset-wide
and unrelated text stay visible. The title hold goes into the first destination update so
it covers both sides of a switch. Release on both passes follows native mixer settlement;
the destination's authored visibility takes effect. Older exported pages are rebuilt from
their saved design by the template import/rebuild path.

Each delayed phase uses a monotonic start deadline after staging the native mixer batch.
Before sending a page update, the Bridge measures the remaining delay. It commits the staged
mixer commands after the same delay has elapsed. Shared native seats animate changes to their
source fill and clip even when the plate box itself stays fixed. PVW follows the moving plate
box and preserves the pictured source's aspect on both sides of a regular, unmasked switch.

On a connection loss, the Bridge reserves any seats the arrival actually started. On recovery it
mutes and hides those seats before the shared mixer buffer is committed, clears them, and
reasserts the prior mixer ledger. A guarded update restores the previous preset on the surviving
artwork passes. The page accepts recovery only for the effect it received. A new take, Stop, or
loss of the resident pages ends that ownership.

With a legacy mirror-sync backup, a supported transition between already seated inputs animates
in the captured active engine session. The reserve receives the absolute final preset after
settlement and only with confirmed resident artwork and native seat ownership. Inputs with no
backup copy and Playout routes stay absent there. A new input that would require preparing new
seats while switching both engines uses the existing Cut path. After a role change, a deferred
batch owned by the former engine cannot be committed by another channel operation on its reserve.

## Rehearsal

Preview uses the exact exported page and the same phase planner. The Inspector can choose a PVW
preset independently of the row's programme preset. Preview frame effect rehearses an applied
placement to a draft. A local dissolve holds the current picture until the incoming snapshot is
available, then fades to it inside the same plate. Browser-local changes leave programme output
under the existing on-air verbs. An acknowledged row preset action releases only the preview
cue that was present when the row action began. A newer Inspector selection stays in Preview. Preview following a programme action uses
the confirmed final arrangement immediately. A refused action keeps the current cue. Rehearsal discards superseded targets and keeps the
latest updates for the preset it is animating toward.

## Input changes and masks

Input effect defaults to Cut. Fade uses a verified spare seat or a suitable running input
parked for another preset. The working source stays visible during preparation. The visual
dissolve precedes the audio handover. If a different preset still needs the outgoing input, the
terminal mixer change parks and mutes that input for recall. A single independent mask rectangle
keeps its authored clip while the picture changes. The binding transaction restores previous
geometry and audio on refusal, including a dropped connection to the same engine.

Push and Slide over use the same prepared-seat ownership and rollback. Both move the new
picture through a stationary aperture. Push moves the old picture in the same direction until
it leaves. Slide over keeps the old picture underneath and requires a verified higher seat.
The selected direction names the entry edge. The mixer clips each translated picture to the
fixed plate. Preview animates image pixels inside the same aperture and starts only once the
replacement picture is ready. An eligible single rectangular mask remains in place.
Shared/routed input copies and multi-piece masks retain the Cut path.

On programme output, a moving picture whose source fill overhangs the aperture across the
selected direction cannot safely use the moving mixer clip. The native rasterizer's edge
tolerance increases as that clip narrows. Bridge refuses that direction before preparing a
seat, leaving the previous input in place. Other eligible directions, Fade and Cut remain
available.

With a legacy mirror-sync backup, the active session owns the animated source change from
preroll through terminal geometry and any rollback. Bridge settles a verified reserve directly
after the active change succeeds. The reserve uses its own channel mapping, free or already
verified spare layer, and its own media path. Reserve writes use the captured replica and are
fenced by the same resident page and queues. A failed reserve preparation leaves its previous
picture in place. A known missing media copy remains absent on the reserve. Other backup
strategies keep their existing immediate input path.

The Bridge omits mask-owning plates from the crop targets, and the Preview and Inspector use
the same eligibility. The authored fit and focus continue to guide a masked plate's picture.
