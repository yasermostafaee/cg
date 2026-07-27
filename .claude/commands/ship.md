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

GitHub Actions billing is exhausted until ~Aug, so **no checks configured** is the
expected state, not a failure. Report it honestly as "no remote checks — local gate
is the only landing gate" rather than as green. If checks DO exist and any is
failing → STOP.

Record: title, `baseRefName`, `headRefName`, check status. `headRefName` is the
`<branch>` used in steps 2 and 3.

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

A bad merge here reaches broadcast output. Refuse if any changed path matches:

- `apps/` — any app source (designer, runtime)
- `packages/caspar-client/` — the AMCP/on-air client
- `packages/template-runtime/` — the on-air template engine
- `packages/single-file-export/` — the export path
- `packages/lottie-bridge/`, `packages/ui/` — render-output packages the gate hook
  already classifies as UI/render (`UI_RENDER_PATTERNS` in
  `tools/gate-hook/src/gate-decision.mjs`)
- any path matching `UI_RENDER_PATTERNS` (e.g. `*.css.ts`, `apps/*/tests/e2e/`)

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
    [x] on-air / export / product source  — no matching paths
    [x] hardware pass / Linux gate:e2e    — <evidence: the tasks.md line(s) relied on>
    [x] shared config                     — no matching paths

  main worktree resolved to: <MAIN_WT>

Proceed with the four-step ship sequence? (steps 2 and 3 are destructive)
```

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

`state` must be `MERGED`. Record `mergeCommit.oid` — step 4 needs it.

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

### Step 3 — delete the local branch

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
4. main fast-fwd    — <MAIN_WT> at <oid> — matches merge commit
```

Call out any benign signature you hit (step 2 "remote ref does not exist", step 3
"not fully merged") as expected, not as a failure.

If you stopped partway, say exactly what succeeded and what did not, and what the
owner must finish by hand. Never guess, and never claim a step you did not verify.
