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

## 2026-08-21 — one number claimed (`B-150`)

| Prefix | Claimed | Item                                                                    | File                               |
| ------ | ------- | ----------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-150` | content inside a look that is not on screen keeps decoding and crawling | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the documented heading sweep, run immediately before the heading was written**
over `docs/prd/*.md` excluding `README.md` and this file: the highest `B-` heading was `B-149`
(in [bugs-designer.md](bugs-designer.md)), and `git grep -c "B-150" -- docs` returned no match at
all (exit 1). `B-` stays contiguous `B-001` … `B-150`, **no gaps**. **Next free: `B-151`.** ⚠ That
pointer is a record of this sweep, not a licence — the next filing sweeps again, per the doctrine
recorded above.

🔴 **A COLLISION WAS CAUGHT BY THIS SWEEP, and it is the reason the rule reads "sweep before AND
after".** The session had already written `B-148` into `look-media.ts`, `runtime.ts` and its test
file, on a number derived from a partial scan that matched only list-item forms in `docs/prd/` and
therefore missed both `B-148` and `B-149` — which are HEADINGS in
[bugs-designer.md](bugs-designer.md). Ten occurrences across three files were renumbered to
`B-150` before the heading was written, so nothing shipped under the wrong id. The lesson is the
one this registry keeps re-learning from a new direction: **a number is free because a sweep of
the HEADINGS says so** — a narrower grep that "looks like" the sweep is not the sweep, and a
forward reference written before the heading exists is exactly where the wrong number hides.

## 2026-08-21 — three numbers claimed in one filing session (`B-151`…`B-153`)

| Prefix | Claimed | Item                                                                   | File                               |
| ------ | ------- | ---------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-151` | PVW drew every look's plates at once while air drew one                | [bugs-runtime.md](bugs-runtime.md) |
| `B-`   | `B-152` | a wire identifier (`unknown channel: …`) reached a broadcast surface   | [bugs-runtime.md](bugs-runtime.md) |
| `B-`   | `B-153` | nothing guarded Runtime/bridge version skew until a button was pressed | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the documented heading sweep, run immediately before the headings were written**
over `docs/prd/*.md` excluding `README.md` and this file: the highest `B-` heading was `B-150`, and
`git grep "B-15[123]" -- docs` returned only the two "next free: `B-151`" POINTERS written by the
previous session — no heading. `B-` stays contiguous `B-001` … `B-153`, **no gaps**.
**Next free: `B-154`.** — CLAIMED, see the section below.

⚠ **The two `B-151` hits were pointers, not claims, and that distinction was checked rather than
assumed.** The previous session's registry entry and handoff each say "next free: `B-151`", which a
naive `grep -c` reports as the number being in use. The sweep that decides is the HEADING sweep;
a plain occurrence count is not it. This is the same lesson the entry above records from the other
direction — where a narrower grep missed two headings and nearly shipped a collision.

## 2026-08-21 — one number claimed (`B-154`), and the pointer-vs-heading rule paid for itself again

| Prefix | Claimed | Item                                                            | File                               |
| ------ | ------- | --------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-154` | a HELD live plate kept rendering into the look it had just left | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the documented heading sweep, run immediately before the heading was written**
over `docs/prd/*.md` excluding `README.md` and this file: `git grep "^## \[.\] B-15"` returned
`B-150`…`B-153` and no `B-154`. `B-` stays contiguous `B-001` … `B-154`, **no gaps**.
**Next free: `B-155`.**

⚠ **The sweep for `B-154` ran while the number was ALREADY in this session's working tree** — in
the fix's own code comments and test names, written before the heading. `git grep "B-154"` therefore
returned six hits, none of them a claim. That is the same shape as the previous entry's two `B-151`
pointers, met from a third direction: **the occurrence count is never the answer; the heading sweep
is.** A session that renumbers on a raw count would have skipped a free number here and left a gap
behind it.

## 2026-08-21 — `B-155` given the entry BM-2 never wrote, and `B-156` claimed (session BO)

⚠ **`B-155` IS RECORDED HERE RETROSPECTIVELY, AND THAT IS THE POINT OF THE ENTRY.** Session BM-2
claimed it by APPENDING a line inside the previous session's `B-154` section — _"**Next free:
`B-155`.** — CLAIMED by session BM-2 … **Next free: `B-156`.**"_ — instead of opening its own dated
section. Session BO restored `B-154`'s section to what that session actually wrote and moved the
claim here. **A registry whose records are edited in place cannot be the audit trail it exists to
be:** the value of every other entry is that it says what was true when it was written, and one
in-place edit makes every entry a maybe.

| Prefix | Claimed | Item                                                                | File                               |
| ------ | ------- | ------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-155` | a source change lurks until the next LOOK press, and flashes on air | [bugs-runtime.md](bugs-runtime.md) |
| `B-`   | `B-156` | the LOOK INPUTS badge said `ON AIR NOW` for a row that was READY    | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the documented heading sweep, run immediately before the heading was written**
over `docs/prd/*.md` excluding `README.md` and this file: `git grep "^## \[.\] B-1"` reported
`B-153`, `B-154`, `B-155` as the highest headings and no `B-156`. The only other occurrence of
`B-156` in the tree was the "next free" POINTER on the line above — a pointer, not a claim, which is
the distinction this registry has now recorded from four directions. `B-` stays contiguous
`B-001` … `B-156`, **no gaps**.
**Next free: `B-157`.** — CLAIMED, see below.

## 2026-08-22 — `B-157` claimed (session BQ)

| Prefix | Claimed | Item                                                                           | File                               |
| ------ | ------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| `B-`   | `B-157` | PVW named the WRONG SOURCE: the overlay learned looks for its RECTS, not names | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the documented heading sweep, run immediately before this heading was
written** over `docs/prd/*.md` excluding `README.md` and this file:
`git grep "^## \[.\] B-1"` reported `B-151` … `B-156` and **no `B-157`**. The only occurrence of
`B-157` anywhere in the tree was the **"next free" POINTER** on the line above — a pointer, not a
claim, which is the distinction this registry has now recorded from five directions. `B-` stays
contiguous `B-001` … `B-157`, **no gaps**.

⚠ **This entry is its own dated section, which is the point.** `B-155` was claimed by appending a
line inside `B-154`’s section (corrected by session BO, recorded above); repeating that is what the
note above exists to prevent.
**Next free: `B-158`.**

## 2026-08-22 — the `stream` producer arm gets its number (`C-025`)

| Prefix | Claimed | Item                                                         | File                   |
| ------ | ------- | ------------------------------------------------------------ | ---------------------- |
| `C-`   | `C-025` | a `stream` producer arm: the catalog can SAY a live is a URL | [caspar.md](caspar.md) |

**Verified free by the heading sweep immediately before the heading was written.** Highest `C-`
heading was `C-024` (`git grep "^## \[.\] C-0" -- docs/prd`); `git grep -n "C-025"` returned
exactly THREE hits — this file's own "Next free: `C-025`" line, and the same pointer repeated in
`docs/handoff/2026-08-18-session-ar.md` and `openspec/changes/multibox-layout-switch/design.md` —
all forward-reference POINTERS, none a heading. That is the false positive this registry has now
recorded from six directions. The space stays contiguous `C-001` … `C-025`, **no gaps. Next free:
`C-026`.**

The filing prompt directed "take the next free number in whichever registry you pick"; the sweep
agreed with the pointer the `C-024` entry recorded, so nothing was minted out of order.

## 2026-08-22 — the E2E handoff-stills dirt wart gets its number (`P-037`)

| Prefix | Claimed | Item                                                                         | File                       |
| ------ | ------- | ---------------------------------------------------------------------------- | -------------------------- |
| `P-`   | `P-037` | `pnpm test:e2e` regenerates four COMMITTED handoff stills, dirtying the tree | [platform.md](platform.md) |

**Verified free by the heading sweep immediately before the heading was written.** Highest `P-`
heading was `P-036`, by BOTH tools: the registry's documented `grep -rhoE` derivation and a
`git grep -hoE "^## \[.\] P-[0-9]{3}" -- 'docs/prd/*.md' ':!docs/prd/README.md'` cross-check
returned the same `036`. The duplicate audit for `P-` printed nothing. `git grep -n "P-037"`
returned exactly THREE hits — this file's own "Next free: `P-037`" line, and the same pointer
repeated in `docs/handoff/2026-08-18-session-ar.md` and
`openspec/changes/multibox-layout-switch/design.md` — all forward-reference POINTERS, none a
heading. That is the false positive this registry has now recorded from seven directions. The space
stays contiguous `P-001` … `P-037`, **no gaps. Next free: `P-038`.**

⚠ **The derivation was run with BOTH tools deliberately, and they are not interchangeable.** The
command this file documents is `grep -rhoE`, but golden rule 9 forbids `grep -r` for tree sweeps
precisely because it skips a NUL-bearing file in SILENCE — a short match count that looks like a
clean sweep. For a number derivation a silent skip would under-report the highest heading and mint a
COLLIDING number, which is the one failure this registry exists to prevent. Running both and
requiring them to AGREE costs one extra command and removes that mode; where they ever disagree,
`git grep` is the authority.

## 2026-08-23 — the look switch's chrome lag gets its number (`B-158`)

| Prefix | Claimed | Item                                                                              | File                               |
| ------ | ------- | --------------------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-158` | a look switch is not visually ATOMIC — the plates move, the page's chrome follows | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the heading sweep immediately before the heading was written, with BOTH tools.**
The duplicate audit printed **exactly `B-056` and `B-080`**, the two known accepted duplicates and
nothing else. Highest `B-` heading was `B-157` by the registry's documented `grep -rhoE` derivation
AND by a `git grep -hoE "^## \[.\] B-[0-9]{3}" -- 'docs/prd/*.md' ':!docs/prd/README.md'`
cross-check — both returned `157`. `git grep -n "B-158"` returned exactly ONE hit: this file's own
"Next free: `B-158`" line, a forward-reference POINTER and not a heading — the false positive this
registry has now recorded from eight directions. `B-` stays contiguous `B-001` … `B-158`, **no
gaps. Next free: `B-159`.**

⚠ **Filed in `bugs-runtime.md`, and the neighbours were checked rather than assumed.** The filing
prompt named `B-151`/`B-152`/`B-153` (PVW items) and `B-155` (the wrong-source switch flash) as
possible duplicates; all four were read, and none is this. `B-158` is **cosmetic-on-air** — the
CHROME of the look being left, drawn around plates that have already moved — where `B-155` is
**wrong-source**. The item says so before it says anything else, because an item about decoration
must never be read as reopening an item about sources.

⚠ **Both tools were run deliberately, for the reason the `P-037` entry above records:** `grep -r`
skips a NUL-bearing file in SILENCE, and for a NUMBER derivation a silent skip under-reports the
highest heading and mints a COLLIDING number — the one failure this registry exists to prevent.

## 2026-08-23 — the backup-divergence pair gets its numbers (`B-159`, `B-160`)

| Prefix | Claimed | Item                                                                                 | File                               |
| ------ | ------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| `B-`   | `B-159` | a media file missing on the BACKUP diverges the two servers, and nothing surfaces it | [bugs-runtime.md](bugs-runtime.md) |
| `B-`   | `B-160` | nothing checks a media file's presence PER SERVER — the take is the first check      | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the heading sweep immediately before the headings were written, with BOTH
tools.** The duplicate audit printed **exactly `B-056` and `B-080`** and nothing else. Highest `B-`
heading was `B-158` by the registry's documented `grep -rhoE` derivation AND by the `git grep`
cross-check. `git grep -n "B-159"` returned exactly ONE hit — this file's own "Next free" line, a
forward-reference POINTER, not a heading — and `B-160` returned **none at all**. `B-` stays
contiguous `B-001` … `B-160`, **no gaps. Next free: `B-161`.**

⚠ **The neighbours named by the filing prompt were READ, not assumed distinct.** The `C-013`
redundancy family and the `R-048` swap family were both checked, as was this file's own closed
`B-044`-era redundancy item (the PHANTOM-backup noise defect, fixed 2026-07-11). None is this one:
that item is a DEAD backup producing divergence noise; `B-159` is a **LIVE, healthy, reachable**
backup that is silently WRONG. The distinction is the whole point of `B-159`, so it is recorded
here as well as in the item.

**Two numbers rather than one, deliberately:** `B-159` is the defect (behave correctly when a file
is missing at the take) and `B-160` is its prevention (find the missing file before the take).
They are separable — `B-160` shipping would not make `B-159` unnecessary, because a check is only
as fresh as its last `CLS`.

## 2026-08-23 — the UPDATE-put-video-on-air defect gets its number (`B-161`)

| Prefix | Claimed | Item                                                                                  | File                               |
| ------ | ------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-161` | UPDATE seated producers on a row that was never taken — video on air with no template | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the heading sweep immediately before the heading was written, with BOTH tools.**
The duplicate audit printed **exactly `B-056` and `B-080`**. Highest `B-` heading was `B-160` by the
registry's documented `grep -rhoE` derivation AND by the `git grep` cross-check. `git grep "B-161"`
returned exactly ONE hit — this file's own "Next free" line, a forward-reference POINTER, not a
heading. `B-` stays contiguous `B-001` … `B-161`, **no gaps. Next free: `B-162`.**

🔴 **Filed and FIXED in the same session, which is why it is `[x]` on arrival.** An on-air
defect reproduced at the wire, gated, and proven RED-then-GREEN with both neighbours green
(612 tests / 78 files, no regressions). The invariant it establishes is now `CLAUDE.md` golden rule
**10** — numbered 10 rather than inserted earlier **on purpose**: this file, `CLAUDE.md` itself and
several PRD items already cite "golden rule 9" meaning the `git grep`/NUL-byte sweep, and
renumbering it would have quietly falsified every one of those references.

## 2026-08-23 — multi-box audio and metering gets its number (`C-026`)

| Prefix | Claimed | Item                                                                                      | File                   |
| ------ | ------- | ----------------------------------------------------------------------------------------- | ---------------------- |
| `C-`   | `C-026` | multi-box audio: per-box control now, monitor / master / VU metering after the plant walk | [caspar.md](caspar.md) |

**Verified free by the heading sweep immediately before the heading was written.** Highest `C-`
heading was `C-025`, from
`git grep -hoE "^## \[.\] C-[0-9]{3}" -- 'docs/prd/*.md' ':!docs/prd/README.md'` sorted on the
NUMBER (a lexicographic sort of the whole heading puts `[~] C-015` last and is the trap here — the
checkbox sorts before the digits). The duplicate audit for `C-` printed nothing.
`git grep -n "C-026"` returned exactly ONE hit: this file's own "Next free: `C-026`" line — a
forward-reference POINTER, not a heading, which is the false positive this registry has now
recorded from seven directions. The space stays contiguous `C-001` … `C-026`, **no gaps. Next
free: `C-027`.**

⚠ **Filed at `[~]`, not `[ ]` or `[x]`** — the item ships one half (the per-box PGM audio surface)
and leaves the other half SPEC-ONLY behind a plant measurement it cannot take. A `[x]` would claim
the monitor channel, the master volume and the VU meters exist; a `[ ]` would hide a surface that
is on `dev` and clickable. `[~]` is the status that is true of both halves at once, and the change
dir's `tasks.md` §1.11 is where the undone half is enumerated.

## 2026-08-23 — the backup-gets-no-template pair gets its numbers (`B-162`, `B-163`)

| Prefix | Claimed | Item                                                                                      | File                               |
| ------ | ------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-162` | template hosting derived from the PRIMARY alone, so a remote BACKUP got no template       | [bugs-runtime.md](bugs-runtime.md) |
| `B-`   | `B-163` | nothing positively confirms a server actually FETCHED the template — prevention for above | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the heading sweep immediately before the headings were written, with BOTH tools.**
The duplicate audit printed **exactly `B-056` and `B-080`** over 163 headings. Highest `B-` heading
was `B-161` by the registry's documented derivation AND by the `git grep` cross-check.
`git grep -n "B-162"` returned exactly ONE hit — this file's own "Next free" line, a
forward-reference POINTER, not a heading, which is the false positive this registry has now recorded
from nine directions — and `git grep "B-163"` returned **none at all**. `B-` stays contiguous
`B-001` … `B-163`, **no gaps. Next free: `B-164`.**

**Two numbers rather than one, on the [[B-159]]/[[B-160]] precedent and for the same reason:**
`B-162` is the defect (host the template so every configured server can fetch it, and SAY SO when
one cannot) and `B-163` is its prevention (positively confirm a server actually did fetch). They are
separable — `B-163` shipping would not make `B-162` unnecessary, and a warning about a
configuration is not a measurement of a fetch. `B-162` is `[x]` on arrival (filed and fixed in the
same session, RED-then-GREEN); `B-163` is `[ ]` and deliberately unimplemented, because implying the
warning is proof is the failure it exists to prevent.

## 2026-08-23 — the row audio chip's two wrong counts gets its number (`B-164`)

| Prefix | Claimed | Item                                                                                      | File                               |
| ------ | ------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-164` | the row's `audio N/M` chip counted SEATS for its denominator and INTENT for its numerator | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the heading sweep immediately before the heading was written.** The duplicate
audit printed **exactly `B-056` and `B-080`**. Highest `B-` heading was `B-163` — claimed earlier in
this same session, two headings up. `git grep "B-164"` across `docs/`, `openspec/`, `packages/`,
`tools/` and `apps/` returned only this session's own SOURCE COMMENTS (the fix cites its number, as
every fix in this repo does) plus the "Next free" line above — **no heading anywhere**. `B-` stays
contiguous `B-001` … `B-164`, **no gaps. Next free: `B-165`.**

⚠ **A second `B-` claimed in one session, and deliberately not folded into `B-162`.** They share a
session and nothing else: `B-162` is the BRIDGE hosting a template at an address a server cannot
fetch; this is the RENDERER counting the wrong set on a chip. Rolling them together would have made
one commit that a revert could not take apart, which is the branching policy's own rule about one
logical change per commit.

## 2026-08-24 — the divergence silence gets its number (`B-165`)

| Prefix | Claimed | Item                                                                                           | File                               |
| ------ | ------- | ---------------------------------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-165` | every divergence event the adapter emits reaches nobody: the only subscriber is a soak counter | [bugs-runtime.md](bugs-runtime.md) |

**Verified free by the heading sweep immediately before the heading was written.** The duplicate
audit printed **exactly `B-056` and `B-080`** over 167 headings — the same two this registry has
recorded every time. Highest `B-` heading was `B-164`, by the registry's documented derivation AND
by the `git grep` cross-check. `git grep "B-165"` across the whole tree returned **exactly ONE
hit** — this file's own "Next free" line, the forward-reference POINTER that is not a heading and
that this registry has now recorded from ten directions. `B-` stays contiguous `B-001` … `B-165`,
**no gaps. Next free: `B-166`.**

⚠ **ONE number where the session was sent to file TWO, and the second is the point.** Session
MIRROR-SILENT-01 was asked to file two findings surfaced by session BV. Establishing them from the
code first:

- **The no-listener finding HELD in substance and its EVIDENCE did not.** `B-159` §6 recorded that a
  repo-wide sweep found no listener in the `tools` or `apps` trees; `tools/soak-runner/src/harness.ts`
  holds three. The finding survives (a soak harness is not an operator surface) and is filed here as
  `B-165`; §6's sentence was corrected in place rather than left standing as an established fact that
  is checkably wrong.
- **The never-converges finding did NOT hold as stated, so NOTHING was filed for it.** `B-159` §5
  described a self-refilling loop — replay 404s, refills the budget, fires another replay. The replay
  calls `queue.enqueue` directly and bypasses `send()`, which is the only path to
  `reportDivergence`, so it cannot re-arm itself. What remains is the tautology that retry cannot
  create a missing file, which `B-159` already owns. A number for it would have been a number for a
  mechanism that does not exist. §5 is corrected in place.

**Filed at `[ ]`.** Nothing about `B-165` shipped — this was a filing session, and it wrote no
product code, touched no living spec and touched no archive.

## 2026-08-24 — `B-166` … `B-174` taken in ONE claim, from the first two-server plant run

Session **PLANT-FINDINGS-01** filed the owner's first real two-server plant test. **Nine
consecutive numbers, claimed as a RANGE** — the case this file's own derivation note warns about
(_"never assume a claim is one number wide"_), recorded here so a concurrent snapshot cannot land on
top of any of them.

| Prefix | Claimed           | Items                                                                      | File                               |
| ------ | ----------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-166` … `B-174` | the 2026-08-24 two-server plant batch (see the HTML comment above `B-166`) | [bugs-runtime.md](bugs-runtime.md) |

- `B-166` a refused look switch has already moved plates on the wire · `B-167` the prescribed
  re-press is a guaranteed no-op and reports success · `B-168` the look pick is not in UPDATE's
  transaction · `B-169` a configured non-loopback `serveHost` does not widen the bind · `B-170` the
  link-down latch survives a manual failover · `B-171` the console disables every verb while a
  healthy backup is reachable · `B-172` the failover banner is alarm-red for a success · `B-173` the
  toast outlives no message it carries · `B-174` the page/mixer skew is visible on air.

**Verified free immediately before the headings were written**, by the derivation this file
prescribes and then widened past this checkout:

- The duplicate audit printed **exactly `B-056` and `B-080`** — the two known, accepted duplicates,
  unchanged.
- Highest `B-` heading in `docs/prd/` on `dev`: **`B-165`**.
- Highest `B-` heading across **EVERY ref** (`git for-each-ref refs/remotes refs/heads`, after a
  `git fetch origin`): **`B-165`** — so no unpushed or remote branch sits above it.
- `git stash list` was **EMPTY**, so no stash holds a heading (both entries did on 2026-08-02, which
  is why this line exists).

`B-` stays contiguous `B-001` … `B-174`, **no gaps. Next free: `B-175`.**

⚠ **Two premises the session was HANDED did not survive the code, and NOTHING was filed for either.**
Recording them here as well as in the items, because a disproven premise that is only recorded
inside the item that replaced it is a premise the next reader re-derives:

- **The A2 finding was attributed to `designer-box-geometry`'s defect 1** — the mask hole taking the
  cell's POSITION and the AUTHORED SIZE because `liveArrangementView` read back only `left`/`top`.
  That is **[[B-149]], and it is `[x]` FIXED (2026-08-19)**: `arrangement-view.ts` reads all four
  properties and compares size as well as position. No `designer-box-geometry` change exists in
  `openspec/changes` or its archive. The real mechanism was found elsewhere and is `B-167`.
- **`LOOK-SYNC-01` and `MIRROR-PAGE-01` were cited as items to record against.** Neither exists
  anywhere in the tree — they are SESSION-PROMPT labels. The page/mixer skew they name had no home
  in the backlog at all, so it was given one (`B-174`) rather than dropped; the B-155 half was
  recorded against `B-155`, which does exist.

**Filed at `[ ]`.** Nothing shipped — a filing session: no product code, no living spec, no archive.
The one dirty file in the tree (`tools/caspar-bridge/src/template-http-server.ts`, the owner's
uncommitted `guessLanHost()` plant pin — `P-035`) was read and deliberately left untouched.

## 2026-08-24 — `D-155` and `B-175`, from session ASPECT-LOCK-01

TWO prefixes in one session, which is why both audits are recorded rather than only the `B-` one.
The session was sent to file ONE designer feature (the Live-Source aspect lock) and found a second,
unrelated defect while establishing its §5 question — so the second was filed rather than folded
into the feature it was found under.

| Prefix | Claimed | Item                                                                                                         | File                                 |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `D-`   | `D-155` | a Live Source with a declared aspect KEEPS it during the resize                                              | [designer.md](designer.md)           |
| `B-`   | `B-175` | `D-154` left the RESIZE MATH reading the authored transform while the gizmo is drawn at the arrangement cell | [bugs-designer.md](bugs-designer.md) |

**Both verified free immediately before the headings were written**, by this file's derivation and
then widened past this checkout:

- `D-` duplicate audit (`--exclude` the README, `{3}`-anchored): **empty**, as it must be for every
  prefix other than `B-`.
- `B-` duplicate audit: **exactly `B-056` and `B-080`**, unchanged.
- Highest `D-` heading in `docs/prd/` on `dev`: **`D-154`**. Highest across **EVERY ref** after a
  `git fetch origin`: **`D-154`**.
- Highest `B-` heading on `dev` and across every ref: **`B-174`**.
- `git stash list` **EMPTY**.
- `git grep "D-155"` over `docs` + `openspec`: **no hits at all**. `git grep "B-175"`: **one hit** —
  this file's own "Next free" pointer from the batch above, the documented false positive.

`D-` stays contiguous `D-001` … `D-155` and `B-` stays contiguous `B-001` … `B-174`, **no gaps.
Next free: `D-156` and `B-176`.**

## 2026-08-24 — `D-156`, from session GIZMO-READ-01

| Prefix | Claimed | Item                                                                                | File                       |
| ------ | ------- | ----------------------------------------------------------------------------------- | -------------------------- |
| `D-`   | `D-156` | `Shift` and `Alt` are two spellings of one job — bypass snapping — split by gesture | [designer.md](designer.md) |

Noticed while establishing, for `D-155`'s aspect lock, that neither modifier was free. Filed rather
than folded in, because `D-155`'s decision at that seam is precisely that it adds NO binding.

**Verified free immediately before the heading was written:** the `D-` duplicate audit printed
**nothing** (as it must for every prefix but `B-`); the highest `D-` heading on `dev` and across
**every ref** after a `git fetch origin` was `D-155`; `git stash list` was EMPTY; and
`git grep "D-156"` over `docs` + `openspec` returned **one hit** — this file's own "Next free"
pointer above, the documented false positive.

`D-` stays contiguous `D-001` … `D-156`, **no gaps. Next free: `D-157` and `B-176`.**

## 2026-08-24 — `R-058`, from session PLANT-SILENT-01

| Prefix | Claimed | Item                                                                         | File                     |
| ------ | ------- | ---------------------------------------------------------------------------- | ------------------------ |
| `R-`   | `R-058` | "reachable" is not "working" — a channel producing nothing, and a bare ERROR | [runtime.md](runtime.md) |

⚠ **A near-miss worth recording, because it is the failure mode this file exists for.** The
implementation was written citing **`R-062`**, picked without an audit. `R-062` was indeed free —
and taking it would have opened a four-number GAP (`R-058` … `R-061`), which this registry's whole
doctrine is against. The audit was run before the PRD item was written, the real next free number
was `R-058`, and the code was renamed tree-wide (`git grep "R-062"` over the whole tree returns
nothing; six files, fifteen occurrences). **Free is not the same as next**, and an unaudited number
that happens to be unclaimed still damages the space.

**Verified free immediately before the heading was written:** the `R-` duplicate audit printed
**nothing** (as it must for every prefix but `B-`); the highest `R-` heading on `dev` and across
**every ref** after a `git fetch origin` was `R-057`; `git grep "R-058"` over `docs` + `openspec`
returned **no hits at all**.

⚠ `git stash list` was **NOT empty** — it holds `D-155`'s parked aspect-lock WIP. Checked rather
than skipped, per this file's own instruction that a stash can hold PRD headings: that entry
touches five SOURCE files and no `docs/prd/**`, so it claims no number.

`R-` stays contiguous `R-001` … `R-058`, **no gaps. Next free: `R-059`, `D-157` and `B-176`.**

## 2026-08-24 — `B-176`, filed from a gate red that was not a regression

| Prefix | Claimed | Item                                                                   | File               |
| ------ | ------- | ---------------------------------------------------------------------- | ------------------ |
| `B-`   | `B-176` | `.cgproj` re-packing is asserted byte-identical and is not, under load | [bugs.md](bugs.md) |

The `R-058` turn's Stop-hook gate reddened on `@cg/vcg-format#test` — a package the turn's diff
cannot reach. Established as load-dependent (12× green alone, 144/144 green alone, green on a full
gate re-run, green on Linux CI for the same commit) and filed rather than "fixed": nothing was
changed in `vcg-format`, no test was weakened, and the hypothesis about WHY is recorded as
unproven with the measurement it owes.

**Verified free immediately before the heading was written:** duplicate audit still prints exactly
`B-056` and `B-080`; the highest `B-` heading on `dev` and across **every ref** after a
`git fetch origin` was `B-175`; `git grep "B-176"` over `docs` + `openspec` returned only this
file's own "next free" pointers, the documented false positive. `git stash list` holds `D-155`'s
source-only WIP, which claims no number.

`B-` stays contiguous `B-001` … `B-176`, **no gaps. Next free: `B-177`, `R-059` and `D-157`.**

⚠ **`B-175` is filed UNREPRODUCED, and its item says so in its own `Env:` line.** The mechanism is a
straight read of the data flow across four files; the visual consequence is deduced from it and was
NOT observed in the running app. It is filed at ⟨high⟩ on the strength of the mechanism, with an
explicit instruction to reproduce before fixing — a non-reproduction would itself be informative.

**Filed at `[ ]`.** A filing session: no product code, no living spec, no archive, and **no OpenSpec
change created** — `D-155` records WHY it needs its own change (three capabilities, two in-flight
changes, one living spec) without creating one.

## 2026-08-25 — fill/key seating gets its number (`C-027`), from session DECKLINK-MODEL-01

| Prefix | Claimed | Item                                                                                  | File                   |
| ------ | ------- | ------------------------------------------------------------------------------------- | ---------------------- |
| `C-`   | `C-027` | fill/key SEATING for a `decklink` source: the modal stores a key device nothing sends | [caspar.md](caspar.md) |

**Verified free by the heading sweep immediately before the heading was written, with `git grep`
throughout** (the session was instructed not to use `grep -r`, which walks `node_modules` and has
produced a phantom item number in this repo before). Highest `C-` heading was **`C-026`**, from
`git grep -hoE "^## \[.\] C-[0-9]{3}" -- 'docs/prd/*.md' ':!docs/prd/README.md'` sorted on the
NUMBER — the lexicographic trap this file already records was avoided the same way. The `C-`
duplicate audit printed **nothing**. `git grep -n "C-027"` over the WHOLE TREE returned exactly
**ONE** hit: this file's own `Next free: C-027` line at the `C-026` record — a forward-reference
POINTER, not a heading, and the false positive this registry has now recorded from eight
directions. `git grep -n "C-028"` returned **nothing at all**, which is the cross-check that the
space is not merely contiguous but genuinely ends where it says. `C-` stays contiguous
`C-001` … `C-027`, **no gaps. Next free: `C-028`.**

⚠ **Filed at `[!]`, and the block is NARROWER than the one it replaces.** The same session
disproved "this plant has no capture card" (the plant has a **DeckLink SDI 4K**, measured
2026-08-24) and corrected `C-020`, `C-021`, `command-builder.ts`, the amcp-mock classifier and
`live-source-multibox`'s design/tasks accordingly. `C-027` is nonetheless `[!]`: a fill/key pair is
**two physical SDI inputs**, and whether this card exposes a second one is unknown — Q4 of
[../recon/2026-08-25-decklink-model-walk.md](../recon/2026-08-25-decklink-model-walk.md).

🔴 **Filed rather than folded into `C-021` arm (c), deliberately.** `C-027` is CODE to be written
(two-layer seating, the shared geometry, the half-failed-pair decision, the ledger's `role`);
`C-021` arm (c) is the HARDWARE pass that would verify it. Neither can serve as the other's
acceptance, and collapsing them is how "fill+key works" would come to mean "someone typed a key
device into a field".

⚠ **`C-021` was NOT marked done and NOT moved off `[!]`.** Arm (a) DECKLINK is unblocked but
undelivered and arms (b)/(c) are still blocked, so `[ ]` and `[~]` would both have been false. The
PRD legend has no shape for _"one arm unblocked but unstarted"_; rather than round the checkbox up,
the split is written into `C-021`'s heading and Notes. Recorded here because a future sweep reading
only checkboxes would otherwise see an item that did not move and assume nothing happened.

## 2026-08-25 — the DeckLink walk's results get their numbers (`C-028`, `B-177`), from session WALK-RESULT-01

| Prefix | Claimed | Item                                                                | File                               |
| ------ | ------- | ------------------------------------------------------------------- | ---------------------------------- |
| `C-`   | `C-028` | live-plate FIT MODE: `contain` by default, hole at the FITTED rect  | [caspar.md](caspar.md)             |
| `B-`   | `B-177` | DeckLink single-open contention, disguised as `404 File not found.` | [bugs-runtime.md](bugs-runtime.md) |

**Both verified free by the heading sweep immediately before each heading was written, with
`git grep` throughout** — never `grep -r`, which walks `node_modules` and has produced a phantom
item number in this repo before.

- **`C-028`.** Highest `C-` heading was **`C-027`**, from
  `git grep -hoE "^## \[.\] C-[0-9]{3}" -- 'docs/prd/*.md' ':!docs/prd/README.md'` sorted on the
  NUMBER. The `C-` duplicate audit printed **nothing**. `git grep -n "C-028"` over the whole tree
  returned only forward-reference POINTERS — this file's own "next free" line and `C-027`'s
  provenance note — never a heading. `git grep -n "C-029"` returned **nothing at all**, the
  cross-check that the space ends where it says. `C-` stays contiguous `C-001` … `C-028`, **no
  gaps. Next free: `C-029`.**
- **`B-177`.** Highest `B-` heading was **`B-176`**. The duplicate audit printed **exactly `B-056`
  and `B-080`**, the two known accepted duplicates and nothing else. `git grep -n "B-177"` returned
  only this file's own `Next free: B-177` pointer; `git grep -n "B-178"` returned nothing.
  Filed in [bugs-runtime.md](bugs-runtime.md) per [README.md](README.md)'s own routing
  (_"`runtime.md` + `caspar.md` + `bugs-runtime.md` — Runtime"_): it is a bridge/playout defect,
  not cross-cutting tooling. `B-` stays contiguous `B-001` … `B-177`, **no gaps. Next free:
  `B-178`, `R-059` and `D-157`.**

**Both filed at `[ ]`.** No code was written for either — this was a recording session for the
2026-08-25 DeckLink plant walk (`docs/recon/2026-08-25-decklink-model-walk.md`).

⭐ **`C-028` is the home a walk question had to be GIVEN, not one it was recorded against.** The
walk's Q3 (letterbox vs stretch) was cited to sessions as blocking `FIT-MODE-01`. **No such item
exists** — it is a SESSION-PROMPT label, like `LOOK-SYNC-01` and `MIRROR-PAGE-01` before it (see
the 2026-08-24 note above). A measured, blocking premise with no item to land on is exactly how a
dependency goes missing, so it was given one.

⚠ **A THIRD phantom label surfaced in the same session and is recorded here so the pattern is
visible:** `designer-box-geometry` "defect 1" was handed over again as the precedent for a mask
hole disagreeing with its picture. It still does not exist — the 2026-08-24 note above already
established that, and the real precedent is **[[B-149]]** (`[x]` FIXED 2026-08-19). `C-028` cites
`B-149` and carries a warning not to go looking for the phantom.

⚠ **`C-021` and `C-027` were NOT renumbered, re-filed or ticked**, though the walk changed both.
`C-021` keeps `[!]` with per-arm status in its heading; `C-027` keeps `[!]` and is re-stated as
**PARKED — unverifiable on this plant** (the card has one SDI input). Recorded because a future
sweep reading only checkboxes would see two items that did not move and conclude nothing happened.

---

## 2026-08-25 — the fit control's inert half and its aspect twin (`B-178`, `B-179`), from session FITMODE-WIRE-01

| Prefix | Claimed | Item                                                                       | File                               |
| ------ | ------- | -------------------------------------------------------------------------- | ---------------------------------- |
| `B-`   | `B-178` | the fit control is INERT under a look group — element written, source read | [bugs-runtime.md](bugs-runtime.md) |
| `B-`   | `B-179` | `expectedAspect` dropped the same way, DISARMING the mismatch refusal      | [bugs-runtime.md](bugs-runtime.md) |

**Both verified free by the heading sweep immediately before each heading was written, with
`git grep` throughout** — never `grep -r`.

- **`B-178`.** Highest `B-` heading was **`B-177`**. The duplicate audit printed **exactly `B-056`
  and `B-080`**, the two known accepted duplicates and nothing else; `B-001` … `B-177` was
  contiguous with **no gaps** (179 headings, 177 distinct). `git grep -n "B-178"` over the whole
  tree returned **3 hits, all forward-reference POINTERS and never a heading**: this file's
  `Next free: B-178` line, this file's `B-177` provenance bullet (which records that `B-178`
  returned nothing when `B-177` was claimed), and the same sentence quoted inside `B-177` itself
  in `bugs-runtime.md`. `git grep -n "B-179"` and `"B-180"` returned **nothing at all**, the
  cross-check that the space ends where it says.
- **`B-179`.** Claimed in the same session, directly after `B-178` was written. Same audit, same
  result; `B-180` still returns nothing.

`B-` stays contiguous `B-001` … `B-179`, **no gaps. Next free: `B-180`, `R-059` and `D-157`.**

**`B-178` is filed `[~]` — FIXED in the same session.** `B-179` is filed `[ ]`: its fix is a product
decision (where an aspect is authored) and it re-arms a refusal that BLOCKS takes on air, so it was
deliberately not folded into `B-178`'s silent-drop fix.

### ⚠ A FIFTH phantom label, and this one was a NUMBER rather than a session name

Session `FITMODE-WIRE-01`'s brief cited two items as existing, and asked that the new item
cross-reference them as prior instances of the same pattern:

- **`D-157`** — described as _"the blocked Export that names nothing"_;
- **`B-178`** — described as _"the snap guide drawn at the pointer instead of the edge"_.

**Neither exists.** At `9247e7cd` the highest real headings are `D-156` (the `Shift`/`Alt` snapping
bypass, `designer.md:4979`) and `B-177`; both `D-157` and `B-178` appear in the tree ONLY as this
file's own "next free" pointers. A search by DESCRIPTION rather than by number found nothing either:
no item anywhere concerns a snap guide's placement (the implementation at
`canvas/geometry.ts:452-463` and `CanvasArea.tsx:1141-1166` draws at the snapped TARGET, not the
pointer), and the only "Export blocked" text in `docs/prd/` is the HTML-commented filing template
`B-0NN` at `bugs.md:1135-1144`.

🔴 **This is the fifth phantom label recorded here** — after `FIT-MODE-01`, `LOOK-SYNC-01`,
`MIRROR-PAGE-01` and `designer-box-geometry` "defect 1" — and it is the first that is a NUMBER in
this registry's own namespace. That makes it sharper than the others: `B-178` was simultaneously
**the next free number** and **claimed to be an existing item**, so a session that trusted the brief
would either have collided with a real item or, as happened, had to stop and prove the collision was
not there.

**What the session did about it:** took `B-178` for its own item (the registry is the tree's
authority and said it was free), and cited the pattern's REAL anchors instead — `B-141`, `B-143`,
`B-144`, `B-146`, `B-147` and `R-053`, which already name the class verbatim as _"the system knows
something and does not say it"_. ⚠ **If those two defects are real, they are unfiled and want
numbers** — `B-180` and `D-157` are free.

### ⭐ The pattern has an existing HOME, and no rival name was minted

Worth recording because the brief asked for the pattern to be "named once": it already is.
`bugs-runtime.md:3663` / `:3762` / `:3847` carry the sentence _"the system knows something and does
not say it"_ across `B-141`, `B-143` and `B-144`; `runtime.md:2492` calls it _"the same zero-reader
shape as [[B-143]]'s `assumed` flag"_; `B-146:4120` states the cost — _"A control that silently does
nothing is the worst of the three outcomes"_. `B-178` extends that set rather than starting one.

## 2026-08-27 — the resize-snap defect and its audit fallout (`B-181`, `B-182`), from session SNAP-EDGE-01 — and the `B-180` hole this found

**Claimed:** `B-181` (`bugs-designer.md`) — resize snapping computed on the pointer rather than the
box edge, exposed by the aspect lock. `B-182` (`bugs-designer.md`) — the eight remaining holes in
`B-180`'s whole-pixel commit.

**Derivation, by this file's own documented method** (headings are truth; there is no pointer):

- highest `B-` heading in local `docs/prd/` (README excluded, `{3}`-anchored): **`B-180`**;
- widened across every ref — `dev` and `origin/dev` → `B-180`; `main`, `origin/main`,
  `origin/HEAD` → `B-132`; `ai-stale` → `B-137`; `design/live-source-multibox` → `B-131`;
- `git stash list` empty; `git worktree list --porcelain` → this checkout only;
- duplicate audit printed exactly `B-056` and `B-080`, nothing else; `B-001` … `B-180` contiguous;
- `B-181` returned six hits tree-wide, **all prose cross-references inside `B-180`**, never a
  heading — this file's documented forward-reference false-positive class. `B-182` returned zero.

⇒ next free was `B-181`; `B-182` taken immediately after it in the same session.

### 🔴 THE SIXTH PHANTOM — and the first one this registry can be said to have invited

`B-180` (filed 2026-08-26) cites `[[B-181]]` **six times as though it were an existing item**,
because the brief that commissioned `B-180` said the NEXT session would file the resize defect and
take that number. That session (`SNAP-EDGE-01`) was queued behind two others and **skipped**, so for
one day a closed `[x]` item pointed six times at nothing.

The prior session did the right thing as far as it could: it detected the dangle, wrote
"⚠ `B-181` DOES NOT EXIST" into `B-180`, and left the links rather than deleting them. **That note
is now itself stale and has been corrected in place** — the item exists and every link resolves.

**The lesson is the one this file already states and it is worth restating with a sixth instance:**
_reading the pointer is not claiming it, and writing the pointer is not reserving it._ A brief that
says "the next session will take `B-181`" has reserved nothing. **Write forward-references as a
DESCRIPTION** ("the resize-snapping defect, unfiled") **and never as a number**, because the number
only becomes true if a session that may never run does what the brief expected.

### ⚠ `B-180` never got a claim section here, and this one records it retroactively

This file's last dated section before today was 2026-08-25 (`B-178`, `B-179`), closing with
"Next free: `B-180`, `R-059` and `D-157`". `B-180` was then filed at `bugs-designer.md:2593` with a
provenance bullet written **into the bug item** and no dated claim appended here. Per this file's
own doctrine that is harmless to any derivation — the headings are the authority and the retirement
note prescribes re-deriving from them — but the append-only claim log had a hole, and a reader
auditing the log rather than the headings would have found `B-180` unexplained. **Recorded here so
the log is complete: `B-180` was claimed 2026-08-26 by session `OVERLAP-RESIDUE-01`.**

## 2026-08-29 — four numbers in one session, from the bundle `EDGE-DRAG-AUDIT-01` + `PLATE-SOURCE-01`

**Claimed, all in [bugs-designer.md](bugs-designer.md):** `B-183` (a new Live Source plate is born
holding an undeclared `live-N`), `B-184` (an export refusal drawn amber in one panel and red in
another), `B-185` (the locked-resize handle slides out from under the pointer — filed as a DECISION,
nothing implemented), `B-186` (the Designer's tests are never typechecked).

**Derivation, by this file's own documented method** (headings are truth; there is no pointer):

- highest `B-` heading in local `docs/prd/`, `^## \[.\] B-\d{3}`, README excluded: **`B-182`**;
- widened across **every** ref, not a hand-picked list — `dev` and `origin/dev` → `B-182`; `main`,
  `origin`, `origin/main` → `B-132`; `ai-stale` → `B-137`; `design/live-source-multibox` → `B-131`;
  `snapshot/2026-07-20-runtime-head` → `B-099`;
- `git stash list` empty; `git worktree list --porcelain` → this checkout only;
- **`B-183` through `B-190` each returned ZERO hits tree-wide** — no forward references at all this
  time, which is the first clean sweep since the phantom class was named.

⇒ next free was `B-183`; `B-184`, `B-185` and `B-186` taken after it in the same session.

### ⚠ The numbers are NOT in the order the brief listed the items, and that is deliberate

The bundle put the edge-drag audit first, so a reader may expect it to hold `B-183`. It does not —
it holds **`B-185`**. Numbers were taken in the order the WORK reached the point of needing one, and
the plate-source item's code landed first, so its two numbers were already written into source
comments and a spec delta before the audit item was filed. Renumbering afterwards would have meant
editing committed identifiers to satisfy a reading order, which is how a cross-reference starts
pointing at the wrong thing. **The claim log is the authority on which number is which, not the
brief's running order.**

### ⭐ On the brief's instruction to "claim from the registry's own `Next free:` line"

There is no such line to claim from any more, and following that instruction literally would have
produced a wrong number: the last `Next free:` in this file is from the **2026-08-25** section and
reads `B-180`, three numbers stale. **The pointer is RETIRED** — this file's own doctrine says the
headings are the authority and prescribes re-deriving from them, which is what was done. Recorded
because the instruction has now appeared in a brief AFTER the retirement, and will again.

### ⚠ `B-185` is filed for a defect that is NOT being fixed, and the entry says so in its heading

Filed at the owner's explicit instruction: three anchorings are costed, a recommendation is given,
and nothing is implemented. The number reserves the DECISION, not a fix. ⚠ It is therefore a real
item, not a phantom — the distinction this file exists to keep: a filed heading is claimed, whatever
its state; a number named only in a brief is not.

### 🔴 A number was DECLINED this session — and that is the point of recording it

The bundle also asked for the canvas error mark to be filed as marking the whole 1920×1080 frame
rather than the offending nested plate. **It did not reproduce**: measured, `flattenElements` returns
the nested plate at its own composed rect `{x:100,y:100,width:640,height:360}`, the issue carries
`elementId: "nested-plate"`, and `ErrorMarkOverlay` draws there.

No number was taken. **Filing it would have reserved a number for a defect nobody has shown to
exist**, and an item whose evidence is "a brief said so" is exactly the shape that produced six
phantoms. The measurement is recorded inside [[B-183]] instead, with what would settle it (the
owner's actual scene file). ⇒ **Next free after this session is `B-187`.**

### 2026-08-29 (same session) — `R-059`, from `FITMODE-CONTROL-FILE-01`

**Claimed:** `R-059` ([runtime.md](runtime.md)) — the operator overrides a live plate's fit mode from
CG Control, staged onto UPDATE, remembered per look. **Docs only; nothing implemented.**

**Derivation:** highest `R-` HEADING across every ref (`^## \[.\] R-\d{3}`) was **`R-058`**; `R-059`
… `R-064` returned **no headings anywhere**. `R-059` does occur tree-wide — nine times — but every
occurrence is **this file's own retired `Next free:` pointer**, never an item, which is the
documented false-positive class for this namespace. `R-060` returned zero; `R-061`/`R-062` occur only
in this file's 2026-08-2x account of a near-miss where an implementation was written citing `R-062`
before an audit. `git stash list` empty; one worktree.

⇒ `R-` stays contiguous `R-001` … `R-059`, no gaps.

**Filed under `R-` and in `runtime.md` deliberately**, by the [[R-053]] precedent: most of the work is
CG Control SURFACE even though the mechanism sits in `tools/caspar-bridge`. `R-053` itself sits here
while its refusal and fit chain live in `live-plate-fit.ts`.

### ⚠ The brief's `R-054` precedent DID NOT EXIST, and the item says so instead of inheriting it

The prompt instructed the item to record, as settled precedent, _"`R-054`'s decision that a tab switch
with unapplied edits **keeps** the edits and marks it dirty"_, and to verify it first. **It is not a
decision.** `runtime.md:2835` lists _"Does the modal keep per-tab dirty state, and what happens on tab
switch with an unapplied edit?"_ among `R-054`'s OPEN QUESTIONS, under an explicit
_"A tab switch must decide which behaviour it inherits."_

`R-059` therefore records the question as **open in two places that must be answered consistently**,
rather than citing a decision nobody made. ⭐ **This is the same failure mode as the phantom-number
class one level up:** a brief asserting that something exists is not evidence that it does, whether
the something is a NUMBER or a DECISION. The check is identical — go and read it.

### ⚠ And the feature's attachment point exists, but at the WRONG GRANULARITY

Recorded here because it changes what the item costs, and a later reader skimming the claim log
should not have to rediscover it: the per-assignment `fitMode` override is already in the schema
(`sources.ts:405`), the bridge (`caspar-runtime.ts:4068-4069`) and the resolver
(`live-plate-fit.ts:277-284`, which even returns a `from` provenance). But
`TemplateSourceAssignmentSchema` is `{templateId, plateId, sourceId, fitMode?}` — **no look
dimension** — so the existing override is one value per plate, in force in EVERY look. The owner's
decision that it be remembered PER LOOK is therefore a storage-shape change, not a surface. The item
leads with that.

### 2026-08-29 (later) — `B-187`, from `PLATE-DEFAULT-SOURCE-FILE-01`

**Claimed:** `B-187` ([bugs-designer.md](bugs-designer.md)) — a default source for a new plate, in two
halves (grouped: next free DECLARED source in the look; groupless: a generated label is legitimate).
**Docs only; nothing implemented.**

**Derivation:** highest `B-` HEADING across every ref (`^## \[.\] B-\d{3}`) was **`B-186`**; `B-187` …
`B-193` returned **no headings anywhere**, and the only tree-wide hits in that range are prose — this
file's own 2026-08-29 note and `B-183`'s number-verification bullet, both merely saying the range was
clear. `git stash list` empty; one worktree. ⇒ `B-` stays contiguous `B-001` … `B-187`, no gaps.

### ⭐ It is filed as a RE-SCOPE, not as a new capability, and the log should say which

`B-183` (this morning) deleted `nextLiveSourceId` outright and removed `defaultLiveSource`'s `routeKey`
parameter. Its evidence was entirely about the GROUPED case — a plate holding `live-1` under a group
declaring `l1`/`l2` — and the fix was applied to both cases. `B-187`'s groupless half restores what
that over-removed; only its grouped half is new.

⚠ **Worth recording as a pattern in its own right:** `B-183` was filed, fixed, gated and discharged
inside one day, and the same day produced a follow-up saying half of it went too far. Nothing about
`B-183` was wrong — the orphan was real and the fix holds — but a fix scoped by the evidence in front
of it removed a capability the evidence never touched. **The tell was available at the time:** `B-183`'s
own item records `lookGroups` being absent as the case where `look-source-undeclared` cannot run, and
did not ask what the DEFAULT should be in that same case.

### ⚠ A number was NOT taken for the export hole, because the hole is not real

The brief required a sourceless plate exporting quietly to be filed as its own item **if** it existed.
Measured instead: on a `lookGroups: []` scene, `Exporter.preflight` returns `["live-source-unset"]` at
`severity: 'error'` — the set `produce` throws on — so the export is blocked. `live-source-unset` is
raised in DOCUMENT scope precisely so it does not depend on a group. No number taken; the measurement
is recorded inside `B-187`.

⇒ **Next free after this session is `B-188`.**

### 2026-08-29 (later) — no number taken: `B-174` RE-SCOPED in place, from `SKEW-MEASURE-01`

**No new number.** The phenomenon already had one; what was wrong was its framing, so `B-174` was
corrected in place rather than superseded by a fresh item. Recorded here because a reader diffing the
log would otherwise see a session that measured a great deal and claimed nothing.

**What changed:** `B-174` was filed as _"a measured 2.2–8.3 ms is being contradicted by air"_. It is
not a contradiction — it is a **category error**, and the citation was wrong twice over:

- the figure is in **§9.4**, not §9.2 (§9.2 is the tween vocabulary and contains **zero** occurrences
  of `window.update`, `2.2` or `8.3`);
- **§9.4 is headed _"Demoted to optional"_ and opens _"this decides nothing"_**;
- its endpoint is `window.update`, a **JS entry point**, while the mixer half lands on a **channel
  frame** — and the very same section measured a PAINTED-frame quantity (`CG ADD` → first painted
  frame, median **70.2 ms**), so the harness could measure paint and simply did not, for this one;
- the quoting comment's _"a 20 ms frame at 50i"_ is wrong on the document's own terms — §9.2/§9.3
  establish **25 fps** and §9.6 names `1080i5000`, so the **frame** period is **40 ms**.

⭐ **The lesson, and it is the reason this is in the claim log rather than only in the item:** a figure
was quoted across three files (`caspar-runtime.ts`, `B-174`, `B-178`) with a section number attached,
and **the section number was never followed**. The quote propagated; the citation rotted. `B-174` was
then filed AGAINST that quote, so a mis-citation became a bug item's whole premise. **Follow the
citation before building on the number** — the same discipline the phantom-number entries in this file
record for item numbers, applied to measurements.

⇒ **Next free is unchanged: `B-188`.**

### 2026-08-29 (later still) — `B-188`, from `SOURCE-DECLARATION-DROP-01`

**Claimed:** `B-188` ([bugs-designer.md](bugs-designer.md)) — should the multi-frame group's source
DECLARATION exist at all. Verdict **ADOPT WITH CONDITIONS**. **Docs only; nothing implemented.**

**Derivation:** highest `B-` HEADING across every ref was **`B-187`**; `B-188` … `B-195` returned **no
headings anywhere** and no forward references — the only tree-wide hits in that range are this file's
own prose recording that the range was clear. `git stash list` empty; one worktree. ⇒ `B-` stays
contiguous `B-001` … `B-188`, no gaps.

**Filed under `B-` deliberately, though it is a PROPOSAL rather than a defect.** The subject is a
defect CLASS — `look-source-undeclared` exists only because one fact is stored twice — and the brief
directed the `B-` space. Recorded so a later reader does not treat it as a mis-file.

### ⭐ The measurement that decided it, kept here because it is short and load-bearing

`collectLookCarrier` was run on the owner's scene shape with a declared-but-UNUSED source added:

| declared      | carrier `sourceId`s                                  |
| ------------- | ---------------------------------------------------- |
| `l1,l2,l3`    | `["l1","l2","l3"]`                                   |
| `l1,l2,l3,l9` | `["l1","l2","l3"]` — `l9` DROPPED                    |
| `l3,l9,l1,l2` | `["l3","l1","l2"]` — declaration ORDER, minus unused |

⇒ **the export already reduces the declaration to the used set**, so the operator and the bridge have
always consumed a derived list. The declaration's only downstream contribution is ORDER. Everything
else it does is an authoring-time constraint.

### ⚠ Two brief premises FAILED verification, and both are recorded in the item

- **"Renaming is one edit today."** It is not — there is **no rename**. `addLookSource` and
  `removeLookSource` are the only mutators, and `LooksSection.tsx:35` states the policy: _"The routeKey
  is FIXED at declaration (no in-place rename)."_ A rename today is N plate edits PLUS two declaration
  edits, with a red window between. **This inverts the argument: renaming is a cost the declaration
  ADDS.**
- **`dynamic` "sits on every declaration"** — true, and it has **one reader in the whole tree**
  (`live-sources.ts:409`, a pass-through onto the carrier) whose own output **nothing reads**. Its
  docstring claims _"the bridge needs this"_; the bridge never mentions it.

### 🔴 It DECIDES `B-179` by consequence, and that is the blocking condition

`B-179`'s two candidate fixes are _"either a writer here or a hoist from the element"_ (`looks.ts:93`).
Deleting the declaration deletes the first. **`B-179` must be answered before this is adopted**, or
adopted here as decided-by-consequence — and this item does neither, it records the dependency.

⇒ **Next free after this session is `B-189`.**

### 2026-08-29 (last) — `SOURCE-DECLARATION-DROP-02`: NO NUMBER TAKEN

**Claimed: nothing.** This session IMPLEMENTED [[B-188]] (`openspec/changes/derive-look-sources`) and
re-scoped [[B-179]] and [[B-187]] to match. Three existing items were edited; no heading was added.

**Derivation, run anyway because the rule is to derive rather than to remember:** highest `B-` HEADING
across every ref is **`B-188`** — unchanged, because nothing new was filed. ⇒ **Next free is still
`B-189`**, and `B-` stays contiguous `B-001` … `B-188`.

🔴 **The blocking condition the previous entry recorded is DISCHARGED, and not in the way that
entry expected.** It said [[B-179]] _"must be answered before this is adopted"_, because deleting the
declaration deletes candidate (a). The owner answered it by **rejecting `B-179`'s own premise**:

> _"aspect and fit are per-plate right now and have nothing to do with the source — which I think is
> correct."_

So there was no per-source property to rehome. (a) went with the declaration, (b) — the hoist from
the element — shipped, and `B-179`'s findings 1 and 2 are FIXED by consequence: the author's
`expectedAspect` reaches the carrier for a look-group template again, re-arming the take's
aspect-mismatch refusal. Its Acceptance bullet 3 is REJECTED with the premise, and said so in the item
rather than dropped.

### ⚠ One premise of THIS session's brief failed verification, and it is recorded for the same reason the last two were

**"Remove `dynamic`"** was ambiguous between two fields with the same name, and the ambiguity matters:

- `LookSource.dynamic` — the DECLARATION's field. Deleted, with the declaration.
- `LiveSourceDeclaration.dynamic` — the exported CARRIER's field, required on the wire, written by
  both export paths and by `MockRuntime`. **KEPT.**

The previous entry's finding that the carrier's copy has zero readers still stands and is still
filed — but deleting a required field from the wire contract is a different change from deleting an
authoring-side one, and it was not in scope. **What WAS closed is the asymmetry:** the groupless path
computed the carrier flag from field bindings while the group path hardcoded `false`, so every
look-group template ever exported carried `dynamic: false` regardless. Both paths now compute it the
same way, from the plate element.

⭐ **Reporting note, because the shape recurs.** The brief asked for discrimination to be proved by
reverting. It was, and the result is **42 red across 6 files** — of which **three are structural
crashes, not behavioural disagreements**: the reverted preflight indexes a `sources` array the new
fixtures no longer write, so three POSITIVE CONTROLS died on a `TypeError` rather than on a value.
Those three prove nothing either way and are excluded from the evidence. A rounded "42 red, all
controls green" would have been the easy sentence and the false one.

### 2026-08-31 — `SKEW-COUNT-01`: `B-189` CLAIMED, from the harness's own wire tap

**Claimed: `B-189`** — the channel-mode read discards every real CasparCG `INFO <channel>` reply
(gates on `ok-multi` where the real server answers `201`/`ok-line`, then parses `<video-mode>` where
the real server emits `<format>`), so R-030's raster check is disarmed on every real install and the
"one-shot" re-sends every sweep tick forever. Filed in
[bugs-runtime.md](bugs-runtime.md). Found by `tools/skew-harness`'s AMCP tap while measuring
[[B-174]]'s `k` — a genuinely NEW defect, not a re-scope: no existing item covers the mode read.

**Derivation, from headings as the rule requires:** highest `B-` HEADING across every ref before this
claim was **`B-188`** (`bugs-designer.md`); `git grep` for `B-189` returned only the registry's own
two forward pointers and never a heading. `R-` highest is `R-059`, `P-` highest `P-037` — neither
space was touched.

**NOT claimed, deliberately:** `B-174` was UPDATED IN PLACE with the measured `k` (1–3 fields =
20–60 ms at `1080i5000`, median 30 ms, ten runs) and `B-155` with its `PLAY`-carrying window
(~80 ms locally, via the LEVEL-1 catalog-re-point lurk — inside patch A6's already-recorded scope,
so no number). The phenomenon-had-a-number rule from the 2026-08-29 entry, applied twice.

⇒ **Next free after this session is `B-190`**, and `B-` stays contiguous `B-001` … `B-189`, no gaps.

### 2026-08-31 (later) — `SKEW-HOLD-01`: NO NUMBER TAKEN

**Claimed: nothing.** This session IMPLEMENTED two existing items — [[B-174]] (the mixer hold:
page-first order, one-channel-frame hold, `k` re-measured from 20/30/60 ms to −20/0/+20 ms over ten
runs each) and [[B-189]] (both breaks fixed, the mock moved to the real dialect, the raster shout and
the true one-shot asserted by value) — and re-judged the `awaitChannelModeRead` flake saga against
`B-189` (sibling, not root cause; recorded in the item). Headings were edited to `[~]`; none added.

**Derivation, from headings as the rule requires:** highest `B-` HEADING across every ref is
**`B-189`** (`bugs-runtime.md`, filed earlier this same day); `R-` highest `R-059`, `P-` highest
`P-037`. **Cross-check against the dated pointer, per the corrected instruction:** the previous
entry ends _"Next free after this session is `B-190`"_ — headings and pointer AGREE. ⚠ The
brief's own anchor `[[evidence-and-staging-rules]]` does not exist in this tree or in memory; the
saga it cited was recovered from commit `5659ca5e` and `tests/support/harness.ts`, and the item
records that recovery so the dangling name does not send the next reader hunting.

⇒ **Next free after this session is still `B-190`**, and `B-` stays contiguous `B-001` … `B-189`,
no gaps.

### 2026-08-31 (latest) — `SKEW-HOLD-01`, second half: `B-190` TAKEN

**Claimed: `B-190`** — _every project package carries the wall clock in its first zip header_
([bugs-designer.md](bugs-designer.md)). Found the way this registry keeps warning about: as a RED
GATE on a commit that touched neither `@cg/vcg-format` nor anything it depends on, one run after the
same tree went green. The number is taken because the defect is real and product-visible (the
documented byte-identical re-export), not because a test flaked — the flake was the only symptom
anyone had ever seen.

**Derivation, from headings as the rule requires:** highest `B-` HEADING across every ref was
**`B-189`**; `B-190` … `B-196` returned **no headings anywhere**. **Cross-check against the dated
pointer:** the entry above ends _"Next free after this session is still `B-190`"_ — headings and
pointer AGREE, and `B-190` is what this entry takes.

⇒ **Next free after this session is `B-191`**, and `B-` stays contiguous `B-001` … `B-190`, no gaps.

### 2026-08-31 (fourth) — `RUNTIME-RECONCILE-01` S3: `B-191` TAKEN

**Claimed: `B-191`** — _a look switched while the row is STOPPED is recorded but never told_
([bugs-runtime.md](bugs-runtime.md)). Filed and fixed in the same session, from the owner's own
sequence, and answered on the wire rather than by reading: the take after a stopped switch sends
`CG … PLAY` carrying no payload at all.

**Derivation, from headings as the rule requires:** highest `B-` HEADING across every ref was
**`B-190`** (taken earlier the same day by the `@cg/vcg-format` determinism item); `B-191` … `B-197`
returned **no headings anywhere**. **Cross-check against the dated pointer:** the entry above ends
_"Next free after this session is `B-191`"_ — headings and pointer AGREE.

⇒ **Next free after this session is `B-192`**, and `B-` stays contiguous `B-001` … `B-191`, no gaps.

### 2026-08-31 (fifth) — `SKEW-INTERSECT-01` §2: `B-192` AND `B-193` TAKEN

**Claimed: `B-192`** — _a plate PARKED by a look switch does not survive on the plant_
([bugs-runtime.md](bugs-runtime.md)) — and **`B-193`** — _the new hole and the outgoing plate's
picture do not change together_ (same file). Both are §2's deliverable: the two terms the
transition mask does NOT address, measured and filed rather than fixed, so that no future report
can collapse the three again.

⚠ **Two numbers in one session, and the second is derived AFTER the first is written**, which is the
only ordering that keeps the rule honest: `B-193`'s own derivation names `B-192` as the highest
heading it found, because by then it was one.

**Derivation, from headings as the rule requires:** highest `B-` HEADING across every ref was
**`B-191`** (taken earlier the same day by the stopped-look item); `B-192` … `B-198` returned **no
headings anywhere**. **Cross-check against the dated pointer:** the entry above ends _"Next free
after this session is `B-192`"_ — headings and pointer AGREE, and `B-192`/`B-193` are what this
entry takes.

⇒ **Next free after this session is `B-194`**, and `B-` stays contiguous `B-001` … `B-193`, no gaps.

### 2026-09-01 (first) — `PLATES-OVER-PAGE-01`: `B-194` TAKEN, for a VERDICT rather than a defect

**Claimed: `B-194`** — _can the plates sit ABOVE the page, so that no mask exists?_
([bugs-runtime.md](bugs-runtime.md)). A feasibility study that implements nothing and ends REJECTED,
filed so the question is CLOSED rather than deferred.

⚠ **The prefix is worth a sentence, because `C-` was the other candidate and is not obviously wrong.**
The subject is CasparCG compositing, and [caspar.md](caspar.md)'s `C-015` is literally _"composite
them behind the template"_ — so a `C-` reading is defensible. `B-` was chosen because the item is the
end of [[B-174]]'s saga and answers a question the owner asked about it: the three rejected skew
outcomes, the two terms `B-192`/`B-193` file, and this verdict are one record and belong in one file.
`C-015` carries a pointer to it rather than a copy.

**Derivation, from headings as the rule requires:** highest `B-` HEADING across every ref was
**`B-193`** (taken the previous day by `SKEW-INTERSECT-01` §2); `B-194` … `B-200` returned **no
headings anywhere**, and the duplicate audit printed exactly the two accepted duplicates (`B-056`,
`B-080`). **Cross-check against the dated pointer:** the entry above ends _"Next free after this
session is `B-194`"_ — headings and pointer AGREE.

⇒ **Next free after this session is `B-195`**, and `B-` stays contiguous `B-001` … `B-194`, no gaps.

### 2026-09-01 (second) — `TEMPLATE-OVERLAY-AUDIT-01`: `B-195` AND `B-196` TAKEN

**Claimed: `B-195`** — _the template audit: nothing in any real template draws over a live picture_
([bugs-runtime.md](bugs-runtime.md)) — and **`B-196`** — _`minRuntimeVersion` has a writer, a schema
and no reader_ (same file). The first is an AUDIT with a verdict and nothing implemented; the second
is a defect the audit found on the way past and which was to be filed regardless of that verdict.

⚠ **`B-195` amends `B-194`, filed hours earlier, rather than superseding it** — its cost number, its
layer argument and its export claim each gained a dated correction in place, per spec discipline. A
verdict that is wrong in three places and left standing is worse than no verdict.

**Derivation, from headings as the rule requires:** highest `B-` HEADING across every ref was
**`B-194`** (taken earlier the same day); `B-195` … `B-201` returned **no headings anywhere**, and the
duplicate audit printed exactly the two accepted duplicates (`B-056`, `B-080`). **Cross-check against
the dated pointer:** the entry above ends _"Next free after this session is `B-195`"_ — headings and
pointer AGREE, and `B-195`/`B-196` are what this entry takes.

⇒ **Next free after this session is `B-197`**, and `B-` stays contiguous `B-001` … `B-196`, no gaps.

### 2026-09-01 (third) — `SINGLE-CLOCK-SWITCH-01` §6: `B-197` TAKEN

**Claimed: `B-197`** — _a rounded live plate loses the only home it had_
([bugs-runtime.md](bugs-runtime.md)). A written verdict with nothing implemented, filed because the
reorder in `openspec/changes/single-clock-look-switch` removes the mechanism `design.md` §9a.1's
border-radius sub-heading was counting on — a promise that would otherwise stand unqualified.

⚠ **The brief that ordered it attributed border-radius to `D-155`, which is aspect-lock-on-resize.**
The reasoning has never had an item at all; it lives only in an unnumbered sub-heading at
`live-source-multibox/design.md:1876`. That is the reason for filing rather than amending.

**Derivation, from headings as the rule requires:** highest `B-` HEADING across every ref was
**`B-196`** (taken earlier the same day); `B-197` … `B-203` returned **no headings anywhere**, and the
duplicate audit printed exactly the two accepted duplicates (`B-056`, `B-080`). **Cross-check against
the dated pointer:** the entry above ends _"Next free after this session is `B-197`"_ — headings and
pointer AGREE.

⇒ **Next free after this session is `B-198`**, and `B-` stays contiguous `B-001` … `B-197`, no gaps.

### 2026-09-01 — `B-198` (`SINGLE-CLOCK-SWITCH-02` §3: the measurement that did NOT reach zero)

`B-198` — **one `MIXER` batch is not atomic**: in 1 recording of 100, the arriving plate's
`MIXER … FILL` took effect a whole channel frame before the departing box's, so the outgoing box was
drawn over the incoming picture for 40 ms. Filed in `bugs-runtime.md`. It is the residual that
blocks `single-clock-look-switch`'s all-or-nothing acceptance — the term that change targets, the
page/mixer skew `k`, measured **0 in 100 of 100**.

**Derivation, from headings as the rule requires:** highest `B-` HEADING across every ref was
**`B-197`** (taken earlier the same day by the border-radius item); `B-198` … `B-201` returned **no
headings anywhere** — every occurrence is a provenance sentence in an earlier item or this file's own
forward-reference pointer, the documented false positive. The duplicate audit printed exactly the two
accepted duplicates (`B-056`, `B-080`). **Cross-check against the dated pointer:** the entry above
ends _"Next free after this session is `B-198`"_ — headings and pointer AGREE.

⇒ **Next free after this session is `B-199`**, and `B-` stays contiguous `B-001` … `B-198`, no gaps.

### 2026-09-02 — `B-199` and `B-200` (`MIXER-DEFER-SAFETY-01`: closing the window `B-198`'s fix opened)

`B-199` — **a seating batch that dies between its first `DEFER` and its `COMMIT` leaves a staged
change behind**, and a dropped connection does NOT clear it: staged on one socket, destroyed it,
reconnected, and a commit from the NEW connection applied the dead one's change. Fixed the same day
by a guard that commits on the way out and re-asserts the ledger's geometry. FIXED.

`B-200` — **`B-166`'s rollback re-fit is still un-staged**, so an all-or-nothing undo can itself land
across two frames. Named because the previous session's report said it was "filed, not hidden" and it
had in fact never been given a number — this entry is that correction. OPEN, low.

**Derivation, from headings as the rule requires:** highest `B-` HEADING across every ref was
**`B-198`** (taken the previous day by the MIXER-batch item); `B-199` … `B-205` returned **no headings
anywhere**. **Cross-check against the dated pointer:** the entry above ends _"Next free after this
session is `B-199`"_ — headings and pointer AGREE.

⚠ `B-199` was written into the source comments before it was written into `bugs-runtime.md`, which is
the wrong order and is recorded rather than tidied: the number was derived from the headings first,
so it was never at risk of collision, but a reader who grepped between the two commits would have
found a code reference with no item.

⇒ **Next free after this session is `B-201`**, and `B-` stays contiguous `B-001` … `B-200`, no gaps.

### 2026-09-02 — `B-201`, `B-202` and `P-038` (the `MIXER-DEFER-SAFETY-01` DELTA: what the cancelled CI runs were hiding)

Three numbers from one investigation, and the order matters: `P-038` is why the other two survived
three CI runs.

| kind | id      | one line                                                                                                                                                                                     | home                               |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `B-` | `B-201` | the offline mock rebuilt the bank range by hand in FOUR places, so it published no bed slots and refused every bed row `not-fixed` — eleven E2E specs could not load a plate-bearing package | [bugs-runtime.md](bugs-runtime.md) |
| `B-` | `B-202` | the schema's `low` default omitted `visibility`, so an UPGRADED station showed nine bed rows where a fresh one shows two                                                                     | [bugs-runtime.md](bugs-runtime.md) |
| `P-` | `P-038` | turbo buffers a task's output and the job cap kills it first, so a RED suite and a SLOW suite are byte-identical evidence                                                                    | [platform.md](platform.md)         |

**Derivation for `B-`, from headings as the rule requires:** highest `B-` HEADING across every ref
was **`B-200`** (taken the same day by the DEFER-safety item); `B-201` … `B-205` returned **no
headings anywhere** — every hit in that range is a prior session's own derivation note, which is
exactly the false positive the heading-only rule exists to ignore. **Cross-check against the dated
pointer:** the previous entry ends _"Next free after this session is `B-201`"_ — headings and
pointer AGREE. Two numbers taken, so the next is `B-203`.

**Derivation for `P-`:** highest `P-` HEADING was **`P-037`**; `P-038` … `P-040` returned no
headings, and the only `P-038` hit anywhere was the registry's own forward pointer. The dated
pointer reads _"no gaps. Next free: `P-038`."_ — headings and pointer AGREE.

⚠ **The duplicate audit for `B-` did NOT print nothing this time, and it is not this session's
doing.** `git grep -hoE "^#+ \[[ x~]\] B-[0-9]{3}"` piped through `sort | uniq -d` reports **two**
numbers carrying more than one heading: **`B-056`** and **`B-080`**. Both predate this session and
neither was touched by it. Recorded rather than fixed, because renumbering a shipped item is worse
than a duplicate heading and the right repair is the owner's call — but the audit is no longer a
clean signal for `B-`, so the next session should expect those two hits and not read them as new.

⚠ **`B-203` was taken later in the SAME session.** Fixing `B-201` made bed rows render for the
first time, and the first thing a rendered bed row showed was a wrong name — `LayerRow` restated
`Layer ${bankPosition}` instead of calling `defaultLayerAlias`, so bed 9 read `Layer 1`, which is
also operator row 89. A FIFTH restatement of the same derivation, and the first in shipped renderer
code. Derivation: highest heading was `B-202`, `B-203` … `B-207` absent.

⚠ **`B-204` and `B-205` were taken later in the SAME session, by a COMPLETENESS SWEEP rather than
by a failure.** Having found seven hand-restated derivations of the two-bank shape, the session
swept for more instead of assuming it had them all — three patterns: row-name strings built by hand,
bank-range arithmetic outside `shared-ipc`, and hard-coded `layer <= 9` predicates. Two survivors
were real and both are in SHIPPED BRIDGE code: `#reassertDeclaredVolumes` and the fail-closed untick
gate each walk the operator half only. Neither was fixed — both are wire-path or refusal-path
changes and the prompt authorised neither. Derivation: highest heading `B-203`, `B-204` … `B-208`
absent.

⇒ **Next free after this session is `B-206`** (`B-` stays contiguous `B-001` … `B-205`, no gaps)
**and `P-039`** (`P-001` … `P-038`, no gaps).

### 2026-09-02 — `B-206`, `B-207`, `P-039` and `P-040` (`BANK-HALF-SWEEP-01`: the two bridge halves closed, and a guard against the tenth)

| kind | id      | one line                                                                                                                                                 | home                               |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `B-` | `B-206` | the bed range is NOT fixed at install — `validateFixedBankChange` refuses a moved/resized operator half and says nothing about `low.start` / `low.count` | [bugs-runtime.md](bugs-runtime.md) |
| `B-` | `B-207` | the startup VOLUME re-assert consults nothing about what is on the layer, so a surviving producer is audible from first reachability until adopted       | [bugs-runtime.md](bugs-runtime.md) |
| `P-` | `P-039` | `cg/bank-shape` — a lint guard for the two-bank SHAPE in every workspace; 16 sites on first fire, 3 verbatim reintroductions caught                      | [platform.md](platform.md)         |
| `P-` | `P-040` | the gate persists its FULL output to `.gate-logs/gate-<stamp>-<pid>.log` from the one chokepoint                                                         | [platform.md](platform.md)         |

`B-204` and `B-205` — filed by the previous session, not fixed there — were closed in code this
session (both walks now iterate `fixedBankSlots`), red-first, and their headings flipped to `[x]`.

**Derivation for `B-`, from headings as the rule requires:** highest `B-` HEADING across every ref
was **`B-205`** (taken the previous session by the completeness sweep); `B-206` … `B-210` returned
**no headings anywhere**. **Cross-check against the dated pointer:** the entry above ends _"Next
free after this session is `B-206`"_ — headings and pointer AGREE. Two numbers taken.

**Derivation for `P-`:** highest `P-` HEADING was **`P-038`**; `P-039` … `P-041` returned no
headings. The dated pointer reads _"and `P-039`"_ — headings and pointer AGREE. Two numbers taken.

⚠ The `B-` duplicate audit still reports `B-056` and `B-080` (predating, recorded by the previous
entry, untouched here).

⚠ `B-206` was found by READING `B-205`'s function one clause further than the fix needed, not by
a failure: the same operator-only assumption, on the renumber/resize refusals instead of the untick
one. It is a NEW refusal and was deliberately not made inside a bug fix. `B-207` was found by
verifying `B-204`'s "medium" reasoning instead of inheriting it: the re-assert asks nothing about
the layer, which `live-source-multibox/design.md` had already recorded for the Live Source range.

⇒ **Next free after this session is `B-208`** (`B-` stays contiguous `B-001` … `B-207`, no gaps)
**and `P-041`** (`P-001` … `P-040`, no gaps).

### 2026-09-04 — `P-041` (`LAN-DEV-ACCESS-01`: LAN-visible dev servers, the bridge origin derived from the page, and a guard)

| kind | id      | one line                                                                                                                                                                          | home                       |
| ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `P-` | `P-041` | the dev servers answer only on `localhost` and the client assumes it — LAN-visible dev by default, the bridge origin derived from the page's own origin, `cg/no-hardcoded-origin` | [platform.md](platform.md) |

**Derivation for `P-`, from headings as the rule requires:** highest `P-` HEADING across every ref
was **`P-040`**; `P-041` … `P-043` returned **no headings anywhere** — the only `P-041` hits were
this file's own forward pointer and the filing session's cross-references, the documented false
positive. **Cross-check against the dated pointer:** the entry above ends _"and `P-041`"_ —
headings and pointer AGREE. One number taken. **Prefix class `P-`, chosen because** the subject is
cross-cutting dev tooling — two apps' dev servers, the Runtime's platform layer and the lint tier —
not a Runtime feature (`R-`), not a CasparCG behaviour (`C-`), not an on-air bug (`B-`).

`C-024` was CLOSED in code this session (its remaining half: the commented-out pin deleted, the
never-stage entry dropped, the warning sentence completed — `f41da425`); no new `C-` number.
Nothing filed under `B-`: the beacon-probe harness default (`beacon-probe-lib.mjs:49`,
`DEFAULT_LAN_HOST = '192.168.21.93'`) is recorded INSIDE `P-041` as filed-not-fixed rather than
given a number of its own — a throwaway harness default outside the prompt's boundary, not a
product bug. The `B-` duplicate audit was not rerun (no `B-` taken); `B-056` and `B-080` remain as
recorded above.

⇒ **Next free after this session is `B-208`** (unchanged) **and `P-042`** (`P-001` … `P-041`, no
gaps).

### 2026-09-04 — `C-029` and `B-208` (`PGM-OUTPUT-ALARM-01`: program output missing is said, and the consumer verbs' lying replies are on record)

| kind | id      | one line                                                                                                                                                                                       | home                               |
| ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `C-` | `C-029` | the declared-versus-running output check (`INFO CONFIG` vs `INFO <channel>`), its full-width banner with an UNVERIFIED arm, and `--create-missing-consumers` OFF by default                    | [caspar.md](caspar.md)             |
| `B-` | `B-208` | a DeckLink `ADD` for a device the server cannot open is `403` + " Check syntax."; `ADD … DECKLINK DEVICE <n>` is `404 File not found.`; `ADD` at a running index replaces; `REMOVE` acks early | [bugs-runtime.md](bugs-runtime.md) |

**Derivation for `C-`, from headings as the rule requires:** highest `C-` HEADING was **`C-028`**;
`git grep -n "C-029"` returned the registry's own "next free" pointer and `C-028`'s provenance note
— the documented false positives — and no heading. **Cross-check against the dated pointer:** the
2026-08-25 entry ends _"Next free: `C-029`"_ — headings and pointer AGREE. One number taken.
**Prefix class `C-`, chosen because** the subject is CasparCG behaviour read over AMCP and the
bridge's judgement of it, not a Runtime-only surface (the banner is the saying, the check is the
subject).

**Derivation for `B-`:** highest `B-` HEADING across the three bug files was **`B-207`**;
`git grep -n "B-208"` returned only this file's forward pointers and `B-207`'s provenance note,
never a heading. **Cross-check against the dated pointer:** the entry above ends _"Next free after
this session is `B-208`"_ — headings and pointer AGREE. One number taken. Filed in
`bugs-runtime.md` per the routing rule: a CasparCG/bridge behaviour, not tooling.

⚠ `B-208` was found by MEASURING what the brief's §0f asked to be found before any reply was
trusted — the consumer-side twin of `B-177`'s disguise — and it came back with two disguises rather
than one (the `403` for a missing device, and the `404` for the brief's own spelling of the
command), plus two lifecycle facts (`ADD` replaces at a running index; `REMOVE` acks 13–16 ms before
the destroy) measured on the dev host's 2.5.0 where the log could be read.

⚠ The `B-` duplicate audit was not rerun (one `B-` taken, derived from headings); `B-056` and
`B-080` remain as recorded above.

⇒ **Next free after this session is `B-209`** (`B-001` … `B-208`, no gaps), **`C-030`**
(`C-001` … `C-029`, no gaps) **and `P-042`** (unchanged).

### 2026-09-04 — `C-030` (`CARD-ADDRESSING-01`: how the output card is addressed, and where the operator gets the number)

| kind | id      | one line                                                                                                                                                                           | home                   |
| ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `C-` | `C-030` | `<device>` takes a slot index or a persistent ID through ONE field, matched slot-first then ID; the alarm names the form; the log recipe; a recommendation for this one-card plant | [caspar.md](caspar.md) |

**Derivation for `C-`, from headings as the rule requires:** highest `C-` HEADING was **`C-029`**
(taken by `PGM-OUTPUT-ALARM-01` the same day); `git grep -n "C-030"` returned only this file's own
"next free" pointer — the documented false positive — and no heading. **Cross-check against the
dated pointer:** the entry above ends _"**`C-030`** (`C-001` … `C-029`, no gaps)"_ — headings and
pointer AGREE. One number taken. **Prefix class `C-`, chosen because** the subject is how CasparCG
addresses a DeckLink and what the bridge's alarm says about it, not a Runtime-only surface.

Nothing filed under `B-`: the slot-first / ID-second matching with no marker (`util.h` `get_device`)
is an UPSTREAM CasparCG property recorded inside `C-030`, not a product defect; and `B-208` already
holds the consumer-verb replies this session re-used. The `B-` duplicate audit was not rerun (no
`B-` taken); `B-056` and `B-080` remain as recorded above.

⇒ **Next free after this session is `B-209`** (unchanged), **`C-031`** (`C-001` … `C-030`, no gaps)
**and `P-042`** (unchanged).

### 2026-09-04 — `B-209` … `B-215`, `C-031` and `C-032` (`RUNTIME-FIX-0904`: why every take is refused, and the surfaces that would not say)

| kind | id      | one line                                                                                                                                                  | home                               | status         |
| ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------- |
| `B-` | `B-209` | the audit record keeps the refusal CODE and not the COMMAND it answered — `AuditEntry.command`, from the one `#send` chokepoint                           | [bugs-runtime.md](bugs-runtime.md) | closed in code |
| `B-` | `B-210` | the Audit log shows raw UTC stamps to a control room at UTC+3:30 — local time to the second, the date as a band, UTC on hover                             | [bugs-runtime.md](bugs-runtime.md) | closed in code |
| `B-` | `B-211` | the Audit log shows two raw UUIDs per row — names first (the table's and the picker's own rules), ids beneath, shortened, complete in the title, copyable | [bugs-runtime.md](bugs-runtime.md) | closed in code |
| `B-` | `B-212` | the in-use refusal names a COUNT not a LOCATION, and nudged toward Remove All — `references` on the wire, one wording, "Show <row>" / "Remove item"       | [bugs-runtime.md](bugs-runtime.md) | closed in code |
| `B-` | `B-213` | `State (n)` counts ERROR rows as on air — `(N on air)` and `(N in error)`, two predicates, one file                                                       | [bugs-runtime.md](bugs-runtime.md) | closed in code |
| `B-` | `B-214` | every take refused `amcp-404` by `.114` since 11:37:32Z, 118 s after the same `CG ADD` was accepted — the server process changed and has no html producer | [bugs-runtime.md](bugs-runtime.md) | filed only     |
| `B-` | `B-215` | a refused fixed-row load leaves a slotless item that restore seats on a DYNAMIC layer (60–69) no row shows                                                | [bugs-runtime.md](bugs-runtime.md) | filed only     |
| `C-` | `C-031` | the boot line says how many templates loaded and how many files were skipped                                                                              | [caspar.md](caspar.md)             | closed in code |
| `C-` | `C-032` | the ephemeral serve-port default — recommendation: a pinned default                                                                                       | [caspar.md](caspar.md)             | filed only     |

**Derivation for `B-`, from headings as the rule requires:** highest `B-` HEADING across the three
bug files was **`B-208`** (`git grep -n -E "^## \[.\] B-2[0-9][0-9]"`); `B-209` … `B-215` returned **no
headings anywhere** — the only `B-209` hits were this file's own forward pointers, the documented
false positive. **Cross-check against the dated pointer:** the entry above ends _"Next free after
this session is `B-209`"_ — headings and pointer AGREE. Seven numbers taken, all filed in
`bugs-runtime.md` per the routing rule (Runtime surfaces and a CasparCG-side incident).

**Derivation for `C-`:** highest `C-` HEADING was **`C-030`**; `git grep -n "C-031"` returned only this
file's forward pointer. The dated pointer reads _"`C-031` (`C-001` … `C-030`, no gaps)"_ — headings
and pointer AGREE. Two numbers taken. **Prefix class `C-`, chosen because** both are bridge/CasparCG
plumbing (the boot line, the serve port), not Runtime surfaces.

⚠ `B-214` is the INCIDENT, filed not fixed: the defect is on the plant (the server process answering
at `.114` has no html producer), and the measurement is handed to the owner as one line in a named
window. `B-215` was found by tracing the two invisible items in the record (first entry
`load failed wrong-bank`, next entry `out ok L60`) to `#slotForRestore`'s `#allocate()` fall-through
— a restore defect outside the brief's boundary, filed with two candidate fixes.

⚠ The `B-` duplicate audit was not rerun (numbers derived from headings); `B-056` and `B-080` remain
as recorded above.

⇒ **Next free after this session is `B-216`** (`B-001` … `B-215`, no gaps), **`C-033`** (`C-001` …
`C-032`, no gaps) **and `P-042`** (unchanged).

### 2026-09-04 — `B-216` and `C-033` (`UPDATE-INFORCE-02`: the two doors, and the harness's consumers)

| kind | id      | one line                                                                                                                                                                            | home                               | status         |
| ---- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------- |
| `B-` | `B-216` | the three live-layer doors answered one row three ways, and `update` seated a REHEARSING row's plates — ownership is now the LEDGER (or air) at every door, never the rehearse flag | [bugs-runtime.md](bugs-runtime.md) | closed in code |
| `C-` | `C-033` | the skew harness captures and restores a borrowed channel's CONSUMERS as well as its mode, and says loudly what it is about to change when a live output is attached                | [caspar.md](caspar.md)             | closed in code |

**Derivation for `B-`, from headings as the rule requires:** highest `B-` HEADING across the three
bug files was **`B-215`** (`git grep -n -E "^## \[.\] B-2[0-9][0-9]"`); `git grep -n "B-216"`
returned exactly ONE hit — this file's own "Next free" pointer, the documented false positive — and
no heading. **Cross-check against the dated pointer:** the entry above ends _"Next free after this
session is `B-216`"_ — headings and pointer AGREE. One number taken, filed in `bugs-runtime.md`
(a bridge/runtime playout defect).

**Derivation for `C-`:** highest `C-` HEADING was **`C-032`**; `git grep -n "C-033"` returned only
this file's own pointer. The dated pointer reads _"`C-033` (`C-001` … `C-032`, no gaps)"_ —
headings and pointer AGREE. One number taken. **Prefix class `C-`, chosen because** the subject is
a CasparCG-side instrument's handling of a channel's consumers over AMCP, not a Runtime surface.

⚠ `B-216` was found by MEASURING the record's two contradictory statements at the mock wire before
any code changed; the measurement is the item's first section. The `B-` duplicate audit was not
rerun (numbers derived from headings); `B-056` and `B-080` remain as recorded above.

⇒ **Next free after this session is `B-217`** (`B-001` … `B-216`, no gaps), **`C-034`** (`C-001` …
`C-033`, no gaps) **and `P-042`** (unchanged).

### 2026-09-04 (later) — `B-217`, `B-218` and `D-158` (`DESIGNER-FIX-0902`: the dead canvas video, the shared aspect toggle, the feature that answered itself)

| kind | id      | one line                                                                                                                                                                                                                 | home                                 | status                                                                                        |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `B-` | `B-217` | a canvas video went BLANK after look switches and undo; the blank is NOT reproduced, and three defects in the seam it went through (the park's blind revive, detached membership, a pooled dead node) are closed in code | [bugs-designer.md](bugs-designer.md) | three mechanisms closed in code; the owner's blank filed, open                                |
| `B-` | `B-218` | "keep aspect / free" was ONE flag for every plate in every look — now per plate (and per arrangement), still session-only; persistence is the owner's open decision                                                      | [bugs-designer.md](bugs-designer.md) | closed in code                                                                                |
| `D-` | `D-158` | artwork over the live box — ANSWERED without a flag: it is its own template on a bank row; the August per-element flag design is obsolete with the mask; recorded in both guides                                         | [designer.md](designer.md)           | answered by documentation, `[x]`, no change dir; a per-box super is noted as a future request |

**Derivation for `B-`, from headings as the rule requires:** highest `B-` HEADING across the three
bug files was **`B-216`** (`git grep -n -E "^## \[.\] B-2[0-9][0-9]"`); `git grep -n "B-217"`
returned exactly ONE hit — this file's own "Next free" pointer, the documented false positive — and
`git grep -n "B-218"` returned nothing. **Cross-check against the dated pointer:** the entry above
ends _"Next free after this session is `B-217`"_ — headings and pointer AGREE. Two numbers taken,
both filed in `bugs-designer.md` (Designer canvas and Inspector surfaces).

**Derivation for `D-`:** highest `D-` HEADING was **`D-157`** (`designer.md:5049`); `git grep -n
"D-158"` returned only `D-157`'s own sweep note (_"`D-158` returned nothing at all"_), never a
heading. ⚠ **Cross-check against the dated pointer — they DISAGREE.** The last dated `D-` sentence in
this file is the 2026-08-24 entry's _"Next free: `D-157` and `B-176`"_ (and the 2026-08-24 `R-`
entry's _"`R-059`, `D-157` and `B-176`"_): both were written BEFORE `D-157` was filed and no later
entry advanced the `D-` pointer when it was taken. Headings win, as the rule says; `D-158` is taken
here and the pointer is corrected below. One number taken, filed in `designer.md` — a feature
request, answered rather than implemented.

⚠ The `B-` duplicate audit was not rerun (numbers derived from headings); `B-056` and `B-080` remain
as recorded above.

⇒ **Next free after this session is `B-219`** (`B-001` … `B-218`, no gaps), **`D-159`** (`D-001` …
`D-158`, no gaps — corrected from the stale `D-157`), **`C-034`** and **`P-042`** (both unchanged).
