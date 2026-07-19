# Tasks — Lottie lifecycle element (D-125)

> **STATUS — RECONCILED against merged `main` (pre-archive housekeeping).** Every checkbox below
> was re-verified from the CODE on merged main, not from prior claims — a repo-wide audit found
> tasks.md an unreliable signal (whole sections shipped but unticked; §8/§9 here were exactly that).
> The original `⟦PR-n⟧` plan was RE-CUT mid-flight; what actually shipped, in order:
>
> - **#335** `939d9cc` — Phase 1: schema, bridge (`lottie_light` + `markersToSegments`), render
>   mount + `lottieAssets` seam, BOTH exporters (§D5(c) conditional player), Designer UI. Render-only.
> - **#337** `3e23d31` / **#338** `6f56039` / **#339** `6f3def1` — Phase 1 canvas follow-ups (§13).
> - **#341** `f1cbe16` — Phase 2: the lifecycle crux — OUT mapping, `drivesHold` opt-in, the
>   element-outro seam on `out()`/`stop()`, the B-034 hidden-inert gate.
> - **#345** `652dcc5` — Phase 3a (§12): entrance settle DERIVED from the Lottie intro + Inspector
>   timing guidance (one shared `lottieTiming` helper).
> - **#348** `df37de2` — Phase 3b-1 (§14): comp-space timing panel, real Playout action buttons,
>   the B-091 preview `lottie-assets` guard.
> - **#352** `ba7e456` + **#354** `233b92c` — style pass on the panels (+ the a11y/E2E repair the
>   Windows-run shortcut shipped) (§14).
> - **#357** `d4d8bbb` — Phase 3b-2 (task 7.6): the AUTO-exit path through the seam, exactly once.
> - **#358** `f256c07` — Phase 3c (tasks 6.1/9.4): `lottie-override` field bindings.
>
> **Still open: §11 — the CasparCG 2.3.x CEF hardware smoke (the pre-archive gate).**

## 1. Schema (`@cg/shared-schema`) — `⟦PR-1⟧`

- [x] 1.1 Extend `LottieElementSchema` (`elements.ts:770`) with a `phases` object (intro-end /
      outro-start + optional idle segment in animation frames + a `source: 'markers'|'manual'` tag,
      optional/additive), `holdBehavior` (`z.enum(['freeze','idle-loop']).default('freeze')`), and
      `drivesHold` (`z.boolean().optional()` — **inverse** default: absent ⇒ does NOT drive). Keep the
      existing `assetId`/`speed`/`loopMode`/`segment?`/`fieldOverrides?`. No schema-version bump (all
      additions optional).
- [x] 1.2 Schema unit tests: phases round-trip; ordering refinement `ip ≤ introEnd ≤ outroStart ≤ op`
      where enforced at the element level; `holdBehavior` default; a pre-D-125 bare lottie element
      still parses unchanged.

## 2. Lottie bridge (`@cg/lottie-bridge`) — `⟦PR-1⟧`

- [x] 2.1 Switch `runtime.ts` from `import lottie from 'lottie-web'` to
      `lottie-web/build/player/lottie_light` (SVG renderer). Keep the `LottiePlayerHandle` surface
      (`play`/`pause`/`stop`/`destroy`/`goToFrame`/`isAlive`/`element`); the driven-frame model uses
      `goToFrame` + `autoplay:false` (already the default) — no new player capability.
- [x] 2.2 Add marker reading + a pure `markersToSegments(animation)` that maps `markers[]` to a
      segments object (`source`, `introEnd`, `outroStart`, `idleIn`, `idleOut`) in animation frames,
      with the recognised names/aliases and the validity rule (`ip ≤ introEnd ≤ outroStart ≤ op`, else
      a `manual` fallback).
      Expose `markers`/frame metadata on `LottieAnimation` so the importer/Inspector can read them.
- [x] 2.3 Unit tests (PRD-required "marker→segment mapping"): a valid marker set → segments; missing/
      out-of-order/out-of-range → manual fallback; alias names; no-markers → manual.

## 3. Render — replace the placeholder (`@cg/template-runtime`) — `⟦PR-2⟧`

- [x] 3.1 Add `@cg/lottie-bridge` to `@cg/template-runtime` dependencies (this is what pulls
      `lottie_light` into the bundle and under the CEF-compat scan).
