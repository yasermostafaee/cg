# Session AF — Live Source phase 6 part 1: every piece of the picture, and the one that is missing

**Branch `dev`. Four unit commits, one docs commit, one push.**

| commit     | unit | what                                                                       |
| ---------- | ---- | -------------------------------------------------------------------------- |
| `c2e627b9` | A    | 6.1 — `playSource` / `mixerFit` / `mixerClear`, all layer-scoped           |
| `75c6bd08` | B    | 6.2 · 6.2a · 6.2b · 6.4 — one placement arithmetic, contract-pinned        |
| `eeb7a844` | C    | 6.3 — the fit-aspect chain, its refusal, and the D-147 decision            |
| `a3ce3d07` | D    | 6.6 · 6.7 — teardown resets the mixer; an unassigned plate refuses by name |

## 🔴 What a plate does on air: STILL NOTHING. Read this first.

The brief asked what a plate now does on air, and the honest answer is **nothing yet** —
so no ticked box in `tasks.md` should be read as saying otherwise.

Every **component** exists and is tested: the commands, the geometry, the fit policy,
the refusals, the teardown. **What does not exist is the CALL SITE that strings them
together** — the take path that resolves a template's plates, allocates layers from
`layerRange`, sends `playSource` + `mixerFit`, and calls `registerLiveLayers` with what
it actually sent.

⚠ **That assembly is not an enumerated task anywhere in phase 6.** 6.1 builds the verbs,
6.2 the arithmetic, 6.3 the policy — and nothing says "call them". The nearest thing is
6.8's two-box demo, which cannot run without it. **This is a gap in the task list, not a
unit I skipped**, and it is the single most important thing for part 2: file the assembly
as its own task and do it FIRST. Both remaining clusters — 6.5 (audio) and 6.9 (swap) —
hang off a seating path that does not exist.

I did not wire it because it is a substantial change to `take()` with real on-air risk and
it was outside the four units the brief scoped. Starting it would have meant leaving it
half-done, which the stopping discipline forbids.

## Stale line numbers in the brief — checked, and four were wrong

The brief asked me to say so loudly. Verified at `0f225f7b`:

| claim                                           | actual                |
| ----------------------------------------------- | --------------------- |
| `caspar-runtime.ts:2718-2724` (channel-scoped)  | **3237–3241** — stale |
| `caspar-runtime.ts:3681-3684` (`positionQuery`) | **4354–4358** — stale |
| `position.ts:202-204` (`css()`)                 | **226** — stale       |
| `scene.ts:260` (`positionQuery`)                | **299** — stale       |
| `output-position.test.ts:162,169`               | ✅ correct, both      |
| `command-builder.ts:128-130`                    | ✅ correct (129–131)  |

Session AE's own commits moved most of `caspar-runtime.ts` past 2450, which accounts for
the two large drifts. All symbols were located by name.

## The two findings worth carrying forward

### 1. The contract test's teeth were verified by MUTATION, not assumed

6.2b requires a non-16:9 raster because on 16:9 every term collapses. Rather than trust
the argument, I removed `pad` from the chain and re-ran: **only the 1440×1080 and 720×576
rows failed — every 16:9 row still passed.** That is the "test that passes for the wrong
reason" class demonstrated. The implementation was restored immediately; the evidence is
in the commit message and the task note.

The test's tolerance is stated in raster **pixels** and derived, not picked: the page
rounds CSS to 6 decimals, so `s = 2/3` arrives as `0.666667` and a coordinate of ~1920
inherits ~0.002px of error. A hundredth of a pixel is the tightest honest bound — four
orders of magnitude below the failure it exists to catch (a fifth of a FRAME).

### 2. The geometry lives in `@cg/shared-schema`, not in the bridge — deliberately

design.md §6 says "the derivation lives in the BRIDGE", and it still **runs** there
(`CasparRuntime.liveSourceFitFor`). But the pure arithmetic is in `@cg/shared-schema`,
because 6.2b's contract test has to import **both** sides and a bridge-local function
would have forced it to re-implement one — which is exactly the second spelling both
guards exist to prevent. Flagging it so it does not read as a drift from the design.

## ⭐ The D-147 decision — OWNER-VISIBLE, and cheap to reverse

