# Tasks — Live Source multi-box

## 0. Status — DESIGN-FIRST

**This change is authored as a design. No implementation task below is ready to start**, and none
should be started until §7's cross-change obligation on R-028 is settled and §12's two owner
questions in `design.md` are answered.

- [x] 0.1 Author `proposal.md`, `design.md` and the spec deltas from the 2026-08-03 recon and the
      2026-08-03 hardware measurements, as ONE change spanning D-137 and C-015.
- [x] 0.2 Record every DOES-NOT-EXIST claim with the search that established it (`design.md`
      carries a `SEARCH:` line beside each).
- [x] 0.3 Settle the ten decisions in the task's §5, each with its rejected alternatives.
- [ ] 0.4 **Owner:** answer `design.md` §12.1 (C-015's hardware acceptance on a plant with no
      Decklink card) and §12.2 (the rehearse contradiction). **Blocking for phase 7 and phase 1
      respectively.**

## 1. Phase 1 — Schema and authoring (no bridge, no wire)

- [ ] 1.1 Extend `VideoPlaceholderElementSchema` additively
      (`packages/shared-schema/src/elements.ts:1015-1021`): an optional key source id, and the
      symbolic-id format refinement from `design.md` §3. No schema-version bump — the migration
      registry is empty (`packages/shared-schema/src/migrations/index.ts:19-32`) and the additive
      precedent is `holdOverrides` (`elements.ts:1096-1103`).
- [ ] 1.2 Add a `BindingTarget` variant reaching the source id
      (`packages/shared-schema/src/bindings.ts:17-93`, which has 12 variants and none that can),
      plus its `applyOne` arm, its `bind-resolver` rule, and the `InspectorPanel` gate.
- [ ] 1.3 Add the creation path that **does not exist today** (C2): a `DesignerTool` entry
      (`apps/designer/src/renderer/state/store-core.ts:19-30`) and a factory in
      `element-defaults.ts` beside the other 13.
- [ ] 1.4 Add `mode: 'author' | 'output'` to `RuntimeBootOptions`
      (`packages/template-runtime/src/runtime.ts:394`), threaded to `buildScene`
      (`packages/template-runtime/src/scene-builder.ts:81`), and name the mode at all four boot
      sites. **`design.md` §9 — this seam does not exist and the bars requirement depends on it.**
- [ ] 1.5 Render procedural SMPTE bars + the id label in `'author'` mode; zero painted pixels in
      `'output'` mode. Bars are CSS/inline-SVG, never a bundled bitmap.
- [ ] 1.6 Exclude a Live Source from zone compilation in `'output'` mode, closing the
      `zone-css.ts:159-169` background-colour hazard (`design.md` §9).
- [ ] 1.7 Exempt a Live Source from `dropFullyOffFrameForExport`
      (`apps/designer/src/renderer/state/off-frame.ts:186-197`) and make out-of-frame a preflight
      **error** instead (C8). An element that is a contract must not be silently deleted.
- [ ] 1.8 Preflight codes: out-of-frame, overlap, a device-shaped id, and a geometry-keyframed hole
      (all `severity: 'error'` — a warning does not block, `CompositionActionBar.tsx:41`). Costs no
      wire change: `ExportIssue.code` is an open string (`packages/shared-ipc/src/channels/export.ts:16-24`).
- [ ] 1.9 Unit tests + a Designer E2E mapping each `#### Scenario` in
      `specs/designer-live-source/spec.md`.

## 2. Phase 2 — Declaration and carrier

- [ ] 2.1 `collectLiveSources(scene)` in `@cg/vcg-format`, beside `buildPlayoutMetadata`. Composes
      the FULL ancestor chain **including composition-instance scale**, which `frameAabb` does not
      (`design.md` §6). Lift `localToParent`'s kernel (`off-frame.ts:50-60`); do not reuse the
      renderer-local function.
- [ ] 2.2 Add `resolution`, `defaultPosition` and a `liveSources` declaration block to
      `TemplateInfoSchema` (`packages/shared-ipc/src/channels/templates.ts:14-70`), following the
      `hasNext` precedent (`:53-69`). **`defaultPosition` is REQUIRED, not optional-nice-to-have:**
      the bridge appends the position query only when an override exists
      (`caspar-runtime.ts:3685`), so without it the bridge and the page resolve different positions
      for any authored-position template with no override, and the live box lands where the hole is
      not (`design.md` §6).
