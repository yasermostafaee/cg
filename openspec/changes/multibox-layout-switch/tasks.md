# Tasks — the multi-box layout switch

> **STATUS 2026-08-18 — ✅ EVERY owner gate is answered, and this file is now a PLAN rather than a
> gate tracker.** `design.md` §12 and §13 hold no open question.
>
> - **Sections 0 and 0b are the recon record and the evidence trail — do not edit them.** Everything
>   from section 1 down is the implementable plan.
> - **Section 1 states the ORDER**, taken from `design.md`'s own ordering statements rather than from
>   section numbering, with the one place they differ called out.
> - Every task names **the files it touches**, **what exists when it is done**, and **whether it is
>   visually checkable**.
> - The work is carried by **`R-057`** (operator) and **`D-152`** (authoring), plus **`B-145`** —
>   which is stage A and blocks the rest — and **`B-146`** / **`B-147`**.
> - ⚠ Vocabulary: an **ARRANGEMENT** is a named geometry for a **COUNT**; the count is **DERIVED**
>   from how many source toggles are lit (§12.8, D1). Where older text says "layout", read
>   "arrangement".

## 0. Recon and design — COMPLETE

- [x] 0.1 Read the tree at `dev` @ `f6c7329` (`git pull --ff-only` first; `HEAD == origin/dev`).
- [x] 0.2 Can a scene carry more than one layout today? **Compositions are the working nesting
      mechanism and a boolean field bound to an instance toggles a sub-tree. `container` exists in
      the schema but nothing constructs one and the runtime DISCARDS its children, so session AC's
      finding holds and is stronger than stated.** (`design.md` §7, §6)
- [x] 0.3 What triggers live-source allocation and release? **Allocation is TAKE-ONLY
      (`#planLiveSeating` → `#seatLiveLayers`, one command before `CG … PLAY 0`); a
      loaded-but-not-playing template holds ZERO live layers; release exists on `stopItem` / `out` /
      `remove` and NOT on disconnect or bridge restart.** (`design.md` §4, §12.7)
- [x] 0.4 Does anything recompute the mask after build? **NO — one production call site inside
      `buildScene`. But it is inline CSS on a live node, not a baked string, and a runtime mask path
      already exists for stamped scopes, so a re-punch is a reassignment rather than a re-export.**
      (`design.md` §6)
- [x] 0.5 Does the bridge re-fit live sources on `CG UPDATE`? **NO — the update path emits exactly
      `CG <ch>-<layer> UPDATE 0 "<json>"`, matching the owner's wire capture. `setSourceAssignments`
      is not even `async`.** (`design.md` §5)
- [x] 0.6 Does R-028's declared-rows model have a mutually exclusive group? **NO — no radio group,
      no single-active row, no solo mode.** (`design.md` §8)
- [x] 0.7 Answer assignment survival from the code. **Keyed `(templateId, plateId)` where `plateId`
      IS the `routeKey`; survives for free under §0.5's model, impossible in Family 2.**
      (`design.md` §3)
- [x] 0.8 State whether the layout switch and the live source change are ONE mechanism. **ONE.**
      (`design.md` §4)
- [x] 0.9 Which control did the owner use, and does R-048's swap cover it? **The row's INSPECTOR,
      which writes the shared TEMPLATE-scoped assignment. R-048's swap is shipped and already does
      the live thing; the defect is a MISSING REFUSAL.** (`design.md` §5)
- [x] 0.10 **DECIDE the plate identity model, from the code.** _A layout is a set of GEOMETRIES and
      VISIBILITIES over the SAME plate set_ — with `live-source-overlap` (shipped, export-blocking)
      and the seat-every-declaration behaviour as the evidence against separate plate sets.
      (`design.md` §0.5, §0.6)
- [x] 0.11 **DECIDE the v1 animation refusal question.** _(a) — the transition is a RUNTIME state
      change; v1's refusal stands untouched_, because the preflight reads authored
      `animation.tracks` and a runtime layout state is not one. (`design.md` §2b)
- [x] 0.12 MEASURE whether `MIXER FILL x y sx sy <duration> <tween>` is accepted on 2.5.0, per name.
      **20 Penner names ACCEPTED including `linear`; `ease` / `ease-in-out` / `cubic-bezier`
      REJECTED `403`. Curves sampled numerically; only `linear` matches CSS exactly (0.0 px).**
      (`design.md` §9.2)
- [x] 0.13 MEASURE what a cut costs the live sources. **6.9–17.9 ms, median 8.16 ms = 0.20 frames at
      25 fps, so the absence of an atomic `COMMIT` costs nothing visible.** (`design.md` §9.3)
- [x] 0.14 (optional) `CG ADD` → first painted frame. **Median 70.2 ms, 33.7–157.3 ms.** Demoted:
      Family 2 is eliminated so it decides nothing. (`design.md` §9.4)
- [x] 0.15 Enumerate whether any path still allows two multi-box templates on air together.
      **YES — `take()` and `restore()`, refused by nothing.** (`design.md` §8)
- [x] 0.16 State whether `live-source-multibox` §9b competes. **It does not, and adopting it later
      would not change this design's cost.** (`design.md` §10b)
- [x] 0.17 File UNIT B′ with its enumeration as this feature's PREREQUISITE. (`design.md` §6b)
- [x] 0.18 Handoff at `docs/handoff/2026-08-17-session-aq.md`, opening with the SHA read.

## 0b. Recon — the 2026-08-18 session (§12.9's candidate D) — COMPLETE

- [x] 0b.1 Read the tree at `dev` @ `fc663dc` (`git pull --ff-only`; `HEAD == origin/dev`).
      Anchors re-verified where re-cited; drift called out at the citation.
- [x] 0b.2 Does this codebase ever address a cg-layer other than `0`, and can it? **NO and NO.**
      `FLASH_LAYER = 0` is a module constant in all five CG verbs
      (`command-builder.ts:16,59,64,69,90,105`); non-zero cg-layers exist only in probes.
      (`design.md` §12.9.6 D-1)
- [x] 0b.3 🔴 MEASURE whether two templates can sit on ONE video layer at different cg-layers.
      **THEY CANNOT.** `CG ADD 1` is accepted (`202`) and REPLACES the page at cg-layer 0 — the
      first page dies (50/s → 0), `INFO` reports one `<foreground>` with one `html` producer, and
      both `UPDATE 0` and `UPDATE 1` are answered by the survivor. **The cg-layer argument is
      INERT.** ⇒ the "hole in the upper page" question is MOOT: there is no upper page.
      (`design.md` §9.6a, §12.9.6 D-2)
- [x] 0b.4 MEASURE the replace-on-one-layer gap. **118 ms median = 2.95 frames** (2.80–3.13, n=8),
      against the cut's 0.20 frames. The outgoing page dies ~22 ms after the command and does not
      wait for the incoming one. (`design.md` §9.6b)
- [x] 0b.5 Is the gap escapable? **`LOADBG [HTML]` + `PLAY` pre-warms and cuts with NO load gap
      (n=6) — and `CG UPDATE` still reaches a page seated that way.** But a layer has exactly ONE
      background slot: a second `LOADBG` DESTROYS the first pre-warm (proven-live 51.7/s → 0/s). So
      only ONE announced alternative is gapless; the others cost ~3 frames.
      (`design.md` §9.6c, §9.6d)
- [x] 0b.6 What does D cost §12.1's phase two? **All of it** — §0.2's "not expressible across two
      independent pages" is CITED, and strengthened: the pages cannot coexist on the layer at all.
      D would need candidate A built anyway. (`design.md` §12.9.6 D-4)
- [x] 0b.7 Where would a "group" live in R-028's declared-rows model? **At the root of a row's
      identity** (`stack.load` is one `templateId`; 80 references across 38 files). Assignment is
      keyed `(templateId, plateId)`, so **a group switch changes the key and assignment cannot
      survive** — the §3 disqualification, inherited. (`design.md` §12.9.6 D-5)
- [x] 0b.8 ⇒ **VERDICT ON D: REFUSED**, on four independent grounds, three of them measured.
      (`design.md` §12.9.6)
- [x] 0b.9 Is there any precedent for "a set of elements visible together as a state"? **The
      closest is a `sequence` of COMPOSITION items — the tree's only exactly-one-of-N primitive —
      and it is disqualified twice: `flattenElements` never descends into a `sequence`, and stamped
      scopes get an EMPTY mask map on purpose.** No precedent exists for a runtime-selected
      one-of-N sub-scene a Live Source can live inside. (`design.md` §12.9.7)
- [x] 0b.10 Per-layout backgrounds: what happens to a hidden `<video>`? **Nothing pauses it.** A
      `visible` binding writes `style.display` only; the video driver is lifecycle-driven. The MODEL
      needs no new concept; the RUNTIME does. **Needs measuring — 9.3.** (`design.md` §12.9.7)
- [x] 0b.11 What must the carrier become under A? **One rect per layout per plate.** The exporter
      already derives a rect through the full ancestor chain (`flat.rect`); it lacks a reason to do
      it more than once. 🔴 And an asymmetry was found: `collectLiveSources` has NO visibility
      filter while `sceneMaskHoles` does — **today a hidden plate is DECLARED but does not PUNCH**.
      (`design.md` §12.9.7, feeds 2.5)
- [x] 0b.12 Does a plate inside a NESTED COMPOSITION still punch correctly? **YES, verified** — the
      flattener's instance path and the builder's `maskKeyPrefix` are composed from the same parts
      (`scene-flatten.ts:250-292` / `scene-builder.ts:265,399`). The "no static scene-px rect"
      warning applies to STAMPED scopes (repeater rows, sequence items), not to composition
      instances. (`design.md` §12.9.8)
- [x] 0b.13 🔴 VERIFY §3b.4's `clip-path` interpolation lead on the plant's CEF. **VERIFIED** —
      Chromium 142; `path(evenodd,…)`, `polygon(evenodd,…)` and WAAPI all interpolate (9 distinct
      intermediates each). (`design.md` §9.6e)
- [x] 0b.14 MEASURE what the animated path COSTS in frames. **Interpolating three holes: −4 %
      (50.7 → 48.7 fps). Crossfading two full-frame backdrops: −10 % (50.5 → 45.6, worst gap
      120 ms). Both together: −29 %.** The background transition is the expensive half, not the
      mask. (`design.md` §9.6f)
- [x] 0b.15 Does `MIXER … OPACITY` take a duration and a tween? **YES, with FILL's exact
      vocabulary** — `linear`/`easeinoutquad` `202`, `ease`/`cubic-bezier` `403`; readback works and
      the tween was observed running. (`design.md` §9.6g)
- [x] 0b.16 Report the next free item number for §12.7's ledger item. **`B-145`** (and `B-146`,
      `B-147` for the two other pending B-items). **Nothing minted.** (`design.md` §12.7)
