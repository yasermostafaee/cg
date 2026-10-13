# The merge-run reuse guard accepts `push` runs only

## Why

P-030's guard lets a `push` to `main` REUSE a prior run's verdict instead of re-running the
heavy jobs. It builds its candidate list from the runs at this `head_sha` and filters on
exactly three things: the run is not this run, it is `completed` + `success`, and both
`REQUIRED_JOB_NAMES` jobs actually RAN. **It never filters on the run's `event`.**

That omission matters because the guard's whole safety argument is about the **TREE**:

> Classification gates WHETHER the jobs run; the jobs themselves are whole-tree.

A `push` run tests the tree of the commit it is attached to. **A `pull_request` run does
not** — it checks out `refs/pull/N/merge`, so `head_sha` names the commit but the tree
tested is `merge(head, base)`. Those two trees are identical only while base is already an
ancestor of head. When they diverge, a `pull_request` run is green about a tree that may
never land, and this guard can skip the merge run — the completeness backstop — on the
strength of it.

**This is not hypothetical, on either side.** Two days ago PR #439 was squash-merged on
GitHub, `main` diverged from `dev`, and PR #440 sat open with a conflict — exactly the
divergent state. And on the live firing recorded in P-030, the run the guard actually
consumed **was a `pull_request` run** (`31469356886`). It was correct that day only because
the ancestry invariant happened to hold; P-030 records that as "an assumption to revisit if
the base ever advanced independently of `dev`". An assumption a guard silently depends on is
one an unrelated workflow change can invalidate without anyone noticing — so it is
eliminated here rather than documented harder.

Cost is zero in the current model: there are no PRs. `dev` is pushed directly and the owner
merges `dev` -> `main` by hand, so every candidate the guard should ever see is already a
`push` run.

## What Changes

- **The pure function gains ONE condition.** In `decideReuse`, a candidate must additionally
  satisfy `event === 'push'`. Nothing else about the existing three conditions changes, and
  `REQUIRED_JOB_NAMES` is untouched.
- **The check is POSITIVE.** Only the exact string `'push'` qualifies. A missing, empty, or
  unrecognised `event` is an UNCERTAINTY and resolves to running everything — never written
  as `event !== 'pull_request'`, and never defaulted to allowed.
- **The rejection is legible.** When every candidate is dropped for being a non-`push` run,
  the returned `reason` says so explicitly, naming how many runs were seen and how many were
  dropped as non-push.
- **The Actions API query in `.github/workflows/pr.yml` narrows to `event=push`** as defence
  in depth. The pure function still enforces the rule on its own — the query is not the
  guard.
- Docs follow the decision: P-030's "assumption to revisit" sentence is SUPERSEDED, the
  module docstring explains why green on the right KIND of run is part of the match, and
  `reuse-decision.d.ts` types the `event` field.

## Impact

- Affected specs: `platform-ci` (MODIFIED — the reuse requirement)
- Affected code: `tools/gate-hook/src/reuse-decision.mjs`,
  `tools/gate-hook/types/reuse-decision.d.ts`, `tools/gate-hook/tests/reuse-decision.test.ts`,
  `tools/gate-hook/tests/fixtures/runs-*.json`, `.github/workflows/pr.yml`
- No UI, layout, or rendering path is touched, so no Linux `gate:e2e` debt is owed.
