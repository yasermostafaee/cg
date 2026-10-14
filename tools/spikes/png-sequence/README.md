# png-sequence — `PNG-SEQUENCE-IMPORT-01` §0 spike

Measures, before anything is built, whether a numbered image sequence can go through the SAME in-browser converter
`D-128` ships for clips (`@ffmpeg/core` 0.12.10, single-threaded wasm, the Designer's own `VP8_ALPHA_ARGS`), without
copying the frames into memory. Spikes convention (`tools/spikes/video-convert/README.md` C3): plain `.mjs`/`.html`, no
`package.json`, outside turbo / tsc / eslint.

## How to run

```
node tools/spikes/png-sequence/serve.mjs                 # http://127.0.0.1:8198/ — pick frames by hand
node tools/spikes/png-sequence/measure.mjs FRAMES_DIR OUT_DIR           # WORKERFS blobs (zero-copy)
node tools/spikes/png-sequence/measure.mjs FRAMES_DIR OUT_DIR --copy    # comparison: every frame in MEMFS
node tools/spikes/png-sequence/check-ramp.mjs FRAME.rgba                # the alpha edge check
```

`measure.mjs` opens the page in system Chrome through the Designer's Playwright, picks every frame in `FRAMES_DIR`,
converts, and samples the WHOLE browser's working set (every Chrome process of its own profile — wasm linear memory
included, which `performance.memory` does not count), splitting the peak DURING the conversion from the spike's own
cost of handing the WebM back afterwards.

## How the frames enter the wasm — the one change to the converter

`WORKERFS` mounted with `blobs`, each frame renamed to a contiguous `000001.png …` in the frames' natural order, then
`-framerate R -start_number 1 -i /mnt/%06d.png` (the image2 input needs its rate BEFORE `-i`). The worker reads each
frame lazily; nothing is copied through JS or into wasm memory. Renaming makes gaps and any digit set (Persian digits
included) the importer's business, never ffmpeg's pattern.

## Measured — 2026-10-14, Intel Core i5-10400 @ 2.90 GHz, 15.8 GB, Windows 11, Chrome (system), single-threaded wasm

| 300 frames, 1920 × 1080 RGBA PNG, 50 fps → VP8+alpha WebM | zero-copy (WORKERFS blobs)    | copy (MEMFS)           |
| --------------------------------------------------------- | ----------------------------- | ---------------------- |
| light frames — 64.9 MB in (0.22 MB each)                  | 58 s · browser 435 → 723 MB   | —                      |
| heavy frames — 1,311 MB in (4.37 MB each, noise)          | 130 s · browser 429 → 889 MB  | 128 s · 438 → 2,120 MB |
| JS heap peak                                              | 2.5–2.7 MB                    | 2.9 MB                 |
| output                                                    | 15.7 MB / 62.6 MB, 300 frames | identical bytes        |

Zero-copy keeps the browser's growth at about +300 to +460 MB whatever the folder weighs (encoder state and frames in
flight); copying grows with the folder (+1.68 GB for 1.3 GB of frames). Speed is about 2.3–5 frames per second here:
a 30 s sequence at 1080p50 (1,500 frames) is roughly 5 to 11 minutes.

## Alpha — straight alpha survives

A 256 × 64 white ramp with source alpha = x, decoded back with system ffmpeg's `libvpx` (which reads the alpha plane):

| input | max alpha error                                                             | worst over WHITE   | worst error over BLACK |
| ----- | --------------------------------------------------------------------------- | ------------------ | ---------------------- |
| PNG   | 2 / 255                                                                     | 255 (no darkening) | 2                      |
| TGA   | 2 / 255                                                                     | 255                | 2                      |
| WebP  | 2 / 255 (one frame — system ffmpeg wrote one animated file, not a sequence) | 255                | 2                      |
| JPG   | — opaque (no alpha in the format)                                           | —                  | —                      |

The colour under every alpha stays exactly white: no premultiply, no pixel math on the default path. The 2 / 255 is
VP8's lossy alpha plane at `crf 4`. The image2 input is in the shipped core — no new wasm.
