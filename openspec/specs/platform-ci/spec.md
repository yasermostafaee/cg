# platform-ci Specification

## Purpose

TBD - created by archiving change skip-ci-for-docs-only. Update Purpose after archive.

## Requirements

### Requirement: Docs-only PRs skip the heavy CI jobs

CI SHALL skip the heavy jobs (typecheck / lint / test / build + e2e) when a pull
request or push to `main` changes ONLY documentation files — paths matching
`openspec/**`, `docs/**`, or `**/*.md` — and SHALL instead run only a light docs
check (`pnpm openspec validate --all --strict` + `pnpm format:check`). The
aggregated required status SHALL still report success for such a change.

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

### Requirement: A single required aggregator status gates merge

The workflow SHALL expose ONE aggregator status check (`required`) intended to be
the sole required check in branch protection. It SHALL pass when EITHER the
docs-only path succeeded (no non-docs change AND the docs check passed) OR the code
path succeeded (a non-docs change AND the heavy jobs passed), and SHALL fail if any
needed job failed — so a heavy job that was SKIPPED on a docs-only PR never leaves
the required check pending and blocks merge.

#### Scenario: required is green for a docs-only PR despite skipped heavy jobs

- **WHEN** a docs-only PR runs (heavy jobs skipped, docs check passed)
- **THEN** the `required` aggregator succeeds, so the PR is mergeable without the
  full gate

#### Scenario: required fails when a heavy job fails on a code PR

- **WHEN** a PR with non-docs changes runs and any heavy job (typecheck / lint /
  test / build / e2e) fails
- **THEN** the `required` aggregator fails and the PR is not mergeable
