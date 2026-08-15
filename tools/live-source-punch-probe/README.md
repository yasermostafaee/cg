# Live Source backdrop-punch probe — task 1.5b

**Status: RUN 2026-08-15 at the plant, then RE-MEASURED the same day — and the re-measurement
CONTRADICTED the hand-run verdict for mechanism B.**

> 🔴 **MECHANISM A FAILS. MECHANISM B WORKS.** The hand-run recorded "no visible effect at all" for
> B, which was read as a failure. It was not: **this kit's own mask was a no-op.** `maskUri()`
> encodes its holes in LUMINANCE ("white keeps, black punches") while CSS `mask-image` masks by
> ALPHA, where `#fff` and `#000` are both fully opaque. A mask that applies and punches nothing has
> the same signature as a mask that never applied — which is exactly the ambiguity the result form
> below flags and could not resolve.
>
> Scripted re-run on the same build with `mask-mode-diagnostic.html`: the SAME SVG plus
> `mask-mode: luminance` punches both plate rects, and over a transparent page **CasparCG
> composites the lower layer through the holes** (`#00ffff` in both plates, backdrop `#d00000`
> intact between them). **The punch IS a CSS problem and it is solved**; `design.md` §9b is not
> forced. `punch-probe.html` is FIXED so the kit no longer carries the defect.

The filled result form is at the bottom of this file and it is the record of the hand-run; the
paragraphs below summarise it. **Read the correction above first** — the form's conclusion for B is
superseded, and it is kept unedited because a measurement record that has been tidied is not a
record.

> ⚠ **SUPERSEDED — this was the hand-run's conclusion and it is half wrong.** It read: neither
> mechanism produced real transparency, so the punch is not a CSS problem and §9b becomes the live
> option. **Mechanism A's half stands. Mechanism B's does not** — see the correction at the top.
> Kept because the reversal is only legible beside what it reversed.

**A second positive finding, from the hand-run and still standing:** §9a.1's SCOPING works.
Mechanism A's erase was confined to an inner fill node and it did **not** eat the outer frame or
the shadow — criterion 2 passed. A is dead on criterion 1, but the scoping question it answered
transfers, and mechanism B satisfies criterion 2 for free: it never erases the plate's own paint.

🔴 **The build was NOT what this kit assumed** — and the owner has since settled it. Production is
**CasparCG 2.5.0 (`69e8ad5` Stable) with Chromium 142**; **2.3.2 is RETIRED**. So every reading here
is a production reading, and the "measure on 2.3.2 / CEF 71" instruction below — this file's own —
is stale text. A retired 2.3.2 install still sits at `D:\programs\CasparCG`; never point a probe at
it. Record the build string beside every result: the next upgrade makes today's answers historical.

- The task: `openspec/changes/live-source-multibox/tasks.md` §1.5b (extended by §1.5f)
- The design: `openspec/changes/live-source-multibox/design.md` §9a and §9a.1
- The page: [`punch-probe.html`](./punch-probe.html) — one self-contained file, no build step

---

## Why this exists

The whole HTML page is **one CasparCG layer**, sitting above the Live Source layers. A multi-box
layout normally carries a **designed opaque backdrop** behind its boxes — that is what the client
authors. Painting nothing at the plate is therefore **necessary and not sufficient**: the backdrop
survives at the plate's rect and the live picture behind the layer is never seen. The plate has to
**erase** what the template painted beneath it.

Two mechanisms could do that. **Neither has been chosen, and choosing one on reasoning is the
mistake this task exists to prevent.** They behave differently on a Chromium-71-era CEF in ways that
are not predictable from a modern browser — `B-066` was exactly that: a `tsconfig` setting that
passed every local check and `SyntaxError`d on CEF 71, on air.

> ⚠ **STALE — superseded 2026-08-15.** This said "measure on the CEF inside the plant's CasparCG
> 2.3.2". Production is **2.5.0 / Chromium 142** and 2.3.2 is retired. The instruction's INTENT
> stands and is the reason this kit exists: **a desktop-Chrome result answers a different question
> and does not count.** Only the version is wrong.

