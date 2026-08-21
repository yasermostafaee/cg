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
- [x] 1.5b ⚠ **RECON FIRST, ON THE RIGHT BROWSER — do not choose a mechanism on reasoning.** Two
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
      ⭐ **THE KIT IS BUILT AND READY TO RUN (session AC, 2026-08-14):
      `tools/live-source-punch-probe/`.** One self-contained page — an opaque striped backdrop, two
      plates above it carrying the frame and shadow the product actually renders, and BOTH candidate
      mechanisms plus a CONTROL state, cycled with a single `CG NEXT` (or a click, or 0/A/B, or
      `?m=`). Its `README.md` carries the two-criteria pass/fail card, the run recipe and an
      UNFILLED result form; the page prints the CEF user-agent on screen so a photo records which
      browser answered. `apps/designer/tests/live-source-punch-probe.test.ts` holds the probe to the
      repo's own `CEF_BANNED_BUILTINS` list and to being self-contained, because a probe that fails
      to BOOT on that CEF does not return a null result — it returns a wasted trip.
      🔴 **RE-MEASURED THE SAME DAY, SCRIPTED AND PIXEL-ASSERTED — AND THE HAND-RUN VERDICT FOR
      MECHANISM B IS CONTRADICTED. B WORKS. See `design.md` §9a-R; the summary is below the
      original reading, which is kept because the correction is only legible beside it.**

      ⭐ **RUN AT THE PLANT 2026-08-15 BY THE OWNER — BOTH MECHANISMS APPEARED TO FAIL CRITERION 1.
      The filled form is `tools/live-source-punch-probe/README.md`; this is its reading.**

      | mechanism                                | criterion 1 (real transparency) | criterion 2 (frame + shadow) |
      | ---------------------------------------- | ------------------------------- | ---------------------------- |
      | **A** — `mix-blend-mode: destination-out` | **FAIL**                        | **PASS**                     |
      | **B** — mask the backdrop                 | **FAIL** (ambiguous, see below) | PASS (trivially — B erases nothing) |

      **A failed DECISIVELY, with a diagnosed cause.** The erase happened inside the page — the
      backdrop's stripes vanished from both plate rects — but the result was **OPAQUE BLACK, not
      alpha 0**, and CasparCG composited that black over the live layer. That is not "the mechanism
      did nothing": it is the mechanism working locally and never reaching the page's ROOT alpha,
      which is **precisely the SCOPE risk §9a listed against this candidate and refused to settle by
      reasoning**. The owner ruled out both alternative explanations rather than assuming: `CLEAR
      1-10` removed the probe and the video was visible and running (so the black is the punch's own
      output, not a dead source), and the clip's letterboxing was computed and rejected (both plate
      rects fall inside the active picture area).
      **B failed AMBIGUOUSLY, and it is recorded as ambiguous rather than resolved.** State B was
      indistinguishable from the control — no visible effect at all — and that signature **cannot
      distinguish "the mask applied and does not reach page alpha" from "the mask never applied at
      all"**. It is scored FAIL because it did not deliver transparency, which is what the criterion
      asks; it is **not** evidence about masking as a technique. If B is ever revisited, the first
      job is to prove the mask applies at all, and nothing in this run may be cited as having tested
      that.
      ⚠ **The overall conclusion does not rest on B's ambiguity.** The kit's rule is that both must
      fail for the punch to be a non-CSS problem, and **A's failure is decisive on a modern engine**.
      B being ambiguous makes B's own verdict weaker; it does not make the punch more available.

      🔴 **THE BUILD WAS NOT THE ONE THIS TASK NAMES.** The plant runs **CasparCG 2.5.0 (`69e8ad5`
      Stable) with Chromium 142**, not 2.3.2 with CEF 71 — so this task's own "measure on the CEF
      inside the plant's CasparCG 2.3.2" instruction described a machine that was not there.
      **The result is nevertheless ROBUST DOWNWARD and needs no second run: a modern Chromium
      failing means CEF 71 certainly fails.** (Findings that depend on a NEWER engine do not
      inherit that property — see 1.5d.) The version discrepancy is not new to the repo:
      `docs/prd/bugs-runtime.md` records the same `69e8ad5` in live sessions from 2026-07-07, and
      one note there says a finding was "confirmed on BOTH server generations". **Flagged, not
      swept: roughly two dozen places in this change still name 2.3.2 as the thing to measure on.**
      ⭐ **SETTLED BY THE OWNER, 2026-08-15: playout runs 2.5.0 and 2.3.2 is RETIRED.** So this run
      was taken on the production build, every answer from it is a production answer, and no result
      here needs hedging across builds or a second run. A stale 2.3.2 install still sits at
      `D:\programs\CasparCG` — **never point a probe at it**, or CEF-71 answers get labelled
      production. Every "measure on 2.3.2" instruction left in this change is now WRONG rather than
      merely uncertain; they are stale text to correct, not a fork to navigate. Record the build
      string beside every result all the same: the next upgrade makes today's answers historical,
      and a result without its build is a result that will outlive its truth.

      ⚠ **THE KIT'S OWN AMCP EXAMPLES DID NOT RUN**, and every one returned `#400 ERROR`: the README
      put the verb before the channel-layer (`CG ADD 1-10 …`) where AMCP takes
      `CG <ch>-<layer> <VERB> <flash> …`. The owner worked the right form out at the rack, so the
      trip survived it. **FIXED 2026-08-15** in the README, moved into its own titled section so it
      is read before the recipe, and **pinned by a test** — `live-source-punch-probe.test.ts` now
      asserts the "Running it" recipe contains no verb-first form. **The PRODUCT was never wrong**:
      `command-builder.ts` emits `CG ${target(slot)} ADD …`, hardware-validated under ADR 0006. The
      defect was in the doc alone, which is the surface a human retypes.
      Same class as §9.3's unrunnable instruction: **an instruction nobody has run is an instruction
      nobody has checked**, and the cost lands on someone standing at a rack.

      ---

      🔴 **THE CORRECTION — MECHANISM B WAS NEVER TESTED, AND IT PASSES.** Re-run scripted on the
      same build (`2.5.0 69e8ad5 Stable`, Chromium 142) with
      `tools/caspar-amcp-probe/bin/live-probe-lib.mjs` and
      `tools/live-source-punch-probe/mask-mode-diagnostic.html`, sampling AMCP `PRINT` captures as
      median patches rather than reading a screen.

      **The defect was in the probe.** `punch-probe.html`'s `maskUri()` writes _"white keeps, black
      punches"_ — LUMINANCE holes — while CSS `mask-image` masks by ALPHA, where `#fff` and `#000`
      are both fully opaque. The mask applied and punched **nothing**. A no-op mask and a mask that
      never applied have the SAME signature, which is exactly why the hand-run could not separate
      them and why this task's own note recorded the ambiguity rather than resolving it.

      | measurement (in-page: red sheet masked over green sheet)        | left plate | right plate | outside |
      | ---------------------------------------------------------------- | ---------- | ----------- | ------- |
      | the probe's exact SVG, default mask-mode (**as shipped**)        | `#d00000`  | `#d00000`   | `#d00000` |
      | the SAME SVG + `mask-mode: luminance`                            | `#00c000`  | `#00c000`   | `#d00000` |

      **And it reaches ROOT ALPHA** — the property mechanism A could not deliver. Transparent page,
      masked backdrop, flat colour producer on a lower CasparCG layer: both plate rects read
      `#00ffff` (the lower layer, composited through) with the backdrop `#d00000` intact between
      them. A validity gate asserted the lower layer visible BEFORE the reading, and **voided a
      first attempt** whose still image turned out black at the plate position.

      **CONSEQUENCES.** "Neither mechanism passes" is WITHDRAWN. **A fails; B passes**, and passes
      criterion 2 by construction (it erases nothing of the plate's own paint). The punch IS a CSS
      problem and it is solved; §9b is **not forced** and reverts to a gated fallback. 1.5c is
      unblocked **with its mechanism chosen by measurement**, and 1.5h is alive again.
      `punch-probe.html` is FIXED (the two `luminance` lines) so the kit no longer carries the
      defect that produced the wrong answer.

      ⚠ **What is NOT claimed:** this measured the MECHANISM, not the product — `buildLiveSource`
      still emits no mask — and the diagnostic used one full-frame sheet, not a nested scene. 1.5c's
      assertion against the EXPORTED artifact stands exactly as written.

- [ ] 1.5c ⭐ **UNBLOCKED 2026-08-15, WITH ITS MECHANISM CHOSEN BY MEASUREMENT: mask the backdrop,
      `mask-mode: luminance`.** The re-measurement (`design.md` §9a-R) shows mechanism B punches and
      that the punch reaches the page's root alpha, so this task reads as originally written —
      implement the mechanism 1.5b selects, and assert the EXPORTED page's alpha is CLEAR over the
      plate's rect with an opaque backdrop present.
      🔴 **`mask-mode: luminance` (plus `-webkit-mask-source-type: luminance`) is NOT an optional
      detail of the implementation — it IS the mechanism.** Without it the identical SVG is a no-op,
      and a no-op mask looks exactly like a working one in every test that does not put something
      visible underneath. **Assert the punched pixel, never the presence of a `mask-image` style.**
      ⚠ **The cost §9a recorded against B is now the cost this task pays:** masking the backdrop
      COUPLES it to the plates — the backdrop must know where every plate is, recomputed whenever
      one moves. That was the recorded argument against B and it stands; it is simply outweighed by
      B being the one that works.
      ⚠ Scope still not proven for a REAL scene: the diagnostic used one full-frame sheet, while
      `buildLiveSource` may nest a backdrop inside transforms and stacking contexts — which is where
      mechanism A's failure lived. That is why the assertion must be against the exported artifact
      and not the builder.
      ⭐ **UNIT B LANDED 2026-08-15 (`efe13f6`) — the mechanism is in the render path, and this box is
      STILL NOT TICKED.** `§9a-Z`'s z-order rule is built as a pure `scene → key → MaskHole[]`
      pre-pass (`@cg/shared-schema`'s `sceneMaskHoles`), consumed via `BuildCtx` at the one funnel
      every element passes through, with `mask-mode: luminance` travelling INSIDE the mask value. The
      flattener moved out of `@cg/vcg-format` into `@cg/shared-schema` so the hole the page PUNCHES
      and the hole the bridge FILLS are one computation. **What is missing is exactly this task's own
      acceptance**: the punched PIXEL, asserted against the EXPORTED artifact. The tests that shipped
      assert the built DOM — which the paragraph above explicitly says is not enough — so the box
      stays open until UNIT C does it. Also still open from `§9a-Z`: the mask is computed ONCE at
      build and nothing recomputes it, so a plate that MOVES (take, teardown, position override,
      resize, lifecycle range, retention restore, z-order reorder) leaves every hole where it was.
      That enumeration is UNIT B′.
      **Linux `e2e` for UNIT B — DISCHARGED, both commits, `e2e` job RAN (not skipped) in each:**
      `efe13f6` → https://github.com/yasermostafaee/cg/actions/runs/31892929482 (`success`);
      `181359a` → https://github.com/yasermostafaee/cg/actions/runs/31893523020 (`success`).

      Superseded reading, kept so the reversal is legible — for a few hours on 2026-08-15 this task
      was marked **SUPERSEDED, no mechanism to implement**: This task read
      "implement the mechanism 1.5b selects", and 1.5b selected none: both candidates failed
      criterion 1 on 2026-08-15. **It is NOT ticked and NOT deleted** — the requirement it served is
      untouched (§9a still says the page must be transparent over the plate's rect); what died is
      the assumption that CSS can deliver it inside one CasparCG layer.
      **RE-SCOPED: 1.5c becomes §9b's task.** Whatever the dedicated-channel model turns out to be,
      it must still make the guest picture appear inside the plate's rect with the backdrop absent
      there — and the assertion this task specified stays exactly as valuable, in a different place:
      **assert against the EXPORTED artifact, not the builder**, because the exported page is what
      CEF loads and a builder-level check passes on a page whose root alpha is still opaque.
      🔴 **It is BLOCKED on an owner decision, not on more work.** §9b is "evaluated, recommended in
      principle, NOT adopted", gated on §12.5's four measurements plus one owner question. Nothing
      may be built here until that gate moves. **Do not re-open the CSS punch on a new idea without
      a new measurement** — that is the thing 1.5b exists to have settled.
      Original text, kept so the re-scope is legible: _"Implement the mechanism 1.5b selects, and
      test that the EXPORTED page's alpha is CLEAR over the plate's rect with an opaque backdrop
      present."_

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
      ⭐ **BUILT 2026-08-14 (session AC) — three of the four parts, and the box stays UNTICKED.**
      Shipped: the additive optional `stroke` on `VideoPlaceholderElementSchema` (the shared
      `StrokeSchema`, unchanged); the Inspector's **Frame** section (colour + width) on the bare
      `video-placeholder` kind, written through `updateElement` with the write path verified rather
      than assumed; the round trip through BOTH exporters; and the render, in both modes, outside
      the hole.
      🔴 **NOT DONE, and this is the whole reason the box is unticked: the fourth assertion —
      "the stroke SURVIVES the punch" — CANNOT BE WRITTEN YET, because the punch does not exist.**
      It is 1.5c's, and 1.5c is blocked on 1.5b. Nothing here may be read as evidence that the frame
      survives an erase; what IS pinned is the weaker property the punch will have to respect, in
      1.5g.
      ⚠ **CORRECTION to this task's own premise, recorded in `design.md` §9a.1 and load-bearing for
      whoever takes 1.5c: the frame is a CSS `outline`, NOT a `border`.** The reasoning above — that
      the CSS default `content-box` paints a border outside the declared size — was re-verified at
      HEAD and does not hold: every surface the page renders on ships a `*{box-sizing:border-box}`
      reset (`cgCss`, `@cg/ui`'s `theme.css`), and declaring `content-box` to escape that fixes the
      SIZE while sliding the hole by the stroke width (measured in Chromium). An outline takes no
      layout, so the declared rect is unmoved under any box model and any scale. The stroke
      SHORTHAND is still one shared implementation (`strokeShorthand`).
      **Linux e2e for the parts that ARE built:** discharged by the same run recorded on 1.5g below
      — <https://github.com/yasermostafaee/cg/actions/runs/31753678406> (commit `b011005c`, `e2e` RAN and
      green). It covers the Inspector control and the exporter round-trip; it says nothing about the
      punch assertion, which does not exist to run.
      🔴 **SCOPE BOUNDARY — STROKE ONLY (owner, 2026-08-13). `box-shadow` is ALLOWED BY THE DESIGN
      AND DELIBERATELY NOT BUILT.** §9a.1's box-shadow amendment permits a shadow on a plate — same
      class as the stroke, paint on the template layer, outside the hole — and this session did not
      build it. **Re-verified at HEAD, and the gap is WIDER than "the Inspector withholds it": a
      shadow is absent at ALL THREE layers.** There is no `shadow` / `boxShadow` field on
      `VideoPlaceholderElementSchema`; `buildLiveSource` applies none; and `LIVE_SOURCE_STATIC`
      (`field-registry.ts`) carries neither `BOX_DESCS` nor `BOX_SHADOW_DESCS`, so no Inspector row
      exists either. Adding it is a schema field + a render line + an Inspector row — the same four
      parts the stroke took — not a registry tweak.
      **Recorded rather than left silent**, because the design says one thing and the product does
      another and that divergence is invisible from either side alone. The boundary is the owner's
      call and it stands. One fact for whoever picks it up: the `outline` decision above does NOT
      apply to a shadow — `box-shadow` already paints outside the border box and takes no layout, so
      it needs no equivalent escape from the `border-box` reset.
      ⚠ **A pre-existing gap this control inherits (not one it introduces):** `updateElement` is
      shallow (`locate` walks only a layer's direct children), so a plate nested in a CONTAINER
      takes no edit from the Frame rows — nor from the source-id or aspect rows, which have always
      shared that route. Recorded rather than worked around; a second, deeper write path used by one
      row would be the two-spellings shape the repo keeps paying for.
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
      ⭐ **MEASURED 2026-08-15 — AND THIS IS THE ONE POSITIVE FINDING THE RUN PRODUCED. Criterion 2
      PASSED.** §9a.1's scoping — the erase on an INNER FILL NODE, the frame and shadow on the OUTER
      node — **held**: the orange frame came back full width, unbroken, all the way around both
      plates, with the drop shadow intact. The independence this task insisted on is what makes the
      result readable at all: mechanism A failed criterion 1 and passed criterion 2, so the run says
      two different things rather than one muddled one.
      **Why it survives the mechanism that carried it.** The finding is about SCOPING an erase, not
      about `destination-out` reaching root alpha — so it transfers to any future compositing
      approach that needs paint to survive an erase beside it. Whatever §9b becomes, **the constraint
      this task placed on the mechanism is satisfiable**, and that is worth knowing independently of
      the outcome.
      ⚠ **What it does NOT show:** the shadow half was exercised only as the probe's own CSS
      `box-shadow`. The PRODUCT still has no shadow field at any of the three layers (see 1.5e's
      scope note), so this is evidence about the technique, not about a shipped feature.
- [x] 1.5g **Neither stroke nor shadow enters the hole rect**, so neither touches
      `collectLiveSources`' geometry nor 1.8's OVERLAP check — pin that: **two plates whose strokes or
      shadows overlap is NOT a fault; two plates whose HOLES overlap is.** The overlap check reads the
      declared rect and must keep reading only that.
      **DONE 2026-08-14 (session AC).** Pinned in three places, deliberately: the preflight
      (`apps/designer/tests/live-source-preflight.test.ts`) — frames overlapping is no fault, holes
      overlapping still is, and the whole issue list is byte-identical for strokes of 0 / 1 / 40 /
      5000 px; the declaration (`packages/vcg-format/tests/live-sources.test.ts`) — a frame of any
      width emits the identical `LiveSourceDeclaration`, nested and scaled included, and leaks no
      field of its own onto the wire; and the render geometry in a REAL browser
      (`apps/designer/tests/e2e/live-source.spec.ts`) — the hole is at the same page position and
      size before and after an 8px frame, which is the only place layout actually exists.
      ⚠ **On "shadow" — the half that could NOT be exercised, said plainly rather than faked.** This task's wording covers "neither stroke nor shadow", and only the STROKE half is driven by a real value: a shadow is absent from the schema, the renderer AND the Inspector (see the `box-shadow` scope note on 1.5e — allowed by the design, deliberately not built, owner's call 2026-08-13). A "shadow overlap is not a fault" test would have to construct a field nothing can author, and would assert nothing. What IS pinned is the guarantee that covers both without needing the field —
      `frameAabb` and `sceneRect` compose `transform` alone, so NO paint property is an input to the
      geometry. A shadow lands inside that guarantee the day it is added, and the byte-identical
      test above is what fails if a paint property is ever routed into the rect.
      **This is what makes 1.5e safe to ship before the punch exists:** it fixes the contract the
      punch will have to respect.
      **Linux e2e DISCHARGED:** <https://github.com/yasermostafaee/cg/actions/runs/31753678406> — `ubuntu-latest`,
      commit `b011005c`, **`conclusion: success`, and the `E2E (Playwright)` job COMPLETED and green**
      (it RAN — not skipped, not cancelled). That commit carries 1.5e and 1.5g in full, including the
      Inspector's Frame control, the exporter round-trips and the restructured `live-source.spec.ts`.
      This supersedes session AA's run as the change's current discharge.
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
      ⭐ **MEASURED 2026-08-15 — the stated obstacle DOES NOT EXIST on the plant's actual build.**
      `border-radius` on an `outline` needs Chromium ~94, and the plant runs **Chromium 142**, which
      honours it. The "rounding the frame will need its own answer" caveat is therefore not binding
      on a 2.5.0 install.
      ⭐ **RECORD IT AS: THE CEF OBSTACLE IS REMOVED BY MEASUREMENT.** The owner settled on
      2026-08-15 that 2.5.0 IS production and 2.3.2 is retired, so there is no older engine this
      has to hold for. This task's remaining dependency is on 1.5c / §9b — whether there is a hole
      to round at all — **not on the browser**.
      ⚠ **The reasoning that nearly got recorded instead is worth keeping, because it is right in
      general and would matter again the day a second build appears:** a FAILURE on a new engine
      implies failure on an old one (which is why 1.5b needs no second run), whereas a SUCCESS on a
      new engine implies nothing about an old one. **Which way a measurement generalises depends on
      whether it is a pass or a fail**, and both arrived in the same run. What retires the caveat
      here is not logic but the owner's decision that there is only one build.
      ⚠ **Its blocker reverts to what the task originally said.** For a few hours on 2026-08-15 this
      read "1.5c is superseded, so this waits on §9b"; 1.5c is unblocked again (§9a-R), so this
      waits on **1.5c**, as written. Rounding is meaningful only where there is a hole to round, and
      there is now going to be one.
- [ ] 1.5h ⭐ **NO LONGER AT RISK — the punch exists after all (2026-08-15, `design.md` §9a-R).**
      This task is "the punch with nothing put beneath it", and mechanism B delivers the punch, so
      its premise is restored intact and it is gated on 1.5c exactly as it always was.

      Superseded reading, kept so the reversal is legible — for a few hours on 2026-08-15 this task
      was marked **AT RISK, its definition removed by the punch's failure**:
      This task is "the punch with nothing put beneath it", so 1.5b's result does not merely block
      it, it **removes the thing it was made of**. It is NOT ticked and NOT deleted; it must be
      **re-derived from §9b or dropped**, and that is an owner call rather than a re-scope CC can
      perform.
      ⚠ **The re-derivation is not obvious, and the difficulty should be recorded now rather than
      discovered later.** Passthrough's whole point was that the CG layer composites over the
      programme, so a hole in the page reveals the programme **at 1:1, in place**. On a DEDICATED
      channel (§9b) the multi-box is not over the programme any more — it reaches air by whatever
      §9b.4 decides — so "the corresponding region of the programme" may not be behind the plate at
      all. **The distinction this task exists to protect — a WINDOW onto the programme is
      passthrough, a SCALED COPY is a route — is exactly what a dedicated channel puts at risk.**
      Original gating and definition follow, kept so the re-derivation has its premise in view.
      GATED ON 1.5c: passthrough cannot be demonstrated, or
      even defined, until the punch is real, because passthrough IS the punch with nothing put
      beneath it.
      **What it is.** A plate whose hole has **no producer under it** shows the programme directly —
      the CG layer composites over the programme, so the punched rect reveals it. No producer, no
      layer allocated, **no catalog entry, no assignment**, no route latency. It is by-product, not
      new machinery.
      🔴 **What it is NOT, and this is the whole reason it is filed separately from mechanism B.**
      The hole shows the **CORRESPONDING REGION** of the programme — a WINDOW onto it at 1:1 — **not
      the whole picture scaled into the box.** The rule: **a window onto the programme is
      passthrough; a scaled copy of the programme is a route.**
      ⚠ **NOT NEEDED FOR THE OWNER'S THREE-BOX LAYOUT**, which mechanism B (an ordinary `route`
      catalog entry, §9a.2) answers in full. This task exists for **window-style full-frame designs
      with a cut-out**, and it is worth having; it is not on the critical path and must not be
      allowed to become a prerequisite for the multi-box work.
      Scope when it is taken: how an author DECLARES a plate as passthrough (it has no `sourceId` to
      assign, so the preflight and the Inspector's unassigned-plate warnings must not read it as a
      fault), and a test that a passthrough plate allocates **no layer and no producer**.

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
- [x] 4b.3 **The TEMPLATE-LEVEL scope is stated in the section**, in one line and not a tooltip.
      Editing it from one row changes what other rows carrying the same template will do, and an
      operator must not discover that by surprise on air.
      ⚠ **The SENTENCE was reworded by session BM-2; the requirement was not.** It read _"Set for
      the template, not this row — every row using it takes the same sources."_ That was true of a
      flat map and became a lie about the four-level model — it says "not this row" while two of
      the four levels ARE this row's. It now reads _"The DEFAULT every row using this template
      starts from. A row can show something else per look, below."_
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

### 4g. THE TWO RED E2E ON THE 4a PUSH — what each actually was

- [x] 4g.1 **Designer `live-source.spec.ts` "MULTIPLE independent Live Sources" — a TEST that
      encoded a knife-edge assumption, NOT a product regression. Proven by measurement, not
      asserted.** The test placed two plates with canvas CLICKS 180×140 px apart and asserted no
      preflight error, commenting "far apart, so this is about independence and not about the
      overlap rule". A plate is born 640×360 SCENE px at the point clicked, so the scene distance
      between two clicks is `delta / zoom`, and the zoom is `canvasWidth / 1920` — a function of
      how wide the surrounding panels happen to render.
      **MEASURED both ways.** At a 464 px canvas (zoom 0.2417) the plates clear each other by
      ≈105 scene px and no issue is raised. At a 784 px canvas (zoom 0.408) the SAME two clicks put
      them 7 canvas px into each other on `y` and preflight raises the pill — the reported failure,
      reproduced on demand.
      **The first hypothesis was DISCONFIRMED:** the two plates do not land on the same default rect.
      They land exactly where they were clicked, which is the product behaving correctly — a plate
      is never offset onto its neighbour, and two plates the author places on top of each other are
      a fault the overlap rule exists to report. **And 4a could not have caused it:** `git show
--stat` over that commit touches no Designer source and no package the Designer renders from
      (only `packages/shared-ipc/src/channels/sources.ts`, which the Designer's preflight does not
      consume).
      **Repaired without touching the assertion**: the separation is now stated in SCENE units
      through the Inspector's `X position` / `Y position`, which is the space the rule is evaluated
      in. The sibling test at `:233` remains the positive control for the overlap rule itself.
- [x] 4g.2 **Runtime `modal-message-in-viewport.spec.ts` — a test whose world the change moved.**
      4a renamed the entry point, replaced the symbolic id with a NAME, and moved the plate binding
      out of that modal. **BOTH original conditions were RE-CHECKED rather than assumed to have
      survived** — the spec exists for a LAYOUT claim jsdom cannot make, so a re-pointed locator
      over a modal that no longer overflows would be a green test asserting nothing:
      (a) the body still genuinely overflows with six sources defined, which the spec's own
      `overflow > 80` precondition proves at run time; (b) the refusal still comes from the REAL
      validator the bridge runs (`checkSourceCatalog`, through the same band rule), never an
      invented mock refusal. Everything else is unchanged — the negative control (the last element
      inside the scrolled body, asserted OUT of viewport at the same scroll position), the Persian
      neighbour, and the scroll-position claim.
      One locator detail worth recording: the name field's accessible name derives from the
      source's own name, so it changes under the locator the moment it is filled — the Persian case
      addresses it through the ENTRY (`[data-source-id]`) instead.
- [x] 4g.3 **Both FULL suites run locally before the push**, not the two specs alone: `pnpm
gate:e2e`, 246 designer + the runtime suite, all green. A targeted run is what let the first
      of these through — `31264006795` is the recorded precedent.

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

**PHASE 4's LINUX E2E — DISCHARGED, INCLUDING THE RESHAPE.**
[github.com/yasermostafaee/cg/actions/runs/31408479929](https://github.com/yasermostafaee/cg/actions/runs/31408479929)
— `ubuntu-latest`, `dev` @ `c16d25f`, **`conclusion: success`, the `E2E (Playwright)` job
COMPLETED and green** (not skipped, not cancelled). That commit is the tip of the whole wave and
carries every part of it: `1608a80` (the two-store reshape and the Inspector binding), `dd0091b`
(the plate picker's draft), `ab7d12e` (the library entry owning its bindings) and `c16d25f` (the
two E2E repairs). The suite it ran includes `apps/runtime/tests/e2e/live-source-sources.spec.ts`,
the re-pointed `modal-message-in-viewport.spec.ts`, and the designer's `live-source.spec.ts`.

⚠ **The three pushes before it were RED, and that is recorded rather than hidden**
(<https://github.com/yasermostafaee/cg/actions/runs/31402468129>,
<https://github.com/yasermostafaee/cg/actions/runs/31404275672>,
<https://github.com/yasermostafaee/cg/actions/runs/31406199136>): all three failed on the SAME two
specs, for the two causes 4g records — a knife-edge designer fixture and a runtime spec whose
world the reshape moved. Neither was a product fault, and both are repaired in `c16d25f`.

**The earlier pre-reshape run, kept for the record.**
[github.com/yasermostafaee/cg/actions/runs/31384965705](https://github.com/yasermostafaee/cg/actions/runs/31384965705)
— `dev` @ `37de4a6`, `conclusion: success`, `E2E (Playwright)` job **success** (not skipped, not
cancelled). ⚠ **It does NOT discharge the reshape**: that run covers the three pre-reshape commits
(`4b8e8ca`, `aad1314`, `37de4a6`) and says nothing about a later diff. The reshape owes its own
completed green Linux run, cited beside 9.3a.

## 5. Phase 5 — Ownership (requires phase 3 · AND was ordered after R-028 §6 — see below)

⚠ **THIS HEADER USED TO READ "(requires phase 3)", AND THAT WAS THE WHOLE CONSTRAINT IT NAMED.**
It was not: `design.md` §4's landing-order table also binds this phase **after R-028's section 6**,
which is a different change's file and was entirely unchecked. A reader working from this header
alone would never have known to look — the tasks list is what gets read when work starts, and the
design is what gets read when a decision is questioned. **A prerequisite recorded only in the
argument for it is a prerequisite nobody will check.** Corrected here, and the same under-statement
is corrected on §6.

**Resolution, 2026-08-12:** phase 5 landed ahead of R-028 §6 with the owner's confirmation
(`95ef840c`). The reasoning is in `design.md` §4 under the 2026-08-12 amendment, and the condition
attached to it is written at R-028's own tasks 6.2 and 6.5 — where the person rewriting the sweep
will actually be reading.

⚠ **EVERY ANCHOR IN THIS SECTION HAD DRIFTED** — sessions F and I moved code in
`caspar-runtime.ts`'s neighbourhood, as the session prompt warned. Each was re-verified against the
real site before editing, and the true line is recorded beside the stale one below. The file is
3926 lines; the drift runs from +40 to +193 lines and grows with depth, so nothing here was found by
"close enough".

- [x] 5.1 Wire `#liveLayers` beside `#slots` (~~`caspar-runtime.ts:310`~~ → **`:350`**, drift +40) —
      **not folded into it**; `#slots` answers a different question that its read sites depend on.
      The ledger TYPES already existed from phase 2.5 (`live-layers.ts`, "defined, not yet wired"),
      so this task is the WIRING: the field, one coordinate-flattening helper (`#liveLayerKeys`)
      that all three doors share so "is this a Live Source layer" has ONE implementation, and the
      ledger's own bookkeeping API (`registerLiveLayers` / `releaseLiveLayers` / `liveLayers`).
      ⚠ **That write path is deliberately phase 5's, not phase 6's, and it sends no AMCP.**
      Ownership is this phase; phase 6.1's `playSource` will call it with what it actually sent.
      Without it the three doors could not be populated, so they could not be regression-tested
      before a verb exists to fill them — which is the entire reason ownership lands first.
      ✅ **"Nine read sites untouched" is ASSERTED, not assumed**: every `#slots` **code** line is
      byte-identical to HEAD (`git diff` filtered to non-comment lines returns empty; a direct diff
      of all `#slots` code sites HEAD-vs-working reports IDENTICAL). Only comments mention it.
- [x] 5.2 R-009: add the `#liveLayers` coordinates to the sweep's `owned` set
      (~~`caspar-runtime.ts:2390-2393`~~ → **`:2504-2506`**, drift +114). Ownership, not exclusion —
      commented at the site as explicitly different from the reserved-range filter three lines
      above, because both end in "not an orphan" by different arguments and that is how one of them
      later gets deleted as a duplicate.
- [x] 5.3 C-014: skip Live Source coordinates in `#reconcileForeignQuarantine` **before** the
      `occ.producer === 'html'` test (~~`:3520`~~ → **`:3713`**, drift +193; the method itself is at
      `:3707`), since that test is what a bridge-owned non-html layer defeats.
      🔴 **Pinned by a test with a NON-html live occupant** — the case the old order gets wrong: a
      live producer reports `route`, falls straight through the kind test, and is quarantined as
      "a foreign producer" on a layer the bridge itself owns. Placed after the kind test it would
      still skip today, but only because live producers happen never to be `html` — which would make
      this door's correctness depend on a fact about a different one.
- [x] 5.4 R-015: `clearLayer` refuses a Live Source layer with a **new distinct reason**
      (`live-source`), not `foreign` and not `owned` (~~`:2649-2651` / `:2682-2686` / `:2690`~~ →
      at the pre-change HEAD the method is **`:2784`**, the `owned` loop **`:2796`** and the `html`
      test **`:2804`** — drift +114 to +135).
      C-015's exemption was **NOT** applied as worded (`design.md` §4, C5): an exemption would have
      made these layers operator-CLEARABLE, inverting the protection.
      The check sits AFTER the `owned` loop (which is therefore untouched) and BEFORE the `html`
      test — the ordering that matters, since a live producer is never `html` and would otherwise be
      refused as `foreign`: the right outcome carried by exactly the wrong statement.
      **The reason is a named constant, not an inline string**: `LAYER_CLEAR_REASONS` in
      `packages/shared-ipc/src/channels/layers.ts` is now the ONE canonical list, and
      `clearLayer`'s return type is derived from it, so a reason cannot exist on the wire and be
      unrepresentable in the implementation. [[B-122]] and [[B-125]] each carry a one-line note
      pointing at it; neither item was otherwise touched.
- [x] 5.5 Regression tests for all three doors plus the boundary, against the phase-3 mock —
      `tools/caspar-bridge/tests/live-source-ownership.integration.test.ts`, 7 tests.
      **The boundary is half the suite**: every door test runs TWO ADJACENT layers (30 and 31)
      through the SAME sweep carrying the SAME `route` producer, differing ONLY in whether the
      ledger holds them, so a check that leaked either way fails. The existing classes are asserted
      unchanged at the same time — `owned` (via `#slots`), `foreign` (the neighbour), `reserved`
      (a declared playout layer) and a genuine html orphan still CLEARABLE.
      ✅ **Each door was verified to FAIL without its own line**, one at a time, against the
      restored source — tests that only ever ran green would pin nothing: - disabling 5.2 fails exactly the two DOOR 1 tests: the ledgered layer 30 appears in the
      orphan set beside its neighbour 31. - disabling 5.3 fails exactly the two DOOR 2 tests, on the assertion
      `the bridge must never call its OWN producer foreign`. - disabling 5.4 fails exactly the DOOR 3 test, which reports `reason: 'foreign'` where
      `reason: 'live-source'` was expected — C5's hazard reproduced verbatim.

## 6. Phase 6 — Producer, geometry, audio (requires phase 5 — landed — and R-028 §6)

⚠ **This header named NO prerequisite at all**, though `design.md` §4's table binds phase 6 both
after phase 5 and after R-028's section 6. Same under-statement as §5's old header, corrected for
the same reason: the constraint has to be where the work starts, not only where it was argued.
Phase 5 is now landed (`95ef840c`); R-028 §6 is still open.

✅ **THE LEDGER'S WRITE PATH ALREADY EXISTS — CALL IT, DO NOT RE-CREATE IT.** Phase 5 wired
`#liveLayers` together with its bookkeeping API on `CasparRuntime`:

| Method                                | What it does                                                           |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `registerLiveLayers(itemId, records)` | Record the layers an item owns. Replaces wholesale, never accumulates. |
| `releaseLiveLayers(itemId)`           | Forget them (teardown).                                                |
| `liveLayers()`                        | Read the ledger — for phase 6's re-emission of `FILL`/`CLIP`.          |

**They are BOOKKEEPING ONLY: no AMCP, no producer.** `playSource` (6.1) seats the producer and then
calls `registerLiveLayers` with **what it actually sent** — the ledger records the resolved producer
argument as SENT, not as configured, so it says what is on the layer and not what a since-edited
mapping now claims (`live-layers.ts`).

**Why they are phase 5's and not yours:** the three ownership doors read that ledger, and without a
way to populate it those doors could not be regression-tested before a verb existed to fill them.
That testability is what let ownership land first and be self-proving. A second write path here
would give the ledger two owners and the doors two truths.

✅ **PART 2 LANDED 2026-08-14 — THE PIECES ARE NOW ASSEMBLED. A DECLARED PLATE PUTS
A PICTURE ON AIR.**

Part 1 built every COMPONENT and tested each one green — the commands (6.1), the
geometry (6.2/6.2a/6.2b/6.4), the fit-aspect policy and its refusal (6.3), the
unassigned refusal (6.7), teardown (6.6) — and **nothing called them**, so a plate
still showed nothing. That was a hole in THIS LIST rather than an omission by a
session: no item said "call them". It is now **task 6.0**, filed and built, and it
is left in the list permanently so the phase cannot lose it again.

⚠ **THE HISTORY IS KEPT ON PURPOSE.** Every component test passed while the feature
did nothing at all, which is the exact reading a green task list can give when the
list is missing its integration step. `extend the list, forget the mutator` — one
level up, in the plan instead of the code.

✅ **Part 2's Linux `gate:e2e` is DISCHARGED** — https://github.com/yasermostafaee/cg/actions/runs/31800246101
(run 31800246101, `headSha cecc676c`): `completed` + `success`, with the
**E2E (Playwright) job itself having RUN** (its own `conclusion: success`, not a SKIP —
a skipped `e2e` proves nothing about the suite, P-029). It was owed because this
session changes UI and render paths directly: a new dialog, a new row verb and
`apps/runtime/src/renderer/**` edits. `pnpm gate` was green uncached beforehand:
85/85, `0 cached`.

✅ **Part 1's Linux `gate:e2e` is DISCHARGED** — https://github.com/yasermostafaee/cg/actions/runs/31787014201
(run 31787014201, `headSha b1e017ba`): `completed` + `success`, with the
**E2E (Playwright) job itself having RUN** (its own `conclusion: success`, not a SKIP —
a skipped `e2e` proves nothing about the suite, P-029). It was owed because
`packages/shared-schema/` and `packages/template-runtime/` are both inside
`UI_RENDER_PATTERNS`' render-dependency closure. `pnpm gate` was green uncached
beforehand: 85/85, `0 cached`.

- [x] 6.0 ⭐ **THE ASSEMBLY — the call site that seats a plate. FILED 2026-08-14
      (session AG), and it is a NEW item: this phase never enumerated it.**
      🔴 **The gap was in the TASK LIST, not in a session's work.** 6.1 says build
      the verbs, 6.2 the arithmetic, 6.3 the policy, 6.6 teardown, 6.7 the
      refusal — and no item said "call them", so part 1 landed every component
      green and a declared plate still put NOTHING on air. Session AF found it
      and reported it rather than quietly widening its own scope; it is written
      down here so the phase cannot lose it a second time. It is this project's
      catalogued **extend-the-list-forget-the-mutator** failure arriving one
      level up, in the plan instead of the code.
      **DONE 2026-08-14 (session AG).** `#planLiveSeating` + `#seatLiveLayers`
      (`caspar-runtime.ts`), called from `take()`, with teardown called from
      `out()`, `stopItem()` and `remove()`.
      **DECIDE, THEN ACT — the split is the design.** The plan resolves every
      plate to a catalog entry (6.7), validates the author's aspect against it
      and derives the fit (6.3), computes the geometry (6.2/6.4) and picks the
      layers — and sends NOTHING. So all four refusals (`live-source-unassigned`,
      `live-source-aspect-mismatch`, `live-source-no-layer-range`,
      `live-source-no-layer`) are reachable with the wire, the Reconciler and the
      ledger untouched, exactly like the `rehearsing` / `unknown-item` /
      `disconnected` refusals they sit beside. The SEATING is deliberately the
      last thing before the `CG PLAY`.
      **BOTH ends of that ordering are on-air decisions.** LAST, because a live
      producer renders the instant it is played — there is no loaded-but-not-
      playing state for a route or a card — so seating at load time would put a
      guest's picture on the programme channel, framed by nothing, for as long as
      the operator cued ahead. BEFORE the take, because the alternative is the
      template landing with its holes still empty, which is precisely what 6.7's
      refusal exists to prevent; arriving there by an ordering choice is no
      better than arriving there by a missing assignment.
      🔴 **ANY seating failure rolls back EVERY layer the action touched and
      REFUSES the take.** Not "keep what worked": the two failure shapes are a
      producer with no geometry (a guest blown up across the whole programme,
      unmasked) and a `FILL` without its `CLIP` (§3 — renders nothing at all),
      both worse on air than a black box. The record is pushed BEFORE its send is
      awaited, because from the moment a `PLAY` leaves this process a producer may
      be on that layer, and a rollback walking only the ACKED sends would leave a
      live picture nobody owns.
      **A RE-TAKE LANDS ON THE SAME LAYERS**, and that is not an optimisation:
      moving a plate would leave the old layer's producer running with nobody's
      name on it, since the ledger teardown walks would name the new one.
      **TEARDOWN GOES FIRST, THE GRAPHIC SECOND.** The template sits ABOVE its
      plates and covers the frame with a hole punched in it — clearing it first
      strips that covering off and leaves bare guest rectangles keyed over
      programme for the length of the teardown.
      **The refusal's own SENTENCE now reaches the operator** (`StackTakeChannel`
      gained an optional `message`, `asyncResultMessage` prefers it over the
      code's generic wording): 6.7 requires the refusal to NAME THE PLATE, and a
      fixed code cannot say which of three plates is unassigned. Before this it
      stopped at the bridge's stderr.
      Tests: `live-seating.integration.test.ts` (16, wire-asserted from the
      NDJSON trace — the failure this unit fixes was invisible to state-only
      assertions) + `live-plate-seating.test.ts` (10, the pure allocation).
- [x] 6.1 **DONE 2026-08-14.** `playSource` / `mixerFit` / `mixerClear` on
      `command-builder.ts`, all layer-scoped through `target()` — the channel-scoped
      form stays impossible by construction. `mixerFit` returns BOTH commands from one
      call and there is deliberately no `mixerFill`/`mixerClip` pair; a test asserts
      their ABSENCE from the prototype, so the coupling is a property of the API
      rather than of one output. `playSource` takes the discriminated union, never a
      string. Zero-is-falsy caught a third time: `route.layer` is `nonnegative()`, so a
      truthiness check would have emitted `route://1` — the WHOLE CHANNEL — which on a
      single-channel install is exactly §9a.2's feedback loop.
      ⚠ **DECKLINK and NDI argument spellings are PARSE-VERIFIED ONLY** (no capture
      card, no NDI source on this plant) — C-021's hardware debt, said in the
      method's own docstring rather than left to be discovered.
      Original: `playSource` / `mixerFit` / `mixerClear` on `command-builder.ts`, all layer-scoped
      through `target()`. Channel-scoped forms stay forbidden (`caspar-runtime.ts:2718-2724`).
      **`mixerFit` emits the `FILL` and the `CLIP` as a PAIR from one computation** — NOT two
      independent methods a caller could get half-right. Measured: `CLIP` masks in channel space and
      does not travel with `FILL`, so a fill box that moves out from under its clip window renders
      **nothing at all** — a black hole where a guest should be (`design.md` §3).
- [x] 6.2 **DONE 2026-08-14.** `liveSourceFit` (`@cg/shared-schema/live-geometry.ts`)
      implements §6's chain; `CasparRuntime.liveSourceFitFor` runs it bridge-side,
      resolving the channel raster from `ChannelSettingsStore.rasterFor` and the
      position through `#effectivePosition` — the SAME three-step chain the page runs
      (`override ?? carried defaultPosition ?? centred`), with the middle step
      load-bearing: the bridge appends `pos` only when an override exists, so without
      the carried default a bridge assuming `centred` places the box where the hole is
      not, on every template whose author set a position.
      The naive `rect.x / scene.resolution.width` form is pinned as WRONG by its own
      test using §6's worked example (0.302083 vs 0.104167 — a fifth of the frame).
      ⚠ **WHERE IT LIVES:** the pure arithmetic is in `@cg/shared-schema`, not in the
      bridge, and deliberately — 6.2b's contract test has to import both sides, and a
      bridge-local function would have forced it to re-implement one of them, which is
      the second spelling both guards exist to prevent. The derivation still RUNS
      bridge-side, which is what §6 actually decided.
      Original: The scene-px → `FILL` chain from `design.md` §6, with the per-axis normalization measured
      on hardware, and the bridge resolving the SAME three-step position chain the page does
      (override ?? carried `defaultPosition` ?? centred). **Do not use the naive
      `rect.x / scene.resolution.width` form** — it is wrong by a fifth of the frame on a 4:3
      raster.
- [x] 6.2a **DONE 2026-08-14.** `REFERENCE_FRAME`, `ANCHOR_FRACTIONS`,
      `outputTranslate`, `outputScale` and `outputLetterbox` now live in
      `@cg/shared-schema`'s `scene.ts` beside `positionQuery`;
      `@cg/template-runtime/position.ts` re-exports every name, so **no page import
      churned** — 899 template-runtime tests and both app typechecks unchanged.
      `ANCHOR_FRACTIONS` was module-private and is now exported: nine literals are
      nine chances to transpose one. `applyOutputPosition` and `resolveChannelRaster`
      stayed behind — they touch `document` and `window`.
      Original: **Duplication guard 1 — ONE implementation.** Move the DOM-free half of `position.ts`
      (`REFERENCE_FRAME`, `ANCHOR_FRACTIONS`, `outputTranslate`, `outputScale`, `outputLetterbox`)
      into `@cg/shared-schema` beside `positionQuery` (`packages/shared-schema/src/scene.ts:260`);
      re-export from `@cg/template-runtime` so no page import churns. The bridge already depends on
      `@cg/shared-schema`, so this adds no dependency. Follows the precedent the code itself argues
      at `caspar-runtime.ts:3681-3684` — _"never a local spelling … two spellings of one override is
      how a preview comes to place a graphic differently from air."_
- [x] 6.2b **DONE 2026-08-14** —
      `packages/template-runtime/tests/live-source-fill-contract.test.ts`, 4 rasters ×
      4 positions × 3 scenes, comparing the bridge's FILL against the transform
      `applyOutputPosition` ACTUALLY WROTE (parsed off the element's style), never
      against a re-derivation in the test.
      ✅ **THE TEETH WERE VERIFIED BY MUTATION, NOT ASSUMED.** With `pad` removed from
      the chain, ONLY the 1440×1080 and 720×576 rows fail — every 16:9 row still
      passes. That is the "test that passes for the wrong reason" class demonstrated
      rather than argued, and it is why the non-16:9 requirement was written.
      Its tolerance is stated in raster PIXELS and derived: the page rounds CSS to 6
      decimals, so `s = 2/3` arrives as `0.666667` and a coordinate of ~1920 inherits
      ~0.002 px. A hundredth of a pixel is the tightest honest bound — four orders of
      magnitude below the failure the file exists to catch.
      Original: **Duplication guard 2 — a CONTRACT TEST** pinning the bridge's normalized FILL to the
      page's composed transform over a fixed table of `(scene.resolution, raster, rect, position)`
      triples. **MUST include at least one non-16:9 raster** — on 16:9 every term collapses
      (`s = 1`, `pad = (0,0)`) and the test would pass against a wrong implementation. Use
      `1440×1080` (already pinned page-side at `output-position.test.ts:162,169`) and `720×576`,
      which pads on the other axis.
- [x] 6.2c ⭐ **DECIDED 2026-08-14 — ASSUME THE HOLE'S OWN ASPECT (no crop), and mark
      the result `assumed`. NOT a refusal.** `resolvePlateAspect`
      (`tools/caspar-bridge/src/live-plate-fit.ts`).
      🔴 **The argument that settled it comes from the CODE, not from taste, and is on
      its own sufficient: refusing would OUTLAW `AUTO`.** `LIVE_SOURCE_FORMATS`
      includes `AUTO`; `aspectForFormat` returns `null` for it and for nothing else,
      and its own docstring calls it _"a request to the hardware, not a statement
      about the picture"_. An operator who picks it has configured the system
      CORRECTLY — a refusal would make a supported catalog value unusable with
      nothing in the UI saying why.
      Three supporting reasons: this design's refusals are for CONFLICT (no
      assignment; disagreeing aspects), not for the absence of a cosmetic detail on
      an otherwise-configured plate; the harms are not comparable (a possibly
      stretched picture — today's behaviour for every source — versus a BLACK BOX
      where a guest should be); and §3's ladder is written as DEGRADATION, with D-147
      having made `expectedAspect` optional precisely so nobody is forced into a guess
      that can refuse a take on air — refusing here would reintroduce that forced
      guess at the installation end.
      ⚠ **FLAGGED FOR THE OWNER as reversible.** It is a judgement about which on-air
      failure is worse. `assumed` is the seam: it already carries the fact as its own
      field (not `aspect === null` — they answer different questions), so switching to
      a refusal is a change at this function and its callers, not a redesign.
      Original: ⚠ **Define the case where NEITHER side states an aspect (D-147, 2026-08-08).** §3's fit
      input is the MAPPING's `aspect`, falling back to `expectedAspect`. D-147 made
      `expectedAspect` OPTIONAL — an author who cannot see the feed may now decline to assert — so a
      source with no `aspect` and an element with no `expectedAspect` leaves the chain with no
      terminal value. Pick and record the behaviour (assume the hole's own aspect ⇒ no crop; or
      refuse the take with a distinct errorCode). Not solved in phase 1 and not silently folded into
      §3.
- [x] 6.3 **DONE 2026-08-14 (the POLICY and the ARITHMETIC; see the part-1 banner —
      nothing calls them yet).** Crop-to-fill in `liveSourceFit`: cover the hole with
      proportions intact, sized by `max` of the two required ratios, centred so the
      crop takes evenly from both edges. `min` would be pillarbox, and a test asserts
      across six aspects that the fill is never SMALLER than the hole on either axis —
      the rejected option pinned as unreachable rather than argued in a comment.
      The chain (§3a) is `resolvePlateAspect`: format → explicit `aspect` →
      `expectedAspect`, with `expectedAspect` keeping its OTHER role as the author's
      assertion the bridge VALIDATES against — refusing `live-source-aspect-mismatch`,
      naming the plate, the source and BOTH numbers, and saying what to do.
      The 1% tolerance is DERIVED and the derivation is executable: it must absorb an
      author's rounded decimal (4:3 vs `1.33` is 0.25% off) and catch the closest real
      difference in the vocabulary (16:9 vs DCI 1080, 6.6% apart). A test asserts the
      band sits between the two, so widening it past usefulness goes red.
      Original: The aspect fit: **crop-to-fill** — scale to cover the hole preserving proportions, clip
      the overflow — driven by the ASSIGNED SOURCE's `aspect`, falling back to `expectedAspect` only
      where that source states none. Refuse the take with a distinct errorCode when the two disagree
      (`design.md` §3). Pillarbox was weighed and **rejected**: bars inside a designed frame read as
      a fault on air.
- [ ] 6.3a **STILL OPEN, and 2026-08-14 says WHICH HALF and WHY — neither half was
      guessed at.**
      **(a) Is `CLIP` purely an INTERSECTION mask under PARTIAL overlap?** The design's
      own measurement covers DISJOINT (renders nothing) and, implicitly, CONTAINMENT.
      Crop-to-fill is neither: the fill rect is LARGER than the clip rect on one axis.
      🔴 **The code now DEPENDS on the intersection reading** — `liveSourceFit` emits
      exactly that geometry on every cropped plate — so this is no longer a
      nice-to-know. The MOCK models it as an intersection (phase 3.3) and the offline
      tests pass against that model, which proves the code is self-consistent and
      proves NOTHING about the server. **Settleable with two `route://` producers and
      no capture card; DELIBERATELY NOT REASONED OUT HERE.**
      **(b) What rounding/precision does the server accept for the four arguments?**
      `CommandBuilder` now emits at most **6 decimals** and never exponential notation
      (`String(1e-7)` would produce `1e-7`, which no AMCP parser is known to accept).
      ⚠ **6 was chosen to match the page's `css()` so the two sides round identically —
      NOT because the server is known to want it.** No recorded precision exists.
      `numberArg` in `command-builder.ts` is the single place to change if a probe
      shows otherwise.
      Both are AMCP probes on the plant's 2.3.2, and both should ride the SAME session
      as §3b's `DEFER`/`COMMIT` question and 6.9a's replace measurement.
      Original: **NARROWED 2026-08-03 — coordinate space and composition order are SETTLED by
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
- [x] 6.4 **DONE 2026-08-14, and the clamp lands on the CLIP — that split is its
      correctness.** The clip is the MASK, so intersecting it with the scene rect is
      what actually stops the picture spilling past the stage; shrinking the FILL
      would re-scale the picture into a box the author never drew, squashing a face
      into the visible sliver. The task name says "clamp the FILL" and means "clamp
      what the fill SHOWS" — the template's own frame graphic behaves identically
      (drawn full size, clipped by `.cg-stage`).
      A hole ENTIRELY outside the scene yields `clip: null` — a first-class answer,
      because a zero-area rect reads as "very small" to a naive consumer and would be
      emitted. The intersection uses strict `>` on both axes, so an edge-touching hole
      is `null` rather than a zero-width box.
      Original: Clamp the FILL to the scene rect (`.cg-stage` has `overflow:hidden`; the live source
      behind the hole does not).
- [x] 6.5 **DONE 2026-08-14.** The mute is emitted in `#sendAdd` — the SINGLE `CG ADD`
      emit chokepoint — and in `#seatLiveLayers` for `playSource`, so BOTH producer-creating
      verbs are covered by two lines rather than by guards at seven call sites. The two
      ORDERS differ, and the difference is the measured one: the mute FOLLOWS `playSource`
      in the same batch (the producer does not exist before the `PLAY`) and PRECEDES the
      `CG ADD` on the wire (a bare ADD is already audible at 0.24 s on 2.5.0). The unmute
      half is NOT rebuilt: `take()`’s unconditional `INTENDED_VOLUME` re-assert IS the
      explicit intent, and `live-add-mute`’s SITE 4 pins that it still lands after the
      pre-roll and before the `CG PLAY` — a mute-before-ADD that stranded the mute would
      put a graphic ON AIR SILENT, which R-022 calls the worse of the two failures.
      `CREATED_MUTED_VOLUME = 0` is NAMED rather than a literal: zero is falsy, and a bare
      `0` invites a `?? INTENDED_VOLUME` downstream to read a deliberate mute as “no volume
      requested”.
      Original: **The audio rule — WIDENED 2026-08-08 (owner, `design.md` §12.4). It is not a Live
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
- [x] 6.5a **DONE 2026-08-14 — R-029’s CONTAINMENT, and R-029 stays `[~]` (see 6.5e).**
      Mechanism recorded in the item: option 2, bridge-side. What it does NOT cover, in
      words: the company’s PLAYOUT system sends `CG ADD` / `PLAY` to CasparCG directly,
      on layers this bridge never touches — nothing bridge-side can mute those, and no
      template-side convention binds a template we did not author. That is option 3’s gap
      and it remains open BY CONSTRUCTION rather than by omission.
      Original: **R-029** (`docs/prd/runtime.md`, high): the rule covers the **`CG ADD` path**, not only
      `playSource`, so cueing no longer puts a template's audio on air before the take. Records
      WHICH containment mechanism was chosen (option 2, bridge-side) and, in words, which command
      sources it does **not** cover — the playout system's own `CG ADD` is outside it.
- [x] 6.5b **DONE 2026-08-14 — and ONE PREMISE OF THE ITEM WAS ALREADY STALE.** All three
      acceptance bullets hold: the `MIXER … VOLUME` precedes the `CG ADD` on the AMCP
      trace at every site, and a mute that FAILS refuses the load with `add-mute-failed`
      instead of proceeding.
      ⚠ **“LOAD is permitted on a rehearsing row instead of refused” was already true**, by
      a different route: LOAD became LIST-ONLY (`loadFixed` emits no AMCP at all) and the
      guard was removed then — _“a path that cannot exist beats a guard that has to be
      remembered”_. What the mute actually closes is the caller that survived: the DYNAMIC
      `load()`, which still emits and never had a guard. Said out loud because R-042,
      B-121 and `design.md` §7 all name `loadFixed` as the guarded site, and all three
      were wrong about it; all three are corrected.
      Original: **R-042** (`docs/prd/runtime.md`): **mute-before-ADD**, so LOAD is permitted on a
      rehearsing row instead of refused, with no audible leak. **The `MIXER … VOLUME` lands BEFORE
      the `CG ADD` on the wire, asserted on the AMCP trace** — not by the absence of an error — and
      a mute that fails does not proceed to the ADD.
- [x] 6.5c **DONE 2026-08-14 — at the CHOKEPOINT, not at the site.** Site 2 is closed by
      the same `#sendAdd` mute as the other three, so there is no site-2 guard to drift.
      Asserted ON THE WIRE and driven through `restore()` — the real entry point a
      reconnect uses — never by calling the private decider.
      Original: **B-121** (`docs/prd/bugs-runtime.md`): `CG ADD` **call site 2**, the reconnect
      reconciliation (`#decidePendingRestores`, `caspar-runtime.ts:1394`), is not rehearse-guarded,
      so a bridge blip re-ADDs an UNMUTED producer under a rehearsing row. Fix it under the same
      rule — mute before the re-ADD, or do not ADD — and assert it **on the wire**, since a
      renderer-only guard is the shape site 1's fix explicitly rejected.
- [x] 6.5d **DONE 2026-08-14** — `live-add-mute.integration.test.ts`, six tests, each
      site through its real entry point, each asserting the mute’s trace INDEX against the
      ADD’s. ✅ **Verified by MUTATION:** with the mute removed from `#sendAdd`, five of
      the six go red (the sixth is `loadFixed`, which correctly still emits nothing).
      ⚠ **Site 3 “unchanged” means the GUARD, not the mute.** The table’s column is about
      whether each site needs a rehearse guard of its own; the mute is implemented once at
      the chokepoint and therefore covers site 3 too. What is pinned unchanged is that a
      position edit still works on a row that is not on air, including a rehearsing one.
      Original: **Pin all four `CG ADD` sites with one test** (`design.md` §7's table): site 1
      `#loadOnto` guarded, site 2 fixed by 6.5c, **site 3 `setPosition` unchanged and pinned so it
      STAYS unchanged**, site 4 `take()`'s pre-roll unchanged. A per-site table that is not pinned
      is a comment, and the next sweep re-derives it.
- [x] 6.5e **DONE 2026-08-14 — R-029 IS LEFT `[~]`, carrying its head bullet, and the
      item says so in its own words.** A bridge-side mute cannot deliver _“audible from
      the start of the audio”_: on 2.5.0 the audio is ALREADY RUNNING at `CG ADD`, so the
      take unmutes mid-stream and the head is eaten by however long the operator cued
      ahead. Closing it needs R-029’s option 1 — gating audio on the template’s own
      `play()` lifecycle, enforced at export/validate time — which is a
      `@cg/template-runtime` + exporter change and out of this design’s scope. Read the
      `[~]` as “the leak is contained”, never as “the audio question is answered”.
      Original: ⚠ **Do NOT close R-029's head bullet here, and say so in the item.** _"audible … from
      the start of the audio — containment must not eat the head"_ is **not** dischargeable by a
      bridge-side mute: the audio is already running at `CG ADD` on 2.5.0, so the take unmutes
      mid-stream. Preserving the head needs R-029's option 1 — gating audio on the template's own
      `play()` lifecycle, enforced at export/validate time — which is a `@cg/template-runtime` +
      exporter change and is OUT of this design's scope (`design.md` §7, _"What this rule does NOT
      close"_). R-029 stays `[~]` carrying exactly that residual.
- [x] 6.5f ⭐ **DONE 2026-08-14 (session AH) — THE RAISE HALF OF THE AUDIO RULE NOW
      HAS AN OPERATOR SURFACE.** Filed by session AG, which found it by applying the
      standing "check whether another cluster has the same hole" rule after task 6.0.
      Until this landed, every Live Source plate was PERMANENTLY SILENT: 6.5–6.5e
      enumerate the MUTE half at five sub-items, and nothing enumerated the surface
      that records the explicit intent the rule defers to.
      ⭐ **THE OWNER'S PLACEMENT (2026-08-14): ON THE ROW, BESIDE THE SOURCE SWAP.**
      Two reasons, both recorded: under pressure, on air, "which source" and "how
      loud" are ONE DECISION made in one place — 6.9e already requires the swap to be
      one or two actions from the row and explicitly not behind a modal chain, and the
      volume has the same emergency character; and 6.9c already settled that the
      audio intent belongs to the PLATE rather than to the producer instance, so a
      control expressing a plate-level property belongs where the plate's other
      per-run property already is.
      **REJECTED, recorded so neither is re-proposed:** inside the SWAP DIALOG (it
      turns a two-second adjustment into opening the swap flow, and couples two
      independent acts), and the PLAYOUT TAB (further from the operator's flow than
      the row they are already looking at).
      ⚠ **It is a dialog rather than an INLINE row control, and the row forces that**
      — a row carries a VARIABLE number of plates while the verb block is a fixed
      six-column grid whose sticky header prints a word above each glyph
      (`layerTable.ts`: `VERB_COUNT = 6`). A conditional inline control would
      misalign every header word from its button, which that file names as the
      DANGEROUS failure because this product's STOP and CLEAR are the inverse of the
      reference product's. So `AUDIO` sits beside `SOURCE` in the row's own action
      set — as close to the row as a per-plate control can get — and a test asserts
      the two are ADJACENT rather than merely both present.
      🔴 **RETENTION WAS REQUIRED, NOT OPTIONAL — the session verified rather than
      assumed.** AG's `intendedVolume` lived ONLY in the bridge's in-process ledger,
      which teardown destroys and a restart discards, so a CLEAR-then-retake or a
      bridge blip silently re-muted a raised plate. The intent now lives in
      `#plateVolumes` and rides `RetainedStackItem.plateVolumes` on the OPEN axis
      beside `sourceOverride` (6.9d). The ledger keeps a copy of what was SENT, the
      same relationship its `producer` field already has to the catalog.
      **NO SECOND UNMUTE PATH.** The seating path already asserts every plate's
      intent on every take, unconditionally — the plate's exact analogue of
      `take()`'s `INTENDED_VOLUME` re-assert. `setLivePlateVolume` feeds that
      mechanism; it does not duplicate it.
      **ZERO IS A REAL VALUE.** An explicit `0` ("the operator muted this plate") is
      recorded and published, and is distinguishable from an ABSENT key ("nobody has
      said"). A plate deliberately set to 0 is NOT re-raised by a swap.
      ✅ **VERIFIED BY MUTATION, three times.** Reading the intent off the ledger
      again turns 3 tests red; dropping the retention re-apply turns the round-trip
      red; treating a volume of 0 as falsy turns both zero tests red. The UI's
      commit-on-release is pinned the same way.
      Tests: `live-plate-audio.integration.test.ts` (10, wire-asserted) +
      `livePlateAudio.dom.test.ts` (12, the row verb and the panel's claims).
      ✅ **Linux `gate:e2e` DISCHARGED** — https://github.com/yasermostafaee/cg/actions/runs/31805968504
      (run 31805968504, `headSha eb53df68`): `completed` + `success`, with the **E2E
      (Playwright) job itself having RUN** (its own `conclusion: success`, not a SKIP —
      a skipped `e2e` proves nothing about the suite, P-029). Owed because this adds a
      row control and a new dialog under `apps/runtime/src/renderer/**`. `pnpm gate`
      was green uncached beforehand: 85/85, `0 cached`.
- [x] 6.6 **DONE 2026-08-14** — `CasparRuntime.teardownLiveLayers` sends the producer
      `CLEAR` and `MIXER … CLEAR` per layer, asserted ON THE WIRE (the mock models
      mixer state surviving a `CLEAR`, which is what makes the omission catchable
      offline) and on the resulting layer state — which resets to the IDENTITY rect,
      the right thing to assert, since a mixer's default is the full frame unmasked
      and that is what the next graphic must inherit.
      Two orderings are load-bearing and tested: the producer goes BEFORE its geometry
      (otherwise a live picture sits on the layer with its mask already reset,
      flashing the un-masked oversized crop across the frame), and the ledger is
      released LAST (releasing first hands the layer to the R-009 sweep while our
      producer is still on it — DOOR 1's boundary case would surface it as an orphan).
      ✅ **CALLED 2026-08-14 (6.0)** from `out()`, `stopItem()` and `remove()` — and
      BEFORE the graphic’s own CLEAR in each, because the template covers the frame
      with a hole in it: stripping that covering off first would leave bare guest
      rectangles keyed over programme for the length of the teardown.
      Original: `mixerClear` on teardown — mixer state survives `CLEAR`
      (`command-builder.ts:128-130`, measured on hardware), so omitting it leaves a `FILL` a later
      graphic inherits.
- [x] 6.7 **DONE 2026-08-14** — `resolvePlateAssignments`
      (`tools/caspar-bridge/src/live-plate-assignment.ts`) refuses with
      `live-source-unassigned` and NAMES THE PLATE in both of §2z's ways (never
      assigned; the cascade removed it), which resolve to ONE state as the task
      requires. A third route — an assignment naming a source the catalog no longer
      has — keeps the same CODE (the operator's next action is identical) and changes
      only the WORDING, since "unassigned" would send them looking for an assignment
      they will find already made.
      ALL-OR-NOTHING: a partly-assigned template seats nothing, because a layout with
      one hole in it reaches the silent-empty-hole outcome by a different road. The
      refusal names EVERY unresolved plate, so one attempt gives the whole list.
      Every assertion is on the CLAIM, not on the presence of a refusal.
      ✅ **CALLED 2026-08-14 (6.0)** from `take()`, in the plan half — before any
      command leaves the process, so the refusal mutates nothing. Its MESSAGE now
      reaches the operator too (`StackTakeChannel.message`); it previously stopped
      at the bridge’s stderr, which meant the plate-naming the task asks for was
      real in the code and invisible on the console.
      Original: The take refuses legibly with a distinct `errorCode` when a declared plate has **no
      ASSIGNMENT** — never a silent empty hole on air (`docs/prd/caspar.md:396-397`).
      ⚠ **EXTENDED 2026-08-10 by the §2z reshape.** The wording assumed a missing MAPPING, which was
      the only way to fail before. There are now TWO ways and the refusal must NAME THE PLATE in
      both: a plate that was never assigned (the ordinary state of a freshly imported template), and
      a plate whose assignment the delete CASCADE removed when its source was retired (§2c). They
      resolve to ONE state — unassigned — deliberately: a second "assigned, but not really" state is
      one every consumer would have to learn and could get wrong.
- [ ] 6.8 The two-box `route://` demo on real hardware, which needs no capture card.
- [ ] 6.8a 🔴 **A3-R1 — RECON: does `route://<channel>-<layer>` exist on 2.3.2, and WHAT does it
      deliver?** (`design.md` §12.6; run alongside §12.5's M1–M4 on the plant's CasparCG **2.3.2**.)
      **The whole no-feedback argument for the studio plate rests on the answer.** §0b measured
      `PLAY 1-2 "route://1-1"` rendering layer 1's picture on layer 2 with no runaway — that shows
      the form is ACCEPTED and does not loop; it does NOT establish what the routed picture IS.
      **(a) the PRODUCER's own output** ⇒ §9a.2's mechanism B stands. **(b) something ALREADY
      COMPOSITED** ⇒ the layer-scoped form is not a feedback mitigation on a single-channel
      installation, mechanism B is unavailable there, and the studio plate falls back to passthrough
      (1.5h, with its window-not-scaled-copy limit) or to §9b's dedicated channel.
      **The discriminating test:** picture on layer N, a DIFFERENT visibly-overlapping picture on a
      layer BELOW it, route layer N into a plate on a third layer. Plate shows only layer N ⇒ (a);
      shows both composited ⇒ (b). **Record the answer either way** — a negative result invalidates
      the mechanism choice rather than merely delaying it.
- [ ] 6.8b **A3-R2 — RECON: the route's LATENCY, in frames. Record the NUMBER, not an impression**
      (`design.md` §12.6). Usually invisible, because the backdrop covers everything except the
      plates and there is nothing on screen to compare a plate against.
      ⚠ **It stops being invisible in one arrangement, and that arrangement is reachable by design:**
      wherever a DIRECTLY composited programme picture is visible BESIDE a routed plate — a
      passthrough hole (1.5h) and a routed studio plate in the same template, or a routed plate over
      a programme background — the two are out of step by the measured figure, and fast motion shows
      it as a visible lag between two views of the same studio. Record that consequence **with the
      figure beside it**: "N frames" is a number an author can design around; "there may be some
      latency" is not.
- [x] 6.8c ⭐ **DELETED 2026-08-14 — the owner ANSWERED it, and the answer dissolves the
      task rather than closing it.** It asked which layer CIAB puts the studio picture
      on. Two independent reasons, either sufficient (`design.md` §12.6):
      **(1) THE STUDIO IS NOT SPECIAL.** A live source is an ADDRESS mapped to a symbolic
      name; a DECKLINK, an NDI and a `route://1-2` carrying the studio are the same kind of
      thing to every part of this design. 6.8c asked the GENERAL question — what addresses
      do this installation's sources have? — in a costume that made it look like a
      studio-specific fact. That question already has a home: **C-022**, the named
      live-source list.
      **(2) THE ADDRESS IS NOT FIXED.** It may be 1-1, 1-2 or another, chosen at the moment
      of use — so no configured constant can be right, and even a perfect answer from CIAB
      would have held only until the next gallery decision. Choosing live is exactly what
      **R-048 / 6.9** is: the installation declares the candidates as separate NAMED
      sources and the operator picks between them at take time.
      🔴 **CONSEQUENCE:** R-048 is therefore not a convenience — it is how a moment-chosen
      source is addressable at all. And **no studio-specific behaviour goes anywhere in the
      code**: a special case built now is one that has to be dug out later.
- [x] 6.9 **DONE 2026-08-14 (session AG).** `CasparRuntime.swapLiveSource` +
      `#sourceOverrides` (the `#positions` precedent exactly: process memory, keyed by
      itemId, dropped at remove, carried across a restart by the browser's retention).
      The override is resolved INSIDE `resolvePlateAssignments` rather than by a second
      path — an override is not a different KIND of thing from an assignment, it is the
      same question answered by a higher authority, and a swap path that resolved plates
      its own way would be a second spelling of "which producer is behind this hole".
      `sourceId: null` REVERTS the plate to its assignment. Not in the item as written,
      and added deliberately: an emergency patch the operator cannot undo is its own
      trap. An EMPTY override map is deleted rather than kept, so a row back on its
      assignment never reads as substituted.
      **THE LAYERING IS IN THE UI, in the dialog's first paragraph** — this row only,
      the template's assignment untouched, the installation's list untouched, every
      other row carrying the template unaffected — and pinned by a DOM test, because an
      operator who cannot tell those three apart cannot use this safely and the failure
      is SILENT.
      Original: ⭐ **R-048 — swap a plate's input WHILE THE TEMPLATE IS ON AIR. A CLIENT REQUIREMENT**,
      filed in `docs/prd/runtime.md` and implemented here, the same pattern D-147 used for phase 1.
      A PER-ITEM OVERRIDE — the template's ASSIGNMENT and the installation's CATALOG are both
      untouched, exactly like the position override — replacing `producer` on ONE `#liveLayers`
      record and re-issuing on that same slot. The template's HTML is never touched.
      ⚠ **STATE THE LAYERING IN THE ITEM AND IN THE UI (§2z / §2d):** the ASSIGNMENT is the
      TEMPLATE-LEVEL default, shared by every row carrying that template; this swap is the PER-RUN
      override on top of it; and the override **does NOT write back**, because an emergency
      substitution must never silently become the permanent configuration.
- [x] 6.9a **DONE 2026-08-14 — a REPLACE, and the test asserts the ABSENCE of a CLEAR
      on the wire, not merely the presence of a PLAY.** A clear-then-add is the `B-126`
      window arriving during an emergency: a destructive step committed before the
      constructive one was known to succeed, leaving the operator with a BLACK plate
      where they had a merely-dead one. On failure the previous producer stays, the
      ledger is unchanged, **the override is NOT recorded** (a row claiming the new
      source while the layer carries the old is worse than the failure), and the
      message says so in as many words.
      🔴 **THE 2.3.2 MEASUREMENT IS STILL OWED — NO HARDWARE THIS SESSION.** The mock
      models `PLAY` on an occupied layer as a substitution, so the tests prove the code
      is self-consistent and prove NOTHING about the server. Ride it with `design.md`
      §3b's `DEFER`/`COMMIT` question and 6.3a's `CLIP` intersection probe — three AMCP
      probes on the same build, one session instead of three.
      Original: **A REPLACE, never a clear-then-add.** `PLAY` on the occupied layer substitutes the
      producer in place. A `CLEAR` then a `PLAY` that fails is the `B-126` window arriving during an
      emergency: a destructive step committed before the constructive one was known to succeed. On
      failure the previous (black) producer stays and the row says so honestly.
      ⚠ **VERIFY on the plant's 2.3.2 that `PLAY` on an OCCUPIED layer substitutes rather than
      requiring a prior clear — do not assume it, and record the measurement.** Run it in the SAME
      `amcp-poke` session as `design.md` §3b's `DEFER`/`COMMIT` question; both are AMCP probes on the
      same build and pairing them costs one session instead of two.
- [x] 6.9b **DONE 2026-08-14.** The fit re-derives through §3a's chain in the same
      action — including its REFUSAL, so a substitution the author's `expectedAspect`
      contradicts is refused rather than silently cropping a face. Asserted by swapping
      a 16:9 plate onto a 4:3 source and reading the FILL back off the mock: it changes,
      and its CLIP does not, because the mask still belongs to the hole. No second
      operator step — under pressure a second step is a step that does not happen.
      Original: **The fit recomputes automatically**, in the same action: the new source may carry a
      different format, so crop-to-fill re-derives through §3a's chain. The operator must not have a
      second step — under pressure a second step is a step that does not happen.
- [x] 6.9c **DONE 2026-08-14 — the intent is on the PLATE, and it survives both a swap
      AND a re-take.** `LiveLayerRecord.intendedVolume` replaces the global
      `INTENDED_VOLUME` for Live Source layers, which is the per-layer volume feature
      that constant's own comment calls _"the seam a future per-layer volume feature
      would replace"_. The swap re-asserts it onto the new producer, which was born
      muted like every other.
      ⚠ **NO OPERATOR CONTROL RAISES A PLATE YET — see the newly filed 6.5f.** The
      mechanism is complete and tested through `setLivePlateVolume`; the surface that
      records the explicit intent was never enumerated by this phase. Said here rather
      than left for the next reader to discover, because it makes this item's guarantee
      real but currently unreachable from the console.
      Original: **Audio intent survives the swap.** Every bridge-created producer is born muted (6.5), so
      a deliberately-raised plate must be re-raised by the swap itself: the intent belonged to the
      PLATE, not to the producer instance, and a swap that silently mutes a guest is its own on-air
      fault.
- [x] 6.9d **DONE 2026-08-14 — exactly where the item said, and re-applied BEFORE any
      decision runs.** `RetainedStackItem.sourceOverride` on the OPEN axis beside
      `position`; mirrored in `StackRetentionStore.toRetained` from the published
      `StackItemState`; re-applied in `restore()` on the line after `#positions.set(...)`.
      Nothing about the CLOSED `state` axis changed and no consumer branches differently.
      The test does not stop at "the field came back": it restores into a FRESH
      `CasparRuntime` and then TAKES, asserting the substituted producer reaches the
      wire. A restored override nobody reads is not a restored override.
      Original: **The override survives a bridge restart.** Retention must carry it, or a momentary blip
      silently reverts the plate to the DEAD source. This is the `B-107` / `B-109` class — retention
      dropping state it did not model — so it is a requirement with a test, not an assumption.
      ⭐ **THE MODEL THIS ATTACHES TO NOW EXISTS** (2026-08-11,
      `openspec/changes/runtime-retention-state/` — landed BEFORE this phase precisely so this task
      is an addition rather than a repair). `RetainedStackItem` is deliberately split into two axes
      that do not interact: a CLOSED `state` enum answering "may this row's producer be re-seated?",
      and an OPEN set of per-item OVERRIDES (`slot`, `position`). **This override goes on the OPEN
      axis**: add `sourceOverride?: LiveSourceOverride` beside `position`, mirror it in
      `StackRetentionStore.toRetained` from the published `StackItemState`, and re-apply it in
      `caspar-runtime.ts`'s `restore()` at the same point `#positions.set(...)` already re-applies
      R-011's placement — which is BEFORE any adopt-vs-re-ADD decision, so a re-issued producer
      carries it. Nothing about `state` changes; no consumer branches differently. See the two-axes
      note on `RetainedStackItemSchema`.
- [x] 6.9e **DONE 2026-08-14 — two actions, and the second one commits.** A
      menu-placed `SOURCE` verb on the row opens `LiveSourceSwapDialog`; choosing a
      source commits on change. There is deliberately no Apply: an Apply is a third
      action, and under pressure a third action is one that does not happen.
      Offered ONLY on a row whose template declares plates — a permanently-disabled
      entry in thirty row menus is furniture that teaches the operator to stop reading
      the menu — and NOT gated on `onAir`, because patching around a dead feed on a live
      graphic is the entire use of it.
      ⭐ **CROSS-REFERENCED 2026-08-15 — `openspec/changes/operator-surface/` `§4`.** The placement
      above is now the WORKED EXAMPLE of a rule that was never written down: the row's verb block
      is a rigid six-column grid whose sticky header prints a word above each glyph, so a control
      whose PRESENCE varies by row cannot go in it — it would shift every head to its right onto
      the wrong glyph, and this product's STOP (graceful) and CLEAR (hard kill) are the INVERSE of
      the reference product's. Session AH measured that wall on the audio control; this task and
      6.5f each rediscovered it independently and both landed on the menu, correctly.
      `VERB_COUNT` is still 6 and `LayerTableHeader`'s `VERB_HEADS` still has six entries —
      verified byte-identical at `ec65480`. **Do not "improve" SOURCE or AUDIO back into the verb
      block**, and do not add a seventh button without adding its head in the same change. The
      conditional-presence reasoning quoted above is `§4.2`'s answer and belongs beside the C6
      boundary in `PlayoutPanel.tsx`, not restated a fourth time.
      Original: **Reachable in one or two actions from the row.** Used under pressure, on air: not in
      settings, not behind a modal chain, not anywhere the operator must first find the item.
- [x] 6.9f **RECORDED 2026-08-14 — both remain out of scope, and the reasons are the
      item's own.** A PRE-ARMED backup source per plate: in a real failure the operator
      often needs a source nobody predicted, and an open list beats a pre-chosen wrong
      one — revisit only if use shows otherwise. Automatic DETECTION of a dead input: a
      separate capability, and C-023's thumbnails already give the operator eyes.
      Neither is a gap this change left; both are decisions it made.
      Original: **Recorded as OUT of scope, so neither is re-proposed as part of this:** a PRE-ARMED
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
  **PHASE 4's DEBT IS DISCHARGED, RESHAPE INCLUDED** —
  <https://github.com/yasermostafaee/cg/actions/runs/31408479929>, `ubuntu-latest`, `dev` @
  `c16d25f`, `conclusion: success`, `E2E (Playwright)` COMPLETED and green. See §4's own note for
  which commits that tip carries and for the three RED runs before it. Phases 5–8 still owe their
  own.
- [ ] 9.4 **Hardware:** the phase-6 `route://` demo is dischargeable here; **phase 7 is not** —
      see `design.md` §12.1, which is an owner decision, not work.
