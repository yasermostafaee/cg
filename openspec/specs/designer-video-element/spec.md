# designer-video-element Specification

## Purpose

TBD - created by archiving change video-import-element. Update Purpose after archive.

## Requirements

### Requirement: Import converts in-app to ONE canonical WebM with alpha preserved

A video import SHALL accept any ffmpeg-decodable container/codec — including the legacy
`rawvideo`/BGRA AVI archive — and SHALL convert it IN-APP to WebM/VP9 with the alpha channel
preserved, storing the result as a `video` asset: the ONE canonical stored form that preview and
both exporters render, byte-identical. Any audio track SHALL be DROPPED at conversion (`-an`) —
v1 is muted-only, so the element is silent under every path. A `video` element SHALL be creatable
from the stored asset and placed on the canvas.

#### Scenario: A legacy BGRA AVI imports, converts, and places

- **WHEN** the operator imports a video file (any ffmpeg-decodable container/codec, including a
  legacy `rawvideo`/BGRA AVI)
- **THEN** it is converted in-app to WebM/VP9 with its alpha channel preserved, stored as a
  `video` asset, and a `video` element can be created from it and placed on the canvas

#### Scenario: An audio track is stripped at conversion

- **WHEN** the imported source carries an audio track
- **THEN** it is dropped at conversion, so the element is silent under every path — preview,
  `.vcg`, and single-file HTML

### Requirement: An optional crop region is marked in the import modal and BAKED at conversion

The import modal SHALL show a source preview on which the operator can mark an OPTIONAL crop
region (position + width/height). The conversion SHALL bake exactly that region (ffmpeg `crop`)
into the stored WebM — never a playback-time crop — so the stored canonical form stays the single
truth and preview and both exports carry the cropped clip. With no crop marked, the full frame
SHALL convert as before.

#### Scenario: A marked crop region is baked into the stored clip

- **WHEN** the operator marks a crop region (position + width/height) on the source preview in
  the import modal
- **THEN** the conversion bakes exactly that region into the stored WebM, and preview, `.vcg`,
  and single-file HTML all carry the cropped clip

#### Scenario: No crop marked converts the full frame

- **WHEN** the operator imports without marking a crop region
- **THEN** the full frame converts exactly as before

### Requirement: Conversion streams large sources, reports progress, and is cancellable

The conversion SHALL NOT load the source whole into memory (WORKERFS lazy mount) — a multi-GB
source converts within bounded memory. The operator SHALL see conversion progress and SHALL be
able to cancel an in-flight conversion, which cleans up without storing a partial asset.

#### Scenario: A multi-GB source converts within bounded memory, with progress and cancel

- **WHEN** the operator imports a multi-GB source
- **THEN** the conversion does not load it whole into memory, progress is shown, and the
  conversion can be cancelled

### Requirement: The converter's wasm payload is lazy and never fetched from the network

The Designer SHALL NOT load the converter's wasm payload at startup — it loads lazily on first
import — and SHALL NEVER make a network request for it (vendored, offline / air-gapped,
consistent with P-001).

#### Scenario: Startup does not load the converter; no network request ever

- **WHEN** the Designer starts
- **THEN** the converter's wasm payload is not loaded, and no network request is ever made for it
  — it loads lazily on the first video import, from the vendored payload

### Requirement: A video element is opaque, positionable, and timed

A `video` element SHALL be positioned, scaled, rotated, opacity-animated, and timed on the
timeline like any other element. The Inspector SHALL expose hold behavior, the phase marks
(`introEnd` / `outroStart` / optional `idle` — optional and MANUAL; absent phases ⇒ the whole
clip is the intro, the hold loops the whole clip, and there is no outro) and hold-driving — but
SHALL NOT expose the clip's internal content (opaque by design).

#### Scenario: Selected video exposes lifecycle surface, never inner content

- **WHEN** a `video` element is selected
- **THEN** it can be positioned / scaled / rotated / opacity-animated and timed on the timeline
  like any other element, and the Inspector exposes hold behavior, the phase marks and
  hold-driving — but not the clip's internal content

### Requirement: The hold LOOPS by default; freeze is the opt-in

On play the clip SHALL play from its start; on reaching the hold point it SHALL HOLD by LOOPING
(the default — the inverse of the Lottie's `freeze` default, because video furniture is authored
as a loop) rather than ending on a frozen last frame. `freeze` SHALL be the opt-in alternative.

