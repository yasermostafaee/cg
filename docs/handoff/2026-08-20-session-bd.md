# Session BD — LOOKS 6.7: the look id reaches the PAGE, so holes and fills switch together

## THE STATE, first (read this cold)

- **Pushed SHA:** see §0 below for the verified tip. **Safe to pull.**
- **Base read:** `e0a5f49b` — exactly the expected tip, no delta.
- **This is the first switch that is CORRECT END TO END on air.** Phase 3 moved the fills;
  this moves the holes with them, off the same look id.
- **Nothing visual in this session.** Bridge + page code; seeing it needs a plant, which this
  session does not drive (see §5).

## 1. The gap, and why it was invisible

A look switch is TWO mutations on TWO machines:

| machine    | what it does                                             | landed  |
| ---------- | -------------------------------------------------------- | ------- |
| the bridge | moves each plate's `MIXER FILL`/`CLIP` to the new look   | phase 3 |
| the page   | flips which look's instance is visible, re-punches holes | phase 1 |

**Nothing carried the look id between them.** The page's `setActiveLook` had exactly one
caller — the Designer PREVIEW, over `postMessage`. So on the plant a switch moved the FILLS
while the page kept punching the OUTGOING look's HOLES: fill at the new geometry, hole at the
old.

⚠ **The DEFAULT look was fine**, which is why nothing caught this: the page enters the default
at build and the bridge seats it at take, so the two agree by coincidence. The break is
specific to a SWITCH — the one thing phase 3 existed to make possible.

## 2. What closed it

The look id rides the **same `CG <ch>-<layer> UPDATE 0 "<json>"` payload the author fields
already use** — the one verb proven on 2.3.2 to deliver JSON to `window.update` intact (the
`CALL` and `CG INVOKE` alternatives were measured and disproven; ADR 0006). Inventing a second
transport would have meant re-earning that proof.

🔴 **The point is not "a message" — it is ONE codec.** `packages/shared-schema/src/control-payload.ts`
is imported by both halves: the bridge writes with `withCgControl`, the page reads with
`readCgControl`. The fills and the holes are resolved from the SAME id, so they cannot
disagree about which look is on air — `design.md` §6/§12.2's rule applied to the switch.

`setActiveLook` stays the page's ONE switch: it and the control payload both go through a
single `enterLook`, so the page cannot grow a second answer to "which look is active".

## 3. The four things worth knowing

### 3.1 The reserved key, and why "provably distinct" had to be MADE true

I checked before choosing: a field id is `z.string().min(1)` and the Designer only `trim()`s
what the author types — **there is no validation and no character class an author cannot
reach.** So the key (`__cg`, a namespace object) is made collision-proof twice:

1. **The page STRIPS it** before anything applies field values, so control data can never
   become a field value — true even for a hand-edited scene the preflight never saw.
2. **The export REFUSES** a scene declaring that field id or namespace name
   (`reserved-control-key`, severity `error`, so it blocks) — which tells the AUTHOR at the one
   moment they can still rename it.

Unrepresentable rather than unlikely, which is the standard §14.2 already sets elsewhere.

### 3.2 The look id ALONE suffices — established from the code, not assumed

The old A′ note said titles needed the per-source→cell mapping. **It does not carry over.**
Under LOOKS a look's titles and decor live inside its own composition INSTANCE, and
`applyArrangementToNodes` sets `display:none` on the whole instance node — so switching the
look switches its titles for free. The A′ note was true of ARRANGEMENTS, where repositioned
instances shared one title set. **No mapping is sent.**

### 3.3 Order: fills first, then the page — and only on SUCCESS

The "only on success" half is the decisive one. A refused reconcile leaves the fills where they
were, so telling the page to switch anyway would paint the NEW look's holes over producers
still at the OLD geometry — a broken layout nothing would repair. The old look, intact, is the
honest outcome of a refused switch.

