# platform-ci Specification

## Purpose

TBD - created by archiving change skip-ci-for-docs-only. Update Purpose after archive.

## Requirements

### Requirement: Docs-only PRs skip the heavy CI jobs

CI SHALL skip the heavy jobs (typecheck / lint / test / build + e2e) when a pull
request or push changes ONLY documentation files — paths matching `openspec/**`,
`docs/**`, or `**/*.md` — and SHALL instead run only a light docs check
(`pnpm openspec validate --all --strict` + `pnpm format:check`). The aggregated
required status SHALL still report success for such a change.

On a `push` event the changed set SHALL be measured against the PREVIOUS TIP OF THE
PUSHED REF, so it means "changed by this push" and never "changed since the default
branch". Where that previous tip cannot be trusted — an all-zero `before` (new ref), a
`before` absent from the fetched history, or a `before` that is not an ancestor of `HEAD`
(force-push / history rewrite) — CI SHALL fail safe and run everything. On `pull_request`
events the changed set SHALL continue to come from the GitHub API, unchanged.

The push-event classification SHALL reuse the repository's single canonical classifier
(`classifyChangedSet` in `tools/gate-hook/src/gate-decision.mjs`), the same predicate the
local Stop hook uses, rather than a second, independently maintained glob list.

#### Scenario: A push is classified against its own previous tip

- **WHEN** a push to `dev` changes only documentation files, on a branch that is many
  commits ahead of the default branch
- **THEN** the heavy jobs are skipped, because the diff base is the previous tip of `dev`
  and not the merge-base with the default branch

#### Scenario: A docs-only change skips the heavy jobs

- **WHEN** a PR (or push) changes only `openspec/**` / `docs/**` / `**/*.md`
- **THEN** the heavy jobs (typecheck / lint / test / build / e2e) do not run, only
  the light docs check runs, and the required aggregator goes green

### Requirement: Any non-docs change runs the full gate

CI SHALL run the full green gate (typecheck / lint / test / build + e2e) whenever a
change touches ANY non-docs file, so no code merges untested. The change-detection
filter SHALL be STRICT: the heavy jobs are skipped only when NO non-docs file
changed — not merely when the change also includes docs — so code accidentally
bundled into a "docs" PR is NOT skipped.

#### Scenario: A code change runs the full gate

- **WHEN** a PR changes even one code / test / build / config file
- **THEN** the full gate (typecheck / lint / test / build + e2e) runs exactly as
  today

#### Scenario: Code bundled into a docs PR is not skipped

- **WHEN** a PR changes docs files AND at least one non-docs file
- **THEN** the strict filter reports a code change and the full gate runs (the docs
  paths do not cause a skip)

### Requirement: The E2E job runs when the change can affect what renders

The `e2e` job SHALL run whenever the change is a code change AND the changed set can
affect what the applications render. "Can affect what renders" SHALL be decided by the
canonical classifier's `needsE2e`, whose render set is DERIVED from the two applications'
runtime dependency closure — not from a hand-maintained list — and whose default for an
UNRECOGNISED path SHALL be `true`. Only paths positively known to be unable to affect the
built applications may cause the `e2e` job to be skipped.

On `pull_request` events, and on any push whose base or classification is not a definite
negative, `needsE2e` SHALL resolve to `true`.

The `ci` job's condition SHALL remain gated on the code/docs distinction alone and SHALL
NOT be narrowed by this requirement.

#### Scenario: A code change with no render surface skips the E2E

- **WHEN** a push changes only paths known to be unable to affect the built apps (for
  example `.github/**` or the gate-hook tooling)
- **THEN** the `ci` job runs, the `e2e` job is SKIPPED, and the `required` aggregator
  still reports success

#### Scenario: An unrecognised path still owes the E2E

- **WHEN** a push changes a path that is in neither the render set nor the known-safe set
  — a new workspace, a renamed directory, or a root config file
- **THEN** `needsE2e` is `true` and the `e2e` job runs

### Requirement: The merge to the default branch is the completeness backstop

The push to the default branch SHALL be classified against the previous tip of the DEFAULT
BRANCH, so that its changed set covers the entire span of work since the last such merge,
and SHALL therefore act as the completeness backstop for that span.

It closes two gaps that per-push runs cannot: only ONE run is kept pending per concurrency
group, so a burst of pushes can supersede a middle commit; and a commit whose changed set
is classified render-safe never runs the E2E at all.

This run SHALL be treated as a gate, not a formality: a failure there is a failure of the
whole span, not of the merge commit alone.

#### Scenario: The daily merge classifies the whole span

- **WHEN** the accumulated work on `dev` is merged into `main`
- **THEN** the push to `main` is classified against the previous `main` tip, so its
  changed set is every file changed since the last merge
- **AND** whatever that span requires — the heavy jobs, and the E2E when any path in it
  can affect what renders — runs, even where an individual push in the span skipped it

