# Design — bounding the gate's test fan-out (B-098)

## The root cause, measured not assumed

Two defaults multiply, and neither was ever bounded.

**turbo** schedules independent tasks up to its default concurrency. Under `--force` the
whole task graph is dirty, so during the `test` phase roughly ten packages' `test` tasks run
at once (the exact number floats with the dependency graph, but it is ~10, not 1).

**vitest** defaults, in `run` mode, to `pool: 'forks'` with

    maxForks = availableParallelism - 1        // 7 on an 8-core box

and NO config in this repo overrides it. This was confirmed by resolving each package's
config through vitest's own Node API rather than by inference: every package reports
`pool: 'forks'`, `poolOptions.forks: {}`, `fileParallelism: true`.

The product is the bug: **~10 tasks × 7 forks ≈ 70** worker processes contending for 8 cores.
Sampling `turbo run test --force` on the reference box measured a **peak of 64 concurrent
node processes** — sustained across the middle of the run, 8× the core count. A suite whose
correctness depends on meeting a real-time deadline (a socket handshake, a timer) then loses
its CPU slice and times out, while the same suite passes alone. The victims are simply
whichever timing-sensitive suites happen to be co-scheduled.

## Why the fix is at the orchestrator, and caps BOTH knobs

The hazard is a product, so bounding one factor is not enough:

- Cap only turbo concurrency and each surviving task still forks to 7 — a single `test` task
  alone can oversubscribe.
- Cap only vitest forks and ~10 tasks each still fork to that cap — 10 × 2 = 20 > 8.

So both are capped, and the cap is computed once, centrally, against the machine:

    workerBudget    = floor(cores * 0.75)          // 6 on 8 cores — reserve headroom
    forksPerTask    = 2                             // clamped to cores on tiny machines
    taskConcurrency = max(1, floor(workerBudget / forksPerTask))
    maxTestWorkers  = taskConcurrency * forksPerTask   // <= cores, always

`resolveTestBound` returns those numbers and its unit tests assert
`maxTestWorkers <= cores` across core counts from 1 to 128. The invariant, not a streak of
green runs, is the proof: the unbounded gate ALSO passes on a fresh machine, which is exactly
why B-098 read as a phantom for three sessions.

### Why 2 forks per task, not 1

`--concurrency=1` was rejected here (too slow for the main gate's task graph, unlike
`gate:e2e`), but so was 1 fork per task. Several packages pay a large per-FILE environment
cost — happy-dom setup dominates `@cg/template-runtime` and `@cg/runtime`, which showed
cumulative environment times in the hundreds of seconds across their forks. Collapsing a
package to a single fork serialises that cost across all its files and makes one suite the
critical path. 2 keeps intra-package overlap while still composing into a small product.
It is a tunable via `CG_TEST_FORKS_PER_TASK`; the clamp guarantees a tune can only tighten.

### Why 75% utilisation, not 100%

The remaining quarter is not slack. Each `test` task also runs a vitest PARENT process and a
package-manager shim, turbo itself is resident, and v8 coverage merges at the end of every
task. B-098 is a headroom bug; the budget reserves headroom by construction rather than
hoping the scheduler finds it.

## Delivery mechanism, and the trap inside it

The caps travel as vitest's own documented environment overrides. Two facts made the naïve
version a no-op or a crash:

1.  **turbo strict env mode.** turbo 2.x filters the child environment to declared keys by
    default, so `VITEST_*` names set by the launcher never reached vitest. Fixed by listing
    them in `passThroughEnv` on the `test`, `@cg/soak-runner#test` and `test:integration`
    tasks. Without this the bound is silently absent — which is why the launcher prints the
    bound on every run.

2.  **vitest resolves the two ends of a pool independently.** In `createForksPool`:

        maxThreads = poolOptions.maxForks ?? config.maxWorkers ?? threadsCount
        minThreads = poolOptions.minForks ?? config.minWorkers ?? threadsCount

    Setting only `VITEST_MAX_FORKS` leaves the MIN at the default `availableParallelism - 1`,
    so Tinypool is handed min 7 / max 2 and throws
    `options.minThreads and options.maxThreads must not conflict` before a single test runs.
    The first bounded gate run hit this in all 20 vitest workspaces at once. The fix is
    `testWorkerEnv`, which emits all four names — `VITEST_{MIN,MAX}_{FORKS,THREADS}` — with
    the min floored at 1. Both pools are named so the cap holds even if a package later
    selects `pool: 'threads'`. A dedicated regression test pins the pairing.

## Alternatives considered

- **Raise the timeout again.** Rejected — see the proposal. This is B-073's remedy failing.
- **Per-suite `maxForks` in each fragile `vitest.config.ts`.** Rejected: incomplete
  (`single-file-export` is a victim with none of the "fragile" markers), and it penalises
  isolated single-package runs that are not contended.
- **turbo `--concurrency=1` for the whole gate.** Rejected: too slow for the full task graph;
  `gate:e2e`'s two-suite graph tolerated it, the ~80-task main gate would not.
- **A shared `vitest.config` base every package imports.** Rejected: it would still miss
  `@cg/ui` (no config file), cannot see sibling concurrency, and is a much larger blast
  radius than one orchestrator flag.

## Scope of the bound

The env cap reaches every vitest process turbo spawns, so it also covers `test:integration`.
`gate:e2e` is Playwright, already serialised by #360 for the distinct B-095 reason, and is
NOT re-touched: `applyConcurrencyFlag` leaves a caller-supplied `--concurrency` alone, so the
e2e gate keeps its stricter `--concurrency=1`. This change alters the unit/integration gate's
parallelism only; no Linux `gate:e2e` run is owed.
