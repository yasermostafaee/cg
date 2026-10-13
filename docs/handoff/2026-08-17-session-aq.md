# Session AQ — the multi-box layout switch: recon, design, and the plant measurements

**Read at `f6c732907b31f3b1c0067cd56db6dc829b4beffe`, pulled 2026-08-17** (`git pull --ff-only`
before a file was opened — "Already up to date"; `git ls-remote origin dev` matched local HEAD).

⚠ **The working tree was NOT clean, and I left it that way.**
`tools/caspar-bridge/src/template-http-server.ts` carries an uncommitted local hack — an early
`return '192.168.21.93';` at the top of `guessLanHost()`, hard-coding this machine's LAN address so
the plant can reach the served template. **I did not touch it and did not commit it.** It is the one
thing keeping `pnpm gate` red — see "The gate".

**Hardware readings: plant `192.168.21.50:5250`, build `2.5.0 69e8ad5 Stable`, channel 1
`1080i5000 PLAYING`** — asserted by a validity gate before every reading. 🔴 The retired 2.3.2
install at `D:\programs\CasparCG` was never contacted. Layers 150–152 were used (`INFO 1` showed
10, 11, 92–95, 97 occupied), with a page painting essentially nothing so it could not disturb
output. All probe layers were cleared afterwards.

**RECON AND DESIGN ONLY.** No product code was written or changed.

---

## What exists now

- `openspec/changes/multibox-layout-switch/` — proposal, design (14 sections), tasks, and one
  capability spec `runtime-multibox-layout`. `openspec validate --strict`: **valid**.
- This handoff.

**No numbers were minted.** Two `⟨MINT⟩` items are recorded in `tasks.md` 1.9/1.10 — a bug item for
the Inspector defect, and a PRD item for the feature itself.

---

## 🔴 The headline

> **Neither the cut nor the animation is free, and the difference between them is smaller than it
> looks.** Under the plate-identity model this design decides on, even a CUT moves plates, so both
> need per-layout geometry (a new carrier and a new authoring concept) and a mask that recomputes
> (UNIT B′). What the animation adds on top is only the _tween_ and its curve contract — which is
> measured and satisfiable, with `linear`, exactly.

**The two facts that could have killed the feature did not.** A cut's command sequence completes in
**0.20 frames**, so the absence of an atomic multi-plate `COMMIT` costs nothing visible; and a
CasparCG tween **can** be matched to a CSS curve exactly, provided both sides use `linear`.

---

## The two decisions this design made itself (not owner gates)

### 1. A layout is a set of GEOMETRIES and VISIBILITIES over the SAME plate set

**Not** three sets of plate elements. My first pass had it the other way round — three composition
instances, one visible at a time — and the mid-session patch was right to challenge it. The evidence
that settles it:

- 🔴 **`live-source-overlap` is a SHIPPED, export-blocking preflight error**
  (`live-source-preflight.ts:293-312`, `severity: 'error'`). Two layouts of the same screen area
  necessarily overlap. ⚠ Precisely: the overlap loop sits **inside the per-document loop**, so
  plates in different compositions are never compared — the three-composition model would have
  slipped past on a technicality while reproducing §1's crosstalk _inside one template_.
- **Every declared plate is seated at take**, so three layouts' plates would all go live at once —
  N producers for one source. A `route://` tolerates that; **a physical DeckLink cannot be opened
  three times.**
- **It cannot reach the animated case at all** — you cannot tween a box from one element to a
  different element. Building it for the cut and then needing the other model for the animation is
  the same "two implementations of one capability" failure that closed the family question.