- [ ] 2.3 Populate all three at import in `produceTemplateDelivery`
      (`apps/runtime/src/renderer/features/library/templateDelivery.ts:177-189`).
      `defaultPosition` is already extracted there at `:209` for the browser-local store — the same
      value now also rides `TemplateInfo`.
- [ ] 2.4 A template whose scene declares Live Sources but whose `TemplateInfo` block is absent
      reads as **re-import-required** on the row — absent must not silently mean "none".
- [ ] 2.5 Define `LiveLayerRecord` and the `#liveLayers` ledger type (not yet wired).
- [ ] 2.6 Correct the misleading `C-015` tags on `#reservedLayers`
      (`tools/caspar-bridge/src/caspar-runtime.ts:295-300`) and in
      `tools/caspar-bridge/tests/fixed-layers-store.test.ts:76`: `reservedLayers` is a fence AWAY
      from a foreign owner, not a record of layers we own (`design.md` §4).

## 3. Phase 3 — The mock (blocks phase 5)

- [ ] 3.1 Widen `LayerState.producer` to include `'route' | 'decklink' | 'ndi'`
      (`tools/amcp-mock/src/types.ts:44`) and replace `producerFor`
      (`tools/amcp-mock/src/handlers.ts:100-104`) with a real first-argument classifier.
- [ ] 3.2 Make an unrecognised producer form a **refusal**, restoring the mock's own doctrine
      (`handlers.ts:36-38`) to `handlePlay`, which today refuses only on addressing.
- [ ] 3.3 Model `MIXER … FILL` **and `MIXER … CLIP`**, adding both rects to `LayerState`, so a test
      can assert the normalized geometry. Without this, `design.md` §6's arithmetic is uncheckable
      offline. Model `CLIP` as an INTERSECTION MASK in the same channel-normalized space as `FILL`
      (measured, `design.md` §3) — including the disjoint case, where the layer renders nothing:
      that is the state a test must be able to catch, because it is the on-air failure mode.
- [ ] 3.4 Fix the `[HTML]` fidelity gap (`handlers.ts:102` compares `=== 'HTML'`), which starts
      mattering the moment the bridge emits `PLAY`.

## 4. Phase 4 — The mapping store and its settings surface

- [ ] 4.1 `SourceMappingsSchema` in `@cg/shared-ipc` — a discriminated union on producer `kind`
      (`design.md` §2), never a free string. Each entry carries an OPTIONAL `aspect`: the
      installation's statement of what the plant actually delivers, which is the **fit input** for
      §3's crop-to-fill. `expectedAspect` on the element is a declaration to validate against, not
      the fit input — they are different fields (`design.md` §3).
- [ ] 4.2 `SourceMappingStore` in the bridge: atomic mkdir → tmp → rename mirroring
      `fixed-layers-store.ts:305-310`; **absent file ⇒ NO MAPPINGS, no built-in default**;
      present-but-invalid ⇒ **hard boot failure**.
- [ ] 4.3 A new `--source-mappings-path` flag, default `~/.cg-runtime/bridge-source-mappings.json`.
      ⚠ **NOT inside `templatesDir`** — `TemplateRegistry.loadPersisted` reads every `*.json` there
      as a template (`tools/caspar-bridge/src/template-registry.ts:75,87`).
- [ ] 4.4 Load + validate **before** the WebSocket binds, with a `{ value, source }` provenance
      handle and a boot line, following `describeFixedBank` (`bin/caspar-bridge.mjs:162-182`).
      Pinning test shaped like `fixed-layers-boot.integration.test.ts:134-165`.
- [ ] 4.5 Validate the Live Source layer range disjoint from the fixed bank AND the reserved range,
      at load and at change, extending `validateFixedBank` (`fixed-layers-store.ts:145-166`).
- [ ] 4.6 A `sources.*` IPC channel with refusal reason codes derived from a wire const, so store
      and channel cannot drift.
