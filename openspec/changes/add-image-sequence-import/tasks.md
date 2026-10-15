# Tasks — `add-image-sequence-import` (`D-164`)

## 1. §0 — measure first

- [x] 1.1 Read the `D-128` path end to end; the one plug is `mountSource` (design.md §0.1)
- [x] 1.2 Memory: 300 × 1080p RGBA through `WORKERFS` blobs, no copy — browser +288..+460 MB against
      +1.68 GB copied (`tools/spikes/png-sequence/`, `bba1be6d`)
- [x] 1.3 Time: 2.3–5 frames per second on an i5-10400 (58–130 s for 300 frames)
- [x] 1.4 On air, the owner's local CasparCG 2.5.0: alpha over black within 2 / 255, over white 255
      everywhere; 0 skipped frames between loop points, 1–6 at each loop point (`B-343`, the hold
      loop, not the sequence); everything taken off air and every file deleted (design.md §0.4)

## 2. Schema and converter (`8fa5968d`)

- [x] 2.1 `VideoProvenanceSchema.sequence` — `{ firstFile, lastFile, frameCount, fps }`, optional
- [x] 2.2 `ImageSequenceSource` beside `File` (`VideoSource`); `mountSource` mounts the frames as
      `WORKERFS` blobs renamed `000001.<ext> …`; `-framerate R -start_number 1` before `-i`
- [x] 2.3 `buildConvertArgs` / `buildPosterArgs` take input options; a clip's args unchanged
- [x] 2.4 `convertToWebm` reports encoded frames (`onFrame`); the dedupe match takes `sequenceFps`
- [x] 2.5 `image-sequence.ts`: find sequences (last digit run, any digit set; folder + prefix + suffix +
      extension), gaps, duplicates, header sizes (PNG IHDR, TGA header), size mismatches

## 3. The import (`48bd1efe`)

