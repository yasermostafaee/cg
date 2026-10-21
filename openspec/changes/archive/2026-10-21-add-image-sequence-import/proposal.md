# A numbered image sequence imports as ONE video layer (`D-164`)

## Why

The owner (2026-10-14): _"Like importing a video, it must be possible to import a **PNG sequence**, and
all of its frames must come into the Designer **as one layer**."_ Motion graphics are routinely
rendered as numbered PNG (or TGA) frames with alpha. Today the only way in is to encode them to a
clip outside the app first.

## What Changes

- **Entry (Designer, Assets panel `+`).** `Image sequence…` picks many PNG / TGA files, and
  `Image sequence folder…` a whole folder. A pick holding no numbered PNG or TGA frame says so and
  opens nothing.
- **The sequence step (new `ImageSequenceImportModal`).** The frames are grouped into sequences by
  folder, the text around their number and extension, and ordered by the NUMBER (natural order, any
  digit set — Latin, Persian, Arabic-Indic). A pick holding several sequences lists them and the
  author picks one. Before anything converts, every problem is NAMED by file: a missing number, a
  frame of another size (each frame's 24-byte header is read), an unreadable header, and a second
  file carrying a number already taken. The author gives the rate (default: the project's channel
  rate), then continues or cancels. **Continue holds every hole:** the converter takes one frame per
  number from the first to the last, a missing or left-out frame showing the frame before it, so
  every frame keeps its time — never closed up, never scaled.
- **The SAME converter and modal as a clip (`D-128`).** The sequence becomes a source of the in-app
  ffmpeg.wasm converter beside a picked file: its frames are mounted zero-copy (`WORKERFS` blobs)
  under contiguous names and read by ffmpeg's `image2` input at the given rate, then conformed to the
  project's rate as any clip is. Crop, verify-before-store, the alpha checks and the result panel are
  unchanged. Progress counts the sequence's own frames. The result is ONE `video` asset and ONE
  `video` element. **No new element type.**
- **Provenance (schema, additive, optional).** `VideoProvenance.sequence` holds the first and last
  file names, the frame count and the rate. The Inspector shows `sequence  N frames · R fps`.
- **Dedupe.** The pre-convert key is a hash over the ordered frames (each length-prefixed, a held
  frame counted where it plays) plus the rate and the crop: re-importing the same frames at the same
  rate and crop offers the existing asset instead of re-encoding. A clip's hash is unchanged.
- **`B-342` (found on air while measuring).** The import's `Place element` put a clip's TOP-LEFT at the
  scene centre, so a full-frame clip drew three quarters off the frame. The fitted box is now centred.

## Impact

- `@cg/shared-schema` (`VideoProvenanceSchema.sequence`, optional — every stored asset still parses).
- The Designer: `features/assets/` (sequence finder, sequence step, video import modal, source hash,
  converter args and mount, Assets panel), the Inspector's provenance rows, and the `window.cg` bridge
  `assets.pick` (an optional `accept` hint — PNG / TGA, which no asset kind names).
- No change to the template runtime, the exporters, CG Control or CG Bridge: a sequence's asset is an
  ordinary `video` asset. No new AMCP command, no new port.
- Existing projects are unaffected; `B-342` only changes where a NEW import is placed.
