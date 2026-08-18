# platform-local-gate — delta (bounded E2E fan-out, P-034)

## ADDED Requirements

### Requirement: A monorepo-wide E2E run is bounded to the host it runs on

A monorepo-wide E2E run SHALL bound the browser worker processes it can have in flight so
that the worst case fits the machine. This governs any run that executes more than one
workspace's `test:e2e` task — `pnpm test:e2e` and `pnpm gate:e2e`. The bound is:

    taskConcurrency * workersPerTask <= workerBudget <= availableParallelism

where `taskConcurrency` bounds how many turbo tasks run at once and `workersPerTask` bounds
how many browser workers each `test:e2e` task may run. **Both** SHALL be bounded: the
hazard is their product, exactly as it is for the unit-test fan-out.

The E2E bound SHALL be computed by the SAME pure module as the unit-test bound and reached
through the SAME command-line entry point, not by a parallel implementation. The defect
this closes is one rule with two spellings; a second implementation would restore it.

`workersPerTask` SHALL additionally never exceed the worker count the test runner would
have chosen for itself on that host. The bound may tighten a run or leave it unchanged; it
SHALL NOT widen one. Without that ceiling, a run whose task concurrency is already
serialised for a separate reason would be handed the entire worker budget and would run
wider than it does unbounded.

An E2E run of a SINGLE workspace SHALL be left at the runner's own default. Such a run is
not contended, and capping it would cost time while removing no hazard.

The bound SHALL NOT be implemented by widening a test timeout, loosening a threshold,
adding a retry, or editing any test. The failures it removes are timing assertions whose
victims differ from run to run; a longer rope for one of them addresses none of it.

#### Scenario: The worst case fits the machine

- **WHEN** the E2E bound is computed for a host of any core count
- **THEN** `taskConcurrency * workersPerTask` is within the host's worker budget, and
  `workersPerTask` is at least 1 so work still schedules

#### Scenario: The bound only ever tightens

- **WHEN** the E2E bound is computed for any host and any task concurrency
- **THEN** `workersPerTask` is less than or equal to the number of workers the test runner
  would have chosen on that host unaided

#### Scenario: A run serialised for another reason is not narrowed further

- **WHEN** the invoked command already specifies a task concurrency of one, as `gate:e2e`
  does for its own separate reason
- **THEN** its suite runs at the runner's own default worker count, unchanged

#### Scenario: Concurrent app suites no longer starve each other

- **WHEN** both applications' E2E suites are run concurrently by the root command on the
  reference host
- **THEN** the total browser workers in flight is a fraction of the core count rather than
  all of it, and the timing assertions that failed unbounded pass

#### Scenario: An isolated single-suite run is unaffected

- **WHEN** one workspace's E2E suite is run on its own, by any entry point
- **THEN** no cap is imposed and the runner's own default worker count applies

#### Scenario: The cap survives the task runner's environment filtering

- **WHEN** the bound is carried to the E2E tasks through the environment
- **THEN** the variable carrying it is declared as passed through by the task runner, so a
  strict environment mode cannot filter it out and leave the bound a silent no-op

#### Scenario: The bound in force is visible in the run's own output

- **WHEN** a bounded E2E run starts
- **THEN** it states the detected core count, the task concurrency and the per-task worker
  cap, so a later starvation report can be checked against the numbers that actually
  applied rather than the numbers that were intended

#### Scenario: A continuous-integration run keeps its own worker setting

- **WHEN** the E2E suites run in continuous integration
- **THEN** the environment's own single-worker setting takes precedence over the computed
  bound, so this change alters nothing about how the authoritative suite runs
