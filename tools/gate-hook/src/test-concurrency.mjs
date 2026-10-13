/**
 * B-098 / P-034 — the PURE arithmetic behind the gate's test-parallelism bound: how
 * many worker processes may the monorepo-wide run have in flight at once?
 *
 * TWO halves, one rule. B-098 bounded the VITEST fan-out (`resolveTestBound` /
 * `testWorkerEnv`); P-034 found the same defect on the one sibling script the bound was
 * never applied to and added the PLAYWRIGHT half (`resolveE2eWorkers` /
 * `e2eWorkerEnv`). They live in one module on purpose — a second copy of "how wide may
 * this box run" is how the rule came to have two spellings in the first place.
 *
 * The bug this exists to close is CPU starvation, not a code defect. `pnpm gate` and
 * `pnpm test` both fan out through turbo, and NOTHING anywhere bounded the result:
 *
 *   - turbo's default concurrency runs ~10 package tasks at once, and
 *   - vitest's own default is `pool: 'forks'` with `maxForks = availableParallelism - 1`
 *     (7 on an 8-core box) — every package, since no vitest.config.ts in this repo sets
 *     a pool option at all.
 *
 * The two multiply. Measured on the 8-core reference box: a peak of 64 concurrent node
 * processes for 8 cores — 8x oversubscription. Timing-sensitive suites (socket + real
 * timer integration tests) then miss real-time deadlines and red, while passing in
 * isolation. The victims are whatever happened to be scheduled: @cg/caspar-bridge,
 * @cg/caspar-client and @cg/single-file-export have all been named, and the last of
 * those uses no amcp-mock and no fixed ports — which is what rules out port collision
 * and makes a per-suite carve-out the wrong shape of fix. The bound has to be general.
 *
 * The remedy is the one B-095/#360 already applied to `gate:e2e` (serialise at the
 * ORCHESTRATOR, `--concurrency=1`), tuned rather than serialised because the main gate
 * carries a much larger task graph. Deliberately NOT the remedy: raising a timeout.
 * B-073 already raised this exact bound once (`HEALTH_MS` to 15 s) and B-098 IS that
 * raised bound being blown in turn — there is no ceiling that both tolerates a starved
 * box and still catches a genuine hang.
 *
 * Why the cap lives in the orchestrator and not in each vitest.config.ts: a package
 * cannot know how many sibling packages are running beside it, and the whole hazard is
 * the product of the two. Capping per-package would also slow an ISOLATED single-package
 * run, which is not contended and wants every core. It would additionally miss @cg/ui,
 * which has a `test` script but no vitest.config.ts at all.
 *
 * Zero dependencies, plain ESM, NO build step — same contract as `gate-decision.mjs`:
 * the CLI next door imports it by relative path, so it works on a fresh clone from
 * PowerShell, Git Bash, or WSL alike.
 */

/**
 * Forks each `test` task may run. Vitest reuses forks across files, so this is the
 * per-package parallelism, not a file count.
 *
 * 2, not 1: several packages pay a large per-FILE environment cost (happy-dom setup
 * dominates @cg/template-runtime and @cg/runtime), and a single fork serialises that
 * cost across every file in the package, making one suite the critical path. 2 keeps
 * intra-package overlap while still composing into a small product.
 */
const DEFAULT_FORKS_PER_TASK = 2;

/**
 * Fraction of the machine the test workers may claim. The remainder is real work, not
 * slack: each task also runs a vitest parent process and a package-manager shim, turbo
 * itself is resident, and v8 coverage merges at the end of every task. B-098 is a
 * headroom bug, so the budget reserves headroom by construction.
 */
const CORE_UTILISATION = 0.75;

/**
 * Coerce an arbitrary value to a positive integer, or `null` if it is not one.
 *
 * Used for both the detected core count and the env overrides, so a malformed value
 * (empty string, `NaN`, `0`, a negative, a float) can never widen the bound — it is
 * discarded and the computed default applies.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function toPositiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * Compute the parallelism bound for a monorepo-wide test run.
 *
 * The invariant this function exists to guarantee, and which its unit tests pin:
 *
 *     taskConcurrency * forksPerTask === maxTestWorkers <= cores
 *
 * so the worst case — every concurrent turbo slot occupied by a `test` task, every one
 * of them saturating its fork allowance — still fits the machine. That bound, not a
 * streak of green runs, is what makes starvation structurally unable to recur.
 *
 * @param {unknown} cores physical/available cores; anything unusable falls back to 1
 * @param {{ forksPerTask?: unknown, taskConcurrency?: unknown }} [overrides]
 *   operator escape hatches (see the CLI's env vars). Both are clamped so an override
 *   can tighten the bound freely but can never exceed the core budget.
 * @returns {{ cores: number, forksPerTask: number, taskConcurrency: number,
 *             maxTestWorkers: number, workerBudget: number }}
 */
