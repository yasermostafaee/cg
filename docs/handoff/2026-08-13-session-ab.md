# Handoff — 2026-08-13, session AB (a span starting at frame 0 started its run at frame 0)

One defect, reproduced as a failing test with the owner's own one-frame control, diagnosed by
instrumentation, and fixed. A SECOND, pre-existing defect of the same class was found on the
neighbouring path and is **left open on purpose** — see "What is still broken".

**Corrects a design note from [session X](./2026-08-13-session-x.md):** the lifespan gate is
NOT "visibility-only". Read that section before trusting the old wording.

---

## The defect, and what caused it

A composition with a backdrop (video OR Lottie — the kind is irrelevant), a ticker,
`holdSource: 'content-driven'` and a PINNED `contentStart`:

- ticker span starting at frame **0** ⇒ the crawl began at frame 0, not at the content start;
- ticker span starting at frame **1** ⇒ correct.

**The cause is one call, and it is not a falsy-zero guard.** `PlayoutController.playRange`
collapses a leg to a single end-frame paint when nothing in it is frame-dependent — and a
collapsed leg calls its `onEnd` **synchronously**. For the ENTRANCE leg
`[active.in → holdEntry]` that `onEnd` is `onContentStart()`, which resets and starts the
scope's ticker / clock / sequence drivers. So a collapsed entrance starts the content at play.

Whether it collapsed came down to `hasAnimation || needsFrameSweep(inF, outF)`:

- The owner's compositions have **no keyframes** — a video or Lottie backdrop contributes no
  `scope.animated` entry — so `hasAnimation` is false. This is why both backdrop kinds behave
  identically: neither is what decides it. The Lottie/video asymmetry was never real.
- That leaves `needsFrameSweep`, whose lifespan term is `lifespanGateChangesInRange`: does a
  gate TRANSITION land in `(inF, outF]` — **strictly after `inF`**. A span starting at frame 0
  is already ON at the leg's first frame, so it does not transition: no sweep, collapsed leg,
  content at frame 0. A span starting at frame 1 transitions inside the leg: sweep, real
  duration, content on time.

