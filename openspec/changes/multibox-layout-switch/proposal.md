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

**RECON AND DESIGN ONLY. No behaviour changes and no product code.** The deliverable is an honest
feasibility assessment against the real tree at `f6c7329`, plus a task list in which **every
implementation task is gated on an owner question** (`⟨GATE: §x⟩`).

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

Documentation only:

| Path                                       | Effect                                                     |
| ------------------------------------------ | ---------------------------------------------------------- |
| `openspec/changes/multibox-layout-switch/` | this change — proposal, design, tasks, one capability spec |
| `docs/handoff/2026-08-17-session-aq.md`    | the first session's handoff, opening with the SHA read     |
| `docs/handoff/2026-08-18-session-ar.md`    | the second session's handoff (the gates + §12.9 + §13)     |

## Impact if it proceeds

| Area                   | Effect                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `@cg/shared-schema`    | resolved visibility + current geometry into `sceneMaskHoles`; per-layout geometry on the element |
| `@cg/shared-ipc`       | per-layout rects on the `liveSources` declaration block                                          |
| `@cg/template-runtime` | a re-punch pass after `update()` (UNIT B′)                                                       |
| `tools/caspar-bridge`  | ONE `reconcileLivePlates`; `swapLiveSource` becomes a caller; per-layout fit                     |
| `apps/runtime`         | the layout control; the Inspector refusal and override visibility                                |
| `apps/designer`        | authoring per-layout geometry; the `live-source-animated` refusal is KEPT                        |
| `@cg/vcg-format`       | `collectLiveSources` emits per-layout rects; no format change                                    |

## Status — updated 2026-08-18

**DESIGN-FIRST. Still no product code.** Two things were decided here with their reasoning rather
than deferred: the plate identity model (§0.5) and the v1 animation refusal (§2b).

**Seven of the eight owner gates are now ANSWERED** and recorded in `design.md` §12 as DECIDED —
§12.1 (cut first), §12.2 (`linear` both sides), §12.4 (the dropped box is held), §12.5 (the
Inspector is surface-only), §12.6 (refuse two multi-box templates, one predicate called from two
sites), §12.7 (the ledger survives a restart, filed separately), §12.8 (a segmented control on the
row). The `⟨GATE: §x⟩` tasks that named them are unblocked.

🔴 **§12.9 remains OPEN, and was WIDENED rather than settled.** The owner withdrew candidate B — _a
layout is a designed SCENE, not a set of rectangles, and computed geometry cannot carry a background
at all_ — and offered a candidate of his own (**D**: give layers a TYPE, and let a _group_ layer bind
several ordinary templates with one live). **D was investigated on the plant and is REFUSED**, on
four independent grounds, three of them measured:

- 🔴 **Two templates cannot share one video layer.** `CG ADD` at cg-layer 1 is accepted (`202`) and
  **REPLACES** the page at cg-layer 0; `INFO` reports one `html` producer and both cg-layer indices
  then route to the survivor. The cg-layer argument is **inert**. ⇒ the "hole in the upper page"
  question is **moot — there is no upper page**.
- **A replace costs ~3 frames** (118 ms median = 2.95 frames), fifteen times the measured cut.
  `LOADBG` + `PLAY` removes that gap entirely — but a layer has **exactly one background slot**, so
  only one _announced_ alternative is gapless and the rest are not.
- It cannot animate a rearrangement (§0.2, cited), so §12.1's phase two would need candidate A built
  anyway.
- **Assignment cannot survive it** — the key is `(templateId, plateId)` and each layout is a
  different `templateId`.

`design.md` §12.9.6 recommends **A′** — candidate A's identity model with a box authored as a
**nested composition** and per-layout geometry carried on the **instance** — with its evidence.
It is a recommendation, not a decision.

The owner also extended the transition requirement (selectable modes, background transitions) and
added per-box titles; both are recorded with their costs in `design.md` §13, and the mode set is now
a spec requirement.