export function resolveTestBound(cores, overrides = {}) {
  const detected = toPositiveInt(cores) ?? 1;

  // A task can never be allowed more forks than the machine has cores, or the very
  // first task would already breach the invariant.
  const requestedForks = toPositiveInt(overrides.forksPerTask) ?? DEFAULT_FORKS_PER_TASK;
  const forksPerTask = Math.min(requestedForks, detected);

  // At least 1, so a 1-core machine still runs rather than dividing down to zero.
  const workerBudget = Math.max(1, Math.floor(detected * CORE_UTILISATION));

  // When one task's forks already exceed the budget (tiny machines), concurrency floors
  // at 1 and the worker total is `forksPerTask`, which is still <= cores by the clamp.
  const computedConcurrency = Math.max(1, Math.floor(workerBudget / forksPerTask));
  const requestedConcurrency = toPositiveInt(overrides.taskConcurrency);
  const taskConcurrency =
    requestedConcurrency === null
      ? computedConcurrency
      : Math.min(requestedConcurrency, computedConcurrency);

  return {
    cores: detected,
    forksPerTask,
    taskConcurrency,
    maxTestWorkers: taskConcurrency * forksPerTask,
    workerBudget,
  };
}

/**
 * The environment that carries the per-task fork cap into every vitest process.
 *
 * Why this returns FOUR variables rather than the one you would expect:
 *
 *  - Both pools are named because the cap must not depend on which pool a package
 *    selects. `forks` is vitest's default and what every package here resolves to
 *    today, but a package may set `pool: 'threads'` tomorrow and must stay bounded.
 *
 *  - The MIN of each pair is mandatory, not decoration. Vitest resolves the two ends
 *    independently (`createForksPool`: `maxForks ?? maxWorkers ?? threadsCount` and
 *    `minForks ?? minWorkers ?? threadsCount`), so capping only the max leaves the min
 *    at the default `availableParallelism - 1`. Tinypool is then handed min 7 / max 2
 *    and throws `options.minThreads and options.maxThreads must not conflict` before a
 *    single test runs — which is exactly what the first bounded gate run did, in all
 *    20 vitest workspaces at once. The pairing is pinned by a unit test for that reason.
 *
 * The floor is 1 rather than the cap: it lets the pool size to the work, so a
 * single-file package stops paying for workers it cannot use, and it keeps the actual
 * worker count at or BELOW the bound instead of pinned to it.
 *
 * @param {number} forksPerTask the per-task cap from {@link resolveTestBound}
 * @returns {Record<string, string>} env overrides to merge into the child environment
 */
export function testWorkerEnv(forksPerTask) {
  const max = String(Math.max(1, toPositiveInt(forksPerTask) ?? 1));
  return {
    VITEST_MAX_FORKS: max,
    VITEST_MIN_FORKS: '1',
    VITEST_MAX_THREADS: max,
    VITEST_MIN_THREADS: '1',
  };
}

/**
 * Append `--concurrency=<n>` to a turbo argv unless the caller already set one.
 *
 * An explicit caller flag WINS: `gate:e2e` passes `--concurrency=1` for its own
 * (stricter) B-095 reason, and this bound must not quietly widen it back out.
 *
 * @param {readonly string[]} args turbo argv as written in the package.json script
 * @param {number} concurrency the computed task concurrency
 * @returns {string[]} argv to hand to turbo
 */
export function applyConcurrencyFlag(args, concurrency) {
  const list = [...args];
  const alreadySet = list.some((a) => a === '--concurrency' || a.startsWith('--concurrency='));
  if (alreadySet) return list;
  return [...list, `--concurrency=${concurrency}`];
}

