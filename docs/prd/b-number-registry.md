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

It must print **exactly one line: `B-056`** (the single known, accepted duplicate, below).
Anything else is a NEW collision and must be renumbered **before merge**.

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
disconnects). The space stays contiguous: `B-001` … `B-081`, no gaps. **Next free: `B-082`.**

**Exactly one number is ambiguous. Every other number names exactly one bug.**

| Number     | Status                                | Who owns it                                                                                                                                                                                                                             |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B-056**  | **DUAL-OWNED — both entries keep it** | [bugs-designer.md](bugs-designer.md) — "can't add a SMOOTH point to a finished path" (#272, archived) **and** [bugs-runtime.md](bugs-runtime.md) — "`load()` proceeds when the adopt-CLEAR didn't land on the PRIMARY" (#287, archived) |
| all others | unambiguous                           | one bug each                                                                                                                                                                                                                            |

**B-056 is deliberately NOT renumbered** (owner call, recorded in [B-069](bugs.md)): both
entries are merged, archived and `[x]`, so nothing is blocked and no live work is ambiguous.
Renumbering a closed bug would ripple into archived change dirs, commit/PR text, and code
comments that cite the old number. **Disambiguate by file**, not by renumbering — cite
"B-056 (designer)" or "B-056 (runtime)" when it matters.

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
claim it, and allowlists exactly one accepted duplicate (`B-056`) — with a second assertion
that the allowlist itself cannot go stale.

**If it fails on your branch: renumber YOUR bug.** Merged `main` numbers always win.