It fits the tree three independent ways: assignments are keyed by plate id (survival is free);
plates keep their layers (`tasks.md` 6.0's "a re-take lands on the same layers" stays true); and
`§9a-Z` already says the punch follows the plate's own **visibility**.

🔴 **The cost it carries:** the switch **IS a plate move**, so per-layout geometry must reach both
the page and the bridge — and nothing today can express it.

### 2. The v1 animation refusal STANDS untouched — (a), the transition is a runtime state change

`live-source-multibox` §6 makes any geometry keyframe on a plate _or its ancestor chain_ an
export-blocking preflight error, because _"a static `FILL` behind an animated hole desyncs"_.

The distinction that resolves it: an **authored keyframe** moves the hole _with nothing telling the
bridge_. A **layout switch** is the opposite by construction — it is the mechanism that moves the
FILL; the same reconcile that repositions the hole issues the new `MIXER FILL`/`CLIP`.

**What stops an author also keyframing a plate: nothing changes, and that is the point.** The
preflight reads `el.animation?.tracks` — authored keyframes in the scene. A runtime layout state is
not one and is invisible to it. So the two are distinguishable **by construction, not by a new
rule**. `tasks.md` 7.4 is therefore inverted: _keep_ the refusal and pin it with a test.

⚠ It removes the refusal as an obstacle; it does not remove the risk the refusal pointed at. That
risk is now owned by the switch.

---

## The plate-identity fact, read from the code

Asked directly — what does `collectLiveSources` emit for two elements sharing a `routeKey`, and what
does the preflight say?

- `collectLiveSources` emits **one declaration per ELEMENT** (`packages/vcg-format/src/live-sources.ts:96-110`),
  each with its own `elementId` and `rect` and the _same_ `sourceId`. Nothing dedupes.
- **The preflight says nothing.** `liveSourceIssues` has exactly four checks — device-shaped id,
  off-frame, keyframe/rotation, overlap. `SEARCH:` `git grep -rni "duplicate" -- apps/designer/src/renderer/state/live-source-preflight.ts packages/vcg-format/src`
  → 0 hits in the preflight.
- `LiveSourceIdSchema` (`elements.ts:1083-1092`) has **no uniqueness refinement** — a format regex only.
- Downstream, duplicates all resolve to the same source **and all are seated**, and
  `#planLiveSeating`'s `held` map (keyed by `sourceId`, `caspar-runtime.ts:2982`) collapses them so
  `preferred` names one layer N times.

**Under the chosen model this is moot** (one element per id). It is recorded because it is exactly
why the separate-sets identity story is fragile — and because the Designer explicitly _permits_
duplicates (`CanvasOverlay.tsx:105-107`), so nothing would have warned an author who tried it.

---

## Assignment survival

Keyed **`(templateId, plateId)`** where `plateId` IS the `routeKey`
(`packages/shared-ipc/src/channels/sources.ts:322-326`). No element id, no plate index. A plate
keeps one identity across layouts ⇒ **the tuple never changes, so the assignment never changes.
Nothing needs building.** In Family 2, three `.vcg` files are three `templateId`s and share nothing —
an independent, code-level proof that Family 2 could never have met the requirement.

---

## ONE mechanism

The layout switch and the source change **resolve to one**: _reconcile the seated live-plate set of a
running row against a freshly-resolved desired set._ `#seatLiveLayers` (take-only, all declarations)
and `swapLiveSource` (live, one plate) are two halves of it. `swapLiveSource` already argues that a
swap resolving plates its own way "would be a second spelling of 'which producer is behind this
hole'" — **the same argument one level up says the switch must not be a third path.** One
`reconcileLivePlates`, with `swapLiveSource` as a caller. 🔴 **No second mechanism beside R-048's
swap.**

---

## The Inspector defect — a MISSING REFUSAL ⟨MINT⟩

R-048 is shipped and already does the live thing. The owner used the **Inspector**, which writes the
**template-scoped** assignment. Three independent sources say that path reaches nothing on air:
the living spec (_"an assignment is read at the TAKE and never re-composites the graphic already on
the channel"_), the code's own comment (`applyDraft.ts:36-38`: _"the assignment reaches NOTHING on
air"_, and `:51` _"⚠ TEMPLATE-LEVEL"_), and 🔴 the fact that `setSourceAssignments`
(`caspar-runtime.ts:4776-4785`) **is not `async`** — structurally incapable of sending an AMCP
command.

Because the assignment is shared by every row carrying the template, silently re-issuing would
repoint them all, on air, with nobody told. ⇒ **A missing refusal, not a missing mutator.** A control
that silently does nothing is the worst of the three outcomes, and it is what ships today.

⚠ **A second, related defect found during verification:** the Inspector's picker is
**override-blind**. `SEARCH:` `git grep -rn "sourceOverride" -- apps/runtime/src/renderer` →
**exactly one hit**, `LiveSourceSwapDialog.tsx:80`. An active override is invisible everywhere except
the dialog that set it.

---

## The measurements

Instrument: a throwaway HTTP+beacon harness on `192.168.21.93:7911`. **Both controls ran before every
number** — positive (a local self-test recorded; for the cut, all three layers' `MIXER FILL` readback
asserted LIVE first) and negative (a `CG ADD` at a 404 URL: command **accepted `202`**, the plant
**did fetch it from us**, and **no beacon fired** — both halves matter).

⚠ **Two instrument faults were found and fixed before any number was recorded**, both producing
plausible-looking wrong data: the AMCP reader **desynchronised on `400 ERROR`** (which is followed by
an echoed command line), and **CasparCG calls `window.update()` at ADD time**, which an ungated match
attributed to a later `CG UPDATE` and reported as a **negative** latency.

### PRIORITY 1 — `MIXER FILL … <frames> <tween>` on 2.5.0

**ACCEPTED (20):** `linear`, `easenone`, `easein/out/inout` × `quad|cubic|sine|expo|circ|back`,
`easeoutbounce`, `easeinelastic`.
**REJECTED `403` (3):** `cubic-bezier`, `ease-in-out`, `ease`.

⇒ §6's 44-easing lead from `ciab-client-tools.json` is now a **verified server fact**, and the
vocabularies are **disjoint**. `MIXER FILL` with no arguments **reads the value back**, so the curves
were sampled numerically rather than assumed (each curve's own Penner formula was its best fit — the
positive control that the instrument discriminates curves at all). Measured 2000 ms for 50 frames
confirms **25 fps**.

Exact deviation, as **pixels of hole-vs-picture separation on 1920**:

| CasparCG tween   | vs CSS `linear` | vs `ease-in-out` | vs `ease` | vs a fitted bezier            |
| ---------------- | --------------- | ---------------- | --------- | ----------------------------- |
| `linear`         | **0.0 px** ✅   | 232.8 px         | 580.6 px  | —                             |
| `easeinoutsine`  | 202.1 px        | **35.9 px**      | 647.8 px  | **3.8 px** @ `(.37,0,.63,1)`  |
| `easeinoutquad`  | 240.0 px        | **22.8 px**      | 699.3 px  | **10.1 px** @ `(.45,0,.55,1)` |
| `easeinoutcubic` | 369.5 px        | 161.3 px         | 835.2 px  | 142.0 px                      |

🔴 **The trap is CSS's default.** `transition: left 2s` with no timing function gets **`ease`** —
580–835 px from every CasparCG tween, over a third of the frame, and exactly what a developer writes
by accident.

### PRIORITY 2 — what a CUT costs the live sources

The real 3-box → 2-box re-fit — one `CG STOP` plus two `MIXER FILL`+`CLIP` pairs — over 8 runs:

|                   | min     | median      | max      |
| ----------------- | ------- | ----------- | -------- |
| command-side span | 6.86 ms | **8.16 ms** | 17.93 ms |
| frames @ 25 fps   | 0.17    | **0.20**    | 0.45     |

> 🔴 **A cut completes in ~0.20 frames**, so `DEFER`/`COMMIT` being unusable costs nothing visible.
> The span can straddle at most **one** frame boundary; worst case is a single frame of
> partially-applied geometry, probability bounded by span ÷ frame ≈ 20 %.

🔴 **`MIXER DEFER` / `MIXER <ch> COMMIT` was deliberately NOT exercised** — `COMMIT` is
channel-scoped, so on this shared plant it could apply another controller's deferred changes.
Recorded as a refusal to measure, not an absence of data.

### Demoted (Family 2 is eliminated, so it decides nothing)

`CG ADD` → first painted frame: **median 70.2 ms, 33.7–157.3 ms**. Also `CG UPDATE` →
`window.update` **≈5 ms (sub-frame)**, pre-warmed `CG PLAY` → `play()` **≈7 ms**.

---

## Exclusivity: still reachable, refused by nothing

Two multi-box templates on air together is reachable by **two doors** — `take()` (whose planner
allocates a second template's plates _around_ the first's) and `restore()` on reconnect (no cap, and
it never re-registers plates). A refusal must live in **both**; restore never passes through
`take()`. `SEARCH:` for any mutual-exclusion concept returned only the lucide `Radio` **icon**.

## §9b does not compete

`live-source-multibox` §9b (the multi-box on its own channel, **`RECOMMENDED IN PRINCIPLE; NOT
ADOPTED`**) moves _where the layers live_, not _what the bridge sends_, and delivers no layout
switch. Adopting it later would **not** change this design's cost. ⚠ Noted, not acted on: its four
measurements are written against **retired 2.3.2** and need re-basing on 2.5.0; and
`live-source-multibox` `tasks.md` has **two items numbered 6.3**.

---

## The gate

`pnpm openspec validate multibox-layout-switch --strict` → **valid**.

`pnpm gate` → **85/85 turbo tasks green, `0 cached, 85 total`**; the chain then fails at
`format:check` on **one file I did not touch**: `tools/caspar-bridge/src/template-http-server.ts`,
the owner's uncommitted local hack. My own diff (`openspec/**` + `docs/**`) is prettier-clean and was
verified separately. **No Linux `gate:e2e` is owed** — docs-only.

---

## What the next session needs, in order

1. **The owner's answers to `design.md` §12.1–§12.9.** The two that block the most are **§12.9**
   (how per-layout geometry is authored — the largest piece, with no precedent in the tree) and
   **§12.4** (can a physical DeckLink be held open for a hidden layout at all?).
2. **The two `⟨MINT⟩` numbers** (`tasks.md` 1.9, 1.10).
3. **UNIT B′**, filed here with its full enumeration (`design.md` §6b) as the feature's
   **prerequisite** rather than latent cleanup.

## Traps recorded for whoever picks this up

- **`flattenElements` never descends into a `sequence`** (`scene-flatten.ts:264,274` handle only
  `container` and `composition`; the word "sequence" does not appear in the file). A plate inside a
  sequence composition item **declares nothing and punches nothing, silently** — which rules out the
  tree's only exactly-one-of-N primitive as the layout carrier.
- **`ContainerElement` is inert**, not merely unauthorable: the runtime renders it via
  `buildPlaceholder` and **discards its children** (`scene-builder.ts:297`).
- **Geometry is not authorable.** The one production `transform` binding constructor hardcodes
  `'opacity'` (`bind-resolver.ts:105`), and **`width`/`height` are not binding targets at any level**
  (`bindings.ts:40`).
- **The live band is only a convention.** Nothing forces lives _below_ templates
  (`sources.ts:286-292`), so the z-order that produces the crosstalk is not an invariant.
- **`#liveLayers` is un-persisted process memory** with no release on disconnect or bridge restart —
  a restart strands seated producers unreachable by any code path. Pre-existing; filed as §12.7.
- **A 1-box layout changes each box's aspect**, and `MIXER FILL` **survives** a producer swap, so a
  fit not re-derived per layout is a **wrong crop rather than an obvious break**. Related unmeasured
  lead: the plant trace shows `FILL` ≡ `CLIP` for a 1280×536 `AMB.mkv`, i.e. crop-to-fill is not
  being applied — whether a 1-box layout would letterbox is `tasks.md` 8.2.
