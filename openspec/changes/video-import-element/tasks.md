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
- [ ] 1.5 OWNER-OWED to close Phase 1: (a) convert the REAL archive AVI with the spike page
      and attach its `metrics.json`; (b) drop BOTH artifacts on real CasparCG 2.3.2 and record
      the per-codec verdict (alpha punch-through / edge fringing / frame pacing — runbook in
      the spike README). Then record the verdict here and flip the design to the VP8 fallback
      FIRST if the verdict (or the in-browser encode reality) demands it.

## Phase 2 — schema + asset ingest + import UI (incl. the crop modal) + converter wiring

- [ ] 2.1 `@cg/shared-schema`: add `VideoElementSchema` + `VideoPhasesSchema` (design D1;
      additive, no schema-version bump); `VideoPlaceholderElementSchema` untouched (FROZEN —
      decision (f)). Schema unit tests: defaults (`holdBehavior: 'loop'`), phases ordering
      refinement, a bare pre-D-128 scene parses unchanged.
- [ ] 2.2 Widen the `video` `PickKind`'s import-side extensions (`asset-types.ts`) to the
      ffmpeg-decodable container list; stored canonical kind stays WebM.
- [ ] 2.3 Import modal: source preview, OPTIONAL crop region marking (position + width/height),
      conversion progress, cancellation. Crop bakes via ffmpeg `crop` at conversion; no crop ⇒
      full frame (PRD acceptance bullet 2).
- [ ] 2.4 Converter wiring behind the bridge (`designer-bridge.ts` → `src/platform/`): lazy wasm
      load on first import (never at startup, never from the network — PRD bullet 12), WORKERFS
      mount, `-an`, `yuva420p` (or the Phase-1 fallback), store as a `video` asset.
- [ ] 2.5 ProjectAssetsPanel video entry + tests (import lands, cancel cleans up, progress
      surfaces, wasm not loaded pre-import).

## Phase 3 — canvas render + Inspector

- [ ] 3.1 Scene-builder mounts the `video` element (poster frame, static) — distinct from
      `video-placeholder`'s `buildPlaceholder` path, which is untouched.
- [ ] 3.2 Inspector sections: hold behavior (`loop` default / `freeze`), `phases` marks
      (manual, ms), `drivesHold` opt-IN; registry declares the keyframe-able set
      (transform / opacity / filter). Never inner-content editing (opaque).
- [ ] 3.3 Timeline: the element is timed like any other; `durationMs` informs the span UI.
- [ ] 3.4 Tests: Inspector fields commit to schema; registry set; opaque boundary (no
      frame-level editing surface exists).

## Phase 4 — `@cg/template-runtime`: `VideoDriver` + lifecycle + the outro seam

- [ ] 4.1 `VideoDriver` joins the duck-typed content-driver contract (design D2): `reset` /
      `start` / `pause` / `resume` / `stop` / `destroy` / `whenComplete` + `playOutro()`; host
      carries `data-cg-content='video'`.
- [ ] 4.2 Lifecycle mapping: intro `[0 → introEnd]`, hold LOOPS `[introEnd → outroStart]` (or
      `idle`, or freezes opt-in), outro `[outroStart → end]`; absent `phases` ⇒ whole-clip
      intro, loop-all hold, no outro (decision (i)).
- [ ] 4.3 Join the ONE outro ledger: widen `runtime.ts:1492`'s `Map<LottieDriver, …>` to the
      shared outro-owner interface (recon C6 note) — never a second ledger; §D6.4.1
      always-resolve invariant holds for degenerate/destroyed/superseded video outros.
- [ ] 4.4 Anti-drift (design D3): pause = `video.pause()`, resume = re-seek to computed clip-time
      then play; driver-commanded loop wrap (never `<video loop>`); bounded drift correction per
      the spike's measured numbers.
- [ ] 4.5 Hold participation: `drivesHold: true` + `freeze` ⇒ completes at hold point;
      `drivesHold: true` + `loop` ⇒ never self-completes (infinite-driver flag applies);
      default does NOT drive (decision (j)).
- [ ] 4.6 Tests on the injected clock: intro → hold(loop) → ticker-driven hold over video →
      outro → CLEARED; pause/resume lockstep (mapping-level, per design D3's test split);
      outro exactly once per exit episode; degenerate outro settles immediately.

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