The "after" half is the smaller call and both orders have the same window: between the two
commands the fills and the holes disagree and the mismatched hole shows black. Both go
back-to-back on ONE connection in the urgent lane, so nothing queues between them; `CG UPDATE`
→ `window.update` was measured at **2.2–8.3 ms (median ≈5 ms, §9.2)** — under a quarter of a
20 ms frame at 50i, against a cut of ~0.20 frames (§9.3). Fills-first also means a lost
`CG UPDATE` leaves the page on a coherent previous look rather than on a new look whose boxes
would never fill.

### 3.4 The same gap by a different verb, also closed

A fresh build enters the AUTHORED DEFAULT look — page-side, synchronously, before anything can
say otherwise — while the bridge seats whatever look the row is RECORDED on. So a row switched
to solo and then re-taken (`out` destroys the producer; the next take re-ADDs) came back with
the **fills on solo and the holes on the default**. The `CG ADD` payload now carries the look
too, attached at the ONE `#sendAdd` chokepoint so the initial load and B-039's re-ADD cannot
disagree.

## 4. What the tests prove — and the one thing they cannot

Every new test was verified **RED without its half of the fix** and green with it.

- **The codec** — round trip through the same JSON encode/decode the wire uses; and that a
  malformed control object is TOLERATED rather than thrown on (a throw inside the page's
  `update()` takes the whole graphic off air).
- **The page** — the payload switches the look, with holes asserted **position AND size
  together**; a **DISJOINT-membership** switch where the outgoing and incoming looks share no
  source at all (every hole the page was punching goes away, one it never punched arrives);
  absent or unknown id leaves the current look standing.
- **The bridge** — the emitted payload **PARSED off the wire** (both AMCP escape layers undone),
  not merely "a command was sent": a correctly-shaped command with the wrong id is the defect
  itself. Plus the fills-before-page order, a refused switch telling the page nothing, and the
  `CG ADD` payload.
- **The export** — the reserved-key refusal, and that it actually blocks `produce`.

🔴 **What no test here covers: a single-process true end-to-end.** `@cg/template-runtime`
cannot import `tools/caspar-bridge` (packages must not depend on tools), so the two halves are
asserted separately — **against the ONE shared codec, which is what makes divergence
impossible.** That is the strongest assertion the architecture allows, and it is weaker than a
real end-to-end in one honest way: it proves both sides speak the same protocol, not that a
real CasparCG delivers it. The delivery itself is the ADR-0006 proof this rides on.

## 5. Visual check — nothing to photograph, and why

A plant capture would show the thing this session made true: **a switch where the guest's
picture and its frame move together, with no offset** — previously the frame moved and the
picture did not. That needs a plant, and `PRINT` needs the plant's own disk (§9.3), so it is a
later measurement rather than something this session can produce. The in-process tests are the
evidence available here.

## 6. Out of scope — named, not drifted into

- **The operator surface (phase 4)** — no look picker on the row, no preset-then-take. After
  6.7 a switch is CORRECT on air, but **triggering one live still waits on phase 4**, which
  remains blocked on `tasks.md` 2.8 (B-145's display half, still `[ ]`).
- **BC's two deferred findings** — unchecked rollback `CLEAR`s, and `#activeLooks` not
  persisted across a restart. Separate follow-ups; untouched.
- **A′ code deletion (P2.DEL)** — still deferred.

## 7. Build chain

🔴 This touched BOTH halves, and the page half ships INSIDE exported templates, so the whole
chain was rebuilt rather than assumed: `shared-schema` → `template-runtime` →
`single-file-export` → `designer`. The `single-file-export` IIFE bundle is generated by
`scripts/bundle-runtime.mjs` (a `prebuild`/`pretest` hook, not `tsc -b`), and I **verified the
regenerated bundle actually contains the change** — otherwise an exported template would carry
the old runtime and the fix would never reach air.

`pnpm gate` green **uncached** — `0 cached, 89 total`, 89 successful.
