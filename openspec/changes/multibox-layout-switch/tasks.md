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

| #              | Stage                                                  | Why it is here, in the design's own words                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** ⚠ PARTLY | **`B-145` — the ledger survives a bridge restart**     | §12.7: filed as a SEPARATE item that **must land BEFORE the switch ships**. It is also what makes stage D's reconcile trustworthy — a reconcile against a ledger that a restart silently emptied is a reconcile against a lie. **Persistence landed 2026-08-18 and defaulted ON 2026-08-19. ⚠ Its DISPLAY half (task 2.8) is still open and is due before STAGE E** — `B-145` is back to `[~]` for that reason                                                                                                                     |
| **B** ✅ DONE  | **§12.6's exclusivity refusal**                        | ⚠ **NOT where the obvious reading puts it.** §12.1 says the two measured crosstalk symptoms are closed by exclusivity, but that §8's two doors — `take()` and `restore()` seating a SECOND multi-box template — _"are a different reachability and are closed by §12.6's refusal, **not by this phasing**"_. **It depends on nothing else in this file**: it is a predicate in two call sites. It is the cheapest closure of a measured on-air failure mode in the whole plan, so it goes early rather than waiting for the switch |
| **C**          | **UNIT B′ + the per-arrangement carrier, INTERLEAVED** | §6b: UNIT B′ is _"this feature's PREREQUISITE, not latent cleanup"_. §12.1: phase one _"must already build the per-arrangement geometry carrier (§7) and the mask recompute (UNIT B′, §6b)"_. ⚠ **They are one stage, not two:** 2.1 (resolved visibility) needs no carrier, while 2.2 (current geometry) cannot be written until the carrier exists to be read                                                                                                                                                                    |
| **D**          | **The reconcile (§4)**                                 | §4: ONE `reconcileLivePlates`, with `swapLiveSource` becoming a **caller** rather than a peer. Needs C's carrier to compute a desired set                                                                                                                                                                                                                                                                                                                                                                                          |
| **E**          | **The operator surface (§12.8)**                       | The toggles are what drives D. Needs D to have something to call                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **F**          | ⭐ **THE CUT SHIPS**                                   | §12.1: cut first, animation second. A–E is the whole of phase one                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **G**          | **The transition modes (§13.5)**                       | Phase two. §12.1: _"phase two then adds only the tween and its curve contract"_                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

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

