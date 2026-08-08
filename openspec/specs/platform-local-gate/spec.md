# platform-local-gate Specification

## Purpose

TBD - created by archiving change platform-gate-stop-hook. Update Purpose after archive.

## Requirements

### Requirement: A Claude Code turn cannot end with an unchecked red local gate

A committed Stop hook SHALL run when a Claude Code turn ends and SHALL verify the local
merge gate that matches the turn's changed set — the union of the working tree and the
commits `HEAD` carries since the merge-base with the DIFF BASE REF. The diff base SHALL be
the first of `origin/dev`, then `origin/main`, that resolves in the repository; when
neither resolves the changed set SHALL be the working tree alone. The hook SHALL exit
without running anything when the stop is a hook-driven continuation
(`stop_hook_active`), when the session is in plan mode, or when the changed set is empty,
so read-only turns cost nothing.

#### Scenario: A read-only turn is free

- **WHEN** a turn ends with no working-tree changes and no commits beyond the diff-base
  merge-base
- **THEN** the hook exits 0 without running any gate command

#### Scenario: The diff base follows the branch work actually lands on

- **WHEN** the hook computes the turn's changed set and `origin/dev` resolves
- **THEN** it measures against the `origin/dev` merge-base, so a docs-only turn on a `dev`
  that is many commits ahead of `main` still classifies as docs-only and takes the
  carve-out
- **AND WHEN** `origin/dev` does not resolve **THEN** it falls back to `origin/main`, and
  when neither resolves it uses the working tree alone

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
`pnpm gate`.

The hook SHALL continue to DETECT the UI/render set (renderer sources,
`template-runtime`, `lottie-bridge`, `ui`, `single-file-export`, any `*.css.ts`, the E2E
suites and Playwright configs), but SHALL NOT run `pnpm gate:e2e` as part of the turn's
gate. On a UI/render set the hook SHALL instead emit a NON-BLOCKING reminder that a Linux
`gate:e2e` is owed and remains unpaid until a completed, green CI `e2e` run exists for the
commit carrying the change. The reminder SHALL NOT affect the hook's exit status.

An OPT-IN environment variable (`CG_GATE_HOOK_E2E`) SHALL restore the local
`pnpm gate:e2e` run for a turn. When it is set and the changed set is in the UI/render
set, the hook SHALL run `pnpm gate:e2e` after `pnpm gate`. The opt-in SHALL NOT introduce
an E2E run for a changed set that does not fall in the UI/render set.

#### Scenario: Docs-only runs the carve-out only

- **WHEN** a turn's changed set is entirely `openspec/**`, `docs/**`, and `*.md` paths
- **THEN** the hook runs openspec validate strict + format:check and nothing else

#### Scenario: A code change runs the full gate

- **WHEN** any changed path is outside the docs-only set and outside the UI/render set
- **THEN** the hook runs `pnpm gate` and does not run `pnpm gate:e2e`

#### Scenario: A UI/render change owes the E2E but does not run it locally

- **WHEN** any changed path falls in the UI/render set and the opt-in is not set
- **THEN** the hook runs `pnpm gate` and does NOT run `pnpm gate:e2e`
- **AND** it emits a non-blocking reminder that a Linux `gate:e2e` is owed, that the
  authoritative run is the CI `e2e` job on push, and that the debt is unpaid until a
  completed green run URL is recorded beside the change's ticked task

#### Scenario: The opt-in restores the local E2E run

- **WHEN** any changed path falls in the UI/render set and `CG_GATE_HOOK_E2E` is set to a
  truthy value
- **THEN** the hook runs `pnpm gate` and then `pnpm gate:e2e`
- **AND WHEN** the changed set is NOT in the UI/render set **THEN** the opt-in adds no
  E2E run

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

### Requirement: A host runs at most one gate at a time

The local gate SHALL acquire a host-wide exclusive lock before it runs and SHALL hold it
for the gate's whole duration, so that no two gates ever run concurrently on the same host.
This governs every gate entry point — a direct `pnpm gate` or `pnpm gate:e2e`, the
`.husky/pre-push` invocation, and the P-009 Stop hook's gate runs — and it SHALL be applied
at the single script boundary those entry points funnel through, NOT re-implemented per
caller (a second copy of the rule is how the rule comes to mean different things in
different places).

The lock resource SHALL live at a stable, host-global path outside every worktree, so that
all worktrees sharing the host serialize against one another rather than each taking a
private slot. The lock SHALL wrap — and SHALL NOT replace — the within-gate test-fan-out
bound (B-098): the two are load controls at different scopes, one between gates and one
inside a gate.

Adding this serialization SHALL NOT change what any gate checks, any test timeout, or the
deletion carve-out that decides WHEN the pre-push gate runs. It adds mutual exclusion around
execution only.

Because the local gate is the sole landing gate while remote CI is unavailable, the lock
SHALL fail safe asymmetrically: a lock mechanism that is unavailable or errors on
acquisition SHALL degrade to running the gate WITHOUT serialization rather than refusing to
gate, while a slot that stays held past a bounded wait SHALL surface a clear error rather
than hanging forever. The gated command itself SHALL continue to fail closed — a spawn
failure or a signal death reads as a failed gate, never a passing one.

#### Scenario: A second gate waits rather than running concurrently

- **WHEN** a gate is invoked while another gate already holds the host slot
- **THEN** the second gate announces that it is waiting, blocks until the holder releases,
  and only then runs — it never runs concurrently with the first

#### Scenario: The slot is released on every exit path

- **WHEN** a gate that holds the slot finishes — whether it passed, failed, or threw
- **THEN** the slot is released, so the next waiter can proceed

#### Scenario: A crashed holder does not deadlock the host

- **WHEN** the process holding the slot dies without releasing it
- **THEN** the lock becomes reclaimable after a staleness window shorter than the wait
  timeout, so a waiting gate reclaims the slot rather than blocking forever

#### Scenario: A stuck slot surfaces as an error, not an infinite hang

- **WHEN** a gate waits for the slot for the full wait timeout without ever acquiring it
- **THEN** it stops waiting and reports a clear error that the slot was held too long,
  rather than hanging indefinitely

#### Scenario: A broken lock never defeats the gate

- **WHEN** the lock mechanism is unavailable, or acquisition fails for a reason other than
  the slot being held
- **THEN** the gate still runs — without the host serialization guarantee — and says so,
  so the sole enforcement mechanism is never blocked by its own lock

#### Scenario: Every entry point serializes through one lock

- **WHEN** the pre-push hook or the Stop hook runs the gate
- **THEN** it acquires the same host slot as a direct `pnpm gate`, because the lock is
  applied at the shared gate/gate:e2e script boundary rather than duplicated in each hook

#### Scenario: The serialization is proven across processes, not only in one

- **WHEN** the lock's behavior is validated
- **THEN** unit tests pin the acquire, wait-while-held, timeout, release, and fail-open
  logic, and a two-process check demonstrates that a second process waits for the slot and
  acquires it only after the first process releases
