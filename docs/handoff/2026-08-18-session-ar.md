# Session AR — the seven answered gates, the verdict on candidate D, and the transition/title requirements

**Read at `fc663dcfcc0b34bf266fabf39e8a7ad4e2b90149`, pulled 2026-08-18** (`git pull --ff-only` →
"Already up to date"; `git ls-remote origin dev` matched local HEAD before a file was opened).
`pnpm install` ran after the pull, clean.

⚠ **The working tree was NOT clean, and I left it that way.**
`tools/caspar-bridge/src/template-http-server.ts` carries the owner's uncommitted local hack. **It
was not touched, not staged and not committed** — every commit staged explicit file paths, never a
directory.

**Hardware readings: plant `192.168.21.50:5250`, build `2.5.0 69e8ad5 Stable`, channel 1
`1080i5000`** — asserted by a validity gate before every reading. 🔴 The retired 2.3.2 install at
`D:\programs\CasparCG` was never contacted. Channel 1 was read EMPTY before the session and verified
EMPTY after; layers 150–152 were used and cleared.

**RECON AND DESIGN, plus the measurement harness. No product code, no behaviour change. Nothing
visual — no UI, no layout, no rendering was touched**, so no Linux `gate:e2e` is owed. ⚠ The last
commit adds instrument code under `tools/caspar-amcp-probe/`, so the diff as a whole is **not**
docs-only and takes the full gate.

---

## What changed

Seven commits on `dev`. The first four were the recon and design; the owner then closed §12.9,
minted the numbers and asked for the harness to be committed.

| Commit     | What                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `6183600b` | **`B-145`, `B-146`, `B-147`, `R-057`, `D-152` minted**, sweeps before and after                     |
| `b45c7482` | **§12.9 CLOSED — A′ adopted**; the fade lead measured; the "backgrounds are free" wording corrected |
| `f9b5ffe8` | the **beacon harness and the arrangement probes committed** to `tools/caspar-amcp-probe/bin/`       |

The first four, docs-only:

| Commit     | What                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `c2a4ee70` | the seven answered owner gates recorded in `design.md` §12 as DECIDED, tasks unblocked            |
| `15ca6840` | the plant recon (new §9.6) and the §12.9 rewrite — D refused, B withdrawn, A′ recommended         |
| `451864a6` | §13 — the transition modes, the curve BOUNDARY, and the per-box titles; two new spec requirements |

---

## 🔴 The headline

> **Candidate D cannot be built on this server.** A video layer carries exactly ONE html page: a
> `CG ADD` at a different cg-layer is accepted (`202`) and **REPLACES** the page already there. So
> "several templates bound to one layer, one live at a time" has no mechanism — and the question
> that was to decide D, _what does a hole in the upper page reveal_, is **moot: there is no upper
> page.**

The second headline is a correction the measurements forced:

> **The background transition is the EXPENSIVE half of an animated switch, not the mask.**
> Crossfading two full-frame backdrops cost −10 % of the frame budget with a 120 ms worst gap;
> interpolating three plate holes cost −4 %. "Free" means free of the SYNC problem, not of the frame
> budget.

---

## 1. The seven gates, recorded as decided (`design.md` §12)

Each carries the owner's reasoning, keeps its candidate table (a decision whose alternatives were
deleted cannot be re-read later), and names what it unblocks. Two costs were written down rather
than left implicit:

- **§12.8 re-opens the closed six-column verb grid, and collides with it TWICE.** The SHAPE rule
  (`layerRowActions.ts:407-409`, why conditionally-present controls became `surface: 'menu'`), and —
  the sharper one — the **fixed-px column model** (`layerTable.ts:1-22`, `VERB_COUNT = 6` at `:75`
  driving both the header word row and the button row). A segmented control has one segment per
  **authored** layout, so its width varies by row and is unknown at design time. Three placements
  are posed; **a second line on the row, outside the verb block, is the one to design first** — it
  leaves `VERB_COUNT` and the header word alignment untouched, and that invariant has a recorded
  on-air failure behind it.