- [ ] 2.8 🔴 **THE DISPLAY HALF OF `B-145` ACCEPTANCE 1 IS NOT MET — an adopted layer is
      CONTROLLABLE but INVISIBLE.** Traced 2026-08-19 (session AT); **written down, deliberately not
      fixed there.**
      **What holds already (no work needed):** the browser retains the stack intent and re-delivers
      it on every connect (`B-092`), so the row and its `itemId` survive the restart; the ledger is
      keyed by `itemId` (`tools/caspar-bridge/src/live-layers.ts:107`); and every teardown/repoint
      door reads `#liveLayers` by that key — `teardownLiveLayers`
      (`tools/caspar-bridge/src/caspar-runtime.ts:3802`), the swap paths at `:3461` and `:3639`. So
      the row's existing verbs DO reach the adopted records.
      **What is missing:** nothing displays the seated layers AS layers.
      `CasparRuntime.liveLayers()` (`caspar-runtime.ts:3849`) has **no production caller** — its own
      comment says _"for tests and for phase 6's re-emission"_ — and no `@cg/shared-ipc` channel
      carries the ledger, so it never crosses the wire. The only panel that lists station layers is
      the PLAYOUT tab, and `playoutLayersState()` (`caspar-runtime.ts:4064`) enumerates
      **`#reservedLayers` only**; the Live Source band is deliberately NOT reserved (`live-layers.ts:20-26`
      — reserving it would make it unplaceable, unreservable and unclearable), so it can never appear
      there, and `stationLayerOccupancy` would refuse the clear anyway because it offers one only for
      producer kind exactly `html` while a plate is a `route`. The Inspector's plate rows read
      `currentSourceAssignments()` (`apps/runtime/src/renderer/features/inspector/livePlates.ts:23`)
      — the ASSIGNMENT config, i.e. what a plate _should_ use, never what is seated.
      **Done when:** a surface exists that lists the layers the bridge itself has seated, and an
      operator can tell an adopted layer from a stranded one. **Needs a channel and a panel decision,
      which is why it is its own item and not a patch to stage A.**
      ⏱ 🔴 **DUE BEFORE STAGE F/G — specifically before STAGE E (section 6), and not before that.**
      Stage E is where the band's state becomes something the operator is EXPECTED to read, so an
      invisible seated layer stops being a diagnostic gap there and becomes a lie on the surface they
      act from. Stages C and D touch neither the list nor the band's visibility and are NOT blocked
      on it. Recorded 2026-08-19 (session AU), which also moved `B-145` back to `[~]` — it had been
      ticked with this half of its acceptance 1 unmet.

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
> LANDED in session AU**: 4.1–4.6, 5.1, 5.2, and the SCHEMA halves of 5.4 and 5.5. **C2 is the
> Designer's authoring surface**: 5.3, 5.6, and the CONTROLS for 5.4 and 5.5.
>
> 🔴 **The split runs THROUGH 5.4 and 5.5, not around them.** Their fields had to land with C1
> because 4.1 cannot read a `hideDuringTransition` flag that does not exist; their controls
> belong to C2 because a UI built on a schema that is still moving is a UI built twice.
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
- [ ] 5.3 **The Designer surface for authoring arrangements** — the list, the default per count, and
      the per-arrangement geometry. See the `designer-multibox-arrangements` spec.
      **Visual:** ⭐ **this one IS visual** — open the Designer, add a box composition, author a
      2-box and a 3-box arrangement, and switch between them in the preview.
- [x] 5.4 **D2's per-arrangement MODE + DURATION field**, in the same section as the arrangement list SCHEMA HALF LANDED 2026-08-19 (session AU) — `ArrangementTransitionSchema`, a DISCRIMINATED UNION so §13.5's and §12.2's measured rules are unrepresentable to violate: a cut carries no duration or easing, a move is `linear` only, a fade takes any easing (§13.5a moved it off the server side), and an OMITTED timing function cannot be expressed at all. ⏭ **Its authoring CONTROL is C2.**
      (§13.6.2). Per-arrangement is a **strict subset** of the deferred per-pair form, so the
      authored format does not have to change if per-pair is taken up later.
- [x] 5.5 **D4's per-element hide-while-transitioning flag** — authored beside the element, and wired SCHEMA HALF LANDED 2026-08-19 (session AU) — `hideDuringTransition` on `ElementBaseSchema`, wired as 4.1's THIRD input and read nowhere else. ⏭ **Its authoring CONTROL is C2.**
      as **4.1's third input**.
- [ ] 5.6 **Preflight:** exactly one arrangement active at author time, and the `live-source-overlap`
      check applied **WITHIN** an arrangement, not across arrangements — today the loop is
      per-document (`apps/designer/src/renderer/state/live-source-preflight.ts:178`) and would not
      fire across them. ⚠ **The rule does not change; only its input does.**

---

## 5. STAGE D — the ONE reconcile (§4)

- [ ] 6.1 **`reconcileLivePlates(itemId, desired)`** in `tools/caspar-bridge/src/caspar-runtime.ts`:
      seat / re-fit / release as a **DELTA** against `#liveLayers`, resolving through
      `resolvePlateAssignments` as the ONE resolver.
      **Done when:** one function, and the take path no longer seats plates its own way.
- [ ] 6.2 **Route the take's `#seatLiveLayers` through it**, preserving the all-or-nothing rollback
      and the "record before the send is awaited" rule.
- [ ] 6.3 **Make `swapLiveSource` a CALLER of it.** 🔴 **Do not build a second mechanism beside
      R-048's swap** — `swapLiveSource` already argues this case for itself one level down.