- [ ] 4.7 A CG Control settings modal modelled on `DelimitersModal`: **no optimistic local update**
      (`delimiterStore.ts:134-140`) and an older-bridge translation for the unknown-channel refusal
      (`:162-171`), which every station whose bridge predates this feature will hit.

## 5. Phase 5 — Ownership (requires phase 3)

- [ ] 5.1 Wire `#liveLayers` beside `#slots` (`caspar-runtime.ts:310`) — **not folded into it**;
      `#slots` answers a different question that nine read sites depend on.
- [ ] 5.2 R-009: add the `#liveLayers` coordinates to the sweep's `owned` set
      (`caspar-runtime.ts:2390-2393`).
- [ ] 5.3 C-014: skip Live Source coordinates in `#reconcileForeignQuarantine` **before** the
      `occ.producer === 'html'` test at `:3520`, since that test is what a bridge-owned non-html
      layer defeats.
- [ ] 5.4 R-015: `clearLayer` refuses a Live Source layer with a **new distinct reason**
      (`live-source`), not `foreign` and not `owned`. **Do NOT apply C-015's exemption as worded** —
      it would make Live Source layers operator-clearable (`design.md` §4, C5).
- [ ] 5.5 Regression tests for all three doors plus the boundary, against the phase-3 mock.

## 6. Phase 6 — Producer, geometry, audio

- [ ] 6.1 `playSource` / `mixerFit` / `mixerClear` on `command-builder.ts`, all layer-scoped
      through `target()`. Channel-scoped forms stay forbidden (`caspar-runtime.ts:2718-2724`).
      **`mixerFit` emits the `FILL` and the `CLIP` as a PAIR from one computation** — NOT two
      independent methods a caller could get half-right. Measured: `CLIP` masks in channel space and
      does not travel with `FILL`, so a fill box that moves out from under its clip window renders
      **nothing at all** — a black hole where a guest should be (`design.md` §3).
- [ ] 6.2 The scene-px → `FILL` chain from `design.md` §6, with the per-axis normalization measured
      on hardware, and the bridge resolving the SAME three-step position chain the page does
      (override ?? carried `defaultPosition` ?? centred). **Do not use the naive
      `rect.x / scene.resolution.width` form** — it is wrong by a fifth of the frame on a 4:3
      raster.
- [ ] 6.2a **Duplication guard 1 — ONE implementation.** Move the DOM-free half of `position.ts`
      (`REFERENCE_FRAME`, `ANCHOR_FRACTIONS`, `outputTranslate`, `outputScale`, `outputLetterbox`)
      into `@cg/shared-schema` beside `positionQuery` (`packages/shared-schema/src/scene.ts:260`);
      re-export from `@cg/template-runtime` so no page import churns. The bridge already depends on
      `@cg/shared-schema`, so this adds no dependency. Follows the precedent the code itself argues
      at `caspar-runtime.ts:3681-3684` — _"never a local spelling … two spellings of one override is
      how a preview comes to place a graphic differently from air."_
- [ ] 6.2b **Duplication guard 2 — a CONTRACT TEST** pinning the bridge's normalized FILL to the
      page's composed transform over a fixed table of `(scene.resolution, raster, rect, position)`
      triples. **MUST include at least one non-16:9 raster** — on 16:9 every term collapses
      (`s = 1`, `pad = (0,0)`) and the test would pass against a wrong implementation. Use
      `1440×1080` (already pinned page-side at `output-position.test.ts:162,169`) and `720×576`,
      which pads on the other axis.
- [ ] 6.3 The aspect fit: **crop-to-fill** — scale to cover the hole preserving proportions, clip
      the overflow — driven by the MAPPING's `aspect`, falling back to `expectedAspect` only where
      the mapping states none. Refuse the take with a distinct errorCode when the two disagree
      (`design.md` §3). Pillarbox was weighed and **rejected**: bars inside a designed frame read as
      a fault on air.