#### Scenario: Reaching the hold point loops by default

- **WHEN** the composition plays and the clip reaches the hold point
- **THEN** the clip holds by looping rather than ending on a frozen last frame, and `freeze` is
  available as the opt-in alternative

### Requirement: The video does not drive the content-driven hold by default

Under a `content-driven` composition, a native ticker/sequence sitting on top of a video SHALL
drive the hold while the video holds beneath it. The video SHALL NOT drive the hold by default
(`drivesHold` absent/false ⇒ does not drive — the Lottie's inverse default) and SHALL be
opt-IN-able. When opted IN (`drivesHold: true`), completion follows the hold behavior: with
`holdBehavior: 'freeze'` the clip SHALL complete on first reaching the hold point; with
`'loop'` it SHALL never self-complete — exactly an infinite ticker, so the existing
infinite-repeat hold-driver flag applies. An opted-in video SHALL count as an EFFECTIVE hold
driver at the resolution boundary (`hasEffectiveHoldDrivers` — the shared predicate behind the
exporter's `buildPlayoutMetadata` and the Designer Playout inspector, mirrored per scope by the
runtime), so a composition whose ONLY effective driver is an opted-in video SHALL stay
`content-driven` in the exported metadata, the inspector, and on air alike — never silently
resolving to `timed` in one layer while another holds content-driven.

#### Scenario: A ticker on top drives the hold; the video holds beneath

- **WHEN** a native ticker/sequence sits on top of a video in a `content-driven` composition
- **THEN** the ticker drives the hold and the video holds beneath it; the video does not drive
  the hold by default and can be opted in

#### Scenario: An opted-in freezing video completes at the hold point

- **WHEN** a video with `drivesHold: true` and `holdBehavior: 'freeze'` plays under a
  `content-driven` hold
- **THEN** it completes on first reaching the hold point, gating the hold like any finite
  content source

#### Scenario: An opted-in looping video never self-completes and is flagged

- **WHEN** a video with `drivesHold: true` and `holdBehavior: 'loop'` (the default) sits under a
  `content-driven` hold
- **THEN** it never self-completes — the hold waits for `stop()` — and the existing
  infinite-repeat hold-driver flag surfaces it, exactly as for an infinite ticker

#### Scenario: A video as the SOLE opted-in driver keeps the hold content-driven everywhere

- **WHEN** a `content-driven` composition's only effective hold driver is a video with
  `drivesHold: true` (no ticker/sequence/countdown present)
- **THEN** the resolution boundary counts the video: the exported `.vcg` playout metadata bakes
  `holdSource: 'content-driven'`, the Designer Playout inspector resolves and displays
  content-driven, and the runtime holds content-driven — no layer falls back to `timed`
  (per-instance `holdOverrides` and the hidden-element gate apply to the video exactly as to
  every other driver kind)

### Requirement: A marked outro plays through the EXISTING element-outro seam

On `stop()` or `out()`, a video with a marked outro (`phases.outroStart`) SHALL play that outro
through the EXISTING D-125 element-outro seam — driven at most once per exit episode, the
background's close after it — and the composition SHALL settle to CLEARED, content-first /
background-last. A video with NO marked outro SHALL be carried by the existing content exit
unchanged.

#### Scenario: Stop/out plays the video's outro through the seam, then settles CLEARED

- **WHEN** the composition is stopped (`stop()`) or exited (`out()`) while a video with a marked
  outro is holding
- **THEN** the video plays that outro through the existing element-outro seam and the composition
  settles to CLEARED, content-first / background-last

#### Scenario: A video with no marked outro exits with the content, unchanged

- **WHEN** the composition is stopped or exited and its video element has no marked outro
- **THEN** the video is carried by the existing content exit unchanged

### Requirement: Pause and resume stay in lockstep with the scene

Pausing the scene SHALL freeze video playback and resuming SHALL continue it in lockstep with the
rest of the scene, with no drift against the `FrameDriver` playhead (the driver re-seeks to its
clock-derived clip-time on resume; drift during playback is bounded by driver correction — see
`design.md` D3).

#### Scenario: Pause freezes the clip; resume continues in lockstep

- **WHEN** the scene is paused and resumed
- **THEN** video playback freezes and continues in lockstep with the rest of the scene, with no
  drift against the `FrameDriver` playhead

### Requirement: Preview, `.vcg`, and single-file HTML render identically under CEF

The same template SHALL render identically in Designer preview, exported `.vcg`, and exported
single-file HTML. The single-file HTML SHALL run under CasparCG's CEF from `file://` with the
video bytes carried inline and ZERO external requests.

#### Scenario: Three render paths agree; single-file is self-contained under CEF

- **WHEN** the same template is viewed in Designer preview, exported to `.vcg`, and exported to
  single-file HTML
- **THEN** all three render identically, and the single-file HTML runs under CasparCG's CEF from
  `file://` with the video bytes carried inline and zero external requests

### Requirement: The premultiplied-alpha correction is opt-IN, defaulting OFF

The import modal's `Premultiplied alpha` correction SHALL default OFF (un-premultiply of a
matted-against-black source): a default must never degrade an already-correct straight-alpha
source, which the correction visibly damages. The operator SHALL be able to opt IN for a legacy
premultiplied source showing a black fringe, and the setting that produced each stored asset
SHALL be recorded in its provenance (`premultipliedAlpha`).

