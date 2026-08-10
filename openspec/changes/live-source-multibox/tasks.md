# Tasks — Live Source multi-box

## 0. Status — authored DESIGN-FIRST; phase 1 is now UNBLOCKED

**This change was authored as a design**, with no implementation task ready to start until §7's
cross-change obligation on R-028 was settled and §12's two owner questions in `design.md` were
answered. **Both happened on 2026-08-08** — see `design.md` §12.1 and §12.2 (DECIDED), plus a third
decision at §12.4 folding the audio cluster into this wave, and §7 below (all four ticked).

**Phase 1 is therefore ready to start.** Phases 2–7 stay gated on their own predecessors — the mock
blocks 4 and 5, the source stores block 6, and phase 7 is C-021's (`design.md` §12.1) — never on
§0 again.

- [x] 0.1 Author `proposal.md`, `design.md` and the spec deltas from the 2026-08-03 recon and the
      2026-08-03 hardware measurements, as ONE change spanning D-137 and C-015.
- [x] 0.2 Record every DOES-NOT-EXIST claim with the search that established it (`design.md`
      carries a `SEARCH:` line beside each).
- [x] 0.3 Settle the ten decisions in the task's §5, each with its rejected alternatives.
- [x] 0.4 **Owner:** answer `design.md` §12.1 (C-015's hardware acceptance on a plant with no
      Decklink card) and §12.2 (the rehearse contradiction). **ANSWERED 2026-08-08**, recorded in
      `design.md` §12 and not re-openable: §12.1 narrows C-015 to per-source assignment in CG Control
      plus the two-box `route://` demo, splitting DECKLINK / NDI / fill+key out to **C-021**
      (`[!]` blocked on hardware) — so phases 1–6 carry NO undischargeable hardware debt; §12.2
      decides v1 shows an EMPTY, TRANSPARENT region in PVW, rendering the retained exported page
      verbatim, with no second render path built now. A third decision, §12.4, lands the audio
      cluster (R-029 / R-042 / B-121) inside this wave — see 6.5 below.

## 1. Phase 1 — Schema and authoring (no bridge, no wire)

- [x] 1.1 Extend `VideoPlaceholderElementSchema` additively
      (`packages/shared-schema/src/elements.ts:1015-1021`): an optional key source id, and the
      symbolic-id format refinement from `design.md` §3. No schema-version bump — the migration
      registry is empty (`packages/shared-schema/src/migrations/index.ts:19-32`) and the additive
      precedent is `holdOverrides` (`elements.ts:1096-1103`).
- [x] 1.2 Add a `BindingTarget` variant reaching the source id
      (`packages/shared-schema/src/bindings.ts:17-93`, which has 12 variants and none that can),
      plus its `applyOne` arm, its `bind-resolver` rule, and the `InspectorPanel` gate.
- [x] 1.3 Add the creation path that **does not exist today** (C2): a `DesignerTool` entry
      (`apps/designer/src/renderer/state/store-core.ts:19-30`) and a factory in
      `element-defaults.ts` beside the other 13.
- [x] 1.4 Add `mode: 'author' | 'output'` to `RuntimeBootOptions`
      (`packages/template-runtime/src/runtime.ts:394`), threaded to `buildScene`
      (`packages/template-runtime/src/scene-builder.ts:81`), and name the mode at all four boot
      sites. **`design.md` §9 — this seam does not exist and the bars requirement depends on it.**
- [x] 1.5 Render procedural SMPTE bars + the id label in `'author'` mode; zero painted pixels in
      `'output'` mode. Bars are CSS/inline-SVG, never a bundled bitmap.
- [x] 1.6 Exclude a Live Source from zone compilation in `'output'` mode, closing the
      `zone-css.ts:159-169` background-colour hazard (`design.md` §9).
- [ ] 1.5a 🔴 **THE BACKDROP PUNCH — 1.5 RESTATED (owner, 2026-08-10; `design.md` §9a).** "Zero
      painted pixels" is NECESSARY AND NOT SUFFICIENT. The whole page is ONE CasparCG layer above
      the Live Source layers, so a designed OPAQUE BACKDROP beneath the plates — which is what a
      multi-box layout normally carries, and what the client authors — SURVIVES at the plate's rect
      and the live picture is never seen. In `'output'` mode a Live Source must make the page
      **TRANSPARENT over its own rect**, ERASING what the template painted beneath it.
      **MEASURED, not inferred:** `buildScene` in `'output'` mode over an opaque full-frame rect with
      a plate above it emits the plate as an EMPTY geometry-only `<div>` (no background, no
      `mix-blend-mode`, no mask, no clip-path, no children) and nothing in the page carries a
      `destination-out`, a mask or a clip-path. The probe was a throwaway test and was DELETED in the
      same commit that recorded the finding — leaving it would have meant a test the fix must delete.
      Consistent with the box-shadow amendment: the HOLE is transparent; the element may still paint
      OUTSIDE its rect. Same family as 1.6's `zone-css` hazard (a background reaching the hole),
      different cause — that one is an authored zone colour, this one is a sibling element beneath.
- [ ] 1.5b ⚠ **RECON FIRST, ON THE RIGHT BROWSER — do not choose a mechanism on reasoning.** Two
      candidates, both recorded in `design.md` §9a with their trade-offs:
      **(a) `mix-blend-mode: destination-out` on the plate** — element-local, no coupling to the
      backdrop, and the erase follows the element's own box so a `border-radius` gives a ROUNDED hole
      for free; the risk is SCOPE, since it erases within its stacking/isolation group and what
      reaches the page's ROOT alpha depends on the isolation above it.
      **(b) masking the BACKDROP with the plate rects** — predictable, but couples the backdrop to
      the plates and must be recomputed whenever a plate moves.
      **Measure on the CEF inside the plant's CasparCG 2.3.2, NEVER on desktop Chrome** (`B-066` is
      exactly this class — a root `tsconfig` `es2022` setting that `SyntaxError`d on CEF 71 while
      every local check passed). What must be SHOWN: real transparency in the EXPORTED single-file
      page, under that CEF, with the live layer visible behind it. **Record the measurement, not the
      expectation.** This task is the owner's to run; 1.5c is blocked on its result.
- [ ] 1.5c Implement the mechanism 1.5b selects, and **test that the EXPORTED page's alpha is CLEAR
      over the plate's rect with an opaque backdrop present** — the assertion must be about the
      exported artifact, since that is what CEF loads, and a builder-level assertion would pass on a
      page whose root alpha is still opaque.
- [ ] 1.5e ⭐ **THE PLATE GAINS A STROKE (owner, 2026-08-10; `design.md` §9a.1).** Colour + width,
      same class as the box-shadow already allowed: paint on the TEMPLATE layer, OUTSIDE the hole,
      live picture untouched. A coloured frame around each guest box is what a multi-box design
      actually wants.
      **REUSE `StrokeSchema` (`packages/shared-schema/src/primitives.ts:117-121`) unchanged — do NOT
      invent a second stroke concept.** Checked, not assumed: that schema is `{ width, color, dash? }`
      and has **NO alignment notion**; box kinds render it as a CSS `border`
      (`scene-builder.ts:1133-1135`) and `@cg/template-runtime` sets **no `box-sizing` reset**, so the
      CSS default `content-box` already paints it OUTSIDE the declared `width`/`height`. The declared
      rect stays the content box, which is what `collectLiveSources` reads. If shapes ever gain an
      alignment notion, a Live Source offers only `outside`.
      Scope: the schema field, the **Inspector control**, the round-trip through **BOTH exporters**,
      and a test that **the stroke SURVIVES the punch** (1.5c).
- [ ] 1.5f 🔴 **THE PUNCH MUST NOT ERASE THE PLATE'S OWN PAINT — a requirement ON THE MECHANISM.**
      An erase driven by the element's own painted alpha (which `destination-out` is) would eat the
      stroke and leave nothing visible. **The punch is scoped to the HOLE'S FILL AREA; stroke and
      shadow survive it.**
      The two candidates are **not symmetric** about this and 1.5b's choice must weigh it: masking the
      BACKDROP cannot erase the plate's own paint (the plate is not the eraser), while
      `destination-out` must be scoped deliberately — e.g. the erase on an inner fill node with the
      stroke painted by an outer one.
      **1.5b's CEF measurement is EXTENDED accordingly: it must show BOTH real transparency over the
      hole AND an intact stroke and shadow around it.** A mechanism that punches correctly and eats
      its own stroke passes the old criterion and fails the feature — criterion 2 is an independent
      way to fail, not a refinement of criterion 1.
