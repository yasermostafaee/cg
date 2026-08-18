# Multi-box layout switch — RECON + DESIGN

## Why

The client's operator runs a 3-box multi-box layout and must be able to switch to 2-box or 1-box and
back, **with exactly ONE layout active at a time, so the operator cannot make a mistake** (owner,
2026-08-17).

No such switch exists. The owner's workaround — playing all three layouts at once and stopping the
top one to reveal the next — produced a real, measured defect on the plant on 2026-08-17: live
sources on layers 10–14 and templates on 93/94/95/97, with layer 95's template taking plates 10/11/12
while 13/14 belonged to a second template. **There is no layer collision; allocation works
correctly.** Every live source sits BELOW every template, so a hole punched by one template opens
onto the whole stack beneath it and reveals whatever live layer is topmost at that pixel — which may
belong to a _different_ template. That produces both reported symptoms at once: one layout appearing
under another, and boxes that look cropped.

**The client's requirement removes the condition**, so this change designs the switch and records
the crosstalk as measured evidence of a state the switch makes unreachable — not as a bug to fix
here. `design.md` §8 states plainly that the state is still reachable by two other doors and where a
refusal would have to live.

**A second symptom reported the same day is the SAME gap.** "When we change a box's source, an
UPDATE does not change it. It needs a STOP and a PLAY again." A layout switch changes _which plates
exist and where_; a source change changes _what one plate shows_. Both need **mutating the
live-source set on a RUNNING row**. `design.md` §4 establishes they are ONE mechanism and the task
list builds it once.

## What this change is

**RECON AND DESIGN.** The deliverable is an honest feasibility assessment against the real tree, the
plant measurements behind it, and — since every gate is now answered — **`tasks.md` as an ordered,
executable plan** rather than a gate tracker. The measurement harness is committed with it.

## What the recon established

- ⭐ **Family 1 is the architecture** — one template, layouts as states of one scene (owner,
  2026-08-17, on the transition question). The family comparison is closed; `design.md` §0.2 records
  the reasoning and the fair counter-case.
- ⭐ **A layout is a set of GEOMETRIES and VISIBILITIES over the SAME plate set** — this design's own
  decision (`design.md` §0.5), because separate plate sets per layout collide with the **shipped,
  export-blocking `live-source-overlap`** preflight error, would seat every layout's plates at once,
  and cannot reach the animated case at all.
- 🔴 **Assignment survives the switch for FREE.** Assignment is keyed `(templateId, plateId)` where
  `plateId` IS the element's `routeKey` (`packages/shared-ipc/src/channels/sources.ts:322-326`) —
  never an element id, never a plate index. A plate keeps one identity across layouts, so the tuple
  cannot change. Three separate templates would share nothing.
- 🔴 **The blockers are the punch mask and per-layout geometry.** `sceneMaskHoles` has exactly ONE
  production call site, inside `buildScene` (`packages/template-runtime/src/scene-builder.ts:172`),
  and reads the scene's _authored_ `visible`. And nothing can express a plate at a different rect per
  layout: `width`/`height` are not binding targets at any level, and the one production `transform`
  constructor hardcodes `'opacity'`. **UNIT B′ is this feature's prerequisite, not latent cleanup.**
