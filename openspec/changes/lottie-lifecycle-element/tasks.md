# Tasks — Lottie lifecycle element (D-125)

> **STATUS.** The design checkpoint is approved and implementation is under way in phases.
> **Phase 1** (#335 + the canvas fixes #337/#338/#339) shipped §1–§3 and §8–§9: schema, the
> `@cg/lottie-bridge` (`lottie_light` + `markersToSegments`), the render mount + `lottieAssets` seam,
> the exporters, and the Designer UI — with a RENDER-ONLY driver (no lifecycle).
> **Phase 2** (this change) ships the lifecycle CRUX: §4 (the OUT phase mapping), §5 (`drivesHold`,
> opt-in), §7 (the element-outro seam + the B-034 hidden-inert gate), and §10.2/§10.5.
> **Phase 3** covers §6 (field overrides), §7.6 (the auto-exit boundary — owner decision), §10.4 (E2E)
> and §11 (the CasparCG 2.3.x CEF hardware smoke, the pre-archive gate).
> **PR boundaries** are flagged as `⟦PR-n⟧`.

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

- [ ] 6.1 Implement the `lottie-override` case in `bindings.ts:210` through the bridge: resolve
      `text`/`color` (image if cheap) overrides onto the named `layer`/`prop` in the mounted Lottie,
      on play and every `update()`. A secondary path — the native overlay carries the dynamic content.

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
- [ ] 7.6 **`⟦PR-3⟧` / OWNER DECISION — the AUTO-exit path.** A composition that ends its own
      content-driven / `auto-out` hold exits via `PlayoutController.startOutro()`, which does NOT
      route through the `out()`/`stop()` element-outro seam, so the Lottie stays parked on its hold
      frame while the background closes (design §D6.2 BOUNDARY note; pinned by a characterization test
      and a spec scenario). Decide whether to extend the seam into the controller's exit — it needs a
      supersede-safe hook, since `startOutro()` is also reached from the controller's own `stop()`.

## 8. Exporters — `⟦PR-3⟧`

- [ ] 8.1 New `packages/single-file-export/src/lottie-export.ts` — `collectLottieElements(scene)` +
      `resolveLottieAsset(source, assetId)`, mirroring `image-export.ts` (walk scene + compositions +
      containers, dedupe).
- [ ] 8.2 `ExporterSingleFile` (`exporter-single-file.ts`) — inline each Lottie JSON as a JS literal
      into a `lottieAssets` map baked into the boot script (like `scene`), passed to `createRuntime`;
      include the player bundle. Zero external requests — the CSP (`default-src 'none'`,
      `script-src 'unsafe-inline'`) forbids eval/wasm/fetch. Unresolved JSON → a preflight warning
      (never blocks).
- [ ] 8.3 `apps/designer/src/platform/Exporter.ts` `#gatherBinaries` — pack each Lottie JSON as
      `assets/lottie/<sha>.json` bytes + an `AssetEntry { kind: 'lottie' }` (mirroring images); the
      `.vcg` `buildIndexHtml`/boot builds `lottieAssets` from the packaged files (same-origin under the
      `.vcg`'s strict `'self'` CSP — not an "external" request).
- [ ] 8.4 `packages/single-file-export/scripts/bundle-runtime.mjs` — emit the player per the §D5
      **owner-chosen** strategy. Default (recommendation): a conditional 3rd/4th const (e.g.
      `cgJsLottieIife`) shipped only when a Lottie is present. Fallback (if owner picks unconditional):
      the player rides the existing `cgJs`/`cgJsIife`. Optional lever: minify the player entry only.
- [ ] 8.5 Extend `cef-compat.test.ts` to scan the player bundle artifact too (whichever const carries
      it), against the same `CEF_BANNED_BUILTINS` list.

## 9. Designer UI (`apps/designer/src/renderer`) — `⟦PR-4⟧`

- [ ] 9.1 Import: `ProjectAssetsPanel.tsx` — add a `Lottie…` item (`:287-303`), widen `importKind`'s
      union to include `'lottie'` (`:149`), and add the delete-warning copy branch (`:401-417`). (The
      `lottie` asset kind, `AssetStore` `assets/lottie/<sha>.json` path, and `mimeOf` already exist.)
- [ ] 9.2 Tool + placement: add a `'lottie'` member to `DesignerTool` (`store-core.ts:19`) and a tool
      to `CanvasToolbar.tsx` (`:36`); a `defaultLottie` factory in `element-defaults.ts` (mirror
      `defaultImage:370`, needs an `assetId`); a placement branch in `CanvasOverlay.tsx` `onPointerDown`
      and the `onDrop` seam (`:516`, drag a lottie asset from the panel).
- [ ] 9.3 Inspector: a `LottieSections` in `StyleSection.tsx` (replacing the Filter-only fall-through
      at `:138` for `lottie`) — speed, hold-behaviour select (`Freeze` / `Loop idle segment`), and the
      phase mapping (read-only chips when marker-sourced; number inputs + "Re-read markers" when
      manual). Keep `field-registry.ts:691` `lottie: UNIVERSAL_ONLY` (no internal-keyframe editor —
      opaque).
- [ ] 9.4 Bindings: `bind-resolver.ts` — offer `lottie-override` as a selectable target (a layer/prop
      picker over the animation's named layers) instead of returning null (`:74-77`); `describeBinding`
      already renders it (`:118`).
- [ ] 9.5 Preview: `platform/preview.ts` — extend the iframe seam to deliver the Lottie JSON (a
      `lottieAssets` map) to `createRuntime` (`:414`), populated like `assetUrls` via the
      `asset-urls`/`scene-replace` postMessage handlers; the Canvas/PreviewModal hosts post the map.

## 10. Tests & docs

- [x] 10.1 `markersToSegments` unit tests — done in 2.3 (`⟦PR-1⟧`).
- [x] 10.2 `@cg/template-runtime` lifecycle test on the injected `RuntimeClock` (`⟦PR-2⟧`):
      intro → hold → **ticker-driven hold** (a ticker on top drives the hold, the Lottie holds
      beneath) → **outro** (Lottie outro before the background) → **CLEARED** with every driver halted.
      Plus the §D6.4 risk cases (strand / supersede / pause mid-outro / synchronous `remove()`), the
      B-034 hidden + hidden-ancestor gates, and the freeze-vs-idle-loop hold distinction
      (`tests/lottie-lifecycle.test.ts`).
- [ ] 10.3 Exporter tests (`⟦PR-3⟧`): `.vcg` packs the Lottie JSON bytes + `AssetEntry`; single-file
      inlines JSON + player with **zero** external requests; the `cef-compat.test.ts` artifact scan
      covers the player bundle.
- [ ] 10.4 E2E (`apps/designer/tests/e2e`, `⟦PR-4⟧`): import → place → preview → export, mapping the
      `designer-lottie-element` scenarios to Playwright steps (fixtures/page objects).
- [x] 10.5 Engine doc-sync (in the runtime PR): `docs/engines/overview.md`,
      `packages/template-runtime/README.md`, and the canvas README for the new element + the
      element-outro seam.
- [ ] 10.6 PRD `docs/prd/designer.md` D-125 → `[~]` with the change dir noted.

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
- [ ] 12.7 NOT Phase 3a (deferred to Phase 3b): the auto-exit seam gap, Lottie field overrides, and
      the preview mid-playback rebuild.

## 11. Pre-archive gate (NOT a code task — the B-066 hardware smoke)

- [ ] 11.1 A real smoke test of an exported single-file Lottie template on **CasparCG 2.3.x CEF
      hardware** from `file://`: the player boots, renders, plays intro → hold → outro, and issues
      zero external requests. Modern Chrome does not count. Archive only after this passes.