- **§12.4 separates PUNCH from SEAT.** A held plate stops punching (or §1's crosstalk returns inside
  one template) while its producer stays seated on its band layer. The DeckLink question becomes an
  implementation input rather than a blocking gate, because the decision names the fallback.

---

## 2. 🔴 The verdict on candidate D — measured, on four independent grounds

**D was tested first and taken seriously**, because if it worked it would be much the cheapest: every
layout would be an ordinary template the author already knows how to build.

1. **The mechanism does not exist.** `CG ADD` at cg-layer 1 → `202`, and the first page **dies**
   (50/s → 0). `INFO` reports ONE `<foreground>` with ONE `html` producer. **Both `UPDATE 0` and
   `UPDATE 1` are then answered by the survivor — the cg-layer argument is INERT.** Reproduced 3×.
   This is what `command-builder.ts:13-14` already said (`FLASH_LAYER = 0`, hardcoded into all five
   CG verbs); it is now a measured server fact rather than a convention.
2. **A replace costs ~3 frames** — 118 ms median = **2.95 frames** (2.80–3.13, n=8), fifteen times
   the cut's measured 0.20. The outgoing page dies ~22 ms after the command and does not wait.
3. **`LOADBG` genuinely rescues the cut — and one fact takes it back.** `LOADBG [HTML]` pre-warms
   (the backgrounded page fetches, paints and ticks at 51.7/s), `PLAY` cuts to it with **no load
   gap** (n=6), and `CG UPDATE` still reaches a page seated that way. But **a layer has exactly ONE
   background slot**: a second `LOADBG` destroyed a proven-live pre-warm (51.7/s → 0/s). With four
   layouts, one _announced_ alternative is gapless and the other three are not — and nothing can know
   which the operator will pick, which is what "so the operator cannot make a mistake" means.
   D's escape route (N layers, one template each, stacked) is the owner's original workaround, i.e.
   the configuration §1 measured producing both reported symptoms.
4. **Assignment cannot survive it.** The key is `(templateId, plateId)` and each layout is a
   different `templateId`. D is Family 2 with a nicer surface and inherits §3's disqualification.

Plus **D-4**: it cannot animate a rearrangement (§0.2, **cited not re-derived**, and strengthened —
the pages cannot coexist at all), so §12.1's phase two would need candidate A built anyway.

**Candidate B is recorded as WITHDRAWN with the owner's reason** — a layout is a designed SCENE, not
a set of rectangles, and computed geometry cannot carry a background at all. It is not "more
expensive than thought"; it is unable to express the requirement, which is the distinction that
should keep it from coming back when the schedule tightens.

---

## 3. ⭐ The recommendation: **A′**

Candidate **A**'s identity model with candidate **C**'s authoring affordance:

- a **BOX is a nested composition** holding its plate and its title;
- a **LAYOUT positions the box INSTANCES** and sets which non-plate elements (backgrounds,
  decorations, video) are visible;
- **per-layout geometry lives on the INSTANCE**, not on the plate.

Every part was verified rather than proposed. In particular **a plate inside a nested composition
punches correctly** — the flattener's instance path (`scene-flatten.ts:250-292`) and the builder's
`maskKeyPrefix` (`scene-builder.ts:265,399`) are composed from the same parts, so the hole lands in
the right element's own box at any depth or scale. The "no static scene-px rect" warning applies to
**stamped** scopes (repeater rows, sequence items), **not** to composition instances.

It makes §0.3 free, moves hole and declared rect together, and dissolves §3c.1's sixteen-placements
problem. **It is a recommendation, not a decision — §12.9 stays the one open gate.**

---

## 4. Two findings that will otherwise be re-derived, or "fixed" the wrong way