#### Scenario: The default leaves a correct source untouched; opting in is recorded

- **WHEN** the operator imports a video without touching the premultiplied-alpha toggle
- **THEN** the source's colours are used as-is (no un-premultiply), and when the operator opts
  IN instead, the conversion un-premultiplies and the stored asset's provenance records
  `premultipliedAlpha: true`

### Requirement: A default import takes the FAST PATH — no pixel-math stage runs

A default conversion SHALL run NO pixel-math stage — neither the un-premultiply nor the alpha
bleed — matching the spike's fast shape, while the QUALITY settings (bounded quantiser, 1 s
GOP) SHALL remain on the default path. The alpha bleed SHALL be a separate, genuinely optional
opt-in — never silently attached to the premultiplied correction — and each correction's UI
SHALL state that opting in makes conversion substantially slower. The correction set that
produced each stored asset SHALL be recorded in provenance, and the pre-convert duplicate
match SHALL treat a different correction set or converter revision as a different output. The
result panel SHALL point the operator at the relevant correction when its readings suggest one
(a premultiplied-looking source; visible alpha leaked into source-transparent regions). The
playability verification SHALL prove the output by metadata plus a FULL sequential playthrough
(error listener armed throughout, wall-capped with an honest log on a cap) — never by seeks,
which Chromium can fail on a playable VP8+alpha file when the alpha side-stream's keyframes
misalign with the main stream's.

#### Scenario: A default import converts with no filters; a crop stays cheap

- **WHEN** the operator imports with neither correction ticked
- **THEN** the conversion runs no un-premultiply and no bleed (with an opt-in crop riding a
  plain crop filter), and the quality settings are still applied

#### Scenario: Each correction adds exactly its own stage

- **WHEN** the operator ticks one correction
- **THEN** the conversion adds exactly that correction's stage and not the other's, and the
  stored provenance records the exact correction set

#### Scenario: The result panel points at the correction the readings suggest

- **WHEN** a default import's readings show a premultiplied-looking source, or visible alpha
  leaked into source-transparent regions
- **THEN** the result panel names the specific correction to re-import with (Premultiplied
  alpha / Alpha bleed) instead of leaving the operator to guess

### Requirement: A conversion verdict never outlives its settings

A completed (or failed) conversion's verdict SHALL stop presenting itself as current the
moment ANY output-affecting parameter changes — the crop on/off, the crop rect, or either
correction: the result panel (playability verdict, alpha numbers, stored size) is cleared,
placement SHALL be unavailable until a conversion matching the settings on screen exists, the
supersession SHALL be stated in place, and a visible "Convert again" action SHALL run a new
conversion with the shown settings (the intended loop: import fast → look → tick a correction
→ convert again — never cancel-and-restart). Surfaces that describe the SOURCE (the
crop-preview poster, probe metadata, source alpha profile) remain valid across setting changes
and stay.

#### Scenario: Ticking a correction after a completed conversion supersedes the verdict

- **WHEN** a conversion has completed and the operator changes an output-affecting parameter
- **THEN** the result panel is cleared, no element can be placed, the supersession is stated,
  and a "Convert again" action is offered in place

#### Scenario: Convert again restores a current verdict

