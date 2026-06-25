# Skip heavy CI for docs-only PRs (P-008)

## Why

Archive folds and docs edits never touch code, yet today every such PR triggers the
full `pr.yml` gate (typecheck / lint / test / build + e2e) — minutes of CI that
gate a markdown-only change. It is the biggest unnecessary delay in the workflow.

## What Changes

- `.github/workflows/pr.yml` gains a first **`changes`** job that detects whether
  any NON-docs file changed (docs = `openspec/**`, `docs/**`, `**/*.md`). The
  filter is STRICT — it reports `code: 'true'` unless EVERY changed path is a docs
  path — so code accidentally bundled into a "docs" PR is never skipped.
- The existing **`ci`** and **`e2e`** jobs gain `needs: changes` +
  `if: needs.changes.outputs.code == 'true'`, so they run for code changes and skip
  on docs-only changes.
- A light **`docs-check`** job runs the docs gate only (`pnpm openspec validate
--all --strict` + `pnpm format:check`).
- A final **`required`** aggregator job (`needs: [changes, ci, e2e, docs-check]`,
  `if: always()`) passes when either the code path (ci + e2e succeeded) or the
  docs-only path (docs-check succeeded) is satisfied, and fails if any needed job
  failed. This single job is meant to be THE required status check in branch
  protection, so a skipped heavy job can't leave a required check pending and block
  a docs-only PR.

## Impact

- Affected specs: **platform-ci** (ADDED — net-new capability for the PR CI
  skip-on-docs behaviour).
- Affected code: `.github/workflows/pr.yml` only (CI config). No app source / tests
  / build change.
- **Manual follow-up (out of band, documented in design.md):** branch protection
  for `main` must require the new `required` aggregator and DROP the direct
  requirements on the old `ci` / `e2e` checks — otherwise a docs-only PR that skips
  them stays un-mergeable.
- Because this change edits `pr.yml` (a non-docs file), its own PR correctly runs
  the full gate.