**When neither the source nor the element states an aspect: ASSUME the hole's own shape
(no crop) and mark the result `assumed`. NOT a refusal.**

🔴 The argument that settled it comes from the **code**, not from taste, and is on its own
sufficient: **refusing would outlaw `AUTO`.** `LIVE_SOURCE_FORMATS` includes it,
`aspectForFormat` returns `null` for it and for nothing else, and its own docstring calls
it _"a request to the hardware, not a statement about the picture"_. An operator who picks
`AUTO` has configured the system **correctly** — refusing their take would make a
supported catalog value unusable with nothing in the UI able to say why.

Three supporting reasons: this design's refusals are for **conflict**, not for the absence
of a cosmetic detail; the harms are not comparable (a possibly-stretched picture, which is
today's behaviour for every source, versus a **black box where a guest should be**); and
§3's ladder is written as degradation, with D-147 having made `expectedAspect` optional
precisely so nobody is forced into a guess that can refuse a take on air.

⚠ **Owner: this is a judgement about which on-air failure is worse, and you may weigh it
differently.** `assumed` is the seam — it is its own field, not `aspect === null`, because
the two answer different questions — so switching to a refusal is a change at
`resolvePlateAspect` and its callers, not a redesign.

## Owed to hardware — unticked and named

- **6.3a(a) — is `CLIP` purely an INTERSECTION mask under PARTIAL overlap?** 🔴 **The code
  now DEPENDS on the intersection reading**: `liveSourceFit` emits exactly that geometry on
  every cropped plate. The mock models it as an intersection, so the offline tests prove
  the code is self-consistent and prove **nothing about the server**. Two `route://`
  producers settle it; no capture card needed. Deliberately not reasoned out.
- **6.3a(b) — what precision does AMCP accept?** `CommandBuilder` emits at most 6 decimals
  and never exponential notation (`String(1e-7)` would produce `1e-7`, which no AMCP parser
  is known to accept). ⚠ **6 was chosen to match the page's `css()` so the two sides round
  identically — NOT because the server is known to want it.** `numberArg` is the one place
  to change. Still unmeasured.
- **6.8 / 6.8a / 6.8b** — untouched, as instructed. Blocked on the plant.
- **DECKLINK and NDI argument spellings are PARSE-VERIFIED ONLY** — no capture card, no NDI
  source. C-021's debt, stated in `playSource`'s own docstring.

Ride 6.3a with §3b's `DEFER`/`COMMIT` question and 6.9a's replace measurement — all three
are AMCP probes on the same 2.3.2 build, and pairing them costs one session instead of three.

## ⚠ 6.8c — AN OPEN OWNER QUESTION, surfaced and not answered

**Which layer does CIAB put the studio picture on?** No measurement in this repo can answer
it and no code can discover it: it is an installation fact owned by the playout system.
Nothing is blocked in CODE — the schema accepts the address and the SourcesModal renders it
— but the value the operator must type is unknown, and **a guess puts an arbitrary layer's
picture inside a guest frame on air.** For the owner, to be put to CIAB.

## Gate and E2E

`pnpm gate` green — **85/85 tasks, `0 cached`** (the uncached run) — and
`openspec validate --all --strict` 50/50, plus `openspec validate live-source-multibox
--strict`.

🔴 **A Linux `gate:e2e` IS OWED.** The rule that applied: the change touches
`packages/shared-schema/` and `packages/template-runtime/`, both of which are in
`UI_RENDER_PATTERNS`' render-dependency closure — so it is classified as able to affect
what renders, even though the page-side change is a re-export refactor with 899
template-runtime tests unchanged. Discharge needs a COMPLETED, GREEN `e2e` job that
actually RAN, cited by run URL.

## NOT done, by instruction

The 6.5 audio cluster, the 6.9 swap cluster, 6.8/6.8a/6.8b (hardware), §1.5's punch tasks,
minting any number, archiving, merging to `main`.

## P-014 flag

**Product source, on-air path.** These commits add the first AMCP verbs this bridge can use
to put a non-html producer on a layer, and the first teardown that resets channel mixer
state. Nothing calls them yet — see the top of this file — so nothing changes on air today,
but the next session's assembly makes them live. No shared config changed.
