# Handoff — 2026-08-13, sessions P + Q (phase markers, the inert checkbox, and a bigger finding)

Both briefs arrived together, so they are two commits and **one push** — one CI run for the final
HEAD, one `e2e` URL, which supersedes `0d2d0c3b`'s. Nothing merged to `main`.

**Read §3 first if you read nothing else.** Fixing the inert checkbox exposed a defect much larger
than either brief anticipated, and it is not fixed here.

---

## 1. Session P — the audit (asked for first, because it could have halted the session)

**Result: nothing was ever decided on the `undefined` values. The question is closed.**

`lottie-driver.test.ts`'s helper never passed `outroStart`, so every outro computation in that file
ran on `undefined` from the day it was written. What that cost:

- It is the **only** file that constructs a `LottieDriver` directly, so nothing outside it could be
  affected.
- **`playOutro()` is never called in it.** D-125's outro decisions — §D6.2's element-outro seam,
  §D6.4.1's always-resolves invariant, the scope outro ledger — are exercised in
  `lottie-lifecycle.test.ts` **through `createRuntime`**, which always passes a real `outroStart`.
- The two tests that DO use the outro mapping both passed `outroStart` explicitly.

**No assertion was vacuous.** The real cost was one misleading test NAME — a sweep called _"across
intro, hold and outro"_ that only ever swept the intro — plus a latent hazard: any future outro test
in that file would have computed `NaN` and landed on `op` silently. The sweep now covers the outro
it names, and the hazard is closed.

## 2. Session P — §4.5 answered (A), built

The Inspector now offers **"Add phase markers"** on a marker-less Lottie. It seeds `introEnd` at the
clip MIDPOINT and `outroStart` at `op` (degenerate — "no outro claimed"), both immediately visible
and editable, which is the whole justification for (A) over (B).

**(B) rejected, and the reasoning is now a standing rule** because this was the third encounter:
`introEnd = op` is a marker-less clip's MISSING DATA, and nothing may infer intent from it.
`lottieTiming` already refuses to derive a settle from it ("the ABSENCE of information, not an
authored claim"); D-125 Phase 1 already refuses it for the poster frame. (B) would have been the
first to go the other way — silently, on air, for every existing clip.

⚠ **Finding: this was not a new decision.** `VideoSections` has shipped the same affordance since
D-128, with the _same two seeding choices_ (midpoint intro-end, degenerate outro-start). The Lottie
section was the odd one out. The reasoning was re-derived from first principles here while a working
precedent sat one function away — the cheapest check ("does the other media kind already do this?")
went unmade, twice.

The midpoint is now **one definition** — `lottieClipMidpoint` in `@cg/lottie-bridge` — and both call
sites (the runtime's poster, the Designer's seed) are covered by tests asserting **the shared call**,
not two equal numbers.

## 3. 🔴 Session Q — the inert checkbox, and the much larger thing under it

**Fixed as briefed:** D-128 extended the READ side (`contentHoldElementsOf` lists media) without the
WRITE side (`patchDrivesHold` filtered to ticker/sequence/clock), so the Lottie/video checkbox wrote
nothing and re-rendered from unchanged state. `drivesHold` now has one writer covering all five
flag-carrying kinds, keeping its container recursion, with its doc comment true again;
`StyleSection`'s media control points at the same action. Six tests, four failing first.

**Your "probable second defect" is real — and it is not about `drivesHold`.** Measured against the
real store:

| call                    | target                 | result               |
| ----------------------- | ---------------------- | -------------------- |
| `updateElement` (speed) | top-level element      | ✅ applied           |
| `updateElement` (speed) | **inside a container** | 🔴 **silent no-op**  |
| `setElementDrivesHold`  | nested ticker          | ✅ applied           |
| `setElementDrivesHold`  | nested Lottie          | 🔴 no-op (now fixed) |

`locate()` — whose own doc says _"used by every mutation"_ — searches a layer's DIRECT children only.
So **every Inspector control routed through `updateElement` is a silent no-op for a grouped
element**: speed, hold behaviour, phases, colours, fonts. `patchDrivesHold` and `patchHoldOverride`
recurse precisely because their authors hit this and worked around it locally, one flag at a time.

**Not fixed here, deliberately.** Recursing `locate` changes the shape every caller indexes
(`layer.children[elIdx]`), so it is a store-wide refactor — far outside a session scoped to one
inert checkbox, and exactly the kind of second change your own brief said to report rather than
fold in. **No number minted; it is yours to file, and it should be filed.**

⚠ The new "Add phase markers" affordance inherits this: it is a no-op for a GROUPED marker-less
Lottie, exactly like the `speed` control beside it. Deliberate — a private bypass for one control
while its neighbours stay broken would hide the shared cause.

## 4. Session Q — the operator observation, recorded with its mechanism

_"The Lottie plays right through and ends while the ticker keeps running"_ is now recorded in
`design.md` §4.5 as the VERIFIED motivation for (A), replacing the mechanically-wrong one from
session O. The mechanism, stated so it is not confused with the checkbox:

- the checkbox answers "does this element's completion CLOSE the graphic" — a closing condition;
- what you want is the clip to STAY VISIBLE, which is the freeze frame;
- for a marker-less clip the freeze frame is `introEnd = op` — blank;
- 🔴 **and every `holdBehavior` degenerates to that same frame.** `idle-loop` does not escape it:
  `idleIn`/`idleOut` both collapse to `op`, so `idleOut > idleIn` fails and the driver takes the
  freeze branch. Flipping "on hold" between its two values does nothing at all on such a clip.

So the early ending is not a hold-source question and not fixable from the Playout panel. It is the
missing `introEnd` — which is what §2 now supplies.

## 5. Verification

- P: 5 affordance tests (4 failing first), plus the shared-call assertion on both sides.
- Q: 6 writer tests (4 failing first).
- Package suites green; `pnpm gate` green, uncached.
- Linux `e2e` URL recorded beside `tasks.md` §7 and in the D-135 item, superseding `0d2d0c3b`'s.

## Not in these sessions

The video half (`tasks.md` §5), D-133's implementation, the `locate` reach fix, minting any item
number, archiving, merging to `main`.