- **WHEN** the operator runs "Convert again" after a supersession
- **THEN** a new conversion runs with exactly the settings shown, its verdict is presented as
  current, and placement becomes available again

### Requirement: A stored clip's at-rest poster is produced by ONE robust routine on every surface

Every stored-asset poster surface SHALL produce the at-rest frame through ONE shared routine —
the canvas iframe, the Inspector preview, and the assets-panel tile — never per-surface copies
that can drift. The routine SHALL NOT rely on a cold seek alone: a WebM whose
alpha side-stream keyframes misalign with the main stream's (a legitimate libvpx encode — the
clip plays sequentially and airs correctly) makes a cold seek into a misaligned GOP a TERMINAL
Chromium decode error. The routine SHALL seek on the eager-load path and, on any media error or
seek stall, SHALL recover by sequentially decoding (muted, high-rate) to the poster time — the
operation import verification proves — restoring the element (playback rate, paused) for a later
real play. Only a clip that cannot decode sequentially may fail to produce a poster, and that
failure SHALL be surfaced (console at minimum), never a silently blank element.

#### Scenario: A seek-fragile clip still renders its poster on the canvas

- **WHEN** a stored clip whose alpha side-stream keyframes misalign with its main-stream
  keyframes is placed on the canvas (its mid-clip poster seek would be a terminal decode error)
- **THEN** the canvas still renders the mid-clip poster frame (via the routine's sequential
  recovery when the seek rung fails), the element carries no media error, and it remains paused
  at playback rate 1, ready for a real play

#### Scenario: The Inspector and assets-panel thumbnails render the same clip

- **WHEN** the same seek-fragile clip is shown in the Inspector preview or the assets-panel tile
- **THEN** each produces the poster frame through the same shared routine — never a blank tile —
  and a genuine failure is surfaced, not silent

### Requirement: Import verifies the stored clip through the canvas's own poster routine

After storing the converted bytes, the import SHALL verify that the stored asset produces its
at-rest poster frame VIA THE SAME shared routine the canvas and thumbnails run — so "the import
verified it" and "the canvas renders it" are the same code path, and a clip that would render
blank on the canvas fails LOUDLY at import instead. This is IN ADDITION to the playability
verification (metadata, seek sweep, playback span) and the readback check.

#### Scenario: A stored clip that cannot produce its poster fails the import loudly

- **WHEN** the stored bytes cannot produce the at-rest poster frame through the shared routine
  (neither the seek rung nor sequential recovery yields a frame)
- **THEN** the import fails with a message naming the poster verification (distinct from
  playability, alpha, and readback failures) and the reason, instead of placing an element that
  renders blank

### Requirement: An oversized single-file export is reported by the existing preflight

An oversized export SHALL be reported BEFORE any file is produced: when the projected
single-file INLINE payload (base64-inflated) exceeds the threshold, the EXISTING preflight /
issues path raises a WARNING that never blocks (owner decision (d) — the operator may have a
legitimate reason).
The message SHALL be actionable: the projected total, the dominating assets by name, and that
the `.vcg` package has no such limit. The threshold (40 MiB inline) is PROVISIONAL until the
Phase-6 hardware pass — chosen from a desktop-Chromium `file://` load sweep recorded in
`design.md`, with margin for CasparCG 2.3's older CEF.

#### Scenario: Crossing the size threshold warns, actionably, before export

- **WHEN** a template's projected single-file inline payload exceeds the threshold
- **THEN** the issues panel shows a WARNING naming the projected total, the dominating assets,
  and the `.vcg` alternative — before any file is produced, and without blocking either export

### Requirement: A missing video asset is a preflight ERROR

A video element whose asset cannot be resolved SHALL raise an ERROR-severity `missing-asset`
preflight issue (the image pattern — decision (c): a missing video is a black hole on air),
and the `.vcg` export SHALL block on it. The single-file path, which never blocks, SHALL
report the same condition as a warning naming the element.

#### Scenario: A missing video blocks the .vcg export at preflight

- **WHEN** a scene references a video asset that no longer resolves
- **THEN** preflight reports an ERROR-severity `missing-asset` issue naming the element, and
  producing a `.vcg` fails with that issue instead of packing a template that renders a black
  hole on air

### Requirement: A playing video survives a preview scene rebuild

