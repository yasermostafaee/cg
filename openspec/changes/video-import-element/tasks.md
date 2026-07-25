# Tasks — video import element (D-128)

> PHASED — one phase per shippable PR. **Phase 1 gates everything after it: if VP9+alpha fails
> on CasparCG 2.3.x hardware, the design changes (VP8+alpha fallback, `-auto-alt-ref 0`) before
> any product surface is built.** Nothing below Phase 1 starts until the owner has the spike's
> hardware verdict.

## Phase 1 — SPIKE (`tools/spikes/`): converter feasibility + the hardware question

> Built as `tools/spikes/video-convert/` (branch `feat/d128-p1-convert-spike`). Key finding:
> **in-browser VP9 ENCODE crashes the single-thread `@ffmpeg/core` 0.12.10** (wasm OOB, first
> frame, alpha or not); **VP8+alpha converts flawlessly** through the identical pipeline. The
> two hardware artifacts carry VP8 (in-browser-converted) and VP9 (system-ffmpeg-encoded,
> provenance stamped) so ONE hardware session still answers the codec question.

- [x] 1.1 ~~Vendor~~ Deliver the single-threaded ffmpeg.wasm core (no CDN, no COOP/COEP —
      design D5 / decision (k)) — RESOLVED as npm delivery: `@ffmpeg/ffmpeg`+`@ffmpeg/core`+
      `@ffmpeg/util` as ROOT devDependencies, served same-origin from `node_modules` by the
      spike's `serve.mjs`; no binary in git, no LFS, no runtime network (decision recorded in
      design.md — the former OPEN item is closed).
- [x] 1.2 Spike page: converts rawvideo/BGRA AVI in the browser via WORKERFS lazy mount
      (proven: 1.93 GB input, 3.00 MB peak JS heap), with progress + cancel. Delivered as
      VP8+alpha (`libvpx`, `-auto-alt-ref 0`, `yuva420p`, `-an`) — VP9+alpha is BLOCKED by the
      upstream core bug above; the REAL client-archive AVI run is owner-owed (see 1.5).