- [x] 3.1 `framesToConvert` — one frame per number, a hole held on the frame before it
- [x] 3.2 `ImageSequenceImportModal` — the sequences found, every problem named, the rate (default the
      project's), Continue / Cancel
- [x] 3.3 `VideoImportModal` takes a `VideoSource`: title, name, size, frames hash, `sequenceFps`
      dedupe, provenance `sequence`, progress `frame N of M`
- [x] 3.4 The source hash: ordered frames, each length-prefixed; one file hashed as before
- [x] 3.5 Assets panel `Image sequence…` / `Image sequence folder…`; bridge `assets.pick` takes an
      optional `accept` hint
- [x] 3.6 Inspector provenance row `sequence  N frames · R fps`

## 4. `B-342` — an imported clip is placed centred (`a15db1b3`)

- [x] 4.1 `placeVideoElement` fits the box, then centres it; filed in `docs/prd/bugs-designer.md`

## 5. Tests

- [x] 5.1 `image-sequence.test.ts` — natural order (Persian and Arabic-Indic digits), gaps by name,
      two sequences, duplicates, header sizes, size mismatches, `framesToConvert` holds
- [x] 5.2 `source-hash.test.ts` — a sequence's key (order, frame boundaries, held frames, abort); a
      file's key unchanged
- [x] 5.3 `video-convert-sequence-args.test.ts` — the image2 input, args, provenance, dedupe by rate
- [x] 5.4 `image-sequence-import-modal.dom.test.ts` — gap and odd frame named and held, two sequences,
      the rate, duplicates and left-out files, Cancel, unreadable headers
- [x] 5.5 `video-import-modal-sequence.test.ts` — one asset with `sequence` provenance, frames hashed,
      progress in frames, dedupe at the same rate and not at another, Cancel stores nothing; the clip
      suite (`video-import-modal.test.ts`) unchanged and green
- [x] 5.6 `place-video-centre.dom.test.ts` — `B-342`, red on the old placement (3 of 3)
- [x] 5.7 `e2e/image-sequence-import.spec.ts` — a folder with a gap through the real converter, the
      alpha ramp over black and over white (ablated: premultiplied colour fails it), two sequences and
      the same frames twice, Cancel at both steps. Local Windows: 3 passed
- [x] 5.8 Linux `e2e` RAN on the commit carrying the change —
      [38625458531](https://github.com/yasermostafaee/cg/actions/runs/38625458531) (`f0c3c062`, which
      carries this change and the `f934ff39` fix): the `E2E` step RAN and completed green — Designer
      319 passed / 13 skipped, Runtime 343 passed / 2 skipped; the three
      `image-sequence-import.spec.ts` cases passed (read from the run log). The earlier
      [38616898470](https://github.com/yasermostafaee/cg/actions/runs/38616898470) (`70dd1cad`) RAN
      the step but was red — `project-package.spec.ts:49`'s `/Image/` locator also matched this
      change's `Image sequence…` items (1 failed of 316), fixed in `f934ff39`.

## 6. Docs

- [x] 6.1 `D-164` filed `[~]` in `docs/prd/designer.md`; `B-342`, `B-343` filed; registry updated
- [x] 6.2 No engine doc changes: no engine's structure, contract or extension point moved (the
      template runtime, canvas, timeline and state are untouched)

## 7. `DELTA-RUN-NEXT-VERSION-01-G` — `B-345`: a pick never reached the import (FULL lane)

- [x] 7.1 Reproduced RED in a real Chrome before any fix: over CDP, `Page.setInterceptFileChooserDialog`
      held the dialog open and `HeapProfiler.collectGarbage` ran; setting the files then failed —
      "No node found for given backend id": the detached input was gone. (`tests/e2e/picker-held-input.spec.ts`, red 3 / 3)
- [x] 7.2 Fix: `apps/designer/src/platform/pickFiles.ts:32` — the `PENDING` set holds each input until
      its pick settles; the same spec green. (`25193ed0`)
- [x] 7.3 One picture through `Image sequence…` is refused with a sentence naming `Image…`; the modal's
      `sequence-single` callout disables Continue. (`25193ed0`; e2e `picker-held-input.spec.ts:136`
      for the sentence; `image-sequence-import-modal.dom.test.ts` for the callout — red with the
      guard ablated)
- [x] 7.4 `B-345` filed in `docs/prd/bugs-designer.md`; registry updated.
- [x] 7.5 Linux `e2e` RAN green on the pushed commit — https://github.com/yasermostafaee/cg/actions/runs/38701929266 (`39bbb5d4`, which carries it): `completed` / `success`; both heavy jobs RAN — Designer 333 passed / 13 skipped, CG Control 346 passed / 2 skipped, read from the run log; `picker-held-input.spec.ts` (3) and
      `image-sequence-import.spec.ts` (3) among the passed.

## 8. `DELTA-RUN-NEXT-VERSION-01-I` — `B-348`: far-apart pictures took the tab down (FULL lane)

- [x] 8.1 Reproduced RED in a real Chrome through both menu items: 38 PNGs named by 13-digit far-apart numbers — no
      answer in 15 s on either door (the owner's tab died of "Out of Memory"; the folder door showed nothing).
      (`image-sequence-scattered.spec.ts`)
- [x] 8.2 Located and measured: `image-sequence.ts`'s hole list (`findImageSequences`) and `framesToConvert` grew with
      the SPAN — the real code at 38 pictures: +4 MB at 10⁵, +13 MB at 10⁶, +247 MB / 310 ms at 10⁷; the owner's span
      ~5×10¹⁰.
- [x] 8.3 Fix: the span judged by arithmetic first (≤ 4 holes per picture to be one sequence; ≤ 30,000 frames to be
      listed); a pick with no sequence says why in one sentence; numbers too long to count are not frame numbers.
      (unit tests red with the refusal ablated — 7 s to list two million holes)
- [x] 8.4 The convert budget in pixels (3,000 frames of 1080p), refused in the sequence step before it starts —
      measured in Chrome's own processes: idle 65 MB; the 38 far-apart pictures 67 MB (+2); 300 frames of 1080p
      RGBA (172 MB of PNGs) peak 459 MB in 54 s; 900 frames (542 MB) peak 589 MB in 2.6 min.
- [x] 8.5 Already bounded, confirmed rather than changed: frame sizes from the PNG/TGA header (24 bytes, never
      decoded); frames mounted zero-copy into the converter (WORKERFS); the dedupe hash streamed chunk by chunk in a
      worker; progress in frames; Cancel leaves the project unchanged.
- [x] 8.6 `B-348` filed; registry updated.
- [ ] 8.7 Linux `e2e` RAN green on the pushed commit — run URL here.
