# Bound the E2E fan-out too — the one gate script B-098's bound never reached (P-034)

## Why

B-098 bounded the monorepo-wide **vitest** fan-out and routed `gate`, `test` and
`test:integration` through `tools/gate-hook/src/bounded-turbo-cli.mjs`. Its sibling
`test:e2e` was left a **bare `turbo run`**:

```
"test":     "node tools/gate-hook/src/bounded-turbo-cli.mjs run test --continue=…"
"test:e2e": "turbo run test:e2e --continue=…"          ← unbounded
```

One rule, two spellings — this repo's most frequent failure shape, on the script the rule
was never applied to.

**Measured, not inferred.** `pnpm test:e2e` starts BOTH apps' Playwright tasks at once and
each opens its own default pool (Playwright resolves `workers` to 50% of logical CPUs):
**6 + 6 = 12 Chromium workers on the 12-core reference host** — the whole machine claimed
by browsers before the two `vite preview` servers, the two node parents and turbo itself.
That is precisely the compounding-multiplier shape B-098 exists to prevent.

**It reproduces on demand, and the failures move.** Three concurrent runs and two isolated
ones (P-034's third occurrence, plus this change's own before/after):

| run                                       | designer           | runtime           |
| ----------------------------------------- | ------------------ | ----------------- |
| `pnpm test:e2e` (both suites, concurrent) | **265 / 3 failed** | 81 passed         |
| `pnpm --filter @cg/designer test:e2e`     | **268 passed**     | —                 |
| `pnpm test:e2e` again                     | **265 / 3 failed** | **80 / 1 failed** |
| `pnpm --filter @cg/runtime test:e2e`      | —                  | **81 passed**     |
| `pnpm test:e2e` on this change's base     | **264 / 4 failed** | **80 / 1 failed** |

🔴 **Every failure across every run is an "did this ANIMATE within N milliseconds"
assertion** — a clock that has not rendered, a crawl whose transform has not started, an
opacity transition that has not finished, a page that did not reach `toBeVisible` inside
the test timeout. **Not one is a logic assertion**, and the SET OF VICTIMS CHANGES between
runs. Both facts point at the host's ability to schedule frames, not at brittle tests: a
brittle test fails repeatably, and these fail by whichever ones were unlucky.

⚠ **LOCAL-ONLY.** CI runs ONE worker per suite and its two suites do not overlap
(run 32126244485: runtime 10:24→10:26, designer 10:28→10:34). Nothing here explains any CI
flake, and this change deliberately makes no claim about one.

## What Changes

- `test:e2e` and `gate:e2e:run` route through `bounded-turbo-cli.mjs`, like their siblings.
- The pure bound gains its Playwright half — `resolveE2eWorkers` / `e2eWorkerEnv` — in the
  SAME module as the vitest half, because a second copy of "how wide may this box run" is
  how the rule came to have two spellings.
- The cap travels as one `CG_E2E_WORKERS` env var, listed in `test:e2e`'s `passThroughEnv`
  (turbo's strict env mode would otherwise filter it and the bound would be a silent
  no-op — the failure the vitest half already documents).
- Both `playwright.config.ts` read it. CI's `workers: 1` still wins outright; an ISOLATED
  single-suite run is not contended and keeps Playwright's default.

🔴 **Explicitly NOT changed:** no timeout widened, no pixel threshold loosened, no retry
added, no test edited. Answering a contention red with a longer rope is `B-073`, and
`B-098` is that bound blown in turn.

## Impact

- Affected specs: `platform-local-gate`
- Affected code: `package.json` (2 scripts), `turbo.json` (`test:e2e` `passThroughEnv`),
  `tools/gate-hook/src/{test-concurrency,bounded-turbo-cli}.mjs`,
  `apps/{designer,runtime}/playwright.config.ts`
- ⚠ **Shared config the next session must pick up** — the root `package.json` and
  `turbo.json` both change.
- ⚠ **CI's invocation changes** because CI calls the same `pnpm test:e2e`. On a 4-core
  runner the bound resolves to `--concurrency=1`, which makes explicit the serialisation
  CI already had by accident. The suites' own worker count is unchanged there (`CI ? 1`).