- [x] 0b.17 Handoff at `docs/handoff/2026-08-18-session-ar.md`, opening with the SHA read.
- [x] 0b.18 🔴 PROBE the owner's fade-the-MASK'S-LUMINANCE lead. **IT WORKS, and not by the obvious
      spelling.** `transition: mask-image` between two gradients **does NOT interpolate** (0
      intermediates); an `@property`-registered `<color>` feeding the gradient **does** (9
      intermediates). Cost **−3.4 %**, the cheapest animated thing measured. Grey→openness is
      **α ≈ grey ÷ 255** (mid-grey = half-open) — read through an SVG-mask **proxy**, so the CSS-path
      confirmation is owed (8.5). ⇒ the FADE mode leaves the `linear` rule's scope entirely.
      (`design.md` §9.6h, §13.5a)

## 1. THE ORDER — read this before picking anything up

**Every owner gate is answered.** This file is no longer gate-tracking; it is the plan. The order
below is **taken from `design.md`'s own ordering statements**, not from section numbering, and where
the design says something different from the obvious reading it is called out.

| #             | Stage                                                  | Why it is here, in the design's own words                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** ✅ DONE | **`B-145` — the ledger survives a bridge restart**     | §12.7: filed as a SEPARATE item that **must land BEFORE the switch ships**. It is also what makes stage D's reconcile trustworthy — a reconcile against a ledger that a restart silently emptied is a reconcile against a lie. **Persistence landed 2026-08-18 and defaulted ON 2026-08-19; its DISPLAY half (task 2.8) landed 2026-08-20 as the `LIVE SOURCES` tab** — `B-145` is `[x]`, and Stage E is unblocked                                                                                                                 |
| **B** ✅ DONE | **§12.6's exclusivity refusal**                        | ⚠ **NOT where the obvious reading puts it.** §12.1 says the two measured crosstalk symptoms are closed by exclusivity, but that §8's two doors — `take()` and `restore()` seating a SECOND multi-box template — _"are a different reachability and are closed by §12.6's refusal, **not by this phasing**"_. **It depends on nothing else in this file**: it is a predicate in two call sites. It is the cheapest closure of a measured on-air failure mode in the whole plan, so it goes early rather than waiting for the switch |
| **C**         | **UNIT B′ + the per-arrangement carrier, INTERLEAVED** | §6b: UNIT B′ is _"this feature's PREREQUISITE, not latent cleanup"_. §12.1: phase one _"must already build the per-arrangement geometry carrier (§7) and the mask recompute (UNIT B′, §6b)"_. ⚠ **They are one stage, not two:** 2.1 (resolved visibility) needs no carrier, while 2.2 (current geometry) cannot be written until the carrier exists to be read                                                                                                                                                                    |
| **D**         | **The reconcile (§4)**                                 | §4: ONE `reconcileLivePlates`, with `swapLiveSource` becoming a **caller** rather than a peer. Needs C's carrier to compute a desired set                                                                                                                                                                                                                                                                                                                                                                                          |
| **E**         | **The operator surface (§12.8)**                       | The toggles are what drives D. Needs D to have something to call                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **F**         | ⭐ **THE CUT SHIPS**                                   | §12.1: cut first, animation second. A–E is the whole of phase one                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **G**         | **The transition modes (§13.5)**                       | Phase two. §12.1: _"phase two then adds only the tween and its curve contract"_                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

⭐ **RE-KEYED 2026-08-19 — LOOKS adopted (`design.md` §14).** The stages stand, their subjects
change: C's carrier work is superseded by the LOOK carrier (phase 1), D's desired set becomes the
active look's `{routeKey → rect}`, E becomes the look picker + preset. §1b below is the phase
plan.

## 1b. THE LOOKS PHASES (2026-08-19) — and phase 2's DELETION CLAUSE