- [x] 3.2 `scene-builder.ts:156` — replace `buildPlaceholder` for `type: 'lottie'` with a
      `createLottiePlayer(container, animationData, { autoplay:false, speed })` mount. The
      `animationData` comes from the new `lottieAssets` seam (task 3.3); register the container in the
      scope element map and mark it `data-cg-content='lottie'`.
- [x] 3.3 Add a `lottieAssets: Record<assetId, unknown>` (parsed animation data) option to
      `createRuntime`/`RuntimeBootOptions` (parallel to `assetUrls`), resolved per-output by the host
      (preview / `.vcg` / single-file). The scene-builder reads `lottieAssets[el.assetId]`.

## 4. Phase mapping onto the lifecycle (`@cg/template-runtime`) — `⟦PR-2⟧`

- [x] 4.1 Resolve the element's phase frames (`el.phases` when present, else whole-clip intro / freeze
      at `op` / empty outro) into a driver config in animation frames; map onto the composition IN /
      HOLD / OUT **by phase** (design §D1), not by rescaling onto `outPoint`/`contentStart`.

## 5. Lifecycle driver (`@cg/template-runtime`) — `⟦PR-2⟧`

- [x] 5.1 New `lottie-driver.ts` — the driven-frame `LottieDriver` off the injected `RuntimeClock`
      (`goToAndStop`): `reset`/`start`/`pause`/`resume`/`stop`/`destroy`/`whenComplete` +
      `playOutro()`. Intro `[ip→introEnd]` once; hold = freeze at `introEnd` OR loop `[idleIn,idleOut]`
      per `holdBehavior`; frame derived from elapsed active time × `fr` × `speed` (design §D3).
- [x] 5.2 A `scope.lotties` collection (mirroring `scope.tickers`), built in `runtime.ts` beside the
      ticker/clock/sequence drivers; each element also registered for the exit seam (task 7).
- [x] 5.3 Wire the driver into the play/reset (`runtime.ts:1205-1215`), pause/resume
      (`runtime.ts:1287-1298`), stop-content (`stopScopeContent`), and remove/destroy cascades — so
      the Lottie freezes/continues in lockstep and is torn down symmetrically.
- [x] 5.4 `drivesHold` (opt-in) — contribute `whenComplete()` to the content-driven hold aggregation
      **only when `el.drivesHold === true`** (a freeze Lottie completes at `introEnd`; an idle-loop
      Lottie never completes). Read as `=== true`, never `!== false` (the inverse of the other
      content kinds — call it out in the code).

## 6. Field overrides — `lottie-override` no longer a no-op (`@cg/template-runtime`) — `⟦PR-4⟧`

