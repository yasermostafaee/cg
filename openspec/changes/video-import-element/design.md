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
  it for its original live-plate purpose.
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

## OPEN — owner decision

- **CEF ~71 VP9+alpha:** whether CasparCG 2.3.x's CEF renders VP9 + alpha (`yuva420p`)
  correctly. VP8 + alpha (`-auto-alt-ref 0`) is the documented fallback if it does not. Per
  B-066, modern Chrome proves NOTHING here — only the Phase-1 spike artifact on real hardware
  answers this, and Phase 1 gates everything after it.
- **Single-file size threshold:** the value, and whether crossing it WARNS or BLOCKS. Decide
  after the spike produces a real converted-archive artifact with measured sizes.
- **Vendored wasm binary vs git:** where the ffmpeg.wasm payload lives w.r.t. the repo (plain
  file, LFS, `.gitattributes`) given its size. Needs an owner call on repo-size tolerance.
- **Seek-correction UX bar:** if the spike measures visible stutter on drift correction inside a
  hold loop, the acceptable correction cadence (resume/wrap-only vs per-tick bounded) is an
  on-air quality judgment for the owner, informed by the measured numbers.

## Related

- **D-140 (unified Plate source selector)** adds a second CREATION entry point for the `video`
  element: Source=Video file runs THIS change's import flow (crop modal + in-app conversion)
  unchanged — never a direct-play of the picked file. UI-level only; no schema interaction with
  this change.