An edit that rebuilds the preview's scene SHALL NOT leave a video permanently unable to play. The
preview may legitimately pool a live `<video>` across a rebuild and transplant it back over the
freshly built one, so that a transform-only edit never re-fetches the media; when it does, the
lifecycle driver SHALL command the node that is actually in the document, not the node it captured
when the scene was built.

The binding SHALL be re-resolved by the element's `data-cg-element-id` whenever the captured node
reports that it is no longer connected to a document, and SHALL be HOST-AGNOSTIC — it SHALL NOT
depend on knowing which host performed the reparenting, so any harness that reparents nodes is
covered. A node that is merely MOVED within the document SHALL NOT be re-resolved.

A rejected `play()` SHALL be reported rather than swallowed, naming the element, and SHALL be
reported at most ONCE per element so a per-tick retry cannot become a per-frame log.

#### Scenario: The video keeps playing after an edit rebuilds the preview

- **WHEN** a video is playing in the preview and an edit posts a scene rebuild, and the operator
  plays again
- **THEN** the `<video>` visible in the preview document is not paused and its `currentTime`
  advances

#### Scenario: The trigger is the rebuild, not the companion element

- **WHEN** a scene carrying a video and NO other animated or timeline-driving element has its
  preview rebuilt by a session timing change, and the operator plays again
- **THEN** the video is not paused and its `currentTime` advances — the freeze is a property of the
  rebuild, not of any companion element on the scene

#### Scenario: A rejected play is reported once, naming the element

- **WHEN** a video element's `play()` is rejected and further play attempts follow
- **THEN** the rejection is logged once for that element, identifying it, and is not repeated per
  attempt

### Requirement: The Lottie map handed to a preview is scoped to that scene

The parsed-Lottie map posted to a preview SHALL contain only the assets the scene being previewed
actually references, not every asset parsed since the project opened. The preview forces a scene
rebuild whenever it receives a non-empty Lottie map, so a whole-cache map keeps forcing rebuilds
after the Lottie element is gone — which is what made a rebuild-induced freeze STICKY, unable to be
undone by undoing its cause.

Removing the last Lottie element from a scene SHALL therefore make that scene's posted map empty,
even though the parsed asset legitimately remains cached for re-use.

#### Scenario: Deleting the Lottie stops forcing rebuilds

- **WHEN** the last Lottie element is removed from a scene whose asset is still in the module cache
- **THEN** the map posted for that scene is empty, so the preview's rebuild-forcing condition is
  false

### Requirement: Adding content longer than its host raises the duration guard at ONE chokepoint

The Designer SHALL raise a confirm dialog BEFORE anything is inserted WHEN content is ADDED to a
scene or composition and its intrinsic duration exceeds the host's duration, naming BOTH
durations concretely (e.g. "this clip is 5.0 s; the composition is 2.0 s"). The comparison SHALL
use one derivation per kind, from stored facts: a video's `durationMs` (captured at conversion);
a Lottie's clip length `(op − ip) / fr` at the CREATION default speed 1× (the element does not
exist yet, so an authored speed cannot apply); a nested composition's own active-range length at
the project frame rate. The host's duration SHALL be its active-range length (`activeRangeOf` —
the existing authority, reused, never re-derived).

The guard SHALL sit at ONE chokepoint that EVERY add door passes through — the assets-panel place
actions, the canvas drag-drop, and the composition insert alike — never one guard per door.
Duplicating or pasting an element already in the scene is NOT an add in this sense and SHALL NOT
raise the dialog: the item's trigger is adding content, not copying content already accepted.

The trigger is ADD-TO-SCENE, explicitly NOT asset-import time: importing an asset into the
library fires nothing, regardless of its duration.

#### Scenario: A longer clip raises the dialog naming both durations

- **WHEN** a 5 s video (or Lottie) is added to a 2 s composition by any add door
- **THEN** the dialog appears before anything is inserted, naming the content's and the host's
  durations concretely

#### Scenario: A fitting add is silent

- **WHEN** a 1 s video is added to a 2 s composition
- **THEN** no dialog appears and the element is added exactly as today

#### Scenario: Import to the library never fires the guard

- **WHEN** an asset of any duration is imported into the library
- **THEN** no dialog appears — the guard's moment is add-to-scene, where a host exists to be
  measured against

#### Scenario: Every add door passes through the guard

- **WHEN** the same oversized asset is added via the assets panel place action and via canvas
  drag-drop (and, for a composition, via the compositions panel insert)