1. 🔴 **`collectLiveSources` has NO visibility filter while `sceneMaskHoles` does**
   (`scene-flatten.ts:354`). ⇒ **today a hidden plate is DECLARED but does not PUNCH.** Under
   §12.4's decision that is nearly the wanted behaviour — but it is keyed off the AUTHORED `visible`,
   not the layout state, so it is a coincidence rather than a mechanism. Named so nobody "corrects"
   the asymmetry in the wrong direction. Feeds `tasks.md` 2.5.
2. **The tree's ONLY exactly-one-of-N primitive excludes Live Sources by construction.** A `sequence`
   of composition items (D-083) is shipped and wired — and `flattenElements` descends into
   `container` and `composition` only, never a `sequence`, while stamped scopes get an EMPTY mask map
   on purpose. So a plate inside one **declares nothing and punches nothing, silently.** There is no
   precedent for a runtime-selected one-of-N sub-scene a plate can live in; A must invent it.

---

## 5. 🔴 A defect found while establishing what exists for text fitting (§13.7.4)

The owner's requirement — one title must fit a wide 1-box cell **and** a narrow 4-box cell.

**The schema offers THREE spellings of "make the text fit" and the runtime implements NONE:**

| Spelling                   | State                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fitMode: 'shrink-to-fit'` | the schema's own docstring says it is **not implemented** and renders like `fixed`                                                                                                                     |
| `autoSqueeze: boolean`     | 🔴 **the runtime never reads it** — `git grep -rn "autoSqueeze" -- packages/` returns **one hit, the declaration itself**. The Designer ships a control that writes it (`TextStyleSection.tsx:67,120`) |
| `overflow: 'shrink'`       | never read; every `style.overflow` in the runtime is a hardcoded `'hidden'`/`'visible'`                                                                                                                |

Only `fitMode: 'autosize'` works, and it does the **opposite**: it grows the box to the text.
**A shipped control that writes a field nothing reads is the same class as §5's Inspector defect.**

⚠ And the rule that fixes it **must measure the rendered box after shaping** — `@cg/text-shaping`'s
`truncate()` is code-unit based and is a length cap, not a width fit, so a count-based rule works for
Latin and fails for shaped Persian.

---

## 6. The numbers as REPORTED (superseded by §10.5 — they were minted later the same day)

Derived immediately before the commits by `docs/prd/b-number-registry.md`'s only supported method:
the local sweep **and** the all-refs widening sweep agree, `git stash list` is empty, and the
duplicate audit prints exactly `B-056` and `B-080` as it must (`C`/`D`/`P`/`R` print nothing).

| Prefix | Highest claimed (local and across every ref) | Next free   |
| ------ | -------------------------------------------- | ----------- |
| `B-`   | 144                                          | **`B-145`** |
| `C-`   | 024                                          | `C-025`     |
| `D-`   | 151                                          | `D-152`     |
| `P-`   | 036                                          | `P-037`     |
| `R-`   | 056                                          | `R-057`     |

**§12.7's ledger item: `B-145`, recommended home `docs/prd/bugs-runtime.md`** — it is a defect in
shipped behaviour (a restart strands seated producers unreachable by any code path), not new
capability, and `B-144` is its immediate neighbour and the same shape. If you read it instead as new
machinery, the runtime space's next free is `R-057`.

⚠ **There are now THREE pending `B-` items**, so they want three consecutive numbers:

| `tasks.md` | Item                                                                                                          | Suggested   |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| 1.11       | the live-layer ledger surviving a bridge restart (§12.7)                                                      | **`B-145`** |
| 1.9        | the Inspector's silent no-op assignment edit **and** its override-blindness (§5, §12.5)                       | `B-146`     |
| 1.12       | the text-fit defect — three spellings, none implemented; `autoSqueeze` writes a field nothing reads (§13.7.4) | `B-147`     |

Plus `tasks.md` 1.10, a PRD item for the feature itself, which is not a `B-` (the runtime space's
next free is `R-057`). **Nothing was minted.**

---

## 7. What was measured, and what was not

**Instrument.** The committed AMCP harness (`tools/caspar-amcp-probe/bin/live-probe-lib.mjs`) plus a
throwaway HTTP+beacon server on `192.168.21.93` serving instrumented pages that beacon at
script-eval, first-committed-frame (double-rAF), **once per animation frame**, and on every
`window.update`. The per-frame heartbeat is what makes a page's DEATH observable — that is why these
readings could answer a question session AQ's instrument could not. **The probe scripts live in the
session scratchpad, not in the repo** (this session was docs-only); §9.6 describes the instrument in
enough detail to rebuild it.

**Both controls ran before every reading that reads a silence.** Negative: a `CG ADD` at a URL the
harness 404s — accepted (`202`), the plant **did** fetch the bad URL from us, and **no beacon fired**.
Positive: the page is proven answering `CG UPDATE` and heart-beating (`< 5/s` ⇒ **VOID**, never a
value) before any silence is read as death.

⚠ **One reading was VOID and was rebuilt rather than interpreted**: the first pre-warm-slot test used
two pages that served the same id, so a survivor could not be told from a reload. It was redone with
a third distinct page.

**Not measured, and recorded as owed:**

- 🔴 **No pixels at all this session.** `PRINT` writes to the plant's own disk; SMB is open (port 445)
  but no share is readable from here (`\\192.168.21.50\d$`, `\c$`, `\media`, `\casparcg` all
  `Test-Path` false; `net view` lists nothing). Every reading is command- and renderer-side.
- **That a `LOADBG` background producer is not COMPOSITED** — CasparCG's defined semantics and
  consistent with everything observed, but unconfirmed. Starting the local 2.5.0 install to `PRINT`
  against was **blocked by the sandbox and was not worked around.** ⚠ **It cannot change D's
  verdict**: D loses under both branches — if the background is not composited, only one alternative
  can be pre-warmed; if it were, two pages would be on air and each masks only its own backdrop, so
  a hole in the upper one reveals its own backdrop hole onto the lower page, which is §1's crosstalk
  moved inside one layer. `tasks.md` 8.4.
- **Whether a hidden `<video>` keeps decoding in CEF** — `tasks.md` 8.3, and it matters: nothing in
  the tree pauses one, so four layouts with four video backgrounds may decode four videos for as
  long as the row is up.

---

## 8. The gate

`pnpm openspec validate multibox-layout-switch --strict` → **valid.**
`pnpm format:check` → **All matched files use Prettier code style.**

Every commit is docs-only (`openspec/**`, `docs/**`), so the docs carve-out applies. ⚠ The owner's
uncommitted `template-http-server.ts` is still in the tree and will still make a full `pnpm gate`
red, exactly as session AQ left it.

---

## 9. What was still open at that point — ⚠ SUPERSEDED by §10, read that

- 🔴 **§12.9 — the one remaining gate.** ✅ **CLOSED later the same day: A′ adopted (§10.1).**
  Nothing is gate-blocked now.
- **§13.6's two posed questions**: may the operator pick a mode per switch, and is the mode
  per-composition, per-layout or **per-PAIR**? ⚠ The owner's own example ("1-box→2-box move but
  3-box→1-box cut") is a per-pair statement — a third scope neither option named, costing **N² − N**
  entries (12 for four layouts). **Settle it before the authoring surface is drawn**; a per-pair
  table and a per-layout field are different UIs, not different defaults.
- **§13.7.2's posed question**: where the per-element "hide during a transition" option lives —
  noting it would be a **third** per-element visibility notion, so resolved visibility must come from
  ONE function.
- **Four ⟨MINT⟩ items** await numbers (§6 above).

---

## 10. ⭐ THE SECOND HALF OF THE SESSION — §12.9 closed, numbers minted, harness committed

The owner closed the last gate, minted the five numbers, and set three further tasks. What follows
is what changed after §9 above.

### 10.1 §12.9 is CLOSED — A′ adopted, and §12 now holds no open question

> **A′ — candidate A's identity model, with a box authored as a NESTED COMPOSITION and
> per-arrangement geometry on the INSTANCE.**

§12.9 was restructured so the **decision leads and the evidence follows** (subsections renumbered),
and the block that was "THE RECOMMENDATION" is now "ADOPTED". **No task in `tasks.md` is
gate-blocked any more.**

⚠ **A terminology change came with it, and it is not cosmetic.** The owner's answers introduce a
two-level model this document did not have:

| Term            | Meaning                                                             |
| --------------- | ------------------------------------------------------------------- |
| **COUNT**       | how many boxes — **what the operator picks**                        |
| **ARRANGEMENT** | a named geometry for a count; one per count is the authored default |

⇒ **§12.8's segmented control shows COUNTS, not arrangements** — a small bounded authored set — which
materially eases (without removing) its fixed-width collision with the verb grid.

**The four questions the owner posed AND answered** are recorded in §12.9.1 with each question
reconstructed beside its answer, since they arrived with their answers rather than from §13.6's posed
list: a default arrangement per count with the pick as **one action**; **declared cell order** in v1;
a **legible refusal** for more sources than the largest arrangement holds; and the same for a count
with no arrangement. The last two are written as **ONE refusal family with two triggers**, not two
refusals that happen to look alike.

### 10.2 🔴 ONE SHARED BACKGROUND — and the honest consequence for candidate B

The owner settled that **a single fixed background is enough**; per-arrangement backgrounds stay
supported but are not required. That takes the measured **−10 %** crossfade **off the default path**
and demotes §13.3's "both backdrops carry the mask" to a **conditional** requirement — kept in full,
not deleted, because the capability survives the decision. The −10 % and its 120 ms worst gap are
recorded **beside the optional capability**, so the next author reaching for it finds out from the
design rather than from a stuttering transition.

⚠ **And it weakens one of candidate B's two death reasons**, which the design now says out loud
rather than leaving to be noticed:

| B's death reason                                                                        | After this decision                                                                       |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| computed geometry cannot carry a background                                             | **WEAKENED** — if one background serves every arrangement, B no longer has to compute one |
| a layout is a designed SCENE — cell placement is a design decision, not a computed grid | **STANDS**, and it was always the stronger half                                           |

**A′ stands, on the surviving reason.** Per-box titles are a second independent answer to the same
question: a computed grid has nowhere to put an authored title, its colour and its font.

### 10.3 🔴 THE FADE LEAD — it works, and NOT by the obvious spelling

The owner's lead: fade the **mask's luminance** rather than the producer's opacity, so a grey hole is
a half-open hole and the backdrop progressively re-covers the picture. Probed on the plant (§9.6h):

| Reading                                                    | Result                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `transition: mask-image` between two gradients             | 🔴 **DOES NOT INTERPOLATE** — 0 intermediates                          |
| an `@property`-registered `<color>` feeding that gradient  | ✅ **9 intermediates** — this is the mechanism                         |
| grey → openness (SVG-mask → canvas **proxy**, same engine) | **α ≈ grey ÷ 255** — mid-grey IS a half-open hole                      |
| frame cost                                                 | **−3.4 %**, worst gap 60 ms — the **cheapest animated thing measured** |

**The negative is recorded beside the positive on purpose:** anyone who tries the obvious spelling
first would conclude the lead is dead.

⇒ 🔴 **The fade moves to the FREE side of the boundary** — no `MIXER`, no server half, no second
clock — so **`linear` now binds exactly ONE mode: move.** And it animates **inside** the shipped
`mask-mode: luminance` path, so unlike §13.4's `clip-path` route it needs **no second mask mechanism
at all**.

⚠ **Two things it does not settle**, and they are why this is a lead answered rather than a mechanism
finished: the transfer curve is a **proxy** (the CSS path over a live plate is `tasks.md` 8.5), and
α ≈ grey/255 is an **engine** property a CEF bump could change — SVG 1.1 specifies linearRGB, which
would have made 50 % grey ≈ 21 % open and the fade visibly front-loaded. It wants a pinning test, not
a comment.

### 10.4 The wording corrected

§13.2 now carries **both halves together, so neither can travel alone**:

> A background transition is **FREE OF THE SYNC PROBLEM** — no `MIXER`, no second clock. It is **NOT
> free of COST**: measured, the full-frame backdrop crossfade is the **expensive** half (−10 %) and
> the interpolating holes the **cheap** one (−4 %) — the inverse of the intuition.

### 10.5 The numbers — minted, with the sweep on both sides

**Confirmed free by heading sweep BEFORE writing**, per the registry's only supported method: the
exact-number sweep and the all-refs widening sweep both returned **0 headings** for all five, the
maxima were `B-144` / `D-151` / `R-056`, and `git stash list` was empty. **`D-152` was free, so the
stop condition did not fire.** Re-audited after writing: the duplicate sweep still prints exactly
`B-056` and `B-080`, and `C`/`D`/`P`/`R` print nothing.

| Item                                                 | Number      | File                                                       |
| ---------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| the un-persisted live-layer ledger                   | **`B-145`** | `bugs-runtime.md` — and marked **blocking `R-057`**        |
| the Inspector's missing refusal / surfacing          | **`B-146`** | `bugs-runtime.md`                                          |
| three spellings of "make text fit", none implemented | **`B-147`** | `bugs-designer.md`, cross-referenced from the runtime side |
| the arrangement switch — OPERATOR half               | **`R-057`** | `runtime.md`                                               |
| the arrangement switch — DESIGNER half               | **`D-152`** | `designer.md`                                              |

**Two parent items, each naming the other** in its opening lines and again in its cross-refs, on the
`D-137` / `C-015` precedent. `B-147`'s runtime-side cross-reference is a deliberate
**NOT-a-second-item** note, mirroring the `B-140` / Splitter note that already runs the other way: a
runtime reader meets it as an on-air defect (a long Persian name overflowing a narrow 4-box cell)
whose cause and fix are both in the Designer.

### 10.6 The harness is in the repo

`tools/caspar-amcp-probe/bin/beacon-probe-lib.mjs` (the page half) and `arrangement-probes.mjs` (the
eight §9.6 readings, runnable by name), with a README section. The control discipline is **in the
code**: `assertAlive()` throws VOID rather than returning false, and `negativeControl()` checks three
things — the command was accepted, the plant **did fetch** the bad URL, and no beacon fired.

🔴 **Verified by RUNNING it, not by reading it.** `cg-layer` reproduced _REPLACE — the cg-layer
argument is INERT_ with both controls holding and the channel clean afterwards; `mask-luminance`
reproduced the transfer curve, the `mask-image` negative and the `@property` positive **to the
digit**.

---

## 11. ⚠ Flags for the next session

- **This diff is no longer docs-only** — `tools/caspar-amcp-probe/` carries instrument code, so the
  full `pnpm gate` applies rather than the docs carve-out. Nothing visual was touched, so **no Linux
  `gate:e2e` is owed.**
- **The owner's uncommitted `template-http-server.ts` hack is still in the tree, untouched.** ⚠ Worth
  correcting session AQ's note about it: it is **NOT** keeping the gate red. `@cg/caspar-bridge`
  lints clean and its 451 tests pass with the hack in place — it only leaves lines 42–48 of that file
  uncovered.
- **`B-145` blocks `R-057`.** The switch must not ship before the ledger survives a bridge restart.
- **Still owed as measurements:** `tasks.md` 8.3 (does a hidden `<video>` keep decoding?), 8.4 (is a
  `LOADBG` background composited? — cannot change D's verdict), and **8.5 (the CSS-path confirmation
  of the luminance transfer, plus a pinning test for α ≈ grey/255)**.
- **Still POSED, not decided:** §13.6's two — may the operator pick a mode per switch, and is the
  mode per-template, per-arrangement or **per-PAIR**; and §13.7.2's — where the per-element
  "hide during a transition" option lives.
