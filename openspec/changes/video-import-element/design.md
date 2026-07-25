# Design — video import element (D-128)

## Recon — verified state of the claims this change is built on (2026-07-22, branch off `79e208f`)

Each claim below was verified by reading the code on this branch, not assumed. What EXISTS is
plumbing; what must be ADDED is the product.

- **C1 — TRUE.** `docs/prd/designer.md` had no D-128 heading before this change; the highest
  allocated item was D-127 (this filing adds D-128…D-139). No `D-128` token existed anywhere in
  the repo, on any ref.
- **C2 — TRUE.** `packages/shared-schema/src/manifest.ts:10` — `AssetEntrySchema.kind` is
  `z.enum(['image', 'lottie', 'font', 'video', 'audio'])`; the manifest already admits video
  assets.
- **C3 — TRUE.** `apps/designer/src/shared/asset-types.ts` has a `'video'` `PickKind`
  (`accept: 'video/*'`, extensions `mp4`/`webm`);
  `apps/designer/src/platform/AssetStore.ts:19-20` maps `mp4`/`webm` → `'video'` in
  `KIND_BY_EXT`; `apps/designer/src/platform/createDesignerBridge.ts:441` has the
  `kind === 'video'` MIME branch (`video/webm` / `video/mp4`).
- **C4 — TRUE.** `packages/shared-schema/src/elements.ts:828-833` —
  `VideoPlaceholderElementSchema` (`type: 'video-placeholder'`, `posterAssetId?`,
  `expectedAspect`, `routeKey`); `packages/template-runtime/src/scene-builder.ts:182-186` renders
  it through `buildPlaceholder`. It is FROZEN for this change (see Decisions) — D-137 implements
  it for its original Live Source purpose (user-facing name "Live Source"; the schema type stays
  `video-placeholder`).
- **C5 — TRUE.** No `video` element type exists (`z.literal('video')` / `VideoElementSchema`
  absent from `elements.ts`); `ProjectAssetsPanel.tsx` has no video import entry (zero `video`
  tokens); `apps/designer/src/platform/Exporter.ts` has no video branch (its only `video` tokens
  are the MIME table at lines 614-617); `packages/single-file-export/src/` has no video branch
  (the only hits are inside the generated `cg-runtime-bundles.ts`, which is build output).
- **C6 — TRUE.** The D-125 element-outro seam exists in `@cg/template-runtime`:
  `runtime.ts:1492` (`outroLedger`, the one-shot ledger), `runtime.ts:1493-1510`
  (`playElementOutrosOnce`), `lottie-driver.ts:219` (`playOutro()`), with the always-resolve
  invariant (§D6.4.1) documented at `lottie-driver.ts:27` and `runtime.ts:1488`. Archived design:
  `openspec/changes/archive/2026-07-19-lottie-lifecycle-element/design.md` §D6 (the seam), §D3
  (the anti-drift architecture). NOTE for Phase 4: the ledger is typed
  `Map<LottieDriver, …>` — joining the seam means widening that type to the common
  outro-owning-driver interface, not adding a second ledger.
- **C7 — TRUE.** `packages/single-file-export/tests/cef-compat.test.ts` scans the exported
  artifact for `CEF_BANNED_BUILTINS` (imported from `@cg/eslint-config`; one curated list shared
  with the lint side, `packages/eslint-config/src/rules/cef-compat.ts`).

## D1. Schema — `VideoElementSchema` + `VideoPhasesSchema` (time-based)

A NEW element type alongside — never replacing — `VideoPlaceholderElementSchema`:

```ts
/** D-128 — phase marks in the CLIP'S OWN TIME SPACE (ms from clip start). OPTIONAL and
 *  MANUAL — video has no bodymovin `markers` equivalent. Absent ⇒ the whole clip is the
 *  intro, the hold loops the whole clip, and there is no outro. */
export const VideoPhasesSchema = z
  .object({
    /** End of the IN phase (ms). The hold point. */
    introEnd: z.number().nonnegative(),
    /** Start of the OUT phase (ms); the outro is [outroStart → clip end]. */
    outroStart: z.number().nonnegative(),
    /** Optional hold segment looped instead of [introEnd → outroStart]. */
    idle: z.object({ start: z.number().nonnegative(), end: z.number().nonnegative() }).optional(),
  })
  .refine((p) => p.introEnd <= p.outroStart, { message: 'introEnd must not exceed outroStart' });

export const VideoElementSchema = ElementBaseSchema.extend({
  type: z.literal('video'),
  /** The converted canonical WebM asset (the ONLY stored form). */
  assetId: IdSchema,
  /** Clip duration in ms, captured at conversion (validation + timeline span). */
  durationMs: z.number().positive(),
  /** D-128 (d): hold behavior — the INVERSE of the Lottie's default. */
  holdBehavior: z.enum(['loop', 'freeze']).default('loop'),
  /** D-128 (j): the Lottie's inverse default — absent/false ⇒ does NOT drive the hold. */
  drivesHold: z.boolean().optional(),
  /** Manual phase marks; absent ⇒ whole-clip intro, loop-all hold, no outro. */
  phases: VideoPhasesSchema.optional(),
});
```

Time-based (ms), NOT frame-based: unlike bodymovin (which declares `fr`/`ip`/`op`), a WebM clip's
authoritative axis is time; frame rate is an encoding detail the browser does not expose
reliably. Exact field names/shape may be adjusted at implementation; the decisions that may NOT
be adjusted are (d), (f), (i), (j) in `proposal.md`/the PRD item. All additions are optional or
new-type — no schema-version bump.

## D2. Joining the D-125 element-outro seam and the content-driver contract

`VideoDriver` (new, `@cg/template-runtime`) joins the duck-typed content-driver contract exactly
as `LottieDriver` did (archived design §D3, final paragraph): `reset()` / `start()` / `pause()` /
`resume()` / `stop()` / `destroy()` / `whenComplete()` — plus **`playOutro(): Promise<void>`**,
the seam member (§D6.2). Its host carries `data-cg-content='video'` so D-105 content selection
and the fade/hide exclusion work unchanged: like the Lottie (§D6.2, first bullet), a video that
owns an outro is EXCLUDED from `fadeContentOut`/`hideContentNow` (it animates itself); a video
with NO outro is carried by the existing content exit unchanged (the PRD's eighth acceptance
bullet).

Seam mechanics inherited as-is (§D6.2b): the one-shot outro ledger drives each element outro at
most ONCE per exit episode on EVERY exit path (operator `out()`/`stop()`, auto-out expiry,
content-driven completion, zero-length holds, loop-cycle boundaries); the background close plays
only after `Promise.all` of the element outros; §D6.4.1's invariant — **`playOutro()` ALWAYS
resolves** — binds `VideoDriver` too: a degenerate outro (absent `phases`, `outroStart` at/past
clip end), a destroyed driver, or a superseding `stop()`/`play()`/`out()` all settle the promise
immediately. Implementation note from recon C6: `runtime.ts:1492` types the ledger
`Map<LottieDriver, …>`; Phase 4 widens that to the shared outro-owner interface (one ledger, two
driver kinds — never a parallel second ledger).

`whenComplete()` (hold participation, opt-in via `drivesHold: true`) and `playOutro()` (exit)
stay SEPARATE promises, per §D6.3. Completion semantics for a video that drives the hold: with
`holdBehavior: 'freeze'` the clip completes on first reaching the hold point; with `'loop'` it
never self-completes (exactly an infinite ticker — the D-107 flag on infinite hold-drivers
applies). This mirror of the existing model is asserted in the spec delta.

## D3. The anti-drift question — `<video>` has its OWN clock

This is the one place the Lottie architecture does NOT transfer. §D3 of the archived design got
zero drift BY CONSTRUCTION: lottie-web renders whatever frame the driver computes
(`goToAndStop`), so the injected `RuntimeClock` is the only clock. A `<video>` element is the
opposite — playback advances on the media element's own clock (its `currentTime`), which the
page does not tick.

Stated plainly rather than hand-waved:

- **Pause/resume lockstep is achievable exactly:** `pause()` → `video.pause()` (currentTime
  freezes); `resume()` → re-seek to the driver's computed clip-time
  (elapsed active time mapped through phases/loop arithmetic) then `video.play()`. The re-seek on
  resume — not trusting the element to have stayed aligned — is the mechanism.
- **Drift DURING free playback is real and must be bounded, not assumed away:** the driver
  compares `video.currentTime` against its clock-derived expected clip-time each tick and
  re-seeks when the error exceeds a threshold; loop wrap is driver-commanded (seek to loop
  start), never `<video loop>` (whose wrap timing the driver cannot observe or control).
- **The honest residual: seek latency and its on-air visibility (a stutter on correction, seek
  precision on VP9 keyframe spacing) cannot be designed from the armchair — the Phase-1 spike
  must MEASURE it** on the converted archive clip (seek-accuracy and correction-visibility
  numbers are spike deliverables). If measured drift within a hold loop is negligible, the
  correction threshold can be generous (correct only on resume/wrap); if not, per-tick bounded
  correction is the fallback. The deterministic-test story (fake clock) covers the driver's
  MAPPING (time → expected clip-time → seek commands), not the media element's real decode —
  same split the ticker uses for real text measurement.

## D4. Export — both exporters, and why the size preflight exists

- **`.vcg`:** the `video` asset's canonical WebM bytes land in the package with a
  `kind: 'video'` assetIndex entry — the manifest seam already admits it (recon C2); the
  package-relative reference resolves under CEF from the unzipped dir with zero external
  requests. Mirrors the D-121 font seam.
- **Single-file HTML:** the bytes inline as a base64 `data:video/webm` URL, exactly like images
  (D-040) and fonts (D-121). Base64 inflates by ~4/3: video is the first asset class where tens
  of MB is NORMAL (a 30 MB clip → ~40 MB of markup inside one HTML file), so a threshold check
  joins the EXISTING preflight/issues path — report before export rather than emit a file CEF
  cannot boot or parse acceptably. The threshold value, and warn-vs-block, are OPEN (below);
  the spike's real artifact informs both.
- **`cef-compat`:** the exported artifact (with `VideoDriver` code in the bundle) must keep
  passing `cef-compat.test.ts`'s banned-builtins scan (recon C7); the video code path adds no new
  builtins beyond `HTMLVideoElement` APIs available at the CEF Chromium baseline — asserted by
  that existing test running against the new artifact.

## D5. Conversion pipeline (import-side, one canonical form)

ffmpeg.wasm, single-threaded core, VENDORED into the workspace (decision (k)): no CDN fetch (the
Designer is a static-file SPA with no control over response headers, so the multi-threaded
core's COOP/COEP requirement is unavailable anyway, and P-001 forbids the network fetch). Loaded
LAZILY on first import — never at Designer startup. Source files mount via WORKERFS (lazy reads —
a multi-GB AVI is never loaded whole into memory); progress surfaces from ffmpeg's progress
callback; cancellation terminates the worker. The conversion command bakes: optional `crop`
(exact region from the import modal), alpha-preserving VP9 (`yuva420p`), `-an` (audio STRIPPED,
decision (h)). Output is the ONE canonical stored WebM (decision (g)) — preview and both
exporters render identical bytes; nothing ever re-touches the source AVI after import.

## D6. Designer surface

- Import entry beside image/font/lottie in `ProjectAssetsPanel` (recon C5: absent today), routed
  through the same post-pick validation (`asset-types.ts` widens the `video` PickKind's
  extensions to the import-side container list; the STORED kind stays webm-only).
- The import modal: source preview (first decodable frame), optional crop marking
  (position + width/height), progress, cancel. Crop UI intentionally rhymes with D-129's
  render-time Lottie crop so the two feel like ONE feature (mechanism stated in-UI where it
  matters: bake vs render-time).
- Inspector: poster/preview frame, `holdBehavior`, `phases` marks, `drivesHold` — never inner
  content (opaque by design). Keyframe-able set mirrors the Lottie's (transform / opacity /
  filter), declared in the D-056 registry.
- Canvas renders the poster frame (static); scrub-driven frames are D-135's item, not this one.

