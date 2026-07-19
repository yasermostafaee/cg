# platform-local-gate Specification

## Purpose

TBD - created by archiving change platform-gate-stop-hook. Update Purpose after archive.

## Requirements

### Requirement: A Claude Code turn cannot end with an unchecked red local gate

A committed Stop hook SHALL run when a Claude Code turn ends and SHALL verify the local
merge gate that matches the turn's changed set — the union of the working tree and the
branch's commits since the `origin/main` merge-base. The hook SHALL exit without running
anything when the stop is a hook-driven continuation (`stop_hook_active`), when the
session is in plan mode, or when the changed set is empty, so read-only turns cost
nothing.

#### Scenario: A read-only turn is free

- **WHEN** a turn ends with no working-tree changes and no branch commits beyond the
  `origin/main` merge-base
- **THEN** the hook exits 0 without running any gate command

#### Scenario: A hook-driven continuation is not re-blocked

- **WHEN** a turn end is itself the continuation of a previous Stop-hook block
  (`stop_hook_active` is true)
- **THEN** the hook exits 0 — re-verification happens at the next natural turn end,
  never recursively inside one chain

#### Scenario: Plan mode is exempt

- **WHEN** the session is in plan mode
- **THEN** the hook exits 0 without running any gate command

### Requirement: The gate matches the changed set's classification

The hook SHALL classify the changed set exactly as CLAUDE.md's gate rules do — mirroring
the docs-only carve-out, not redefining it. A docs-only set (every path under
`openspec/**`, `docs/**`, or any `*.md`) SHALL run only
`pnpm openspec validate --all --strict` and `pnpm format:check`. Any other set SHALL run
`pnpm gate`; and when any changed path falls in the UI/render set (renderer sources,
`template-runtime`, `lottie-bridge`, `ui`, `single-file-export`, any `*.css.ts`, the E2E
suites and Playwright configs) the hook SHALL also run `pnpm gate:e2e`.

#### Scenario: Docs-only runs the carve-out only

- **WHEN** a turn's changed set is entirely `openspec/**`, `docs/**`, and `*.md` paths
- **THEN** the hook runs openspec validate strict + format:check and nothing else

#### Scenario: A code change runs the full gate

- **WHEN** any changed path is outside the docs-only set and outside the UI/render set
- **THEN** the hook runs `pnpm gate` and does not run `pnpm gate:e2e`

#### Scenario: A UI/render change owes the E2E gate

- **WHEN** any changed path falls in the UI/render set
- **THEN** the hook runs `pnpm gate` and then `pnpm gate:e2e`

### Requirement: Bounded, non-cheating self-repair

WHEN a gate command fails, the hook SHALL block the turn (exit 2) and feed the session
the tail of the failing output together with repair rules that forbid deleting,
skipping, `.only`-ing, loosening, or widening tests to go green, permit test changes
only when the OpenSpec spec deliberately changed behavior, and name the B-078
stale-process triage for port-4321 Playwright failures. The hook SHALL block at most
twice per session episode: after two red attempts it SHALL stop blocking and emit a
message telling the human the gate needs eyes. A green run SHALL reset the episode.
Full command output SHALL be written to a gitignored per-session log; only the tail
goes to the session.

#### Scenario: First red blocks with repair guidance

- **WHEN** a gate command fails for the first time in an episode
- **THEN** the hook exits 2 with the failing tail and the repair rules on stderr

#### Scenario: Third red stands down to the human

- **WHEN** the gate is still red after two blocked attempts in the same session
- **THEN** the hook exits 0 and surfaces a message that the gate is still red and needs
  human eyes — it never thrashes

### Requirement: A Windows E2E pass is never presented as authoritative

WHEN the hook ran `pnpm gate:e2e` green on `win32`, its success message SHALL state the
run is NON-AUTHORITATIVE for pixel geometry (~19px vs Linux) and that a Linux/WSL run is
still owed. The hook SHALL NOT claim the authoritative gate passed on a Windows E2E run.

#### Scenario: Green on Windows is labelled

- **WHEN** `pnpm gate:e2e` passes and the platform is `win32`
- **THEN** the green message states the non-authoritative caveat and the owed Linux run

### Requirement: The decision logic is pure and unit-tested

The hook's decision logic SHALL live in a pure, dependency-free module inside a
workspace package whose unit tests run under the ordinary `turbo run test` gate —
path normalization, git-output parsing, docs-only detection, UI/render matching,
classification to commands, and attempt counting. The orchestrating hook SHALL contain
no decision logic beyond calling that module.

#### Scenario: The classifier is covered by the fast gate

- **WHEN** `turbo run test` runs
- **THEN** the `tools/gate-hook` unit tests execute and pin the classification,
  matching, parsing, and attempt-counting behavior