That is the whole of the owner's one-frame control. **The strict `>` is correct** for the
question `lifespanGateChangesInRange` actually asks (a PAINT question — "does any frame here
differ from `outF`?"). The bug is that a **timing** guarantee was resting on the answer.

### The instrumentation that showed it

`packages/template-runtime/tests/content-start-span-at-frame-zero.test.ts`, run before any
fix — 4 failed / 4 passed, splitting exactly on the control:

| case                                               | pre-fix                          |
| -------------------------------------------------- | -------------------------------- |
| ticker / sequence / countdown, span at frame **0** | **FAIL** — run begins at frame 0 |
| the same three, span at frame **1** (the control)  | pass                             |
| ticker with **no span at all**                     | **FAIL**                         |
| marker-less (heuristic) path                       | pass                             |

Two of those rows are findings the owner's report did not contain:

- **All three content kinds share it.** Ticker, sequence and countdown go through one
  `onContentStart` → `startOwnContent()`, so they were fixed together.
- **"Span at frame 0" was never the real condition.** A ticker with **no span at all** fails
  identically (no gates ⇒ `needsFrameSweep` is `undefined` outright). The real condition is
  "no gate boundary strictly inside the entrance leg", and the gate is per-SCOPE — in the
  owner's composition the ticker's own span was simply the only one that could supply one.
  That is also why the earlier "shorten the ticker" workaround appeared to help.
- **The marker-less path is genuinely unaffected**, and provably so rather than by luck: with
  no marker, `holdEntry` can only be later than `active.in` because of keyframes or a Lottie
  settle, and both already force the sweep (`hasAnimation`; D-125 Phase 3a's lottie term).

## The fix

`packages/template-runtime/src/playout-controller.ts` — `playRange` gains a
`mustConsumeDuration` flag; the entrance leg passes it when the content-start moment is
**anchored**, i.e. `lifecycle.contentStart` is authored.

The collapse decides a PAINT question and answers it correctly; what it may not decide is a
CLOCK question. A leg whose completion is an event at a scheduled moment must consume its real
duration even when nothing on screen moves.

**Scoping it to an authored marker is load-bearing, not tidiness — the first attempt without
it cost 52 test failures.** `holdEntryFrame` has two provenances that the frame number alone
cannot separate:

- an authored marker — a promise about time, which the leg must honour;
- `entranceSettleFrame`'s fallback, which returns `outPoint` **verbatim** for a scene with no
  keyframes and no Lottie settle. That is the "there is NO entrance" sentinel. Forcing that leg
  to consume `[active.in → outPoint]` delays content by the whole composition, which is exactly
  what those 52 failures were.

`outF <= inF` still short-circuits ahead of the flag: a zero-length entrance has no duration to
consume. The static-settle leg and the outro end at a paint, so they still collapse as before.

## 🔴 What is still broken — the mirror defect, left open deliberately

The same conflation is still live on the **marker-less** path, and it swings the content start
by the whole composition in the OTHER direction. Measured, not reasoned:

```
marker-less, no keyframes, out-point frame 90 (1800ms)
  ticker UNTRIMMED          ⇒ crawl starts at PLAY (0ms)
  ticker trimmed from fr. 5 ⇒ crawl starts at the OUT-POINT (~1800ms)
```

One trim, an 1800 ms difference, nothing else changed.

**It is not fixed here because fixing it is a design decision, not a repair.** Both readings
have a real claim: `holdEntry === outPoint` semantically says "content starts at the out-point"
(the D-104 suite's "no early settle" test asserts precisely that for a keyframed entrance),
while "content at play" is the long-standing behaviour every static scene relies on — those 52
failures are what choosing the other way costs. That is the owner's call, and §10.2's
content-driven-hold decision was explicitly out of scope for this session.

It is pinned as a two-test `OPEN` block at the foot of the new suite, asserting the ASYMMETRY
rather than blessing either side, so whoever settles it fails the tests and is sent to the
note. (Session N's lesson: a test written to encode a decision makes that decision
un-falsifiable — 790 green tests once protected a wrong rule for exactly that reason.)

## Session X's design note is narrower than recorded — corrected

Session X established that the lifespan gate is **visibility-only**, so trimming a span cannot
shorten a content-driven hold. The brief asked me to say explicitly if that turned out to be
too broad. **It is.**

- **What survives:** the gate's own ACTION is still visibility and nothing else
  (`applyScopeLifespanGatesAtFrame` sets `display`), and trimming a span still cannot shorten a
  content-driven **hold** — the hold's length comes from `waitForContent`, which no gate
  touches. X's conclusion about the hold stands.
- **What does not:** the gate's **PRESENCE** was never inert. Via
  `lifespanGateChangesInRange` → `needsFrameSweep` it decided whether the entrance leg swept,
  and therefore **when the content drivers ran** — in both directions (early, on the anchored
  path; late, on the marker-less one). So "trimming an element only changes what you can see"
  was false as written.

The distinction that matters for the next reader: **the gate does not affect the hold, but it
did affect the START.** Those are different clocks, and conflating them is what made this look
like a Lottie/video asymmetry for as long as it did.

## The falsy-zero sweep — nothing found, and this bug was not that class

The brief asked for a sweep on the precedent that frame 0 is the only falsy frame number, and
for the result to be reported even if empty. Swept `packages/*/src` and the designer store for
`||` on frame/time values, bare truthiness on frame-ish identifiers, `Boolean(...)`, and
truthy ternaries on frame values.

**Nothing.** Every hit was either a boolean genuinely named `settled` (a promise flag, not a
frame) or a proper `===`. The designer store's `updateElementLifespan` handles removal by an
explicit `=== null`, so a `lifespan` with `in: 0` is preserved rather than normalised away, and
neither `@cg/shared-schema` nor `@cg/vcg-format` drops it.

**This defect was a different class**, and it is worth naming so the next reader does not go
looking for the wrong shape: not a falsy zero but a **boundary-correct paint predicate that a
timing seam was resting on**. Grep will not find that class — the tell is a `?.()` predicate
whose name asks a visual question being read by a caller that needs a temporal answer.
D-125 Phase 3a had already patched this exact seam for the Lottie case by threading a settle
into `needsFrameSweep`; that term is now redundant for the entrance leg but left in place
(removing it also touches a static-settle-leg edge case, which is a separate change).

## Gate

- `pnpm --filter @cg/template-runtime test` — **879/879 across 69 files**, including the 10 new
  ones, zero regressions.
- Full `pnpm gate` + `pnpm openspec validate --all --strict`: see the commit.
- Linux `e2e`: this changes a RENDERING path (playout timing), so the debt is owed; the run URL
  is recorded in the follow-up commit per house rule.

## Not done (out of scope, per the brief)

D-133, session W's design, §10.2's content-driven-hold decision, minting any number, archiving,
merging to `main`.
