# Design — Skip heavy CI for docs-only PRs (P-008)

## Pattern: changes-filter → conditional jobs → always-green aggregator

The robust, well-known GitHub Actions pattern for "skip required jobs conditionally
without blocking merge":

1. **`changes`** (runs first) — `dorny/paths-filter@v3` with a `code` filter that
   matches any NON-docs path. Output `code: 'true' | 'false'`.
2. **`ci`, `e2e`** — `needs: changes`, `if: needs.changes.outputs.code == 'true'`.
   They simply don't run on a docs-only change.
3. **`docs-check`** — the light gate (`openspec validate --all --strict` +
   `format:check`). Cheap; runs every PR (it's also a useful sanity check on code
   PRs, and keeps the aggregator logic simple).
4. **`required`** — `needs: [changes, ci, e2e, docs-check]`, `if: always()`. Encodes
   the pass/fail truth table below. This is the SINGLE check branch protection
   requires.

### Why an aggregator (the load-bearing edge case)

A required status check that is **skipped** (because its job's `if` was false) is
reported by GitHub as **pending**, not success — so a docs-only PR that skips `ci` /
`e2e` would sit forever "Expected — Waiting for status" and never become mergeable.
The fix is to require ONE job that ALWAYS runs (`if: always()`) and itself decides
pass/fail, rather than requiring the conditional jobs directly.

### `required` truth table

| code change? | ci                                  | e2e  | docs-check | `required` |
| ------------ | ----------------------------------- | ---- | ---------- | ---------- |
| false (docs) | skip                                | skip | success    | **pass**   |
| false (docs) | skip                                | skip | failure    | fail       |
| true (code)  | succ                                | succ | (succ)     | **pass**   |
| true (code)  | fail                                | \*   | \*         | fail       |
| any          | cancelled / failure on a needed job |      |            | fail       |

The `required` step inspects `needs.*.result`: pass iff
`changes.outputs.code == 'false'` ? `docs-check == 'success'` :
(`ci == 'success'` && `e2e == 'success'`).

## Strict filter

The `code` filter must be **"no non-docs file changed"**, not "includes docs". With
`dorny/paths-filter`, a `code` predicate listing the docs globs as the negative is
awkward, so the filter lists the DOCS paths and the job inverts: `code = NOT (all
changed paths are docs)`. Concretely the filter declares a `docs` group
(`openspec/**`, `docs/**`, `**/*.md`) and a catch-all `code` group (`**`) minus the
docs — implemented by a `docs`-positive filter plus a step that sets
`code = 'true'` unless the only matched group is `docs`. The net guarantee: a PR
that changes `pr.yml` + a `.md` still reports `code: 'true'` and runs the full gate.

## ⚠️ Manual step — branch protection (NOT code; do this after merge)

After this merges, update **Settings → Branches → branch protection for `main`**:

- **Add** the new **`required`** job to "Require status checks to pass before
  merging".
- **Remove** the direct requirements on **`Lint • Typecheck • Test • Build`** (the
  `ci` job) and **`E2E (Playwright)`** (the `e2e` job).

If the old checks stay required, a docs-only PR (which skips them) will remain
un-mergeable — defeating the change. `required` already fails whenever those jobs
fail on a code PR, so coverage is unchanged for code.

## Risk

Low and self-contained (one workflow file). The main risk is the manual
branch-protection step being missed — hence it is called out in the proposal, this
design, and the archive reminder. The strict filter is covered by a spec scenario
(code bundled into a docs PR still runs the full gate).
