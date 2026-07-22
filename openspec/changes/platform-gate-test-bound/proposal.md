# Bound the gate's test fan-out to the machine (B-098)

## Why

`pnpm gate` and `pnpm test` both fan out through turbo, and **nothing anywhere bounded the
result**. Two independent multipliers compounded:

- turbo's default concurrency runs ~10 package tasks at once, and
- vitest's own default is `pool: 'forks'` with `maxForks = availableParallelism - 1` — 7 on
  the 8-core reference box — for **every** package, because no `vitest.config.ts` in this
  repo sets a single pool option. Confirmed by resolving the config directly: every package
  came back `pool: 'forks'`, `poolOptions.forks: {}`, `fileParallelism: true`.

10 × 7 ≈ 70 wanted worker processes on 8 cores. **Measured: a peak of 64 concurrent node
processes during `turbo run test --force` — 8× oversubscription.** Timing-sensitive suites
(real sockets, real timers) then miss real-time deadlines and red, while passing in
isolation. That is the whole of B-098.

The signature matched a load problem rather than a defect on every axis:

- **Victim-agnostic.** `@cg/caspar-bridge` (HEALTHY timeout), `@cg/caspar-client`
  (amcp-probed-liveness) and `@cg/single-file-export` have all been named. The last uses no
  amcp-mock, no HEALTHY bound and no fixed ports — which is what **rules out** the fixed-port
  collision hypothesis and makes a per-suite carve-out the wrong shape of fix.
- **Temporal.** Green back-to-back in the morning; ~5 of 7 red in the afternoon with the
  machine idle between runs. No code changed in between.
- **Costly.** Since P-009 the gate is enforced pre-push, so a contention red blocks the push
  and reads exactly like a product regression — the same tax B-097 charges, at a worse moment.

## What Changes

- **The fan-out is bounded at the ORCHESTRATOR, not per suite.** A new pure module,
  `tools/gate-hook/src/test-concurrency.mjs`, computes the bound from the host's core count
  and guarantees the invariant `taskConcurrency * forksPerTask <= cores`. On 8 cores that is
  **3 concurrent turbo tasks × 2 vitest forks = 6 max test workers**, leaving 2 cores of
  headroom for the vitest parents, package-manager shims, turbo itself and v8 coverage merges.
- **Both multipliers are capped, because capping either alone is insufficient.** The task
  count via turbo `--concurrency`, and the per-task fork count via vitest's own `VITEST_*`
  env overrides — which reach **every** package uniformly, including `@cg/ui`, which has a
  `test` script but no `vitest.config.ts` to put a setting in.
- **`turbo.json` gains `passThroughEnv`** for those names on the three vitest-bearing tasks.
  turbo runs in strict env mode by default, so without it the caps are filtered out before
  vitest sees them and the bound is a silent no-op.
- **Every run states its own bound** on stdout, so a future starvation report can be checked
  against the numbers actually in force rather than the numbers someone intended.
- **`pnpm test` and `pnpm test:integration` are bounded too**, not just `gate` — B-098's
  stated repro is the full parallel `pnpm test`.

Deliberately NOT done, and why:

- **No timeout was raised.** B-073 already raised this exact bound once (`HEALTH_MS` to 15 s)
  and B-098 **is** that raised bound being blown in turn. There is no ceiling that both
  tolerates a starved box and still catches a genuine hang.
- **No per-suite carve-out.** `single-file-export` proves the "fragile suites" list is
  non-obvious and would be incomplete.
- **No test deleted, skipped, retried or marked flaky.** The test files are untouched.
- **The cap is not in each `vitest.config.ts`.** A package cannot know how many siblings run
  beside it, and the hazard is the product of the two. Capping per package would also slow an
  ISOLATED single-package run, which is not contended and wants every core.

## Impact

- Affected spec: `platform-local-gate` — one ADDED requirement (a monorepo-wide test run is
  bounded to the host).
- Affected code: `tools/gate-hook/src/test-concurrency.mjs` (new, pure),
  `tools/gate-hook/src/bounded-turbo-cli.mjs` (new, plumbing),
  `tools/gate-hook/types/test-concurrency.d.ts`, `turbo.json` (`passThroughEnv`),
  root `package.json` (`test`, `test:integration`, `gate` route through the CLI).
- **No test file, timeout, or product source changed.** The gate's shape is otherwise
  preserved: still ONE turbo invocation, still `--force`, still reporting
  `0 cached, 82 total`, still with the `format:check` + `openspec validate` tail.
- Measured on the 8-core reference box: peak concurrent node processes **64 → 19**, of which
  3 belong to the editor. Gate wall-clock is **not** the trade one might expect: 5 back-to-back
  uncached bounded runs took 222 / 213 / 171 / 171 / 171 s (median **171 s**) against a 203 s
  unbounded baseline — comparable, trending faster, because 64 processes on 8 cores were
  thrashing, not doing more work. The cap removes contention, not throughput.
- `gate:e2e` is untouched and still passes its own stricter `--concurrency=1`; the bound
  explicitly refuses to widen a caller-supplied concurrency.