---

## ⚠ The AMCP forms in this file were WRONG, and are corrected

🔴 **CORRECTED 2026-08-15 — the forms above were WRONG in the first edition of this file and every
one of them returned `#400 ERROR` at the plant.** AMCP's `CG` verb takes the **channel-layer FIRST
and the verb SECOND**, plus the flash-layer number: `CG <ch>-<layer> ADD <flash> "<template>" <play>`,
`CG <ch>-<layer> NEXT <flash>`, `CG <ch>-<layer> UPDATE <flash> "<json>"`. The earlier text put the
verb first (`CG ADD 1-10 …`), which parses as nothing.
**This was a defect in this README ALONE — the product has always been right.** Verified, not
assumed: `tools/caspar-bridge/src/command-builder.ts` emits `CG ${target(slot)} ADD …`,
`CG ${target(slot)} PLAY …`, `CG ${target(slot)} NEXT …` — target first, verb second, hardware-
validated under ADR 0006. Nothing in the product needed changing; only this file did.
Same class as §9.3's unrunnable instruction: **an instruction nobody ran is an instruction nobody
checked**, and the cost lands on someone standing at a rack.

---

## Running it

1. Copy `punch-probe.html` into the CasparCG server's `templates/` directory.
2. Put **any visible producer on a LOWER layer** of the same channel — colour bars, a clip, a live
   input, anything you can recognise through a hole. Example:

   ```
   PLAY 1-5 "AMB"
   CG 1-10 ADD 1 "punch-probe" 1
   ```

3. Cycle the three states with **`CG 1-10 NEXT 1`**. Nothing else needs typing.
   Other ways in, if that one is awkward: click the output preview, press `0` / `A` / `B`, open the
   file with `?m=a`, or `CG 1-10 UPDATE 1 "{\"m\":\"a\"}"`.

The page prints the active mechanism and the **browser's user-agent string** in the corner, so a
photo of the screen records which CEF the measurement was taken on.

### The three states

