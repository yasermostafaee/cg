# Item-number registry — the source of truth for PRD item IDs

Covers all five item-number spaces — **`B-`** (bugs), **`C-`** ([caspar.md](caspar.md)),
**`D-`** ([designer.md](designer.md)), **`P-`** ([platform.md](platform.md)) and **`R-`**
([runtime.md](runtime.md)). The filename still says `b-number-registry` because `B-` is where
the collisions started and where the history lives; the doctrine has always applied to all
five, and since 2026-08-02 the file says so out loud (the `R-031` double-claim is why).

`B-` numbers are **global** across the three bug files
([bugs.md](bugs.md) · [bugs-designer.md](bugs-designer.md) · [bugs-runtime.md](bugs-runtime.md))
and are **never reused**. The other four prefixes each live in a single file, and are equally
never reused. Concurrent branches kept picking "the next free number" from
different snapshots of `main` and colliding, so this file records the **verified** state of
the number space and how to keep it clean.

Resolves the housekeeping half of [B-069](bugs.md).

## The audit — run this before filing

```bash
# Duplicate audit. Run for EVERY prefix you are about to file into: B C D P R
grep -rhoE "^## \[.\] B-[0-9]+" --include="*.md" docs/prd/ --exclude=README.md \
  | grep -oE "B-[0-9]+" | sort | uniq -d
```

It must print **exactly two lines: `B-056` and `B-080`** (the two known, accepted duplicates,
below). The same command with `C`, `D`, `P` or `R` substituted must print **nothing at all**.
Anything else is a NEW collision and must be renumbered **before merge**.

Match only the number that **opens** a heading (`^## [.] X-NNN`). Trailing prose produces
false hits — the `B-056` heading itself cites "renumbered from B-054".

**`--exclude=README.md` is load-bearing, and so is the `{3}` in the derivation below.** The
sweep has two documented false positives, both of them FORMAT SPECIMENS rather than claims,
and both found on 2026-08-02:

- [README.md](README.md) carries a worked example, `## [ ] D-001 — Short title`, which the
  bare command reports as a `D-001` duplicate against the real D-001 in
  [designer.md](designer.md). Excluding the README removes it; nothing else in `docs/prd/`
  needs excluding.
- [bugs.md](bugs.md) carries the new-bug filing template inside an HTML comment,
  `## [ ] B-0NN — Export blocked dialog shows wrong error count`. An HTML comment hides
  nothing from a regex, so `B-[0-9]+` matches its leading `0` and invents a phantom `B-0`.
  Anchoring the number to three digits (`B-[0-9]{3}`) is what drops it.

Neither is a collision and neither should be "fixed" by editing the specimen — a filing
template that does not look like a real heading teaches the wrong format. The commands here
already account for both.

## Deriving the next free number — the ONLY supported way

