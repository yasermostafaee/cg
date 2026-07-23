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
