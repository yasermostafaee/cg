# B-number registry — the source of truth for bug IDs

`B-` numbers are **global** across the three bug files
([bugs.md](bugs.md) · [bugs-designer.md](bugs-designer.md) · [bugs-runtime.md](bugs-runtime.md))
and are **never reused**. Concurrent branches kept picking "the next free number" from
different snapshots of `main` and colliding, so this file records the **verified** state of
the number space and how to keep it clean.

Resolves the housekeeping half of [B-069](bugs.md).

## The audit — run this before filing

```bash
grep -rhoE "^## \[.\] B-[0-9]+" docs/prd/ | grep -oE "B-[0-9]+" | sort | uniq -d
```

It must print **exactly two lines: `B-056` and `B-080`** (the two known, accepted duplicates,
below). Anything else is a NEW collision and must be renumbered **before merge**.

Match only the number that **opens** a heading (`^## [.] B-NNN`). Trailing prose produces
false hits — the `B-056` heading itself cites "renumbered from B-054".

## Verified state of the number space

Audited against merged `main` (`2cb9299`, 2026-07-13). `B-001` … `B-074` are allocated,
contiguous, with no gaps.

**Re-audited 2026-07-14** against `main` (`ec13c8a`) + PR #317. `B-075` … `B-079` have since
been allocated. `B-078` was briefly the number space's only GAP — `B-079` was taken while it was
not — which is precisely the "two branches, two snapshots" pattern this file exists to catch. It
was verified free before use (absent from every remote branch, and #317 was the only open PR) and
is now taken by **B-078** (the E2E contention flake, [bugs.md](bugs.md)). The space is contiguous
again: `B-001` … `B-079`, no gaps.

**Re-audited 2026-07-14** against `main` (`6c55b70`, i.e. after #319 + #320). `B-080` and
`B-081` were verified free before use — no heading claimed either in any of the three bug
files, and `B-080`'s only occurrence anywhere was this file's own "next free" pointer. Both
are now taken, by the two directions of the same footer defect
([bugs-runtime.md](bugs-runtime.md)): **B-080** (the health pill stuck on "Loading…" after the
bridge connects) and **B-081** (the health pills still claiming a green HEALTHY after it
disconnects). The space stays contiguous: `B-001` … `B-081`, no gaps.

**Re-audited 2026-07-15** against `main` (`e44e5eb`, i.e. after #325 → #327). `B-082` and `B-083`
have since been taken (the offline-Load ✗ ERROR fix and the per-character library-title wrap,
both [bugs-runtime.md](bugs-runtime.md)). This re-audit also surfaced that **B-080 is DUAL-OWNED**:
`bugs-designer.md` already claimed B-080 (#322) when `bugs-runtime.md` took it again (#324), and
the collision merged because the audit was cache-hitting (see [B-084](bugs.md)). Owner call: keep
both, exactly as B-056 — B-080 is now allowlisted in the audit. **B-084** is taken by that
cache-execution gap itself ([bugs.md](bugs.md)). **Next free: `B-085`.**

**Re-audited 2026-07-15** against `main` (`605d765`, after #329). `B-085` has since been taken —
the browser-local template-library class fix (import/list/remove/display/schema refused while
the SPA↔bridge WS is down), [bugs-runtime.md](bugs-runtime.md), change dir
`openspec/changes/runtime-local-library/`. Verified free before use (no heading claimed it in
any of the three bug files; its only prior occurrence was this file's own "next free" pointer).
The space stays contiguous: `B-001` … `B-085`, no gaps. **Next free: `B-086`.**

**Re-audited 2026-07-15** against `main` (`89c1163`, after #334). `B-086` has since been taken —
the honest-ON-AIR-across-CasparCG-link-loss fix (the stack kept a confident red ● ON AIR after
the link dropped), [bugs-runtime.md](bugs-runtime.md), change dir
`openspec/changes/runtime-onair-honest-linkloss/`. Verified free before use (no heading claimed
it in any of the three bug files; its only prior occurrence was this file's own "next free"
pointer). The space stays contiguous: `B-001` … `B-086`, no gaps. **Next free: `B-087`.**

**Re-audited 2026-07-15** against `main` (`224f153`). `B-087` has since been taken — the
bridge-death ON-AIR badge freeze (the stack row kept a confident red ● ON AIR after the SPA↔bridge
WebSocket dropped, the outer-link twin of B-086), [bugs-runtime.md](bugs-runtime.md), change dir
`openspec/changes/runtime-onair-honest-bridge-loss/`. Verified free before use (no heading claimed
it in any of the three bug files; its only prior occurrence was this file's own "next free"
pointer). The space stays contiguous: `B-001` … `B-087`, no gaps. **Next free: `B-088`.**

**Re-audited 2026-07-18** against `main` (`ae95e9c`, after #340). `B-088` … `B-091` have since been
taken, all four in [bugs-designer.md](bugs-designer.md), filed from one root-cause investigation
into a start-trimmed element ignoring its in-point: **B-088** (the collapsed intro — a leg with no
keyframes is painted as a single frame, so the B-029 lifespan gate is evaluated once; the one being
fixed), **B-089** (nested-instance lifespans are never gated at all), **B-090** (trimming a nested
element silently no-ops in the Designer), and **B-091** (the D-125 `lottie-assets` preview handler
rebuilds mid-playback). All four verified free before use — the audit
(`grep -rhoE "^## \[.\] B-[0-9]+" docs/prd/ | grep -oE "B-[0-9]+" | sort | uniq -d`) printed exactly
`B-056` and `B-080`, and no heading claimed any of them in any of the three bug files; their only
prior occurrence was this file's own "next free" pointer. The space stays contiguous: `B-001` …
`B-091`, no gaps. **Next free: `B-092`.**

**Re-audited 2026-07-18** against `main` (`62bbb44`, after #342). `B-092` has been taken — stack
items vanishing on a bridge-process restart (the stack lived only in the dead bridge's memory, so
the SPA adopted an empty stack; the RECOVERY half of the bridge-death story whose display half is
B-087), [bugs-runtime.md](bugs-runtime.md), change dir
`openspec/changes/runtime-stack-survives-bridge-restart/`. The space stays contiguous: `B-001` …
`B-092`, no gaps. **Next free: `B-093`.**

**This entry collided TWICE before landing, and the second time proves the rule above is not
enough.** It first took `B-088` (the then-current "next free" pointer) while a parallel Designer
workstream took the same number; it renumbered to `B-089` — and `B-089` turned out to be claimed by
that SAME workstream, which filed **four** numbers (`B-088`…`B-091`) from one root-cause
investigation and merged them first (#342). Both collisions have one cause: **reading the pointer
is not claiming it, and a sibling session may claim a RANGE, not just the next number.**

So "verified free before use" must mean, immediately BEFORE you commit (not when you start):

1. `git fetch origin` and re-run the duplicate audit against **current `main`**, not the `main` you
   branched from — a number can be claimed and merged while your branch is open;
2. check sibling worktrees/branches (`git worktree list`, `git branch -a`) for uncommitted or
   unmerged claims — those are invisible to a `main`-only audit;
3. never assume a claim is one number wide.

Precedence when it happens anyway: **the committed claim wins** and the uncommitted one moves,
because a renumber the moving side can perform unilaterally cannot corrupt the other branch. That
is why this entry moved twice rather than asking the Designer work to renumber.

**Exactly two numbers are ambiguous. Every other number names exactly one bug.**

| Number     | Status                                | Who owns it                                                                                                                                                                                                                             |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B-056**  | **DUAL-OWNED — both entries keep it** | [bugs-designer.md](bugs-designer.md) — "can't add a SMOOTH point to a finished path" (#272, archived) **and** [bugs-runtime.md](bugs-runtime.md) — "`load()` proceeds when the adopt-CLEAR didn't land on the PRIMARY" (#287, archived) |
| **B-080**  | **DUAL-OWNED — both entries keep it** | [bugs-designer.md](bugs-designer.md) — "preview timing durations in seconds" (#322, merged) **and** [bugs-runtime.md](bugs-runtime.md) — "footer health pills track the connection" (#324, merged)                                      |
| all others | unambiguous                           | one bug each                                                                                                                                                                                                                            |

**Neither B-056 nor B-080 is renumbered** (owner call — B-056 recorded in [B-069](bugs.md),
B-080 recorded in [B-084](bugs.md)): all four entries are merged, so nothing is blocked and no
live work is ambiguous. Renumbering a closed bug would ripple into archived change dirs,
commit/PR text, and code comments that cite the old number. **Disambiguate by file**, not by
renumbering — cite "B-056 (designer)" / "B-080 (runtime)" when it matters.

**How B-080 slipped through** (the reason a merged duplicate was even possible — see
[B-084](bugs.md)): the audit runs inside `@cg/soak-runner#test`, but that task did not declare
`docs/prd/**` as a turbo input, so a code PR that added the second B-080 heading replayed a
cached "pass" instead of re-running the audit. Fixed by adding the input; B-080 is grandfathered
in as accepted rather than renumbered.

### Why the number space on `main` is otherwise clean

Collisions have happened repeatedly, but **in flight** — two branches picking the same next
number from different snapshots — and each was caught and renumbered before merge, which is
why `main` itself stays clean. Documented instances:

- The designer path bug was renumbered **B-054 → B-056** when a runtime bug concurrently took
  B-054 (#273). It then re-collided with #287, producing the B-056 pair above.
- D-119's bug was renumbered **B-066 → B-068** by the duplicate audit.

The rule that has actually held the line: **merged `main` numbers always win**; an in-flight
branch renumbers itself.

## Enforcement — ADOPTED (B-075)

The collisions all share one cause: "next free number" is read from a snapshot of `main` that
is already stale by the time a second branch reads it. Two ways to remove the race were
considered:

1. **Per-track number bands** — give each bug file its own range (e.g. tooling `B-500+`,
   designer `B-600+`, runtime `B-700+`) so two tracks can never pick the same number. This
   **prevents**, but it renumbers the future and buys little: cross-track collisions are only
   half the problem, and it does nothing about two branches on the SAME track.
2. **Audit in CI** — **CHOSEN, and now enforced.** It does not prevent a collision, but it
   makes one impossible to MERGE, which is the only thing that has ever actually mattered: an
   in-flight collision is cheap to renumber, a merged one is not (it ripples into archived
   change dirs, PR/commit text and code comments — see B-056).

The guard is `tools/soak-runner/tests/bug-number-audit.test.ts` ([B-075](bugs.md)). It runs in
the ordinary `turbo run test` gate, fails with the offending number and the two files that
claim it, and allowlists the accepted duplicates (`B-056`, `B-080`) — with a second assertion
that the allowlist itself cannot go stale. For the audit to actually re-run when a bug file
changes, its task must declare the bug files as inputs (see [B-084](bugs.md)); before that fix
it cache-hit and let the B-080 duplicate merge.

**If it fails on your branch: renumber YOUR bug.** Merged `main` numbers always win.