There is no recorded "next free" pointer in this file, deliberately; see
[the retirement note](#the-next-free-pointer-is-retired--implemented-2026-08-02) for why.
Derive it, for whichever prefix you need, immediately before you commit:

```bash
# Highest heading currently claimed for a prefix — substitute B / C / D / P / R.
grep -rhoE "^## \[.\] B-[0-9]{3}" --include="*.md" docs/prd/ --exclude=README.md \
  | grep -oE "[0-9]{3}$" | sort -n | tail -1
```

Next free is that value **+ 1**. Then widen the sweep before you actually take it, because
`docs/prd/` in your checkout is not the whole world:

```bash
git fetch origin
# The same maximum across EVERY ref — merged, unpushed, or someone else's branch.
for ref in $(git for-each-ref --format='%(refname)' refs/remotes refs/heads); do
  git grep -hoE "^## \[.\] B-[0-9]{3}" "$ref" -- docs/prd/ 2>/dev/null
done | grep -oE "[0-9]{3}$" | sort -n | tail -1
```

Also check `git stash list` — a stash can hold PRD headings, and on 2026-08-02 **both**
entries on this repo's shared stash stack did. And never assume a claim is one number wide.

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

**Re-audited 2026-07-19** against `main` (`d4d8bbb`, after #357). Since the last audit `B-093`
and `B-094` were taken by the runtime workstream (occupancy-tap honesty and answers-but-cannot-hear,
both [bugs-runtime.md](bugs-runtime.md), merged #355/#356) without a registry note — recorded here
so the pointer stays honest. `B-095` is now taken — `gate:e2e` starves itself by running both
Playwright suites concurrently ([bugs.md](bugs.md), a sibling of B-078's contention family; fixed
in the same PR that files it). Verified free immediately before commit: absent from current
`origin/main` docs, from every remote branch (`git branch -r`), and from both sibling worktrees'
working trees (including unpushed branches). The space stays contiguous: `B-001` … `B-095`, no
gaps. **Next free: `B-096`.**

**Re-audited 2026-07-19** against `main` (`602f2d8`, after #364). `B-096` is now taken — the Lottie
Inspector's clip total counting `op` instead of `op − ip` ([bugs-designer.md](bugs-designer.md)), a
remainder carried forward as D-125 was archived. Verified free immediately before commit: no `## [ ]
B-096` heading on current `origin/main`, on any remote branch (the only hits anywhere were this
file's own "next free" pointer — the documented false positive), or in either sibling worktree. The
space stays contiguous: `B-001` … `B-096`, no gaps. **Next free: `B-097`.**

**Re-audited 2026-07-19** against `main` (`7f9868f`, after #369). `B-097` is now taken — `pnpm gate`
being unsafe to run twice concurrently in one workspace, where vitest's shared coverage tmp dir
throws an `ENOENT` that names an innocent suite ([bugs.md](bugs.md)). Verified free immediately
before commit, and this time the search was widened past "every remote branch" because a sibling
session can claim a RANGE rather than a single number: no `## [ ] B-097` heading on current
`origin/main`, on any of the three remote branches, on ANY of the ~70 local branches across all
three worktrees (most unpushed), or on disk in either sibling working tree including uncommitted
edits. The highest heading found ANYWHERE — merged, unpushed or uncommitted — was `B-096`, so no
range claim sits above it either. The duplicate audit still prints exactly `B-056` and `B-080`. The
space stays contiguous: `B-001` … `B-097`, no gaps. **Next free: `B-098`.**

Noted for whoever audits next: `cg-designer` was mid-merge at the time, with
`docs/prd/bugs-designer.md` unmerged (`UU`). Both sides of that conflict were read from disk and
neither claims `B-097` — but a session resolving a conflict in a bug file is exactly the state this
registry exists to catch, so re-read that file before taking `B-098`.

**Re-audited 2026-07-19** against `main` (`5a8c34a`, after #371). `B-098` and `B-099` are now taken
— the `@cg/caspar-bridge` suite reddening under full parallel `pnpm test`
([bugs.md](bugs.md)) and the UNVERIFIED nested-scope content-start gate resolving through the root
`elementMap` ([bugs-designer.md](bugs-designer.md)). **The previous entry's pointer was already
stale when this session read it**: it said "Next free: `B-097`" in the working tree this session
started from, while `B-097` had been merged by #371 — the exact "reading the pointer is not
claiming it" failure this file documents, caught here by re-auditing against fetched `origin/main`
rather than the checkout. Verified free immediately before commit, at the widened scope the last
entry established: no `## [ ] B-098` / `B-099` heading on current `origin/main`, on either of the
two non-`main` remote branches, on ANY local branch across all three worktrees (swept
programmatically, most unpushed), or on disk in either sibling working tree. The highest heading
found ANYWHERE — merged, unpushed or uncommitted — was `B-097`, so no range claim sits above it.
The duplicate audit still prints exactly `B-056` and `B-080`. The space stays contiguous:
`B-001` … `B-099`, no gaps. **Next free: `B-100`.**

**Re-audited 2026-07-20** against `main` (`9372517`, after #378). `B-100` and `B-101` are now
taken, as a CONTIGUOUS RANGE claimed in ONE commit — the `#linkDown()` predicate mismatch (an
OSC-silent but AMCP-up server read as unreachable) and the OSC-silence watchdog tearing down a
working AMCP socket, both [bugs-runtime.md](bugs-runtime.md). They are filed as two numbers
rather than one because they sit in different components with different fixes
(`caspar-runtime.ts`'s predicate vs the `server-session.ts` FSM); the `load()` fail-open and the
four R-006 fail-closed refusals are NOT split out, because they are one root cause — the single
predicate — exactly as this file requires. Verified free immediately before commit, at the
widened scope: no `## [.] B-100` / `B-101` heading on current `origin/main`, on ANY of the 13
remote refs, on ANY of the 85 local branches across all three worktrees (swept programmatically,
most unpushed), or on disk in either sibling working tree. The highest heading found ANYWHERE —
merged, unpushed or uncommitted — was `B-099`, so no range claim sits above it. The duplicate
audit still prints exactly `B-056` and `B-080`. The space stays contiguous: `B-001` … `B-101`, no
gaps. **Next free: `B-102`.**

Noted for whoever audits next: `cg-designer` moved during this session — it was detached onto
`origin/main` (`9372517`) from `fix/b090-container-child-rows`, so its working tree now reads
`B-099` where the 2026-07-20 snapshot of that branch reads `B-096`. Nothing was lost (`206f249`
is still on its own branch and on `snapshot/2026-07-20-designer-head`, local and remote), and it
claims no number above `B-099` — but a sibling worktree's max moving between audits is exactly
the signal this file exists to catch, so it is recorded rather than passed over.

A THIRD number was considered and deliberately NOT claimed: #368's restart-misadoption hole (a
foreign producer landing on a retained-intent layer while the bridge was dead is adopted as ours).
It is already tracked in two PRD items, not merely in the PR body — R-015's `Notes` in
[runtime.md](runtime.md) records it as a structural KNOWN LIMIT attributed to [[B-092]] ("recorded
not fixed"), and C-014's `Notes` in [caspar.md](caspar.md) cross-references the same limit. Filing
a fresh `B-` for it would have created a third description of one defect, so the range stopped at
two.

Discharging the note above: `cg-designer`'s merge has since resolved — `docs/prd/bugs-designer.md`
is clean in that worktree with no uncommitted edits, and its highest heading is `B-096`. The
conflict landed without claiming a number, so nothing was lost in it. Both stale sibling remotes
were also checked rather than assumed: `fix/runtime-ux-batch-2` is 55 commits behind with its own
pointer still reading `B-080`, and `fix/B-068-migrated-comp-lifecycle-playout` is 79 behind — a
pointer read from either would have collided immediately, which is the standing argument for
auditing against fetched `main` and never a branch-local copy of this file.

**A THIRD drift mode, recorded 2026-07-19 — and the only one so far that REACHED `main`.** The two
modes above are both about READING: "two branches, two snapshots", and "a sibling claims a RANGE,
not one number". This one is about WRITING. #371's entry audited correctly, claimed `B-097`
correctly, and set the pointer to `B-098` correctly — and was **already false when it merged**,
because the parallel Designer session claimed `B-098` AND `B-099` in the window between that entry
being written and #371 landing. Nothing was mis-audited; the number space was simply overtaken
mid-flight. So the lesson this file already states for readers has a mirror for writers: **reading
the pointer is not claiming it, and writing the pointer is not reserving it.** A "next free" value
is a snapshot with a shelf life, never an allocation.

What makes this one worth a paragraph is that the earlier two were always caught IN FLIGHT and
renumbered before merge, which is why `main` itself stayed clean. This one did not collide with a
heading — no duplicate was ever created, and the audit stayed green throughout — so nothing failed
and it merged with a stale pointer intact. For roughly one PR's width, `main` told the next
session to take a number that was already gone. **The audit protects the HEADINGS; nothing
protects the POINTER.** That is the standing reason the pointer is advice and the heading sweep is
truth: when they disagree, re-derive from the headings and fix the pointer, exactly as the entry
above did.

It self-corrected without intervention: #373 re-audited against fetched `main` rather than trusting
the checkout, found `B-097` already merged, took `B-098`/`B-099`, and reset the pointer to `B-100`.
Re-verified from scratch here rather than assumed — current `origin/main` (`4cf8705`), every remote
ref, all 77 local branches across the three worktrees including unpushed, and both sibling working
trees on disk — the highest heading anywhere is `B-099`, nothing claims `B-100` or beyond, and the
duplicate audit still prints exactly `B-056` and `B-080`. **The pointer is correct as it stands;
this entry deliberately changes no number.**

**2026-07-21 — B-100 IMPLEMENTED, no number claimed.** The `#linkDown()` predicate-mismatch fix
(change dir `runtime-reachability-predicate`, branch `fix/b-100-reachability-predicate`) flips
[[B-100]] `[ ] → [~]` in [bugs-runtime.md](bugs-runtime.md); it files NO new heading, so the number
space is unchanged. Re-verified immediately before the commit against fetched `origin/main`
(`057554f`), every remote ref, and both sibling worktrees' checked-out branches (`cg` on
`docs/file-linkdown-predicate-bug`, `cg-designer` detached at `9372517`): the ONLY `B-100` heading
anywhere is this exact bug (the predicate mismatch) — no divergent claim to renumber against — and
the duplicate audit still prints exactly `B-056` and `B-080`. **Next free stays `B-102`.**

**Re-audited 2026-07-22** against `main` (`8fa7664`, after #386). `B-102` … `B-106` are now taken,
as a CONTIGUOUS RANGE claimed in ONE commit — the five client-feedback Designer bugs, all
[bugs-designer.md](bugs-designer.md): **B-102** (sequence-item composition images render in preview
but not on CasparCG hardware), **B-103** (the first sequence item enters without its transition
under the `repeat: 'infinite'` schema default), **B-104** (project assets gone after save → restart
→ load — DATA LOSS class), **B-105** (the Hide-show transition produces no perceptible change), and
**B-106** (repeater `maxItems` not enforced end-to-end). Verified free immediately before commit, at
the widened scope: no `## [.] B-102` … `B-106` heading on fetched `origin/main`, on ANY of the
remote refs, on ANY local branch across all three worktrees (swept programmatically, including
unpushed), or on disk in either sibling working tree including uncommitted edits. The highest
heading found ANYWHERE was `B-101`, so no range claim sits above it. Noted for whoever audits next:
`origin/main` MOVED between this session's start and this entry (`79e208f` → `8fa7664`, #386 — a
runtime archive PR that flips statuses only and claims no number); the sweep above ran against the
FETCHED head, not the checkout this branch was cut from — the exact re-derive-before-commit
discipline this file prescribes. The duplicate audit still prints exactly `B-056` and `B-080`. The
space stays contiguous: `B-001` … `B-106`, no gaps. **Next free: `B-107`.**

**Re-audited 2026-07-25** against `main` (`3731dac`, after #406). `B-107` and `B-108` are now
taken — two Runtime bugs from an owner visual check, both [bugs-runtime.md](bugs-runtime.md):
**B-107** (an errored stack row flips to READY when the bridge PROCESS dies — the browser's
retained-intent projection collapses every non-played status, including `error`, to `loaded`) and
**B-108** (a bridge restart silently drops stack rows `restore()` cannot re-seat; the `skipped`
count reaches no UI surface). Verified free immediately before the commit that writes the
headings: no `## [.] B-107` / `B-108` heading on fetched `origin/main`, on any remote ref (only
`main` + `fix/d128-canvas-video-render`), or on disk in either sibling working tree — the only
prior occurrence of `B-107` anywhere was THIS file's own "next free" pointer (the documented false
positive), and `B-108` appeared nowhere. The highest heading anywhere was `B-106`. The space stays
contiguous: `B-001` … `B-108`, no gaps. **Next free: `B-109`.**

**Re-audited 2026-07-25 (same session, follow-up)** against `main` (`3731dac`). `B-109` is now
taken — one Runtime bug from a bounded code trace off [[B-107]], [bugs-runtime.md](bugs-runtime.md):
**B-109** (a bridge restart RE-ADDs a deliberately CLEARed graphic onto its layer, because retention
stores `played:false` for both `idle` and `loaded` and keeps the slot, so `restore()` re-seats and
re-ADDs it unasked). Verified free immediately before the commit that writes the heading: no `## [.]
B-109` heading on fetched `origin/main`, on any remote ref (`main`, `fix/d128-canvas-video-render`,
and this branch `docs/file-stack-status-honesty-bugs`), or on disk in either sibling working tree —
the only prior occurrence of `B-109` anywhere was THIS file's own "next free" pointer (the documented
false positive). The highest heading anywhere was `B-108`. The space stays contiguous: `B-001` …
`B-109`, no gaps. **Next free: `B-110`.**

**Re-audited 2026-07-28** against `main` (`befbe41`, after #419). `B-110` is now taken — ONE
Designer bug, [bugs-designer.md](bugs-designer.md): **B-110** (`multi-select.spec.ts` `:19` reads
Opacity `80` expecting `100` — stale persisted project state crossing a test boundary when `:19`
and `:181` run in different workers under `fullyParallel`). Verified free immediately before the
commit that writes the heading, at the widened scope: no `## [.] B-110` heading on fetched
`origin/main`, on ANY ref (local, remote or tag) in any of the three bug files, or on disk in any
of the four working trees — `cg` (main), `cg-designer`, `cg-runtime` (all three clean, 0 dirty
files) and this session worktree. The only prior occurrence of `B-110` anywhere was THIS file's
own "next free" pointer — the documented false positive. The highest heading anywhere was `B-109`.
The space stays contiguous: `B-001` … `B-110`, no gaps. **Next free: `B-111`.**

**A SECOND number was NOT claimed, deliberately — the near-duplicate that was caught.** The same
session was asked to file two bugs: the Designer isolation defect above, and a second one for
"`gate:e2e`'s Playwright worker fan-out is unbounded". The second was **not filed**: reading
[B-078](bugs.md) showed it already covers that mechanism — it names `workers: undefined` giving
"6 on a 12-core box" as the origin of its own red, and its closing Residual-risk line already names
capping E2E worker count as the next lever. Its stated blocker ("never been reproduced under
measurement") was exactly what the new evidence supplied. So the evidence was folded INTO B-078 —
including rewriting its now-false "Still open because" line and raising it to high — rather than
minting `B-111` for a near-duplicate of an OPEN entry in the same file. Recorded here because this
is the failure mode the whole registry exists to prevent, and this time the check fired BEFORE the
commit rather than after the merge (contrast [B-056](bugs.md) / B-080, which had to be
grandfathered). **Reading the candidate's BODY, not its title, is what caught it** — the title says
"on CI" while the body says "observed locally on Windows"; that title has since been corrected.

**Re-audited 2026-07-28** against `main` (`165e0a9`, after #424). `B-111` is now taken — ONE
cross-cutting tooling bug, [bugs.md](bugs.md): **B-111** (the `tools/template-fixtures` Persian
lower-third still said `fitMode: 'autosize'` when D-060/#223 made autosize real; its §F repair
swept `@cg/starter-templates` only, so since then the fixture's RTL texts pin their right edge at
`position.x`=140 and render off-canvas — misread during C-018 recon as a cross-engine RTL
rendering defect). Verified free immediately before the commit that writes the heading: the audit
printed exactly `B-056` and `B-080`; no `## [.] B-111` heading on freshly fetched `origin/main`,
on the only other remote ref (`docs/recon-caspar-250-validation`, open PR #425), or in this
session worktree. The only prior occurrences of `B-111` anywhere were THIS file's own "next free"
pointer and the near-duplicate note above recording that `B-111` was deliberately NOT minted —
both documented false positives. The highest heading anywhere was `B-110`. The space stays
contiguous: `B-001` … `B-111`, no gaps. **Next free: `B-112`.** _(superseded — see the
2026-07-28 `4dc0daf` entry below; `B-112` is now taken and the pointer is `B-113`.)_

**Re-audited 2026-07-28** against `main` (`4dc0daf`, after #426). `B-112` is now taken — ONE
cross-cutting bug, [bugs.md](bugs.md): **B-112** (documents authored before D-060/#223 carry a
stale `fitMode: 'autosize'` that the change later made real, so they render differently than
authored — three known instances of one pattern: `@cg/starter-templates` repaired by D-060 §F,
`tools/template-fixtures` found by [[B-111]], and `packages/vcg-format/tests/fixtures.ts` still
carrying it deliberately as pack/unpack-only). Verified free immediately before the commit that
writes the heading: `git fetch origin` first, then the duplicate audit printed exactly `B-056`
and `B-080`; no `## [.] B-112` heading on freshly fetched `origin/main`, on ANY of the 32 refs
in this repo (branches, remotes, tags, `refs/stash`, and the `snapshot/*` + `stash-rescue/*`
rescue refs — swept programmatically for the heading pattern), or on disk in any of the four
working trees — `cg` (main), `cg-designer`, `cg-runtime` (all three clean, 0 dirty files) and
this session worktree. The only prior occurrence of `B-112` anywhere was THIS file's own "next
free" pointer — the documented false positive. The highest heading anywhere was `B-111`. The
space stays contiguous: `B-001` … `B-112`, no gaps. **Next free: `B-113`.** _(superseded — see
the 2026-07-29 entry below; `B-113` is now taken and the pointer is `B-114`.)_

**Re-audited 2026-07-29** immediately before the commit that writes the heading. `B-113` is now
taken — ONE runtime bug, [bugs-runtime.md](bugs-runtime.md): **B-113** (R-018's from-file
control: the chosen source file is lost on every page refresh because `fromFileStore` is a
module-level `Map` nothing persists, and the delimiter `<datalist>` filters itself down to the
one option already in the input, hiding the other four until the operator clears the box). Swept
programmatically for `^## \[.\] B-113` across all 28 refs in this repo — branches, remotes, tags
and `refs/stash` — after a `git fetch origin`: zero hits, including THIS file, which had only
ever carried `B-113` as its "next free" pointer. The highest heading anywhere was `B-112`. The
space stays contiguous: `B-001` … `B-113`, no gaps. **Next free: `B-114`.** _(superseded — see
the entry below; `B-114` is now taken. This marker used to name the following pointer value as
well; that pointer was **retired 2026-08-02** and the naming is dropped with it — derive the
number instead.)_

**Re-audited 2026-07-29 (second mint of the day)** immediately before the commit that writes the
heading. `B-114` is now taken — ONE runtime bug, [bugs-runtime.md](bugs-runtime.md): **B-114** (a
bridge restart empties every declared layer row, because `#slotForRestore` re-seats a retained
fixed coordinate with `reserve()`, which refuses fixed slots by construction). Swept
programmatically for `^## \[.\] B-114` across all 28 refs in this repo — branches, remotes, tags
and `refs/stash` — after a `git fetch origin`: zero hits, including THIS file, which had only
ever carried `B-114` as its "next free" pointer. The highest heading anywhere was `B-113`. The
space stays contiguous: `B-001` … `B-114`, no gaps. _(This entry's closing "next free" pointer
— the file's last LIVE one — was **retired 2026-08-02**; see
[the retirement note](#the-next-free-pointer-is-retired--implemented-2026-08-02). Derive the
number, never read it.)_

**Three NON-`B` numbers were claimed in the same commit, recorded here although this file's
title says B-numbers.** The same sweep was run for them, and there is no other registry to
record it in — leaving it unwritten would mean the next session re-derives it, which is the
habit this file exists to break. All three are from the [[C-018]] owner-checklist pass:
**C-020** ([caspar.md](caspar.md) — 2.5.0 removed the iVGA consumer that is this plant's entire
air path, so it BLOCKS the C-018 cutover), **R-029** and **R-030**
([runtime.md](runtime.md) — cued-but-not-taken template audio reaching air, and output placement
against a hardcoded 1920×1080 frame). The per-ref sweep above reported the maximum for **all
three prefixes at once**: the highest anywhere — merged, unpushed, stashed or on disk — was
`C-019` and `R-028`, so no claim sits at or above `C-020`/`R-029`/`R-030`, and no sibling range
claim sits above them either. Note that `R-029` and `R-030` are a CONTIGUOUS RANGE claimed in
ONE commit: they are two numbers rather than one because they are two unrelated defects that
merely surfaced in the same hardware session (audio lifecycle vs. output raster), with different
components and different fixes — the same split test this file applies to `B-100`/`B-101`.

**Re-audited 2026-08-02 — ALL FIVE PREFIXES, and the first entry in this file to treat
`C-`/`D-`/`P-`/`R-` as first-class spaces rather than as a footnote to a `B-` mint.** Run
against freshly fetched `origin/main` (`1590318e`, after #436), from a branch cut directly
from that ref rather than from a checkout. **This entry claims NO number and renumbers
nothing** — it is an audit, and the one file it edits is this one.

Derived state, every value computed from the headings that exist and nothing else:

| Prefix | File                                         | Headings | Range           | Contiguity                                       | Next free |
| ------ | -------------------------------------------- | -------- | --------------- | ------------------------------------------------ | --------- |
| `B-`   | bugs.md + bugs-designer.md + bugs-runtime.md | 114      | `B-001`…`B-114` | contiguous, no gaps                              | `B-115`   |
| `C-`   | [caspar.md](caspar.md)                       | 20       | `C-001`…`C-020` | contiguous, no gaps                              | `C-021`   |
| `D-`   | [designer.md](designer.md)                   | 135      | `D-001`…`D-141` | **6 gaps** — `069` `070` `080` `090` `091` `095` | `D-142`   |
| `P-`   | [platform.md](platform.md)                   | 21       | `P-001`…`P-021` | contiguous, no gaps                              | `P-022`   |
| `R-`   | [runtime.md](runtime.md)                     | 35       | `R-001`…`R-035` | contiguous, no gaps                              | `R-036`   |

**What was swept, stated so the next reader knows the reach of the claim.** The duplicate
audit ran for all five prefixes and printed exactly `B-056` and `B-080` and nothing else —
`C-`, `D-`, `P-` and `R-` are each duplicate-free. The maximum-heading sweep ran across **all
24 refs** in this repo (`refs/remotes` + `refs/heads`, after `git fetch origin`), not just the
two branches; the highest heading for every prefix is the one on `origin/main`, so **no
unmerged branch holds a claim above it**. Both entries on the shared stash stack were read
(read-only, neither touched). The three sibling worktrees were enumerated with
`git worktree list --porcelain` and their statuses read: `cg` clean, `cg-designer` clean,
`cg-runtime` clean. **Source and test files were included**, for the reason immediately below.

**A markdown-only sweep is not enough, and `R-035` is the proof.** The splash renumber
(`39872d6b`) touched **19 files, and 12 of them are source or test files** carrying the
identifier in a header comment — `apps/runtime/index.html`, `main.tsx`, `splashTiming.ts`,
`theme.ts`, `controls.css`, `vite.config.ts`, and six spec/test files. A `grep` confined to
`docs/**` sees none of them. Identifiers are pervasive outside the PRD, and the scale is worth
stating because it sets the cost of any future renumber:

| Prefix | `apps/`+`packages/`+`tools/` (non-md) | CI / hooks / config | `openspec/` | other `*.md` |
| ------ | ------------------------------------- | ------------------- | ----------- | ------------ |
| `B-`   | 372                                   | 5                   | 282         | 10           |
| `C-`   | 67                                    | 2                   | 63          | 3            |
| `D-`   | 422                                   | 1                   | 330         | 10           |
| `P-`   | 19                                    | 5                   | 20          | 3            |
| `R-`   | 236                                   | 0                   | 139         | 2            |

(File counts, not occurrence counts.) `CLAUDE.md` and `.claude/commands/ship.md` both cite
`B-` and `P-` numbers as load-bearing rules, and `.github/workflows/b078-soak.yml` is named
after one. **This is the standing argument for "renumber the IN-FLIGHT item, never the merged
one"** — a merged number is not a string in three markdown files, it is a string in hundreds.

**`origin/main` and `origin/dev` carry BYTE-IDENTICAL trees** (same tree hash
`3cc0f30d`, and `git diff origin/main origin/dev -- docs/prd/` is empty). #433 and #436
re-converged them. The two-branch hazard that produced the `R-031` double-claim is therefore
CLOSED as of this audit — but only as of this audit: the branches diverge in ancestry (this
repo squash-merges), so identical content today is a fact with a shelf life exactly like a
pointer's, and re-deriving is still the rule.

**This file had gone stale at `R-029`/`R-030` while the truth was `R-035` — six numbers
behind, in a prefix it never claimed to track.** The 2026-07-29 entry above records claiming
`C-020`, `R-029` and `R-030` "although this file's title says B-numbers", and that was the
last word here on the `R-` space. Meanwhile `R-031` (the operator surface), `R-032` (a PLAYOUT
tab), `R-033` (the Layers table), `R-034` (the configurable delimiter list) and `R-035` (the
splash) were all filed on `dev`. **The cause was structural, not carelessness:** fast mode
suspended PRD edits into `dev` while this file sat on `main`, so the headings moved and the
registry could not see them. That is the "two branches, two snapshots" mode this file has
documented since its first entry, running in a prefix that had no entry to go stale — which
is exactly how a splash item came to be filed as `R-031` when `dev`'s `R-031` was invisible
from `main`, and had to be renumbered to `R-035`.

**There is NO `R-030`→`R-034` gap, and the sweep has been carrying a phantom one.**
Confirmed from the headings, not from any file's claim about them: `R-031`
([runtime.md](runtime.md):1124), `R-032` (:1161) and `R-033` (:1203) are all real, unique,
open headings. The space is contiguous `R-001`…`R-035`. **How the phantom was born is worth
recording, because the file will re-create it otherwise:** [runtime.md](runtime.md) is not in
numeric order. `R-031`/`R-032`/`R-033` sit at lines 1124–1203, ABOVE `R-029` (:1256) and
`R-030` (:1306), with `R-034` at :1357. A reader scanning downward from `R-030` meets `R-034`
next and concludes the three between them are missing. **Heading ORDER is not heading
EXISTENCE** — derive with a sort, never with an eye.

**`B-113`, `B-114` and `R-034` are verified and their debt is discharged.** All three were
claimed on `dev` during fast mode against the contract and had owed a full-ref verification
since. Each is a real, unique heading — `B-113` at
[bugs-runtime.md](bugs-runtime.md):2451 (`[ ]`), `B-114` at :2494 (`[x]`), `R-034` at
[runtime.md](runtime.md):1357 (`[ ]`) — and each carries an IDENTICAL title on every one of
the 10 refs that has it, so no ref filed a different item at the same number. Nothing to
renumber.

**The six `D-` gaps are facts, and four of them are explained.** `D-069` and `D-070` are
deliberate: [designer.md](designer.md):2041 records them as "headerless import sub-labels (no
own `##` entry; IDs reserved, not reused)". `D-095` was **absorbed** by `D-086` (:2361, "This
item absorbs D-095", the same move by which `D-088` absorbed `D-002`/`D-003`) — note that the
absorbed-into-`D-088` pair KEPT their headings while `D-095` did not, so absorption has been
done two ways. `D-080` is referenced at :2528 as a planned timeline/layers item that was never
filed. **`D-090` and `D-091` have zero occurrences anywhere in the repo** — no heading, no
prose, no code — and are unexplained. None of the six exists as a heading on ANY ref. No gap
is an error and none should be back-filled; they are recorded so the next audit does not
re-investigate them.

**Only `B-` has a CI guard, and that is why `R-031` is the collision that got through.**
`tools/soak-runner/tests/bug-number-audit.test.ts` ([B-075](bugs.md)) enforces the duplicate
rule in the ordinary gate — for `B-` alone, over the three bug files alone. `C-`, `D-`, `P-`
and `R-` have no equivalent, so a collision in those four spaces is caught only if a human
runs the audit. The `R-031` double-claim is that gap firing. Recorded as the standing
observation with the evidence attached; extending the guard is a code change and belongs to a
filing session, not to this audit. (Run here to confirm it still holds: 3 tests, green, and it
sees 115 claims — see the `B-0NN` specimen note above for the one phantom in that count.)

**Both stash entries hold PRD headings, and both would collide if applied.** Read-only, and
neither was popped, dropped, applied or cleared. `stash@{0}` (2026-06-29,
`On feat/designer-multiline-and-entry-comp`) adds a `## [ ] D-119` heading for `.vcg` font
bundling — **that work shipped as `D-121`** (#298, archived), and `D-119` on `main` is an
entirely different item ("Rebuild starter templates", #290, archived). `stash@{1}`
(2026-06-28, `On feat/surface-nested-hold-content`) adds `## [ ] B-031` and `## [ ] B-032` to
[bugs.md](bugs.md) — both bugs are on `main` already, with the same titles, both `[x]`, and in
[bugs-designer.md](bugs-designer.md) rather than `bugs.md` (the bug files were split after the
stash was taken). Both stashes are therefore REDUNDANT in content and ACTIVELY HAZARDOUS in
number: applying either would mint a duplicate heading. Neither claims a number above the
current maxima, so neither changes the derivation above. Disposition is the owner's call.

**Re-audited 2026-08-03 — the CLOSING entry for the `DEBT.md` sweep, and the largest single run
this file has ever recorded.** Thirty-five numbers claimed across four prefixes in three sessions,
plus one filed on the closing day:

| prefix | claimed           | count | file(s)                                                                       |
| ------ | ----------------- | ----- | ----------------------------------------------------------------------------- |
| `B-`   | `B-115` … `B-129` | 15    | [bugs-runtime.md](bugs-runtime.md) 12, [bugs-designer.md](bugs-designer.md) 3 |
| `B-`   | `B-130`           | 1     | [bugs-runtime.md](bugs-runtime.md) — filed 2026-08-03                         |
| `R-`   | `R-036` … `R-046` | 11    | [runtime.md](runtime.md)                                                      |
| `D-`   | `D-142` … `D-146` | 5     | [designer.md](designer.md)                                                    |
| `P-`   | `P-022` … `P-025` | 4     | [platform.md](platform.md)                                                    |
| `C-`   | —                 | 0     | `C-021` stays free                                                            |

**Every prefix was DERIVED from the headings, across all refs, immediately before the commit that
wrote its headings — never from a pointer.** That is the procedure this file adopted when the
pointer was retired the day before, and this run is its first real exercise. Four separate
derivations were taken (`B-` before the bug files, then `R-`, `D-` and `P-` each immediately before
their own commit), and each was checked twice: against `docs/prd/` in the working tree, and against
every one of the 23 refs via `git for-each-ref`. All four agreed both times.

**One ordering hazard was caught by that discipline and is worth recording, because the filing plan
had it backwards.** The plan batched `bugs-designer.md` FIRST, because its `B-129` is on-air class.
Filing in that order would have left a **twelve-number hole**: a later session deriving next-free
from the headings would have seen `B-129` and returned `B-130`, stranding `B-115`…`B-126`
permanently. **Filing order is not work order** — filing an item does not fix it, and the on-air
priority belongs in the item's severity field. The `B-` free number was therefore derived ONCE and
the whole run claimed inside one session across both bug files. Any future multi-file run must do
the same per prefix.

**Post-run audit, on the closing tree:** the duplicate audit prints exactly `B-056` and `B-080` and
nothing else; `C-`, `D-`, `P-` and `R-` print nothing. Contiguity per prefix:

| prefix | range           | contiguity                                                         |
| ------ | --------------- | ------------------------------------------------------------------ |
| `B-`   | `B-001`…`B-130` | contiguous, no gaps                                                |
| `C-`   | `C-001`…`C-020` | contiguous, no gaps                                                |
| `D-`   | `D-001`…`D-146` | **6 gaps** — `069` `070` `080` `090` `091` `095`, all pre-existing |
| `P-`   | `P-001`…`P-025` | contiguous, no gaps                                                |
| `R-`   | `R-001`…`R-046` | contiguous, no gaps                                                |

The six `D-` gaps are the ones the 2026-08-02 audit characterised — `D-069`/`D-070` reserved
sub-labels, `D-095` absorbed by `D-086`, `D-080` referenced but never filed, `D-090`/`D-091`
unexplained. **This run added none.**

**The two grep artifacts are load-bearing and this run confirms it.** Both are FORMAT SPECIMENS,
not claims, and both still produce false positives in the bare command:

- [README.md](README.md)'s worked example `## [ ] D-001 — Short title`, which reads as a `D-001`
  duplicate against the real one in [designer.md](designer.md) — removed by `--exclude=README.md`.
- [bugs.md](bugs.md)'s new-bug filing template `## [ ] B-0NN — Export blocked dialog shows wrong
error count`, which sits **inside an HTML comment**. A comment hides nothing from a regex, so
  `B-[0-9]+` matches its leading `0` and invents a phantom `B-0` — removed by anchoring the number
  to three digits, `B-[0-9]{3}`.

Neither should be "fixed" by editing the specimen: a filing template that does not look like a real
heading teaches the wrong format. **Every derivation in this run used both guards**, which is why
`B-115` came back rather than `B-0`.

**Free after this run: `B-131` · `C-021` · `D-147` · `P-026` · `R-047`.** Recorded as a measurement
taken on 2026-08-03, **not as a pointer** — derive it again before you claim. That is the whole
doctrine of this file, and the reason the pointer above it is retired.

### The "next free" pointer is RETIRED — implemented 2026-08-02

**Decided by the owner on 2026-08-02**, accepting the standing recommendation recorded below.
This entry carries it out: the file's last live forward-looking pointer (the closing sentence
of the 2026-07-29 `B-114` entry) is gone, and
[Deriving the next free number](#deriving-the-next-free-number--the-only-supported-way) at
the top replaces it with the command that computes the answer for all five prefixes.

The reason, in one line each: the pointer was a **cache of a value one `grep` computes
exactly**; it **misled three times** — twice read stale (`B-088`→`B-089` against a range
claim, then `B-097` read from a checkout) and once **written stale and merged**, telling `main`
for a PR's width to take a number that was already gone; it **saved nobody a `grep`**; and it
was this file's **only contended line**, the single line every filing session had to edit,
which is precisely why concurrent sessions collided here and nowhere else in a document that
is otherwise append-only.

**Historical pointer values in the dated entries above are left exactly as written.** They
record what each audit believed at the time and are part of the evidence for retiring the
thing; scrubbing them would delete the argument. Only the live, forward-looking pointer was
removed.

### The original recommendation, as recorded (now implemented — see above)

All three recorded drift modes are one disease, and the pointer is it. Look at what it actually
is: a **cache** of a value the audit command at the top of this file computes exactly, in one
command, on demand. A cache is worth its keep when recomputing is expensive or the source is
unavailable. Here recomputing is one `grep` over three files, and the source — the headings — is
always present in any checkout. So the pointer buys nothing, and its staleness window is the
entire lifetime of every open PR.

Weigh what it has actually done. It has misled **three times**: twice as a stale value someone
READ (B-088→B-089 against the range claim, then B-097 read from a checkout), and once as a stale
value someone WROTE that reached `main` (above). Set against that, it has saved nobody a `grep`.
It is also, structurally, this file's **only contended line** — the single line every filing
session must edit — which is precisely why concurrent sessions keep colliding here and nowhere
else in the document. Every other line is append-only and has never conflicted.

The recommendation, in this file's usual voice: **retire the pointer.** Let the audit command be
the sole source of truth for "what is next", and let this file become what it has been drifting
toward anyway — an append-only incident log explaining WHY the number space is the shape it is,
with the accepted duplicates and the precedence rule. "Next free" then has exactly one answer,
computed at the moment it is asked, by the thing that is already the authority when the two
disagree. As a bonus the contended line disappears, and with it the merge conflicts that
currently make two docs PRs touching this file a scheduling problem.

Not done here, deliberately: removing it touches every historical entry's closing sentence, which
is a rewrite of the file rather than an entry appended to it — and doing that inside a PR whose
subject is an incident report would bury the report. Recorded as the standing recommendation with
the three drift modes above as its evidence.

> **Superseded 2026-08-02 — the obstacle in the paragraph above turned out to be imaginary, and
> that is worth keeping.** Retiring the pointer did NOT require touching every historical entry's
> closing sentence. Only ONE of them was ever live — the last — and the rest are dated records
> that are correct as history and were left untouched. What made the job look like a file rewrite
> was reading "the pointer" as the set of every line that ever stated one, when it is really the
> single line a reader would act on today. The recommendation stood unimplemented for two weeks on
> the strength of that misreading.

**This entry collided TWICE before landing, and the second time proves the rule above is not
enough.** It first took `B-088` (the then-current "next free" pointer) while a parallel Designer
workstream took the same number; it renumbered to `B-089` — and `B-089` turned out to be claimed by
that SAME workstream, which filed **four** numbers (`B-088`…`B-091`) from one root-cause
investigation and merged them first (#342). Both collisions have one cause: **reading the pointer
is not claiming it, and a sibling session may claim a RANGE, not just the next number.**

So "verified free before use" must mean, immediately BEFORE you commit (not when you start):

1. `git fetch origin` and re-run the duplicate audit against **current `dev`** — all work lands
   there, so `dev`, not `main`, holds the newest claims (`main` only moves on the owner's
   hand-merge, so a `main`-only audit is stale by a day);
2. include the WORKING TREE — an uncommitted claim in this checkout is invisible to any
   ref-based audit, and (per the entries below) so is a claim on any other ref that still
   exists, so sweep `git for-each-ref` rather than one branch;
3. never assume a claim is one number wide.

Precedence when it happens anyway: **the committed claim wins** and the uncommitted one moves,
because a renumber the moving side can perform unilaterally cannot corrupt the other branch. That
is why this entry moved twice rather than asking the Designer work to renumber.

**Exactly two numbers are ambiguous. Every other number names exactly one bug.**

| Number     | Status                                | Who owns it                                                                                                                                                                                                                             |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B-056**  | **DUAL-OWNED — both entries keep it** | [bugs-designer.md](bugs-designer.md) — "can't add a SMOOTH point to a finished path" (#272, archived) **and** [bugs-runtime.md](bugs-runtime.md) — "`load()` proceeds when the adopt-CLEAR didn't land on the PRIMARY" (#287, archived) |
| **B-080**  | **DUAL-OWNED — both entries keep it** | [bugs-designer.md](bugs-designer.md) — "preview timing durations in seconds" (#322, merged) **and** [bugs-runtime.md](bugs-runtime.md) — "footer health pills track the connection" (#321, merged — corrected from #324, see below)     |
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

**Amended 2026-07-20 — B-080 (runtime) arrived via #321, not #324.** PR attribution only; the
dual-owned status, the owner call not to renumber, and the audit allowlist are all unchanged. The
branch `fix/footer-loading-stuck` has TWO merged PRs with identical titles, and the later one is
empty: `git diff a0c5b76^ a0c5b76` is EMPTY, so #324 (`a0c5b76`) delivered no content at all.
`git log -S'B-080' -- docs/prd/bugs-runtime.md` returns exactly one commit — `8b92d60` (#321) —
so #321 is what introduced the runtime `B-080` heading and the duplicate it created. The
**Re-audited 2026-07-14** entry above still reads "#324"; it is left as written because it
records what that audit believed at the time, and this note is the correction. Cite **#321** for
the runtime B-080 from here on.

Why it matters beyond bookkeeping: the two PRs are indistinguishable by title, so an empty
re-merge can absorb the credit for work it never carried — and a `git branch --merged` or
ancestry check cannot tell them apart either, because this repo squash-merges. Compare the PR's
`headRefOid` against the branch tip, or pickaxe the file, as was done here.

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

---

**Mint 2026-08-11 — `B-135`, one Runtime bug, filed but NOT fixed.** The retention-state session
(`B-107`/`B-109`/`B-108`) was asked to FILE the Runtime-side workspace hole rather than close it:
**B-135** (`initRuntimeWorkspace()` silently substitutes in-memory storage for OPFS, so the
template library AND the retained stack are session-only with nothing said — [[B-104]]'s defect on
the Runtime surface, which [[D-150]] already removed on the Designer's),
[bugs-runtime.md](bugs-runtime.md).

**Verified free immediately before the commit that writes the heading**, by the discipline this
file prescribes: `git grep -c "B-135" -- docs/` over the working tree returned **no match at all**
(exit 1) before the heading was written, and the highest `B-` heading anywhere in `docs/prd/` was
`B-134`. The space stays contiguous: `B-001` … `B-135`, no gaps. **Next free: `B-136`.**

⚠ **The reach of this claim is narrower than the 2026-08-02 sweep above, and saying so is the
point.** It checked the WORKING TREE's `docs/`, not all refs and not the sibling worktrees, because
this repo now uses ONE folder on `dev` (see CLAUDE.md, "Repo layout — one folder, one branch") and
every branch that exists lives in it. What that does NOT cover is a number claimed on a ref this
checkout has not fetched. The CI audit (`tools/soak-runner/tests/bug-number-audit.test.ts`) is the
backstop that makes a collision unmergeable, which is the property that has ever actually mattered.

---

**Mint 2026-08-11 (evening, session H) — `D-151` and `P-032`, two prefixes, ONE commit.** Filed
from the owner's client-requirement pass, none of them fixed:

| Prefix | Claimed | Item                                                                                                   | File                       |
| ------ | ------- | ------------------------------------------------------------------------------------------------------ | -------------------------- |
| `D-`   | `D-151` | adding content longer than its host warns and offers to extend the host duration (client-required)     | [designer.md](designer.md) |
| `P-`   | `P-032` | `PlayoutSchema`'s legacy `mode: 'content-driven'` shim is the LAST surviving legacy compatibility path | [platform.md](platform.md) |

**Two further client requirements in the same commit claimed NO number**, deliberately, and that is
the part worth recording: they EXTENDED existing open items rather than minting near-duplicates.
**D-133** absorbed "the loop range must be authorable unconditionally, and the content continues
across the seam rather than restarting"; **D-135** absorbed "PLAY drives the canvas, not only
scrubbing" and was **retitled** to say so. The D-135 judgment is the interesting one: the PLAY
requirement is the same machinery, the same frame↔time mapping and the same ticker/sequence/clock
carve-out as the scrub requirement it sits beside, so a sibling item would have been two headings
with one implementation — the near-duplicate class this file caught once before in the deliberate
`B-111` non-mint. **Retitling an item is not renumbering it**: `D-135` still names the same work,
and nothing that cites the number breaks (precedent: B-078's title was corrected in place for the
same reason).

**Verified free immediately before the commit that writes the headings.** `git fetch origin` first,
then: the duplicate audit over `docs/prd/` printed exactly `B-056` and `B-080` for `B-` and
**nothing** for `C-`/`D-`/`P-`/`R-` (the one `D-001` pair is [README.md](README.md)'s documented
format specimen — the `--exclude=README.md` false positive). `git grep -c` for `D-151` and `P-032`
over `docs/` returned **no match at all** before the headings were written. The highest heading in
`docs/prd/` was `D-150` and `P-031`. A programmatic sweep for `^## \[.\] (D-151|P-032|B-136|B-137)`
across **all 9 refs** (`refs/heads` + `refs/remotes`, post-fetch) returned zero hits, so no unpushed
or remote ref holds a claim on any of them. The working tree was clean at the start of the session.
The `D-` space keeps its six pre-existing gaps (`069` `070` `080` `090` `091` `095`) and adds none;
`P-` stays contiguous `P-001` … `P-032`.

**`B-136` and `B-137` were swept as FREE here but are NOT claimed by this commit** — they are
claimed in the same session's later bug-filing commit, and the sweep is recorded now because it was
run now. A reader deriving next-free between the two commits must re-derive from the headings, not
from this paragraph: it is a measurement, not a reservation, exactly as the retired pointer was.

**Mint 2026-08-11 (evening, session H — second commit) — `B-136` and `B-137`, a CONTIGUOUS RANGE in
ONE commit**, both [bugs-designer.md](bugs-designer.md), both filed and code-diagnosed but NOT
fixed: **B-136** (video is never visible in PVW although CasparCG, the HTML export and the Designer
preview all render it) and **B-137** (video stays paused in the Designer preview after a scene
rebuild, stickily). Filed as two numbers rather than one **because they do not share a root** — the
split test this file has applied since `B-100`/`B-101`. B-136 is a CSP gap in `apps/runtime`'s page,
on a `data:` asset scheme, on a surface that does not run the other's code at all; B-137 is a
DOM-node/driver rebinding defect in `apps/designer/src/platform/preview.ts`. They share a subsystem
(video) and a symptom class, and nothing else; fixing either does not touch the other.

**Verified free immediately before the commit that writes the headings**, and the reach is stated
rather than implied. `git fetch origin` first; the duplicate audit over `docs/prd/` printed exactly
`B-056` and `B-080`. No `## [.] B-136` / `B-137` heading existed anywhere — in the working tree, or
on any of the 9 refs (`refs/heads` + `refs/remotes`) swept programmatically. The highest `B-` heading
anywhere was `B-135`. The space stays contiguous: `B-001` … `B-137`, no gaps.

⚠ **Their only prior occurrences were TWO FORWARD REFERENCES, and that is worth a line because it
inverts the usual hazard.** The same session's earlier commit (`d14d3fe`) wrote `[[B-136]]` and
`[[B-137]]` into [designer.md](designer.md)'s D-135 as a "Related, NOT a dependency" note, **before
either heading existed** — a live cross-reference to unwritten items, which the duplicate check
correctly flagged as dangling. It resolved cleanly because the same session then filed them in that
exact order (B-136 = the PVW bug, B-137 = the preview-pause bug), which is the mapping the note
asserts. **Recorded as a hazard, not a practice:** a forward reference is a reservation this file
does not recognise, and had the session died between its two pushes, `dev` would have carried a
permanent dangling link plus two numbers that look claimed but are not. Prefer filing the item
first, or the reference last.

---

**Mint 2026-08-12 (session I) — `B-138`, ONE number, filed as a by-product of fixing two others.**

| Prefix | Claimed | Item                                                                                                        | File                                 |
| ------ | ------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `B-`   | `B-138` | an unresolved VIDEO asset in the preview is silently invisible — no placeholder, no marker, no console line | [bugs-designer.md](bugs-designer.md) |

**Filed, not fixed** — deliberately. `B-138` is the latent trap [[B-136]] named as its leading
alternative candidate: `preview.ts`'s unresolved-asset branch has an `IMG` leg only, so a missing
VIDEO produces exactly the symptom B-136 reported, through a completely different cause. The session
that found it was authorised to fix it if the fix stayed confined to that one branch; it does not,
on two counts recorded in the item (it needs an owner-level decision about what a missing video
should SHOW, and its code lives inside a generated `<script>` string so its test is an E2E). Filing
it rather than half-closing it is the point.

**Verified free immediately before the commit that writes the heading.** `git grep -c "B-138" --
docs/` returned no match at all (exit 1) over the working tree, and the highest `B-` heading anywhere
in `docs/prd/` was `B-137`. The space stays contiguous: `B-001` … `B-138`, no gaps.
**Next free: `B-139`.**

⚠ **The one prior occurrence was a FORWARD REFERENCE again — the same hazard the previous mint
recorded, and this time it was deliberate and short-lived.** `[[B-138]]` was written into
`apps/designer/tests/project-package-restart.test.ts`'s new video case minutes before the heading
existed, because that test is what CLOSED the availability question B-138 hangs off. The reach of
the check above is stated plainly: it swept the WORKING TREE's `docs/`, not all refs — this repo
keeps one folder on `dev` (CLAUDE.md, "Repo layout"), and the CI audit
(`tools/soak-runner/tests/bug-number-audit.test.ts`) remains the backstop that makes a collision
unmergeable.

## 2026-08-17 — six numbers claimed in one filing session (`R-053`…`R-056`, `B-139`, `B-140`)

| Prefix | Claimed | Item                                                                                         | File                               |
| ------ | ------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| `R-`   | `R-053` | an aspect-mismatched plate must be TAKEABLE, with operator-confirmed CENTRE CROP             | [runtime.md](runtime.md)           |
| `B-`   | `B-139` | the row's DRAFT chip and the Inspector disagree about a staged plate, in opposite directions | [bugs-runtime.md](bugs-runtime.md) |
| `R-`   | `R-054` | one SETTINGS shell for CG Control, and one layout for its panes                              | [runtime.md](runtime.md)           |
| `R-`   | `R-055` | three CG Control chrome corrections                                                          | [runtime.md](runtime.md)           |
| `R-`   | `R-056` | the position section: PVW follows the number as it changes, and the section collapses        | [runtime.md](runtime.md)           |
| `B-`   | `B-140` | a shell-divider drag dies when the pointer crosses the PVW iframe                            | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the heading sweep immediately before the headings were written.** The documented
command was run for **every** prefix, over `docs/prd/*.md` excluding `README.md` and this file:
highest `R-` was `R-052`, highest `B-` was `B-138`, and `git grep -nE "B-14[01]" -- docs/` returned
no match at all. `R-` stays contiguous `R-001` … `R-056` and `B-` stays contiguous `B-001` … `B-140`,
**no gaps**. **Next free: `R-057`, `B-141`.**

🔴 **A reservation was proposed and REJECTED, and the reason is the registry's own doctrine.** The
filing prompt derived `B-141` for the divider bug from an item 6 that had not been written, which
would have left `B-140` held for an item that might never arrive. The owner declined it: the rule
here is the **heading sweep**, and a reservation is a SECOND mechanism for deriving a number — plus
an entry whose truth expires if the item is never filed. The divider bug therefore took `B-140`, the
number the sweep actually returned, and the next item filed takes `B-141` by sweeping again. This is
the same lesson as the "next free pointer" hazard recorded above, reached from the other direction:
a number is free because the sweep says so, never because a document says it is.

⚠ **Two PRE-EXISTING collisions were found by the audit and deliberately NOT touched.** `B-056` and
`B-080` are each claimed **twice** — once in [bugs-designer.md](bugs-designer.md) and once in
[bugs-runtime.md](bugs-runtime.md); all four items are closed `[x]`. `B-056`'s designer entry
already records a renumber from `B-054`, so the space has been repaired by hand here before.
Renumbering an existing ID is forbidden (`docs/prd/README.md`: _"Never delete or renumber existing
IDs"_), so they are reported rather than resolved. They do not affect the numbers claimed above.
⟨Owner: leave as historical, or annotate both pairs so a reader of either file knows the other
exists?⟩

## 2026-08-17 — three more claimed at the head of the implementation session (`B-141`…`B-143`)

| Prefix | Claimed | Item                                                                          | File                               |
| ------ | ------- | ----------------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-141` | the audit log records almost ONE action, and its empty state claims otherwise | [bugs-runtime.md](bugs-runtime.md) |
| `B-`   | `B-142` | four Runtime dialogs render raw `<select>`s outside `Modal`'s focus trap      | [bugs-runtime.md](bugs-runtime.md) |
| `B-`   | `B-143` | `resolvePlateAspect`'s `assumed` flag has no readers                          | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the heading sweep immediately before the headings were written.** Highest `B-`
heading was `B-140`; `git grep -nE "B-14[123]" -- docs/` returned hits ONLY in this file's own prose
— the "next free" line and the reservation discussion recorded above — and none as a heading. That
is the same forward-reference false positive this file has now recorded three times, and it is the
reason the rule is "highest HEADING", not "any occurrence". The space stays contiguous
`B-001` … `B-143`, **no gaps. Next free: `B-144`.**

The owner supplied all three numbers and the sweep agreed with them, so nothing was minted here.

## 2026-08-17 — two platform items from the implementation batch (`P-033`, `P-034`)

| Prefix | Claimed | Item                                                                            | File                       |
| ------ | ------- | ------------------------------------------------------------------------------- | -------------------------- |
| `P-`   | `P-033` | `typecheck` covers `src/**` only, so 557 test files are outside the guarantee   | [platform.md](platform.md) |
| `P-`   | `P-034` | a Designer E2E failed once, unreproducibly — the record for a second occurrence | [platform.md](platform.md) |

**Verified free by the heading sweep immediately before the headings were written.** Highest `P-`
heading was `P-032`; `git grep -nE "P-03[34]" -- docs/` returned **no occurrence anywhere in
`docs/`**, not even a forward reference. The space stays contiguous `P-001` … `P-034`, **no gaps.
Next free: `P-035`.**

The owner supplied both numbers and the sweep agreed, so nothing was minted here.

## 2026-08-18 — two guards filed and built the same day (`P-035`, `P-036`)

| Prefix | Claimed | Item                                                                               | File                       |
| ------ | ------- | ---------------------------------------------------------------------------------- | -------------------------- |
| `P-`   | `P-035` | a NEVER-STAGE guard, after `git add <directory>` swept the owner's hack onto `dev` | [platform.md](platform.md) |
| `P-`   | `P-036` | an E2E run against a STALE build makes red-then-green vacuous                      | [platform.md](platform.md) |

**Verified free by the heading sweep immediately before the headings were written.** Highest `P-`
heading was `P-034`; `git grep -nE "P-03[56]" -- docs/` returned exactly ONE hit — this file's own
"Next free: `P-035`" line — and none as a heading. That is the forward-reference false positive this
file has now recorded four times, and the reason the rule is "highest HEADING". The space stays
contiguous `P-001` … `P-036`, **no gaps. Next free: `P-037`.**

The owner supplied both numbers and the sweep agreed, so nothing was minted here.

⚠ **One item was KNOWN MISSING and needed a number the owner must mint:** the **bridge
advertise-host refactor**, which is the CURE for the hack `P-035` merely nets. SEARCH:
`grep -rniE "advertise.?host|LAN host|guessLanHost|serve-host" docs/prd/` → **no hits**. It was
referenced by `P-035` but had no ID of its own. ✅ **CLOSED — the owner supplied `C-024`; see the
next section.**

## 2026-08-18 — the advertise-host refactor gets its number (`C-024`)

| Prefix | Claimed | Item                                                                              | File                   |
| ------ | ------- | --------------------------------------------------------------------------------- | ---------------------- |
| `C-`   | `C-024` | the bridge advertises a HARDCODED LAN address; only a hack makes testing possible | [caspar.md](caspar.md) |

**Verified free by the heading sweep immediately before the heading was written.** Highest `C-`
heading was `C-023`; `git grep -n "C-024"` returned **no occurrence anywhere in the tree**, not even
a forward reference. The space stays contiguous `C-001` … `C-024`, **no gaps. Next free: `C-025`.**

The owner supplied the number and the sweep agreed, so nothing was minted here. It closes the KNOWN
MISSING note above, which is the whole reason that note existed.

## 2026-08-18 — the surface half of the `remove()` blind failure (`B-144`)

| Prefix | Claimed | Item                                                                      | File                               |
| ------ | ------- | ------------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-144` | a failed CLEAR leaves a graphic ON AIR while its row vanishes from the UI | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the heading sweep immediately before the heading was written.** Highest `B-`
heading was `B-143` (`git grep -nE "^## \[[ x~]\] B-1[34][0-9]" -- docs/prd/`); `git grep -n
"B-144"` returned exactly ONE hit anywhere in the tree — this file's own "Next free: `B-144`" line
— and none as a heading. That is the forward-reference false positive this file has now recorded
five times, and the reason the rule is "highest HEADING", not "any occurrence". The space stays
contiguous `B-001` … `B-144`, **no gaps. Next free: `B-145`.**

The owner supplied the number and the sweep agreed, so nothing was minted here.