| Phase | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Session |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **1** | Schema (`looks` group, sources-once, preflights), the LOOK carrier, the runtime switch (visibility + re-punch), the pin tests — ✅ LANDED (`b47f3eca`); Linux `gate:e2e` DISCHARGED: <https://github.com/yasermostafaee/cg/actions/runs/32278566981> (attempt 2, `success`, `E2E (Playwright)` RAN — attempt 1 was killed at `timeout-minutes: 20` by an apt-mirror stall BEFORE Playwright started; the suite never ran and was re-run, not weakened)                  | **BA**  |
| **2** | The Designer UI swap: toolbar icon, looks inspector, per-look canvas, look picker in the preview — **AND THE A′ DELETION (below)** — ✅ LANDED (session BB, `5d56c5a5`; A′ DISABLED not deleted, P2.DEL re-scoped below); Linux `gate:e2e` DISCHARGED: <https://github.com/yasermostafaee/cg/actions/runs/32292697141> (`success`, `E2E (Playwright)` RAN — the prior run on `2ee11fe5` was RED from two spec defects, fixed at the cause in `5d56c5a5`)                | next    |
| **3** | Stage D's reconcile (§4) on the look carrier — ✅ **LANDED (session BC)**: `reconcileLivePlates` is the ONE delta, the take and `swapLiveSource` are both callers, §12.4's hold/teardown policy is named and observable. 6.7's bridge→page look transport ✅ **LANDED (session BD)** — a switch is now correct END TO END on air (fills and holes driven off one look id). ✅ Stage E's operator surface is UNBLOCKED — 2.8 (B-145's display half) landed in session BG | after 2 |

🔴 **PHASE 2'S DELETION CLAUSE — the two-spellings window is ONE session, closed by this task,
not by memory.** Phase 2 deletes, in the same session that swaps the UI: the arrangements schema
(`packages/shared-schema/src/arrangements.ts`, `Scene`/`Composition.arrangements`), the A′ carrier
(`collectArrangements`, `boxRelativeRect` + `relativeRect`, shared-ipc's `arrangements` field), the
runtime view (`packages/template-runtime/src/arrangement-view.ts`, `ArrangementView`,
`applyArrangementGeometry`, `setArrangementView`), the Designer surface (the arrangements slice,
`ArrangementCellOverlay`, `ArrangementsSection`, `ArrangementElementSection`, `ArrangementPicker`,
the `commitAnimatable` intercept, the `arrangedTransform` read sites, `scene-doc`'s projection,
`store-core.activeArrangementId`), and their tests (§14.4's table is the checklist — ~88 cases).
⚠ The deletion is a `[ ]` task so it cannot be skipped silently:

- [ ] **P2.DEL** — ⚠ **RE-SCOPED (owner, 2026-08-19): A′ was retired by DISABLING its entry
      points, not deleting its code** — session BB unmounted `ArrangementsSection`,
      `ArrangementElementSection`, `ArrangementPicker` and `ArrangementCellOverlay` and skipped
      their E2E spec, so authoring is LOOKS-only while the A′ code stays compiling and
      unreachable (a bug in the new surface cannot strand the owner). **This task is now the
      CODE DELETION**, due once the owner has authored a real template on the new path: delete
      the arrangements schema, carrier, runtime view, Designer machinery and tests per §14.4's
      DIES table, plus the disabled-but-present components above and the skipped
      `arrangements.spec.ts`.

🔴 **The one correction to make out loud:** a reading that puts exclusivity after the reconcile is
following section numbering, not the design. §12.1 explicitly says the phasing does **not** close
§8's doors. Stage **B** can land the day stage A does.

⚠ **`B-145` is stage A, and it is the only stage this change may not defer.** `R-057` records it as
BLOCKING.

---

## 2. STAGE A — `B-145`, the ledger survives a bridge restart

Full item: `docs/prd/bugs-runtime.md` → `B-145`. It carries the acceptance criteria and the two
candidate shapes.

- [x] 2.1 **Recon: what does the server's `INFO` actually expose?** MEASURED 2026-08-18 — per-layer occupancy, producer kind and that producer's parameters (and a layer drops out as soon as it is cleared), but **NOT the `itemId`, the symbolic `sourceId` or the fill/key `role`.** It also disproved `occupancy-tap.ts`'s claim that `INFO` returns no per-layer data on this build; that comment is corrected. Enough to re-derive the
      plate ↔ layer ↔ item mapping, or not?
      **Files:** none — a plant/mock reading.
      **Done when:** the finding is written into `B-145` and into the handoff, naming exactly what
      `INFO` carries and what it lacks.
      **Visual:** nothing visual — verify by reading the recorded `INFO` output.
- [x] 2.2 **Choose the shape from 2.1, not from preference.** **A + B, the named fallback** — the file supplies the names, the server the truth, and their reconciliation IS the ledger. `INFO` sufficient ⇒ **shape B**
      (reconcile against the server at boot, self-correcting in both directions, the shape the item
      recommends). `INFO` insufficient ⇒ the named fallback: **persist (shape A) PLUS a boot
      reconcile** for whatever `INFO` can confirm, **stating exactly what `INFO` lacked**.
      🔴 **Either way there is ONE AUTHORITY for "what is seated"**; the other is an input to it,
      never a second answer.
      **Files:** `tools/caspar-bridge/src/caspar-runtime.ts` (`#liveLayers`),
      `tools/caspar-bridge/src/live-layers.ts`.
      **Done when:** the chosen shape is implemented and the reason is in the code, not only in a
      commit message.
      **Visual:** nothing visual at this step.
- [x] 2.3 **Test: a restart with seated plates leaves them listed and controllable.** (`B-145`
      acceptance 1.)
      **Files:** `tools/caspar-bridge/tests/`.
      **Done when:** a test fails before the change and passes after — **rebuilt between the runs,
      and the report says it was.**
- [x] 2.4 **Test: the rebuilt ledger comes from ONE authority.** (`B-145` acceptance 2.)
- [x] 2.5 **Test: a producer that vanished server-side while the bridge was down is NOT asserted as
      seated.** (`B-145` acceptance 3 — the self-correcting direction, and the one a
      persist-only shape gets wrong.)
- [x] 2.6 **Tick `B-145`'s checkbox**, and update the cross-references that point at it — 8.2 below
      and `R-057`'s **BLOCKED ON** line.
      **Visual:** 🔴 **this is the one visually checkable step of stage A.** Take a row whose
      template declares Live Source plates, restart the bridge, and open the **layer list**: the
      seated layers must still be listed and still be controllable (clear / repoint) instead of
      vanishing while the producers stay lit on air.

- [x] 2.7 **Persistence is ON by default, and a test can TELL.** Landed 2026-08-19 (session AT).
      The first cut put the store behind a `liveLayersPath` option that nothing defaulted, so a
      station that never configured it still lost its ledger — and, worse, **every test passed
      either way**, which is the same written-but-unreachable class as `autoSqueeze` (`B-147`) and
      `resolvePlateAspect`'s `assumed` flag (`B-143`).
      **Files:** `tools/caspar-bridge/src/live-layers-store.ts` (`defaultLiveLayersPath` /
      `resolveLiveLayersPath`), `tools/caspar-bridge/bin/caspar-bridge.mjs` (the default, the
      `--no-live-layers` opt-out and the boot line), `tools/caspar-bridge/src/bridge.ts`
      (`BridgeHandle.liveLayers` provenance), `tools/caspar-bridge/tests/live-layers-default.test.ts`.
      **Done state:** saying nothing resolves to `~/.cg-runtime/bridge-live-layers.json` — the same
      convention as every sibling store — and OFF is reachable only by typing `--no-live-layers`.
      The default is applied by the CLI, not by `createBridge`, per the repo's own ruling that
      _"`createBridge({})` is not a station"_ (`tests/default-bank-boot.integration.test.ts:164`);
      a test spawns the real CLI so the WIRING is covered too, not just the resolver.
      **Visual:** the boot line — `[caspar-bridge] live layer ledger: …` — says which of the three
      states the station is in, because a bridge that adopted nothing and a bridge that is not
      persisting at all otherwise look identical from every screen.

- [x] 2.8 ✅ **LANDED 2026-08-20 (session BG) — `B-145` ACCEPTANCE 1'S DISPLAY HALF IS MET: the
      seated live layers are VISIBLE.** Traced 2026-08-19 (session AT), written down and deliberately
      not fixed there; fixed here.
      **What held already (no work needed):** the browser retains the stack intent and re-delivers
      it on every connect (`B-092`), so the row and its `itemId` survive the restart; the ledger is
      keyed by `itemId` (`tools/caspar-bridge/src/live-layers.ts:107`); and every teardown/repoint
      door reads `#liveLayers` by that key — `teardownLiveLayers`, the swap paths. So the row's
      existing verbs DO reach the adopted records.
      **What was missing, and what closed it.** Nothing displayed the seated layers AS layers:
      `CasparRuntime.liveLayers()` had **no production caller** and no `@cg/shared-ipc` channel
      carried the ledger. Now:
      **(a) a channel of its own** — `packages/shared-ipc/src/channels/liveLayers.ts`
      (`liveLayers.state` + `liveLayers.state-changed`). ⚠ NOT a widened `playoutLayersState()`:
      the band's exclusion from `#reservedLayers` is LOAD-BEARING, not an oversight
      (`live-layers.ts:18-26` — a reserved band is unplaceable, unreservable and unclearable), so
      the third ownership class got the third channel its own class list already implies.
      **(b) ONE projection** — `projectLiveLayers` in `live-layers.ts`, called by BOTH the pull
      (`CasparRuntime.liveLayersState()`) and the push, so the two cannot disagree about a row's
      shape or the list's order.
      **(c) push, not poll** — the `liveLayersChanged` emitter `B-145` already fires from the
      ledger's ONE write path now feeds `wirePublishes`; a seat, a release, a hold and the boot
      adoption all reach the browser by the call that persists them.
      **(d) the production caller, named:** `LiveSourcesPanel` →
      `apps/runtime/src/renderer/hooks/useLiveLayers.ts` → `liveLayers.state` → `bridge.ts:901` →
      `CasparRuntime.liveLayersState()` → `liveLayers()`. The accessor is no longer
      written-but-unreachable, and its doc comment says so.
      **(e) a THIRD TAB, not more rows in either existing one** — `LIVE SOURCES` beside `LAYERS` and
      `STATION LAYERS` (`LayersPanel.tsx`). Folding these into the station tab would have been the
      worst option available: its premise is "these are NOT our layers" and its clear is gated on a
      producer kind of exactly `html`, while a live plate is a `route`.
      **ADOPTED vs STRANDED — the distinction 2.8 asked for.** A row whose owning item the stack
      still carries is shown, NAMED with its template, and offers `OPEN ROW` (select + return to the
      list) — but no destructive control, because `layers.clear` refuses a live-source coordinate by
      name having weighed and rejected an exemption. A row whose owner is GONE reads **Stranded**,
      is the only row that wears a colour (amber = ATTENTION; green stays the layer table's ON AIR),
      raises the tab's dot, and offers `RELEASE` — which calls the EXISTING `stack.remove`, whose
      `teardownLiveLayers` is documented as unconditional on `slot` for precisely this case. No new
      coordinate-addressed clear was added.
      **Tests:** `tools/caspar-bridge/tests/live-layers-wire.test.ts` (17 — projection, ordering,
      push on seat/release/hold/adoption, the vanished-producer drop, and an END-TO-END boot that
      adopts a persisted ledger and serves it over the WebSocket) and
      `apps/runtime/tests/liveSourcesPanel.dom.test.ts` (18 — the gate both ways, the confirm, the
      link-down mask, and the tab dot reading the same rows the list renders). E2E:
      `apps/runtime/tests/e2e/live-source-layers.spec.ts`. Mutation-checked: dropping the sort, the
      `held` resolve, the push subscription, the link-down mask, the owned-row gate and
      `liveLayersState()` each redden the tests that name them.
      🔴 **ONE DEFECT WAS FOUND IN THIS WORK BY ITS OWN REVIEW, AND IT WAS THE DANGEROUS ONE.** The
      first cut decided STRANDED from `items` alone, ignoring `stackReady`. The ledger and the stack
      are two INDEPENDENT snapshots that land separately, so at mount and on every reconnect the
      ledger can arrive first — and every seated layer would have read _"Stranded — no row owns
      this"_ with a RELEASE button beside it, inviting the operator to cut a guest who was perfectly
      well owned by a row that had not been delivered yet. This renderer has paid for that exact
      class three times (`useBridgeSnapshot` names the b2 density bug, PVW’s white page, and
      `pruneDrafts` deleting every staged edit on remount) and its rule is explicit: _"any consumer
      that ACTS on the absence of an item must read this form and do nothing while `ready` is
      false."_ Fixed at the cause: blindness is a FIRST-CLASS state (`liveLayerBlindness` — the ONE
      place the link-down / stack-not-arrived precedence lives), the two blind states say different
      things, and neither raises attention. Pinned by five tests; reverting the guard reddens three.
      🔴 **A SECOND REVIEW PASS FOUND FOUR MORE, AND THEY ARE RECORDED BECAUSE THE PATTERN IS ONE
      PATTERN.** Every one is the same class as the first: a fact the console did not have,
      presented as a fact it did.
      **(i) The reconnect window — worse than the original.** `useBridgeSnapshot`’s `ready`
      _"latches on the FIRST arrival and never clears"_, so reading it was not enough: after any
      reconnect it stays `true` while the stack is `[]`, and a restarted bridge serves its FULL
      adopted ledger before the browser re-delivers a row. That is every layer STRANDED with
      RELEASE armed, in exactly the bridge-restart case this item exists for. Fixed by making an
      EMPTY stack its own blind state: it cannot tell "not delivered yet" from "nothing here", so
      it is evidence of neither. Costs one true positive (an operator who removes every row),
      which is the right way to be wrong.
      **(ii) The empty list asserted "no live sources seated"** with no readiness or link input —
      the one branch that speaks for the WHOLE list was the one that guessed. With the link down
      the hook never pulls, so a console with a dead bridge told the operator, definitely, that no
      guest was composited. Fixed with the ledger’s own `ready` flag and an explicit empty view.
      **(iii) RELEASE cleared EVERY layer the item owned while the confirm named one coordinate.**
      `teardownLiveLayers` loops over all of an item’s records, so releasing `1-10` also cut
      `1-11`. The confirm, the accessible name and the toast now all name the set `releaseScopeOf`
      returns; and the stranded verdict is RE-READ after the confirm’s unbounded await, so a
      verdict that expired while the operator was reading cannot authorise a teardown.
      **(iv) No `unverified` arm on the payload.** The channel header argued the shape from _"the
      ledger is resolved at boot against the server’s `INFO`"_ — false in the shipped bridge,
      which adopts with occupancy hard-coded to `unknown`. Nothing is ever dropped and EVERY
      adopted record is unconfirmed, so the omission was the one distinction that is always true
      after a restart, and the surface stated a file claim in the present tense. The wire now
      carries `unverified`, marked from the adoption’s own result and cleared on a first-hand
      write; the row reads _"Adopted — not confirmed"_ rather than _"On screen"_.
      ⚠ The mock also diverged: it released plates only on `remove`, while the bridge tears them
      down on `stop` and `out` as well — so test mode reported a guest on screen after a STOP.
      It now hooks the same three verbs.
      ✅ **Linux `gate:e2e` DISCHARGED:**
      <https://github.com/yasermostafaee/cg/actions/runs/32397521008> — head `0d24978a` (the commit
      carrying this work), `completed` + `success`, and the **`E2E (Playwright)` job RAN** rather
      than being skipped (its `E2E` step `success`, 17:25:38 → 17:35:27 UTC).
      ⏱ Was DUE BEFORE STAGE E (section 6). 🔴 **STAGE E IS NO LONGER BLOCKED.**

---

## 3. STAGE B — exclusivity (§12.6), which depends on nothing above

- [x] 3.1 **ONE canonical predicate** answering "is another item carrying a multi-box template
      already on air on this channel?" LANDED 2026-08-19 (session AT) as
      `#multiBoxItemOnAirOnChannel` + `#refuseSecondMultiBox` in
      `tools/caspar-bridge/src/caspar-runtime.ts`. Each of its three terms is answered by the
      thing that already owns it rather than re-spelled: **"on air"** by `isOnAirStatus`
      (`caspar-runtime.ts:310`, extracted for exactly this class of gate), **"on this channel"**
      by `#slots`, and **"multi-box"** by `#multiBoxCount` — the carrier's declaration length,
      `> 1`, since a box IS a plate (§0.5) and an arrangement only positions box INSTANCES. An
      `unknown` carrier counts as 0, the same call `#planLiveSeating` already makes and for the
      reason written in its header: such a template seats no plates at all, and refusing it
      would take a station's whole pre-carrier rundown off air on upgrade.
      ⚠ **It is NOT `deps.hasLivePlates`** (`apps/runtime/src/renderer/features/layers/layerRowActions.ts:655`)
      — that is a renderer fact about one row's template declaring plates. §12.6 offers it as the
      tree's nearest existing shape, not as the predicate. Reusing the name for a different condition
      is what golden rule 6 forbids.
      **Files:** `tools/caspar-bridge/src/caspar-runtime.ts`.
      **Done when:** the predicate exists once, and its name states the condition it tests.
- [x] 3.2 **CALL it from `take()` AND from `restore()` / `#decidePendingRestores`** — restore never
      passes through `take()` (§8), so there are two sites by necessity and **one predicate by rule**.
      **Done when:** both call sites call it; neither re-derives the condition locally.
      DONE 2026-08-19. Door 1 sits in `#takeImpl` immediately BEFORE `#planLiveSeating`, where a
      refusal still costs nothing — the plan resolves THIS item's plates while exclusivity asks
      about the on-air SET, and folding one into the other is how the answer to either stops being
      findable. Door 2 sits in `restore()`'s loop before `restoreItem`, gated on `isRetainedOnAir`
      (only a row coming back ON AIR can collide; a `loaded` or `cleared` multi-box row must still
      return, or the refusal would silently delete rows the operator can see — the B-108 hazard).
      🔴 `templateId` is a PARAMETER of the predicate rather than a reconciler lookup, because the
      restore door asks before the item exists there; a lookup would answer `undefined` at that
      site and leave the refusal present, wired, and DEAD on the door with no other cover.
      The refusal is legible at both: `stack.take` answers `multibox-already-on-air` + its
      `message`, and `restore` answers a new `RestoreSkip` reason carrying the same sentence in a
      new optional `detail` — the shape `stack.take`'s `message` already established, with the
      same "the specific one wins" rule, now enforced inside `restoreSkipReason` so no consumer
      can forget it.
- [x] 3.3 **A test per door**, including the restore door, which is the one that has no other cover.
      LANDED as `tools/caspar-bridge/tests/multibox-exclusivity.integration.test.ts` — 7 tests: one
      per door, three BOUNDARY cases (a single-box template is not refused; an item is never its
      own incumbent; a `loaded` row still restores), a proof that the refused restore mutates
      nothing, and one asserting **both doors produce the SAME sentence** — golden rule 6 asserted
      rather than asserted-about. 🔴 **Each door was mutation-tested independently**: disabling the
      restore door alone reddens 3, disabling the take door alone reddens 2, and neither disabling
      reddens the other door's test. Vitest transpiles from source per run, so no stale artifact
      sat between the runs.
      ✅ **LINUX `gate:e2e` DISCHARGED** for this stage — it touched two renderer files
      (`apps/runtime/src/renderer/features/layers/LayersPanel.tsx`,
      `apps/runtime/src/renderer/hooks/useRestoreSkips.ts`), so the classifier read
      `{kind: 'code', needsE2e: true}`. Discharged by commit `c0cb9c4c` on `dev`:
      <https://github.com/yasermostafaee/cg/actions/runs/32234265469> — `conclusion: success`,
      and its **`E2E (Playwright)` job RAN** (`success`, not `skipped`), which is the half that
      makes it a discharge rather than a green run that proved nothing about rendering.
      **Visual:** nothing visual — verify by attempting a second multi-box take and reading the
      refusal. Verbatim, as the bridge emits it:
      `exactly one multi-box template may be on air per channel: "three-box" (3 boxes, item "item-1") is already on air on channel 1 — take it off air first`

---

## 4. STAGE C — UNIT B′ and the per-arrangement carrier (ONE stage, interleaved)

> ⭐ **SPLIT INTO C1 / C2 (owner, 2026-08-19).** **C1 — everything that is schema or runtime —
> LANDED in session AU**: 4.1–4.6, 5.1, 5.2, and the SCHEMA halves of 5.4 and 5.5. **C2 — the
> Designer's authoring surface — LANDED in session AV**: 5.3, 5.6, and the CONTROLS for 5.4
> and 5.5. **Stage C is complete.**
>
> 🔴 **C2 found a defect in C1 that C1's own tests could not see.** `setArrangementView`
> re-punched the MASK and never moved the BOX — every C1 test asked where the HOLE was, and
> the geometry override feeds `sceneMaskHoles`, so they all passed against a canvas that
> never changed. `applyArrangementToNodes` is the missing half. The lesson is not "add a
> test" but _which_ test: C2's acceptance reads the rendered rect out of the preview iframe,
> so it asks the question the operator would.
>
> 🔴 **The split runs THROUGH 5.4 and 5.5, not around them.** Their fields had to land with C1
> because 4.1 cannot read a `hideDuringTransition` flag that does not exist; their controls
> belong to C2 because a UI built on a schema that is still moving is a UI built twice.
>
> ✅ **C1's Linux `gate:e2e` is DISCHARGED**: commit `1b05cf68` on `dev` —
> <https://github.com/yasermostafaee/cg/actions/runs/32241631336>, `conclusion: success`,
> with the **`E2E (Playwright)` job having RUN** (`success`, not `skipped`).
>
> ✅ **C2's Linux `gate:e2e` is DISCHARGED**: commit `b91bdc98` on `dev` —
> <https://github.com/yasermostafaee/cg/actions/runs/32247619454>, `conclusion: success`,
> with the **`E2E (Playwright)` job having RUN** (`success`, not `skipped`) — which is what
> makes it a discharge for a Designer UI change rather than a green run that proved nothing
> about rendering. It covers `apps/designer/tests/e2e/arrangements.spec.ts`.
>
> **Nothing in C1 is visually checkable** — no UI, no Designer control, no layer-list change.
> Its verification is the eleven-row mutator matrix (4.4) and the `sequence` refusal (4.6).
> The first visually checkable thing in this feature is C2's authoring surface.

### 4a. UNIT B′ — the mask must follow

- [x] 4.1 🔴 **ONE resolved-visibility function**, and give `sceneMaskHoles` its result instead of LANDED 2026-08-19 (session AU). `resolveVisibility` in the new `packages/shared-schema/src/visibility.ts` — a file whose whole content is that one decision. `sceneMaskHoles` calls it; so does the ancestry check 4.5 added.
      the scene's authored `visible` (`packages/shared-schema/src/scene-flatten.ts:354`).
      ⚠ **THIS IS THE D4 CONSTRAINT'S HOME (§13.7.2).** The function has **three inputs**: the
      authored `visible`, per-arrangement visibility, and the per-element
      **hide-while-transitioning** flag. **The flag is the third INPUT — never a fourth boolean read
      somewhere else.** A local `if (el.hideDuringTransition)` at the point of use is smaller and
      looks obviously correct in isolation; it is exactly the breach this task exists to prevent.
      **Files:** `packages/shared-schema/src/scene-flatten.ts`, `packages/template-runtime/src/`.
      **Done when:** one exported function, three inputs, and every consumer calls it.
      **Visual:** nothing visual — verify by the 4.4 test matrix.
- [x] 4.2 **Give `sceneMaskHoles` CURRENT geometry**, so a moved plate takes its hole with it. LANDED 2026-08-19 (session AU). `sceneMaskHoles(scene, view)` takes an `ArrangementView`; `applyArrangementGeometry` re-places the flattened scene through the fit affine, remapping `toScene` alongside `rect` so the hole is pulled back at the NEW position.
      ⚠ **Blocked on 5.1's carrier** — there is no per-arrangement geometry to read until it exists.
- [x] 4.3 **A re-punch pass after `update()`** in `@cg/template-runtime`, reassigning the mask LANDED 2026-08-19 (session AU). `repunchLiveSourceHoles` + `clearLiveSourceMask` in `live-source-punch.ts`, driven from `update()` and from the new `runtime.setArrangementView()`. Every element is registered as a punch target at build (not just the punched ones), so "had no hole, has one now" and "had a hole, has NONE now" are both reachable.
      properties on the existing nodes. Not a re-export: the mask is inline CSS on a live node
      (§6), and a runtime mask path already exists for stamped scopes.
      **Files:** `packages/template-runtime/src/runtime.ts`, `.../live-source-punch.ts`.
- [x] 4.4 **Cover every mutator in §6b's table with a test:** take, teardown, position override, LANDED 2026-08-19 (session AU) — `packages/template-runtime/tests/unit-b-prime-mutators.test.ts`, **eleven rows, sixteen tests** (the extra five are controls). ⚠ Rows 3 and 4 are answered on the OUTPUT side via `liveSourceFit`, not on the page: a position override / raster change moves the whole GRAPHIC and changes nothing inside the page, so the page mask must NOT follow and the bridge FILL/CLIP must. That is the row's finding, and both halves are asserted.
      resize, lifecycle range, retention restore, z-order reorder, arrangement switch, a `visible`
      binding, a `transform` binding, **and a background crossfade** (§13.3, conditional — only if a
      per-arrangement background is authored).
      **Done when:** eleven rows, eleven tests.
- [x] 4.5 **Answer AO's two inherited questions deliberately:** whether an **invisible ancestor** ANSWERED 2026-08-19 (session AU), in the mechanism. **Q1 — an invisible ancestor NOW suppresses the punch**: `FlatElement.ancestry` carries the layer + every container / composition instance, and `sceneMaskHoles` resolves each through the same one function. **Q2 — a hidden plate IS still declared**, and it is a decision now rather than a coincidence: written at `collectLiveSources` as _visibility governs the PUNCH, never the DECLARATION_, because a declaration is the plate SET that `(templateId, plateId)` is keyed to, and an undeclared plate cannot be HELD (§12.4) — only torn down.
      suppresses a punch, and whether a hidden plate is **declared while hidden**.
      🔴 **The tree's current answer to the second is an ACCIDENT, and 12.9.7 says so:**
      `collectLiveSources` has **no** visibility filter while `sceneMaskHoles` does, so today a
      hidden plate is **DECLARED but does not PUNCH**. Under §12.4 that is nearly the wanted
      behaviour — but keyed off the AUTHORED `visible`, not the arrangement state. **Make it a
      mechanism or change it; do not leave it a coincidence.**
- [x] 4.6 **Refuse a Live Source plate inside a `sequence`** — `flattenElements` never descends into LANDED 2026-08-19 (session AU). `liveSourcesInStampedScopes` in `scene-flatten.ts` — beside the non-descent that causes it — surfaced by the Designer preflight as `live-source-in-stamped-scope`. ⚠ The reason it must be REFUSED rather than documented is that the two failures CANCEL: nothing declares the plate and nothing punches it, so the page looks intact and the guest simply never appears.
      one (`scene-flatten.ts:264,274`), so such a plate declares nothing and punches nothing,
      silently.
      **Done when:** a preflight error exists with a test.

### 4b. The carrier and the authoring surface

- [x] 5.1 **Per-arrangement geometry in `@cg/shared-schema`** — an arrangement is an ordered list of LANDED 2026-08-19 (session AU). `packages/shared-schema/src/arrangements.ts` + `Scene.arrangements`. ⚠ The scoping note was VERIFIED at `bindings.ts:40` and holds: `x`/`y`/`scale` are bindable transform properties and `width`/`height` are not — so this is an OVERRIDE TABLE and not a binding, as the note recommended. No `count` field: the count IS `cells.length`, read through `arrangementCount`.
      cell rects for a count, and geometry lives on the box **INSTANCE** (A′, §12.9.10).
      ⚠ Note before scoping: `x`, `y` and `scale` are ALREADY bindable transform properties
      (`packages/shared-schema/src/bindings.ts:40`); it is `width`/`height` that are not. A
      per-arrangement **override table** read by the arrangement state is cleaner than widening
      bindings, and need not be a binding at all.
- [x] 5.2 **`collectLiveSources` emits ONE RECT PER ARRANGEMENT per plate** onto the declaration LANDED 2026-08-19 (session AU). `collectArrangements` + `LiveSourceDeclaration.boxRelativeRect`, assembled with the rest by `buildTemplateLiveSources`. **No `.vcg` format change.** 🔴 It carries CELLS plus a per-plate box fraction rather than 5.2's literal "one rect per arrangement per plate", because that shape is NOT derivable at import: cell order is the order LIT sources are seated, so which plate lands in which cell depends on the operator's toggles. The two pieces compose to exactly that rect at reconcile time (6.4); the reason is written at the mechanism.
      block on `TemplateInfo`, following `live-source-multibox` §1's carrier (derived once at import,
      the shipped `hasNext` precedent). **No `.vcg` format change** — the mask is computed at boot.
      **Files:** `packages/vcg-format/src/live-sources.ts`.
- [x] 5.3 **The Designer surface for authoring arrangements** — the list, the default per count, and LANDED 2026-08-19 (session AV). The **Arrangements section** in the right panel beside Playout (`ArrangementsSection.tsx`), the **active-arrangement selector in the canvas header** (`ArrangementPicker.tsx`), and per-element visibility + an override marker on the **timeline rows** (`ElementRow.tsx`). 🔴 The selector drives `runtime.setArrangementView()` through the preview iframe, and the E2E asserts the box's REAL rendered rect out of the iframe — which is how it found that C1's `setArrangementView` moved masks but never nodes (`applyArrangementToNodes` is the fix).
      the per-arrangement geometry. See the `designer-multibox-arrangements` spec.
      **Visual:** ⭐ **this one IS visual** — open the Designer, add a box composition, author a
      2-box and a 3-box arrangement, and switch between them in the preview.
- [x] 5.4 **D2's per-arrangement MODE + DURATION field**, in the same section as the arrangement list SCHEMA HALF LANDED 2026-08-19 (session AU) — `ArrangementTransitionSchema`, a DISCRIMINATED UNION so §13.5's and §12.2's measured rules are unrepresentable to violate: a cut carries no duration or easing, a move is `linear` only, a fade takes any easing (§13.5a moved it off the server side), and an OMITTED timing function cannot be expressed at all. ⏭ **Its authoring CONTROL is C2.**
      (§13.6.2). Per-arrangement is a **strict subset** of the deferred per-pair form, so the
      authored format does not have to change if per-pair is taken up later.
- [x] 5.5 **D4's per-element hide-while-transitioning flag** — authored beside the element, and wired SCHEMA HALF LANDED 2026-08-19 (session AU) — `hideDuringTransition` on `ElementBaseSchema`, wired as 4.1's THIRD input and read nowhere else. ⏭ **Its authoring CONTROL is C2.**
      as **4.1's third input**.
- [x] 5.6 **Preflight:** exactly one arrangement active at author time, and the `live-source-overlap` LANDED 2026-08-19 (session AV). ⚠ **The input swap was NOT the clean substitution the plan assumed, and the reason is structural:** the existing loop runs PER COMPOSITION DOCUMENT and `collectFlat` descends into containers only, never into a `composition` instance — so under A′, where each box IS an instance, two boxes are never flattened into one coordinate space and that loop CANNOT fire between them, with or without arrangements. There was nothing to suppress; what was missing was the check. Added as a per-arrangement pass over the SHARED flattener (`flattenElements` + `applyArrangementGeometry`), so the preflight and the canvas measure the same hole. The rule itself is unchanged. Five tests, including the ⭐ case that must be ACCEPTED (the same two plates in different arrangements) and a positive control.
      check applied **WITHIN** an arrangement, not across arrangements — today the loop is
      per-document (`apps/designer/src/renderer/state/live-source-preflight.ts:178`) and would not
      fire across them. ⚠ **The rule does not change; only its input does.**

---

## 5. STAGE D — the ONE reconcile (§4)

> ✅ **THE HALT IS LIFTED (2026-08-19): §14's gate was answered YES — LOOKS is adopted.** Stage
> D is **LOOKS phase 3** (§1b): the reconcile's mechanism is §4 unchanged; its INPUT is the
> ACTIVE LOOK's `{routeKey → rect}` from the look carrier (phase 1, session BA). Every
> "arrangement" below reads as "look" — rewritten where the difference is load-bearing, noted
> here where it is only vocabulary.

- [x] 6.1 **`reconcileLivePlates(itemId, desired)`** in `tools/caspar-bridge/src/caspar-runtime.ts`:
      seat / re-fit / release as a **DELTA** against `#liveLayers`, resolving through
      `resolvePlateAssignments` as the ONE resolver.
      **Done when:** one function, and the take path no longer seats plates its own way.
      ✅ **Session BC.** `desired` is the active look's `{routeKey → rect}`, resolved by the ONE
      `#desiredPlateRects` (a pre-LOOKS carrier answers from its declarations, so every caller
      downstream sees one kind of input). The reconcile is `#planLiveSeating` (DECIDE) +
      `#applyLivePlates` (SEND); `reconcileLivePlates` composes them. Door: `setActiveLook`.
- [x] 6.2 **Route the take's `#seatLiveLayers` through it**, preserving the all-or-nothing rollback
      and the "record before the send is awaited" rule.
      ✅ **Session BC.** `#seatLiveLayers` is GONE — the take calls the reconcile's two halves in
      the order its on-air constraints demand (DECIDE before the pre-roll `CG ADD`, SEND one
      command before the `CG PLAY`); collapsing them into the single-call form would move the
      refusal after the `CG ADD` had already replaced the stage. One planner, one applier, no
      third path. Rollback and record-before-await both preserved and still tested.
- [x] 6.3 **Make `swapLiveSource` a CALLER of it.** 🔴 **Do not build a second mechanism beside
      R-048's swap** — `swapLiveSource` already argues this case for itself one level down.
      ✅ **Session BC.** Its resolve/fit/`PLAY`/re-assert/re-ledger body is deleted; it validates,
      writes the prospective override (rolled back on refusal, so a refused swap still records
      nothing) and calls the reconcile. The REPLACE-with-no-CLEAR is now simply what "the seat
      changed" means. Bonus fallout: swapping a HELD plate now costs the wire nothing and lands
      when a look shows it.
- [x] 6.4 **Re-derive the fit PER LOOK.** A solo look changes a plate's aspect against its
      6-box rect, and because `MIXER FILL` **survives a producer swap**, getting this wrong is
      a **wrong crop rather than an obvious break** — the failure mode that does not announce
      itself.
      ✅ **Session BC.** The rect comes from the desired set, never from `declaration.rect` (which
      is the DEFAULT look's rect, so reading it would pin every look to the default's geometry).
      Asserted as a real crop, not just as "a command was sent": a 16:9 feed in a 1:1 hole must
      end up wider than its own mask and starting left of it.
- [x] 6.5 **The release policy for a plate with no cell in the target arrangement (§12.4):** HELD
      muted and idle by default; a source kind that cannot be held falls back to teardown as a
      **NAMED, observable** behaviour.
      ⚠ **Punch and seat are separate mutations here** — a held plate stops punching (or §1's
      crosstalk returns inside one template) while its producer stays seated on its band layer.
      ✅ **Session BC.** `live-plate-release.ts` — `canHoldLivePlate` (exhaustive switch, so a new
      producer form gets a compile error rather than inheriting "holdable") + `releaseLivePlate`
      returning the disposition WITH its sentence, announced on `livePlateReleased`. `media` is
      the kind that cannot be held: a clip held across a look runs to its end and comes back
      black. Seat/punch separation is representable — `LiveLayerRecord.held`, additive and
      persisted, because the un-hold path re-asserts the plate's volume off it.
- [x] 6.6 **A test per inverse in §4's audit table** — plate set, mask, fit, layer allocation.
      ✅ **Session BC.** `tools/caspar-bridge/tests/live-look-reconcile.integration.test.ts` —
      four `INVERSE n/4` tests, plus the 6-box fixture and the position-only / size-only / both
      axis trio. 🔴 The bridge cannot assert a PUNCHED hole (that is the page's half and the
      transport is not wired — see 6.7 below); what it asserts is the layer's own mask —
      `MIXER … CLIP` — which comes from the same geometry as `FILL`.
      **Linux `gate:e2e` DISCHARGED:** <https://github.com/yasermostafaee/cg/actions/runs/32323670161>
      — commit `1f76edb0` (the commit carrying Stage D), `completed` + `success`, and the
      `E2E (Playwright)` job RAN (02:10:21 → 02:19:03 UTC, its `E2E` step `success`; the only
      skipped step is the browser install, a cache hit). The classifier scored this diff
      `kind=code needsE2e=true` — `tools/caspar-bridge/**` is not on the known-non-render
      list, so it falls to the safe direction and the debt was owed and paid rather than
      argued away.
- [x] 6.8 **THE ADVERSARIAL REVIEW OF STAGE D, and the defects it found.** ✅ **Session BC**
      (`868a8cfc`). Five independent lenses over the diff, then two skeptics per finding; 1
      critical + 11 major/minor survived refutation and were fixed at the cause, each with the
      reproduction turned into a test.
      🔴 **The one worth remembering: a HELD plate's layer was offered as a FREE layer.**
      Before LOOKS, "every layer this item's ledger names" and "the layers this plan is
      re-seating" were the SAME SET — a take seated every declaration — so the cheaper
      spelling was correct by accident. Holding a record broke that invariant silently, and
      the symptom hid itself: the arriving plate's `PLAY` destroyed the held producer, and on
      the way back the stale record still matched layer+producer so `seatUnchanged` fired and
      nothing was re-played. **An invariant that is true by accident is the thing to write
      down, because the change that breaks it will not look like it is touching it.**
      The other cluster was one root cause seven times over: the `'live'` failure branch
      decided from "did this PLATE have a prior record" rather than from what actually reached
      the SLOT. Both axes it needed — same-slot, and did-the-`PLAY`-land — are now single
      evaluations gating both the destructive step and the ledger entry.
      **Linux `gate:e2e` DISCHARGED for the FIX:**
      <https://github.com/yasermostafaee/cg/actions/runs/32349777373> — commit `9caa49e0`
      (contains `868a8cfc`), `completed` + `success`, `E2E (Playwright)` RAN (its `E2E` step
      `success`, 08:38:11 → 08:47:06 UTC). 🔴 `1f76edb0`'s own green run
      (<https://github.com/yasermostafaee/cg/actions/runs/32323670161>) is real but it
      verified a tree carrying the held-layer defect — do not cite it as this stage's
      discharge.
- [x] 6.7 ✅ **DONE (session BD)** — the bridge→page look transport. **The gap it closed:** a look
      switch is TWO mutations on two machines — the bridge moves the producers' `MIXER FILL`/`CLIP`
      (6.1) and the PAGE flips which look's instance is visible and re-punches its holes
      (`@cg/template-runtime`'s `setActiveLook`, phase 1D) — and NOTHING carried the look id
      between them. On the plant a switch moved the FILLS while the page kept punching the
      OUTGOING look's HOLES: fill at the new geometry, hole at the old. The DEFAULT look was fine
      (page enters it at build, bridge seats it at take); the break was specific to a SWITCH.
      **How:** the look id rides the same `CG <ch>-<layer> UPDATE 0 "<json>"` payload the author
      fields already use — the one verb proven on 2.3.2 to deliver JSON to `window.update` intact
      — under the reserved key `__cg` (`CG_CONTROL_KEY`, `@cg/shared-schema/control-payload.ts`).
      ONE codec, imported by BOTH halves, so the fills and the holes are driven off the same id
      and cannot diverge (§6/§12.2's rule applied to the switch).
      **Collision-proof, because a field id is `z.string().min(1)` and the Designer only trims
      what the author types — so there is no character class an author cannot reach.** It is made
      true twice instead: the page STRIPS the key before anything applies field values (control
      data can never become a field value, true even for a hand-edited scene), and the export
      REFUSES a scene declaring that field id or namespace name (`reserved-control-key`, an
      error, so it blocks). Unrepresentable rather than unlikely.
      **The look id ALONE suffices — verified in the code, not assumed.** Under LOOKS a look's
      titles/decor live inside its own composition INSTANCE, and `applyArrangementToNodes` sets
      `display:none` on the whole instance node, so switching the look switches its titles for
      free. The old A′ note that titles needed a per-source→cell mapping was true of ARRANGEMENTS
      (repositioned instances sharing one title set); it does not carry over. No mapping is sent.
      **Order:** fills first, then the page — and only on SUCCESS. A refused reconcile leaves the
      fills where they were, so telling the page anyway would paint the new look's holes over
      producers still at the old geometry, which nothing would repair. Both commands go
      back-to-back on ONE connection in the urgent lane; the mismatch window is one AMCP
      round-trip (`CG UPDATE` → `window.update` measured 2.2–8.3 ms, §9.2 — under a quarter of a
      20 ms frame at 50i; the cut is ~0.20 frames, §9.3), and what shows through the mismatched
      hole for that window is black.
      **The same gap by a different verb, also closed:** the `CG ADD` payload carries the look at
      the ONE `#sendAdd` chokepoint. A fresh build enters the AUTHORED DEFAULT synchronously,
      page-side, while the bridge seats the RECORDED look — so a row switched to solo and then
      re-taken (`out` destroys the producer; the take re-ADDs) came back with fills on solo and
      holes on the default.
      **Tests:** `packages/shared-schema/tests/control-payload.test.ts` (the codec round trip, and
      that a malformed control object is tolerated rather than thrown on — a throw inside the
      page's `update()` takes the graphic off air); `looks-switch.test.ts` §6.7 (the page applies
      the payload; holes asserted POSITION AND SIZE together; a DISJOINT-membership switch where
      the outgoing and incoming looks share no source; unknown/absent id leaves the look
      standing); `live-look-reconcile.integration.test.ts` (the emitted payload PARSED off the
      wire, not merely "a command was sent"; the fills-before-page order; a refused switch tells
      the page nothing; the `CG ADD` payload); `exporter-vcg-preflight.test.ts` (the refusal).
      ⚠ **What no test here covers:** a single-process true end-to-end. `@cg/template-runtime`
      cannot import `tools/caspar-bridge` (packages must not depend on tools), so the two halves
      are asserted separately — against the ONE shared codec, which is what makes divergence
      impossible. The remaining seam is the plant's SDI output, a later measurement (`PRINT`
      needs the plant's own disk, §9.3).
      **Linux `gate:e2e` DISCHARGED:** <https://github.com/yasermostafaee/cg/actions/runs/32356923837>
      — commit `bc862a78`, `completed` + `success`, `E2E (Playwright)` RAN (its `E2E` step
      `success`, 10:02:37 → 10:13:40 UTC). Classifier scored the diff `kind=code needsE2e=true`
      — the page/render engine is touched, so the debt was genuinely owed and paid.

---

## 6. STAGE E — the operator surface (§14.5 — the look picker; supersedes §12.8's toggles)

> ⚠ **REWRITTEN 2026-08-19 (LOOKS adopted, §14).** D1's toggle-per-source is superseded — with
> per-slot preset, toggles no longer carry the combination; the LOOK does (§14.5, the second
> reversal). What §12.8 decided UNDERNEATH both reversals still binds: always visible,
> state-carrying, no menu, placement (ii), survives density.

- [x] 7.1 ✅ **LANDED 2026-08-21 (session BH) — THE LOOK PICKER IS ON THE ROW.**
      `LookPicker.tsx`: one segment per authored look, exactly one marked `aria-pressed`,
      one press to switch. It IS the readout and the switch in one object, so there is no
      third state in which they could disagree. One-of-N by construction — no "none"
      entry, so all-off stays STOP/CLEAR’s job and is unrepresentable here.
      **The seam:** the segment sends `stack.set-active-look` (new channel) → the bridge’s
      `setActiveLook` → `reconcileLivePlates` moves the FILLS → the page is told on the
      `CG UPDATE` payload so it moves the HOLES. Nothing else switches a look.
      **The readout:** `StackItemState.activeLookId`, published through the bridge’s ONE
      resolver (`activeLookId()` → pick, else authored default, else first look), so the
      picker shows what the bridge would actually enter rather than a second derivation.

- [x] 7.2 ✅ **LANDED — placement (ii), a second line spanning `1 / -1`.**
      `gridColumn: 1 / -1` and never a numeric end: the column COUNT changes with density
      (the template column drops at compact/tight). Because a spanning child adds no
      column, `VERB_COUNT` stays 6, `gridTemplateColumns(density)` is untouched,
      `minWidthFor` sums the same columns, and the header words stay above their own
      glyphs. The strip itself is `overflow-x: auto; min-width: 0`, so an unusually long
      look list scrolls INSIDE the line instead of widening the grid and clipping a verb.
      ⚠ **The SHAPE RULE does not govern it, and that is stated rather than implied:** the
      rule is about the verb block, and the picker is outside it. It IS conditional (only
      look-bearing rows have one), which a reader assuming the rule applied would call a
      violation.

- [x] 7.3 ✅ **LANDED — preset-then-take, composed from shipped pieces rather than a second path.**
      The mechanism was already there and §14.2 named it: a source ABSENT from the active
      look is HELD (§12.4), so pointing it at a different feed with `swapLiveSource`
      records the override and **sends nothing** — there is no visible plate to move. It
      goes live at the moment of the switch, carrying the preset source. That is
      preset-then-take, and it needed no new deferral machinery.
      Pinned both ways in `look-picker-operator.integration.test.ts`: a preset on a HELD
      plate reaches an empty wire; a preset on a VISIBLE plate moves immediately (that one
      is `R-048`’s live path, and conflating them would have been the error).

- [x] 7.4 ✅ **LANDED — a fresh take enters the authored default and the picker says so.**
      `#published()` publishes the RESOLVED look, not the raw pick map, so a row nobody has
      switched still shows its default rather than leaving the picker with nothing marked —
      which is most rows, most of the time.

- [x] 7.5 ✅ **LANDED — ONE trigger: `looks-none-authored`.**
      `#refuseNoLooksAuthored` at the take door, beside `#refuseSecondMultiBox`. A group
      that authors zero looks resolves NO rects, so nothing seats and the row would go to
      air as the background alone behind holes that never fill.
      🔴 **ABSENT IS NOT EMPTY, and the distinction is real rather than assumed:**
      `buildTemplateLiveSources` spreads `looks` only when the scene HAS a look group
      (`collectLookCarrier` returns `null` otherwise). So `undefined` = pre-LOOKS or the
      arrangement carrier — never refused — and `[]` = a group authoring none. Gating on
      length alone would have taken every pre-carrier rundown off air on upgrade. Both
      directions are tested.
      §12.6’s exclusivity refusal also reaches the operator legibly now: it had NO sentence
      in `errorCodeMessage` and surfaced as `Not accepted (multibox-already-on-air).`

- [x] 7.6 ~~D3's immediate-CUT escape~~ **RETIRED (2026-08-19), and CONFIRMED still retired
      2026-08-21 (session BH):** the switch itself IS the immediate action — asserted, not
      assumed, in `look-picker-operator.integration.test.ts` (“THE CUT IS THE ONLY MODE”: every
      fill a switch emits carries no duration and no tween). Taking the row OFF air stays the
      STOP/CLEAR verbs’, always present in the verb block. v1 is cut-only (§14.4 parks D2's
      other modes), so there is no mode to escape to. Returns with the animated phase if it returns
      at all.
- [x] 7.7 ✅ **LANDED — the Inspector names the LIVE PATH.**
      The "takes effect at the next take" sentence existed; what §12.5 also required was
      naming where the live control is. It now says to use the row’s SOURCE verb, and that
      it patches this row only.

- [x] 7.8 ✅ **LANDED — an active `sourceOverride` is visible outside the swap dialog.**
      `onAirPlateSource` in `livePlates.ts` — beside `appliedPlateSources` and deliberately
      NOT folded into it: that one answers "what is this template CONFIGURED to use" and is
      the baseline a draft is dirty against, so folding the override in would make a patched
      row read as permanently dirty against its own template. Two questions, two functions,
      each doc’d with which is which.
      The LIVE PLATES row now shows `on air: <source> (patched on this row)` in the ATTENTION
      amber. §12.5 refused to ship its wording without this: telling an operator when a
      change lands while showing them the wrong current value is a half-repair.

---

> ✅ **Linux `gate:e2e` DISCHARGED for Stage E (7.1–7.8):**
> <https://github.com/yasermostafaee/cg/actions/runs/32424237246> — head `0b6da499` (the commit
> carrying the picker AND the eight review/CI fixes), `completed` + `success`, and the
> **`E2E (Playwright)` job RAN** (its `E2E` step `success`, 22:37:28 → 22:46:35 UTC).
>
> ⚠ It is the RETRY of that run that is green. The first attempt failed on
> `apps/designer/tests/e2e/video-import.spec.ts:291` — a KNOWN, open, unexplained flake recorded
> at `docs/prd/platform.md`, now with its third occurrence and two of three on that same line.
> The commit touches no designer, vcg-format or video code at all. **A retry is a legitimate
> discharge only because the run that discharges it is a COMPLETED GREEN one whose e2e job RAN;
> the red attempt is recorded rather than hidden.**

- [x] 7.9 ✅ **FIXED AT CAUSE (2026-08-21, session BI) — A REFUSED SWITCH NOW LEAVES NOTHING.**
      Found by reviewing Stage E (session BH), fixed here on the owner's ruling _"fix it at
      cause, even if that changes `R-048`'s shipped on-air behaviour"_.
      **The mechanism was reported correctly** — verified against the code before touching it:
      `setActiveLook` wrote `#activeLooks` before the reconcile and kept the write through
      every refusal; `#desiredPlateRects` resolves from that map; `swapLiveSource` reconciles
      against `#desiredPlateRects` and sends no `updateLook`.
      **THE FIX — one writer, and the write is a side effect of the telling.** `#activeLooks`
      is no longer "what the operator asked for" but **"which look the page is punching"**, and
      the only ways to write it are `#tellPageLook` (the record happens after, and only after,
      the `CG UPDATE` lands) and the two cases where there is no page to disagree — an off-air
      row with nothing seated, and a row whose producer is gone, both of which re-enter through
      `#sendAdd`, which puts the look in the `CG ADD` payload unconditionally. The prospective
      look now travels as an ARGUMENT (`#desiredPlateRects(itemId, look)`) instead of through
      shared mutable state, so a refused switch has nothing to roll back — there is no rollback
      to forget at the next call site.
      🔴 **`R-048` IS UNCHANGED, and that is the finding rather than a shortcut.** The
      anticipated fix — make `swapLiveSource` carry an `updateLook` too — was considered and
      REJECTED at the site, in a comment: it treats the symptom (the swap reads state that can
      no longer be wrong), and it would put a new failure mode on the emergency verb, which
      would have to either fail a swap that succeeded or ignore a send — the seed of the next
      divergence. The cause was upstream of `R-048` the whole time.
      **The sweep (§2.4): `setActiveLook` was the ONLY write-before-refuse path in the file.**
      Both take-door refusals (exclusivity, no-looks-authored) and both restore-door refusals
      refuse before mutating anything; `setPosition` and `setPlateVolume` refuse before writing;
      `swapLiveSource` writes `#sourceOverrides` early but explicitly rolls back. So the rule
      was kept everywhere except here — this was the deviation, not the pattern.
      **Superseded text replaced, not left standing:** the assertion in
      `live-look-reconcile.integration.test.ts` that "the look stands" after a failed switch now
      asserts the opposite with the reason; `setActiveLook`'s header no longer claims the page
      transport does not exist (6.7 landed it); that file's header no longer says the same; and
      `LookPicker`'s re-press note is re-argued — a re-press is now the REPAIR for a switch
      whose `CG UPDATE` was refused, because it reconciles the fills back onto the look the
      holes are on.
      Tests: three in `live-look-reconcile.integration.test.ts`, all mutation-checked (restoring
      the old write reddens each — and the swap in the first one fails outright with `amcp-404`,
      which is the defect itself).
      **What the defect looked like, kept as history.** `setActiveLook` USED TO record the look
      before the reconcile and keep it when the reconcile refused — BC’s deliberate decision,
      and a defensible-sounding one: _“the look is what the operator asked this row to show; a
      failed AMCP send is a fact about the wire.”_ The argument was wrong about what the map IS.
      A switch was refused (disconnected, say) and the operator was told; later they swapped one
      source; the FILLS moved to the refused look while the page went on punching the OLD look’s
      holes — a designed layout with the boxes in the wrong holes, arriving from an action that
      never mentioned looks. ⚠ The argument’s other half — _“rolling the intent back would leave
      the next take entering the OLD look with nothing anywhere saying why”_ — INVERTS once the
      picker exists: the segment not moving is the loudest possible statement that the switch did
      not happen, and it was the OLD behaviour that said nothing, marking a look the air had never
      entered.
      **Why it was Stage E’s to file.** The sequence was unreachable before the picker:
      `setActiveLook` had no operator caller at all, so no one could refuse a switch and then
      swap. The picker made it reachable.

- [ ] 7.10 **The OPERATOR TOGGLE over the hidden-look pause policy — the half `B-150` deliberately
      did NOT build.** The owner wants pausing a hidden look's media to be operator-selectable;
      `B-150` implemented the BEHAVIOUR (silence unconditionally, pause on leave, resume in place)
      and factored the seam, but added no policy field, config key or API, because an option
      nothing reads is the written-but-unreachable class this repo has filed repeatedly.
      **The seam, named so this does not have to be rediscovered:** `LookMediaPark` in
      `packages/template-runtime/src/look-media.ts`. The toggle becomes a constructor option there
      and governs the PAUSE half of `#park` alone.
      🔴 **The SILENCE half is not a policy and must not become one.** It is a separate act from
      the pause precisely so that an installation that opts to keep hidden looks DECODING still
      emits no audio from a picture that is off screen. A toggle that reached the mute would be the
      one change here that can put sound on air.
      ⚠ And it must not reach the two exclusions either: content that gates a HOLD is never paused
      (a paused driver never completes, so the graphic would never come off air), and clocks are
      never parked at all. Both are correctness, not preference.

- [x] 7.11 ✅ **LANDED 2026-08-21 (session BM) — PER-LOOK INPUT BINDING, AND THE SEAT MOVED ONTO THE
      INPUT (`design.md` §12.9.1b, reversing Q2).**
      **Linux `gate:e2e` DISCHARGED** — completed, green, `E2E (Playwright)` RUN (not skipped) on
      every commit that carries the change:
      [`84a19d1f`](https://github.com/yasermostafaee/cg/actions/runs/32472531598) ·
      [`2715fd07`](https://github.com/yasermostafaee/cg/actions/runs/32478994421) ·
      [`37d19591`](https://github.com/yasermostafaee/cg/actions/runs/32481985379). A seat is now one producer per DISTINCT RESOLVED
      INPUT per item, resolved for EVERY look by `tools/caspar-bridge/src/live-look-bindings.ts`;
      the seat set is the union across looks, so an input bound only to a look nobody is showing is
      seated, muted and PARKED, and entering that look is a `MIXER FILL` with no `PLAY`.
      **The writer is `swapLiveSource` with an optional `lookId`** — absent is `R-048`'s emergency
      patch (every look, and it outranks the per-look map, because a dead input is dead everywhere);
      present is the deliberate composition. Two refusals at the assignment door: §6.2's
      `live-source-duplicate` (two frames of one look on one input — which the export preflight
      cannot see, and which the shipped code answered by seating one route TWICE) and §2.7's
      `live-source-no-layer` (presetting now raises layer demand).
      ⚠ **`#multiBoxCount` re-confirmed and deliberately NOT changed.** It counts DECLARATIONS
      (`liveSources.sources.length`) and its own anti-drift comment says why exclusivity is a
      property of what a template CAN put on a channel. It is **not** a layer-demand proxy, and
      under (B′) it must never become one: seats can now EXCEED declarations (one hole bound to two
      inputs in two looks is two seats).

- [ ] 7.12 **STAGE 2 — the INSPECTOR's per-look input list, and the ATOMIC UPDATE. DEFERRED by
      session BM under its own stop rule; the model beneath it is landed and green.** What is
      missing is only the surface: the Inspector still shows ONE flat `{plate → source}` list, so
      the per-look bindings 7.11 built are reachable from the bridge contract and from CG Control's
      swap dialog, but not yet from a panel that shows 2-box's inputs and solo's inputs at once.
      **What Stage 2 needs, so it is not re-derived:**
      (a) the LOOKS LIST in the Inspector with a per-plate input row under each look, replacing the
      flat list — `apps/runtime/src/renderer/features/inspector/livePlates.ts` is where the flat one
      resolves today, and it already reads `sourceOverride`; the per-look map arrives beside it on
      `StackItemState.lookSourceOverride`;
      (b) the LIVE look made unmistakable in that list (the operator is editing an on-air look and
      an off-air look in one panel), following the existing status-colour discipline — do NOT borrow
      the layer table's green;
      (c) dirty through `B-139`'s existing boolean, never a second one;
      (d) the panel's _"Set for the template, not this row"_ wording corrected — it describes only
      the DEFAULT column once the list is two-level;
      (e) ONE `UPDATE` applying staged texts AND staged bindings, fills-first-page-last-and-only-on-
      success (BD), with a failed reconcile leaving NO staged state behind (`tasks.md` 7.9's rule,
      which this adds a second writer to).
      🔴 **The atomicity is the part with a real trap in it.** The bridge's binding writer is
      per-call today (one `swapLiveSource` per frame), so a panel that loops over staged edits would
      apply them one at a time and could land half of them. Stage 2 needs either a batched channel
      or an explicit statement that partial application is acceptable — it is NOT, on air.

- [ ] 7.13 **The TITLE that travels with the INPUT — deferred, with the cost answered as a fact
      rather than a feeling (`§7.1`).** The owner: _"later we also need the text tied to each to
      move with the input, so the operator isn't constantly retyping."_
      🔴 **Deferring costs NO re-authoring, and this was checked in the code, not assumed.**
      `BindingTargetSchema` (`packages/shared-schema/src/bindings.ts`) is a
      `z.discriminatedUnion('kind', …)`, so a new arm is purely additive — every authored template
      parses unchanged, because no existing document carries the new `kind`. The precedent is
      `live-source-id` itself: it was ADDED to this union and resolves entirely OUTSIDE the DOM (its
      `applyOne` arm is a documented no-op, like `clock-target`), which is exactly the shape a
      "show this input's name" target needs. So a title shipped now as a free-typed per-look text
      element is upgraded later by adding ONE binding to ONE element — an author action per title,
      never a re-authoring of the template, and nothing already built is invalidated.
      ⚠ **What it needs when it is built:** a display name on the catalog entry (already there —
      `SourceDefinition.name`), a new binding target kind, the Designer UI to author it, and
      resolution per look in the runtime. That is a Designer + schema + runtime piece, which is why
      it is not folded into 7.11.
      🔴 **AND THE EXPOSURE THIS SESSION ADDS, stated plainly (`§7.3`).** Per-look binding is a NEW
      way to make a hand-typed title wrong: an operator can now re-point a frame in one look without
      touching the text under it, so a stale name can reach air under a guest's face. Nothing in
      7.11 makes that observable. Until 7.13 lands, that is a real and un-mitigated hazard, and it
      is the strongest argument for building it sooner rather than later.

- [~] 7.14 **STAGE 2 — the Inspector's per-look inputs, and ONE atomic UPDATE (session BM-2).**
  `LOOK INPUTS` lists each look with its own per-plate input, the LIVE look marked, sitting under
  the template DEFAULT it falls back to. `stack.update` gained `lookBindings` — the row's
  COMPLETE map — so one press carries the texts AND the inputs and the bridge applies bindings →
  reconciles fills → tells the page, refusing the WHOLE update if the bindings are refused.
  **§2's masking hazard is closed:** an emergency patch is named on every row it masks, the
  masked value is struck through and labelled _"not in force"_ (never greyed — grey reads as
  disabled), the control stays editable and says what it waits for, and CLEAR PATCH sits on the
  row that shows the patch.
  ⚠ **The template ASSIGNMENT is deliberately still its own call.** It is a different level with
  a template-wide blast radius; folding it into one row's update would be the scope confusion the
  panel's wording exists to prevent. What is atomic is what reaches AIR on THIS row.

- [ ] 7.15 🔴 **`B-155` — THE SWITCH FLASH. OPEN, AND NOTHING ABOUT IT IS VERIFIED ON THE PLANT.**
      The owner, on air: _"change `l-1`'s source and press look-1, then when we go to solo it shows
      the OLD source for a moment and then switches to the new one."_
      **The mechanism is established from the code and pinned on the wire** (`live-look-reconcile`,
      _"an assignment change LURKS…"_): `setSourceAssignments` does not reconcile, so the change
      lands at the next reconcile from any cause — a look press — which puts a producer change
      INSIDE a switch, and that is what flashes.
      🔴 **DO NOT READ THE GREEN SUITE AS A FIX.** `@cg/amcp-mock` models `PLAY` on an occupied layer
      as an in-place replace, which `swapLiveSource`'s own doc marks **UNVERIFIED on 2.3.2 (task
      6.9a)** — the flash IS that replace's timing, so the mock cannot see it. And whether `FILL` and
      `CLIP` land on the SAME FRAME is open (`design.md` **§3b**: `MIXER … DEFER` + a channel-scoped
      `COMMIT`, forbidden until the COMMIT-scope question is answered).
      **The probes this waits on: `6.9a` and `§3b`.** Also owed: the FRAME COUNT at 25 fps,
      reproduced twice, channel read EMPTY before and after — a plant measurement this session could
      not take.
      **The rule, decided so it is not re-litigated:** the new look's hole must NEVER show the
      previous source; if the incoming producer is not ready, BLACK is acceptable and the previous
      guest is not. That does not contradict `B-126`, whose case is the opposite trade (a dead feed
      vs black, where black is worse).

- [ ] 7.16 🔴 **The LOOK press is still a SECOND APPLY PATH for the template assignment — NOT DONE.**
      The two BINDING writers were collapsed onto ONE function, `#applyBindingTransaction`
      (`update` and `swapLiveSource` are its only callers, verified by sweep). The assignment was
      not: `setSourceAssignments` writes without reconciling and `setActiveLook` reaches
      `reconcileLivePlates` directly, so a look press still applies a lurking assignment.
      ⚠ **The repair is to COLLAPSE, never to make two paths agree** — the same class as this
      change's own four-level precedence, which was implemented twice and survived review precisely
      because the two copies agreed. Two candidate collapses, neither costed yet: reconcile the
      affected rows at `setSourceAssignments` (template-wide blast radius, on-air), or stop the
      Inspector staging assignment edits for a row that has looks, so the on-air panel writes only
      per-row state. **Deciding between them is an on-air behaviour change and deserves its own
      session.**

- [ ] 7.17 **The stale TITLE binding — DEFERRED by BM-2's patch §C, which is explicit that the flash
      outranks it.** Everything `tasks.md` 7.13 records still stands: deferring costs no re-authoring
      (`BindingTargetSchema` is a discriminated union; `live-source-id` is the precedent for a target
      resolving outside the DOM), and the exposure it leaves is unchanged — a per-look re-point is a
      new way to make a hand-typed caption wrong, and nothing yet makes that observable.

## 7. STAGE F — the CUT ships. STAGE G — the transition modes (§13.5)

- [ ] 8.1 **KEEP the v1 `live-source-animated` refusal** and pin it with a test that a runtime
      arrangement change does **NOT** trip it while an authored keyframe still does (§2b).
- [ ] 8.2 **Implement the chosen curve on both sides (§12.2): `linear`.**
      🔴 **Scope: PLATES only** (§13.2). Backgrounds, titles and any other page-only content take any
      easing and any duration — they have no server counterpart and therefore no second clock.
- [ ] 8.3 **A contract test computing the MAX DEVIATION** between the page's curve and the server's
      tween, **in pixels on the target raster** — asserting the CLAIM, not the presence of a name.
- [ ] 8.4 **Forbid a CSS transition on a PLATE that omits its timing function** — the default `ease`
      measured **580–835 px** out (§9.2). ⚠ **Scope the guard to §13.2's boundary**: it must catch a
      bare plate transition **without** forbidding a designed ease on a backdrop.
- [ ] 8.5 **The MODE SET (§13.5):** cut / fade / move, with D2's per-arrangement mode and duration
      and D3's operator cut escape.
- [ ] 8.6 🔴 **FADE = fade the MASK'S LUMINANCE, not the producer's opacity** (§13.5a). Measured
      **−3.4 %** frame cost, no `MIXER`, no second clock — so the fade sits on the FREE side of
      §13.2's boundary and `linear` binds only **move**.
      ⚠ **The mechanism is an `@property`-registered `<color>` feeding the mask gradient.** Animating
      `mask-image` directly **does not interpolate** (§9.6h) — anyone who tries the obvious spelling
      first will conclude the lead is dead.
- [ ] 8.7 **MOVE = interpolated `clip-path`** (§13.4), verified on the plant's CEF at **−4 %**.
      🔴 **A plate hidden in the target arrangement must contribute a DEGENERATE (zero-area) hole,
      not NO hole**, so the point count is invariant and the browser can interpolate. That is also
      exactly §12.4's "a hidden plate stops punching" — one rule serves both.
      ⚠ It is a **SECOND mask mechanism** beside the measured `mask-mode: luminance`. **Do not
      re-open the static choice on the strength of it.**
- [ ] 8.8 **The BACKGROUND transition (§13.1, §13.2):** one shared background is the default and is
      enough; a per-arrangement background is optional. ⚠ **Record the measured −10 % / 120 ms cost
      beside the capability**, so an author finds out from the design and not from a stuttering
      transition.
- [ ] 8.9 ⚠ **§13.3 — CONDITIONAL:** if a per-arrangement background IS authored, **both** backdrops
      carry the current mask through the crossfade, and the outgoing one's participation
      **OUTLIVES** the fade. The existing per-element z-order rule already gives both of them holes;
      what must be built is that the arrangement state distinguishes **LEAVING** from **HIDDEN**, or
      4.1's resolved visibility strips the outgoing backdrop's holes mid-fade — the failure
      introduced by the fix.
- [ ] 8.10 **The text FIT rule (`B-147`)** — it must measure the **RENDERED box after shaping**,
      never the string. `@cg/text-shaping`'s `truncate()` is code-unit based and is a length cap, not
      a width fit, so a count-based rule works for Latin and fails for shaped Persian.

---

## 8. Still owed — MEASUREMENTS (not blocking any stage above)

- [ ] 9.1 The **VISUAL seam of a cut**. §9.3 bounds it command-side at 0.20 frames; confirming what
      reaches SDI needs a channel-side capture, and `PRINT` writes to the plant's own disk.
- [ ] 9.2 Whether a **1-box arrangement LETTERBOXES** — the plant trace shows `FILL` ≡ `CLIP` for a
      1280×536 `AMB.mkv`, i.e. crop-to-fill is not being applied.
- [x] 9.3 ✅ **CLOSED as a DEFECT, filed and fixed as `B-150` (2026-08-21, session BI) — and its
      AUDIO half is SUPERSEDED, not delivered.** This was written as a measurement still owed; it
      turned out to be a confirmed defect, so it is closed by the fix rather than by a number.
      **What was true:** nothing stopped the content inside a hidden look. A hidden look's
      `<video>` kept decoding, its Lottie kept computing a frame per tick, its crawl kept crawling
      and its sequence kept advancing past items nobody saw. Fixed by ONE seam —
      `LookMediaPark` (`packages/template-runtime/src/look-media.ts`) — which silences and pauses
      content inside a look that is not on screen and revives it IN PLACE (`VideoDriver.resume()`
      re-anchors to the media's actual position without seeking, so a switch back is seamless).
      🔴 **What was NOT true — the paragraph below claimed the audio half was "the severe part".
      IT IS NOT REACHABLE, on two independent grounds, both verified by sweep:** every imported
      video has its audio track STRIPPED at conversion (`-an`, decision (h),
      `video-convert-args.ts`), and every `<video>` the scene builder creates is `muted = true`
      with **no unmute path anywhere in the tree** (`git grep "\.muted"` over `packages`, `apps`,
      `tools` returns writes of `true` and nothing else; there is no `.volume =` write at all). So
      the severity is a FRAME-BUDGET one, not a sound-on-air one — which also re-confirms, from a
      second direction, that this was never the cause of the unexplained on-air "2×".
      **The park still silences a hidden look unconditionally**, as a guarantee that survives the
      operator toggle (7.10) rather than as a fix for a reachable fault.
      **Two exclusions, both correctness:** content that GATES A HOLD is silenced but never paused
      (a paused driver never completes, so the graphic would never come off air), and CLOCKS are
      never parked — `ClockDriver.resume()` accrues the paused interval, so a parked duration
      countdown would come back claiming time it does not have.
      ⚠ **The decode LOAD itself is still unmeasured** and the suite says so: happy-dom has no
      decoder, so the tests assert the API facts (`paused`, `muted`, `currentTime` not rewound) and
      the step to "the decoder stopped spending frames" is the browser's contract. A real number
      belongs on the plant's CEF beside §9.6f's own.
      **The original text, kept because it is what was believed and half of it was wrong:**
- [ ] ~~9.3~~ 🔴 Whether a **hidden `<video>` keeps DECODING** in CEF. Nothing in the tree pauses one — a
      `visible` binding writes `style.display` and the video driver is lifecycle-driven — so under A′
      every arrangement's background video may decode for as long as the row is up. §9.6f shows the
      frame budget is already the tight resource.
      ⭐ **RAISED, AND CONFIRMED ON THE CODE SIDE (session BE, investigating an on-air "media plays
      at ~2×" report).** Under LOOKS this stops being an A′-only worry and becomes the ordinary
      case: `applyLook` hides a non-active look by writing `display:none` on its composition
      INSTANCE, and **nothing pauses what is inside it.** Verified by sweep — `runtime.ts` gates
      exactly ONE media kind on visibility (the Lottie, `l.element.visible === false`, line ~1003);
      the video driver has no such gate, and in any case the authored `visible` flag is a DIFFERENT
      fact from a look's runtime `display:none`, so even that gate would not catch this.
      🔴 **The consequence is not only decode load: a hidden look's `<video>` keeps PLAYING ITS
      AUDIO.** A template whose looks each carry media therefore has every look's audio on the
      channel at once, offset from one another — which is a plausible plain-language "the media
      playback is not normal", and is worth ruling out before anything exotic. It is NOT a 2× on a
      single visible element (every driver derives its playhead from elapsed wall-time, pinned by
      `packages/template-runtime/tests/one-driver-per-path.test.ts`).
      **The fix is a POLICY decision, deliberately not taken here:** pausing a look's media on exit
      and resuming on re-entry is §12.4's "held" shape applied to media, and it has to answer
      whether a returning clip RESUMES or RESTARTS. That belongs with the operator surface, not
      folded silently into a bug hunt.

  > ✅ **Linux `gate:e2e` DISCHARGED for 7.9, 7.10's filing and 9.3 / `B-150` (session BI):**
  > <https://github.com/yasermostafaee/cg/actions/runs/32433581571> — head `9d2d23a6`, the tip
  > carrying every change of the session, `completed` + `success`, and the **`E2E (Playwright)` job
  > RAN** (not skipped).
  >
  > ⚠ **Three EARLIER runs this session are also green with the e2e job run — `c3425891`,
  > `e04760e0`, `69ec3a14` — and NONE of them discharges the debt**, because each predates a later
  > fix. Recorded rather than omitted, so the next reader can see that the cited run was chosen by
  > the rule and not by whichever green run came to hand first.

- [ ] 9.4 The pixel confirmation that a **`LOADBG` background producer is NOT composited**. ⚠ It
      **cannot change §12.9.6's verdict on D** — D loses under both branches — so this is
      completeness, not a blocker.
- [ ] 9.5 🔴 The **CSS-path confirmation of §9.6h's luminance transfer**: a channel-side capture of a
      half-luminance mask over a real live plate. §9.6h read α ≈ grey ÷ 255 through an
      SVG-mask → canvas **PROXY**, not through `mask-mode: luminance` compositing over SDI.
      ⚠ **AND a pinning test for α ≈ grey/255** — it is an ENGINE property a CEF bump could change,
      not a spec guarantee: SVG 1.1 specifies linearRGB, which would make 50 % grey ≈ 21 % open and
      the fade visibly front-loaded.

**Re-run any of these with the committed harness:**
`node tools/caspar-amcp-probe/bin/arrangement-probes.mjs <probe>`.
