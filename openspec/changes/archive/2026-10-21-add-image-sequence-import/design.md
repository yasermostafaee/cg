# Design — `add-image-sequence-import` (`D-164`)

## §0 — measured before building

### 0.1 The `D-128` import path, end to end, and the one place a sequence plugs in

- **Entry:** `ProjectAssetsPanel.tsx` `importVideo` → `window.cg.assets.pick('video')` → `VideoImportModal`.
- **Modal:** `VideoImportModal.tsx` probes (`probeSource`), samples the source's alpha, optionally
  crops, hashes for dedupe (`source-hash.ts`, in a Worker), converts (`convertToWebm`), verifies the
  bytes decode, samples the output's alpha, stores with provenance (`window.cg.assets.storeBytes`),
  reads the stored asset back, checks the poster, and shows the result panel.
- **Converter:** `video-convert.ts` — single-threaded `@ffmpeg/core` 0.12.10, one mutex
  (`withExclusive`), the source mounted read-only by `WORKERFS` at `/mnt` (`mountSource`), the args
  built by `video-convert-args.ts` (`buildConvertArgs`: VP8 + alpha, `-r <project rate>`).
- **Element:** `placeVideoElement` → `fitVideoElement` → `guardedAddVideo` (the `D-151` duration guard).

**The one plug:** `mountSource`. Everything else reads a source through it, so a sequence is a second
KIND of source (`VideoSource = File | ImageSequenceSource`) rather than a second pipeline. The image2
input's options (`-framerate R -start_number 1`) must precede `-i`, so `buildConvertArgs` and
`buildPosterArgs` gained an `inputOptions` slot; a clip's args are byte-for-byte as before.

### 0.2 Memory — no copy into the wasm

`tools/spikes/png-sequence/` (committed `bba1be6d`) mounts the frames with `WORKERFS` `blobs`, each
renamed `000001.png …` in natural order; the worker reads each frame lazily. 300 frames of 1920 × 1080
RGBA PNG, 50 fps, Intel Core i5-10400 @ 2.90 GHz, 15.8 GB, Windows 11, system Chrome, the whole
browser's working set sampled:

| 300 × 1080p RGBA → VP8+alpha WebM         | zero-copy (WORKERFS blobs)   | copy (MEMFS)           |
| ----------------------------------------- | ---------------------------- | ---------------------- |
| light frames — 64.9 MB in (0.22 MB each)  | 58 s · browser 435 → 723 MB  | —                      |
| heavy frames — 1,311 MB in (4.37 MB each) | 130 s · browser 429 → 889 MB | 128 s · 438 → 2,120 MB |

Zero-copy holds the growth to about +300..+460 MB whatever the folder weighs; copying grows with the
folder. **No chunking is needed.** Shipped as measured.

### 0.3 Time

About **2.3 to 5 frames per second** on that CPU, single-threaded: 300 frames in 58–130 s, so a 30 s
sequence at 1080p50 (1,500 frames) takes roughly **5 to 11 minutes**. In the built app, 150 light
1080p frames converted in 20.4 s (§0.4's run). This is the converter `D-128` already ships; a faster
path (multi-threaded core) is the owner's call — see the report.

### 0.4 On air — the owner's local CasparCG

`D-128` already measured a clip on air: an owner-run ~2-hour hold loop on CasparCG 2.3.2 with no
visible stutter (`openspec/changes/archive/2026-07-27-video-import-element/design.md`, Phase 6). Only
the sequence case was added here, on the owner's local **CasparCG 2.5.0 69e8ad5** (`127.0.0.1:5250`,
channel 1 = 1080p50):

- **The template:** 150 frames of 1920 × 1080 RGBA PNG (a full-width white-to-transparent ramp,
  alpha 255 → 0 left to right, white under every alpha; a moving opaque square below it) imported
  through the built app's `Image sequence folder…` at 50 fps, placed, exported as single-file HTML,
  loaded by `CG 1-990 ADD 0 "<name>" 1` from the CasparCG template folder.
- **Alpha, measured on the channel:** an opaque colour producer under it (`PLAY 1-989 #FF000000`, then
  `#FFFFFFFF`) and `PRINT 1` after each. Over BLACK the ramp read its own alpha within **2 / 255**
  (row 450, every column); over WHITE it read **255 at every column — no darkening**. Straight alpha
  survives on air.
- **Frames, measured inside the page:** a copy of the template carried a `requestVideoFrameCallback`
  probe (each presented frame's media time) and one extra `connect-src` origin for its report, nothing
  else. `requestAnimationFrame` ran at exactly **50 per second**. Between loop points **every frame was
  presented — 0 skipped of about 600**. At each of 5 loop points, 1 to 6 frames were skipped (filed
  `B-343`, measure-only: a clip control showed the same per-wrap gap, so it is the hold loop's wrap,
  not the sequence).
- **`B-342`, found by the same probe:** the first runs read the video's box at `960, 540, 1920, 1080`
  — the import had placed the clip's top-left at the scene centre. Fixed here; the alpha and frame
  readings above are from the run after the fix (box `0, 0, 1920, 1080`).
- **Off air:** `CG 1-990 STOP 0`, `CLEAR 1-990`, `CLEAR 1-989`; `INFO 1` read back with no layer; the
  template copy and both prints deleted.

## Decisions

1. **Reuse `D-128`; no new element type.** The `video` element already carries everything a sequence
   needs — phases, hold (loop / freeze), scrub, both exporters, on air. Kept (§0 found no gap).
2. **Formats: PNG and TGA.** Both decode with alpha in the shipped core and survive within 2 / 255
   (spike). WebP decodes too, but the spike could not produce a WebP SEQUENCE to prove (system ffmpeg
   wrote one animated file), and JPG has no alpha — neither is offered (owner question in the report).
3. **The numbers never reach ffmpeg.** Frames are renamed `000001 …` in the order decided by
   `image-sequence.ts`, so gaps, padding and digit sets are decided where the author is told, never by
   ffmpeg's pattern matching.
4. **Continue HOLDS every hole** (`framesToConvert`). A missing number, a frame of another size and an
   unreadable frame each show the frame before it (the first usable frame before the first one), so
   the clip's length is `last − first + 1` frames and every frame plays at its number's time. Closing
   a gap up would pull every later frame earlier; scaling an odd frame would distort it. A second file
   on a taken number is named and not used.
5. **Rate:** asked, default the project's channel rate; the image2 input takes it as `-framerate`
   (never `-r`, which would re-time the input), and the output is conformed to the project's rate as a
   clip's is (`D-128` decision (d)) — the modal's existing fps notice says so when they differ.
6. **Dedupe key:** sha-256 over the ordered frames, each preceded by its byte length (8 bytes,
   big-endian) — so a byte moved across a frame boundary is a different key — plus `sequence.fps` in
   the hash-free half of the match (`matchesConversionParams`), beside the crop, target rate,
   corrections and converter revision. A single file hashes exactly as before.
7. **Progress in frames:** ffmpeg's own `frame=` count (output frames, at the project's rate) carried
   back to the author's rate and capped at the sequence's length: `Converting… frame N of M`.
8. **Cancel / failure:** unchanged from `D-128` — bytes are stored only from a verified, uncancelled
   conversion; the sequence step itself stores nothing.
9. **`B-342`:** `placeVideoElement` fits the box first, then centres it. The drag-from-assets door
   still places at the drop point.

## Risks

- **Large sequences are slow** (§0.3). Progress and Cancel are honoured throughout; the speed is the
  shipped converter's.
- **A held frame repeats a picture.** That is the point (timing kept), and the modal names every held
  slot before converting.