## Phase-1 spike results (2026-07-22, `tools/spikes/video-convert/`)

**DECIDED — wasm delivery is npm, closing the former "vendored wasm binary vs git" OPEN
item:** `@ffmpeg/ffmpeg` 0.12.15 + `@ffmpeg/core` 0.12.10 (single-thread) + `@ffmpeg/util`
as ROOT devDependencies; the core JS/wasm are served to the page from `node_modules` as
same-origin URLs (the product build copies them as build assets the same way). No binary in
git, no LFS, no runtime network — P-001 and decision (k) hold as written; C4 confirmed
empirically (zero `SharedArrayBuffer` references, no COOP/COEP anywhere).

**FINDING — in-browser VP9 ENCODE is broken in the current core:** `libvpx-vp9` crashes the
0.12.10 single-thread worker (`RuntimeError: memory access out of bounds`, first frame,
alpha or no alpha, any deadline). **VP8+alpha (`libvpx`, `-auto-alt-ref 0`) converts
flawlessly** through the identical pipeline. Until an upstream core fix lands, the pipeline
can only PRODUCE VP8+alpha — so the codec question is two-sided: CEF playability (hardware,
below) AND in-app producibility. The hardware artifacts carry both codecs anyway (VP8 from
the real in-browser pipeline; VP9 encoded by system ffmpeg, provenance stamped) so one
hardware session still answers the playback half.