- [ ] 1.5g **Neither stroke nor shadow enters the hole rect**, so neither touches
      `collectLiveSources`' geometry nor 1.8's OVERLAP check — pin that: **two plates whose strokes or
      shadows overlap is NOT a fault; two plates whose HOLES overlap is.** The overlap check reads the
      declared rect and must keep reading only that.
- [ ] 1.5d **`border-radius` on a Live Source — revisit AFTER 1.5c, not before.** The Inspector
      withholds it today (a `video-placeholder` is a "bare" kind in `field-registry.ts` and never
      carried `BOX_DESCS`), and `design.md` §9a records why that is pending rather than settled:
      once a punch exists, rounding is MEANINGFUL AND HONEST in the multi-box case — the CSS hole
      rounds and the live rectangle's square corners are covered by the backdrop being punched. The
      earlier "rounding is impossible" framing was about the LONE-PLATE case (a plate over the
      programme with nothing behind it), where the corners have nothing to hide them and
      `MIXER FILL`/`CLIP` are rectangular — **that case stays unachievable in v1 either way.**
      ⚠ When it lands, **the HOLE and the STROKE (1.5e) must round TOGETHER**: a rounded hole inside a
      square frame is worse than either alone, because the frame stops following the picture.
- [x] 1.7 Exempt a Live Source from `dropFullyOffFrameForExport`
      (`apps/designer/src/renderer/state/off-frame.ts:186-197`) and make out-of-frame a preflight
      **error** instead (C8). An element that is a contract must not be silently deleted.
- [x] 1.8 Preflight codes: out-of-frame, overlap, a device-shaped id, and a geometry-keyframed hole
      (all `severity: 'error'` — a warning does not block, `CompositionActionBar.tsx:41`). Costs no
      wire change: `ExportIssue.code` is an open string (`packages/shared-ipc/src/channels/export.ts:16-24`).
- [x] 1.8a **EXTENDED 2026-08-10 — two cases that reach air the same way and were missing.** Both
      `severity: 'error'`, both checked on the COMPOSED ANCESTOR CHAIN rather than on the element,
      because an element-local implementation passes each of them by accident:
      **(a) `live-source-rotated`** — rotation ANYWHERE in the chain. `collectLiveSources` emits a
      flattened AXIS-ALIGNED rect, so a rotated hole declares its BOUNDING BOX — larger than the
      frame the author drew — and the live picture is composited showing OUTSIDE the frame. A
      rotated PARENT does this with the element's own rotation still at 0.
      **(b) `live-source-animated` on an ANCESTOR** — the existing code read as covering the element
      alone. An animated parent moves the hole identically, and `collectLiveSources` reads
      transforms STATICALLY (`design.md` §6 lists "Animated values" among what the flattener does
      not compose). Same desync, same live-face-sliding-out failure.
      Each message NAMES the element, names the offending ancestor where there is one, and says what
      to change — not merely that the export is blocked. The element's own case and its ancestor case
      are mutually exclusive (`else`), because one problem reported twice reads as two faults.
