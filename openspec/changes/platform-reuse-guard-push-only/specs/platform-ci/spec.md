# platform-ci — delta (the reuse guard accepts `push` runs only, P-030)

## MODIFIED Requirements

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