**Measured (Windows 11, Chrome 150 headless, ST wasm):** fixture (64×64/1.6 s/647 KiB
rawvideo-BGRA AVI): VP8 in-browser 178 ms → 4.6 KB. Big file (1920×1080/10 s/**1.93 GB**):
VP8 in-browser **40.7 s** → 659 KB, **peak JS heap 3.00 MB** — WORKERFS lazy mount proven
bounded. Seek harness (×20): max |Δ| **0 frames**, latency mean 2.2 ms / max 4.6 ms. 60 s
hold-loop drift harness (driver-commanded rAF wrap): 49 wraps, |drift| mean 12.8 ms / max
26.6 ms, wrap seek ~1 ms, **zero corrections** at an 80 ms threshold — D3's
"resume/wrap-only" correction cadence suffices at this clip size; re-measure on the real
archive clip. Raw data: the spike's `results/*.json`; runbook + caveats in its README.

**DECIDED (owner, real CasparCG 2.3.2 hardware, 2026-07-22) — the codec is VP8+alpha.** The
owner ran both Phase-1 artifacts on real 2.3.2: **VP8+alpha renders with correct alpha
punch-through and clean edges**; **VP9 is REJECTED** — its in-app encode is broken (the
0.12.10 core OOB above), so its playback verdict is moot. The conversion command is
`libvpx` + `-auto-alt-ref 0` + `yuva420p` + `-an` (+ the Decision-(d) `-r` conform). VP9
stays out until a future `@ffmpeg/core` fixes the encode OOB — revisit only then, as a NEW
decision. This closes the former "CEF ~71 VP9+alpha" OPEN item.

## Phase-2 implementation record (2026-07-22, `feat/d128-p2-video-schema-ingest`)

**Claims re-verified for this phase (C1–C5, all TRUE):** (C1) `VideoPlaceholderElementSchema`
untouched at `elements.ts` — the new `VideoElementSchema` sits beside it; (C2) the asset layer
already accepted video (`AssetKindSchema`, `KIND_BY_EXT` mp4/webm, the bridge MIME branch) but
had NO raw-bytes ingest — added as `AssetStore.importBytes` (below); (C3) the Lottie pattern
mirrored end-to-end: panel `importKind` → validation → `assets.store`, asset-only creation
(no toolbar tool), drag-from-panel via `application/x-cg-asset-kind`, `defaultLottie` factory,
`addElement`; (C4) the spike's WORKERFS + VP8 invocation lifted into
`renderer/features/assets/video-convert.ts` with the REAL Vite wiring: `optimizeDeps.exclude`
for `@ffmpeg/ffmpeg`+`@ffmpeg/util` (keeps the wrapper's `new Worker(new URL('./worker.js',
import.meta.url))` resolvable), core js+wasm as `?url` build assets fetched same-origin via
`toBlobURL` — build verified emitting `dist/assets/worker-*.js` + `ffmpeg-core-*.{js,wasm}`;
(C5) the Designer shipped NO wasm/worker before this — ffmpeg is the first; `index.html`'s CSP
already admits it (`worker-src 'self' blob:`, `script-src … 'unsafe-eval' blob:`) — the no-CDN
rule is enforced by CODE (only same-origin URLs are ever passed), not by CSP.

**Layer decisions taken (with owner sign-off where noted):**

- **Raw-bytes ingest + provenance (OWNER-DECIDED):** `AssetStore.importBytes(bytes, filename,
kind, provenance?)` is the ONE write path — `importFile` delegates to it — same
  dedupe-by-sha / path scheme / index+persist+emit, so both ingests inherit any B-104 fix
  together. Bridge: `assets.storeBytes` (`AssetsStoreBytesChannel`). `AssetMetaSchema` gains an
  optional `provenance?: VideoProvenanceSchema` (`sourceFilename`, `sourceFps`, `targetFps`,
  `sourceWidth/Height`, optional `crop` in source px) — the re-edit lineage; the crop is BOTH
  baked into the bytes (what plays) AND recorded here (what a future re-crop starts from).
  Playout facts stay on the ELEMENT per D1 (`durationMs`, `phases`, `holdBehavior`,
  `drivesHold`).
- **The element carries NO crop field** (decided per D1's intent): the stored WebM is the
  single truth; crop lives only in provenance.
- **Frame-rate CONFORM + WARN (OWNER-DECIDED, decision (d)):** every conversion writes `-r
<Scene.frameRate>` (the single project-level rate, read synchronously from the store);
  a source-rate mismatch shows a consequence-stating warning and NEVER blocks; an unknown
  source rate conforms silently.
- **Per-project asset ONLY (OWNER-DECIDED):** video never enters the device-level library —
  the conformed WebM is project-rate-specific, hence non-portable. Two entry points to the
  same element: the modal's place-on-confirm (scene centre) and drag-from-assets
  (`insertVideoFromAsset`, `<video>` metadata probe of the stored WebM).
- **Converter placement:** `renderer/features/assets/` (not `src/platform/`) — the LOTTIE
  precedent: pre-store validation/processing runs renderer-side (`@cg/lottie-bridge` is
  imported by the panel); persistence still crosses the bridge seam via `assets.storeBytes`.
- **Probe resilience (from the owner's first real-archive attempt):** a probe failure carries
  the ffmpeg LOG TAIL into the modal (never a dead-end message); a failed poster extraction
  downgrades to a preview-less (numeric-only) crop instead of aborting; `Duration: N/A`
  sources convert anyway and the DURATION IS MEASURED FROM THE CONVERTED OUTPUT
  (`measureDurationMs`), which is the authoritative clock regardless.
- **Canvas render is a `buildPlaceholder` stub BY DESIGN** — the poster/canvas render is
  Phase 3; Phase 2 registered the compile-forced union sites only (`field-registry`,
  `TYPE_COLORS`, `scene-builder`).

## Phase-2 completion fixes (2026-07-22, same branch — owner-diagnosed in real use, approved)

- **CSP `media-src` (the decode-block root cause):** the app CSP had no `media-src`, so
  `default-src 'self'` blocked every `blob:` `<video>` — stored WebMs were byte-perfect but
  undecodable ("Media load rejected by URL safety check"). `index.html` now carries
  `media-src 'self' blob: data:`. The canvas preview iframe is `srcDoc`
  (`CanvasArea.tsx:937`) and srcdoc documents INHERIT the embedding page's CSP — so Phase 3's
  in-canvas `<video>` render is covered by this same line; no per-frame CSP needed.
- **Converter worker lifecycle — FRESH WORKER PER IMPORT (the final form):** a hard ffmpeg
  abort taints the wasm worker; the cached singleton then threw `ErrnoError: FS error` on the
  NEXT import. The first fix reset on FAILURE paths only — but the owner's real-file smoke
  then showed back-to-back imports of KNOWN-GOOD files alternating good → FS error → good:
  some wasm FS/runtime state survives even a fully SUCCESSFUL convert-with-hygiene, in ways
  clean-room probes could not reproduce (same file ×3, 103 MB disk-backed, ASCII/U+2026/
  Persian filenames, 1920×282 odd dimensions — all green). Rather than gamble on path tricks,
  the state-carryover CLASS is eliminated by construction: `convertToWebm`'s `finally` drops
  the worker on EVERY outcome (success, failure, cancel), so each import starts virgin; the
  probe still shares its instance with its own convert (one core load per import, ~150–350 ms,
  invisible next to the conversion). Failure paths additionally reset immediately, and the
  probe failure carries a `reason` discriminator so the modal NEVER blames the file for a
  converter crash (`no-stream` → file-level message + ffmpeg log tail; `converter-crashed` →
  "reload and retry"). Contract pinned by `video-convert-reset.test.ts` (7 tests, incl.
  never-share-across-imports); end-to-end by `tests/e2e/video-import.spec.ts` — the decode
  guard (would have caught the CSP hole) AND the back-to-back same-good-file test (the exact
  field gap the first suite missed).
- **The shipped core is the FULL GPL build — do not re-open "do we need a fuller core":** the
  configure line embedded in the shipped `ffmpeg-core.wasm` (0.12.10) is
  `--enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx …` with NO
  `--disable-decoders`/allowlist, and a live `-decoders` run through the bundled core confirms
  h264/hevc/vp8/vp9/av1/mpeg4/rawvideo/prores/qtrle video decode + aac/mp3/opus/vorbis/pcm
  audio decode, with QuickTime-MOV/MP4, Matroska/WebM, AVI and raw-video demuxers. Per-file
  probes of H.264 MP4, H.264 MOV, VP9/VP8 WebM and the rawvideo AVI all identify their streams
  cleanly on fresh instances. The client's AVI/MOV/MP4 set is fully covered as-is
  (single-threaded, same-origin, 32 MB — unchanged).

## Phase-2 converter reentrancy (2026-07-23, same branch — StrictMode-exposed race, root-caused from the owner's non-deterministic smoke)

- **The symptom that named the class:** the owner's real-machine smoke imported the SAME
  known-good file (`Logo_HazratKhadije_1.avi`) repeatedly and got THREE different outcomes —
  probe "no decodable video stream", probe OK with correct alpha preview, and
  "ErrnoError: FS error". Non-determinism on one input is a RACE signature, not lifecycle;
  fresh-worker-per-import (above) was necessary but could not have fixed this.
- **Root cause — two concurrent `probeSource` calls stomping module globals:** React
  `<StrictMode>` (`main.tsx`) double-invokes the modal's probe effect in dev — mount →
  cleanup → mount — and the old cleanup only flipped `alive = false` without cancelling the
  in-flight probe, so TWO probes raced `video-convert.ts`'s shared state. (A fast modal
  close/reopen manufactures the same race in prod, so silencing StrictMode would only have
  hidden a real bug.) The three field outcomes map one-to-one onto the three collisions:
  non-mutex `ensureLoaded` built TWO workers and orphaned one alive; the module-global
  `logSink` was overwritten by the second call, so the first probe's banner landed in the
  wrong `lines[]` → empty log → `parseProbeLog` null → bogus "no-stream" (blaming a good
  file); and `resetInstance()` from one call terminated whatever `instance` pointed at — the
  OTHER call's live worker → its next FS op threw "ErrnoError: FS error". The unit suite
  missed it because no test ever raced two calls; the clean probe environment missed it
  because slower timing never overlapped the two probes.
- **The fix — reentrancy-safe by construction, at BOTH layers:**
  1. _Single-flight load:_ `ensureLoaded` shares ONE in-flight load promise; concurrent
     callers can never construct two workers (the old check-then-act race).
  2. _Per-call sinks:_ log/progress listeners are attached around each exec and detached in
     `finally` — a verdict is computed only from the caller's OWN exec lines; no module-global
     sink exists to steal. (Worker messages are ordered, so every log line of an exec arrives
     before that exec's promise resolves — the "truncated log" was sink theft, never late
     flushing.)
  3. _Caller-scoped reset:_ failure paths call `dropWorker(held)` — they drop only the worker
     THAT call was using, never a replacement a later call owns. `cancelConversion` remains an
     intentional hard interrupt (`hardReset` + a generation counter so a load in flight during
     a cancel discards itself).
  4. _Operation mutex:_ probe/convert bodies run one-at-a-time (`withExclusive`), because they
     share wasm FS paths (`/mnt`, `/poster.png`, `/out.webm`) on a single-threaded core —
     without it, two interleaved calls could still unmount each other's input mid-exec.
  5. _Abort-aware effect (the leak fixed at its source):_ `probeSource` takes an AbortSignal
     and REJECTS on abort (checked between ops — an abort never terminates a healthy shared
     worker); the modal's probe-effect cleanup now ABORTS its in-flight probe instead of
     merely ignoring the result, and the modal's dynamic module import is single-flight too
     (`loadConverter()` — racing mounts share one import, and a REJECTED import clears the
     cache so a failed chunk fetch is retryable, mirroring `ensureLoaded`).
  6. _Abort ≠ crash (adversarial-review catch):_ the reset-skip discriminates on the ERROR,
     not the signal flag (`isAbortRejection`) — a real exec crash that merely coincides with
     an aborted signal (the flag can flip mid-exec) still drops the worker; only the abort
     thrown between ops leaves it cached. And the modal honors a cancel that lands AFTER the
     encode resolves: `cancelled.current` is re-checked before the measure and before
     `storeBytes` — an acknowledged cancel can never commit the asset anyway (once
     `storeBytes` begins, the import commits; reverting a stored asset is not this seam's
     job).
- **Honest error reporting (kept from the diagnostic pass):** the previously-swallowed throws
  now reach the console before the friendly modal message — `probeSource`/`convertToWebm`
  `console.error` the real underlying error, a failed encode logs the ffmpeg log tail (making
  the modal's "see the console log" message true), and a rejected probe exec is no longer
  masked into "code 1 + empty log" (which used to misread a converter crash as "no-stream"
  and blame a good file).
- **Contract pinned by:** `video-convert-race.test.ts` (7 tests — two ALWAYS-CONCURRENT
  probes both succeed on one shared worker with listeners detached after; a no-stream probe
  racing a good one never kills the good one's worker AND carries the file's own log tail;
  abort rejects `AbortError` without touching the cached worker, both pre-queued and
  mid-queue; cancel mid-convert still yields a fresh next import; cancel DURING the worker
  load discards the loading worker via the generation guard; a crashing probe surfaces the
  real error) and, in `video-import-modal.test.ts`, the StrictMode double-mount test (first
  probe REJECTED by cleanup's abort — silently, never a "converter crashed" callout — while
  the survivor drives the modal to a working import) plus the cancel-after-encode test
  (a cancel landing after `convertToWebm` resolves still stores nothing). The pre-existing
  suites missed the bug precisely because they never raced two calls — the race tests exist
  to keep it that way.

## Phase-2 placement + progress-visibility fixes (2026-07-23, same branch — owner's field smoke)

- **Drag-from-assets sized a clip at 1/4 the modal's size — ONE sizing seam now:** the two
  entry points to a `video` element had diverged. The import modal's place-on-confirm fit the
  clip's INTRINSIC dimensions to the project frame (`min(res/​src, 1)`); the drag-from-assets
  drop instead reused `lottieSize`'s **480px-longest-side cap**, so a 1920×282 source dropped
  at 480×71 — exactly 1/4 (1920→480) while the modal gave 1920×282. The divergence was the
  defect, so both paths now call ONE shared `element-defaults.ts#fitVideoElement` (source
  dims → frame-fit, never upscales, falls back to 480×270 only when the source size is
  unknown). It reads the clip's real dimensions (the modal's probe figures; the drop's
  `<video>` `videoWidth`/`videoHeight`) — canvas ZOOM never enters either path (drop points
  are scene px, not screen px), so the created element is zoom-independent. IMAGE drag-drop
  did NOT share the bug and is untouched: it uses `defaultImage`'s fixed 320×320 placeholder
  (a different, long-standing default — not the 1/4 factor and not intrinsic-sized), so the
  two paths differed for a different reason and converging them is out of scope here. Pinned
  by `video-element-defaults.test.ts` (the 1920×282 case, drag/modal size parity, downscale,
  no-upscale, unknown-dims fallback).
- **Convert progress could scroll out of view — moved to the STICKY footer:** with the fps
  warning + preview + crop fields present the modal body grew past a short viewport and
  scrolled, dropping the "Converting… NN%" bar below the fold exactly when it matters most
  (single-threaded encode = minutes). The Modal shell already bounds height (`maxHeight:82vh`)
  with a `min-height:0; overflow:auto` body and a non-scrolling footer sibling; the fix simply
  relocates the progress bar + % + status from the scrollable body INTO the footer, stacked
  above the action row (`footerStack`). Progress and both buttons are now always visible at
  every modal height; the warning + preview + crop fields stay in the scroll region and can no
  longer push them off-screen (the preview stays capped at 300px tall, so a tall 900×900 or
  wide 1920×282 source shrinks to fit rather than overflowing). Pinned structurally by
  `video-import-modal.test.ts` (progress + both buttons are in the footer, the warning + crop
  fields are not — a geometry-free assertion that survives jsdom's lack of layout).

## Phase-2 pre-convert dedupe (2026-07-23, same branch — owner's field smoke: re-importing re-encodes)

- **The gap:** AssetStore dedupes by the sha256 of the CONVERTED output, which only helps
  AFTER the (minutes-long) encode. Re-picking the same source re-ran the whole conversion.
- **The key:** the SOURCE file's sha256, computed BEFORE converting and stored in provenance
  (`sourceSha256`, additive + optional so older assets parse unchanged). Bounded memory: the
  file is read through `File.stream()` one chunk at a time and folded into an incremental
  sha256 (`@cg/vcg-format#sha256HexOfChunks`) — never the whole file in JS heap, the same
  principle as the WORKERFS mount. `hashSourceFile` reports 0..1 progress and honours abort.
- **Measured cost:** ~1.93 GB hashes in **~16 s at ~130 MB/s** (pure-JS `@noble/hashes`),
  peak working set one 1 MiB chunk. Proportional — those same multi-GB sources take MINUTES to
  convert, so a pre-convert hash is <10% overhead, and it is instant for the small clips in the
  field (the 200×200/40 s and 1920×282 archives). The hash is needed for provenance regardless,
  so it is not wasted work; it doubles as the dedupe probe. (If multi-GB hashing ever proves
  too costly, `sourceBytes` is stored alongside as the cheap partner to `sourceFilename` for a
  future size+name pre-filter — noted, not built.)
- **The match:** `findDuplicateVideoAsset` requires the SAME source hash AND target fps AND
  crop (`cropsEqual` — both absent ⇒ full frame). A matching source with a DIFFERENT crop or
  fps is NOT a duplicate (its output genuinely differs) and still converts.
- **The UX (never silent):** on a match the modal shows a 'duplicate' step naming the clip with
  two actions — **Use existing** (places an element from the prior asset via the shared
  `probeStoredVideo`, ending in a placed element exactly like a normal import — no re-encode)
  and **Convert again** (forces a second copy). No match ⇒ convert as before, now carrying
  `sourceSha256` so the NEXT import dedupes. The pre-convert hash runs in a 'checking' step
  whose progress uses the same sticky-footer affordance as the encode, and Cancel aborts it.
- **The post-convert sha dedupe remains the backstop** (unchanged — `asset-store-video-ingest`).
  Contract pinned by: `integrity.test.ts` (streamed digest == one-shot), `source-hash.test.ts`
  (streamed, progress, abort, no `arrayBuffer()` slurp), `video-convert-args.test.ts`
  (the match rules), and `video-import-modal.test.ts` (same-file duplicate → no convert +
  Use-existing places; different-crop → converts; Convert-again forces an encode).

## Phase-3 canvas render + Inspector (2026-07-23, `feat/d128-p3-video-canvas-inspector`)

- **The canvas renders a REAL `<video>`, at rest on a MID-CLIP poster (decision (a)).** The
  scene-builder's `case 'video'` (was a Phase-2 placeholder box) now calls `buildVideo`, which
  mirrors `buildImage`: a `<video data-cg-asset-id data-cg-poster-ms>` positioned by the shared
  `applyBaseStyles` (transform / opacity / filter / visibility — identical to every other
  kind), `objectFit: contain`, muted + `playsinline`, **no `src`**. The host wires the src from
  the assetId → blob URL exactly like an `<img>`: `assetUrlCache.prime` now accepts `video`
  (the C5 one-liner) so the URL rides `mergedAssetUrls()` into the iframe, and the designer
  canvas's `preview.ts#applyAssetUrls` — previously IMG-only — now also handles `VIDEO`,
  setting `.src` and seeking the PAUSED element to `data-cg-poster-ms`. VP8+alpha (`yuva420p`)
  decodes with real transparency in `<video>`.
- **Why mid-clip, not frame 0 (decision (a), owner field call).** Furniture clips frequently
  open on an empty/transparent frame, so a frame-0 poster reads as a blank box. The poster
  frame is DERIVED (never a stored field — the schema has none): `phases.introEnd ?? clip
midpoint`, the exact ms-space analogue of the D-125 Lottie poster rule at `runtime.ts:844`.
  The rule lives in `posterTimeMs` (designer) and is inlined in `scene-builder#videoPosterMs`
  (the runtime package cannot import the app — same split as the Lottie rule). It is applied in
  FOUR places from ONE rule: the import-modal SOURCE preview (ffmpeg `buildPosterArgs` gains a
  fast `-ss` keyframe seek), and — via the shared `VideoPoster` React component (a paused,
  seeked `<video>`, real pixels + alpha, no PNG capture) — the canvas at-rest, the Inspector
  preview, and the assets-panel thumbnail. HONEST scope: it is one frame-SELECTION rule shared,
  not one function — the modal preview must stay ffmpeg (the source isn't a browser-decodable
  WebM at crop time), the three stored-asset surfaces share `VideoPoster`.
- **"Pick a different poster time" == the In point.** Decision (d) asks the Inspector to expose
  the poster "with a way to pick a different time", but the schema stores no poster field (the
  change docs say it is derived). Reconciled per decision (a): the poster follows `introEnd`, so
  the In-point input IS the poster-time control — no schema field added. The Inspector shows the
  resulting poster time read-only ("Poster frame: N.NN s (the In point)").
- **Inspector `VideoSections` (decision (d)/(e)).** Hold behavior (`loop` default / `freeze`),
  the manual `phases` marks in the clip's own ms time space (In/Out, clamped to `[0, duration]`,
  invariant `introEnd ≤ outroStart`, with Add/Clear since `phases` is optional), `drivesHold`
  opt-in (default off), the mid-clip poster preview, and the stored provenance surfaced
  READ-ONLY (source name, dims, `N→M fps` conform, baked crop). It never exposes the clip's
  inner content (opaque by design). Transform/opacity/filter keyframe rows come from the shared
  Transform + Filter sections (the D-056 registry already declared `video: UNIVERSAL_ONLY` in
  Phase 2).
- **Scrub does NOT drive video frames (C4).** The playhead reaches the canvas via a `scrub`
  postMessage → `runtime.tick(frame)`, which only re-evaluates keyframed transform/opacity and
  lifespan gates. The Lottie is likewise static-at-poster on scrub (it plays on its own clock
  during playback). The video sits statically on its poster frame; scrub-driven video frames
  are D-135's separate item — Phase 3 neither implements nor precludes it. Playback lifecycle
  (the `VideoDriver`) is Phase 4.
- **Display refinements (owner add-on, same phase):** the assets-panel tile renders the video's
  mid-clip poster (replacing the "VID" text stub) and the timeline layer row uses a distinct
  lucide `Clapperboard` glyph — the conventional "video file" icon, distinct from the image
  element and deliberately NOT a camera (camera imagery is reserved for the Live Source element);
  the cyan `TYPE_COLORS` entry already existed — both wired
  through the same `VideoPoster` / `assetUrlCache` seams as the canvas, not a second path.

## Phase-3 field fixes (2026-07-23, owner smoke — 4 bugs, same branch/PR #398)

- **Bug 1 (serious) — video vanished while dragging anything on the canvas.** Root cause: a
  transform-only change (drag/resize/rotate/opacity) posts a full `scene-replace`, and the
  iframe's `applyScene` tears the whole runtime DOM down (`runtime.remove()`) and rebuilds it
  (`createRuntime`). Cheap elements rebuild invisibly; a `<video>` re-loads its blob + re-seeks
  the poster each time — and a 60 Hz drag issues a burst of rebuilds, so the clip stays blank
  the whole drag and the LAST reload finishing is the "returns a few seconds after." The
  permanent-hide was the same reload being aborted mid-flight by the next rebuild and never
  completing. Fix (in the iframe script, `preview.ts`): HARVEST the live `<video>` nodes just
  before the teardown (a referenced detached node keeps its media + `currentTime` alive) and
  TRANSPLANT them back over the freshly-built src-less placeholders — same element id AND asset
  — copying only the new transform/style (`reconcileVideos`). The media never reloads; only the
  box moves. A genuinely new element (or a changed asset) still gets a normal src+seek; pooled
  entries no longer in the scene are dropped. A media `error` listener now logs honestly rather
  than leaving a silent blank box. Guarded by an e2e that marks the live node and asserts it
  survives repeated transform changes still showing a non-blank poster.
- **Bug 2 — the video picker was multi-select but imports one.** `pickFiles` sets
  `input.multiple = kind !== 'video'`: the video picker is single-select (the modal is
  inherently one clip — crop/fps/progress/duplicate), every other kind stays a batch.
- **Bug 3 — the dedupe hashed the source even when no duplicate was possible.** A cheap
  `File.size` pre-filter runs FIRST: a duplicate is only possible against an existing video
  asset with an identical `sourceBytes`. No size match ⇒ NO up-front hash — straight to import.
  (Size, not filename: a renamed file is still caught; two unrelated same-name files don't
  trigger a pointless hash.) The source hash still reaches provenance for FUTURE dedupe, but off
  the blocking path: when there was no size match it is computed DURING the encode (which takes
  far longer) and `await`ed only just before `storeBytes`, so the operator never waits on it.
  Measured up-front wait: empty project **0 s**, different-size-only **0 s**, size-matching **the
  hash time** (~16 s for ~2 GB to confirm; instant for the field clips). The post-convert sha
  dedupe remains the backstop, so an identical output still dedupes even if the source hash was
  best-effort.
- **Bug 4 — the crop control was disabled once a duplicate was detected**, contradicting the
  rule that a DIFFERENT crop is not a duplicate. The crop control (toggle + rectangle + numeric
  fields) now stays ENABLED in the duplicate step, and the match is re-evaluated LIVE from the
  current crop + fps against the size-matched candidates: when the parameters no longer match,
  the banner and "Use existing" disappear and the modal returns to the normal convert flow
  (`useEffect` → `ready`). "Use existing" only ever places the asset matching the on-screen
  parameters (`duplicateMatch`, recomputed each render), never a stale one.

## Phase-4 implementation record (2026-07-23, `feat/d128-p4-video-lifecycle`)

- **`VideoDriver` (`video-driver.ts`) — same contract, INVERTED playhead ownership.** It joins
  the duck-typed content-driver contract (`reset`/`start`/`pause`/`resume`/`stop`/`destroy`/
  `whenComplete` + `playOutro()`) exactly as the D-125 `LottieDriver`, but where the Lottie is a
  driven-frame RENDERER (the driver computes each frame and pushes `goToAndStop`), a `<video>`
  ADVANCES ITSELF on its own `currentTime`. So the driver does not paint per rAF; it commands
  play/pause/seek over a `VideoHandle` (`{ play, pause, seek, currentTime }`) and keeps the
  element in lockstep off the SAME injected clock. The `VideoHandle` abstraction is what makes it
  deterministically testable (a mock handle + fake clock covers the MAPPING — elapsed active
  time → expected clip-time → seek/play/pause — never the real decode, the ticker's test split).
- **The one outro ledger, widened (C1/C6, task 4.3).** A shared interface
  `ElementOutroDriver { playOutro(): Promise<void> }` (the ONLY member the seam touches) now
  types the ledger `Map` key, `ScopeNode.outroLotties`, the per-scope outro array
  (`scopeOutroLotties`, now holding both kinds), and `collectSubtreeOutros`/`collectElementOutros`.
  Both `LottieDriver` and `VideoDriver` structurally satisfy it, so an outro-owning video pushes
  into the SAME array as a Lottie and drains through the SAME `playElementOutrosOnce` ledger —
  ONE ledger, two driver kinds, exactly-once per exit episode. No cross-talk (the ledger keys by
  driver IDENTITY): a Lottie and a video in one composition each play their outro once, proven by
  `video-lifecycle.test.ts`. `whenComplete` (hold) stays a SEPARATE seam (`contentDrivers` /
  `holdVideos`) — a video plays its outro on every exit regardless of `drivesHold`.
- **Phase mapping (task 4.2), in the clip's own ms space.** intro `[0 → introEnd]`; hold LOOPS
  `[loopStart → loopEnd]` (default) or FREEZES at `introEnd`; outro `[outroStart → duration]`.
  The runtime computes the spans from `element.phases` + `durationMs`: with phases,
  `introEnd/outroStart` as authored and `loop = [introEnd, outroStart]` (or the optional `idle`
  window); ABSENT phases (decision (b)) ⇒ `introEnd = duration`, `loop = [0, duration]`,
  `outroStart = duration` — the whole clip is the intro, the hold loops the whole clip, and the
  outro is degenerate (resolves immediately ⇒ no outro; the composition's existing content exit
  carries it). The intro starts at PLAY (like the Lottie), not at hold entry.
- **Anti-drift threshold — 80 ms, justified by the Phase-1 spike (decision (e)).** A `<video>`
  owns its clock, so it can drift from the injected clock during free playback. Correction is
  BOUNDED: each tick compares `video.currentTime` against the clock-derived expected clip-time
  and re-seeks ONLY when the error exceeds **80 ms** — never per-tick, so there is no visible
  stutter. 80 ms is the spike's measured figure: over a 60 s hold loop it recorded 49 wraps,
  |drift| mean 12.8 ms / **max 26.6 ms**, wrap seek ~1 ms, and **ZERO corrections** at 80 ms;
  seek accuracy was 0 frames off across 20 targets. So 80 ms sits comfortably above the observed
  max drift (26.6 ms) — it fires only on a genuine hiccup, never on normal jitter. Loop WRAP is
  always driver-commanded (seek to loop start when the head reaches loop end), never
  `<video loop>` (whose wrap timing the driver cannot observe). Every corrective/wrap seek
  RE-ISSUES `play()` (idempotent when already playing): because the loop is driver-commanded, a
  real `<video>` that reaches the media's natural end — the ABSENT-PHASES default, where
  `loopEnd === duration` — fires `ended` and PAUSES, and a plain seek clears `ended` but leaves it
  paused. Without the re-play the default whole-clip loop would run once then freeze at frame 0
  (caught by the Phase-4 adversarial review; the driver test's mock now models the end-of-media
  auto-pause so the regression is guarded). Pause captures the clock elapsed;
  resume re-anchors and RE-SEEKS to the clock-derived clip-time before playing (never trusting a
  stalled head). `playOutro()` ALWAYS resolves (degenerate/destroyed/superseded settle
  immediately — the B-030 defense).
- **Binding is registry-based, not a DOM walk (C3).** `scene-builder#buildVideo` registers each
  `<video>` on `scope.videos` (a new `FieldScope.videos: VideoEntry[]`), and `createRuntime` runs
  a `for (const v of scope.videos)` loop mirroring the Lottie loop — constructing the driver,
  marking `data-cg-content`/`data-cg-outro`, and joining the hold aggregation + cascades
  (play/pause/resume/stop/destroy, `onCycleRestart` re-arm, `scopeHasEffectiveHoldDrivers`). The
  `img[data-cg-asset-id]` asset-src walk is a SEPARATE, export-side concern — left for Phase 5.
- **What Phase 5 owes:** widen `runtime.ts`'s on-air/export asset-src walk from
  `img[data-cg-asset-id]` to also wire `<video data-cg-asset-id>` (packaged relative path for
  `.vcg`, base64 `data:` for single-file), so a video renders + plays on-air. Phase 4 covers the
  DRIVER + the designer-canvas playback (`preview.ts` already wires the `<video>` src there);
  the runtime/exported `<video>` src is Phase 5's.

## Black-fringe fix — premultiplied alpha (2026-07-23, `feat/d128-p4-video-lifecycle`)

**Symptom (owner):** a converted clip's dissolve/close showed BLACK EDGES around
semi-transparent pixels (soft edges, dissolving particles); fully-opaque and
fully-transparent areas were correct. Sources are the legacy archive AVIs
(rawvideo/BGRA, e.g. `Logo_HazratKhadije_1.avi`).

**Root cause PROVEN — (A) premultiplied alpha (dominant).** Legacy After Effects /
BGRA archives store alpha PREMULTIPLIED (matted against black): the RGB of a
semi-transparent pixel is already `straight · alpha`. The browser and CasparCG
composite assuming STRAIGHT (unassociated) alpha, so those pixels are darkened a
SECOND time → a black halo exactly where alpha is partial. The pre-fix converter
did ZERO alpha handling (`crop?` → `-c:v libvpx -pix_fmt yuva420p …`), so the
premultiplied RGB went straight to air. Proven numerically on a synthetic
premultiplied source through the FULL pipeline (encode → libvpx VP8+alpha →
libvpx decode → straight rgba): a straight-gold `(255,215,0)` pixel at α 128
decoded back **darkened to `(124,107,0)`** under the current pipeline and
**restored to `(254,214,0)`** with the fix. rawvideo/BGRA carries NO
premultiplied flag; the invariant `RGB ≤ α` is necessary-but-not-sufficient (a
dark straight source satisfies it too), so premultiplied-ness **cannot be
auto-detected** — see the toggle below.

**(B) chroma-subsample bleed — measured MINOR, not corrected.** VP8 forces
`yuv420p` chroma; black under transparent regions can bleed into edge chroma.
Measured by comparing the fix at 4:2:0 vs 4:4:4 (no subsample): they differ by
**≤4/255 at the extreme low-α edge**. So (B) is real but negligible once (A) is
fixed; a 4:4:4 / colour-fill pass would inflate output for no visible gain and is
deliberately NOT applied.

**Filter chain — before → after.**

- Before: `[-vf crop=W:H:X:Y]? -c:v libvpx -pix_fmt yuva420p -auto-alt-ref 0 -crf 12 -b:v 2M -deadline good -cpu-used 5 -an -r <fps>`
- After (premultiplied ON): the same, with the `-vf` now
  `crop=W:H:X:Y,format=rgba,geq=r='if(gt(alpha(X,Y),0),255*r(X,Y)/alpha(X,Y),0)':g=…:b=…:a='alpha(X,Y)'`
  (crop FIRST, then un-premultiply; crop omitted when none marked). Everything else
  is untouched (VP8+alpha, `-an`, fps conform, crop bake, WORKERFS, single-thread).

**Why `geq`, not the `unpremultiply` filter.** ffmpeg's `unpremultiply` divides the
selected planes by the **first plane** (green in `gbrap`, the packed word in
`rgba`) — never the actual alpha — so single-input `inplace=1` is a proven **no-op**
here, and the 2-input `alphaextract` form scrambles planes (grayscale output). `geq`
computes `straight = 255·c/α` exactly, guarded at α 0, and IS present in the shipped
`@ffmpeg/core` 0.12.10 wasm (verified in the binary alongside `crop`/`libvpx`).

**Correct for BOTH alpha conventions — an operator toggle, not a blind default.**
Un-premultiplying a STRAIGHT source is the INVERSE error (it over-brightens
semi-transparent pixels), so the fix is gated on a `Premultiplied alpha` checkbox in
the import modal, **defaulting ON** to match the client's all-premultiplied archive.
A straight-alpha source (a normal WebM/MOV) is imported with it OFF and is byte-for-
byte untouched. Since BGRA can't be auto-classified, this explicit choice is the
honest path on a broadcast pipeline (never a silent guess).

**Cost.** The `geq` pass adds per-pixel expression evaluation: measured ~+6× the
FILTER time on a 640×360×60 synthetic (libvpx encode was trivial there), and
**+60–84 % output size** — the size growth is INHERENT to correctness (restoring
colour into previously-darkened partial-α regions adds real detail the premultiplied
clip had crushed toward black). It is a one-time import cost, paid only for
premultiplied sources.

**Consequence — stale assets.** The fix changes conversion output, so clips already
imported carry the old fringe. Nothing is silently re-converted. Each asset's
provenance now records `converterRevision` (`2026-07-23.2` = this fix) and
`premultipliedAlpha`; a future item can flag assets with an older/absent revision and
prompt re-import. **The owner must RE-IMPORT the affected archive clips** to clear the
fringe on already-imported assets.

## Content-driven hold — media as a closer (drivesHold, 2026-07-23)

**Bug (owner):** a composition with `hold: content-driven`, `mode: auto-out`, an
infinite Ticker, and a Video with `drivesHold: Yes` (freeze, phase marks) NEVER
closed, and the Playout panel's "Which content closes the graphic?" list showed ONLY
the Ticker — the Video was absent even though its `drivesHold` was on.

**Which of (runtime, designer) was broken: the DESIGNER only.** The runtime already
registers a `drivesHold` video/lottie as a content driver and aggregates it into the
content-driven hold (Phase 4 — `holdVideos`, `scopeHasEffectiveHoldDrivers`,
`ownContentWait`; the passing lifecycle tests confirm it). The gap was entirely in the
Playout panel: `hasContentElement` / `contentHoldElementsOf` / `nestedHoldGroupsOf`
walked only `ticker` / `sequence` / countdown-`clock`, so a `video`/`lottie` was never
listed, never toggleable, and never counted in the "every content driver repeats
forever" warning — which was therefore computed from a driver set that excluded the
video (and wrongly fired "all infinite" when the finite video was a real closer).

**Multi-driver close rule (confirmed, unchanged): ALL-COMPLETE.** A content-driven
hold is `Promise.all` over its effective drivers (D-111/D-112), so the hold ends only
when EVERY driver has completed. An infinite ticker never completes, so the owner's
graphic correctly held until stop — the fix makes the panel show WHY (both drivers
listed; the ticker flagged "loops forever", the freeze video a finite closer), so the
operator can exclude the ticker and leave the video as the sole closer that ends the
hold at its own completion.

**Media `drivesHold` is OPT-IN in the panel too.** The closer list reads media
`drivesHold` as `=== true` (the inverse of ticker/sequence's `!== false`), matching the
runtime, and marks a `loop` hold as the infinite (never-completes) case, a `freeze`
hold as a finite closer. (The precise "ends at N s" per-driver time is left for the
timeline-derived model — see the phases-follow-timeline correction — which owns the
close time; today the finite/infinite distinction is what the operator sees.)

## Video sync robustness — background-throttle & large-gap policy (2026-07-23)

**Symptoms (owner, Preview):** (1) pause→resume restarted several seconds AHEAD; (2)
a background-tab round-trip found the `<video>` paused, then continued further ahead;
(3) after several cycles it FROZE permanently (Stop/Out/Play inert until Preview was
reopened); (4) a dark fringe reappeared after cycles, gone on the first clean play and
independent of the un-premultiply toggle.

**Root cause (proven, cross-verified).** The Designer Preview builds the runtime with
NO injected clock (`preview.ts` — `createRuntime(scene, {…})`), so `VideoDriver.now()`
is `performance.now()`, a WALL clock, and `raf` is the real `requestAnimationFrame`.
The driver slaved the `<video>` to the wall clock ONE-DIRECTIONALLY: on drift it always
seeked the element FORWARD to the wall-derived position, never re-anchoring its clock to
the media's actual `currentTime`. Any interval where wall time advanced but the media
did not — resume/seek decode latency, a decode stall, or a background tab that starves
rAF and pauses media while `performance.now()` runs on — accrued **phantom time** that
the next tick paid off as a forward jump (for a loop, `wall % span` — an arbitrary
position). The per-tick, un-guarded corrective seeks became a **seek-storm** that both
wedged the `<video>` decoder (recoverable only by a fresh element — the pooled node is
reused across rebuilds, hence "only reopening Preview fixes it") and painted the
half-decoded frames the owner read as a fringe (symptom 4 is a displayed-frame artifact,
NOT alpha — consistent with its persistence with the toggle off and its absence on the
first clean play; the specific paint is inferential, so the owner should confirm it is
gone after this fix). Independently, `pause()` mid-outro left `playOutro()`'s promise
pending (no `settleOutro`), and the controller's `stop()` no-ops at `phase==='outro'`,
so the shared outro-ledger `await` could wedge the whole exit.

**THE POLICY (the design decision, not an implementation detail): on a large gap the
CLOCK RE-BASES TO THE MEDIA — the video does NOT catch up to the clock.** A per-tick
WALL delta beyond `resyncThresholdMs` (default **400 ms** — far above any foreground
jitter; the 80 ms drift threshold was measured on a foreground tab and says nothing
about a multi-second gap) is treated as a throttle/stall, and the driver re-anchors
`startedAt` so its expected clip-time equals the element's ACTUAL playhead
(`rebaseToMedia`/`elapsedForActual`). The element **continues from where it is**; the
driver never seeks it forward to a wall position it never reached, and never folds a
multi-second gap into the loop modulo. Rationale: seeking a broadcast graphic forward
loses content and shows a desynced frame; continuing smoothly is correct, and after a
background round-trip the exact phase of a hold-loop is cosmetic. Small drift
(80 ms–`resyncThreshold`) is still corrected by a tiny seek (imperceptible). Because the
driver self-heals on the first post-throttle tick, NO page-visibility handler is required
(the fix works in the exported single-file runtime too, not just Preview).

**The other two defences.** (a) A **seek-in-flight guard** — a corrective/wrap seek is
never stacked while `handle.seeking()` is true — kills the seek-storm (so the decoder is
never thrashed into a wedge, and the resume-decode overshoot stops) and removes the
frequent forced re-decodes behind the fringe. (b) `playOutro()` arms a **wall-clock
backstop** (`clock.setTimeout`, outro length + 2 s) so it ALWAYS resolves even if the rAF
is throttled or the driver is paused mid-outro — the exit can never wedge. `reset()` /
`stop()` remain a FULL reset from any state (settle the pending outro, clear the backstop,
clear every flag), so Stop/Out/Play always recover the driver.

**Not regressed:** the Phase-3 no-remount-on-drag guard (unchanged — this is driver-only),
the absent-phases whole-clip loop with the re-issue-`play()` fix, and the shared outro
ledger (its `playOutro()` ALWAYS-resolves invariant is now strengthened, not weakened).

### Resume-window cost — the keyframe/GOP finding + the RESUME GRACE (2026-07-24)

**Refined symptom:** with TWO videos on a scene, both play smoothly at steady state; only
AFTER pause/resume do both go very slow for a few seconds, then self-heal. So there is no
sustained throughput problem — the cost is concentrated in the RESUME window.

**Measured root cause: expensive seeks against a SPARSE keyframe grid.** Our encode passes
NO `-g`, so libvpx uses its default `kf_max_dist` ≈ 128 frames → a keyframe only every
**~5.12 s** (measured on a 12 s @ 25 fps VP8+alpha encode with the shipped args; keyframes
at 0, 5.12, 10.24 s). A seek to an arbitrary resume position forces the decoder to restart
from the preceding keyframe and decode forward — **up to ~5 s of video in one burst**. The
classification is **(b) the decoder ramp after `resume()`'s `play()`, compounding into (a)**:
once the re-anchor seek settles, the decoder ramps up below realtime, drift accrues, and at

> 80 ms a corrective seek fires — which, at a 5 s keyframe interval, is itself a multi-second
> decode burst that stalls the decoder further, accruing more drift and more seeks. Two videos
> compete for decode, so each ramp is slower and the burst larger — exactly "very slow for a
> few seconds, then recovers." (Steady-state playback issues no seeks, which is why it is fine.)

**Fix shipped — RESUME GRACE (self-contained, no re-import).** For `resumeGraceMs` (default
**750 ms**) after a resume or a large-gap re-base, drift correction is SUPPRESSED so the
decoder ramps up unmolested; the self-amplifying seek cascade never starts. A real `<video>`
keeps playing on its own during the grace (the media clock advances) — the grace only holds
back corrective SEEKS, so resume playback is immediate and smooth, not delayed. The loop WRAP
and the always-recoverable paths are never suppressed. The seek-in-flight guard and the outro
backstop are untouched (they fixed real wedges).

**Not shipped — DENSER KEYFRAMES (an encode-args change → a re-import decision, the owner's
to make).** Adding `-g` shortens the GOP so every seek is cheap. Measured cost vs today
(same clip): `-g 25` (1 s GOP) = **+3.5 %** size, `-g 12` (~0.5 s GOP) = **+6.5 %** size, both
with negligible encode-time change. This is complementary to the grace (it makes the _one_
post-grace correction cheap too), but it changes conversion output, so **already-imported
clips keep the old ~5 s GOP and would need re-import**. Provenance already records
`converterRevision`, so a future item can flag pre-`-g` assets — no new plumbing needed to
adopt it later. Recommendation: ship the grace now (it removes the cascade at zero conversion
cost); adopt `-g 25` at the next converter-revision bump IF the owner wants cheaper seeks and
accepts the ~3.5 % size + a re-import — a call left explicitly to the owner.

**Note on the black band during resume:** if it recurs only in the resume window, that is
further evidence it is a decode artifact (a frame presented mid-decode during a seek burst),
NOT an alpha/premultiply problem — the un-premultiply expression was not touched in this pass.

## LOSSY ALPHA COMPRESSION — the real black-artifact root cause (2026-07-24)

**Owner's decisive observation:** on freshly re-imported clips (fringe fix + sync fix +
resume grace all in place) the black artifacts appear **during MOTION** — both the
whole-rectangle darkening and the edge/particle haloing. Supporting signal: a 739 MB source
converts to ~1.4 MB (~500×) with no quality args passed.

**Mechanism PROVEN by measurement** (harness committed:
`tools/spikes/video-convert/measure-alpha-leak.mjs` — a 720p premultiplied particle-burst,
15 static + 45 moving frames, encoded with the exact production args, decoded, and every
SOURCE-transparent pixel's OUTPUT alpha measured):

| encode                        | moving-frame leak (α>0 / ≥4 / ≥8) | max α  | black share of visible leak | size           |
| ----------------------------- | --------------------------------- | ------ | --------------------------- | -------------- |
| OLD `crf 12 -b:v 2M`          | **56.7 % / 0.877 % / 0.090 %**    | **30** | **77 %**                    | 1.2 MiB        |
| `crf 10 -b:v 8M`              | 4.0 % / 0.086 % / 0               | 9      | 91 %                        | 3.5 MiB (2.9×) |
| **`crf 4 -qmax 16 -b:v 20M`** | 2.6 % / **0.008 % / 0**           | **6**  | (invisible)                 | 6.9 MiB (5.8×) |
| `qmax 8 -b:v 50M`             | ≈ same                            | 6      | —                           | 8.9 MiB (7.5×) |
| **+ ALPHA BLEED**             | unchanged α distribution          | —      | **0 %**                     | +~2 %          |

In WebM the alpha plane is a SECOND VP8 stream encoded with the SAME quantiser as colour —
**no independent alpha-quality control exists** (`ffmpeg -h encoder=libvpx` exposes no alpha
option; empirically the leak scales monotonically with the shared quality settings, which is
the proof it rides the same quantiser). Under the old `crf 12 + 2 Mbps cap`, motion drove the
quantiser high enough that fully-transparent pixels decoded at α up to 30 over the BLACK
matte RGB — 12 % opacity black smudges exactly where the motion is, and a subtle whole-rect
veil in static frames (26 % of transparent pixels at α ≤ 7). Static frames quantise cleanly —
why first frames always looked fine, and why a static single-frame fixture let this class
survive three rounds of fixes.

**Fix shipped (converterRevision `2026-07-24.3` — re-import required, as expected):**

1. **(A) Broadcast quality:** `-crf 4 -qmax 16 -b:v 20M` — the quantiser is BOUNDED so alpha
   can never crumble (leak: max α 6, 0.008 % ≥ 4, zero ≥ 8 on the torture clip); the 20M
   ceiling never binds in practice. Plus **`-g 25`** (1 s keyframes — the resume-window
   finding, +3.5 %). Measured size cost **~5.8×** on the torture clip — inside the owner's
   pre-approved 5–10× band ("broadcast cleanliness wins"); real furniture clips (mostly
   static) grow less. Encode-time delta ≈ none (native); the bleed below ≈ 2× total.
2. **(B) ALPHA BLEED** (both alpha paths, never alters alpha): transparent-region RGB is
   filled with colour extended from the nearest opaque pixels —
   `bled = blur(premult)/blur(α)` (an opacity-weighted average of TRUE colour, so it runs
   off the premult image: the archive input directly, or `straight·α` recomputed for a
   straight source), composited under the straight image by `overlay`, ORIGINAL alpha
   re-attached bit-exact via `alphaextract`+`alphamerge`. Any residual leak now shows
   plausible local colour, never black (measured: black share 77 % → 0 %), and chroma
   subsampling can no longer drag black into edges. All filters verified present in the
   shipped wasm core.

**Test split (stated honestly):** the committed 64×64 MOTION fixture
(`motion-64x64-premult-bgra.avi`, orbiting particle, corners permanently transparent) guards
the pipeline END-TO-END through the real wasm encode — transparent stays transparent across
motion frames, nothing visible in source-transparent regions. At 64×64 even the OLD args pass
(the cap never binds at that size), so the QUALITY args themselves are pinned by unit test
(`crf 4 / qmax 16 / b:v 20M / -g 25`), and the resolution-scale leak is reproducible on demand
with the committed measurement harness. A committed 720p raw fixture (100+ MB) was rejected.

## 1920×282 undecodable-WebM report — sweep results + the VERIFY guard (2026-07-24)

**Field report:** after re-importing at rev `2026-07-24.3`, `Lower_Default` (1920×282,
6.5 MB output) decodes NOWHERE (thumbnail/canvas/Preview all blank — so the stored WebM
itself), while 200×200 (2.1 MB) and 300×90 (4.3 MB) work.

**Sweep — no tested variable reproduces it.** All results browser-verified (a real
Chromium `<video>` + drawImage, not just ffprobe):

| axis                                  | test                                                             | result                                              |
| ------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| dimensions (native, exact args+graph) | 1920×282 / 284 / 280 / **141 (odd)** / 1080, 1 s                 | ALL decode clean (ffprobe + full decode + Chromium) |
| dimensions (REAL wasm, full app path) | 1920×282, 8 frames                                               | decodes OK in-browser                               |
| duration (REAL wasm)                  | 1920×282, 150 frames / 6 s                                       | decodes OK                                          |
| output size / complexity (REAL wasm)  | 1920×282, 6 s heavy detail → **16.4 MB** (2.5× the failing clip) | decodes OK                                          |

**Which variable predicts failure: NONE of dimension / duration / size.** The
odd-half-height theory is also directly disconfirmed twice over (300×90 works for the
owner — 45 is odd; 1920×141 — height itself odd — decodes everywhere natively).

**Chain audit — no dimension-dependent intermediates exist.** The bleed graph has NO
downscale pyramid: `boxblur=12:2` is single-scale with a fixed radius (no size coupling),
`geq` is per-pixel, `overlay`/`alphamerge` join same-sized branches, and everything up to
the encoder runs in packed `rgba` (no chroma subsampling to violate). The only
even-dimension-sensitive step is the final `yuva420p` conversion — and 282 is even, and
even the fully odd 141 decodes (libvpx pads internally).

**Conclusion + the fix that ships:** the failure is driven by something specific to the
owner's source file or their local run (source-codec variant, a mid-convert hiccup, or a
store-side truncation) — and the pipeline previously STORED whatever came out with no
check (ffmpeg exit 0 was trusted; for a source with a known duration the produced bytes
were never decoded at all). That silent path is the defect we can fix without the file:

1. **VERIFY-BEFORE-STORE** (`verifyConvertedClip`): the produced bytes must decode in a
   real `<video>` at the EXACT post-crop dimensions with a finite positive duration —
   or the conversion fails LOUDLY (nothing stored) with the reason AND the ffmpeg log
   tail (now captured on success too — the silent-warning defect) in the console.
2. **READBACK-AFTER-STORE** (`verifyStoredReadback`): the stored asset must serve back
   the verified byte count, or the operator sees an error instead of a dead asset (a
   silently truncating store presents exactly like this field failure).

On the owner's next re-import of `Lower_Default`, the import either works or fails with
a visible reason + log — which pins the true cause. **Dimension matrix committed**
(`video-dimensions.spec.ts`): 1920×282 and 300×90 (odd half-height) synthesized in pure
node (a minimal rawvideo/BGRA AVI writer, no native-ffmpeg dependency) and pushed through
the REAL wasm converter, asserting decode at exactly the expected dimensions.

**Output size at 1920×282 (for the Phase-5 export threshold):** simple lower-third
content 6 s → ~294 KB (~0.4 Mbps); heavy-detail torture 6 s → 16.4 MB (~22 Mbps). Real
lower-thirds sit near the low end; the owner's 6.5 MB is consistent with mixed content.

## The ALPHA axis — invisible-clip diagnostics + collapse guard (2026-07-24)

**Hypothesis (owner, after `Lower_Default` STORED on the verify-guard build yet rendered
nowhere):** the output is DECODABLE but FULLY TRANSPARENT — it passes every decode check
(dimensions ✓ duration ✓ 6.5 MB of colour data ✓) and paints nothing because its alpha is
(near) zero everywhere. The dimension sweep was clean because the synthetic sources always
carried real alpha; the variable is THIS clip's alpha.

**What ships:**

1. **Alpha diagnostics, always on.** At probe time the SOURCE's alpha profile is sampled
   (a few spread frames decoded to raw RGBA in the wasm); after conversion the OUTPUT's
   profile is sampled (real `<video>` → canvas). Both are logged to the console on every
   import — `[video-import] alpha profile — source: … | output: …` with max/mean alpha,
   %visible (α≥8), %opaque (α≥250) — the one reading that confirms or kills the
   hypothesis on the owner's machine.
2. **Fully-transparent SOURCE ⇒ a prominent modal warning at probe time** (danger
   callout): "this source appears FULLY TRANSPARENT … likely exported without an alpha
   channel (RGB-only in a 32-bit container)". The leading suspect for `Lower_Default`: a
   32-bit BGRA export whose alpha byte is 0 — real RGB content (hence 6.5 MB), invisible
   on air, and the modal's own poster preview blank. Conversion stays allowed (informed
   operator), but never again silent.
3. **ALPHA-COLLAPSE GUARD** (source-relative, per the owner's spec — never an absolute
   threshold, so a legitimately sparse graphic passes): if the SOURCE had visible pixels
   (>1 % of the frame) and the OUTPUT has essentially none (<0.1 %), the conversion FAILS
   LOUDLY with the ffmpeg log tail and stores nothing.
4. **The fixture this class needed** (E2E, real wasm): a lower-third-shaped source — wide
   thin strip, large transparent regions, a solid opaque bar with soft edges, animating
   in — asserting the stored output KEEPS the bar at α≥250 and the empty regions at α≤2;
   plus an RGB-only (alpha-byte-0) source asserting the FULLY TRANSPARENT warning appears
   before conversion.

**Trace results (own reproduction attempts):** the full chain PRESERVES alpha for the
lower-third shape (bar survives opaque end-to-end through quality+bleed in the real
wasm). The unpremultiply `geq` writes `a='alpha(X,Y)'` (identity); the bleed re-attaches
the original alpha via `alphaextract`+`alphamerge` (verified on this shape, not assumed);
toggle-ON over a straight-alpha source over-brightens colour but leaves alpha intact —
none of these zero alpha. **A source whose alpha is already empty is the one case that
reproduces every observation**, and it is now legible at probe time. If the owner's
paste-back instead shows source-visible/output-empty, the collapse guard will already
have blocked the store and named the conversion — that reading pins the true cause
either way.

## PIPELINE_ERROR_DECODE — bisect results + the strengthened guard & result panel (2026-07-24)

**The owner's reading killed the collapse hypothesis:** output alpha SURVIVES (maxα 255,
21% visible) — the real failure is Chromium's `PIPELINE_ERROR_DECODE`: the produced WebM
does not PLAY, though metadata loads and sample frames seek-decode (which is why the old
verify guard passed it — and why "loads metadata + decodes a frame" is NOT playability).

**Bisect matrix (profile-matched fixture: 1920×282 premult, meanα 29.0 / visible 12.9% /
opaque 10.2% vs the owner's 28.8 / 11.86 / 10.73):**

| variant                         | Chromium FULL playthrough | leak(≥8)        | opaque retention | size           |
| ------------------------------- | ------------------------- | --------------- | ---------------- | -------------- |
| OLD crf12-2M, no bleed          | ✓ played through          | 0.001%          | 100.0%           | 0.92 MB        |
| OLD + bleed                     | ✓                         | 0.001%          | 100.0%           | 0.99 MB        |
| MID crf10-8M-g25 + bleed        | ✓                         | 0.000%          | 100.0%           | 2.79 MB        |
| CUR crf4-qmax16-20M-g25 + bleed | ✓                         | 0.000% (maxα 6) | 100.0%           | 4.31 MB        |
| CUR no bleed / CUR no -g        | ✓ / ✓                     | 0.000%          | 100.0%           | 2.02 / 4.18 MB |
| CUR yuv420p NO-ALPHA control    | ✓                         | —               | —                | 1.68 MB        |
| **CUR through the REAL WASM**   | **✓ played through**      | —               | —                | 4.26 MB        |

**No variant reproduces the failure** — natively or through the real wasm converter, on
content matched to the owner's alpha profile. The settings/bleed are NOT the boundary on
this fixture; the failure needs the OWNER'S ACTUAL CLIP (a short cut of `Lower_Default.avi`
is requested for the next round). **The opaque "regression" (10.73%→3.80%) was primarily a
MEASUREMENT ARTIFACT:** the output sampler downscaled to 320px, averaging away small
elements' opaque cores (also why "visible" rose 11.86→21.14%); the full-res compare shows
100% opaque retention at every setting. The sampler now samples at FULL resolution.

**Shipped regardless of root cause (the owner's robustness requirement):**

1. **`verifyConvertedClip` now proves PLAYABILITY**, not metadata: (a) metadata + exact
   post-crop dims + finite duration; (b) a 5-point SEEK SWEEP across the clip
   (15/35/55/75/92%), each requiring a decodable frame; (c) a REAL PLAYBACK SPAN (~2s of
   media at 4×) with the `error` listener armed throughout — any `MediaError`
   (`PIPELINE_ERROR_*`) fails with the position it died at. TIME BOUND: metadata ≤8s,
   seeks ≤3s each, span ≤8s wall (worst ~31s; typical 2–4s). Failures name WHICH check
   failed (`decode`/`duration`/`dimensions`/`seek`/`playback`).
2. **THE RESULT PANEL — shown ALWAYS, never console-only** (`video-conversion-result`):
   a clear "✓ Output plays" PASS, alpha preservation at a glance, and a WARNING when
   fully-opaque coverage drops sharply vs the source (>40% relative loss with source
   opaque >2%) — solid regions compositing semi-transparent is a broadcast defect even
   when the file plays. Raw numbers behind an expander. The element is placed by an
   explicit **"Place element"**; "Close without placing" keeps the asset only.
3. **Never a silent broken asset:** unplayable output / alpha collapse / readback
   mismatch each fail with their OWN message (distinct from "source has no alpha" and
   "converter crashed") and store nothing (readback: store nothing FURTHER — no element).

## Two-path bisect on the REAL clip (2026-07-24) — time structure + the settings decision

**Controlled comparison (owner's machine):** the spike converts `Lower_Default.avi` in
~13 s and the result plays; the app's modal takes minutes and (on the owner's machine)
produced the `PIPELINE_ERROR_DECODE` file. **The complete path diff:** the spike execs
`-y -i /mnt/<f> [VP8 crf12 -b:v 2M …] out` — NO filters (not even un-premultiply), no
`-r` conform, no `-g`, no `qmax`, one exec total. The modal path adds: a probe exec, a
poster exec, THREE source-alpha sample execs, the un-premultiply geq, the alpha-bleed
graph (a second geq + boxblur + overlay + alphamerge), `-r <projectFps>` conform,
`-crf 4 -qmax 16 -b:v 20M -g 25`, a fresh worker per import, and the post-convert
playability verification. Same WORKERFS mount, same core (0.12.10), same wrapper.

**Ladder bisect on the REAL 5 s cut (`rawvideo/bgra 1920×282@25`, AE CS6), through the
REAL wasm core, Chromium playthrough per rung (this machine):**

| rung                                             | wall      | size    | plays? |
| ------------------------------------------------ | --------- | ------- | ------ |
| L1 SPIKE (no filter, crf12-2M)                   | **5.4 s** | 0.84 MB | ✓      |
| L2 + un-premultiply geq, `-r 50` (rev .2 shape)  | 17.1 s    | 1.01 MB | ✓      |
| L3 + bleed graph (crf12-2M)                      | 31.2 s    | 1.30 MB | ✓      |
| L4 bleed + MID `crf10 -8M -g25`                  | 31.9 s    | 3.10 MB | ✓      |
| L5 bleed + CUR `crf4 -qmax16 -20M -g25` (rev .3) | 32.0 s    | 4.15 MB | ✓      |
| L6 = L5 at `-r 25` (no frame doubling)           | 32.4 s    | 4.15 MB | ✓      |

**Findings.** (1) TIME is dominated by the geq FILTER stages, not the encoder settings:
no-filter 5.4 s → +1 geq 17.1 s → +bleed (2nd geq + blur) 31.2 s, while quality steps are
free (31.2→32.0 s) and even frame-doubling is free (encode is cheap next to geq). The
owner's "minutes" on the 14.3 s clip ≈ 3× this cut's filter time plus the modal's extra
probe/poster/sampling execs. (2) DECODE: every rung — including exact rev .3 on the real
bytes — plays through on THIS machine; the native encode of the same cut also plays, and
the app's own import of the cut passed the strengthened playability verify. The
`PIPELINE_ERROR_DECODE` therefore did not reproduce here and is consistent with an
OWNER-MACHINE decode path (e.g. a platform/HW VP8 decoder rejecting the very high-rate
frames `-qmax 16` produces, where software libvpx accepts them) and/or the full-length
clip; the produced ladder files can be played on the owner's machine to settle it.

**Settings recommendation (decision the owner holds, with numbers):** step quality from
`crf 4 -qmax 16 -b:v 20M` to **`crf 10 -b:v 8M -g 25`, keeping the bleed** — measured
leak 0.086 % ≥4 (max α 9) vs 0.008 % (max α 6), a difference that is INVISIBLE once the
bleed makes residual leak non-black; 25 % smaller output (3.10 vs 4.15 MB on the cut);
identical conversion time; and it removes the extreme-quantiser regime that is the most
plausible irritant for a stricter platform decoder. Time optimisation of the geq stages
(the real minutes-per-import lever) is a separate follow-up item.

## The canvas-blank ROOT CAUSE — alpha keyframe misalignment × cold seek (2026-07-25)

**The missing piece all along — what the iframe's `<video>` actually reported:**
`PipelineStatus::PIPELINE_ERROR_DECODE`, fired during the at-rest POSTER SEEK, identically
in the srcdoc iframe AND the parent document. Every earlier bisect tested full PLAYTHROUGH —
which always passes on these files — so no encoder/settings variant could ever reproduce it.

**The evidence chain (each step a controlled experiment, browser = the app's Chromium):**

1. **Not blob scope, not CSP, not size.** A standalone harness (the app's exact CSP meta,
   bridge-style copied-buffer blob URLs, an unsandboxed srcdoc iframe) shows parent and
   iframe behave IDENTICALLY per clip; `fetch()` + SHA-256 of the blob inside the iframe
   match the parent byte-for-byte. Across a size sweep encoded with the app's exact args,
   2.09 MB FAILED while 4.34 MB passed — non-monotonic, so no size threshold exists.
2. **Cold seeks fail in deterministic GOP bands; playback never fails.** Per-clip maps of
   fresh-element `preload='metadata'` seeks show reproducible bad bands (on the 14.32 s
   repro: 1 s, 4 s, 6–7.5 s — containing the owner's 7.16 s midpoint — 9 s, 12 s, 14 s).
   The SAME element plays the whole clip sequentially without error, and the modal's exact
   verification (metadata + 5-point sweep + 2 s span) passes every failing clip — the "✓
   Output plays" verdict was honestly TRUE on a clip whose canvas render was blank.
3. **The alpha side-stream is the trigger.** An alpha-stripped control encode (identical
   content, identical settings, `yuv420p`) cold-seeks CLEAN at every previously-failing
   point.
4. **Container-level proof.** An EBML walk of the WebM (per block: the main VP8 frame-type
   bit and the BlockAdditional's alpha VP8 frame-type bit) shows a 29/29 correlation: a cold
   seek fails ⇔ the governing main keyframe carries an alpha INTER frame. libvpx places the
   alpha stream's keyframes on its own schedule; `-g 25` does not force alignment.
5. **The mechanism.** On a cold seek Chromium initializes a fresh alpha decoder at the
   target's governing main keyframe; an alpha inter-frame there has no reference history →
   terminal `PIPELINE_ERROR_DECODE`, a permanently dead element. Sequential decode from 0
   always carries the full alpha history — why playout (CG ADD → PLAY, no seeks) airs these
   files correctly, and why `preload='auto'` (eager-load) seeks succeed (measured at every
   previously-failing GOP).
6. **Why the earlier sweeps saw "no variable predicts failure":** dimension / duration /
   size never determined WHICH GOPs get misaligned alpha keyframes — content and motion do.
   A 1 s clip's midpoint sits in GOP 0, whose alpha frame is always a keyframe; longer clips
   land wherever libvpx's alpha cadence happened to fall.

**Decision — ROBUST-CANVAS-RENDER, plus verify-on-canvas-path (both, not either):** these
files are LEGITIMATE broadcast assets — playout is sequential and airs them correctly — so
failing the import would reject working assets for a Chromium seek quirk; the encoder is
untouched. Instead (a) every stored-asset surface produces the poster through ONE shared
routine (`src/shared/video-poster.ts`): eager-load seek, then `load()` + muted sequential
16× decode to the poster time on any media error/stall (the PROVEN operation; ~0.7 s for a
14 s clip), then honest failure surfacing — injected into the canvas iframe as serialized
source so there is exactly one implementation (the B-100/P-012 no-second-copy rule); and
(b) the import modal's post-store verification RUNS THAT SAME ROUTINE (`verifyStoredPoster`),
so "import verified it ⇒ the canvas renders it" holds by construction of shared code rather
than by promise. Regression fixtures are committed (generated with the app's exact encoder
args): `fragile-alpha-seek-320x90.webm` — container-verified alpha keyframes only in GOP 0,
every cold seek from 1.0 s (incl. the mid-clip poster) dies pre-fix — plus a seek-safe A/B
control; the E2E was proven RED pre-fix with the exact field error and GREEN with the fix.

## The premultiplied-alpha default flips OFF (owner decision, 2026-07-25)

The `Premultiplied alpha` toggle now defaults OFF. The ON default assumed the whole archive
is premultiplied and needs the correction; the field shows clips that are correct WITHOUT it
and are visibly damaged WITH it (un-premultiplying an already-straight source brightens its
soft edges). **A default must never degrade a correct file** — the operator turns it ON when
they actually see the black fringe. The modal's help text is rewritten symmetrically from
the OFF-default perspective. Already-imported assets are unaffected: each records the
setting that produced it in `provenance.premultipliedAlpha`. FOLLOW-UP (flagged, not built):
provenance RECORDS the flag but the Inspector's read-only provenance line does not SURFACE
it, so the operator currently has no UI to tell which setting an existing asset used.

## FAST PATH BY DEFAULT — the corrections become opt-in (owner decision, 2026-07-25)

**The bug behind "minutes vs the spike's 13 seconds":** the pixel-math stages were NOT
gated on the toggle. `buildAlphaGraph` ran on EVERY import — with the premultiplied toggle
OFF it still built the full bleed graph (GEQ_PREMULT + boxblur + GEQ_BLED + overlay +
alphamerge), which the ladder measured at ~6× the whole conversion cost. The toggle only
switched the straight branch.

**The model now shipped:** DEFAULT = the spike's shape. A default import runs NO
un-premultiply and NO bleed — no filter at all (a crop rides a plain `-vf crop`) — with the
QUALITY settings KEPT (crf 4 / qmax 16 / -g 25: they fixed the alpha leak 56.7% → ~0%, and
measured NATIVELY on the 5 s proxy they encode FASTER than the spike settings — 0.8 s vs
1.8 s; they were never the cost). Corrections are two INDEPENDENT opt-in checkboxes, each
stating its cost in the UI:

- **Premultiplied alpha** (black-fringe fix) — alone it is a single linear `-vf
format=rgba,geq` chain (no split/overlay graph).
- **Alpha bleed** (residual-leak robustness) — genuinely optional, never silently attached
  to the other; needs the full `-filter_complex` graph.

Two checkboxes (not one with a sub-option) because the stages are orthogonal in the graph
builder and in need: a straight source can want the bleed (leak protection) and a
premultiplied one can skip it; nesting bleed under premultiplied would deny it to straight
sources — where it originally shipped as unconditional protection.

**Measured (REAL app, real wasm, 5 s 1920×282 BGRA proxy of the owner's clip, this machine):**

| corrections           | click → result | convert exec | everything else                          |
| --------------------- | -------------- | ------------ | ---------------------------------------- |
| none (DEFAULT)        | **10.6 s**     | 9.3 s        | verify 0.8 s · alpha 0.15 s · rest 0.1 s |
| premultiplied         | 27.7 s (~3×)   | 26.7 s       | (same ~1.3 s)                            |
| premultiplied + bleed | 46.5 s (~5×)   | 44.9 s       | (same ~1.3 s)                            |

Probe+poster (the READY gate): 0.3 s. Source-alpha sampling: 0.07 s (off the READY path;
shares the worker mutex, so an immediate convert click queues behind it — negligible).
NOTHING else is on the hot path: the default's remaining delta over the ladder's 5.4 s
spike baseline is the encoder itself on this proxy's denser content (the native A/B above
rules the quality settings out). The playability verify (~0.7 s) and the poster parity
(~0.05 s healthy) STAY — both are load-bearing guards. A per-import
`[video-import] timing —` console line reports every stage so the cost stays visible.

**Verify hardening (follow-up caught by gate:e2e):** the playability SEEK SWEEP itself
performed the proven-fragile operation — under machine load the `preload=auto` element may
not have buffered before the first sweep seek fires, turning it into the cold-seek
alpha-keyframe trap and failing a HEALTHY output (observed once: the box fixture dying at
t=0.24 s, exactly the 15% sweep target). `verifyConvertedClip` now WARMS the element
(waits, bounded, until the blob is buffered through) before sweeping — warm seeks are
measured safe on every fragile GOP, a genuinely corrupt frame still fails a warm seek's
decode, and all five sweep points + the playback span remain enforced. Nothing weakened;
one false-positive mechanism removed.

**Result-panel pointers (the operator's new decision loop):** with corrections off by
default, the panel must say WHICH checkbox to try. Source stats now measure
`straightEvidenceFrac` — of the semi-transparent pixels, how many have colour EXCEEDING
alpha, which is impossible under premultiplied alpha — so a premultiplied-looking source
(~0 evidence with real semi-transparency) gets "if you see a black fringe, re-import with
Premultiplied alpha"; an output whose visible-alpha fraction notably exceeds the source's
gets "if you see dark smudges/halos around motion, re-import with Alpha bleed".

**Revision + dedupe:** `CONVERTER_REVISION` → `2026-07-25.4`. The encoder args are
unchanged, but the revision contract keys on OUTPUT — and a default import's output
genuinely changes (no bleed) — so the bump is required; it forces NO re-imports (≤ .3
bleed-on assets are not defective). Provenance records `alphaBleed` alongside
`premultipliedAlpha`, and the pre-convert dedupe is REVISION-GATED + correction-matched: an
asset from an older revision (where the bleed ran implicitly, unrecorded) or a different
correction set is a genuinely different output and never offered as "use existing".

## The "darkening bug" in the unpremultiply expression — measured, NOT reproduced (2026-07-25)

Investigated as its own task after the fast-path change, with a quantified banded fixture
(known premultiplied values: opaque gold α=255 · half α=128 premult(128,108,0) · transparent
α=0 · faint glow α=12 premult(12,10,0); expected TRUE colour everywhere content exists:
gold 255,215,0). Four pipelines measured:

| pipeline                                             | α=255 band | α=128 band | α=12 band  |
| ---------------------------------------------------- | ---------- | ---------- | ---------- |
| GEQ_UNPREMULT alone (native, no encode)              | 255,215,0  | 255,215,0  | 255,212,0  |
| OLD full graph incl. bleed (native, no encode)       | 255,215,0  | 255,215,0  | 255,212,0  |
| premult-only `-vf` path through the VP8 encode       | 254,214,0  | 254,214,0  | 254,211,0  |
| **premult-only through the REAL app wasm (0.12.10)** | 255,215,3  | 253,212,4  | 255,212,21 |

Every reading is the correct straight gold within codec/canvas-readback rounding (the α=12
row's spread is the premultiplied-canvas quantisation at 12/255, not pipeline error). **The
expression does not darken — in either ffmpeg generation, at any alpha level, alone or in
the graph, before or after the encode.** The E2E fringe guard (real wasm, quantified
thresholds) independently pins the same result.

**What the field actually saw is the STRAIGHT-SOURCE case:** applying the un-premultiply to
an already-correct source amplifies its semi-transparent pixels by 255/α (over-brightening,
blown soft edges, halos at hard edges under 4:2:0) — "visibly damaged WITH the toggle,
correct WITHOUT it", exactly as reported. That class is already closed by the two shipped
decisions: the correction DEFAULTS OFF and is a knowing opt-in (its UI states the cost and
the damage risk on a correct source), and the result panel now DETECTS a
premultiplied-looking source (`straightEvidenceFrac`) and points at the checkbox only when
the readings support it. No expression change ships — altering proven-correct pixel math on
an unreproduced report would be the plausible-but-wrong trap. REOPEN CONDITION: a clip of
the owner's that darkens WITH the toggle ON while its semi-transparent pixels measure
consistent-with-premultiplied (straight-evidence ≈ 0); the banded harness in this section
pins the expected numbers to compare against.

## THE UNIFIED SEEK VERDICT — alignment at the source + the seek audit (2026-07-25)

**Every remaining artifact was the ONE proven mechanism** (owner's decisive single-clip
test): pause/resume black speckle + the dark box + the unrecovered freeze, the earlier
two-video "black band", the verify sweep's false positives, and canvas-blank at rest are
all a seek meeting a GOP whose alpha side-stream frame is inter-coded at the governing
main keyframe. Premultiplied is CLEARED (identical alpha numbers either way); concurrency
is cleared (more videos only meant more corrective seeks).

**ALIGNMENT IS ACHIEVABLE — and shipped (`-keyint_min 25`, revision `2026-07-25.5`).**
`kf_min == kf_max` FIXES the GOP, so both libvpx encoder instances (colour + alpha)
keyframe at exactly the same frames. Measured: native 14.32 s repro — 15/15 main
keyframes carry alpha keyframes, ZERO strays, all 29 previously-failing cold seeks
decode, output 5% SMALLER (8.23 vs 8.66 MB), no encode-time cost; END-TO-END through the
REAL wasm converter — 5/5 GOPs aligned, 20/20 cold seeks clean. Re-import implication:
≤ .4 assets stay seek-fragile (they play and air correctly; re-importing under .5 removes
the fragility at the source; the revision-gated dedupe guarantees a true re-encode).
Everything below is therefore BELT-AND-BRACES for pre-.5 assets — and it also unblocks
the deferred canvas-playback/scrubbing work, which is seek-dominated.

**THE SEEK AUDIT (every seek in the video path):**

| seek site                               | necessity    | protection now                                        |
| --------------------------------------- | ------------ | ----------------------------------------------------- |
| driver `reset()`/`start()` → seek(0)    | necessary    | inherently safe (alpha frame 0 is always a keyframe)  |
| driver `resume()` re-seek               | **HABITUAL** | **ELIMINATED** — clock re-anchors to the media + play |
| driver loop WRAP (authored loopStart)   | necessary    | dead-detect + rebuild (below); safe on .5 assets      |
| driver drift correction (>80 ms, rare)  | necessary    | dead-detect + rebuild; safe on .5 assets              |
| driver `playOutro()` → seek(outroStart) | necessary    | forced recovery at entry + dead-detect; safe on .5    |
| canvas/thumbnail/import POSTER          | necessary    | the robust ladder (eager seek → 16× sequential)       |
| import playability verify (5-pt sweep)  | **HABITUAL** | **ELIMINATED** — full sequential playthrough          |
| `sampleOutputAlphaStats` (5 seeks)      | diagnostics  | fail-soft (null profile, guard skipped with console)  |
| scrub / runtime.tick                    | (none)       | never touches the video                               |

**DEAD-MEDIA RECOVERY IS REAL NOW** ("stop did not recover" falsified the old reset
claim): a terminal `media.error` kills the NODE — no seek/play on it ever paints again —
so recovery REBUILDS the element (`VideoHandle.dead()`/`recover()`; runtime.ts builds a
fresh node with the same attributes/src/data-\* so the Designer preview pool re-adopts it,
restores the position, resumes playing). The driver checks per tick (rate-limited 1/s —
no rebuild storms on a genuinely broken asset) and FORCES recovery at every lifecycle
entry: `reset` / `resume` / `stop` / `playOutro`. Explicitly distinct from the Phase-3
no-remount-on-drag guard: only `media.error` triggers a rebuild; a transform never sets it.

## The opacity "drop" (58.1% → 34.9%) — mostly a frame-set comparison bias (2026-07-25)

Its own finding, NOT part of the seek work. Measured at full resolution:

- **Static encode loses nothing:** an α=255 band decodes 100% ≥250 (min 253); an α=250
  band stays exactly; a dense sinusoidal field (mean 127.5) is bit-near-identical.
- **Matched animated frames retain within a few points:** a sliding-bar clip decodes
  84%→84% opaque on the advancing-edge frame, 84%→80% retreating (mild moving-edge
  erosion — the only real loss), 100%→100% on hold frames.
- **The samplers read DIFFERENT frames of an animated clip:** source profiled 3 frames at
  16.7/50/83%, output 5 frames at 10/30/50/70/90% (the field reading's n=1 624 320 vs
  n=2 707 200 is exactly 3 vs 5 frames). On the synthetic slide clip those two sets read
  88% vs 80% opaque ON IDENTICAL BYTES; on a real lower-third with long animated
  intro/outro tails the bias grows with the transitional share of the clip. SHIPPED FIX:
  both profilers now sample the SAME `ALPHA_SAMPLE_FRACTIONS` (10/30/50/70/90%), making
  the collapse guard and the opaque-drop warning like-for-like. Residual honest loss on
  the owner's clip = the moving-edge erosion class (a few points), not tens of points.

## The pre-convert hash froze the page — worker offload + strict pre-filter (2026-07-25)

The "Page Unresponsive" during "Checking for a previous import… 0%": the incremental
sha256 is pure JS, and hashing 150–740 MB on the MAIN thread yields only microtasks
between chunks — paint starves, the 0% never repaints. Two-part fix:

1. **Off the main thread:** `hashSourceFile` now runs the unchanged streaming core
   (`hashSourceStream`, still bounded-memory, still unit-tested directly) inside a
   dedicated Worker; progress posts back so the percentage advances and the modal stays
   interactive; cancel = `worker.terminate()` (immediate; the File is untouched).
2. **Skip it when a duplicate is impossible:** the size pre-filter existed but checked
   ONLY byte size — the owner's freeze was a re-import whose size-matches were
   stale-revision assets the hash-gated match would reject anyway. `startImport` now
   applies the FULL hash-free predicate (`matchesConversionParams`: current revision +
   fps + crop + correction set) before hashing: no possible match ⇒ straight to
   converting (the provenance hash still computes DURING the encode, in the worker).

## Phase 5 — the single-file size threshold (2026-07-25, PROVISIONAL until hardware)

Measured with REAL exporter artifacts (the actual `produce()` output, real cgJsIife runtime,
the owner-class 8.7 MB/14.3 s 1920×282 clip) loaded from `file://` in desktop Chromium — the
closest available proxy for CasparCG's CEF; REAL CEF 2.3 (Chromium 71) could not be tested
from here and is assumed ~×4 slower (older parser, broadcast box under render load):

| inline payload (HTML size)                      | boot: navigate → runtime-ready | play → ALL videos decodable |
| ----------------------------------------------- | ------------------------------ | --------------------------- |
| 3.1 MB (1 × 2 MB clip)                          | 311 ms                         | 101 ms, 1/1                 |
| 11.4 MB (1 × 8.7 MB)                            | 456 ms                         | 102 ms, 1/1                 |
| 33.5 MB (3 × 8.7 MB — the owner-realistic trio) | 725 ms                         | 101 ms, 3/3                 |
| 66.5 MB (6 × 8.7 MB)                            | 1 571 ms                       | 102 ms, 6/6                 |
| 132.6 MB (12 × 8.7 MB)                          | 2 609 ms                       | 302 ms, 12/12               |
| 264.8 MB (24 × 8.7 MB)                          | 4 528 ms                       | 420 ms, 24/24               |

LINEAR (~17 ms/MB after a ~300 ms base), NO CLIFF, every video decodable at every tier — so
the threshold is a LATENCY guardrail (CG ADD responsiveness on air), not a hard failure
boundary. **Threshold: 40 MiB inline (≈30 MB of stored WebM)** — the realistic trio stays
under; a fourth heavy clip warns; projected CEF worst case at the threshold ≈ ~3 s ADD.
PROVISIONAL: Phase 6 measures real ADD latency on 2.3.x hardware and confirms or moves it
(the constant is `SINGLE_FILE_INLINE_WARN_BYTES`, one place). The warning never blocks
(decision (d)) and names the total + dominating clips + the `.vcg` alternative (its assets
ship as separate binary files — no inline inflation, no parse cost).

## OPEN — owner decision

- **Single-file size threshold:** the value, and whether crossing it WARNS or BLOCKS. Decide
  after the spike produces a real converted-archive artifact with measured sizes.
- **Seek-correction UX bar:** if the spike measures visible stutter on drift correction inside a
  hold loop, the acceptable correction cadence (resume/wrap-only vs per-tick bounded) is an
  on-air quality judgment for the owner, informed by the measured numbers. Post-spike status:
  zero corrections were needed on the fixture clip; the owner's real-archive run re-measures
  this before the bar is set.

## Related

- **D-140 (unified Source selector)** adds a second CREATION entry point for the `video`
  element: Source=Video file runs THIS change's import flow (crop modal + in-app conversion)
  unchanged — never a direct-play of the picked file. UI-level only; no schema interaction with
  this change.