- [ ] 6.4 **Re-derive the fit PER ARRANGEMENT.** A 1-box arrangement changes each box's aspect, and
      because `MIXER FILL` **survives a producer swap**, getting this wrong is a **wrong crop rather
      than an obvious break** — the failure mode that does not announce itself.
- [ ] 6.5 **The release policy for a plate with no cell in the target arrangement (§12.4):** HELD
      muted and idle by default; a source kind that cannot be held falls back to teardown as a
      **NAMED, observable** behaviour.
      ⚠ **Punch and seat are separate mutations here** — a held plate stops punching (or §1's
      crosstalk returns inside one template) while its producer stays seated on its band layer.
- [ ] 6.6 **A test per inverse in §4's audit table** — plate set, mask, fit, layer allocation.

---

## 6. STAGE E — the operator surface (§12.8, as rewritten by D1)

- [ ] 7.1 🔴 **ONE TOGGLE PER DECLARED SOURCE on the row, always visible.** Which toggles are lit
      **is** what is on air; the COUNT is **derived**. Not a menu.
      **Files:** `apps/runtime/src/renderer/features/layers/` — and see §12.8 for the two verb-grid
      collisions this re-opens.
      **Done when:** a row with N declared plates shows N toggles, and flipping one changes what is
      on air through stage D's reconcile.
      **Visual:** ⭐ **the primary visual check of the whole feature** — open the Runtime layer list
      on a multi-box row.
- [ ] 7.2 **Placement (ii): a second line on the row, outside the verb block.** It leaves
      `VERB_COUNT = 6` (`apps/runtime/src/renderer/features/layers/layerTable.ts:75`) and the header
      word alignment untouched — the invariant with the recorded on-air failure behind it.
      ⚠ **Must survive density** (`gridTemplateColumns(density)`, `layerTable.ts:225`): a row with
      eight declared plates has eight toggles at every density.
- [ ] 7.3 **The derived-count resolution:** on any toggle change, resolve the count, activate that
      count's **authored default arrangement**, and seat the lit sources into its cells in
      **declared order**.
- [ ] 7.4 **The non-default arrangement chooser** — an explicit secondary action, never in the way of
      the common case.
- [ ] 7.5 🔴 **THE REFUSAL FAMILY — ONE family, THREE triggers** (§12.9.1, §12.9.1a):
      more toggles lit than the largest arrangement holds (**name the number lit and the largest
      available**); a derived count with no authored arrangement (**name the count and the counts
      authored**); and **ALL TOGGLES OFF**.
      🔴 **All-off is an ordinary count:** the authored 0-cell arrangement if there is one, else the
      same refusal. **It is NEVER an implicit STOP** — the row has a STOP verb, and a second implicit
      route to off-air would be the quietest possible one.
      **Done when:** one refusal function, three triggers, three tests.
- [ ] 7.6 **D3's immediate-CUT escape** — one action, not a mode picker, designed **with** the toggle
      set rather than after it (§13.6.1) because they share one surface and one collision.
- [ ] 7.7 **The Inspector's on-air behaviour (§12.5, `B-146`):** surface only — the edit saves, the
      surface says "takes effect at the next take" and **names the row's SOURCE swap as the live
      path**.
- [ ] 7.8 **Make an active `sourceOverride` VISIBLE outside the swap dialog** — today it appears in
      exactly one place (`apps/runtime/src/renderer/features/layers/LiveSourceSwapDialog.tsx:80`), so
      the Inspector confidently shows a source that is not on air. **Ships WITH 7.7 or the repair is
      a half-repair.**

---

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
- [ ] 9.3 🔴 Whether a **hidden `<video>` keeps DECODING** in CEF. Nothing in the tree pauses one — a
      `visible` binding writes `style.display` and the video driver is lifecycle-driven — so under A′
      every arrangement's background video may decode for as long as the row is up. §9.6f shows the
      frame budget is already the tight resource.
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