- [x] 1.3 Measured and recorded (`results/*.json` + README table): fixture VP8 178 ms /
      4.6 KB; big-file 1.93 GB → 40.7 s, 659 KB out, 3.00 MB peak JS heap; seek ×20 max |Δ|
      0 frames, latency mean 2.2 ms / max 4.6 ms; 60 s hold-loop drift: 49 wraps, |drift| mean
      12.8 ms / max 26.6 ms, wrap seek ~1 ms, ZERO corrections at the 80 ms threshold —
      resume/wrap-only correction cadence suffices at this clip size (design D3's residual).
- [x] 1.4 Both single-file HTML artifacts exported (`artifacts/vp9-alpha-test.html` +
      `vp8-alpha-test.html`): inline base64, autoplay muted loop, transparent page, zero
      external requests, ES5 script; both pass the repo's `CEF_BANNED_BUILTINS` scan
      (`check-cef.mjs`, Chromium-71 baseline).
- [x] 1.5 HARDWARE VERDICT (owner, real CasparCG 2.3.2, 2026-07-22): **VP8+alpha renders with
      correct alpha punch-through and clean edges; VP9 is REJECTED** (its in-app encode is
      broken — @ffmpeg/core 0.12.10 OOB — so its playback is moot). **Codec DECIDED: VP8+alpha**
      (`libvpx`, `-auto-alt-ref 0`, `yuva420p`, `-an`); recorded as a dated DECIDED entry in
      design.md. The real multi-GB `rawvideo`/BGRA ARCHIVE clip has NOT yet been through the
      pipeline (only the 64×64 fixture has) — carried forward as the Phase-6 owner-verification
      item 6.3, NOT a Phase-2 blocker.

## Phase 2 — schema + asset ingest + import UI (incl. the crop modal) + converter wiring

> Landed on `feat/d128-p2-video-schema-ingest` (2026-07-22). Owner decisions applied during
> the phase: raw-bytes ingest seam with PROVENANCE (`AssetStore.importBytes` +
> `assets.storeBytes` + `VideoProvenanceSchema` on `AssetMeta` — `@cg/shared-ipc`); frame-rate
> CONFORM + WARN (`-r <Scene.frameRate>`, warning on mismatch, never a block); video is a
> per-PROJECT asset only (never the device-level library); the Live Source element
> (`video-placeholder`, D-137) stays file-source-free.

- [x] 2.1 `VideoElementSchema` + `VideoPhasesSchema` added per design D1 (ms-based phases,
      `holdBehavior` default `'loop'`, `drivesHold` inverse default) and registered in the
      three union sites; `VideoPlaceholderElementSchema` byte-untouched (FROZEN). Additive —
      no schema-version bump (the Lottie-addition precedent, verified: `CURRENT_SCHEMA_VERSION`
      stays 1, `migrations: []`). Tests: defaults, phase-ordering + idle-range rejection,
      union dispatch, placeholder-frozen, JSON round-trip (`elements.test.ts`,
      `video-element-defaults.test.ts`).
- [x] 2.2 `video` PickKind widened to the common ffmpeg-decodable containers (avi/mov/mkv/…,
      `asset-types.ts`); the STORED kind is always the converted WebM.
- [x] 2.3 `VideoImportModal`: probe (fps/dims/duration via ffmpeg banner parse + first-frame
      poster), OPT-IN crop — draggable rect (move + 4 corner handles) AND numeric x/y/w/h in
      two-way sync, clamped to source bounds — decision-(d) fps warning, determinate progress,
      working cancel (worker terminate; clean return to ready), store-then-place ordering.
      Probe RESILIENCE (added after the owner's first real-archive attempt failed opaquely):
      a probe failure shows the ffmpeg LOG TAIL; a failed poster downgrades to numeric-only
      crop; `Duration: N/A` sources measure the CONVERTED output (`measureDurationMs`).
      Tests: state machine, both sync directions, cancel-vs-error, provenance payload,
      log-tail/poster-less/N-A-duration paths (`video-import-modal.test.ts`, 12 tests).
      COMPLETION FIXES (owner-diagnosed in real use — see design.md "Phase-2 completion
      fixes"): app CSP gained `media-src 'self' blob: data:` (stored WebMs were CSP-blocked
      from decoding); converter lifecycle hardened in two rounds — reset-on-failure, then
      (after the owner's smoke showed good files alternating good→FS-error→good on a reused
      instance) a FRESH WORKER PER IMPORT by construction (`finally`-scoped reset on every
      convert outcome) — with reason-discriminated modal messages (`no-stream` vs
      `converter-crashed`); e2e guards in `tests/e2e/video-import.spec.ts`: the decode
      assertion (real conversion → blob `<video>` decodes → drag creates the element) AND
      back-to-back same-good-file imports (the exact field gap the first suite missed).
- [x] 2.4 Converter as REAL app code: `video-convert.ts` (lazy `import()`; core via `?url` +
      same-origin `toBlobURL`; WORKERFS mount; VP8+alpha `-an` `yuva420p` `-auto-alt-ref 0` + `-r` conform; cancel) + pure `video-convert-args.ts` (arg construction, probe-log
      parse, conform decision — 14 unit tests, no wasm in the gate). Vite:
      `optimizeDeps.exclude` for the wrapper; build verified emitting
      `dist/assets/worker-*.js` + `ffmpeg-core-*.js` + `ffmpeg-core-*.wasm` (32 MB)
      same-origin. `@ffmpeg/*` moved to `apps/designer` dependencies. NOTE: placed in the
      renderer per the LOTTIE precedent (validation-before-store runs renderer-side;
      `@cg/lottie-bridge` is imported by the panel) — the bridge seam still owns persistence
      via `assets.storeBytes`; recorded in design.md.
- [x] 2.5 ProjectAssetsPanel "Video…" entry (one clip at a time → the modal); place-on-confirm
      at scene centre + drag-from-assets drop (`insertVideoFromAsset`, `<video>` metadata
      probe of the STORED WebM) — both entry points, per the assets-only addendum; AssetThumb
      video drag; delete-warning + `removeAssetFromScene` video cascade;
      `AssetStore.importBytes` (dedupe shared with `importFile` via delegation) with the
      B-104-shape reload round-trip test (`asset-store-video-ingest.test.ts`, 6 tests).
      Canvas render remains a `buildPlaceholder` stub BY DESIGN (Phase 3).
- [x] 2.6 Converter REENTRANCY (owner's non-deterministic smoke root-caused — see design.md
      "Phase-2 converter reentrancy"): StrictMode's double probe effect raced the module's
      shared globals (two workers + stolen log sink + cross-call terminate → the field trio
      of bogus no-stream / FS error / success on ONE good file). Fixed at both layers:
      converter — single-flight `ensureLoaded`, per-call log/progress listeners (attach/
      detach around each exec), caller-scoped `dropWorker`, operation mutex (`withExclusive`,
      shared FS paths), abort-aware `probeSource(file, { signal })` with crash-vs-abort
      discrimination (`isAbortRejection` — a crash coinciding with an abort still drops the
      worker); modal — probe-effect cleanup ABORTS its in-flight probe, single-flight
      `loadConverter()` with reset-on-rejection, cancel honored even after the encode
      resolves (re-checked before measure and before `storeBytes`). Swallowed throws now
      `console.error` the real error (incl. encode-failure ffmpeg log tail). Tests:
      `video-convert-race.test.ts` (7 always-concurrent race tests incl. the generation
      guard and listener detach) + StrictMode double-mount (reject-on-abort, silent) and
      cancel-after-encode guards in `video-import-modal.test.ts`.
- [x] 2.7 Placement + progress-visibility fixes (owner field smoke): (a) drag-from-assets
      sized a clip at 1/4 the modal's size (it reused `lottieSize`'s 480px cap; a 1920×282
      source → 480×71). BOTH entry points now build the element through ONE shared
      `element-defaults.ts#fitVideoElement` (intrinsic size fit to the frame, zoom-independent,
      never upscales) — the drag path threads `scene.resolution` through `insertVideoFromAsset`.
      Image drag-drop did not share the bug (fixed 320² placeholder) and is untouched. (b) the
      convert progress bar moved from the scrollable modal body into the Modal shell's STICKY
      footer (`footerStack`, above the action row), so progress + % + buttons stay visible even
      when the fps warning + crop fields push the body past a short viewport. Tests:
      `video-element-defaults.test.ts` (sizing parity + the 1920×282 case) and a structural
      footer-placement guard in `video-import-modal.test.ts`.
- [x] 2.8 Pre-convert dedupe (owner field smoke: re-import re-encoded): the SOURCE sha256 is
      hashed BEFORE converting (streamed via `File.stream()` + `@cg/vcg-format#sha256HexOfChunks`,
      bounded memory; ~16 s for 1.93 GB, instant for the field clips) and stored in provenance
      (`sourceSha256`, additive/optional). `findDuplicateVideoAsset` matches source hash + target
      fps + crop; a match shows a 'duplicate' step with Use existing (places from the prior asset
      via shared `probeStoredVideo` — no re-encode) / Convert again; a different crop or fps still
      converts. Cancel aborts the hash. The post-convert sha dedupe stays as the backstop. Tests:
      `integrity.test.ts`, `source-hash.test.ts`, `video-convert-args.test.ts`,
      `video-import-modal.test.ts`.

## Phase 3 — canvas render + Inspector

- [x] 3.1 Scene-builder mounts the `video` element as a REAL `<video>` at its MID-CLIP poster
      frame (`scene-builder.ts#buildVideo`, mirroring `buildImage` + shared `applyBaseStyles`;
      distinct from `video-placeholder`'s untouched `buildPlaceholder`). The `src` is wired by
      the host from `data-cg-asset-id` → blob URL exactly like `<img>`: `assetUrlCache.prime`
      now accepts `video` (C5), and the designer canvas's `preview.ts#applyAssetUrls` handles
      `VIDEO` nodes and seeks the paused element to `data-cg-poster-ms` so frame 0 (often
      transparent) is never shown — decision (a): `phases.introEnd ?? clip midpoint`, mirroring
      the D-125 Lottie poster rule. Alpha (VP8 yuva420p) decodes with transparency; the element
      transform/opacity/filter apply via `applyBaseStyles`. (Runtime/export `<video>` src
      wiring — widening `runtime.ts`'s `img[data-cg-asset-id]` walk — is Phase 4/5.) CSP: the
      srcDoc canvas iframe inherits the page's Phase-2 `media-src 'self' blob:` (C1) — no CSP
      change. Tests: `template-runtime/video-render.test.ts` + the render e2e.
- [x] 3.2 Inspector `VideoSections` (`StyleSection.tsx`, decision (d)): hold behavior (`loop`
      default / `freeze`), `phases` marks as MANUAL ms inputs (In/Out, clamped, invariant
      introEnd ≤ outroStart; Add/Clear), `drivesHold` opt-IN (default off), a mid-clip poster
      preview (shared `VideoPoster`), and the READ-ONLY provenance note (decision (e) — source
      name, dims, conform, baked crop). Never inner-content editing (opaque). The keyframe-able
      set (transform / opacity / filter) was already declared `video: UNIVERSAL_ONLY` in the
      D-056 registry (Phase 2); the shared Filter section renders for parity. Tests:
      `video-inspector.test.ts`.
- [x] 3.3 Display refinements (owner add-on): the assets-panel tile shows the video's mid-clip
      poster (`AssetThumb` → shared `VideoPoster`, replacing the "VID" text stub) and the
      timeline layer row uses a distinct clapperboard icon (`layerTypeIcon` `case 'video'` →
      lucide `Clapperboard`, the "video file" glyph — not a camera; the cyan `TYPE_COLORS` entry
      already existed). Tests: `asset-thumb-drag.test.ts`,
      `layer-type-icon.test.ts`.
- [x] 3.4 Timeline: the element is timed like any other; `durationMs` informs the span UI
      (unchanged from Phase 2 — the schema/timeline already handle it).
- [x] 3.6 Phase-3 field fixes (owner smoke, 4 bugs): (1) a transform-only change no longer
      remounts a `<video>` — the iframe harvests + transplants live media nodes across the
      scene rebuild (`preview.ts#reconcileVideos`), so a drag never blanks the clip, plus honest
      media-error logging; (2) the video picker is single-select (`pickFiles`); (3) a cheap
      `File.size` pre-filter skips the up-front hash when no duplicate is possible, and the
      source hash for provenance is computed DURING the encode (0 s up-front wait for an empty /
      different-size project); (4) the crop control stays enabled in the duplicate step and the
      match re-evaluates live, so changing the crop returns to the normal convert flow. Tests:
      the drag-visible e2e, `pick-files.test.ts`, and `video-import-modal.test.ts` (Bug-3 empty
      vs size-match, Bug-4 crop-clears-duplicate).
- [x] 3.5 Poster helper shared across surfaces: `posterTimeMs` (rule) drives the import-modal
      SOURCE preview (ffmpeg `buildPosterArgs` gains a `-ss` mid-clip seek) and, via
      `VideoPoster` (a paused, seeked `<video>`), the canvas at-rest / Inspector / panel
      thumbnail. Honest note: one FRAME-SELECTION rule is shared, not one function — the modal
      preview must stay ffmpeg (the SOURCE isn't a browser-decodable WebM yet), the three
      stored-asset surfaces share `VideoPoster`. Tests: `video-convert-args.test.ts`.

## Phase 4 — `@cg/template-runtime`: `VideoDriver` + lifecycle + the outro seam

- [x] 4.1 `VideoDriver` (`video-driver.ts`) joins the duck-typed content-driver contract:
      `reset`/`start`/`pause`/`resume`/`stop`/`destroy`/`whenComplete` + `playOutro()`, over a
      `VideoHandle` abstraction (play/pause/seek/currentTime) so it is testable with a mock; the
      `<video>` host carries `data-cg-content='video'` (and `data-cg-outro='1'` when it owns an
      outro). Registered off a build-time `scope.videos` list (scene-builder `buildVideo` now
      takes `ctx` and pushes `{ element, container }`, mirroring `buildLottie`), NOT a DOM walk.
- [x] 4.2 Lifecycle mapping in the clip's own ms space: intro `[0 → introEnd]`, hold LOOPS
      `[loopStart → loopEnd]` (default) or FREEZES at `introEnd`, outro `[outroStart → duration]`.
      Absent `phases` ⇒ the runtime encodes intro `[0, duration]`, loop `[0, duration]`,
      `outroStart = duration` — the whole clip is the intro, the hold loops the whole clip, and
      the outro is degenerate (no outro; decision (b)).
- [x] 4.3 ONE outro ledger, widened: a shared `ElementOutroDriver { playOutro(): Promise<void> }`
      replaces `LottieDriver` on the ledger `Map` key, `ScopeNode.outroLotties`, the per-scope
      outro array, and `collectSubtreeOutros`/`collectElementOutros` — Lottie AND video outro
      drivers register in the SAME array/ledger, never a second one. The §D6.4.1 always-resolve
      invariant holds (a degenerate/destroyed/superseded video outro settles immediately).
- [x] 4.4 Anti-drift (design D3 / decision (e)): pause = `video.pause()` + capture the clock
      elapsed; resume = re-anchor + RE-SEEK to the clock-derived clip-time then play; loop wrap is
      DRIVER-COMMANDED (seek to loop start), never `<video loop>`; within-loop drift is corrected
      only past an **80 ms** threshold (the spike's number — max |drift| 26.6 ms, zero corrections
      at 80 ms), never per-tick, so no visible stutter.
- [x] 4.5 Hold participation: `drivesHold: true` + `freeze` ⇒ `whenComplete` resolves at the hold
      point; `drivesHold: true` + `loop` ⇒ never self-completes (infinite hold-driver, like an
      idle-loop Lottie); absent/`false` ⇒ does NOT drive — a ticker on top drives the hold and the
      video holds beneath (decision (c)). Read as `=== true` (OPT-IN), the inverse default.
- [x] 4.6 Tests on the injected clock: `video-driver.test.ts` (mapping, loop/freeze, bounded
      drift correction, pause/resume re-anchor, `playOutro` always-resolves, no-phase whole-clip
      loop) + `video-lifecycle.test.ts` via `createRuntime` (stop → outro → CLEARED
      content-first/background-last; no-phase carried by the content exit; `drivesHold` freeze
      auto-outs vs ticker-driven hold; the SHARED LEDGER serving a Lottie AND a video in one
      composition with no cross-talk — the regression guard for the type widening).

## Phase 4b — field fix: the canvas-blank class root-caused + the premultiplied default flip (2026-07-25)

- [x] 4b.1 ROOT CAUSE PROVEN (the missing piece: what the iframe's `<video>` reported):
      `PIPELINE_ERROR_DECODE` on the at-rest POSTER SEEK — NOT blob scope, NOT CSP, NOT a
      size threshold. ffmpeg/libvpx encodes the WebM alpha plane as a second VP8 stream
      (BlockAdditional) whose keyframes follow the alpha encoder's own schedule; a COLD seek
      (preload='metadata') into a GOP whose governing main keyframe carries an alpha INTER
      frame hands Chromium's fresh alpha decoder a reference-less frame → TERMINAL decode
      error, while sequential playback always decodes (full alpha history) — which is exactly
      why the strengthened playability verify passed these files honestly. Evidence: standalone
      harness (parent and srcdoc iframe fail IDENTICALLY; bytes fetch+hash identical in both;
      2.09 MB failed while 4.34 MB passed), deterministic GOP-band cold-seek maps, an
      alpha-stripped control encode with ZERO failures, and an EBML container walk showing a
      29/29 correlation: cold seek fails ⇔ alpha inter-frame at the governing main keyframe.
      Full detail in design.md "The canvas-blank ROOT CAUSE".
- [x] 4b.2 THE FIX — robust-canvas-render via ONE shared routine
      (`apps/designer/src/shared/video-poster.ts#attachRobustVideoPoster`): rung 1 seeks on the
      EAGER-load path (`preload='auto'` — measured safe on every previously-failing GOP);
      rung 2 recovers from any media error / seek stall with `load()` + muted sequential 16×
      decode to the poster time (the operation import verification PROVES; ~0.7 s for a 14 s
      clip), restoring `playbackRate`/paused for the VideoDriver; rung 3 surfaces failure —
      never a silently dead element. Wired into ALL stored-asset surfaces from the one source:
      the canvas iframe (serialized into the srcdoc document, replacing `seekVideoPoster`'s
      cold seek), `VideoPoster` (Inspector + assets-panel tile), and the modal (4b.3). The
      ENCODER IS UNTOUCHED: these files are legitimate broadcast assets (playout is sequential
      and airs them correctly) — rejecting them at import for a Chromium seek quirk would
      refuse working assets.
- [x] 4b.3 THE GUARD GAP closed as verify-on-canvas-path: after store + readback, the modal
      runs `verifyStoredPoster` — the SAME shared routine on the stored URL at the same
      `posterTimeMs` — so "import verified it" ⇒ "the canvas renders it" holds by construction
      (shared code, not a promise). A clip whose poster cannot be produced fails LOUDLY with
      its own message. Tests: `video-poster-robust.test.ts` (11 ladder-transition tests on a
      scripted fake element), `preview-video-poster-guard.test.ts` (generated-source contract,
      B-091 style), modal poster-parity + default tests, and
      `tests/e2e/video-canvas-render.spec.ts` against COMMITTED fixtures generated with the
      app's exact encoder args (`fragile-alpha-seek-320x90.webm` — container-verified alpha
      keyframes only in GOP 0, every cold seek from 1.0 s dies pre-fix, including the mid-clip
      poster; `seek-safe-64x64.webm` — the A/B control). The E2E was proven RED pre-fix with
      the exact field error, GREEN with the fix.
- [x] 4b.4 `Premultiplied alpha` DEFAULT flips OFF (owner decision, 2026-07-25): the ON
      default assumed the whole archive is premultiplied, but the field shows clips that are
      correct WITHOUT the correction and visibly damaged WITH it — a default must never degrade
      a correct file; the operator opts IN when a black fringe is actually visible. Help text
      rewritten symmetrically from the OFF-default perspective. Already-imported assets are
      untouched (each records its own `provenance.premultipliedAlpha`). FOLLOW-UP flagged, not
      built: provenance records the setting but the Inspector's provenance line does not
      surface it. Tests updated: modal default/opt-in unit tests; the fringe E2E now opts IN
      explicitly (its fixture IS premultiplied).

  **Phase 5 still owes the EXPORTER-side walk:** `runtime.ts`'s on-air/export asset-src walk is
  `img[data-cg-asset-id]`-only (Phase-3 note); Phase 5 widens it to `<video data-cg-asset-id>`
  (packaged relative path for `.vcg`, base64 `data:` for single-file) so a video renders + plays
  on-air. Phase 4 wired the driver + designer-canvas playback (preview.ts wires the src today);
  the runtime/export `<video>` src is Phase 5's.

## Phase 5 — both exporters + `cef-compat` + the size preflight

- [ ] 5.1 `.vcg`: video bytes into the package + `kind: 'video'` assetIndex entry (manifest seam
      exists — recon C2); package-relative reference; unzipped-dir CEF playback with zero
      external requests.
- [ ] 5.2 Single-file HTML: inline base64 `data:video/webm`; parity with preview and `.vcg`
      (PRD bullet 10).
- [ ] 5.3 Size preflight through the EXISTING issues path (threshold + warn-vs-block per the
      owner's OPEN decision); test at/over/under threshold.
- [ ] 5.4 `cef-compat.test.ts` passes against the video-bearing artifact (recon C7); exporter
      tests: bytes land in both outputs, sequence-item/nested-composition closure included.

## Phase 6 — CasparCG 2.3.x CEF hardware smoke — OWNER-VERIFIED (the pre-archive gate)

- [ ] 6.1 Real template on real hardware: alpha over live background, ticker-held graphic with
      video beneath, `stop()` outro-to-CLEARED, pause/resume, `file://` single-file boot with
      zero external requests.
- [ ] 6.2 Owner verifies on the affected machine; record the verdict here. Do NOT archive before
      this gate (the D-125 precedent).
- [x] 6.3 REAL-ARCHIVE verification (import half — 2026-07-23): the owner ran the client's
      actual `rawvideo`/BGRA ARCHIVE sources through the SHIPPED import pipeline successfully —
      **152 MB and 739 MB** clips imported (probe → crop → convert → place) with no error, which
      satisfies the "real multi-GB archive clip" import verification carried forward from Phase 1
      (previously only the 64×64 spike fixture had been through it). What remains for Phase 6 is
      the ON-AIR HARDWARE smoke of a FINISHED template CONTAINING a video element (6.1/6.2) — the
      export + CEF-playout leg, which depends on Phase 5's exporter walk.
