# platform-local-gate — delta (bounded test fan-out, B-098)

## ADDED Requirements

### Requirement: A monorepo-wide test run is bounded to the host it runs on

A monorepo-wide test run SHALL bound the vitest worker processes it can have in flight so
that the worst case fits the machine. This governs any run that executes many workspaces'
`test` tasks at once — `pnpm gate`, `pnpm test`, `pnpm test:integration`. The bound is:

    taskConcurrency * forksPerTask = maxTestWorkers <= availableParallelism

where `taskConcurrency` bounds how many turbo tasks run at once and `forksPerTask` bounds
how many workers each `test` task may fork. **Both** SHALL be bounded: the hazard is their
product, so capping either alone still permits oversubscription. The bound SHALL reserve
headroom below the core count for the per-task vitest parent processes, the package-manager
shims, turbo itself, and the v8 coverage merge that ends every task.

The bound SHALL be derived from the host's detected core count rather than hardcoded to one
machine, and SHALL be computed by a pure, dependency-free module whose unit tests run under
the ordinary `turbo run test` gate and assert the invariant directly. The invariant — not a
streak of green runs — is what carries the claim: an unbounded gate also passes on an idle
machine, which is why this class of failure reads as a phantom.

The bound SHALL NOT be implemented by raising a test's timeout, by skipping, retrying,
deleting or `.only`-ing any test, nor by a hand-picked list of "fragile" suites. Suites that
starve are whichever timing-sensitive ones happen to be co-scheduled; the observed victims
span three workspaces and include one that uses no mock server, no liveness bound and no
fixed ports.

#### Scenario: The worst case fits the machine

- **WHEN** the bound is computed for a host of any core count
- **THEN** `taskConcurrency * forksPerTask` is less than or equal to that core count, and
  both factors are at least 1 so work still schedules

#### Scenario: Headroom is reserved rather than hoped for

- **WHEN** the bound is computed for the 8-core reference host
- **THEN** it resolves to fewer than 8 concurrent test workers, leaving cores for the
  coordinating processes each task also runs

#### Scenario: An unusable core count cannot widen the bound

- **WHEN** core detection yields something unusable — zero, negative, fractional, infinite,
  or not a number
- **THEN** the bound falls back to a single worker rather than to an unbounded default

#### Scenario: An operator override may only tighten

- **WHEN** an override requests more concurrency or more forks than the core budget allows
- **THEN** the requested value is clamped to the computed bound, so the invariant still holds

#### Scenario: Every worker range is bounded at both ends

- **WHEN** the per-task worker cap is exported to the test runner
- **THEN** both the minimum and the maximum of each supported worker pool are set, because a
  runner that resolves the two ends independently would otherwise keep a default minimum
  above the new maximum and fail to start any pool at all

#### Scenario: A caller's stricter concurrency is never widened

- **WHEN** the invoked command already specifies its own task concurrency, as `gate:e2e`
  does for a separate reason
- **THEN** that value is left exactly as the caller wrote it

#### Scenario: The bound in force is visible in the run's own output

- **WHEN** a bounded run starts
- **THEN** it states the detected core count and the resolved concurrency, fork cap and
  worker total, so a later starvation report can be checked against the numbers that
  actually applied rather than the numbers that were intended

#### Scenario: The cap reaches every workspace, including one with no runner config

- **WHEN** the bounded run executes a workspace that has a `test` script but no
  `vitest.config.*` of its own
- **THEN** that workspace's workers are bounded by the same cap as every other workspace