### Requirement: A merge run may reuse a prior run only on a positive, complete match

On a push to the default branch ONLY, the workflow SHALL skip its heavy jobs when this
workflow already has a run for the same `head_sha` that was triggered by the `push` event
AND is `completed` AND `success` AND in which the unit-gate and E2E jobs BOTH actually RAN
and succeeded. It SHALL NOT skip on any other basis. This exists because `dev` -> `main` is
a fast-forward, so the merge commit is frequently the SAME SHA that already has a completed
run.

The `event` condition SHALL be POSITIVE: only a run whose `event` is exactly `push`
qualifies. A run triggered by any other event — and a run whose `event` is absent, empty, or
unrecognised — SHALL NOT be reused. It SHALL NOT be expressed as the absence of a known-bad
event, and a missing `event` SHALL NOT default to allowed.

The reason this condition is part of the match, and not a nicety: the guard's safety
argument is about the TREE a prior run verified. A `push` run tests the tree of that exact
commit. A `pull_request` run checks out the merge ref, so its `head_sha` names the commit
while the tree it tested is the merge of head into base — the same tree only while base is
already an ancestor of head. Restricting candidates to `push` runs ELIMINATES that
dependency rather than documenting it.

This condition SHALL be enforced by the pure decision module itself, so it is unit-testable
independently of the workflow. Narrowing the Actions API query is defence in depth and SHALL
NOT be the only place the rule lives.

A prior run that was green having SKIPPED the E2E SHALL NOT satisfy this, because that is
precisely the case the backstop above exists to catch. Every uncertainty — an API error, a
missing permission, an unreadable or empty result, a job the guard cannot find — SHALL
resolve to running everything.

When the heavy jobs are skipped on this basis, the run SHALL report why, with the prior
run's URL, in both its log and its job summary, so a run that is green because it did
nothing is never indistinguishable from one that is green because it passed.

When every candidate is rejected for not being a `push` run, the reported reason SHALL say
so explicitly — how many runs were seen, and how many were dropped as non-`push` — so a
human reading a merge run that DID do the work understands why it did.

#### Scenario: The tip's own run already ran everything

- **WHEN** a fast-forward merge pushes to the default branch a commit whose `push` run
  already completed successfully with both the unit gate and the E2E executed
- **THEN** the heavy jobs are skipped and the aggregator passes, citing the prior run's URL
  in the run's log and summary

#### Scenario: The only green run for the SHA is a `pull_request` run

- **WHEN** the only candidate for that `head_sha` is `completed` and `success` and DID run
  both required jobs, but its `event` is `pull_request`
- **THEN** the merge run does NOT skip, and the reported reason names the non-`push`
  rejection with the number of runs seen and the number dropped

#### Scenario: A candidate's event is missing or unrecognised

- **WHEN** a candidate run for that `head_sha` carries no `event`, an empty `event`, or an
  event this guard does not recognise
- **THEN** the merge run does NOT skip — the absence of a known-bad value is never read as
  permission

#### Scenario: The tip's own run skipped the E2E

- **WHEN** the prior run for that SHA was successful but its E2E job was skipped
- **THEN** the merge run does NOT skip, and runs the full gate as that span's backstop

#### Scenario: The guard cannot establish a match

- **WHEN** the Actions API errors, the permission is absent, or the result is empty or
  ambiguous
- **THEN** every job runs, exactly as it would without the guard

### Requirement: A single required aggregator status gates merge

The workflow SHALL expose ONE aggregator status check (`required`) intended to be
the sole required check in branch protection. It SHALL pass when EITHER the
docs-only path succeeded (no non-docs change AND the docs check passed) OR the code
path succeeded (a non-docs change AND the heavy jobs passed), and SHALL fail if any
needed job failed — so a heavy job that was SKIPPED on a docs-only PR never leaves
the required check pending and blocks merge.

A SKIPPED `e2e` job SHALL be accepted only when the change did not owe one
(`needsE2e` is `false`). A skipped `e2e` on a change that DID owe one SHALL fail the
aggregator, so a job that silently fails to start can never be mistaken for a
deliberate skip.

#### Scenario: required distinguishes a deliberate skip from a missing run

- **WHEN** the `e2e` job is skipped and `needsE2e` is `false`
- **THEN** the `required` aggregator succeeds
- **AND WHEN** the `e2e` job is skipped while `needsE2e` is `true` **THEN** the
  aggregator FAILS

#### Scenario: required is green for a docs-only PR despite skipped heavy jobs

- **WHEN** a docs-only PR runs (heavy jobs skipped, docs check passed)
- **THEN** the `required` aggregator succeeds, so the PR is mergeable without the
  full gate

#### Scenario: required fails when a heavy job fails on a code PR

- **WHEN** a PR with non-docs changes runs and any heavy job (typecheck / lint /
  test / build / e2e) fails
- **THEN** the `required` aggregator fails and the PR is not mergeable