- [ ] 6.3a **NARROWED 2026-08-03 — coordinate space and composition order are SETTLED by
      measurement** (`design.md` §3: `CLIP`'s rect is channel-normalized like `FILL`'s, and it MASKS
      rather than travelling with it; a disjoint clip window renders nothing). `MIXER CROP` is no
      longer the fallback for either question. Two things remain, neither needing a capture card:
      **(a)** is `CLIP` purely an INTERSECTION mask under PARTIAL overlap — the crop-to-fill case,
      where the fill rect is larger than the clip rect on one axis and is neither disjoint nor
      contained; **(b)** what rounding/precision the server accepts for the four arguments, since
      §6 emits computed fractions and no recorded precision exists (`css()` uses 6 decimals for the
      CSS side, `position.ts:202-204`; whether AMCP matches is unknown).
- [x] 6.3b **DONE 2026-08-03 — the `FILL` and `CLIP` facts hold on the TARGET build.** Measured on
      the plant's CasparCG **2.3.2** (`D:\programs\CasparCG`), same machine, same clean-reset
      procedure: `MIXER 1-2 FILL 0.5 0.5 0.5 0.5` → box bottom-right; `MIXER 1-2 CLIP 0 0 0.5 0.5`
      → box disappears entirely. Same behaviour as 2.5.0, so the normalization basis and the
      masking semantics both carry to the build the feature targets.
      **Recorded as QUALITATIVE on 2.3.2** — box present, then absent, by eye. **The SEMANTICS
      carried across builds; the ARITHMETIC was not re-measured there** (the pixel-accurate
      `FILL 0.5 0.5 0.5 0.5` → (960, 540) sized 960×540 is a 2.5.0 measurement). Nothing in the
      design depends on it having been: §6 needs the basis and the semantics, both confirmed, not
      the pixel figure, whose job was to falsify the competing basis hypothesis. This task no
      longer rides with §12.1, which remains open on its own terms (DECKLINK and fill+key).
- [ ] 6.4 Clamp the FILL to the scene rect (`.cg-stage` has `overflow:hidden`; the live source
      behind the hole does not).
- [ ] 6.5 **The audio rule:** every bridge-created producer is created muted; audio is raised only
      by explicit recorded intent. `playSource` is immediately followed by `VOLUME 0` in the same
      batch (`design.md` §7).
- [ ] 6.6 `mixerClear` on teardown — mixer state survives `CLEAR`
      (`command-builder.ts:128-130`, measured on hardware), so omitting it leaves a `FILL` a later
      graphic inherits.
- [ ] 6.7 The take refuses legibly with a distinct `errorCode` when a declared id has no mapping —
      never a silent empty hole on air (`docs/prd/caspar.md:396-397`).
- [ ] 6.8 The two-box `route://` demo on real hardware, which needs no capture card.

## 7. Cross-change obligation — R-028

- [ ] 7.1 **R-028 gains a task 6.5: amend section 6 to a THREE-class declared model** before 6.1–6.3
      are implemented. As written, 6.2 would make a Live Source layer an R-009 reclaim candidate and
      6.3 would point R-015's foreign refusal at a layer the bridge owns (`design.md` §4).
- [ ] 7.2 R-028's task 6.1 test is written to permit a **declared, non-operator** allocation.
- [ ] 7.3 Confirm R-028's 6.4 frees 10–59, which is this design's chosen Live Source range.
- [ ] 7.4 Cross-reference both ways: R-028's 8.3 already lists C-015 for `reservedLayers`; extend it
      to name the ownership class.

## 8. Docs and PRD

- [ ] 8.1 Correct C1, C2, C5, C6 and C8 in D-137 / C-015 (`design.md` §11).
- [ ] 8.2 Flip D-137 and C-015 to `[~]` naming this change dir.
- [ ] 8.3 Engine doc-sync: `packages/template-runtime/README.md` for the `mode` seam, and
      `docs/engines/overview.md`.

## 9. Gate

- [ ] 9.1 `pnpm openspec validate live-source-multibox --strict`.
- [ ] 9.2 Full green gate (uncached) + `gate:e2e` per phase that touches UI or render.
- [ ] 9.3 A Linux `gate:e2e` is owed for phases 1 and 9 — a Windows run is non-authoritative.
- [ ] 9.4 **Hardware:** the phase-6 `route://` demo is dischargeable here; **phase 7 is not** —
      see `design.md` §12.1, which is an owner decision, not work.
