# Session AE — Live Source phase 6 is unblocked

**Branch `dev`. Two commits, one push.**

| commit     | what                                                                 |
| ---------- | -------------------------------------------------------------------- |
| `e326a962` | R-021 stage 4 — the restore branch, `restore-blocked`, 4.3/4.4       |
| `25c21420` | R-028 §6/§7 — the three declared classes, one spelling; §7 migration |

## What phase 6 is now unblocked for

`live-source-multibox` phase 6 ("Producer, geometry, audio" — the phase that actually
puts a live picture on a layer) was blocked on `R-028 §6`, which was blocked on
**`R-021 stage 4 task 3.1`**. Both links are now cleared:

- **R-021 3.1 is done and pinned.** `#slotForRestore` BRANCHES on `isFixed`: a declared
  row is bound exactly or the item is SKIPPED, and `#allocate()` is unreachable for one.
- **R-028 §6.1–6.5 and §7.1–7.2 are done**, and §6.5's three-class model is now something
  the code enumerates rather than something a comment asks the next reader to remember.

Phase 6 can now seat a producer on 10–59 knowing that the sweep, the quarantine and
`clearLayer` all recognise the class it belongs to, and that `allocate()` is still legally
available to it — 6.1's absence-assertion was deliberately written not to forbid it.

## The two things worth knowing before touching this code

### 1. B-114 had silently broken the DYNAMIC restore, and nothing was watching

Not in the brief, found while writing §d test 5. B-114 fixed the declared row by
**REPLACING** `reserve()` with `bindFixed()` rather than branching, so every DYNAMIC
retained coordinate lost its exact-slot restore and fell straight through to
`#allocate()` — consulting a different layer's occupancy, which is precisely the hazard
`#slotForRestore`'s own docstring forbids. Both doors are now reached through an explicit
`isFixed` test.

It was verified failing before the fix: with **only** `caspar-runtime.ts` reverted, 6 of
the 9 tests in `fixed-restore-branch.integration.test.ts` fail. The 3 that pass are the
ones B-114 had already made true (free-slot same-layer restore, own-html adopt, blind-tap
deferral) — reported as-is rather than tuned to look like 9.

### 2. `restore-blocked` is a RECORDED decision, not a derivation

`#restoreBlocked` is written in exactly one place — `#decidePendingRestores`, against a
HEARING tap — and read in exactly one — `#computeFixedState`. **Do not "simplify" it into a
derivation from `observed`.** "A non-html producer under a binding" is the same shape as a
BLIND tap's honest ignorance, and only the bridge knows which actually happened: from a
blind tap that shape means `unverified`, and collapsing the two would let silence claim
knowledge (B-093). `fixed-restore-branch.integration.test.ts`'s blind-tap test is what
catches it.

The item **stays in `#pendingRestore`** while blocked, and that is load-bearing: d1's second
exit (the foreign producer vacating) is the ordinary deferred decision running again from
the sweep. There is deliberately no separate un-block mechanism to drift from it.

## The divergence you should read before "finishing" §6.2

§6.2 says the sweep's candidates become "layers nobody declared". **Taken literally that
excludes the operator bank, and it must not.** DECLARED and OWNED are different facts: a row
declares the layer is the operator's to USE and says nothing about what is on it. A bank
layer carrying an item we bound is already `owned` via `#slots`, so what remains is exactly
"a producer on the operator's own layer that we did not put there" — an orphan by the
definition. And since an unbound row now reads EMPTY unconditionally (the owner's rule), an
exclusion here would report that producer **nowhere at all**.

That reversal was already made deliberately, before this session, and is preserved rather
than re-litigated. It is the one place the three classes are treated differently, which is
why `#declaredLayerClass` returns a CLASS and not a boolean — an `isDeclared()` would have
collapsed all three into the strongest answer and made the omission invisible.

## The three door tests — verified GREEN by name, not "the suite passed"

Run explicitly against the rewritten sweep
(`tools/caspar-bridge/tests/live-source-ownership.integration.test.ts`, 7/7):

- ✅ DOOR 1 (R-009): a ledgered Live Source layer is never an orphan — its unledgered
  NEIGHBOUR still is
- ✅ DOOR 1 boundary: releasing the ledger hands the layer BACK to the sweep
- ✅ DOOR 2 (C-014): a ledgered Live Source layer is never quarantined as foreign — its
  neighbour is
- ✅ DOOR 2 ordering: the ledger is consulted BEFORE the producer-kind test
- ✅ DOOR 3 (R-015): `clearLayer` refuses a Live Source layer as `live-source` — NOT
  `foreign`, NOT `owned`
- ✅ DOOR 3 boundary: the two EXISTING ownership classes still refuse with their own reasons
- ✅ the ledger is SEPARATE from the slot map

**None was rewritten.** `for (const key of this.#liveLayerKeys()) owned.add(key)` is
untouched; the sweep now reaches it through the canonical class list instead of a
hand-written membership test.

## What is OWED — undischarged, and named as such

1. ✅ **The Linux `gate:e2e` is DISCHARGED for both commits** — https://github.com/yasermostafaee/cg/actions/runs/31760214543
   (run 31760214543 on `dev` HEAD `6ee4c5d4`, which contains both `e326a962` and
   `25c21420`). `conclusion: success`, `status: completed`, and the **E2E (Playwright)
   job RAN** — verified as that job's own `conclusion: success` rather than as "a green run
   exists", because a SKIPPED `e2e` is a statement about the diff and no evidence about the
   suite (P-029). The URL is written into both changes' `tasks.md`, since a ticked box with
   no URL is a claim rather than a discharge. The Windows 78/78 remains a signal only.
2. 🔴 **Hardware.** R-021 **7.3 is deliberately left UNTICKED** — no hardware this week, and
   a green mock pass is not a hardware verification. R-028 9.3 likewise.
   Task 4.3's **RECON is still UNRUN** (`CG STOP` on a non-html layer on real 2.3.2).
   Nothing shipped depends on its answer: STOP is withheld wherever the observation is not
   `html`, so `CG STOP` is never addressed to a foreign producer. The probe could only ever
   let STOP be widened.
3. **R-028 8.1's operator-guide rewrite.** The guide still describes a "FIXED LAYERS panel
   above the stack"; part B deleted that panel for the one Layers list. Two adjacent
   FALSEHOODS were fixed in passing this session (the bridge-restart warning stage 4
   retired, and "the slot count can GROW", false since part A's `resize-refused`), but the
   structural rewrite belongs to the doc-sync task.
4. **R-021 6.2** (cross-refs to R-023/R-024/C-002) and R-028 §8/§9 remain open.

## On-air / product-source flag (P-014)

**Both commits change on-air behaviour and are flagged accordingly.** `e326a962` alters what
a bridge restart does to a live layer, and `25c21420` alters what the orphan sweep offers
the operator to clear. Neither is verified by the local gate: CI on `dev` is the
authoritative Linux gate, and the hardware passes above are still owed.

Neither commit touches shared config (root `package.json`, `turbo.json`, `pnpm-lock.yaml`,
`CLAUDE.md`, the gate-hook), so the next session needs no special pull.

## Gate

`pnpm gate` green for both commits — **85/85 tasks, `0 cached`** (the uncached run), and
`openspec validate --all --strict` 50/50. `openspec validate --strict` run per change for
`runtime-fixed-layers` and `runtime-unified-layer-rows`.

## NOT done, by instruction

`live-source-multibox` phase 6 itself (the next session, and it is large), §1.5's punch
tasks (blocked on the plant CEF), hardware passes, minting any number, archiving, merging
to `main`.
