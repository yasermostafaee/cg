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
space stays contiguous: `B-001` … `B-112`, no gaps. **Next free: `B-113`.**

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

### RECOMMENDATION (recorded, not implemented): retire the "next free" pointer

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