- **The v1 animation refusal STANDS** (`design.md` §2b, this design's decision): the transition is a
  runtime state change, and the preflight reads authored `animation.tracks`, so the two are
  distinguishable by construction.
- **The control the owner used was the row's INSPECTOR, not the row's SOURCE swap.** R-048 is shipped
  and already re-issues live. The Inspector writes the TEMPLATE-scoped assignment, **shared across
  rows** — so the correct fix is a **missing refusal**, not a missing mutator, and no second
  mechanism is built beside R-048's swap. ⟨MINT⟩
- 🔴 **Measured: `MIXER FILL … <frames> <tween>` IS accepted on 2.5.0** — 20 Penner names including
  `linear`; `ease` / `ease-in-out` / `cubic-bezier` rejected `403`. The vocabularies are disjoint and
  **only `linear` matches CSS exactly (0.0 px)**; a shared "ease-in-out" name separates hole from
  picture by **~36 px**, and CSS's _default_ `ease` by **580–835 px**.
- 🔴 **Measured: a cut costs 0.20 frames** (median 8.16 ms for the whole 3-box → 2-box command
  sequence), so `DEFER`/`COMMIT` being channel-scoped and unusable costs nothing visible.

## What changes in the repo

Documentation, plus the measurement harness (no product code):

| Path                                            | Effect                                                       |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `openspec/changes/multibox-layout-switch/`      | this change — proposal, design, tasks, TWO capability specs  |
| `docs/handoff/2026-08-17-session-aq.md`         | the first session's handoff, opening with the SHA read       |
| `docs/handoff/2026-08-18-session-ar.md`         | the second session's handoff (the gates + §12.9 + §13)       |
| `docs/prd/runtime.md` · `designer.md`           | `R-057` and `D-152` — the two parent items                   |
| `docs/prd/bugs-runtime.md` · `bugs-designer.md` | `B-145`, `B-146`, `B-147`                                    |
| `tools/caspar-amcp-probe/bin/`                  | the plant harness this change's measurements were taken with |

## Impact if it proceeds

| Area                   | Effect                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@cg/shared-schema`    | resolved visibility + current geometry into `sceneMaskHoles`; per-layout geometry on the element                      |
| `@cg/shared-ipc`       | per-layout rects on the `liveSources` declaration block                                                               |
| `@cg/template-runtime` | a re-punch pass after `update()` (UNIT B′)                                                                            |
| `tools/caspar-bridge`  | ONE `reconcileLivePlates`; `swapLiveSource` becomes a caller; per-layout fit                                          |
| `apps/runtime`         | the per-source TOGGLES (D1) + the cut escape; the Inspector surfacing and override visibility                         |
| `apps/designer`        | authoring ARRANGEMENTS + per-arrangement geometry, mode and the hide flag; the `live-source-animated` refusal is KEPT |
| `@cg/vcg-format`       | `collectLiveSources` emits per-layout rects; no format change                                                         |

## Status — ✅ ALL EIGHT GATES ANSWERED (2026-08-18)

**DESIGN-FIRST. Still no product code in this change.** Two things were decided here with their
reasoning rather than deferred: the plate identity model (§0.5) and the v1 animation refusal (§2b).

**Every owner gate in `design.md` §12 is now answered** — §12.1 (cut first), §12.2 (`linear` both
sides, PLATES only), §12.4 (the dropped box is held), §12.5 (the Inspector is surface-only), §12.6
(refuse two multi-box templates, one predicate called from two sites), §12.7 (the ledger survives a
restart, filed separately), §12.8 (an always-visible control on the row — ⚠ **its shape was later superseded by D1 below**), and **§12.9 last: A′ ADOPTED**.

🔴 **§12.9 — A′.** A box is authored as a **nested composition**; an **arrangement** positions the box
**instances**; per-arrangement geometry lives on the instance. Candidate B (a fixed computed
1/2/3-box family) stays withdrawn — a layout is a designed SCENE, not a set of rectangles. The
owner's own candidate D (bind several ordinary templates to one layer) was investigated on the plant
and **refused on the premise, not on preference**:

- 🔴 **Two templates cannot share one video layer.** `CG ADD` at cg-layer 1 is accepted (`202`) and
  **REPLACES** the page at cg-layer 0; `INFO` reports one `html` producer and both cg-layer indices
  then route to the survivor. ⇒ the "hole in the upper page" question is **moot — there is no upper
  page**.
- A replace costs **2.95 frames**; `LOADBG` + `PLAY` removes that gap but a layer has **one**
  background slot, so only one _announced_ alternative is gapless.
- It cannot animate a rearrangement (§0.2, cited), and **assignment cannot survive it** — the key is
  `(templateId, plateId)` and each layout is a different `templateId`.

A′ is cheap because the punch was **verified, not assumed**: a plate inside a nested composition
punches correctly at any depth, because the flattener's instance path and the builder's
`maskKeyPrefix` are composed from the same parts.

**Also settled 2026-08-18:** a default arrangement per count; declared cell order in v1; legible
refusals (never truncation); and **one shared background is enough** — the per-arrangement capability
stays, but it carries a measured **−10 %** frame cost that the default path no longer pays.

## 🔴 Four later decisions (D1–D4) — one of them SUPERSEDES what landed at `056ffdd5`

|           | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** 🔴 | **The operator's primitive is ONE TOGGLE PER DECLARED SOURCE, not a segmented control over counts.** Which toggles are lit **is** what is on air; the COUNT is **derived**. A control over counts cannot express _which_ two of four, and the owner's answer to "solo, or any combination?" was **any combination, any count**. ⚠ The segmented-control DESCRIPTION is withdrawn; the decision it implemented — always-visible, state-carrying, no menu — is not |
| **D2**    | The transition mode and duration are **PER-ARRANGEMENT** — the arrangement being ENTERED. Per-template is **refused** (it cannot express the difference between arrangements); per-pair is **deferred, not refused**, because per-arrangement is a strict subset of it and no authored format breaks on the upgrade                                                                                                                                              |
| **D3**    | The operator does **NOT** pick a mode per switch in v1. The author's per-arrangement mode runs; the operator's escape is an **immediate CUT — one action, not a mode picker.** A second new control on a row already re-opening the verb grid would compound a collision with a recorded on-air failure behind it                                                                                                                                                |
| **D4**    | "Hide while the arrangement is changing" is a **PER-ELEMENT** flag. 🔴 It is a THIRD per-element visibility notion, so **resolved visibility must come from ONE function** and this flag is its third INPUT — never a fourth boolean read somewhere else                                                                                                                                                                                                         |

🔴 **D1 introduces a state the count primitive could not reach — ALL TOGGLES OFF — and it is decided
rather than left undefined.** Count 0 is an ordinary count: the authored 0-cell arrangement if there
is one (background alone), else the same refusal as any other absent count. **It is never an implicit
STOP** — the row already has a STOP verb, and a second implicit route to off-air would be the
quietest possible one, reached by unlighting the last box under time pressure. The refusal family is
still ONE family, now with three triggers.

⇒ **`design.md` §13.6 and §13.7.2 now hold no open question**, and §12 has none either.

**The transition modes are measured, not estimated.** Cut 0.20 frames; **move** −4 % via verified
`clip-path` interpolation on the plant's CEF; **fade** −3.4 % via the owner's fade-the-mask's-
luminance lead, which leaves the `linear` rule's scope entirely because it has no server half.

## Where the work lives now

Five PRD items were minted 2026-08-18, numbers confirmed by heading sweep before writing:

| Item                             | Half                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **`R-057`** (`runtime.md`)       | the OPERATOR half — the source toggles, the one reconcile, the refusals. Spec: `runtime-multibox-layout`           |
| **`D-152`** (`designer.md`)      | the DESIGNER half — arrangements authoring, geometry, titles, the exporter. Spec: `designer-multibox-arrangements` |
| **`B-145`** (`bugs-runtime.md`)  | the live-layer ledger surviving a restart — **must land before `R-057`**                                           |
| **`B-146`** (`bugs-runtime.md`)  | the Inspector's silent no-op edit and its override-blindness                                                       |
| **`B-147`** (`bugs-designer.md`) | three spellings of "make the text fit", none implemented                                                           |

`R-057` and `D-152` are two items for one capability, on this repo's own `D-137`/`C-015` precedent,
and each names the other.

## Ordering — from `design.md`'s own statements

`tasks.md` §1 carries the plan. The order is **`B-145` → exclusivity → UNIT B′ + the carrier → the
reconcile → the operator surface → THE CUT SHIPS → the transition modes.**

🔴 **Two corrections to the reading that follows section numbering**, both recorded in `tasks.md` §1:
**exclusivity (§12.6) depends on nothing else** — §12.1 says §8's two doors _"are closed by §12.6's
refusal, **not by this phasing**"_ — so it can land the day `B-145` does; and **UNIT B′ and the
carrier are ONE stage**, because 2.1 needs no carrier while 2.2 cannot be written without it.
