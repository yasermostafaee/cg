# Tasks — bound the E2E fan-out (P-034)

## 1. Confirm the diagnosis on the host, before changing anything

- [x] 1.1 Host is **12 cores** (`os.availableParallelism()` and `os.cpus().length` agree).
      ⚠ P-034's third occurrence recorded "8 cores" in its Env line; that was wrong and is
      corrected in the item. The `6 + 6` worker figure it recorded is right — Playwright
      resolves `workers` to 50% of logical CPUs, so 12 cores gives 6 per suite.
- [x] 1.2 Swept EVERY `turbo run` in the root `package.json`, not only the one the item
      named: `build`, `lint`, `typecheck`, `test:e2e`, `gate:e2e:run`, `package`, `dev`,
      `clean`. Only `test:e2e` and `gate:e2e:run` spawn browser worker pools; the rest run
      one process per task and cannot compound. `gate:e2e:run` already carried
      `--concurrency=1` (B-095), so it was not exhibiting the defect — it is routed anyway,
      for one rule and one spelling.
- [x] 1.3 BEFORE, on the change's base commit `4e876d7a`, concurrent `pnpm test:e2e`:
      `Running 268 tests using 6 workers` + `Running 81 tests using 6 workers`
      → designer **264 passed, 4 failed**; runtime **80 passed, 1 failed**.
      Failures: `auto-size-text.spec.ts:12`, `clock.spec.ts:61`, `clock.spec.ts:90`,
      `content-start-hold-entry.spec.ts:53`, runtime `fixed-layers.spec.ts:142`.
- [x] 1.4 🔴 The victim set MOVED against P-034's recorded four
      (`clock.spec.ts:14`, `content-start-hold-entry.spec.ts:53`/`:63`,
      `splash.spec.ts:102`) — one spec in common, different tests. That is the finding, not
      a discrepancy: a brittle test fails repeatably, a starved host fails whoever was
      unlucky. Every failure in both sets is an animate-within-N-milliseconds assertion.

## 2. The pure bound

- [x] 2.1 `resolveE2eWorkers(cores, taskConcurrency, override)` in the EXISTING
      `tools/gate-hook/src/test-concurrency.mjs` — same module as the vitest half, sharing
      its `CORE_UTILISATION` budget. Invariant: `taskConcurrency * workersPerTask <=
workerBudget`, plus a ceiling at `defaultPlaywrightWorkers(cores)` so the bound can
      only ever tighten.
- [x] 2.2 `defaultPlaywrightWorkers(cores)` — Playwright's own 50%-of-CPUs default,
      reproduced as a CEILING rather than a knob.
- [x] 2.3 `e2eWorkerEnv(workers)` → one `CG_E2E_WORKERS` name (Playwright takes a single
      `workers` value, unlike vitest's four min/max names).
- [x] 2.4 `readConcurrencyFlag(args)` — reads the caller's own `--concurrency` in either
      spelling, so the divisor is the concurrency ACTUALLY in force. Pinned by a test that
      it agrees with `applyConcurrencyFlag` about whether the caller set one.
- [x] 2.5 **82 new unit tests** in `tools/gate-hook/tests/test-concurrency.test.ts`
      (80 → 162), including the invariant across 12 core counts, the never-widen property,
      the measured 12-core case, and the serialised-`gate:e2e` case. `pnpm --filter
@cg/gate-hook test` → **320 passed**.

## 3. Wiring

- [x] 3.1 `bounded-turbo-cli.mjs` exports BOTH env sets on every invocation, with no branch
      on task name — the way this bound came to miss `test:e2e` in the first place was a
      decision about which scripts it applied to.
- [x] 3.2 Banner extended: the run now prints its E2E bound beside its vitest bound.
- [x] 3.3 `package.json`: `test:e2e` and `gate:e2e:run` routed through the CLI.
      `applyConcurrencyFlag` leaves `gate:e2e:run`'s explicit `--concurrency=1` alone.
- [x] 3.4 `turbo.json`: `CG_E2E_WORKERS` added to `test:e2e`'s `passThroughEnv`.
      **Verified reaching Playwright**, not assumed — see 4.1.
- [x] 3.5 Both `playwright.config.ts`: `workers: resolveWorkers()` — CI's 1 wins first, then
      `CG_E2E_WORKERS`, then Playwright's default for an isolated run.

## 4. Proof

- [x] 4.1 AFTER, same host, same command: `gate bound (P-034): 12 cores -> 4 concurrent
tasks x 2 playwright workers = 8 max e2e workers`, then
      `Running 268 tests using 2 workers` + `Running 81 tests using 2 workers`.
      **The cap crossed turbo's strict env filter** — that is what 3.4 was for.
- [x] 4.2 **designer 268 passed, runtime 81 passed, 0 failed, 0 flaky.** Every test named
      in 1.3 and every test named in P-034's third occurrence passes under the concurrent
      run that failed them. Wall clock 4m28s vs 4m06s unbounded — the cost of the fix.
- [x] 4.3 ⚠ Both runs REBUILT between them (`pnpm test:e2e` goes through turbo, whose
      `test:e2e` `dependsOn: ['build']`), so the comparison is not the P-036 vacuous kind.
      The staleness guard was in force for both and refused neither — and that "no refusal"
      was confirmed against a POSITIVE CONTROL rather than read off silence: handed a
      planted source newer than the build, the same guard refused, so the instrument is
      demonstrably live (29 bundle input dirs resolved from the dependency graph).
- [x] 4.4 🔴 **Linux CI `e2e` DISCHARGED** —
      <https://github.com/yasermostafaee/cg/actions/runs/32136025181>, commit `b658a033`,
      `conclusion: success`, and the `e2e` job **RAN** (not skipped). Counts read from the
      job log: **runtime 81 run / 81 passed / 0 flaky**, **designer 268 run / 268 passed /
      0 flaky** — **349 / 349 / 0 flaky** in total. The bound printed itself there too:
      `gate bound (P-034): 2 cores -> 1 concurrent tasks x 1 playwright workers = 1 max e2e
workers`. ⚠ The runner is **2 cores**, not the 4 this change's proposal guessed —
      corrected here rather than left standing.
- [x] 4.5 🔴 **THAT ZERO IS NOT EVIDENCE THIS FIX WORKED ON CI, and recording it as such
      would re-commit the exact error P-034 already retracted once.** Measured, not
      assumed: the run on this change's BASE commit `4e876d7a`
      (<https://github.com/yasermostafaee/cg/actions/runs/32130531609>) also read
      **81 passed / 268 passed / 0 flaky** — before any of this landed. CI was already at
      zero because CI never ran the unbounded shape: one worker per suite, suites
      serialised. The honest reading of this run is **"the fix broke nothing on CI"**,
      which is exactly what a local-only fix should show. The evidence that it WORKS is the
      Windows before/after in §1.3 and §4.2, and that evidence is local by construction.

## 5. Not done, deliberately

- [x] 5.1 No timeout widened, no threshold loosened, no retry added, no test edited.
- [x] 5.2 No claim made about the CI flakes. P-034's CI half is withdrawn and its second
      occurrence (`video-import.spec.ts:291`, run 32054398518) stands UNEXPLAINED — recorded
      as open in the item so the next occurrence has somewhere to land.