- [x] 6.1 **(Phase 3c)** Implemented through the bridge: `LottiePlayerHandle.applyOverride` resolves
      `text` (lottie-web's own `updateDocumentData`) and `fill`/`stroke` (static-attribute patch on
      the named layer's rendered subtree) onto named TOP-LEVEL layers, routed from `bindings.ts` via
      a container→handle registry, on play and every `update()`. Image substitution deferred — the
      design allows it "if cheap" and it is not (asset reload machinery). No phase-affecting property
      is overridable. The old no-op pin test was replaced with real routing coverage.

## 7. The element-outro seam (`@cg/template-runtime`) — `⟦PR-2⟧` (the crux — reviewed first)

- [x] 7.1 Add an element-outro registry in `createRuntime` (the `LottieDriver`s owning an outro across
      subtrees) and a `collectElementOutros()` helper.
- [x] 7.2 `out()` (`runtime.ts:1261`) — await both the existing 400 ms `fadeContentOut` AND every
      element outro (`Promise.all`) before `playBackgroundOutroAndSettle()`, inside the existing
      `exitGen` generation check and the `paused`/`pendingExitOutro` defer. Exclude Lottie roots from
      `fadeContentOut` (a `data-cg-outro` guard) so the fade doesn't fight `goToAndStop`.
- [x] 7.3 `stop()` (`runtime.ts:1247`) — `hideContentNow()` for the non-owning content, but
      `await Promise.all(outros.map(d => d.playOutro()))` before the background (so `stop()` still
      plays the Lottie outro per acceptance), inside the same `exitGen` check.
- [x] 7.4 `playOutro()` always resolves: degenerate/absent outro → immediate; clamp final paint to
      `op`; destroyed driver → immediate. `remove()` stays a synchronous hard kill (no outro). Verify
      no strand / never-settle against the B-030/B-031/B-033/B-034 cases (design §D6.4).
- [x] 7.5 **B-034 hidden/visible gate on the NEW collections** (`⟦PR-2⟧`) — a `visible: false` Lottie is
      excluded where `outroLotties` / the hold contribution are BUILT (a hard gate no parent override
      can resurrect), and `collectElementOutros()` skips a hidden instance's whole subtree so a Lottie
      under a hidden ANCESTOR is inert too. Tests must BITE (reverting either gate fails them).
- [x] 7.6 **`⟦PR-5⟧` (Phase 3b-2) — the AUTO-exit path, DONE.** Routed through the seam via the
      one-shot outro ledger + `PlayoutController.beforeOutro` gate + `onCycleRestart` re-arm (design
      §D6.2b): every exit path plays the element outro exactly once, with the B-030..B-034 defenses
      intact (bite-verified by reverting each mechanism piece). The Phase-2 characterization test was
      FLIPPED to the fixed behaviour and the narrowed spec scenario reworded — both had encoded the
      defect as correct.

## 8. Exporters — `⟦PR-3⟧`

- [x] 8.1 (#335) `packages/single-file-export/src/lottie-export.ts` — `collectLottieElements` +
      `resolveLottieAsset`, mirroring `image-export.ts`. VERIFIED on merged main (this section sat
      unticked while fully shipped — the audit's exact pattern).
- [x] 8.2 (#335) `ExporterSingleFile` inlines the Lottie JSON as a `lottieAssets` map + ships the
      player bundle conditionally; zero external requests under the CSP. VERIFIED
      (`exporter-single-file.ts`, 13 `lottieAssets` sites; covered by
      `packages/single-file-export/tests/exporter-single-file.test.ts`).
- [x] 8.3 (#335) `.vcg` packs each Lottie JSON as `assets/lottie/<sha>.json` bytes plus a
      lottie-kind `AssetEntry`; the boot builds `lottieAssets` from the packaged files. VERIFIED
      (`Exporter.ts`; pinned by `apps/designer/tests/exporter-vcg-lottie.test.ts`).
- [x] 8.4 (#335) Shipped as §D5 option **(c) + the minify lever**: the base runtime resolves the
      bridge's `lottie_light` import to a stub delegating to a global, and a SEPARATE minified
      `cgJsLottie`/`cgJsLottieIife` pair ships ONLY when a Lottie is present. Measured on current
      main: **168.1 KB** per player const (vs 425.7 KB unminified at decision time) — see §D5's
      shipped note.
- [x] 8.5 (#335) `cef-compat.test.ts` scans the player consts against `CEF_BANNED_BUILTINS`
      (5 lottie references in the test). VERIFIED.

## 9. Designer UI (`apps/designer/src/renderer`) — `⟦PR-4⟧`

- [x] 9.1 (#335) Import via Project Assets → `Lottie…` (allowlist-validated, readable rejection
      reasons). VERIFIED (`ProjectAssetsPanel.tsx`, 10 Lottie sites; exercised by every lottie E2E's
      import helper).
- [x] 9.2 (#335, re-cut by #337) `defaultLottie` factory + the `CanvasOverlay` drag-from-panel
      `onDrop` seam shipped and are THE placement path. The planned `DesignerTool` member +
      `CanvasToolbar` tool shipped in #335 and were then **REMOVED by #337 as redundant** (a
      Lottie needs an asset, so panel-drag is the only placement that makes sense — the toolbar
      tool was a dead affordance; verified: no `lottie` in `store-core.ts` on main). Not re-adding.
- [x] 9.3 (#335, evolved by #345/#348) `LottieSections` shipped: speed, hold-behaviour select,
      phase mapping (marker-sourced read-only; manual number inputs — since #348 each with a live
      comp-frame equivalent), `lottie: UNIVERSAL_ONLY` kept (opaque). The planned **"Re-read
      markers" button never shipped** — superseded: re-import re-reads markers, and the 3a/3b-1
      timing panel made the mapping visible enough that the affordance never came up again.
- [x] 9.4 **(Phase 3c, minimal form)** `resolveBinding` gains a lottie branch fed by the parsed
      clip's layer names (`lottieLayerNames` via the asset cache, passed from CanvasOverlay): a text
      field auto-targets the first TEXT layer (`prop: 'text'`), a colour field the first non-text
      layer (`prop: 'fill'`); no matching layer → null (the existing "can't bind" feedback).
      `describeBinding` renders the pick (`lottie <layer>.<prop>`). A full layer/prop PICKER (choose
      among multiple layers / stroke vs fill) is deliberately deferred — the auto-pick covers the
      typical one-text-one-shape furniture clip, and retargeting is unbind → rebind.
- [x] 9.5 (#335; hardened by #348) The preview iframe `lottieAssets` seam via
      `scene-replace`/`lottie-assets` messages + `lottieAssetCache` on the host. #348 added the
      B-091 guard: a map arriving MID-PLAYBACK defers its rebuild to the next play instead of
      tearing down the live graphic.

## 10. Tests & docs

- [x] 10.1 `markersToSegments` unit tests — done in 2.3 (`⟦PR-1⟧`).
- [x] 10.2 `@cg/template-runtime` lifecycle test on the injected `RuntimeClock` (`⟦PR-2⟧`):
      intro → hold → **ticker-driven hold** (a ticker on top drives the hold, the Lottie holds
      beneath) → **outro** (Lottie outro before the background) → **CLEARED** with every driver halted.
      Plus the §D6.4 risk cases (strand / supersede / pause mid-outro / synchronous `remove()`), the
      B-034 hidden + hidden-ancestor gates, and the freeze-vs-idle-loop hold distinction
      (`tests/lottie-lifecycle.test.ts`).
- [x] 10.3 (#335) Exporter tests: `apps/designer/tests/exporter-vcg-lottie.test.ts` (`.vcg` bytes +
      `AssetEntry`), `packages/single-file-export/tests/exporter-single-file.test.ts` (inline JSON +
      conditional player, zero external requests), `cef-compat.test.ts` (player consts scanned).
- [x] 10.4 Four E2E specs on merged main, accumulated per phase rather than as one `⟦PR-4⟧` batch:
      `lottie-element.spec.ts` (#335/#337 — import → place → canvas + preview render, opaque
      inspector), `lottie-entrance-settle.spec.ts` (#345, realigned by #354), `lottie-auto-exit.spec.ts`
      (#357), `lottie-override.spec.ts` (#358 — bind from canvas → live preview override).
- [x] 10.5 Engine doc-sync (in the runtime PR): `docs/engines/overview.md`,
      `packages/template-runtime/README.md`, and the canvas README for the new element + the
      element-outro seam.
- [x] 10.6 PRD D-125 is `[~]` with the change dir + per-phase history (kept current since #345).
      The flip to `[x]` waits for §11 — NOT this housekeeping pass.

## 12. Phase 3a — entrance settle derived from the Lottie + Inspector guidance (`⟦PR-5⟧`)

- [x] 12.1 ONE shared helper: `lottieTiming` + `lottieClipMeta` in `@cg/lottie-bridge`
      (`src/timing.ts`) — the single conversion between animation frames, seconds, and a
      composition's frames. Consumed by BOTH the runtime settle derivation and the Inspector
      readout, so the number shown is the number used. Replaces the runtime's private
      `lottieFrameMeta`.
- [x] 12.2 `entranceSettleFrame` (`animation-applier.ts`) takes an optional `lottieSettles` list and
      returns the LATEST of the keyframe-derived and Lottie-derived frames, clamped to `outPoint`.
      Behaviour-preserving byte for byte when the list is empty.
- [x] 12.3 `runtime.ts` collects each VISIBLE, phase-marked Lottie's settle offset inside the
      EXISTING B-034 visible gate (so hidden stays inert) and feeds it to `entranceSettleFrame`.
- [x] 12.4 `needsFrameSweep` gains the Lottie-derived-settle reason, for EVERY scope (B-088's
      lifespan reason stays root-only). Required by measurement, not assumption — see design §D6.5.
- [x] 12.5 Inspector (`StyleSection.tsx` `LottieSections`): clip totals (`op` / `fr` / seconds) and
      each phase in animation frames + seconds + this composition's frames, live-updating on speed /
      phase / frame-rate changes, plus the out-point overrun warning naming both numbers. Adds
      `lottieAssetCache.get(assetId)`.
- [x] 12.6 Tests: `packages/lottie-bridge/tests/timing.test.ts` (the conversion, incl. the worked
      example → frame 33), `packages/template-runtime/tests/lottie-entrance-settle.test.ts` (the
      crux + multiple / mixed / manual-override / hidden / hidden-ancestor / absent-phases / clamp /
      speed-2 / no-Lottie regression), `apps/designer/tests/lottie-inspector-timing.test.ts` (the
      readout + warning), and the E2E `apps/designer/tests/e2e/lottie-entrance-settle.spec.ts`.
- [x] 12.7 The Phase-3a deferral note, fully discharged since: the auto-exit seam gap (#357,
      task 7.6), Lottie field overrides (#358, tasks 6.1/9.4), the preview mid-playback rebuild
      (#348, B-091 — task 9.5 note).

## 13. Phase 1 canvas follow-ups — ADDED mid-flight (not in the original plan)

- [x] 13.1 (#337) Removed the redundant Lottie canvas-toolbar tool (see 9.2) and re-greened the
      icon-pack E2E it broke.
- [x] 13.2 (#338) Render the Lottie on the EDITOR CANVAS, not only in the preview iframe — the
      canvas mounts real players from `lottieAssetCache`.
- [x] 13.3 (#339) Poster a VISIBLE frame on the static canvas: marked clips park on `introEnd`,
      marker-less clips on the clip MIDPOINT — never `op`, which for real AE furniture is the
      invisible outro-end (the "empty box on the canvas" bug).

## 14. Phase 3b-1 + the style/a11y passes — ADDED mid-flight

- [x] 14.1 (#348) Lottie timing panel rebuilt around COMP-SPACE answers: the settle frame as THE
      decision number, a mode-aware hold line (freeze shows NO duration — that segment never
      plays), time-to-clear after OUT, animation-frame detail demoted to a collapsed disclosure.
- [x] 14.2 (#348) Playout inline-link actions became real buttons with self-contained labels
      (`Clear out point`, `Add out point`, `Pin content start`, `Reset to auto`).
- [x] 14.3 (#348) B-091: the preview `lottie-assets` handler no longer rebuilds mid-playback —
      deferred to the next play (mirrors the `update` handler's `!playing` guard).
- [x] 14.4 (#352) Inspector colour hierarchy: marker-tied action buttons (out-point amber /
      content-start cyan from the SHARED timeline-marker tokens), pale-red removals, pale-yellow
      cautions (infinite-driver chips + the won't-auto-close banner de-escalated from red), strong
      red reserved for real errors (the 3a out-point overrun warning); Button recipe UA-chrome
      reset + derived hover washes.
- [x] 14.5 (#354) The #352 pass shipped an a11y regression on a Windows-run shortcut — the caution
      recolour silently dropped the hold banner's `role="alert"`. Restored via an explicit `role`
      prop on `Callout` (colour and assertiveness are independent axes), and the timing E2E was
      realigned to the redesigned panel. Kept here as the recorded lesson behind "a Windows E2E
      pass is never authoritative".

## 15. Known boundaries shipped AS DOCUMENTED (#358) — reported, deliberately not "fixed"

- [x] 15.1 Image overrides DEFERRED with the stated reason (design allows them only "if cheap";
      asset reload/re-render machinery is not). The override surface is text + fill/stroke on
      named TOP-LEVEL layers only.
- [x] 15.2 A colour override on a top-level PRECOMP recolours its whole rendered subtree, and an
      ANIMATED property always wins over an override on the next rendered frame — both are the
      documented opacity boundary (`applyOverride` docblock), not defects.
- [x] 15.3 `LottieElementSchema.fieldOverrides` is a RESERVED, unused record (overrides route
      through the `lottie-override` binding target so templates stay byte-stable); docblock says
      so; removal waits for a schema-version bump.

## 11. Pre-archive gate (NOT a code task — the B-066 hardware smoke)

- [ ] 11.1 A real smoke test of an exported single-file Lottie template on **CasparCG 2.3.x CEF
      hardware** from `file://`: the player boots, renders, plays intro → hold → outro, and issues
      zero external requests. Modern Chrome does not count. Archive only after this passes.