| State        | What it is                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **0 — none** | **Control.** No punch. The backdrop covers both plates.                                                                         |
| **A**        | `mix-blend-mode: destination-out` on an **inner fill node**, with the frame and shadow on the **outer** node (§9a.1's scoping). |
| **B**        | The **backdrop** is masked with the plate rects. The plates erase nothing.                                                      |

🔴 **Check state 0 first, every time.** If the live layer is already visible through a plate in the
control state, the backdrop is not opaque, or it is not beneath the plates, and no reading taken
afterwards means anything. State 0 should look **wrong** — that is what makes states A and B
readable.

---

## The pass/fail card

**Two criteria. They are independent — criterion 2 is not a refinement of criterion 1.** A mechanism
that punches perfectly and eats its own frame passes (1) and **fails the feature**.

### Criterion 1 — the hole is really transparent

- Looking at the **programme output** (not a browser preview), the lower layer's picture is visible
  through **both** plate rects.
- The visible area is the **whole plate rect**, not part of it, and not a lighter or darker version
  of the backdrop.
- ✅ pass — the live picture is there. ❌ fail — the backdrop is still there, or the region went
  black/grey/translucent instead of clear.

### Criterion 2 — the frame and the shadow survive

- The **orange frame** is drawn all the way around both plates, unbroken, at full width.
- The **drop shadow** is still visible around each plate.
- ✅ pass — both intact. ❌ fail — the frame is missing, partially eaten, thinned on one or more
  sides, or the shadow is gone.

> An erase driven by the element's own painted alpha — which `destination-out` is — will erase the
> frame too unless it is scoped to the fill area. Mechanism A in this page **is** scoped that way, so
> if the frame still disappears, the scoping does not hold on this CEF and that is the finding.

### Record the measurement, not the expectation

Write down what the screen did, including "it did something I did not expect" and "I could not
tell". A null or confusing run is a real result and is worth more than a tidy one that was partly
guessed — §9.3 of this project produced an instruction that could not be run as written, and a first
attempt at it scored a null run as a verdict. Both cost a trip.

---

## Result form — FILLED, 2026-08-15

**This is the record of the run.** It is reproduced verbatim as delivered; the blank template it
replaced is in git history if another probe ever needs one.

```text
LIVE SOURCE PUNCH PROBE — RESULT
date:                        2026-08-15
run by:                      owner, at the plant
CasparCG version:            2.5.0 69e8ad5 Stable    ⚠ NOT 2.3.2 — see "unexpected" #1
CEF / user-agent string:     Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
                             (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36
channel / layer used:        1-10, CG layer 1
producer on the lower layer: 1-5 — m.mkv (1280x536), LOOP

state 0 (control) — backdrop covers both plates?      YES
  Opaque diagonal-striped backdrop over the whole frame; both plates show the backdrop
  inside them and no video whatsoever. Orange frames thick and unbroken, drop shadows
  clearly visible. Rig is sound, so A and B are readable.

MECHANISM A — mix-blend-mode: destination-out
  criterion 1  hole really transparent, live layer visible?   FAIL
  criterion 2  frame AND shadow intact?                       PASS
  notes: The erase DID happen inside the page — the backdrop's diagonal stripes vanished
         from both plate rects — but the result was OPAQUE BLACK, not alpha 0. CasparCG
         composited that black over the live layer.
         Verified, not assumed: CLEAR 1-10 removed the probe and the video was fully
         visible and running, so the black is the punch's own output and not a dead
         source. (A second alternative explanation was computed and rejected: the clip
         is 1280x536 and letterboxes in 1080, but both plate rects fall inside the
         active picture area, not on a bar.)
         Criterion 2 is a genuine POSITIVE finding: §9a.1's scoping — erase on the inner
         fill node, frame and shadow on the outer node — HELD on this CEF. The frame was
         not eaten: full width, unbroken, all the way around both plates, shadow intact.

MECHANISM B — mask the backdrop
  criterion 1  hole really transparent, live layer visible?   FAIL
  criterion 2  frame AND shadow intact?                       PASS (trivially — B erases nothing)
  notes: NO VISIBLE EFFECT AT ALL. State B is indistinguishable from state 0 — the
         backdrop's stripes are still fully present inside both plate rects.
         ⚠ This signature CANNOT distinguish "the mask applied but does not reach page
         alpha" from "the mask never applied at all". Recorded as FAIL with the ambiguity
         stated rather than resolved. If B is ever revisited, the first job is to prove
         the mask applies at all.

photo / capture taken?       YES — screenshots of state 0, state A, state B, and the
                             CLEAR 1-10 control check.
anything unexpected:
  1. 🔴 THE BUILD IS NOT WHAT THE KIT ASSUMED. The server is 2.5.0 (69e8ad5 Stable) and
     its CEF is Chromium 142 — not 2.3.2 / CEF 71. The kit's entire CEF-71 premise did
     not apply to this run.
     The conclusion is nevertheless ROBUST DOWNWARD: a modern Chromium failing means
     CEF 71 certainly fails. 1.5b therefore does NOT need a second run on 2.3.2.
  2. 🔴 THE KIT'S OWN AMCP EXAMPLES DO NOT RUN AS WRITTEN. The README puts the verb
     before the channel-layer (`CG ADD 1-10 "punch-probe" 1`, `CG NEXT 1-10`,
     `CG UPDATE 1-10 …`). Every one returns #400 ERROR. The working forms are:
         CG 1-10 ADD 1 "punch-probe" 1
         CG 1-10 NEXT 1
         CG 1-10 UPDATE 1 "{\"m\":\"b\"}"
     Same class as §9.3's unrunnable instruction. The README must be fixed before the
     next person takes it out.
  3. Chromium 142 honours border-radius on an `outline` (needs ~94), so 1.5d's stated
     obstacle does not exist on THIS build. Unlike 1.5b, that finding does NOT survive
     downward — it depends on which version production actually runs.
```

### Reading the two failures — what each one licenses

They are **different kinds of negative** and must not be collapsed:

- **A is a DECISIVE failure with a diagnosed cause.** The erase happened — the stripes went — and
  produced **opaque black rather than alpha 0**. That is not "the mechanism did nothing"; it is the
  mechanism working inside the page and the result never reaching the page's ROOT alpha, which is
  precisely the SCOPE risk §9a listed against this candidate and refused to settle by reasoning.
  The control check (`CLEAR 1-10`, video visible and running) rules out a dead source, and the
  letterbox alternative was computed and rejected. Nothing further is owed here.
- **B is an AMBIGUOUS failure and is recorded as such.** "No visible effect" cannot distinguish
  _the mask applied and does not reach page alpha_ from _the mask never applied at all_. It is
  scored FAIL because it did not deliver transparency, which is what the criterion asks — but it
  is **not** evidence about masking as a technique. **If B is ever revisited, the first job is to
  prove the mask applies at all**, and nothing in this run may be cited as having tested that.

**Why the overall conclusion does not depend on B's ambiguity:** the kit's rule is _both must fail
for the punch to be a non-CSS problem_, and A's failure is decisive on a modern engine. B being
ambiguous makes B's own verdict weaker; it does not make the punch more available.

---

## What happens next — ANSWERED by the run above

- **1.5b is CLOSED.** The form above is the answer, and it needs no second run: the failure was
  measured on Chromium 142 and is **robust downward** to CEF 71.
- **Neither mechanism passed, so per this kit's own rule the punch is NOT a CSS problem** and
  `design.md` **§9b** — the multi-box on a channel of its own — becomes the **live option rather
  than the fallback**. §9b was previously "evaluated, recommended in principle, NOT adopted",
  gated on §12.5's four measurements plus one owner question. **Those measurements move onto the
  critical path.** Adoption is still the owner's call and this run does not make it.
- **1.5c, 1.5f and 1.5h are UNBLOCKED in the sense that their answer is determined** — they are
  re-scoped around §9b, not around implementing a CSS punch. In particular **1.5h (passthrough)
  was defined as "the punch with nothing put beneath it"**, so it does not survive the punch's
  absence in its current form and must be re-derived from §9b or dropped.
- **§9a.1's SCOPING is a positive result and is worth carrying forward.** An erase confined to an
  inner fill node did not eat the outer frame or shadow on CEF 142 — criterion 2 passed. Whatever
  §9b becomes, the constraint 1.5f placed on the mechanism is satisfiable.
- **1.5d (`border-radius`) — the stated obstacle does not exist on Chromium 142**, which honours
  `border-radius` on an `outline` (needs ~94). ⚠ **This finding does NOT survive downward.** Unlike
  the punch failure, it depends on the engine being NEW, so it holds only for a plant on 2.5.0 and
  says nothing about a 2.3.2/CEF-71 install. Do not promote it to a general fact.

### 🔴 One thing this run settles that is bigger than 1.5b: which server the plant actually runs

This kit — and much of the `live-source-multibox` change — instructs the reader to measure on
**CasparCG 2.3.2 / CEF 71**. **The plant runs 2.5.0 (`69e8ad5` Stable) with Chromium 142.** That
build is not new to the repo: `docs/prd/bugs-runtime.md` records the same `69e8ad5` in live sessions
from 2026-07-07 onward, and one note there says a finding was "confirmed on BOTH server
generations", so two generations have genuinely been in play.

⭐ **SETTLED BY THE OWNER, 2026-08-15: playout runs 2.5.0 and 2.3.2 IS RETIRED.** So this probe ran
on the production build and its answer is a production answer — the robust-downward argument above
is true but no longer load-bearing.

🔴 **That makes roughly two dozen "measure on 2.3.2 / CEF 71" instructions in the change STALE TEXT
rather than a fork to navigate**, this file's own "Why this exists" section included. A stale 2.3.2
install still sits at `D:\programs\CasparCG`; **never point a probe at it**, or CEF-71 answers get
recorded as production. Record the build string beside every result regardless — the next upgrade
makes today's answers historical, and a result without its build outlives its truth.
