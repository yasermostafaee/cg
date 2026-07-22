# Tasks — bound the gate's test fan-out (B-098)

## 1. Confirm the diagnosis on the host (not assumed)

- [x] 1.1 Physical cores = 8 (`os.availableParallelism()`), vitest 2.1.9, turbo 2.9.14.
- [x] 1.2 21 workspaces carry a `test` script; NONE of the 19 `vitest.config.ts` sets a pool
      option. Resolved each config through vitest's Node API: every one reports `pool: 'forks'`,
      `poolOptions.forks: {}`, `fileParallelism: true` → default `maxForks = cores - 1 = 7`.
- [x] 1.3 Measured `turbo run test --force`: **peak 64 concurrent node processes on 8 cores**
      (8× oversubscription), sustained across the middle of the run. Hypothesis A (CPU
      starvation) CONFIRMED; hypothesis B (fixed-port collision) RULED OUT — `single-file-export`
      is a victim yet uses no amcp-mock, no HEALTHY bound and no fixed ports.

## 2. The pure bound + its unit tests

- [x] 2.1 New `tools/gate-hook/src/test-concurrency.mjs`: `resolveTestBound(cores, overrides)`
      guaranteeing `taskConcurrency * forksPerTask = maxTestWorkers <= cores`, with 75%
      utilisation for headroom and clamps so an override can only tighten. Plus `testWorkerEnv`
      (the four `VITEST_*` names) and `applyConcurrencyFlag` (append `--concurrency`, never
      overwrite a caller's).
- [x] 2.2 Typed surface `tools/gate-hook/types/test-concurrency.d.ts`, matching the P-010
      wildcard-module convention.
- [x] 2.3 `tools/gate-hook/tests/test-concurrency.test.ts` — 75 tests: the invariant across 1–128
      cores, degenerate input, override-only-tightens, and the min/max pairing regression.

## 3. The launcher (plumbing only)

- [x] 3.1 New `tools/gate-hook/src/bounded-turbo-cli.mjs`: detect cores, print the bound, spawn
      turbo with the computed `--concurrency` and the `VITEST_*` caps in the child env, forward
      the exit code, fail closed on spawn error or signal death.

## 4. Wire-up

- [x] 4.1 `turbo.json`: the four `VITEST_{MIN,MAX}_{FORKS,THREADS}` names added to
      `passThroughEnv` on `test`, `@cg/soak-runner#test` and `test:integration` (strict env
      mode would otherwise filter them out — the bound would be a silent no-op).
- [x] 4.2 Root `package.json`: `test`, `test:integration` and `gate` route through the launcher.
      `gate:e2e` untouched (keeps its stricter `--concurrency=1`).

## 5. The bug it caught in itself (recorded, not hidden)

- [x] 5.1 First bounded gate run reddened all 20 vitest workspaces with
      `options.minThreads and options.maxThreads must not conflict` — max set to 2, min still at
      the default 7. Root cause read from vitest source (`createForksPool` resolves the two ends
      independently). Fixed by emitting all four `VITEST_*` names with min floored at 1; pinned
      by a dedicated regression test in 2.3.

## 6. Docs

- [x] 6.1 `docs/prd/bugs.md`: B-098 `[ ] → [~]` with this session's evidence — 5 occurrences
      across three workspaces, the 64-proc measurement, the temporal spike, hypothesis A
      confirmed / B ruled out, and the mechanism + thread bound of the fix.
- [x] 6.2 `CLAUDE.md`: one standing rule — the gate's test fan-out is bounded to the host.
- [x] 6.3 This OpenSpec change (proposal / design / spec delta / tasks).

## 7. Gate — the proof is the bound, then the empirical sanity

- [x] 7.1 Structural: 8 cores → 3 tasks × 2 forks = 6 max workers ≤ 8, with the 62/75 unit
      tests asserting `maxTestWorkers <= cores` across 1–128 cores. This is the real proof that
      starvation cannot recur.
- [x] 7.2 Empirical: `pnpm gate` green ≥5× back-to-back, no test file touched. Peak node
      processes 64 → 19 (3 of which are the editor's). If any red still appeared the bound was
      not tight enough — tighten, never touch a test.
- [x] 7.3 `pnpm openspec validate platform-gate-test-bound --strict` and
      `pnpm openspec validate --all --strict`.
- [x] 7.4 `gate:e2e` NOT owed: no path in this change matches `UI_RENDER_PATTERNS`, and the
      change alters unit/integration parallelism only, not e2e. `applyConcurrencyFlag` leaves
      `gate:e2e`'s `--concurrency=1` intact.

## 8. To reach [x] + archive

- [ ] 8.1 Owner confirms the flake stays gone across subsequent real-use gate runs (the load
      margin is restored, but "N/N green is the agreed bar, not a proof of absence" — B-073).