- **THEN** every door raises the same dialog through the same chokepoint — a door that bypasses
  the guard is the on-air-discovered bug this item exists to prevent

### Requirement: The dialog offers the owner's settled choice split — three for media, two for a composition

For VIDEO and LOTTIE content the dialog SHALL offer exactly three choices:

1. **Extend the composition** — the host's duration grows to EXACTLY fit the content (ceil to
   whole frames at the composition's frame rate), THEN the element is added. The extension SHALL
   go through the SAME store action the timeline's duration field uses (so the timeline and undo
   agree), and extend + add SHALL be ONE undo step.
2. **Add as backdrop — follow the composition** — the element is added with
   `phases.source: 'composition'` (the `media-phases-follow-composition` mode, claim-least
   slots), the host's duration untouched. `holdAt` is NOT asked for in the dialog — the operator
   tunes it in the Inspector, which seeds it from the shared midpoint helper. One dialog, three
   buttons, no nested configuration.
3. **Cancel** — the element is NOT added; the scene is left EXACTLY as it was (byte-identical).

For a COMPOSITION-INTO-COMPOSITION insert the dialog SHALL offer TWO choices — Extend / Cancel —
because an instance has no `phases` and cannot follow: the owner's settled answer (sharpened
Candidate A) covers media; comp-insert keeps the item's firm decline-means-not-added form.

The backdrop choice SHALL be offered even when the host has no lifecycle/out-point — a control
that appears and disappears by host state is harder to learn than one that explains itself; the
added follower behaves marker-less until an out-point exists and the Inspector's existing
explanation says why. The dialog SHALL follow the shared `Modal` pattern (role `dialog`,
`aria-modal`, focus trap — the semantics are part of this requirement, not the styling).

#### Scenario: Extend grows the host to exactly fit, as one undo step

- **WHEN** the operator chooses Extend for a 5 s clip in a 2 s composition at 25 fps
- **THEN** the host's duration becomes exactly 125 frames (ceil to whole frames), the element is
  added, and ONE undo restores both the duration and the absence of the element together

#### Scenario: Backdrop adds a follower and touches nothing else

- **WHEN** the operator chooses "Add as backdrop — follow the composition"
- **THEN** the element is added with `phases.source: 'composition'`, the host's duration is
  untouched, and the Inspector shows the follow state already on

#### Scenario: Cancel leaves the scene byte-identical

- **WHEN** the operator cancels the dialog
- **THEN** the element is not added and the stored scene is byte-identical to before the add

#### Scenario: Lottie parity

- **WHEN** an oversized Lottie is added by any door
- **THEN** the same three-choice dialog and the same three outcomes apply, with the intrinsic
  duration derived at 1× speed

#### Scenario: A composition insert offers the two-choice form

- **WHEN** a composition longer than its would-be host is inserted into another composition
- **THEN** the dialog offers Extend and Cancel only — no backdrop button — and both behave as
  specified above

#### Scenario: The backdrop choice survives a host with no out-point

- **WHEN** the host composition has no lifecycle when an oversized clip is added
- **THEN** the backdrop choice is still offered, the added follower behaves marker-less until an
  out-point exists, and the Inspector's existing no-anchors explanation says why

### Requirement: A follower with no out point is a state with a remedy

The Inspector SHALL show, for a video or Lottie element that follows the composition while the
composition has no out point, a one-line state — "Following nothing yet — no out point" — with
the remedy ("set one in Playout") inline and the mechanism (why there are no anchors to derive
from) behind an `i`.

#### Scenario: a video following a composition without an out point

- **WHEN** a video with `phases.source = 'composition'` sits in a composition with no lifecycle
- **THEN** the panel shows the follow state line with its remedy, and no derived window

### Requirement: `drives hold` is withheld until an out point exists

The video Inspector's `drives hold` select SHALL be disabled, with the reason as its tooltip, while
the composition has no out point — a composition with no out point holds nothing a driver could
end. It SHALL be enabled once an out point exists, whatever the mode.

#### Scenario: no out point

- **WHEN** a video sits in a composition with no out point
- **THEN** `drives hold` is disabled and its tooltip says to add an out point in Playout

#### Scenario: an out point exists

- **WHEN** the composition has an out point, in any mode
- **THEN** `drives hold` is enabled
