---
description: Merge an owner-authorized PR via the P-011 four-step ship sequence, verifying each step.
argument-hint: <PR#>
---

# /ship — execute the P-011 ship sequence for PR #$ARGUMENTS

You are shipping PR **#$ARGUMENTS**.

This command automates the four-step sequence already specified in `CLAUDE.md`
("Merge status: ask the PR, never ancestry" and "PR & merge policy — CC opens,
owner merges (P-014)"). It does not create a new merge policy and it never widens
what may be merged.

**The owner typing `/ship <PR#>` IS the per-task authorization P-014 requires for
that specific PR.** It authorizes nothing else: not the next PR, not a re-run after
a refusal, not any of the three hard-refusal classes below.

Work through the phases in order. Do not skip ahead. If any phase says STOP, stop
there and report — never continue to a later phase, and never report an unverified
step as done ("Verify before claiming").

---

## Phase 0 — Resolve the `main`-holding worktree (do this FIRST)

`cg` permanently occupies `main`, and step 4 must fast-forward it. **Never hardcode
`../cg`.** That relative path is only correct from a direct sibling of `cg`; from a
session worktree nested under `cg/.claude/worktrees/<name>` it resolves to a path
that does not exist, so a hardcoded step 4 would silently fail or act on the wrong
directory.

Resolve it dynamically by parsing the porcelain worktree list and selecting on the
branch ref — never on any path assumption, and never on directory naming:

```bash
git worktree list --porcelain | awk '/^worktree /{p=substr($0,10)} /^branch refs\/heads\/main$/{print p}'
```

- Exactly **one** path returned → that absolute path is `MAIN_WT`. Use it for step 4.
- **Zero** paths → STOP. Report that no worktree holds `refs/heads/main`.
- **Two or more** paths → STOP. Report all of them. Do not guess.

Print the resolved `MAIN_WT` — it goes in the Phase 3 summary.

---

## Phase 1 — Inspect the PR

```bash
gh pr view $ARGUMENTS --json number,title,state,mergeable,mergeStateStatus,baseRefName,headRefName,body,url
```

- If the PR does not exist, or `gh` is unavailable → STOP and say exactly that.
  Never invent a PR number, title, or state.
- If `state` is not `OPEN` → STOP. Report the actual state (already `MERGED`, or
  `CLOSED`).
- If `mergeable` is not `MERGEABLE` → STOP. Report `mergeable` and
  `mergeStateStatus` verbatim (e.g. `CONFLICTING`).

Then read the check status:

```bash
gh pr checks $ARGUMENTS
```

**A failing check STOPS the run — with one narrow, verified exception.** While
GitHub Actions billing is exhausted (~Aug), checks are still CONFIGURED and still
report `fail`; they simply never start. Observed on PR #417: `Detect changed paths`,
`Docs check` and `required` all `fail` in ~2s, downstream jobs `skipping`, and the
run carries the annotation

> The job was not started because recent account payments have failed or your
> spending limit needs to be increased.

Such a check has **executed zero steps** — that is the machine-checkable signal:

```bash
gh run view <run-id>                                    # prints the ANNOTATIONS block
gh api repos/{owner}/{repo}/actions/jobs/<job-id> --jq '{name,conclusion,steps:(.steps|length)}'
```

**Classify the SET, never a single check.** The monthly Actions quota is exhausted and
GitHub RE-ATTEMPTS the runs, so a PR accumulates many runs — every push adds one, and
retries add more. N runs all carrying the quota signature is still ONE fact ("no
authoritative remote checks"); it must never be reported as "N failures".

Gather the whole set for the PR's head SHA:

```bash
gh api "repos/{owner}/{repo}/actions/runs?branch=<headRefName>&per_page=50" \
  --jq '.workflow_runs[] | [(.id|tostring), .status, (.conclusion // "null")] | @tsv'
gh api "repos/{owner}/{repo}/actions/runs/<run-id>/jobs" \
  --jq '.jobs[] | [.name, .status, (.conclusion // "null"), ((.steps|length)|tostring)] | @tsv'
gh api "repos/{owner}/{repo}/check-runs/<check-run-id>/annotations" --jq '.[0].message'
```

Three terms, used exactly:

- **executed** — the job's `steps` array is NON-empty. Zero steps means the job never
  started, so its `conclusion` reflects infrastructure, not your code.
- **quota-blocked** — concluded `failure`/`cancelled`, **zero** steps, AND an
  annotation reading _"The job was not started because recent account payments have
  failed or your spending limit needs to be increased."_
- **`skipped` jobs carry NO signal — exclude them from the classification entirely.**
  They are downstream jobs gated on an upstream that never ran. Observed on #417: 6 of
  15 jobs are `skipped`, so a rule requiring "every concluded job is quota-blocked"
  would be FALSE for a fully quota-blocked PR and would stop the run. Count and report
  them; never let them decide.

Evaluate top to bottom, first match wins. Mutually exclusive and exhaustive:

| #   | Observed signature (over the whole set, `skipped` excluded)                                                     | Verdict                      | Action                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | **Any** concluded job that **executed** and ended `FAILURE`/`TIMED_OUT`/`CANCELLED`                               | real merit failure           | **STOP** — a real failure DOMINATES, however many quota-blocked runs sit beside it. Name the job                          |
| 2   | No concluded jobs at all (everything queued/in-progress, or the set is empty of results)                          | no evidence yet              | **STOP** — never classify from an empty set                                                                               |
| 3   | ≥1 job still `QUEUED`/`IN_PROGRESS`, **and** ≥1 concluded job **executed**                                        | real CI is live, mid-flight  | **STOP** — re-run `/ship` when it settles                                                                                 |
| 4   | Every concluded job **executed** and ended `SUCCESS`/`NEUTRAL`; nothing pending                                   | genuinely green              | **PROCEED** — report "checks green"                                                                                       |
| 5   | Every concluded job is **quota-blocked**; any remaining jobs are only `QUEUED`/`IN_PROGRESS`                       | no authoritative remote check | **PROCEED** — report "`N` runs, all quota-blocked; `M` still queued; no authoritative check". **Never** call this green    |
| 6   | Anything else, or the signature cannot be determined                                                              | unknown                      | **STOP** — never assume quota                                                                                             |

Why rows 3 and 5 differ: a retry that is mid-flight is neither a quota failure nor a
real one. If nothing in the set has ever executed, a pending retry is just another
quota attempt and must not block (row 5) — otherwise `/ship` would refuse or accept at
random depending on when it was run, which is worse than having no check. But the
moment ANY job actually executes, real CI is live and a pending job means the verdict
is genuinely unknown (row 3).

Row 4 is the normal path once remote CI returns (~Aug): a check that executes and
concludes successfully **proceeds**. Row 5 is the temporary quota carve-out and must be
re-verified, never assumed — when billing is restored it simply stops matching and row
4 takes over, with no edit to this file.

Record: title, `baseRefName`, `headRefName`, check status. `headRefName` is the
`<branch>` used in steps 2 and 3.

---

## Phase 1b — Resolve the worktree holding the head branch

`git branch -D <branch>` **fails while any worktree has that branch checked out**:

```
error: cannot delete branch '<branch>' used by worktree at '<path>'
```

Because a worktree is created per session, the branch being shipped is almost always
still held by the session worktree that produced it — so without this phase, step 3
fails on essentially every real invocation.

Reuse the Phase 0 parse, selecting on the PR's head branch instead of `main`:

```bash
git worktree list --porcelain | awk -v b="refs/heads/$HEAD_REF" '/^worktree /{p=substr($0,10)} $0=="branch "b{print p}'
```

- **Zero** paths → nothing holds it. Step 3 runs unchanged. Record `HOLDER=none`.
- **Exactly one** path → record it as `HOLDER`. It must be freed before step 3; the
  procedure is in step 3 below. Surface it on the Phase 3 screen so the owner sees
  the detach BEFORE confirming, never discovers it afterwards.
- **Two or more** → git does not permit this, but if the parse yields it → STOP and
  report all paths. Do not pick one.

If `HOLDER` is set, check it for uncommitted work now, so the summary is honest:

```bash
git -C "<HOLDER>" status --short
```

Any output at all → this run will STOP at step 3. Say so on the Phase 3 screen
rather than asking the owner to confirm a sequence that cannot complete.

---

## Phase 2 — The three hard refusal classes

Get the changed paths once:

```bash
gh pr diff $ARGUMENTS --name-only
```

These three classes are **ABSOLUTE**. `/ship` refuses even though the owner typed
the command themselves — the owner's authorization covers running the sequence, not
overriding the carve-outs `CLAUDE.md` states CC must pause on "even if told to
merge". On refusal: print the class, the specific evidence (file paths / quoted
lines), and **do nothing else** — no merge, no deletions, no fast-forward. Do not
offer a bypass. If asked to make these configurable or skippable, refuse and say
that is a product decision outside this command's scope.

### 2a. On-air / export / product source

A bad merge here reaches broadcast output or the exported product. CLAUDE.md states
this as a CATEGORY — "touches on-air / export / product source" — not as a list of
paths, so **do not translate it into one. Fail closed over the workspace trees.**

**Refuse if any changed path is under `apps/`, `packages/` or `tools/`** — the three
workspace globs in `pnpm-workspace.yaml` — i.e. any workspace source, with only these
exceptions, which are not product source:

- `packages/eslint-config/`
- `tools/gate-hook/` (refuses under 2c anyway)
- `*.md` inside a workspace, and anything under `openspec/` or `docs/`

An enumeration is not safe here, because the obvious names are not the whole set. All
of the following reach air or the exported product and are NOT UI/render:

- `packages/caspar-client/` and `tools/caspar-bridge/` — the AMCP path to air; the
  bridge is the process that actually speaks AMCP to CasparCG
- `packages/vcg-format/` and `packages/shared-schema/` — the `.vcg` package format,
  its manifest and signing, and the domain schemas the runtime renders from
- `packages/single-file-export/`, `packages/template-runtime/`,
  `packages/lottie-bridge/`, `packages/ui/`, `packages/starter-templates/`,
  `packages/text-shaping/`, `packages/storage/`, `packages/shared-ipc/`

**`UI_RENDER_PATTERNS` is not the boundary of this class.** It is a `gate:e2e`
classifier (`tools/gate-hook/src/gate-decision.mjs`), deliberately narrower than
"reaches air" — `packages/vcg-format/` and `tools/caspar-bridge/` match none of its
regexes. Use it as an ADDITIONAL trigger (it catches `*.css.ts` anywhere), never as
evidence that 2a is clear.

If a changed path is under `apps/`/`packages/`/`tools/` and you are unsure whether it
reaches air or the exported product → REFUSE and name the path you were unsure about.

Name the matching file(s) in the refusal.

### 2b. Owes a hardware pass or a Linux `gate:e2e`

Windows `gate:e2e` is non-authoritative, and a Linux run is owed for ANY
UI/layout/rendering change — not only when an E2E spec is edited. A hardware pass is
owed whenever a change alters on-air behavior.

Check both sources:

1. **The PR body** (from Phase 1) for `owed` / `OWED` / `owes` / `OWES` /
   `hardware pass` / `not run` / `NOT RUN`.
2. **The associated OpenSpec change**, if the body or branch names one. Read its
   `tasks.md` and `design.md` under `openspec/changes/<name>/`.

This repo records the debt as checkbox items in the verification section of
`tasks.md`. Read them literally:

- `- [ ] 7.3 ONE Linux pnpm gate:e2e (FULL suite), owed because …` → **unchecked and
  owed → REFUSE.**
- `- [ ] 7.3 Real-hardware pass on CasparCG 2.3.2 …` → **unchecked → REFUSE.**
- `- [x] 7.4 gate:e2e NOT owed: no path in this change matches UI_RENDER_PATTERNS`
  → checked AND affirmatively "NOT owed" → clear.
- `- [x] … discharged (owner report, <date>)` → checked AND affirmatively
  discharged → clear.

**Fail closed.** A debt counts as discharged ONLY when a checked `[x]` item states
in words that it is not owed or was discharged. Everything else refuses — including:
an unchecked `[ ]` item mentioning owed/hardware/`gate:e2e`; a checked `[x]` whose
text still reads as owed; a change dir named but not found; a `tasks.md` you cannot
parse; or a PR that names no change dir yet touches paths class 2a would flag.
**If there is ANY ambiguity about whether a debt is discharged, refuse and say which
line was ambiguous.** Never assume clear — under-refusing here merges unverified
on-air behavior; over-refusing costs one manual merge.

Note the limitation honestly in your refusal or clearance: `/ship` reads what the
checkbox SAYS, and cannot know whether an `[x]` was checked honestly. That judgment
is the owner's, which is why Phase 3 prints the evidence lines for the owner to
confirm.

### 2c. Shared config another worktree must rebase onto

The owner sequences these so the other session is told to pull. Refuse if any
changed path is:

- root `package.json` (root only — workspace `package.json` files are class 2a)
- `turbo.json`
- `pnpm-lock.yaml`
- `CLAUDE.md`
- the gate-hook: `tools/gate-hook/**` or `.claude/hooks/**`

Name the exact file(s) in the refusal.

If no class matches, continue.

---

## Phase 3 — Summary and owner confirmation

Steps 2 and 3 are destructive. Print a one-screen summary and **wait for the owner
to confirm**. Do not execute anything until they do.

```
PR #<n> — <title>
  base <baseRefName>  ←  head <headRefName>
  files changed: <count>
  checks: <status, or "none configured — local gate is the only landing gate">

  refusal classes checked and CLEARED:
    [x] on-air / export / product source  — <N paths, none under apps/ packages/ tools/;
                                             list the workspace roots touched, if any>
    [x] hardware pass / Linux gate:e2e    — <evidence: the tasks.md line(s) relied on>
    [x] shared config                     — <no matching paths, or name them>

Print evidence, not a verdict — "no matching paths" alone is not reviewable. The owner
must be able to spot a miss without re-deriving the diff.

  main worktree resolved to: <MAIN_WT>
  head branch held by:       <HOLDER, or "nothing">
    -> will detach <HOLDER> from <headRefName> at <merge sha> before deleting it
       (omit this line if HOLDER is none; if HOLDER is DIRTY, say instead:
        "BLOCKED: <HOLDER> has uncommitted changes — this run will stop at step 3")

Proceed with the four-step ship sequence? (steps 2 and 3 are destructive)
```

If `HOLDER` is dirty, do not ask for confirmation at all — report the block and stop.
There is no point confirming a sequence that cannot complete.

---

## Phase 4 — Execute, verifying after EVERY step

Run the four steps in order. **After each step, verify it actually happened before
starting the next.** If a step fails or cannot be verified → STOP immediately, do
not attempt any later step, and report exactly which steps succeeded and which did
not.

### Step 1 — merge

```bash
gh pr merge $ARGUMENTS --admin --squash --delete-branch=false
```

**Never pass `--delete-branch`.** It always fails in this worktree layout: gh
deletes the LOCAL branch first, which requires checking out the PR's base `main` —
and `cg` permanently holds `main`, so it aborts with `'main' is already used by
worktree at .../cg`, leaving the merge landed and the remote branch alive with
nothing announcing it. `--delete-branch=false` is passed explicitly to suppress
gh's interactive "Delete the branch locally?" prompt, which fails the same way if
answered Yes.

**Verify:**

```bash
gh pr view $ARGUMENTS --json state,mergeCommit
```

`state` must be `MERGED`. Record `mergeCommit.oid` — steps 3 and 4 need it.

**Then fetch it — it is not in the local object database yet.** The squash commit is
created server-side by the API. Nothing up to this point brings it down:
`gh pr merge --delete-branch=false` does no local git work at all (gh's only
local-git path is gated behind `--delete-branch`, which is banned here), and step 2's
`git push origin --delete` uploads a ref deletion. Without this fetch, step 3a's
`checkout --detach <mergeCommit.oid>` aborts on an unknown object — **after steps 1
and 2 have already run irreversibly.**

```bash
git fetch origin
git cat-file -e <mergeCommit.oid>^{commit}
```

`git fetch` is read-only, so it is safe to run here ahead of the destructive steps.
All worktrees in this layout share one object database, so fetching once from the
current worktree makes the commit resolvable in both `<HOLDER>` and `<MAIN_WT>`.

If `cat-file -e` is non-zero → **STOP before step 2.** The merge commit did not
arrive, step 3a cannot run, and the remote branch is still the only copy of it.

### Step 2 — delete the remote branch

```bash
git push origin --delete <headRefName>
```

**Verify:**

```bash
git ls-remote --heads origin <headRefName>
```

Must return **nothing**.

> **Benign signature — not a failure.** If the push reports that the remote ref does
> not exist, the deletion is **SATISFIED**: the ref was already removed by another
> path (GitHub's merge-page delete button, an earlier manual delete, auto-archive).
> Verify by absence, never by the command printing success. Report it as "already
> absent", not as an error.

### Step 3 — free the branch if a worktree holds it, then delete it

**3a. If `HOLDER` is `none`, skip to 3b.** Otherwise the branch must be freed first —
`git branch -D` fails outright while a worktree holds it (see Phase 1b).

**If `git -C "<HOLDER>" status --short` produced ANY output → STOP.** Report the path
and the exact dirty files. Do not detach, do not remove the worktree, do not stash,
do not discard. `git checkout --detach` does NOT refuse on a dirty worktree — it
exits 0 and carries the uncommitted changes across silently, which is precisely how
"uncommitted work is what a branch switch destroys silently" plays out. Whether that
work is disposable is the owner's call, never `/ship`'s.

If it is clean, detach it at the merged `main` commit — the documented resting state
for a track worktree between tasks. **This depends on the fetch performed after step
1**: `<mergeCommit.oid>` is a server-created object and is otherwise absent from the
local object database, so a later edit must not drop that fetch.

```bash
git -C "<HOLDER>" checkout --detach <mergeCommit.oid>
```

**Never `git worktree remove`.** Detaching is sufficient to free the branch; removal
is a far larger mutation and stays the owner's decision.

This works even when `HOLDER` is the worktree `/ship` is itself running in — a
worktree can detach itself and then delete its own former branch (verified). Compare
`HOLDER` against `git rev-parse --show-toplevel` and say so in the report when they
match, so the owner knows their own working directory just moved to a detached HEAD.

Report which worktree was detached and to what SHA.

**3b. Delete the branch:**

```bash
git branch -D <headRefName>
```

**Verify:**

```bash
git branch --list <headRefName>
```

Must return **nothing**.

> **Benign signature — not a failure.** `-D` (not `-d`) is required. This repo
> squash-merges, so a merged branch's own commits never enter `main`'s history and
> `git branch -d` reports `the branch is not fully merged` even when the PR is
> merged. That message is expected, not a warning to act on. Ancestry is not a merge
> signal here — step 1 already confirmed `MERGED` from the PR itself.

If the branch does not exist locally (e.g. it was never checked out in this
worktree), that is also satisfied — verify by absence.

### Step 4 — fast-forward the `main` worktree

Use `MAIN_WT` from Phase 0. **Never `../cg`.**

```bash
git -C "<MAIN_WT>" pull --ff-only
```

`--ff-only` is the point: in a squash-merge repo it refuses loudly rather than
manufacturing a merge commit, and a plain `pull` here has already produced a
spurious conflict once. This step is what keeps `cg` honest — nothing else advances
it, and a stale `cg` breaks its one job as the clean current view every "is this on
`main`?" check reads from.

**Verify:**

```bash
git -C "<MAIN_WT>" log --oneline -1
```

Must match the `mergeCommit.oid` recorded in step 1. If it does not → STOP and
report the mismatch; do not retry with a plain `pull`.

---

## Phase 5 — Report

Report each of the four steps with its verification evidence:

```
1. merged           — gh pr view #<n> → MERGED (<mergeCommit.oid>)
2. remote deleted   — git ls-remote --heads origin <branch> → empty
3. local deleted    — git branch --list <branch> → empty
     (detached <HOLDER> to <sha> first — omit if nothing held the branch;
      say explicitly if <HOLDER> was the worktree /ship ran in, since the
      owner's own working directory is now on a detached HEAD)
4. main fast-fwd    — <MAIN_WT> at <oid> — matches merge commit
```

Call out any benign signature you hit (step 2 "remote ref does not exist", step 3
"not fully merged") as expected, not as a failure.

If you stopped partway, say exactly what succeeded and what did not, and what the
owner must finish by hand. Never guess, and never claim a step you did not verify.