- [x] 1.8b **The Inspector no longer offers what a Live Source cannot honour** (owner, 2026-08-10 —
      the affordances were still on screen after phase 1 shipped, so the author could author a
      refusal and only learn at EXPORT, which is the wrong end of the process). Removed for a Live
      Source ONLY, every other kind unchanged: the keyframe diamond on every transform field,
      `rotation` ENTIRELY (not merely its keyframes — `MIXER FILL` is axis-aligned), `opacity` (the
      element paints zero pixels on air and cannot reach the layer behind it), the whole **Filter**
      section, and the `key id` control + its D-147 hint (superseded by §1a — fill+key is the
      MAPPING's).
      **X, Y, W, H and the STATIC scale stay** — `collectLiveSources` composes scale into the
      flattened rect, so a static scale is meaningful.
      **Done as a SUBTRACTION in `field-registry.ts` (`LIVE_SOURCE_STATIC`), not as a special case
      in the Inspector**, because `isKeyframeable` is already the ONE rule the right inspector and
      the timeline-left both obey — so the diamonds leave both surfaces from one edit and cannot
      drift apart. `TransformSection` reads `descriptorFor` to decide whether a field exists at all.
      **REMOVAL over disabling, for all five**, with ONE hint line in the section explaining the
      cause they share: five disabled controls would teach the same sentence five times and then
      nag forever, and `point` was already optional (the multi-select editor omits it) so an absent
      diamond leaves no gap that could read as a rendering fault. ⚠ `keySourceId` is NOT removed
      from the schema — deprecated and never written; removing it is a migration (4.8).
      **Linux e2e DISCHARGED:** <https://github.com/yasermostafaee/cg/actions/runs/31376780917> —
      `ubuntu-latest`, commit `fd89922`, **`conclusion: success`, the `E2E (Playwright)` job COMPLETED
      and green** (not skipped, not cancelled). That commit carries 1.8a and 1.8b in full, including
      the restructured `live-source.spec.ts`.
- [x] 1.9 Unit tests + a Designer E2E mapping each `#### Scenario` in
      `specs/designer-live-source/spec.md`.
- [x] 1.10 **D-147 (a) — the aspect PRESET picker.** `expectedAspect` becomes a named picker over the
      SAME stored number: `16:9` · `4:3` · `21:9` · `2.39:1` · `1:1` · `9:16`, plus `Custom…` (which
      reveals today's numeric input) and `— not specified —`. Every label prints BOTH spellings
      (`16:9 (1.78)`), because the field takes the decimal and the author reasons in ratios — that
      ambiguity is what prompted the item. Built on the shared `Select` (no raw `<select>`).
      ⚠ **One schema change, a WIDENING:** `expectedAspect` becomes OPTIONAL. `— not specified —`
      writes it ABSENT, and absent is a real third state — under `design.md` §3 the field is the
      author's ASSERTION and the bridge REFUSES the take when it disagrees with the assigned source,
      so a
      required field forced an author who cannot see the feed into a guess that can refuse a take on
      air. Every stored scene still parses; only the TS type gains `| undefined`.
- [x] 1.11 **D-147 (b) — the "Fit plate to aspect" action.** Resizes so the EFFECTIVE aspect
      `(W·scaleX)/(H·scaleY)` equals the selection, preserving `X`, `Y`, `W` and solving for `H`,
      never touching `scale`, in ONE `updateElement` (⇒ one undo entry). **The bottom-edge flip:**
      where solving for `H` would push the plate past the frame's bottom it preserves `H` and solves
      for `W` instead, and the tooltip says which — out-of-frame is a preflight ERROR (1.7/1.8), so a
      convenience action must never manufacture the error it exists to avoid. The bottom edge is
      measured THROUGH the anchor and scale (`y + h·(ay + sy·(1−ay))`), mirroring `off-frame.ts`, so
      the flip fires at the right moment. Disabled, with a stated reason, when the aspect is absent
      or the plate already matches within tolerance.
- [x] 1.12 **D-147 (c) — the `key id` hint.** States that the key id is SYMBOLIC and pairs with the
      fill id (`guest-1` / `guest-1-key`), that it is empty for any opaque source, and that BOTH ids
      need their own entry in CG Control — the last of which is the part that surprises people. A
      device-shaped id is a preflight error (1.8); the hint is what makes that obvious before the
      author hits it. ⚠ **SUPERSEDED and REMOVED by 4.8** (`design.md` §1a): the key device is a
      property of the INSTALLATION's source, so the control and this hint are both gone. Kept here
      because 4.8 is an explicit un-do and a reader has to be able to find what it undid.

**PHASE 1 LANDED 2026-08-08.** What each task actually produced, so the next reader does not have to
re-derive it:

- **1.1** `LiveSourceIdSchema` (`/^[a-z0-9][a-z0-9_-]*$/i`) + an additive `keySourceId`
  (`packages/shared-schema/src/elements.ts`). The FIELDS are additive; the id refinement is a
  deliberate NARROWING, safe because no stored scene carries the type (design.md §11, C1).
- **1.2** the `live-source-id` target with a `role: 'fill' | 'key'` (defaulting to `fill`), its
  `applyOne` arm (a documented NO-OP — there is no DOM to write; the value reaches the bridge through
  the take's field values), its `bind-resolver` rule and its `describeBinding` case. The
  `InspectorPanel` gate needed no change: the variant carries `elementId`, which is the only thing
  `bindingTargetsElement` asks.
- **1.3** the creation path that did not exist: a `live-source` `DesignerTool`, `defaultLiveSource`,
  the two toolbars, and the canvas placement — with ids handed out `live-1`, `live-2`, … swept
  SCENE-WIDE (a plate id must be unique across the whole template, so a per-composition sweep would
  hand out a duplicate that looks unique — and after the §2z reshape it is the handle the operator
  binds against, which makes uniqueness operator-visible rather than merely internal).
- **1.4** `RenderMode` on `RuntimeBootOptions`, threaded to `buildScene`, `compileZoneCss` and the two
  stamped-scope builders. **FIVE** boot sites name it, not four — `tools/template-fixtures/build.mjs`
  emits a real on-air artifact and was missing from the design's count.
  `tests/live-source-mode-boot-sites.test.ts` fails if any site stops naming it, or if a NEW one
  appears unlisted.
- **1.5** procedural bars with PAIRED gradient stops, never the Chromium-72 double-position form —
  CasparCG's CEF is baseline Chromium 71, so the short form would render here and break on air (B-066
  class). The id label is pinned `direction: ltr` so a Persian scene cannot flip `guest-1`.
- **1.6** `usedTargets` returns NO slots for a `video-placeholder` in `'output'`. The zone NUMBERING
  stays mode-independent on purpose: it is cached per scene object and the builder stamps from it, so a
  mode-dependent count would shift every later element's index and mis-target every rule.
- **1.7** exempt in `filterChildren` — **and its CONTAINER is exempt too** when the subtree holds one,
  which the design did not call out and which is the same silent loss by the back door.
- **1.8** `live-source-off-frame` · `live-source-overlap` · `live-source-device-id` ·
  `live-source-animated`, all `severity: 'error'`, in `renderer/state/live-source-preflight.ts`
  (beside `off-frame.ts` so both share ONE copy of the AABB flattening). Off-frame fires on a PARTIAL
  overhang as well as a full one. The sweep DEDUPES by element id, because `editSceneOf` aliases the
  open composition into both `scene.layers` and `scene.compositions` — without it every issue
  double-reports and every overlapping pair counts four times. Found by the E2E, pinned by a unit test.
- **1.10–1.12** are D-147, an amendment on top of the above rather than a new change: authoring UX on
  an unreleased element, changing no `design.md` decision and touching neither the wire nor the
  bridge. **One consequence is recorded rather than solved:** §3's fit-input fallback is
  _the assigned source's `aspect` → `expectedAspect`_, and an absent `expectedAspect` on a source that
  states no aspect leaves that chain with no terminal value. **Phase 6 owes that case a defined
  behaviour**
  (6.3) — nothing in phase 1 depends on it, and it is written down here rather than silently
  widening §3.
- **1.9** 28 designer unit tests + 12 template-runtime render tests + 15 schema tests, and
  `apps/designer/tests/e2e/live-source.spec.ts` (7 tests) mapping every `#### Scenario` that has a UI
  to drive; the four with no UI in phase 1 are named IN that spec's header with where each is pinned
  instead, so the mapping is complete rather than quietly partial.

## 2. Phase 2 — Declaration and carrier

- [x] 2.1 `collectLiveSources(scene)` in `@cg/vcg-format`, beside `buildPlayoutMetadata`. Composes
      the FULL ancestor chain **including composition-instance scale**, which `frameAabb` does not
      (`design.md` §6). Lift `localToParent`'s kernel (`off-frame.ts:50-60`); do not reuse the
      renderer-local function.
- [x] 2.2 Add `resolution`, `defaultPosition` and a `liveSources` declaration block to
      `TemplateInfoSchema` (`packages/shared-ipc/src/channels/templates.ts:14-70`), following the
      `hasNext` precedent (`:53-69`). **`defaultPosition` is REQUIRED, not optional-nice-to-have:**
      the bridge appends the position query only when an override exists
      (`caspar-runtime.ts:3685`), so without it the bridge and the page resolve different positions
      for any authored-position template with no override, and the live box lands where the hole is
      not (`design.md` §6).
- [x] 2.3 Populate all three at import in `produceTemplateDelivery`
      (`apps/runtime/src/renderer/features/library/templateDelivery.ts:177-189`).
      `defaultPosition` is already extracted there at `:209` for the browser-local store — the same
      value now also rides `TemplateInfo`.
- [x] 2.4 A template whose scene declares Live Sources but whose `TemplateInfo` block is absent
      reads as **re-import-required** on the row — absent must not silently mean "none".
- [x] 2.5 Define `LiveLayerRecord` and the `#liveLayers` ledger type (not yet wired).
- [x] 2.6 Correct the misleading `C-015` tags on `#reservedLayers`
      (`tools/caspar-bridge/src/caspar-runtime.ts:295-300`) and in
      `tools/caspar-bridge/tests/fixed-layers-store.test.ts:76`: `reservedLayers` is a fence AWAY
      from a foreign owner, not a record of layers we own (`design.md` §4).

**PHASE 2 LANDED 2026-08-10.** What each task actually produced:

- **2.1** `collectLiveSources` (`packages/vcg-format/src/live-sources.ts`) with `localToParent`
  lifted from `off-frame.ts:50-60`, and the ancestor chain modelled as a `{ transform, preScale }`
  LEVEL rather than a bare `Transform` — `preScale` is `(1,1)` for a container and
  `(size.w/comp.resolution.width, size.h/comp.resolution.height)` for a composition instance, which
  is the term `frameAabb` has no concept of. It also inherits the builder's own three instance
  guards (missing reference, `MAX_COMPOSITION_DEPTH`, cycle), so a declaration is derived from the
  same subtree the page renders. **A repeater subtree is deliberately NOT walked** and the reason is
  in the module docstring: a stamped row has no static scene-px rect, and every stamp would carry
  the same source id.
- **2.2** ONE optional block, `TemplateInfoSchema.liveSources = { resolution, defaultPosition,
sources }`, with `defaultPosition` REQUIRED **inside** it. ⚠ **A top-level required
  `defaultPosition` would have broken a real consumer** — `TemplateRegistry.loadPersisted` re-parses
  every persisted record through `PersistedTemplateSchema` (`template-registry.ts:19-30,:90-99`) and
  SKIPS one that fails, so it would have emptied every station's library on the first boot after
  upgrade. Nesting keeps the on-air guarantee the task asks for (the bridge can never hold a
  declaration without the position chain) while leaving pre-carrier records parsing. The
  per-declaration shape lives in `@cg/shared-schema` (`live-source.ts`), because `@cg/vcg-format`
  produces it and cannot see `@cg/shared-ipc`.
- **2.3** derived in `produceTemplateDelivery` beside `hasNext`, and **always emitted** — an empty
  `sources` array for a template with none. `defaultPosition` uses the new canonical
  `resolveDefaultPosition` (`@cg/shared-schema`), which `position.ts`'s `resolveOutputPosition` now
  calls too, so "centred" has ONE spelling across the seam. `apps/runtime`'s offline seed derives
  the block as well: a starter synthesised from a scene in hand is not a pre-carrier record and must
  not wear that state.
- **2.4** `liveSourceCarrierState` (`@cg/shared-ipc`) is THE reading of the block —
  `'declared' | 'none' | 'unknown'` — so no caller collapses three states into two. The template
  picker row shows `Re-import required` in the palette's ATTENTION amber for `'unknown'`, with the
  state also on `data-live-sources` so tests assert the state and not the wording.
- **2.5** `tools/caspar-bridge/src/live-layers.ts` — `LiveLayerRecord` / `LiveLayerLedger` /
  `NormalizedRect`, types only, nothing wired. The record carries `clip` as well as `fill`: they are
  two outputs of ONE computation (`design.md` §3), and a ledger holding half of a pair is how they
  come to be re-emitted apart, which renders nothing at all.
- **2.6** both named sites corrected, with the reason recorded in place rather than just the tag
  removed — the mislabel is what let R-028's task 1.2 satisfy C-015's DISJOINTNESS half and read as
  having satisfied its OWNERSHIP half.
- **Spec** gained the requirement the tasks implied and the delta never encoded: _"A template
  CARRIES its Live Source declaration, and an absent carrier is UNKNOWN"_, with three scenarios.
- **Tests** 16 `collectLiveSources` unit tests (every nesting case SCALED — on an unscaled fixture a
  wrong implementation passes), 8 carrier schema/predicate tests, 3 delivery tests, 3 picker DOM
  tests, and `apps/runtime/tests/e2e/live-source-carrier.spec.ts`.

## 3. Phase 3 — The mock (blocks phase 5)

- [x] 3.1 Widen `LayerState.producer` to include `'route' | 'decklink' | 'ndi'`
      (`tools/amcp-mock/src/types.ts:44`) and replace `producerFor`
      (`tools/amcp-mock/src/handlers.ts:100-104`) with a real first-argument classifier.
- [x] 3.2 Make an unrecognised producer form a **refusal**, restoring the mock's own doctrine
      (`handlers.ts:36-38`) to `handlePlay`, which today refuses only on addressing.
- [x] 3.3 Model `MIXER … FILL` **and `MIXER … CLIP`**, adding both rects to `LayerState`, so a test
      can assert the normalized geometry. Without this, `design.md` §6's arithmetic is uncheckable
      offline. Model `CLIP` as an INTERSECTION MASK in the same channel-normalized space as `FILL`
      (measured, `design.md` §3) — including the disjoint case, where the layer renders nothing:
      that is the state a test must be able to catch, because it is the on-air failure mode.
- [x] 3.4 Fix the `[HTML]` fidelity gap (`handlers.ts:102` compares `=== 'HTML'`), which starts
      mattering the moment the bridge emits `PLAY`.

**PHASE 3 LANDED 2026-08-10.** What each task actually produced:

- **3.1** `ProducerKind` = `'empty' | 'html' | 'ffmpeg' | 'route' | 'decklink' | 'ndi'`, and
  `classifyProducer` replacing `producerFor`. **`PLAY` and `LOAD` share the ONE classifier** — two
  copies of the acceptance rule is how they come to disagree about what a valid form is.
- **3.2** the refusal, with the line drawn explicitly: a bare token with **no scheme and no
  keyword** stays `'ffmpeg'` (a media FILE NAME, which is what CasparCG assumes and what the
  existing foreign-layer fixtures like `"program-feed.mov"` depend on); a token that ANNOUNCES a
  structured form — a `scheme://`, or a `DECKLINK` / `NDI` keyword — and then fails to parse is
  REFUSED, because there is no reading of it under which the server would have done what was asked.
  A refused `PLAY` leaves the layer **untouched**: writing the producer and then refusing would be
  the "looks acked, renders nothing" gap in reverse.
  ⚠ **The DECKLINK and NDI argument spellings are MODELLED, NOT MEASURED** — no capture card or NDI
  source exists on this plant, which is exactly what C-021 is blocked on. Said in the classifier's
  own docstring rather than left to be discovered.
- **3.3** `fill` and `clip` on `LayerState`, both channel-normalized, both SURVIVING `CLEAR` (mixer
  state belongs to the channel's mixer — which is why teardown must emit `MIXER … CLEAR`, and a test
  can only catch the omission if the mock keeps the state to be caught). `MIXER … CLEAR` resets both
  geometry terms and deliberately leaves VOLUME alone, so R-022's restore path keeps being tested on
  its own terms. A `FILL` is **not clamped** to the frame: clamping would hide the unclamped-scene-rect
  bug the real server would show as a box running off the raster.
  **The disjoint case is a first-class answer, not an edge case rounded off.** `renderedRect(fill,
clip)` returns `null` — not an empty rect — when the two do not intersect, and
  `MockHandle.layerRenderedRect` exposes it. Zero area is nothing rendered, and `width: 0` reads as
  "very small" to a naive assertion. The test that pins it also asserts that a test reading only
  `fill` would have seen a perfectly good box.
- **3.4** the keyword match now strips the brackets, so CasparCG's real `[HTML]` tag matches as well
  as the bare word. It never mattered while the bridge only emitted `CG ADD`; it starts mattering
  the moment the bridge emits `PLAY`.
- **Tests** `tools/amcp-mock/tests/live-producers.test.ts` — 27 tests over the classifier, the
  refusals, the geometry and `renderedRect`. The 51-file / 286-test `@cg/caspar-bridge` suite runs
  green against the changed mock, which is what says the refusal did not narrow an existing form.

## 4. Phase 4 — the live source stores and their CG Control surfaces

⚠ **RESHAPED 2026-08-10 (owner), AFTER the first version shipped — `design.md` §2z and §2d.** Phase
4 first landed ONE store keyed by the id a TEMPLATE declares. It now has TWO independent stores — a
NAMED catalog the installation builds with no reference to any template, and per-template, per-plate
ASSIGNMENTS joining them — and the binding surface lives in the **Inspector**, not in the sources
modal. The tasks below are written as BUILT, not as originally planned. **The rework was taken
immediately and cost nothing to migrate: no config file existed on any machine, and phase 6 resolves
a plate through this shape, so the cost only grows.**

- [x] 4.1 `SourceCatalogSchema` + `SourceAssignmentsSchema` in `@cg/shared-ipc` — the producer is a
      discriminated union on `kind` (`design.md` §2), never a free string. Each catalog entry carries
      an OPTIONAL `format`: the installation's statement of what the plant actually delivers, which
      is the **fit input** for §3's crop-to-fill. `expectedAspect` on the element is a declaration to
      validate against, not the fit input — they are different fields (`design.md` §3).
- [x] 4.2 `source-catalog-store.ts` in the bridge: atomic mkdir → tmp → rename mirroring
      `fixed-layers-store.ts:305-310`; **absent file ⇒ NO SOURCES, no built-in default**;
      present-but-invalid ⇒ **hard boot failure**.
- [x] 4.3 A `--source-catalog-path` flag, default `~/.cg-runtime/bridge-source-catalog.json`.
      ⚠ **NOT inside `templatesDir`** — `TemplateRegistry.loadPersisted` reads every `*.json` there
      as a template (`tools/caspar-bridge/src/template-registry.ts:75,87`).
- [x] 4.4 Load + validate **before** the WebSocket binds, with a `{ value, source }` provenance
      handle and a boot line, following `describeFixedBank` (`bin/caspar-bridge.mjs:162-182`).
      Pinning test shaped like `fixed-layers-boot.integration.test.ts:134-165`.
- [x] 4.5 Validate the Live Source layer range disjoint from the fixed bank AND the reserved range,
      at load and at change, extending `validateFixedBank` (`fixed-layers-store.ts:145-166`).
- [x] 4.6 A `sources.*` IPC channel with refusal reason codes derived from a wire const, so store
      and channel cannot drift. **FOUR channels plus two publish channels after the reshape** —
      `config` / `set-config` / `assignments` / `set-assignments`, `config-changed` /
      `assignments-changed`.
- [x] 4.7 The CG Control surface, modelled on `DelimitersModal`: **no optimistic local update**
      (`delimiterStore.ts:134-140`) and an older-bridge translation for the refusal every station
      whose bridge predates this feature will hit (`:162-171`). The entry editor carries the
      source's `format` (the `ChannelInput` → `Format` vocabulary,
      `docs/recon/ciab-client-tools.json`) and, on the DECKLINK arm, the optional `keyDevice` —
      §1a/§3a made operable: this is where an installation says "Studio A is a fill/key pair at
      1080i5000".
- [x] 4.8 ⚠ **UN-DO, filed explicitly rather than deleted silently (owner, 2026-08-10, `design.md`
      §1a).** Remove the Inspector's **`key id` control and its hint** — D-147 task (c), landed as
      1.12 — because a template declares ONE id and the fill/key pair is a property of the
      INSTALLATION's source (4.1/4.7). This is the phase that owns that surface, so the removal
      belongs here and not wherever it is next noticed.
      **What must NOT happen with it:** `keySourceId` is NOT removed from
      `VideoPlaceholderElementSchema`. It shipped, it is optional, and deleting it is a MIGRATION.
      It becomes DEPRECATED — never written by a new document, still parsed so every stored scene
      keeps loading — and `collectLiveSources` stops emitting `keySourceId` / `keyDynamic` on the
      declaration. A control that stops being written but stays on screen is worse than either
      state, which is why this is a task and not a footnote.
      **Landed in two halves, and the split is worth naming.** The Inspector's control and its
      hint went in `fd89922` (the Live Source Inspector commit, which implemented the §1a docs
      decision as it removed everything else a plate cannot honour). This phase closed the other
      half: `collectLiveSources` stops emitting `keySourceId` AND `keyDynamic`,
      `VideoPlaceholderElementSchema.keySourceId` is marked DEPRECATED in place, and
      `LiveSourceDeclarationSchema.keyDynamic` is WIDENED to optional — it had to stop being
      required rather than sit pinned at `false`, because a required field that is always the same
      value is a field that still looks like it means something. A KEY-role binding still parses
      and now reaches nothing, which the vcg-format test asserts by name.

### 4a. ⭐ THE RESHAPE — what it changed, as built (owner, 2026-08-10)

- [x] 4a.1 **The catalog is a LIST OF NAMED DEFINITIONS**, no longer keyed by a template's id. Each
      entry: an installation-generated `id`, a REQUIRED human `name`, `format?`, `aspect?`,
      `producer`. `nextSourceId` is random and collision-checked so **an id is never reused** — a
      re-issued id is a stale reference re-binding silently to a source nobody chose. A duplicate
      NAME is refused (`duplicate-name` beside `duplicate-id`): the name is the only handle the
      picker shows.
- [x] 4a.2 **A SECOND STORE holds the assignments** — template → plate → source id — BRIDGE-side
      beside the template registry, because the bridge resolves a plate at take. Same atomic
      mkdir → tmp → rename discipline, the same absent/invalid rules, its own
      `--source-assignments-path` flag (default `~/.cg-runtime/bridge-source-assignments.json`), and
      the same warning that it must NOT sit inside `templatesDir`
      (`template-registry.ts:75,87` reads every `*.json` there as a template).
- [x] 4a.3 **A template's declared `sourceId` is a PLATE IDENTIFIER**, restated in the designer spec
      §1/§2 and in `design.md` §3. The schema field is NOT renamed — that is a scene migration — and
      the rect, `expectedAspect` and every preflight rule attached to it are unchanged.
- [x] 4a.4 **THE THREE CASES, all behaviours rather than open questions** (`design.md` §2c):
      **(a) a plate with no assignment** — the ordinary state of a freshly imported template; the
      template picker row NAMES which plates are unassigned (not a count), and 6.7's refusal is
      extended from a missing MAPPING to a missing ASSIGNMENT.
      **(b) deleting a source that is assigned** — allowed, cascaded bridge-side in the same
      operation, REPORTED at the moment of deletion naming the templates that referenced it, and
      those plates read as needing a source. REMOVED rather than tombstoned, and `design.md` §2c
      records why. The same prune is the boot-time reading of two files that disagree — pruned
      loudly on the boot line, never a boot failure.
      **(c) one source on two plates** — PERMITTED, and recorded as a RECON question for phase 6's
      measurement session (a DECKLINK input may refuse a second open); **until it is answered the UI
      presents it as guaranteed nowhere.**
- [x] 4a.5 **`C-022`'s acceptance updated**: the read-only HTTP endpoint now serves the NAMED list,
      which is strictly better for playout — a rundown wants names, not ids invented by whichever
      template happened to be authored first.
- [x] 4a.6 **`R-048`'s layering stated in both directions**: the assignment is the TEMPLATE-LEVEL
      default; R-048's fast on-air swap is a PER-RUN OVERRIDE on top of it, and the override does
      **NOT write back** — an emergency substitution must never silently become the permanent
      configuration.

### 4b. ⭐ WHERE THE BINDING LIVES — corrected after use (owner, 2026-08-10)

The first implementation put BOTH jobs in the Live sources modal. With two templates imported it
already listed **six plates and scrolled** before a single source existed, and nothing on the surface
was the thing the operator opened it to do.

- [x] 4b.1 **The modal keeps ONE job** — define sources (name, producer kind, format, DECKLINK key
      device) and the LAYER BAND. The TEMPLATE PLATES section is gone entirely.
- [x] 4b.2 **The Inspector gains `LIVE PLATES`** for the selected template: one row per declared
      plate, its source picker, and its unassigned marker. Built on the panel's existing field
      patterns (`cg-inspector-section` + the `cg-field` select), no new control invented. A template
      that declares no plate renders NO section at all.
- [x] 4b.3 **The TEMPLATE-LEVEL scope is stated in the section**, in one line and not a tooltip:
      _"Set for the template, not this row — every row using it takes the same sources."_ Editing it
      from one row changes what other rows carrying the same template will do, and an operator must
      not discover that by surprise on air.
- [x] 4b.4 **A template not on a row cannot be assigned, and that is the DECISION** — recorded, not
      omitted. Under R-028 every template that will be used is on a declared row, so loading it is
      the natural first step, and the take would refuse an unassigned plate anyway.

### 4c. 🔴 THE REFUSAL THE OPERATOR ACTUALLY MET — `invalid request for sources.set-config`

- [x] 4c.1 **The cause, reproduced rather than guessed.** The string is the BRIDGE's own frame
      validator (`bridge.ts` — `invalid request for ${frame.channel}`), which rejects a payload that
      does not parse against the channel's request schema. It is **not a typo, it is a STATE**: the
      browser was talking to a bridge PROCESS built before this channel's shape changed, so the
      payload was legal in the page and rejected on the wire. `unknown channel` was already
      translated — the case where the bridge has never heard of the feature — and this is its
      sibling, where the bridge knows the channel and disagrees about its shape.
- [x] 4c.2 **Two payload bugs in the same class, found and fixed with it**, because each produced
      that same bare message from a bridge that was perfectly up to date: a fresh `ndi` / `media`
      producer was created with an EMPTY name (its own `z.string().min(1)` rejects it), and the
      numeric controls accepted `0` for `channel` / `device` / `keyDevice` (all
      `z.number().int().positive()`). **A control must not be able to produce a value the contract
      forbids** — the floor is now the schema's own, and the text fields hold a draft and commit
      only a non-empty value.
- [x] 4c.3 **NO REFUSAL ON THIS SURFACE SHOWS A WIRE IDENTIFIER.** `sourcesReasonMessage` maps
      EVERY member of both reason unions to an operator sentence, `satisfies
Record<Reason, string>` so a new code cannot ship without one; `sourcesTransportMessage`
      catches all three frame-level answers (`unknown channel`, `invalid request for`, `invalid
response for`) and says the one thing that is true of all of them. Checked as a SET, not one
      by one.

### 4d. ⭐ TWO TEMPLATES NAMED THE SAME — `R-040`'s class on a second surface

- [x] 4d.1 Both of the owner's templates rendered as `seghab` in the Inspector heading and could not
      be told apart. `templateDisplayName` prefers the imported FILE name, and two packages can
      arrive from files called the same thing; the `templateId` that separates them was on the
      heading's `title` attribute, which is to say nowhere an operator looks. The heading now carries
      a short id STUB — **only when another template in this browser's registry shares the display
      name**, because a suffix on every heading is noise on the overwhelmingly common single-template
      case.
- [x] 4d.2 **SAME CLASS, DIFFERENT ROOT CAUSE, and `R-040` is cross-referenced saying exactly that.**
      R-040 is `sequenceItemNamespace` colliding two same-named sequence ELEMENTS inside ONE
      template's field tree; this is two same-named TEMPLATES. Neither fix reaches the other, so this
      one is recorded ON R-040 rather than folded into it.

### 4e. ⭐ THE PICKER STAGES LIKE ITS NEIGHBOURS (owner, 2026-08-10; `design.md` §2e)

- [x] 4e.1 **The plate picker drafts instead of committing.** The assignment is
      TEMPLATE-level, so a picker that wrote on change let one stray click silently change
      what every other row carrying that template would do — with no moment to notice and
      nothing to undo. The draft IS the confirmation step.
- [x] 4e.2 **JOINED the mechanism, did not write a second one** (golden rule 6). It is
      `draftStore.ts`, the module every Inspector field already uses: one version counter,
      one `subscribeDrafts`, one `clearDraft`, one `pruneDrafts`, one `isItemDirty`.
      ⚠ A SEPARATE MAP INSIDE that module rather than a key in the `FieldValues` overlay —
      that overlay IS the `stack.update` payload, and an assignment inside it would be sent
      to the template as a field it never declared. `applyDraft` writes both halves from
      ONE operator action (`sources.set-assignments` first, because it reaches nothing on
      air; then `stack.update`), and reports the apply accepted only if both were.
- [x] 4e.3 **INHERITED the protections, verified rather than assumed.** Keyed by item, so
      the draft survives a selection switch and a panel/fullscreen round-trip, and is
      dropped only by `Discard` or by a prune that can PROVE the item left the stack.
      🔴 That prune is the one that once destroyed every staged edit on a remount against
      the bootstrap snapshot (`useStackHousekeeping`'s header). It fails closed, the plate
      draft rides the SAME guard, and a test pins it — a field that only LOOKS like it
      drafts is how that defect comes back.
- [x] 4e.4 **A selection change with an unapplied plate draft does exactly what it does for
      every other field: the draft SURVIVES.** Not a separate answer invented for this one
      control — drafts are keyed by item and the store hears no selection event at all.
- [x] 4e.5 **WHEN it takes effect is said where it is applied.** A plate assignment is read
      at the TAKE and never re-composites the graphic already on the channel; the section
      says so while a draft is staged, and names the ON-AIR case explicitly. Without it an
      operator presses `Update`, sees nothing change on air, and reasonably concludes it did
      not work.
- [x] 4e.6 Tests assert the MECHANISM, not the styling: `livePlateDraft.test.ts` (13) covers
      staged-reaches-nothing, draft-over-applied, item-dirty, un-assign-is-an-edit, apply
      writes both halves and preserves other templates' assignments, a refusal keeps the
      draft, `Discard` drops it, it survives a selection switch, and the prune fails closed.
      `livePlates.dom.test.ts` covers the control's wiring; the Runtime E2E covers
      edit-then-apply and edit-then-abandon.

### 4f. 🔴 A TEMPLATE WITH LIVE PLATES COULD NOT BE DELETED FROM THE LIBRARY (owner, 2026-08-10)

- [x] 4f.1 **The mechanism, TRACED — and the first suspect was wrong.** The deletion is refused
      `in-use` while any stack item still references the template (`caspar-runtime.ts`
      `templateRemove` and the mock's twin). The ASSIGNMENT STORE was not involved: nothing in
      the removal path read it. What made it look live-source-specific is the construction of
      the feature — a template with plates is on a row BY NECESSITY, because binding its plates
      requires selecting it, which requires loading it — so it is the one that meets `in-use`
      while templates that were only imported delete freely. Clearing a row does not remove its
      item either; that is CLEAR, and the item stays on the row by design.
- [x] 4f.2 🔴 **The refusal was INVISIBLE, and the invisibility is GENERIC.** It went to
      `reportCommandError` → the command toast, `zIndex: 50`, while `Modal`'s backdrop is
      `zIndex: 1000` (`ui/Modal.tsx:58`, `features/status/CommandToast.tsx:15`) — rendered
      UNDER the dialog that produced it. **Anything routed through `reportCommandError` while a
      modal is open is silent**, so this is not this button's defect alone. Every refusal the
      picker can produce now lands in the dialog's OWN pinned message region; the toast keeps
      the SUCCESS line only, which is a statement about a dialog the operator is leaving.
- [x] 4f.3 **ASSIGNMENTS ARE OWNED BY THE LIBRARY ENTRY** (`design.md` §2f). Deleting the entry
      deletes its bindings — only after the removal is CONFIRMED, so a refused deletion leaves
      them untouched. A re-import KEEPS them, because the useful case is an author fixing
      something and re-exporting with the operator not re-binding every plate — **and says so**,
      because the owner met it as a silent restore. And a plate id the new version no longer
      declares is DROPPED at import: a dangling record can later match a plate it was never
      meant for. **What happened before:** nothing at all — the import path never consulted the
      assignments, so both the silent restore and the stale binding were live.
- [x] 4f.4 **The two verbs no longer share one word.** The picker's is `Delete from station`,
      with a confirm naming the scope, the bindings that go with it, and the row's own REMOVE as
      the way to free a row that still holds it — through the existing `useConfirm` +
      `tone: 'remove'` treatment, not a new one. The ROW's word is deliberately unchanged: it is
      accurate, its own confirm already names the row, and renaming it would churn the layer
      table's fixed verb column (`layerTable.ts:41`) and every spec that presses it for no
      additional clarity once the pair reads differently.
- [x] 4f.5 **Clearing a ROW still leaves the library untouched** — R-021's flow imports once and
      reuses, and the E2E asserts it in the same pass as the deletion.
- [x] 4f.6 **The regression test FAILED against the code that had the bug**, which is the point
      of writing it first: `templateRemoval.dom.test.ts`'s seven cases all failed before the fix
      (the library verb did not exist under its new name, and the refusal never reached the
      dialog). They cover: deletion works with plates or without, the bindings go with it,
      another template's bindings survive, a refusal is SAID in the dialog, a thrown call is
      said too, a refused deletion keeps the bindings, and the confirm names the fallout.
      `templateImportAssignments.test.ts` covers the three import rules.

**Five things settled while implementing 4.1–4.6, recorded because a later reader will otherwise
re-derive them (or wonder why the code and §2's sketch differ). ALL FIVE SURVIVE THE RESHAPE
UNCHANGED:**

1. **ONE format, at the ENTRY — the DECKLINK arm's own `format` is NOT carried.** §2's shape block
   is pre-amendment on that line: it showed `format?` on the decklink arm AND, after the 2026-08-10
   amendment, `format?` on the entry. Carrying both would be two spellings of one fact with nothing
   to say which one the crop was computed from — precisely the drift §3a's decision exists to
   prevent. A test asserts the arm strips it.
2. **`ChannelInput` → `Format` has 37 values, not 39.** `design.md` §3a said 39; the list it quotes
   was always right and is 37 long, and the artifact was re-counted (`docs/recon/ciab-client-tools.json`).
   §3a is corrected in place. `sources.test.ts` pins the count and pins that **AUTO is the only
   format yielding no aspect** — a format added without a raster beside it would otherwise be
   indistinguishable downstream from an operator who chose AUTO.
3. **The bridge stores are module functions, not classes** — because 4.2 names
   `fixed-layers-store.ts` as the model and that store IS module functions: pure exported
   validators, the value in force held by `CasparRuntime`, persistence in `bridge.ts` after the ok.
4. **The layer band is DECLARED, never defaulted.** §4 says "declared config", so an absent band
   means no band. `SUGGESTED_LIVE_SOURCE_LAYER_RANGE` carries §4's 10–59 for the editor to offer
   and nothing applies it: a built-in band would be this project choosing layer numbers for a plant
   it cannot see, and any station whose reservation already sits inside 10–59 would fail to boot on
   upgrade. The band also carries **no channel** (a Live Source lands on whatever channel its
   template is on), so overlap is tested on layer NUMBERS across every channel — it refuses more
   than strictly necessary, which is the right direction here.
5. **"At change" needed NO door outside this change.** The other two layer classes are both
   immutable mid-session — `validateFixedBankChange` refuses a start/channel/count change
   (`renumber-refused` / `channel-change-refused` / `resize-refused`), and the reserved layers have
   no set channel at all (`git grep` over `packages/shared-ipc/src/channels` finds none). So
   `sources.set-config` is the ONLY runtime door that can create an overlap, and it calls the SAME
   validator the boot path calls, against the SAME bank and reserved list resolved once in
   `createBridge`.

**And a sixth, which the reshape ADDED and which is the reason it landed in one place:** the PURE
VALIDATORS live in `@cg/shared-ipc` — `validateSourceCatalog`, `validateSourceAssignments` and
`pruneAssignmentsForCatalog` — so the bridge and the offline mock share ONE definition of a legal
catalog, a legal assignment, and what a deletion orphans. Only load / save / provenance stayed
bridge-side, because only that half needs a filesystem. **A seventh, learned from a failing E2E:**
the mock's `setSourceCatalog` must read the assignments BEFORE writing the new catalog — its
`sourceAssignments()` prunes against the catalog in force, so reading after the write reports
NOTHING dropped and the deletion cascades silently, which is the one thing the report exists to
prevent.

**Phase 4 LINUX E2E — the pre-reshape run, kept for the record.**
[github.com/yasermostafaee/cg/actions/runs/31384965705](https://github.com/yasermostafaee/cg/actions/runs/31384965705)
— `dev` @ `37de4a6`, `conclusion: success`, `E2E (Playwright)` job **success** (not skipped, not
cancelled). ⚠ **It does NOT discharge the reshape**: that run covers the three pre-reshape commits
(`4b8e8ca`, `aad1314`, `37de4a6`) and says nothing about a later diff. The reshape owes its own
completed green Linux run, cited beside 9.3a.

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
- [ ] 6.3 ⚠ **Define the case where NEITHER side states an aspect (D-147, 2026-08-08).** §3's fit
      input is the MAPPING's `aspect`, falling back to `expectedAspect`. D-147 made
      `expectedAspect` OPTIONAL — an author who cannot see the feed may now decline to assert — so a
      source with no `aspect` and an element with no `expectedAspect` leaves the chain with no
      terminal value. Pick and record the behaviour (assume the hole's own aspect ⇒ no crop; or
      refuse the take with a distinct errorCode). Not solved in phase 1 and not silently folded into
      §3.
- [ ] 6.3 The aspect fit: **crop-to-fill** — scale to cover the hole preserving proportions, clip
      the overflow — driven by the ASSIGNED SOURCE's `aspect`, falling back to `expectedAspect` only
      where that source states none. Refuse the take with a distinct errorCode when the two disagree
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
- [ ] 6.5 **The audio rule — WIDENED 2026-08-08 (owner, `design.md` §12.4). It is not a Live
      Source rule; it is THE rule, and it discharges the whole cluster in this wave.** Every
      bridge-created producer is created muted; audio is raised only by explicit recorded intent.
      It covers **both** producer-creating verbs, and the two orders differ for a measured reason
      (`design.md` §7): `playSource` is immediately followed by `VOLUME 0` **in the same batch**
      (the producer does not exist before the `PLAY`), while `CG ADD` is **preceded** by it on the
      wire (a bare `CG ADD` already airs the audio on 2.5.0, so ADD-then-mute is the same leak,
      shorter). The unmute half is NOT rebuilt: `take()` already re-asserts `INTENDED_VOLUME`
      unconditionally on every take (`caspar-runtime.ts:1597-1601`) and that re-assert IS the
      explicit intent — a second unmute path would be the `B-100` / `P-012` one-rule-two-spellings
      failure.
- [ ] 6.5a **R-029** (`docs/prd/runtime.md`, high): the rule covers the **`CG ADD` path**, not only
      `playSource`, so cueing no longer puts a template's audio on air before the take. Records
      WHICH containment mechanism was chosen (option 2, bridge-side) and, in words, which command
      sources it does **not** cover — the playout system's own `CG ADD` is outside it.
- [ ] 6.5b **R-042** (`docs/prd/runtime.md`): **mute-before-ADD**, so LOAD is permitted on a
      rehearsing row instead of refused, with no audible leak. **The `MIXER … VOLUME` lands BEFORE
      the `CG ADD` on the wire, asserted on the AMCP trace** — not by the absence of an error — and
      a mute that fails does not proceed to the ADD.
- [ ] 6.5c **B-121** (`docs/prd/bugs-runtime.md`): `CG ADD` **call site 2**, the reconnect
      reconciliation (`#decidePendingRestores`, `caspar-runtime.ts:1394`), is not rehearse-guarded,
      so a bridge blip re-ADDs an UNMUTED producer under a rehearsing row. Fix it under the same
      rule — mute before the re-ADD, or do not ADD — and assert it **on the wire**, since a
      renderer-only guard is the shape site 1's fix explicitly rejected.
- [ ] 6.5d **Pin all four `CG ADD` sites with one test** (`design.md` §7's table): site 1
      `#loadOnto` guarded, site 2 fixed by 6.5c, **site 3 `setPosition` unchanged and pinned so it
      STAYS unchanged**, site 4 `take()`'s pre-roll unchanged. A per-site table that is not pinned
      is a comment, and the next sweep re-derives it.
- [ ] 6.5e ⚠ **Do NOT close R-029's head bullet here, and say so in the item.** _"audible … from
      the start of the audio — containment must not eat the head"_ is **not** dischargeable by a
      bridge-side mute: the audio is already running at `CG ADD` on 2.5.0, so the take unmutes
      mid-stream. Preserving the head needs R-029's option 1 — gating audio on the template's own
      `play()` lifecycle, enforced at export/validate time — which is a `@cg/template-runtime` +
      exporter change and is OUT of this design's scope (`design.md` §7, _"What this rule does NOT
      close"_). R-029 stays `[~]` carrying exactly that residual.
- [ ] 6.6 `mixerClear` on teardown — mixer state survives `CLEAR`
      (`command-builder.ts:128-130`, measured on hardware), so omitting it leaves a `FILL` a later
      graphic inherits.
- [ ] 6.7 The take refuses legibly with a distinct `errorCode` when a declared plate has **no
      ASSIGNMENT** — never a silent empty hole on air (`docs/prd/caspar.md:396-397`).
      ⚠ **EXTENDED 2026-08-10 by the §2z reshape.** The wording assumed a missing MAPPING, which was
      the only way to fail before. There are now TWO ways and the refusal must NAME THE PLATE in
      both: a plate that was never assigned (the ordinary state of a freshly imported template), and
      a plate whose assignment the delete CASCADE removed when its source was retired (§2c). They
      resolve to ONE state — unassigned — deliberately: a second "assigned, but not really" state is
      one every consumer would have to learn and could get wrong.
- [ ] 6.8 The two-box `route://` demo on real hardware, which needs no capture card.
- [ ] 6.9 ⭐ **R-048 — swap a plate's input WHILE THE TEMPLATE IS ON AIR. A CLIENT REQUIREMENT**,
      filed in `docs/prd/runtime.md` and implemented here, the same pattern D-147 used for phase 1.
      A PER-ITEM OVERRIDE — the template's ASSIGNMENT and the installation's CATALOG are both
      untouched, exactly like the position override — replacing `producer` on ONE `#liveLayers`
      record and re-issuing on that same slot. The template's HTML is never touched.
      ⚠ **STATE THE LAYERING IN THE ITEM AND IN THE UI (§2z / §2d):** the ASSIGNMENT is the
      TEMPLATE-LEVEL default, shared by every row carrying that template; this swap is the PER-RUN
      override on top of it; and the override **does NOT write back**, because an emergency
      substitution must never silently become the permanent configuration.
- [ ] 6.9a **A REPLACE, never a clear-then-add.** `PLAY` on the occupied layer substitutes the
      producer in place. A `CLEAR` then a `PLAY` that fails is the `B-126` window arriving during an
      emergency: a destructive step committed before the constructive one was known to succeed. On
      failure the previous (black) producer stays and the row says so honestly.
      ⚠ **VERIFY on the plant's 2.3.2 that `PLAY` on an OCCUPIED layer substitutes rather than
      requiring a prior clear — do not assume it, and record the measurement.** Run it in the SAME
      `amcp-poke` session as `design.md` §3b's `DEFER`/`COMMIT` question; both are AMCP probes on the
      same build and pairing them costs one session instead of two.
- [ ] 6.9b **The fit recomputes automatically**, in the same action: the new source may carry a
      different format, so crop-to-fill re-derives through §3a's chain. The operator must not have a
      second step — under pressure a second step is a step that does not happen.
- [ ] 6.9c **Audio intent survives the swap.** Every bridge-created producer is born muted (6.5), so
      a deliberately-raised plate must be re-raised by the swap itself: the intent belonged to the
      PLATE, not to the producer instance, and a swap that silently mutes a guest is its own on-air
      fault.
- [ ] 6.9d **The override survives a bridge restart.** Retention must carry it, or a momentary blip
      silently reverts the plate to the DEAD source. This is the `B-107` / `B-109` class — retention
      dropping state it did not model — so it is a requirement with a test, not an assumption.
- [ ] 6.9e **Reachable in one or two actions from the row.** Used under pressure, on air: not in
      settings, not behind a modal chain, not anywhere the operator must first find the item.
- [ ] 6.9f **Recorded as OUT of scope, so neither is re-proposed as part of this:** a PRE-ARMED
      backup source per plate (v2 — in a real failure the operator often needs a source nobody
      predicted, and an open list beats a pre-chosen wrong one; revisit only if use shows otherwise),
      and automatic DETECTION of a dead input (a separate capability; C-023's thumbnails already give
      the operator eyes).

## 7. Cross-change obligation — R-028

**SETTLED 2026-08-08.** All four landed in `openspec/changes/runtime-unified-layer-rows/tasks.md`,
which is unimplemented in section 6 — so the amendment arrives BEFORE the code it constrains, which
was the entire point of the obligation.

- [x] 7.1 **R-028 gains a task 6.5: amend section 6 to a THREE-class declared model** before 6.1–6.3
      are implemented. As written, 6.2 would make a Live Source layer an R-009 reclaim candidate and
      6.3 would point R-015's foreign refusal at a layer the bridge owns (`design.md` §4).
      **DONE:** R-028's 6.5 names the three classes (fixed operator rows 70–99 · reserved playout
      60–69 · bridge-owned Live Source layers 10–59), carries the narrowing-order argument, and
      warns in its own text that the third class is **not** `reservedLayers`. 6.2 and 6.3 were
      amended in place to point at it.
- [x] 7.2 R-028's task 6.1 test is written to permit a **declared, non-operator** allocation.
      **DONE:** 6.1 now asserts the absence of an **operator-graphic** caller, not of every caller,
      and says in its own text why "no caller at all" would be a silently correct-looking fixture
      that forbids the third class.
- [x] 7.3 Confirm R-028's 6.4 frees 10–59, which is this design's chosen Live Source range.
      **CONFIRMED against the CODE, not against §c's prose.** `DEFAULT_LAYER_POLICY`
      (`packages/caspar-client/src/layers/layer-manager.ts:49-56`) is `lower-third` 10–19 ·
      `ticker` 20–29 · `breaking-news` 30–39 · `logo-bug` 40–49 · `fullscreen` 50–59 · `custom`
      60–69. Descriptive ⇒ 10–69 released; `custom`'s 60–69 is the reserved playout range and stays
      fenced. **Residue: exactly 10–59.** (`logo-bug` has MOVED from 90–99 to 40–49 since §c was
      written — inside the freed span — so the confirmation does not rest on §c's "90–99" wording.)
      Recorded on R-028's 6.4 itself.
- [x] 7.4 Cross-reference both ways: R-028's 8.3 already lists C-015 for `reservedLayers`; extend it
      to name the ownership class. **DONE:** 8.3 now names both halves and says explicitly that
      naming only `reservedLayers` is what let task 1.2 read as "C-015 is handled" while the
      ownership half was untouched.

## 7a. Filed 2026-08-10 alongside this change — where the new items live

The owner's 2026-08-10 session recorded the plant's PREVIOUS automation (lives created in CG
Control, saved as DB presets, read by the playout application into its rundown — `design.md` §2a).
Four things came out of it, and only ONE is implemented here:

| Item                                                               | Where it lives                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| **R-048** — swap a plate's input while ON AIR                      | **HERE**, phase 6 (tasks 6.9–6.9f). Client requirement. |
| **C-022** — the NAMED source list served READ-ONLY over HTTP       | `docs/prd/caspar.md`, depends on this change's phase 4  |
| **C-023** — a confidence thumbnail per live source                 | `docs/prd/caspar.md`, rides `C-016`                     |
| **C-021** — SUBJECT AMENDED to a source-level fill/key device pair | `docs/prd/caspar.md`                                    |

Also recorded, so neither is re-proposed: a rundown INSIDE this Runtime was **rejected** (noted on
`C-002` — CIAB owns the programme bed, and two applications each believing they own the channel is
worse than two with clear roles), and a second output channel this Runtime alone would drive does
not exist today and justifies nothing now.

⚠ **The second sentence is about a DIFFERENT proposition than `design.md` §9b, and the two do not
contradict.** It rejects a second channel **driven to its own consumer** (a studio monitor, a video
wall, a stream) as motivation for a feature. §9b (added 2026-08-10) proposes a second channel with
**no consumer of its own**, whose picture returns to the playlist channel over a route — evaluated,
recommended in principle, **NOT adopted**, and gated on §12.5's four measurements plus one owner
question. **No task in this file changes on the strength of it**, §9a's punch work included.

## 8. Docs and PRD

- [x] 8.1 Correct C1, C2, C5, C6 and C8 in D-137 / C-015 (`design.md` §11). **VERIFIED in place
      2026-08-08**, each by its own marker: **C1** the migration-cost evidence
      (`caspar.md`, _"the stated evidence for that was two-thirds wrong"_), **C2** the
      "standalone creation unchanged" claim (`designer.md`, _"CORRECTED 2026-08-03 (C2)"_),
      **C5** the R-015 exemption (`caspar.md`, _"design.md §4, C5"_), **C6** the "SOLE
      discriminator" wording (`caspar.md:433-438`), **C8** out-of-frame warns-vs-deletes
      (`designer.md`, _"design.md §9, C8"_).
- [x] 8.2 Flip D-137 and C-015 to `[~]` naming this change dir. **DONE 2026-08-08.** C-015's
      hardware acceptance bullet is NARROWED in the same edit per `design.md` §12.1, and the
      arms it drops are filed as **C-021** (`[!]` blocked on hardware), cross-referenced from
      C-015 in both directions. R-029, R-042 and B-121 also flip to `[~]` naming this change
      dir per §12.4 — R-029 carrying its undischarged head bullet in writing (6.5e).
- [ ] 8.3 Engine doc-sync: `packages/template-runtime/README.md` for the `mode` seam, and
      `docs/engines/overview.md`.

## 9. Gate

- [ ] 9.1 `pnpm openspec validate live-source-multibox --strict`.
- [ ] 9.2 Full green gate (uncached) + `gate:e2e` per phase that touches UI or render.
- [x] 9.3 A Linux `gate:e2e` is owed for phases 1 and 9 — a Windows run is non-authoritative.
      **PHASE 1's DEBT IS DISCHARGED.** Run:
      <https://github.com/yasermostafaee/cg/actions/runs/31265371911> — `ubuntu-latest`, commit
      `d91add3`, **`conclusion: success`, the `e2e` job COMPLETED and green** (not skipped, not
      cancelled). That commit carries phase 1 in full plus its D-147 amendment, so it is the
      later-`dev`-HEAD case the discharge rule permits.
      **The previous push (`72c8b38`) went RED and is recorded rather than hidden**
      (<https://github.com/yasermostafaee/cg/actions/runs/31264006795>): phase 1 added the Live
      Source tool to the canvas toolbar and `icon-pack.spec.ts` pins that toolbar's ORDER. A
      targeted local run of the new spec could not see it; the full suite would have. Fixed in
      `d91add3`, and the whole 246-test suite now runs green locally before a push as well.
      Phase 9's own debt is still owed — it is a later phase.
- [~] 9.3a Phases 2–8: each still owes its own completed green Linux `e2e`, cited by run URL beside
  the ticked item. A green run on THIS commit says nothing about a later phase's diff.
  **PHASE 2's DEBT IS DISCHARGED.** Run:
  <https://github.com/yasermostafaee/cg/actions/runs/31370079041> — `ubuntu-latest`, commit
  `7e595ac`, **`conclusion: success`, the `E2E (Playwright)` job COMPLETED and green** (not
  skipped, not cancelled). That commit carries phase 2 in full, including the new
  `apps/runtime/tests/e2e/live-source-carrier.spec.ts` that 2.4 owes.
  **PHASE 3's DEBT IS DISCHARGED** —
  <https://github.com/yasermostafaee/cg/actions/runs/31371520195>, `ubuntu-latest`, commit
  `4f4853a`, `conclusion: success`, `E2E (Playwright)` COMPLETED and green.
  **The 1.8a / 1.8b Inspector + preflight work is discharged** by
  <https://github.com/yasermostafaee/cg/actions/runs/31376780917> (`fd89922`), cited beside 1.8b.
  Phases 4–8 still owe their own.
- [ ] 9.4 **Hardware:** the phase-6 `route://` demo is dischargeable here; **phase 7 is not** —
      see `design.md` §12.1, which is an owner decision, not work.
