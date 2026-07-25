# designer-video-element (D-128 delta)

## ADDED Requirements

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
infinite-repeat hold-driver flag applies.

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

An export that would exceed the single-file size threshold SHALL be reported by the EXISTING
preflight / issues path BEFORE export, rather than producing a file CEF cannot boot. (The
threshold value and warn-vs-block are an owner decision recorded in `design.md`.)

#### Scenario: Crossing the size threshold is reported before export

- **WHEN** an export would exceed the single-file size threshold
- **THEN** the existing preflight / issues path reports it before export, rather than producing a
  file CEF cannot boot
