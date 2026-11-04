# Design

## Layout

The shared modal shell gains an optional maximum height; Preview opts into a near-viewport card. Its
body remains a two-column stage/workspace layout. A fixed-width frame/time strip sits directly above
the picture. The right workspace is ordered:

1. transport;
2. optional preview/session controls;
3. a `Variables` header and scrollable data region.

The whole workspace does not become a second tab. Scalar rows use a compact key/label column and a
high-contrast flexible value column. One header-level `Update all` is the only commit action; rich
list/repeater editors keep edit/reorder/remove controls but do not repeat an Update check on each
item.

Structured Repeater/Sequence rows use the shared labelled row-editor modal rather than compressed
inline columns. One shared scroll area moves the complete row set; the transport remains outside
that editor. This preserves the current gallery's many-column league and multi-page weather flows.

## Elapsed status

The host owns a monotonic elapsed clock for the current run. Play starts a new run, Pause freezes it,
Resume continues it, Stop/Reset settle it. The Preview iframe emits a small state message from the
runtime's lifecycle events so natural completion also settles the clock. This is rehearsal status,
not stored template data. Both status values use fixed-width, tabular monospace figures so digit
changes cannot move the strip.

Preview text, multiline and list-item editors use the browser's first-strong `dir="auto"` rule, the
same presentation-only rule as CG Control. It changes caret/alignment only and never enters field data.

## Transport

`Out` remains supported by the underlying runtime and exporter contracts but is not presented in the
Designer Preview. Removing the UI affordance does not alter on-air Stop/Out semantics elsewhere.

## Reset ends the dedicated rehearsal — Full-lane follow-up

The host previously reset counters and form values while the generated iframe only performed a
replace-mode field update and tick. Its lifecycle, media, content timers and an in-progress outro
could continue behind an apparently idle transport. Reset must end the actual rehearsal, not only
change the status display.

Dedicated Preview Reset uses the existing synchronous runtime removal/teardown, then prepares a
fresh idle runtime from the same scene and session settings. It does not use graceful Stop, which
deliberately plays authored exits. The host passes its exact `previewSeed` values in the optional
Reset payload, including current connected-file row data; omitted data falls back to declared
defaults. The fresh runtime and form therefore agree, rather than one showing file rows while the
other silently restores authored rows. Restore the authored initial frame and remain blank until
the next explicit Play. Existing asset maps, timing overrides, selected
Preset and rehearsal settings survive. Canvas Reset and exported/on-air commands stay unchanged.

Preview commands retain order across the short asynchronous rebuild. Reset invalidates older
pending transport/data commands and immediately tears down the current runtime; a Play already
awaiting fonts cannot revive it. A subsequent explicit Play waits for the prepared replacement.
The iframe's existing boot-ready handshake is retained; Reset does not load different iframe content
or invent automatic playback. Regression coverage exercises running, paused and closing states,
default data restoration, no further old-driver motion and a clean explicit replay.

## Current-iframe readiness — Full-lane follow-up

Static review found a concrete command-loss window: the host's `post` optionally addresses an iframe
and does not queue commands, while the generated host awaits its initial `applyScene` before installing
the command listener and sending `cg-preview-ready`. Play was already enabled, and its host handler
started elapsed time before delivery was possible. Thus an early click could leave a frame-zero/blank
stage with an advancing clock. The first failed new-weather capture is consistent with the race, but
does not establish it as that capture's cause; a successful second attempt is not a regression test.

Readiness belongs to the current dedicated Preview content, not a remembered dialog-wide boolean.
Transport remains visibly disabled until that iframe's existing ready signal is accepted. Command
handlers enforce the same state, so an early invocation cannot dispatch or start elapsed time even
if a stale UI event reaches the callback. Boot-time data/assets/session state are seeded through the
existing handshake; no new queued Play or automatic playback is introduced.

Creating/rebuilding Preview content and reopening the dialog clear readiness. The listener retains
its current-frame source check; unrelated and obsolete content signals cannot enable the new
transport. A prior run's ready state or elapsed timer must not leak into a new content generation.
Once ready, existing Play/Pause/Resume/Stop/Reset, fields, rehearsal settings and natural completion
retain their contracts. Close stays available during loading. This is session state only and does
not change exported scene data or Runtime-on-air behavior.

Tests hold readiness deliberately rather than relying on machine speed: check disabled transport and
unchanged elapsed time, reject foreign/stale signals, accept the current signal, then verify a real
Play advances both the graphic and truthful status. Rebuild/reopen coverage proves readiness is reset.

## Compatibility

No scene data changes. Existing Preview field validation, list editors, timing overrides, sound
rehearsal and step rehearsal remain available. Prepared field data still reaches the runtime through
the existing in-place update path, now only through `Update all`.