/**
 * Read a `--concurrency` the CALLER already wrote into the turbo argv, in either
 * spelling, or `null` when there is none.
 *
 * The e2e bound below divides the worker budget by the task concurrency ACTUALLY in
 * force, and `applyConcurrencyFlag` lets a caller's explicit value win — so the two
 * have to agree on what that value is. Reading it here, from the same argv, is what
 * keeps them from drifting: computing the divisor from `bound.taskConcurrency` while
 * turbo ran on the caller's `--concurrency=1` would bound the wrong machine.
 *
 * @param {readonly string[]} args turbo argv as written in the package.json script
 * @returns {number | null} the caller's concurrency, or null when unset/unusable
 */
export function readConcurrencyFlag(args) {
  const list = [...args];
  for (let i = 0; i < list.length; i += 1) {
    const arg = list[i];
    if (arg.startsWith('--concurrency=')) return toPositiveInt(arg.slice('--concurrency='.length));
    if (arg === '--concurrency') return toPositiveInt(list[i + 1]);
  }
  return null;
}

/**
 * P-034 — the E2E half of the same bound, and the reason this module grew one.
 *
 * `test` was routed through the bound; its sibling `test:e2e` was not, and a bare
 * `turbo run test:e2e` therefore ran BOTH apps' Playwright tasks at once, each opening
 * its own default pool. Measured on the 12-core reference box: `6 + 6 = 12` Chromium
 * workers for 12 cores — 100% of the machine claimed by browsers alone, before the two
 * `vite preview` servers, the two node parents and turbo itself. Every failure it
 * produced was an animate-within-N-milliseconds assertion, in a set that MOVED between
 * runs; that is starvation, not four brittle tests. One rule, two spellings — the same
 * shape as B-098 one script over.
 *
 * The number is per TASK, because that is the unit turbo schedules, and the invariant
 * mirrors the vitest one exactly:
 *
 *     taskConcurrency * workersPerTask <= workerBudget <= cores
 *
 * with one extra ceiling that the vitest side does not need: it may never exceed
 * {@link defaultPlaywrightWorkers}. A run turbo schedules one task at a time would
 * otherwise be handed the entire budget and run WIDER than it does today. The bound
 * tightens or does nothing; it never widens.
 *
 * @param {unknown} cores available cores; anything unusable falls back to 1
 * @param {unknown} taskConcurrency turbo tasks that may run at once
 * @param {unknown} [override] operator escape hatch; clamped, so it can only tighten
 * @returns {number} Playwright workers each e2e task may run, at least 1
 */
export function resolveE2eWorkers(cores, taskConcurrency, override) {
  const detected = toPositiveInt(cores) ?? 1;
  const concurrency = toPositiveInt(taskConcurrency) ?? 1;
  const workerBudget = Math.max(1, Math.floor(detected * CORE_UTILISATION));

  // This task's share of the budget when every concurrent slot holds an e2e task.
  const share = Math.max(1, Math.floor(workerBudget / concurrency));
  const capped = Math.min(share, defaultPlaywrightWorkers(detected));

  const requested = toPositiveInt(override);
  return requested === null ? capped : Math.min(requested, capped);
}

/**
 * Playwright's OWN default worker count, reproduced here so the bound can refuse to
 * exceed it: Playwright resolves `workers` to `'50%'` of the logical CPUs.
 *
 * Not a knob — a ceiling. See {@link resolveE2eWorkers} for why a bound that is allowed
 * to widen is not a bound.
 *
 * @param {unknown} cores
 * @returns {number} at least 1, so a single-core machine still runs
 */
export function defaultPlaywrightWorkers(cores) {
  return Math.max(1, Math.floor((toPositiveInt(cores) ?? 1) * 0.5));
}

/**
 * The environment that carries the per-task Playwright worker cap into every e2e task.
 *
 * ONE variable, not four: unlike vitest — whose min/max ends resolve independently and
 * must both be named ({@link testWorkerEnv}) — Playwright takes a single `workers`
 * value, and the pool sizes itself down to the work below it.
 *
 * ⚠ The name must ALSO be listed in the `test:e2e` task's `passThroughEnv` in
 * `turbo.json`. Turbo runs in strict env mode by default and would otherwise filter it
 * out before Playwright ever saw it — the bound would then be a silent no-op, which is
 * the failure this repo already documents on the vitest side.
 *
 * @param {number} workersPerTask the per-task cap from {@link resolveE2eWorkers}
 * @returns {Record<string, string>} env overrides to merge into the child environment
 */
export function e2eWorkerEnv(workersPerTask) {
  return { CG_E2E_WORKERS: String(Math.max(1, toPositiveInt(workersPerTask) ?? 1)) };
}
