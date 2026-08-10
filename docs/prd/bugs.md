# Bugs — cross-cutting / platform / tooling

Bug reports that are **not specific to a single app** — monorepo tooling, CI, build,
and cross-platform issues. App-specific bugs live in
[bugs-designer.md](bugs-designer.md) and [bugs-runtime.md](bugs-runtime.md).

> **B- numbers are GLOBAL** across all three bug files and are **never reused**.
> When filing a new bug, pick the next unused `B-` number regardless of which file
> it goes in. Bug files: [bugs-designer.md](bugs-designer.md) ·
> [bugs-runtime.md](bugs-runtime.md) · [bugs.md](bugs.md) (cross-cutting / tooling).
>
> **Before filing, run the duplicate audit and check the number space:**
> [b-number-registry.md](b-number-registry.md) — the source of truth for which numbers
> are taken, the one accepted duplicate (`B-056`), and why collisions keep happening.

Bug reports. Unlike features, every bug needs a **repro** — that's what lets
Claude reproduce, fix, and add a regression test. See `README.md` for IDs and
statuses.

## Bug format

Copy this block per bug (use `B-` IDs):

```md
## [x] B-001 — panels position and design ⟨priority: high⟩ — folded into `openspec/changes/archive/2026-06-15-add-animation-timeline-dock/`

**Repro:**

1. فونتها و تکستها درشت هستن
2. بعضی مقادیر و آیکونها در پنل پراپرتی وجود ندارند
   **Expected:** دقیقا مثل تصاویر که در تسک D-006 به آنها اشاره شده کل پنلها و دیزاین پیاده سازی شود
   **Actual:** all pics are related to D-006: `docs/designer-guide/sample-assets/D-006-pic-*`
   **Env:** Browser + app (e.g. Chrome / Designer dev) — and whether it reproduces
   in the latest `main`.
   **Notes:** check this website https://app.loopic.io/studio and crawl and see all the codes, i have got those screenshots from this website

## [x] B-002 — point frames action ⟨priority: high⟩ — folded into `openspec/changes/archive/2026-06-15-add-animation-timeline-dock/`

**Repro:**

1. درست کار نکردن پوینتها
2. عدم نمایش پراپرتی درست مربوط به پوینتها
   **Expected:**
   وقتی روی یک پوینت کلیک میکنیم باید در قسمت لایه ها هم رنگ آیکون پوینت در لایه مربوطه زرد شود و همچنین در بخش پراپرتی یعنی پنل سمت راست باید آیکون پونت وجود داشته باشه
   دقیقا مثل تصاویر قرار داده شده
   چیزی که الان نمایش داده میشه زمانی که روی پوینتها کلیک میکنیم مناسب زمانیست که دابل کلیک کنیم نه کلیک

برای هر پوینت باید مقدار متفاوت وجود داشته باشه یعنی اگر در لایه positionx 3 تا پوینت داریم هر کدوم باید بتونن مقادیر متفاوت داشته باشن
**Actual:** What happens instead (error text / screenshot path if any).
**Env:**  
**Notes:** تصاویر مربوط به تسک D-006 رو با دقت بسیار بسیار بالا بررسی کن

## [x] B-003 — point frames style ⟨priority: high⟩ — focused fix, merged (`70786d0`, pre-OpenSpec): keyframe indicator collapsed to the two authored states (empty / at-frame — `keyframe-helpers.ts`, `KeyframeIndicator.tsx`), lane diamonds always yellow with a selected diamond's border (and its following interpolation line) turning blue (`TrackRow.css.ts`), and the segment glyph is the small SVG curve, not the "f" letter. Pinned by `store-animation.test.ts` ("B-003 — keyframeVariantFor collapses to empty / at-frame"). Confirmed shipped by the 2026-07-13 `[~]` audit

**Repro:**

1. framepoint color style is wrong

**Expected:**
❯
A- We have 2 states of a framepoint on properties area on right panel and on the left of the timeline area:
1- Empty: if a point exist or not it just shows an empty point.
2- Index is exactly on the same frame with a point: point on properties areas must be yellow.

B- We have 2 states of a framepoint on the timeline area:
1- all framepoints are yellow.
2- A point is selected: use a blue border around the selected point and also the line after that.

just use a curve tiny line on the line between framepoints not a "f" letter.

**Actual:**
**Env:**  
**Notes:** see screenshots in: `docs/designer-guide/sample-assets/B-003-pic-*`

## [x] B-004 — rotation style ⟨priority: high⟩

**Repro:**

1. when change the rotaion of a shape or text the transition border and handle wont be changed position.

**Expected:**
work correctly

**Actual:**
**Env:**  
**Notes:** see screenshots in: `docs/designer-guide/sample-assets/B-004-pic-0`
```

Claude's loop for a bug (per `README.md` processing contract): reproduce →
diagnose → fix → **add a regression test** that fails before and passes after →
green gate → commit. Track it as an OpenSpec change only if the fix changes
spec-level behavior; otherwise a focused fix + test is enough (note that in the
proposal/commit).

---

## [x] B-012 — CI: soak-runner "Reconciler is not a constructor" (typecheck-emit race) ⟨priority: low⟩

**Repro:** nondeterministic in CI (raced twice on PR #79: runs `27288006490`
@ `6c7c00c` and `27288386408` attempt 1 @ `ee4401c`); identical reruns passed.

1. `Lint•Typecheck•Test•Build` failed in `@cg/soak-runner`
   `tests/harness.test.ts` — 7/9 tests with `TypeError: Reconciler is not a
constructor` (the `@cg/caspar-client` import resolved to undefined).

**Expected:** soak-runner's vitest always sees a fully-built
`caspar-client/dist`.
**Actual — root cause (diagnosed, fixed):** NOT an API drift and NOT a one-off:
soak-runner type-checks and passes 9/9 against current `@cg/caspar-client`
built from a fully clean tree. The real bug: lib packages used
`typecheck: tsc -b`, which **emits `dist/`** — the same files `build` emits —
while turbo's `typecheck` task declared only `*.tsbuildinfo` outputs and had
**no edge to the package's own `build`** (both depend only on `^build`), so
`X#typecheck` and `X#build` ran two concurrent `tsc -b` over the same
`dist/` + `tsconfig.tsbuildinfo`. Turbo snapshotted `caspar-client#build`
outputs while the sibling typecheck `tsc` was still writing → torn dist in the
cache artifact → restored on cache hit in the Test step (the
"`@cg/caspar-client:build` output inside the Test step" was cache-hit log
replay accompanying that restore) → vitest imported a half-written dist →
`Reconciler` undefined. Reruns passed because the failed job skipped its
"Post Cache Turbo" upload, so the poisoned artifact never left the runner.
**Env:** GitHub Actions; widest race window on broad cache invalidation
(schema change → many packages rebuilding concurrently).
**Notes:** FIXED — `fix/turbo-typecheck-emit-race`: every `typecheck`
script is now plain-mode `tsc --noEmit` with a private
`--tsBuildInfoFile typecheck.tsbuildinfo` (pure reader; build mode is out:
`tsc -b --noEmit` TS6310-fails whenever a referenced project is out of date,
and otherwise writes tsbuildinfo across the whole reference closure — other
packages' build state). Turbo's `typecheck` task declares `outputs: []` so no
stale state is ever restored over a build's coherent dist+tsbuildinfo pair,
and the `build` task's outputs exclude `typecheck.tsbuildinfo` so build
artifacts stay deterministic.
Regression pin: `tools/soak-runner/tests/typecheck-no-emit.test.ts` (fails if
any workspace typecheck script can emit, or turbo typecheck regrows outputs).
Also fixed alongside: `@cg/template-fixtures#build` turbo outputs/inputs (CI
warned "no output files found"; outputs go to repo-root `fixtures/templates/**`
and its real inputs are `build.mjs` + `*.scene.mjs`, so cache hits never
restored the fixtures and scene edits didn't bust the cache).

## [x] B-013 — `clean` scripts fail on Windows (rimraf 6 + unexpanded glob) ⟨priority: low⟩ — fixed on `fix/B-013-rimraf-glob`

**Repro:**

1. On Windows, run `pnpm --filter @cg/audit clean` (or `pnpm turbo run clean`).

**Expected:** `dist` and `*.tsbuildinfo` removed in every package.
**Actual:** rimraf 6 receives the literal `*.tsbuildinfo` (no shell glob
expansion on Windows) and exits 1 before deleting anything, so
`pnpm turbo run clean` aborts mid-graph. POSIX shells expand the glob first, so
CI/dev on Linux/macOS is unaffected.
**Env:** Windows only; all packages with `clean: rimraf dist *.tsbuildinfo`.
**Notes:** Fix is mechanical: `rimraf --glob dist "*.tsbuildinfo"` in every
package's clean script. Surfaced while reproducing B-012 from a clean tree.
**DONE** — added `--glob` to all 16 workspace `clean` scripts that use a glob (the 12
`packages/*`, `apps/designer`, `apps/runtime`, `tools/amcp-mock`, `tools/soak-runner`);
the two literal-only clean scripts (root `node_modules`, `tools/template-fixtures`) need
no flag. **Regression guard / why:** rimraf **6** no longer expands glob patterns
unless `--glob` is passed — a bare `rimraf *.tsbuildinfo` throws `EINVAL: Illegal
characters in path` on Windows (cmd doesn't pre-expand the glob), leaving
`*.tsbuildinfo` behind. Verified: `rimraf "*.tsbuildinfo"` (quoted, so no shell
expansion) errors, while `rimraf --glob "*.tsbuildinfo"` deletes the files. Keep
`--glob` on any clean script that lists a glob; this is a focused tooling fix (no
OpenSpec change).

## [x] B-043 — CI: every pull_request run fails in "Detect changed paths" (workflow token lacks `pull-requests: read`) ⟨priority: high⟩ — fixed on `fix/B-043-pr-workflow-token-permissions`

**Repro:**

1. Open any PR (observed on the housekeeping PR #249's run).
2. The `PR` workflow's `changes` job ("Detect changed paths") fails immediately:
   `Run dorny/paths-filter@v3` → `Error: Resource not accessible by integration`.

**Expected:** paths-filter reads the PR's changed-file list, the `code` output is
computed, and the cascade (`ci`/`e2e` on code changes, docs-check always, the
`required` aggregate) runs normally.
**Actual:** the API call is rejected, `code` comes out empty, `ci`/`e2e` skip
(their `if:` sees `''` ≠ `'true'`), and the fail-safe `required` aggregator — by
design (P-008) — treats the unknown as a code change with no passing ci/e2e →
**required FAIL on every pull_request run**. Push runs on `main` are unaffected
(the push path diffs git history, no API call).
**Env:** GitHub Actions, `pull_request` events only; observed on PR #249.
**Notes:** Root cause: `.github/workflows/pr.yml` declared **no `permissions:`
block**, so the workflow `GITHUB_TOKEN` fell back to the repository's default
workflow permissions — the restrictive `contents: read` default, which does NOT
include the `pull-requests: read` scope `dorny/paths-filter@v3` needs to fetch a
PR's changed files via the GitHub API (the job's own comment documents the API
mode on PRs). Fix: an explicit top-level least-privilege block —
`permissions:` with `contents: read` + `pull-requests: read` — which grants the
one missing scope under a restrictive default AND pins the token down under a
permissive one (correct in both worlds). Nothing else changed: API-mode
detection for PRs stays (intentional and documented), and the fail-safe
`required` logic stays as-is (it did exactly its job). The fix PR's own checks
are the regression demonstration — "Detect changed paths" must go green on a
`pull_request` event. (The "Node 20 is being deprecated" banner in the same log
is informational runner noise — all actions in the file are on current majors;
no change made for it.) Focused tooling fix, no OpenSpec change (the B-013
rimraf `--glob` precedent).

## [x] B-049 — flaky: `@cg/caspar-client` `transport.test.ts` peer-disconnect times out under full-suite load ⟨priority: low⟩ — merged (#268, `adfabce`): the test now waits for `mock.amcpClientCount > 0` before closing (`transport.test.ts:141`), so the close can no longer race the mock server's `'connection'` handler. The branch this item was gated on has merged and the flake has not recurred; [[B-073]] (#297) later hardened the same socket/timer family. Confirmed shipped by the 2026-07-13 `[~]` audit

> **Root-caused + hardened (2026-07-10, `fix/B-038-B-048-reconnect-reconciliation`):**
> the test called `closeAllAmcpConnections()` immediately after
> `transport.connect()` resolved — but `connect()` resolves on the CLIENT's
> connect event, which under load can beat the mock server's `'connection'`
> handler registering the socket in its Set (`tools/amcp-mock/src/server.ts`),
> so the close destroyed NOTHING and the `close` event never fired (the same
> race the mock's own suite works around with a 10 ms delay before asserting
> `amcpClientCount`). Reproduced 2/2 under parallel turbo load on 2026-07-10;
> passes standalone. Fix: the test now waits for `mock.amcpClientCount > 0`
> before closing. Green through the branch's full uncached gate; flips `[x]`
> when that branch merges and the flake stays gone.

**Repro:**

1. Run the full suite: `pnpm --filter @cg/caspar-client test` (Windows,
   parallel test files).
2. Occasionally `AmcpTransport > emits "close" when the peer disconnects` times
   out (10 s).

**Expected:** deterministic pass.
**Actual:** timed out once during the B-044 uncached gate (2026-07-08); passes
3/3 in isolation (14/14 tests); the diff that surfaced it contained ZERO
transport changes.
**Env:** Windows 10, vitest 2.1.9, full-suite parallel run.
**Notes:** socket-close event timing under parallel-suite load — consider
serializing the socket-bound tests or a longer per-test timeout for the
peer-disconnect case.
**Triage (B-044 recovery, 2026-07-08):** this transport unit test is the ONLY
regression surfaced by that gate. The Designer pasteboard e2e some notes conflate
with it — `apps/designer/tests/e2e/scene-size-vs-pasteboard.spec.ts` (the
B-027/B-028 frame-page-vs-extent + Fit invariants) — was suspected but RULED OUT:
green 3/3 on `main` (`56015ab`) AND 3/3 at the pre-#251 commit (`76a9334`, uncached
rebuild), run isolated in a dedicated worktree on a private port. #251 (`b8ca72e`,
B-042) is grid-only and touches neither that spec nor its stage/extent surface (the
spec was last modified by #234/#184), so "healed by #251" is impossible by
construction — it was never broken. (B-044 itself is the CLOSED `[x]` runtime
pending-intent bug in `bugs-runtime.md`, not a designer e2e.) No invariant weakened
and no retry added; the designer-e2e timing-flake home remains [[B-011]] if one ever
surfaces there.

## [ ] B-050 — tooling drift: pnpm warns on every run — the `pnpm` field in `package.json` is no longer read ⟨priority: low⟩

**Repro:**

1. Run any `pnpm` command in the repo.

**Expected:** clean output.
**Actual:** every invocation prints
`The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.onlyBuiltDependencies"`
(observed throughout 2026-07-07/08 on pnpm 11.9.0).
**Notes:** align the root `package.json` with the new settings location (per
https://pnpm.io/settings — `onlyBuiltDependencies` moved to
`pnpm-workspace.yaml` in current pnpm); verify against the installed pnpm's
docs when fixing.

## [x] B-069 — docs housekeeping: B-056 is double-assigned across the bug files ⟨priority: low⟩ — merged (#297, `052863a`): reconciled via [b-number-registry.md](b-number-registry.md), now the source of truth for the number space. Resolved as DOCUMENTATION, not renumbering (the disposition this item's own owner-call asked for): both B-056 entries stay in place with a disambiguating note; nothing was renumbered and no archived history was rewritten. [[B-075]] later made the rule enforceable in CI. Confirmed shipped by the 2026-07-13 `[~]` audit

> **Resolved as documentation, not renumbering** — exactly the disposition this item's own
> owner-call below asked for. [b-number-registry.md](b-number-registry.md) is now the source of
> truth: it records the audited state of the number space (on merged `main`, `B-056` is the
> **only** ambiguous number — every other number names exactly one bug), keeps both B-056 entries
> in place with a disambiguating note, and recommends (does not enforce) a way to stop the
> in-flight collisions recurring. Nothing was renumbered; no archived history was rewritten.

**Repro:**

1. `grep -rn "^## \[.\] B-[0-9]\+" docs/prd/` and look for a repeated number.
2. Two different bugs both hold **B-056**:
   - [bugs-designer.md](bugs-designer.md) — "can't add a SMOOTH point to a finished path (segment insert is corner-only)" (merged #272, `523d5d5`, archived).
   - [bugs-runtime.md](bugs-runtime.md) — "`load()` proceeds when the adopt-CLEAR didn't land on the PRIMARY: an unadopted live orphan can render under an owned slot with no UI tell" (merged #287, `0ebf4ff`, archived).

**Expected:** `B-` numbers are GLOBAL across the three bug files and never reused (see the note at the top of this file and `README.md`), so each number names exactly one bug.
**Actual:** `B-056` names two. There is a small irony in the history: the designer bug was ITSELF renumbered (from B-054) to "the next free number" when #273 concurrently took B-054 for a runtime bug — and #287 later took B-056 for the runtime occupancy bug, re-colliding.
**Env:** Docs only. Present on `main`; predates and is unrelated to D-119 (found 2026-07-13 by the duplicate-number audit run during D-119's B-066→B-068 renumber, which is itself clean).

**Notes — COSMETIC / HISTORICAL, deliberately not fixed now (owner call, 2026-07-13):** both entries are merged, archived and `[x]`, so nothing is blocked and no live work is ambiguous. Renumbering a closed bug ripples into archived change dirs (`openspec/changes/archive/…`), commit/PR text, and code comments that cite the old number, which is not worth doing mid-flight. Clean up in a future housekeeping pass IF ever — and if so, prefer leaving BOTH historical numbers in place with a disambiguating note over rewriting archived history. Meanwhile the "next free `B-` number" rule is unaffected: pick from the global max (B-069 at filing).

**Regression test:** none (docs). The duplicate-number audit is the check — match only the number that OPENS each heading, or trailing prose (the B-056 heading itself cites "renumbered from B-054") produces false hits:

```bash
grep -rhoE "^## \[.\] B-[0-9]+" docs/prd/ | grep -oE "B-[0-9]+" | sort | uniq -d
```

It should print exactly one line — the known, accepted `B-056`. Anything else is a NEW collision and must be renumbered before merge (merged `main` numbers always win).

## [x] B-071 — turbo lint/build race: ESLint globs Vite's transient `vite.config.ts.timestamp-*.mjs` and dies with ENOENT ⟨priority: low⟩ — merged (#314, `5f5688b`): `vite.config.ts.timestamp-*.mjs` added to the GLOBAL-ignores block of `apps/designer/eslint.config.mjs` (the bare-`ignores` object, so it applies during traversal — a scoped `files`+`ignores` entry would not stop the glob), so the concurrent turbo lint/build race no longer ENOENTs `@cg/designer#lint`. Tooling only — no OpenSpec change, no source/runtime/export/schema change. Pinned by `apps/designer/tests/eslint-ignore-vite-timestamp.test.ts`, which asserts the BEHAVIOR via ESLint's own resolver (`ESLint#isPathIgnored` — lints nothing, so it stays fast) rather than shelling out to a full `eslint .` run; verified to FAIL without the ignore. (#315 was a duplicate no-op merge of the SAME head branch — empty squash `e01c23f`, byte-identical tree, 0 files changed; the code landed in `5f5688b`, so don't go looking for it there.)

**Repro:**

1. From a clean tree, run `pnpm turbo run typecheck lint test build` (or the narrower `pnpm turbo run lint build`).
2. Occasionally `@cg/designer#lint` fails with `ENOENT ... apps/designer/vite.config.ts.timestamp-*.mjs`.
3. Rerun the same command — it passes. Non-deterministic; timing-dependent.

**Expected:** lint is deterministic and passes. Run on its own (`pnpm --filter @cg/designer lint`) it is clean — 0 errors.
**Actual:** turbo runs `build` and `lint` **concurrently**. Vite writes a transient `apps/designer/vite.config.ts.timestamp-*.mjs` while loading its config during `build`, and deletes it immediately after. ESLint's glob can enumerate that file and then try to read it after it's already gone → `ENOENT` aborts the lint job. Nothing is wrong with the source; the failure is purely a filesystem race between two concurrent turbo tasks.
**Env:** Monorepo tooling (turbo + Vite + ESLint). Not app-specific and not browser-specific. Present on `main`; observed 2026-07-13 during [[B-068]]'s green gate.

**Notes — proposed fix direction (NOT implemented here):** add the transient pattern to `apps/designer`'s ESLint `ignores` (e.g. `vite.config.ts.timestamp-*.mjs`, or the broader `*.timestamp-*.mjs`), or otherwise stop lint from globbing build-time transients. This is a **tooling fix — no OpenSpec change** and no source/runtime behavior change; it touches `apps/designer`'s eslint config only. Deliberately filed rather than fixed inline, since it is unrelated to the change that surfaced it.

**Regression test:** a lint run over a tree that contains a stray `apps/designer/vite.config.ts.timestamp-x.mjs` must not fail — drop such a file in, run `pnpm --filter @cg/designer lint`, and expect 0 errors (today it reports the file / races on it).

## [x] B-073 — the recurring test-flakiness family: socket/timer integration reds under parallel CPU load + an E2E that silently tests a STALE build ⟨priority: high⟩ — merged (#297, `052863a`): the socket/timer integration suites no longer hang wall-clock budgets on SETUP under a starved box, and the E2E can no longer silently pass against a STALE build. Confirmed shipped by the 2026-07-13 `[~]` audit

Filed here (not in the app files) because the family spans `@cg/caspar-bridge`,
`@cg/caspar-client` and the Playwright tooling. [[B-071]] (turbo/vite lint race) is a
sibling: same shape — green code, red CI, nothing wrong with the source.

**Repro (cluster 1 — socket/timer integration):**

1. Load the box so the vitest forks are genuinely starved (this is the whole point — an
   idle machine will NOT reproduce it): `node -e "const{Worker}=require('node:worker_threads');const s='const u=Date.now()+3e5;while(Date.now()<u){Math.sqrt(Math.random()*1e9)}';for(let i=0;i<24;i++)new Worker(s,{eval:true})"`
2. `pnpm turbo run test --filter=@cg/caspar-bridge --filter=@cg/caspar-client --force`, 3×.
3. On `main` (pre-fix) **2 of 3 runs went red**; the same runs pass on an idle box.

**Expected:** both suites pass isolated AND under full parallel `pnpm test`, repeatably.
**Actual (pre-fix):** nondeterministic reds, always the SAME signature —
`Error: declared CasparCG server(s) did not reach HEALTHY in time` — in
`pending-update-completion.integration.test.ts` and `setconfig-serve-restart.integration.test.ts`.

**Root cause — wall-clock budgets on SETUP, not a leak.** Reaching `healthy` is
`connect → AMCP handshake → 150 ms resync` (`RESYNC_MS = 150`), and the handshake's own
`VERSION` timeout is **1 s**. On a contended fork one missed round-trip costs a timeout
**plus** a backoff **plus** a whole reconnect cycle — two of those blow the `whenServerHealthy(5000)`
budget the tests hardcoded. None of those tests is asserting "the handshake completes within
5 s"; health is _setup_. The 5 s ceiling encoded "and this box schedules promptly", which a
loaded CI box does not.

A second, independent defect in the same family: **cleanup an assertion can skip.** Many
tests bound a server/socket/`setInterval` and released it on the _trailing lines_ of the test
body, so the first failing `expect` leaked a listening server, a TCP socket, or a live
`HeartbeatService` interval for the rest of the fork — turning one honest red into a cascade
of unrelated ones.

**Ruled out (measured, not assumed):** the `freeUdpPort()` TOCTOU (bind :0 → close → hand the
number out). It _looks_ like the classic leaked-port race, but a 1000-cycle alloc→bind churn
measured **0 EADDRINUSE** — Windows does not immediately recycle a just-closed ephemeral port.
No fix was made on that theory.

**Repro (cluster 2 — Designer clock/sequence E2E, "2→1→0 failures across identical runs"):**
`reuseExistingServer: !process.env.CI` meant every local run silently adopted **whatever** was
already listening on the port — including an orphaned `vite preview` still serving an **older
`dist/`**. The suite then tested stale code, so the same commit passed or failed depending on
which server happened to be up. Not a timing bug at all.

**Fix (all test-infra; no on-air behavior, no AMCP verbs, no quoter/escaping):**

- `HEALTH_MS = 15_000` (`tools/caspar-bridge/tests/support/harness.ts`) replaces every hardcoded
  `whenServerHealthy(5000|6000|15000)`. A liveness bound, not a performance assert — a server
  that never goes healthy still fails, just later and with the right message.
- `testTimeout` 10 s → 45 s (bridge) / 30 s (client): the old default sat _below_ the internal
  budgets several tests already spend, so a contended fork hit the _test_ timeout before its own
  assertions could speak.
- `track(resource, release)` in both suites' `tests/support/harness.ts`: registers the release at
  **creation** time and runs it from `afterEach` (LIFO), so cleanup cannot be skipped by a failing
  assertion. Applied to every server/socket/agent/queue/heartbeat bound inside a test body.
- `BOUNDED_STOP_MS = 5_000` replaces `expect(elapsed).toBeLessThan(1000|1500)`. The property is
  "`stop()` is bounded, not wedged" — the wedge it guards would hang forever, so any finite ceiling
  proves it; the old ones also asserted machine speed.
- `server-restart-retake`: fixed `delay(150)` → the mock's real `traceFlush()` write barrier (a
  truncated NDJSON read was misaligning offset-based slicing).
- `single-server`: the "no health churn" assert now compares consecutive published values instead
  of counting events in a 1.5 s wall-clock window — a starvation flap is a _distinct_ value and is
  correctly ignored; the B-046 phantom loop (a **redundant, identical** publish) is still caught.
- Playwright (both apps): `reuseExistingServer` now defaults **off** (`PW_REUSE_SERVER=1` opts back
  in). Every run gets a fresh preview of the build turbo just produced, and `--strictPort` turns an
  occupied port into a LOUD failure instead of a silent stale serve.

**Verification:** under the identical 24-hog starvation that reddened 2 of 3 baseline runs, the
post-fix suites are **3/3 green** (bridge 87 tests / 24 files, client 246 tests / 19 files), both
isolated and under the parallel run. Note the flake is probabilistic — 3/3 green is the agreed bar,
not a proof of absence; the causal fix for the one observed signature is what carries the claim.

## [x] B-075 — nothing stops a duplicate B-number from being MERGED: the global-uniqueness rule was enforced only by remembering to run the audit ⟨priority: low⟩ — merged (#299, `1ff6b4b`): the gate now FAILS on a duplicate `B-` number, so the global-uniqueness rule is enforced by CI instead of by remembering to run a `grep`. Prevention only — a merged collision still cannot be cheaply undone (see [[B-069]] and the standing `B-056` owner call). Confirmed shipped by the 2026-07-13 `[~]` audit

**Repro:**

1. On a branch, add a bug heading reusing a `B-` number that already exists in another bug file
   (exactly what happens when two branches each read "the next free number" from a different
   snapshot of `main`).
2. Run the full gate: `pnpm turbo run typecheck lint test build`.

**Expected:** the gate fails — a `B-` number names exactly one bug, globally, forever.
**Actual (pre-fix):** everything is green. The rule lived in prose (the note at the top of this
file, `README.md`, [b-number-registry.md](b-number-registry.md)) and in a `grep` someone had to
remember to run. **Five collisions happened in a single session.** Every one was caught by hand
and renumbered before merge — which is the ONLY reason `main`'s number space is clean — but
nothing made that guaranteed.
**Env:** Docs/tooling. Not app-specific.

**Why this matters more than it looks:** an IN-FLIGHT collision is cheap (renumber the branch).
A MERGED one is not — renumbering a closed bug ripples into archived change dirs, commit/PR
text, and code comments that cite the old number, so the standing owner call is to leave it
alone and disambiguate by file (see [[B-069]] and the `B-056` pair). Prevention after the fact
is not available; the only lever is to never merge one.

**Fix — DETECT, not prevent (the trade-off recorded in [b-number-registry.md](b-number-registry.md)):**
`tools/soak-runner/tests/bug-number-audit.test.ts` runs the duplicate audit as a real test in
the ordinary `turbo run test` gate. It matches only the number that OPENS a heading
(`^## [x] B-NNN`) — matching anywhere in the line produces false hits, since headings
cross-reference other bugs — and fails naming the offending number and both files that claim it
(`B-067 claimed by 2: bugs-designer.md + bugs-runtime.md`). Filed here rather than as per-track
number bands: bands renumber the future and still don't stop two branches on the SAME track.

`B-056` is the one allowlisted exemption (dual-owned, both merged + archived), and a second
assertion pins that the allowlist cannot go stale — if that duplicate is ever resolved, the
exemption must be dropped rather than left as a blanket hole that would hide a future collision
on the same number.

**Regression test:** the guard is its own regression test — injecting a duplicate heading turns
it red (verified), and removing it turns it green.

## [ ] B-076 — nothing enforces that a MERGED fix flips its PRD item to `[x]`: shipping a fix and closing its item are two separate acts, and the second is routinely skipped ⟨priority: low-medium⟩

Sibling of [[B-075]], same shape and same lesson: a rule that lives only in the workflow prose is
a rule that silently rots. B-075 made B-number **uniqueness** enforceable in CI; nothing makes
item-state **closure** enforceable, so the backlog drifts out of sync with the code.

**Repro:**

1. Fix a bug on a branch, mark its PRD item `[~]` ("implemented, not yet archived"), and cite the
   branch in the heading — the house style, e.g. `— fixed on \`fix/test-infra-batch\``.
2. Merge the PR. The fix is now on `main`; the code, tests and E2E all ship.
3. Run the full gate: `pnpm turbo run typecheck lint test build` + `pnpm format:check`.
4. Never come back to flip the item.

**Expected:** the gate fails — a `[~]` item whose fix is already merged into `main` is a lie about
the state of the repo, and should be impossible to leave sitting there.

**Actual:** everything is green, forever. The item stays `[~]` (and any unarchived OpenSpec change
dir stays unarchived) with nothing to notice or complain. `[~]` means _"implemented, not yet
archived"_ — **not** _"in progress"_ — so a stale `[~]` reads exactly like open work.

**Why this matters (it is not bookkeeping):** the backlog is what we pick work from. A shipped item
still marked `[~]` gets picked up as if it were open — we have repeatedly started work on things
that were already merged, and the only thing that catches it is a human noticing mid-task. The
2026-07-13 `[~]` audit (PR #304) had to reconcile **~10 items by hand**: B-003, B-049, B-051, B-052,
B-068, B-069, B-073, B-074, B-075 and D-110 had all shipped and merged, and two OpenSpec change dirs
(`fix-pen-path-style-commits`, `add-path-morph`) sat unarchived with their spec deltas never folded
into the living capability. That audit is exactly the manual `grep` B-075 replaced with a test —
this item asks for the same move, one level up.

**Env:** Docs/tooling/CI. Not app-specific.

**Notes / proposed direction (NOT implemented — this is the filing):**

Mirror B-075's disposition: **DETECT, not prevent.** A pre-merge check that fails the gate when an
item's cited fix is already on `main` but the item is still `[~]`. Sizing is a small-to-medium
tooling task (a real test in the ordinary `turbo run test` gate, next to
`tools/soak-runner/tests/bug-number-audit.test.ts`), not a docs fix.

The design question is **how an item cites its shipping fix**, because the check can only be as
reliable as the citation it parses. Today's headings use at least three shapes:

- `— fixed on \`fix/test-infra-batch\`` (a BRANCH name — B-073 / B-074 / B-075 pre-flip)
- `— merged (#293, \`aede129\`)` (a PR number + commit — the post-flip house style)
- `— \`openspec/changes/add-path-morph\`` (an unarchived CHANGE DIR — D-110 pre-flip)

Three candidate signals, in rough order of robustness:

1. **Change-dir state (most reliable, zero new convention).** A `[~]` item citing
   `openspec/changes/<name>` where that dir no longer exists under `openspec/changes/` (it moved to
   `archive/`) is unambiguously due a flip. Likewise a `[~]` item whose change dir still exists but
   whose `tasks.md` is 100 % checked is due an archive. Both are pure filesystem facts.
2. **A commit on `main` citing the B-number.** Grep merged `main`'s log for the item's number; if a
   commit on `main` claims to fix `B-NNN` and the item is still `[~]`, flag it.
3. **Branch ancestry — TRAP, do not rely on it naively.** "Is the cited branch merged into `main`?"
   fails under **squash-merge**, which is what this repo does: during the audit, `d9a82de` and
   `487cd74` (the real branch commits for B-075 / B-073) are **NOT** ancestors of `main`, while
   their squashes `1ff6b4b` / `052863a` are. A `git merge-base --is-ancestor <branch> main` check
   would therefore report "not merged" for work that shipped weeks ago and pass a stale item
   straight through. Any branch-based signal must resolve the squash, or be dropped.

**Hard constraint — the guard must read ONLY current-state assertions (paid for three times,
recorded 2026-07-20).** An entry BODY is not a set of live claims. It is a mixed document that
routinely contains text deliberately written to state something that is no longer, or was never,
true — and a naive scan over the body false-positives on all of it. Three real instances, each
of which has already misled a reader or a session:

- **Quoted rejected text.** [[B-089]]'s provenance block QUOTES the false verification claim it
  exists to repudiate — the words "`gate:e2e` green on WSL" appear in the entry precisely
  because they were wrong. A scan matching that string concludes the opposite of what the
  paragraph says.
- **Dated changelog status.** [[B-041]]'s "Progress / corrections" section records each attempt's
  status AS OF ITS DATE. Its 2026-07-07 bullet says a 2.3.x hardware pass "remains the gate
  before B-041 closes"; that gate was discharged on 2026-07-13 and the item is `[x]`. The
  sentence is accurate history and a false live claim at the same time.
- **Stale section headers.** That same section is headed "**Progress / corrections (stays
  `[~]`):**" while the item's heading reads `[x]`. The header was true when written and was
  never revisited, because it describes the log rather than the bug.

So: **exclude quoted text (block quotes, and prose inside `"…"` that is being cited rather than
asserted) and exclude dated changelog sections from any status signal. The heading's current
marker is the authoritative status of the item — a body sentence never overrides it.** A guard
that cannot make that distinction reliably should parse ONLY the heading line, which is the
argument for putting the canonical machine-readable citation there (see below). This is also why
the on-air-validation-owed marker introduced for [[C-014]] lives on the HEADING and not in the
body: the heading is the one line whose contents are always a present-tense claim.

**Corollary — anchor the marker grep to a heading.** That marker is deliberately NOT written out
literally in this paragraph, because doing so would make a bare `git grep` for it return this
prose alongside the real hit. The robust query is heading-anchored — `^## .*<the marker>` — and
the same applies to any future token: a scan for a status marker must require the line to be a
heading, or the documentation of the marker becomes a false positive for the marker itself. This
paragraph was written, caught by its own rule, and reworded.

Likely the check wants ONE canonical, machine-readable citation on a `[~]` heading (decide the
shape when scheduling — a PR number is the most stable thing that survives squashing) rather than
parsing all three shapes above. Whatever is chosen, the existing headings need a one-time
normalisation pass, and that pass is most of the work.

**Open call for whoever takes it:** decide whether the check also enforces the OpenSpec half (an
unarchived change dir whose tasks are all `[x]`), or whether that stays a separate guard. They are
the same defect wearing two hats — the audit found both together — but they fail in different
places (`docs/prd/*.md` vs `openspec/changes/`).

**EVIDENCE (2026-07-19) — the open call is answered empirically: it SHOULD cover the OpenSpec
half.** An archive sweep found FOUR changes simultaneously in the exact state the open call
describes — merged into `main`, tasks complete, change dir never archived, PRD item still `[~]`:
[[B-093]] (#355), [[B-094]] (#356), [[P-009]] (#363) and [[C-014]] (#368). Two of them had sat
that way for days while later work merged straight past them. The two hats are not merely the
same defect in theory; here they failed together, in one batch, four times over — and neither
hat's absence was noticed by anything automated. A guard covering only `docs/prd/*.md` would have
caught the same four, but only after someone thought to look; the unarchived dirs are the more
visible symptom because `openspec/changes/` is a short list a human actually scans. Cheapest
useful shape: assert that no `openspec/changes/<name>/` (excluding `archive/`) has all-`[x]`
tasks AND a merged cited PR. (Recorded as evidence only — the guard is deliberately NOT
implemented in that sweep's commit.)

**Regression test:** the guard is its own regression test (the B-075 precedent) — a `[~]` item
whose cited fix is merged turns it red; flipping that item to `[x]` turns it green.

## [~] B-098 — the `@cg/caspar-bridge` suite reds under full parallel `pnpm test` while passing in isolation: `did not reach HEALTHY in time` at the 15 s bound [[B-073]] raised ⟨priority: medium⟩

**Fix applied 2026-07-23** (`platform-gate-test-bound`, PR #TBD) — bound the fan-out to the
host, do not raise a timeout. Root cause finally MEASURED, not inferred: `pnpm gate` / `pnpm
test` fan out through turbo (~10 concurrent `test` tasks under `--force`) and every task's
`vitest run` defaults to `pool: 'forks'`, `maxForks = availableParallelism - 1` = **7** on
this 8-core box, because not one of the 19 `vitest.config.ts` sets a pool option (resolved
each config via vitest's Node API to confirm: all `pool: 'forks'`, `poolOptions.forks: {}`).
Sampling `turbo run test --force` measured a **peak of 64 concurrent node processes on 8
cores — 8× oversubscription**, sustained across the middle of the run. That is the
starvation this entry's isolation-asymmetry always implied.

The fix caps BOTH multipliers so their product fits the machine — the invariant
`taskConcurrency × forksPerTask = maxTestWorkers ≤ cores`, which on 8 cores resolves to
**3 tasks × 2 forks = 6 workers** (75% utilisation, 2 cores of headroom for the vitest
parents / pm shims / turbo / coverage merge). A new pure module
`tools/gate-hook/src/test-concurrency.mjs` computes it (unit tests assert the invariant
across 1–128 cores — the invariant, not a green streak, is the proof, since the unbounded
gate also passes on an idle box); a thin launcher `bounded-turbo-cli.mjs` runs turbo with
the computed `--concurrency` and vitest's own `VITEST_{MIN,MAX}_{FORKS,THREADS}` caps in the
child env; `turbo.json` `passThroughEnv` lets those survive strict env mode; `gate`, `test`
and `test:integration` route through it. No test, timeout or product source was touched. Same
mechanism as [[B-095]]/#360 (`gate:e2e --concurrency=1`), adapted to the larger main-gate
graph with a tuned cap rather than full serialisation. **Result: peak node 64 → 19, gate
green across 5 back-to-back uncached runs (222/213/171/171/171 s vs a 203 s unbounded
baseline — no wall-clock cost; the 64 processes were thrashing, not doing more work).**
`gate:e2e` untouched (its `--concurrency=1` is explicitly preserved) — no Linux e2e run owed. Remaining to reach `[x]`: owner confirms the
flake stays gone across subsequent real-use runs.

**Evidence gathered 2026-07-23 (the fix session).** Five afternoon occurrences under the
unbounded gate, spanning THREE workspaces: `@cg/caspar-client` (amcp-probed-liveness),
`@cg/caspar-bridge` (stop-verb, update-producer-state, reconnect-reconciliation), and
`@cg/single-file-export`. The last is the clincher for CPU-starvation over any resource
collision: it uses **no amcp-mock, no HEALTHY bound, no fixed ports**, so a port/socket
theory cannot explain it, yet it starved like the rest. Temporal signature matched a load
margin, not a defect: green back-to-back in the morning, ~5 of 7 red in the afternoon with
the machine idle between runs and no code change between. Structural bound now measured:
64 concurrent workers wanted → capped to 6, verified 19 peak node processes (3 the editor's)
under the fix. Hypothesis A (CPU starvation) CONFIRMED; hypothesis B (fixed-port collision)
RULED OUT.

**Repro:** run the full parallel `pnpm test` (every workspace at once) on a local dev box.
Observed **four times in one session** (2026-07-19). It does not reproduce when the workspace is
run alone.

**Expected:** the standing rule this suite is already held to — **both suites pass isolated AND
under full parallel `pnpm test`, repeatably** ([[B-073]], the `Expected:` line of its cluster-1
repro above).
**Actual:** `Error: declared CasparCG server(s) did not reach HEALTHY in time`. Note the shape:
this is a **timeout, not a failed assertion** — the 15 s `HEALTH_MS` liveness bound
(`tools/caspar-bridge/tests/support/harness.ts:29`) expiring, so it carries no information about
correctness. In isolation the same suite passes **36/36** (and **139/139** on an earlier run in
the same session), and it passed on every re-run.
**Env:** local Windows dev machine; `turbo run test` with vitest v8 coverage, `fileParallelism`
forks unbounded.

**Not the code under test.** Neither branch live in that session touched `tools/caspar-bridge` at
all. The suite is red only as a function of what else is running beside it.

**Why it matters — it now costs PUSHES, not just gate runs.** Since P-009 the gate is enforced by
the pre-push hook, so a contention red is no longer a re-runnable annoyance: it blocks the push
until someone re-runs it and guesses that the failure was environmental. That is the same
"innocent suite named by a contention failure" tax [[B-097]] charges, arriving at a worse moment.

**Family — and why this one is a RECURRENCE, not a new member.** [[B-073]] is the direct ancestor:
same workspace, same `did not reach HEALTHY in time` signature, same parallel-load trigger. Its fix
**raised** the bound (`HEALTH_MS = 15_000` replacing hardcoded 5–6 s budgets) and cleared 3/3 green
under a 24-hog starvation — explicitly logging that "3/3 green is the agreed bar, not a proof of
absence". This is that **raised bound now being blown in turn**, which is the useful signal:
bound-raising is exhausted as a remedy, because there is no ceiling that both tolerates a starved
box and still catches a genuine hang. Distinct from its siblings by lever — [[B-095]] is
inter-suite Playwright starvation, [[B-097]] is two gate invocations sharing one filesystem path,
[[B-078]] is port/process collision. This is CPU starvation of one vitest workspace by the rest of
the parallel run.

**Fix direction (NOT implemented here) — bound the concurrency, don't raise the timeout.** The
precedent is [[B-095]]'s fix (#360, `5cb16c7`): it stopped `gate:e2e` starving itself by
serialising at the gate level (`--concurrency=1`), rather than by tuning per-spec timeouts, which
was rejected there for papering over contention and desensitising the specs — the same objection
applies to raising `HEALTH_MS` again. The bridge's `vitest.config.ts` already carries B-073's note
that "the suite runs `fileParallelism` forks that contend for the CPU", but bounds only
`testTimeout`/`hookTimeout`, never the fork count. Candidates: `poolOptions.forks.maxForks` (or
`fileParallelism: false`) in `tools/caspar-bridge/vitest.config.ts`, and/or bounding this workspace
against the rest of the run the way `gate:e2e` now is. Prefer whichever fixes the CLASS — these are
socket + timer integration tests whose setup cost is irreducible, so they need a CPU share, not a
longer rope.

**Contention, not a cleanup gap — the one line of evidence gathered so far.** The obvious
alternative cause is a leaked port/socket/server from a prior test. Checked read-only and
**ruled out as the likely cause**: this suite does not rely on `try/finally` (or on
trailing-line) cleanup at all. `tools/caspar-bridge/tests/support/harness.ts:56-74` registers every
release at **creation** time via `track()` and drains them LIFO from `afterEach`, so cleanup "runs
from `afterEach` no matter how the test exits" (`:11-12`) — a discipline B-073 introduced precisely
because a failing `expect` could skip a trailing-line release. A release that itself fails throws an
`AggregateError` rather than passing silently. So the cleanup path is stronger than the repo's
`try/finally` rule, not weaker, and a leak is unlikely to be what starves the handshake.

**Evidence still OWED (not gathered — this session had no Linux/WSL box).** The measurements that
would settle it: the suite run ISOLATED 5× vs under full parallel `pnpm test` 5×, pass/fail each;
`ss -ltnp` before/after each failure; the failing test file + name; the elapsed time to the timeout
against the `HEALTH_MS` value in force. Until those exist, "contention" is the leading hypothesis
carried by the isolation asymmetry and the B-073 precedent — **not** a measured conclusion. The
counts above (4 occurrences; 36/36 and 139/139 isolated) are as REPORTED from the session that hit
it, not re-measured here.

**Evidence gathered 2026-07-22 (the B-101 session) — part of the owed list, now on record.** The
failing test: `stack-survives-bridge-restart.integration.test.ts` → "FROZEN: the ORDINARY load
path still adopt-CLEARs, and a live bridge is never clobbered". Shape: timeout from
`whenServerHealthy` (`caspar-runtime.ts:536`), file elapsed ~16.9 s against `HEALTH_MS = 15_000`
— a healthy-climb timeout, not an assertion. Rates that session: isolated 5/5 green (154/154
each); full parallel gate 5 green, 2 red. Consistent with the CPU-starvation hypothesis;
bound-raising remains rejected per this entry's own text. Still owed from the list above:
`ss -ltnp` before/after each failure (no Linux/WSL box that session either).

**Regression test:** run the full parallel `pnpm test` under deliberate load (B-073's 24-worker hog
one-liner is the established harness) and assert `@cg/caspar-bridge` is green repeatably — with the
bound in place it should not depend on what else is scheduled. As in B-073, treat N/N green as the
agreed bar rather than a proof of absence; the causal fix is what carries the claim.

## [x] B-097 — `pnpm gate` is not safe to run twice concurrently in one workspace: vitest's shared coverage tmp dir produces an ENOENT that reads as a code defect ⟨priority: medium⟩ — fixed by [[P-013]]'s host gate lock (#395); owner confirmed no recurrence in real use, 2026-07-23

**Repro:** trigger two gates in the same workspace at once. Observed 2026-07-19: a backgrounded
`git push` ran the husky pre-push gate while a second full gate started in the same worktree —
`$ vitest run --coverage` appears twice in one log.
**Expected:** either the second gate waits, or both complete independently.
**Actual:** a bare `ENOENT` on `coverage/.tmp/coverage-<n>.json` fails an unrelated suite
(`single-file-export` observed):
`Error: ENOENT: no such file or directory, open '…/packages/single-file-export/coverage/.tmp/coverage-1.json'`.
Every implicated suite passes in isolation.
**Env:** local Windows dev machine; `turbo run … test` with vitest v8 coverage enabled per package.

**Why it matters:** the failure names an INNOCENT suite and looks exactly like a product
regression, so it costs a full diagnostic cycle before contention is even suspected. The same run
also starved a timing-sensitive bridge integration test, which compounds the misdirection — two
unrelated-looking failures, one cause.

**Family:** third member of the resource-contention family, and a DISTINCT root from the other
two. [[B-078]] is port/process collision; [[B-095]] is inter-suite starvation inside `gate:e2e`
(two Playwright suites × N workers). Neither is about **two gate invocations sharing one
filesystem path** — that is this bug. Not a duplicate of either.

**Fix direction (not implemented here):** scope vitest's coverage tmp directory per run (e.g. a
run-unique `coverage.reportsDirectory` / tmp path), or take a lock in the `gate` script so a second
invocation waits rather than interleaving. Prefer the former — it fixes the CLASS rather than one
trigger, and leaves concurrent gates legitimately possible.

**Fixed by [[P-013]] (#395, `72487af`):** the host-wide gate lock took the SECOND option above —
a lock in the `gate` script so a second invocation waits — rather than per-run coverage-tmp
scoping. `pnpm gate` and `pnpm gate:e2e` now acquire this host's exclusive slot before running and
hold it for the whole gate, so the pre-push / Stop-hook double-fire (the exact 2026-07-19 repro:
one gate's `vitest run --coverage` appearing while another's does) can no longer write
`coverage/.tmp` concurrently — both gate entry points serialize through the one slot, and the
second WAITS rather than interleaving. This is a deliberate trade against the "prefer the former"
note: the lock serializes gates instead of making concurrent gates safe, which is aligned with the
standing "one gate per host" rule ([[P-013]], [[P-010]]) — concurrent gates were never wanted here.
The regression test below is therefore obsolete as written (it asserts two gates run at once); the
serialization itself is proved by P-013's two-process check. **Owner confirmed no recurrence in
real use (2026-07-23)** — alongside P-013's cross-worktree confirmation (a second gate WAITED for
the host slot) — hence the flip to `[x]`.
**Note:** this is a REPO fragility, independent of what triggers it. "Don't background the push"
is a mitigation (now recorded in `CLAUDE.md`), not the fix.

**Regression test:** run two `pnpm gate` invocations concurrently in one checkout and assert both
terminate on their own merits — neither dies on a missing coverage temp file.

## [x] B-095 — `pnpm gate:e2e` starves itself: both Playwright suites run concurrently and flake specs that pass alone ⟨priority: medium⟩ — merged (#360, `5cb16c7`) (files + fixes in one PR)

**Repro:** `pnpm gate:e2e` on the local machine (the ONLY authoritative E2E signal while CI is
billing-blocked, until ~Aug 1). The script runs `turbo run test:e2e` with no concurrency bound, so
the RUNTIME and DESIGNER suites execute at the same time — each with Playwright's local default of
half the logical cores (`workers: process.env.CI ? 1 : undefined` in both configs ⇒ 6 workers each
here) — 12 Chromium instances contending for one machine.

**Expected:** the gate is deterministic — a spec that passes in isolation passes under the gate.
**Actual:** three specs flake ONLY under the combined load, timing out at 30 s+ while passing in
isolation in ~2–7 s: `pasteboard-extent` (region tones), `repeater` (growth), and
`preview-blank-until-play`.
**Env:** local Windows dev machine, 12 logical cores; either suite alone is stable at 6 workers.

**Family:** sibling of [B-078](bugs.md) — same resource-contention family, but the OTHER lever:
B-078 is port/process collision and its 18-leg soak DISPROVED an intra-suite concurrency bound;
this is INTER-suite contention (two suites × 6 workers), which that soak never exercised (it ran
one suite). Not a duplicate: B-078 reproduces on CI with one suite; this reproduces only under the
local gate running both.

**Fix (this PR):** serialize at the GATE level — `--concurrency=1` on the `gate:e2e` turbo run, so
each suite runs alone at its full 6 workers. Per-spec timeout tuning was explicitly rejected: it
papers over contention and desensitizes the specs. Wall-clock trade measured in the PR (before:
both suites interleaved; after: sequential).

**Watch item:** `preview-blank-until-play`'s failure mode (the locator resolves, `cg-pending`
never clears) is consistent with the PLAY message being posted before the preview iframe's runtime
is ready, with no retry — load would merely expose that ordering, not cause it. If this spec
recurs after the concurrency fix, treat it as a REAL race to chase (the preview host's
play-vs-ready handshake), not a flake.

## [ ] B-078 — flaky: a Playwright E2E assertion fails intermittently on a LOCAL `pnpm gate:e2e` run — EITHER suite, in shifting tests (the B-073 family's remaining half) ⟨priority: high⟩ — **REPRODUCED UNDER MEASUREMENT 2026-07-27** (4 full runs on ONE commit; see that section). The remaining contention is INSIDE a single suite — Playwright's own unbounded per-suite worker count — because the previously-disproven cross-suite lever is ALREADY IN FORCE and the flake happens anyway. Two levers tried and rejected: a budget bump (REVERTED, #317) and a cross-suite concurrency bound (DISPROVEN by an 18-leg soak, 2026-07-14). "THE CONFOUND" below invalidated the CI-derived evidence gathered BEFORE 2026-08-08 but never the local gate (`pnpm gate:e2e` runs `--force`); as of 2026-08-08 the confound no longer applies to NEW CI runs either — `test:e2e` is `"cache": false`, so CI executes the suites for real (see the CONFOUND section).

**Repro:** (intermittent — 1 red in 12 observed full runs; not reproducible on demand)

1. `pnpm test:e2e` — turbo runs the **Designer and Runtime Playwright suites CONCURRENTLY**,
   each `fullyParallel`, alongside the builds.
2. On a contended box, one test loses the race.

**Expected:** 207 passed.
**Actual (observed 2026-07-14, on a branch touching ZERO designer files):**

```
@cg/designer:test:e2e:  Error: expect(locator).toBeAttached() failed
@cg/designer:test:e2e:  1 failed
@cg/designer:test:e2e:  206 passed
```

**Why it is a budget bug, not a product bug:** the page was fine and its 206 siblings passed —
the machine was busy. The Designer/Runtime Playwright configs allowed only **`expect: { timeout:
7_000 }`** and **`timeout: 30_000`**, with **`retries: 0`** locally, so a _correct_ assertion that
is merely LATE becomes a hard red. Not reproducible in isolation precisely because isolation
removes the contention: the suite passed 3/3 on the branch, 3/3 on clean `main` (turbo, `--force`),
and 3/3 on `main` in isolation. The failure is a property of the HARNESS under load, not of any
test's logic.

**Ruled out (do not re-diagnose these):**

- **Stale build / orphaned `vite preview`** — the other half of [[B-073]], already fixed:
  `reuseExistingServer` is off unless `PW_REUSE_SERVER=1`, and every repro run above was a fresh
  build with `--force`.
- **The libuv crash line** `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` is a RED
  HERRING — it appears in **passing** runs on clean `main`. It is Windows teardown noise, not a
  failure signal.
- **A product regression** — the branch that surfaced it changes zero designer files, and the
  designer references none of the schemas/channels it does change.

**Attempted fix — TRIED AND REVERTED (do not simply retry it):** #317 raised the BUDGETS in both
Playwright configs (`expect` 7s → 15s, test 30s → 60s, `webServer` 120s → 240s), by analogy with
[[B-073]]'s treatment of the socket/timer suites. It was **backed out**, for two reasons:

1. **It was never shown to help.** The original red never reproduced (0/12), so there was nothing
   to demonstrate a fix against — the bump was a plausible story, not a validated one.
2. **It correlated with NEW designer reds on CI.** With the bump in, CI failed
   `fit-on-open.spec.ts` (`zoom-readout` → `Received: ""`, in **730ms** — far too fast to be a
   timeout at all) and, on the merge run, `hidden-content-inert.spec.ts`. Different tests each
   run — the shifting-set signature. `main`'s own CI is 8/8 green with the ORIGINAL budgets, so
   the conservative move was to return the harness to the known-good configuration rather than
   ship an unvalidated change inside an unrelated PR.

**Re-attributed 2026-07-15 (see [[B-084]]):** the "NEW designer reds" above (the shifting-set
`fit-on-open` / `hidden-content-inert` failures, one at **730ms** — "far too fast to be a
timeout") are now best explained NOT as budget/contention flakes but as turbo's default
kill-on-first-failure: `turbo run test:e2e` cancels the Designer suite mid-run when the Runtime
suite fails, so the Designer suite reports a partial "interrupted" whose test name shifts run to
run. On that reading **#317 is exonerated** — those reds were kills, not Designer failures, and
the one real failure was B-072 (fixed by #319). B-084 adds `--continue=dependencies-successful`,
which removes this confound; the ORIGINAL 1-in-12 red here (a full `206 passed / 1 failed`, all
207 accounted for — not a truncated kill) is a separate, still-open contention flake. Re-evaluate
what remains of this bug once B-084 has landed and E2E runs to completion uncontaminated.

The reverted diff is recoverable from #317's history if someone wants to pursue it deliberately.

**Next lever (bound the CONCURRENCY) — TRIED AND DISPROVEN 2026-07-14. Do NOT ship it.**
The theory was: `pnpm test:e2e` runs BOTH Playwright suites at once under turbo on a 2-core
runner, so serialising them (`--concurrency=1`) or capping workers attacks the contention itself.
It was measured on the real 2-core runner and **the contention does not flake this suite**:

| arm                                               | co-tenant on the box     | designer wall time | designer result |
| ------------------------------------------------- | ------------------------ | ------------------ | --------------- |
| `serial` (the proposed bound, `--concurrency=1`)  | none                     | 4.7–5.5m (μ 5.3m)  | **6/6 green**   |
| `parallel` (today's config)                       | runtime suite once, ~35s | 5.5–5.8m (μ 5.7m)  | **6/6 green**   |
| `stress` (runtime suite LOOPED for the whole run) | 14 back-to-back runs     | 8.1–8.5m (μ 8.3m)  | **6/6 green**   |

18 legs, designer suite genuinely EXECUTING (not cached, see below), `--retries=0` so any hiccup
is a hard red instead of being masked by the gate's `retries: 1`. **3,762 test executions, zero
failures.** The `stress` arm proves the load really landed — sustained co-tenancy slowed the suite
by **+56%** (8.3m vs 5.3m) and it still passed 209/209. A bound cannot be shown to reduce a flake
that does not occur, so shipping one would repeat exactly the #317 mistake. Harness + evidence:
`.github/workflows/b078-soak.yml` (disarmed), CI run `29356423188`, branch
`fix/B-078-concurrency-bound-v2` (no fix, unmerged).

**REPRODUCED UNDER MEASUREMENT — 2026-07-27, locally on Windows (12 cores).** Four full
`pnpm gate:e2e` runs against ONE commit (`a82b200`, a branch touching ZERO files under
`apps/designer/`), during R-021 stage 3:

| run           | designer | runtime |
| ------------- | -------- | ------- |
| A             | 231 ✅   | 41 ✅   |
| B (Stop hook) | 4 ❌     | 1 ❌    |
| C             | 231 ✅   | 2 ❌    |
| D             | 3 ❌     | 41 ✅   |

Nine distinct tests failed at least once; **none failed in all three red runs**; both suites went
fully green at least once. Every failure was a timeout or element-not-found — never a wrong-value
assertion about behaviour (the ONE exception was a genuine isolation defect, filed separately as
[B-110](bugs-designer.md), which a worker cap would HIDE rather than fix). Run B's runtime failure
(`stage-inspector-edits.spec.ts:126`) and run C's (`context-menu.spec.ts` ×2) have zero overlap.
Re-run in isolation: the four designer failures pass **9/9 at `--workers=1`**;
`stage-inspector-edits.spec.ts` alone passes **8/8** — but at 13–28 s against 4–5 s when green,
one of them within 2 s of the 30 s test timeout.

**What is NEW here, and why it narrows the search:** `gate:e2e:run` is
`turbo run test:e2e --force --continue=dependencies-successful --concurrency=1`, so BOTH of this
entry's confounds were already neutralised in the runs above.

- **`--force`** — the turbo CACHE REPLAY that invalidated this bug's original denominator (see
  THE CONFOUND) does not apply. All four runs genuinely EXECUTED both suites.
- **`--concurrency=1`** — [[B-095]]'s shipped fix. The two suites were **never co-tenant**. So the
  lever this entry records as DISPROVEN (cross-suite serialisation, 18/18 green on a 2-core
  runner) is already in force **and the flake happens anyway**.

Therefore the remaining contention is INSIDE one suite, not between the two — which is exactly the
untried lever this entry's own closing line already named, and it is cleanly distinct from what the
soak disproved. The mechanism is unchanged from "Where the original red actually came from" below:
`workers: undefined` gives Playwright ~half the cores (**6 on this 12-core box**), `fullyParallel`,
`retries: 0`, all INSIDE turbo's `--concurrency=1`.

**ANOTHER OCCURRENCE — 2026-08-01, the Designer's multi-select group-drag spec** (recorded by the
`DEBT.md` sweep, `DEBT.md:1321`). `apps/designer/tests/e2e/multi-select.spec.ts:271` (D-054,
"group-drag keyframes an animated member at the playhead") failed one `gate:e2e` run with a 30 s
timeout on `getByTestId('multi-select-box').first()` — the selection box never appeared after
`clickCanvas` + `shiftClickCanvas`. Same signature as every occurrence above: **a timeout, not a
wrong-value assertion**, on a diff (`dev-pvw-white`) touching only `apps/runtime/**` and `DEBT.md`,
so the Designer could not import a line of it. Re-run alone **7/7 green**; the whole gate re-run
**22/22, 0 cached** (Designer 231, Runtime 52). The sweep entry independently reached this item's
family — it names "the B-073/B-098 contention signature" — without naming the item, which is why it
is folded in here rather than filed beside it. If it recurs, the useful direction is why the
selection box is slow to appear under load (`multiBoxes` is read immediately after the second click
with no settle), **not** a bigger budget — see the two FORBIDDEN answers below.

**Stated honestly: the resource is not identified.** Serial-green is consistent with contention but
does not name what is contended — and a sample taken while idle showed node+chrome at **1% of a
12-core box**, which argues against CPU starvation specifically. Candidates not yet separated: I/O
wait, memory pressure during `vite preview` + ffmpeg.wasm probes, or Windows process-creation cost
at 6 workers. Until one is measured, bounding workers is **class mitigation, not a fix** — "it went
away" is not a diagnosis (the [[B-098]] standard: root cause MEASURED, not inferred).

**THE CONFOUND — why this bug's HISTORICAL evidence base is unreliable (read this first).**

> **CORRECTED 2026-08-08 — this no longer describes CI, and the correction is stated before the
> original so nobody acts on the stale claim.** What this section used to assert, in the present
> tense, was that the `e2e` job "runs `turbo run test:e2e` **without `--force`**, so
> `@cg/designer#test:e2e` is usually a turbo **CACHE HIT**: the suite never executes and turbo
> replays a stale `209 passed (5.5m)` log" — and therefore that no CI run could be trusted as
> evidence. **That is now FALSE.** `test:e2e` is declared **`"cache": false`** in `turbo.json`, so
> the task is not cacheable and ALWAYS executes; a replay is not a thing that can happen to it.
> Confirmed on run **31252541925** (commit `a344cd2`, `ubuntu-latest`): turbo reported
> `20 cached, 22 total` — the 20 are the build graph, and the 2 uncached are precisely the two
> `test:e2e` tasks — while both suites streamed real per-test output, **designer 237 passed (7.7 m)**
> and **runtime 62 passed (2.1 m)**, 0 failed, 0 flaky. So a CI `e2e` result IS usable evidence
> now, and is what CLAUDE.md's discharge rule cites.
>
> **What still stands:** the historical census below, and every conclusion drawn from it. Runs
> recorded BEFORE the `cache: false` setting really were mostly replays, so the old green record
> remains a bad flake denominator and the `#317` reasoning below is still confounded. This section
> is corrected, not deleted, because the old numbers are why those conclusions were drawn.
> **B-078 itself stays OPEN** — the flake is a separate question from how its evidence was gathered.

Historical text, as measured at the time: the `e2e` job ran `turbo run test:e2e` **without
`--force`**, so `@cg/designer#test:e2e` was usually a turbo **CACHE HIT**: the suite never executed
and turbo replayed a stale `209 passed (5.5m)` log. Census of 12 recent parseable runs: the designer suite actually ran in
only **5**; the other 7 replayed the identical cached line. The `ci` job is the same — one green
`main` run executed **2 of 40** `test` tasks and replayed 38 (the whole `pnpm test` step: 32s).
Consequences:

- **"Not reproducible (0/12)" and "`main` is 8/8 green" are artifacts** — those runs mostly did not
  run the suite. The historical green record is not a flake denominator.
- **#317's "it correlated with NEW designer reds" is confounded.** #317 edited both
  `playwright.config.ts` files — and `playwright.config.*` is a turbo `test:e2e` **cache input**.
  Bumping the budgets therefore _invalidated the cache and forced the designer suite to actually
  execute_, probably for the first time in many PRs. The reds it "caused" were the suite finally
  running. This is corroborated by the red itself: `zoom-readout → Received: ""` **in 730ms** is
  far too fast to be a timeout, i.e. not a budget effect at all. #317 may have been reverted for a
  reason that does not exist.
- The contention IS real, just harmless: the runtime suite takes ~22s when the designer suite is
  cached but **34–37s when both truly execute** (+57%) — measurable CPU pressure, zero reds.

**Where the original red actually came from:** it was observed **locally on Windows**, where
`workers: undefined` gives Playwright ~half the cores (6 on a 12-core box) **per suite × 2 suites
concurrently**, plus the builds — a far heavier oversubscription than CI ever sees (CI is
`workers: 1` per suite). CI is not the environment that produced it.

**Still open because — CORRECTED 2026-07-27.** This line previously read "the one observed red has
never been reproduced under measurement". **That is now FALSE** and is rewritten rather than left
standing beside contradicting evidence: it reproduced four times in four runs on one commit, on the
local gate, with the cache confound defeated by `--force`. The entry is open because **the fix has
not been implemented** — not because the evidence is missing.

The observability point below is NARROWED, not withdrawn, because it was always about CI and CI is
unchanged: `pnpm test:e2e` (what `.github/workflows/pr.yml` runs) still carries neither `--force`
nor `--concurrency=1`, so `@cg/designer#test:e2e` still cache-replays there and CI still tells you
nothing about the real flake rate. Worth filing separately, unchanged: decide whether the E2E task
should be cache-exempt (`"cache": false`) or `--force`d on CI, at ~6 min/PR. The LOCAL gate no
longer has this problem — `pnpm gate:e2e` has run `--force` since [[B-095]]/#360.

**Env:** Windows, local (`retries: 0`, `workers: undefined`). CI is far less exposed —
`retries: CI ? 1 : 0`, `workers: CI ? 1 : undefined` — which is why this surfaces locally first.
**Notes:** same family as [[B-073]] but a DISTINCT instance: B-073 closed the stale-build vector
and the socket/timer _integration_ budgets; it never touched the Playwright _E2E_ assertion
budgets. Files: `apps/designer/playwright.config.ts`, `apps/runtime/playwright.config.ts`.
**Residual risk:** budgets reduce the failure probability, they do not prove it to zero. If it
recurs, the next lever is capping E2E worker count under turbo (bounding the concurrency itself)
rather than raising budgets further.

**NEXT LEVER — named, NOT implemented (2026-07-27).** It recurred, so this entry's own closing line
above is the direction: **bound Playwright's per-suite worker count to the host**, the same way
[[B-098]] bounds vitest's forks. The obvious shape is to reuse the existing
`tools/gate-hook/src/test-concurrency.mjs` (`resolveTestBound`) — it already computes a host-fitted
bound for the unit gate — and feed it to Playwright's `--workers`, rather than inventing a second
bound that can drift from the first. Deliberately NOT implemented here: this filing is evidence, and
the resource is still unidentified (above), so a cap ships as mitigation and must be labelled as
such, not as a root-cause fix.

**Two answers that are FORBIDDEN, both already tried here:**

- **Raising a timeout.** CLAUDE.md states it directly: "do NOT answer a contention red by raising a
  timeout — B-073 already did that and B-098 is that bound blown in turn. The fix is the bound; a
  longer rope is not." This entry independently tried it — #317's budget bump — and **REVERTED** it.
- **Deleting, skipping or loosening the affected tests.** Every failure above is a correct assertion
  arriving late; the tests are not wrong.

**Why [[B-098]] did NOT already cover this** (the reason this surface was left uncovered): that
change's own task 7.4 records `gate:e2e` as NOT owed — "the change alters unit/integration
parallelism only, not e2e; `applyConcurrencyFlag` leaves `gate:e2e`'s `--concurrency=1` intact". So
B-098 bounded turbo's task concurrency and vitest's fork count; **Playwright's own worker count was
never in its scope**, and `fullyParallel: true` at 6 workers sits INSIDE that untouched
`--concurrency=1`. `pnpm gate` staying green throughout is the B-098 bound holding on its own
surface. This is a SIBLING surface, not a B-098 regression.

**Priority RAISED medium → high (2026-07-27), reasoning recorded both ways.** For: it now sits on
the critical path of queued work — a self-hosted Linux runner is being stood up specifically to
discharge the nine-item Linux `gate:e2e` backlog, and while GitHub Actions billing is out the local
gate is the ONLY landing gate. _(CORRECTION 2026-08-08: that second clause has lapsed — CI is back
and runs on every push to `dev`, so the Linux backlog is dischargeable from CI and a self-hosted
runner is no longer on the critical path for it. The FIRST clause — that this flake sits on the
critical path of queued work — is unaffected, and the `workers: undefined` trap below applies to
any hand-run `pnpm gate:e2e` exactly as written.)_ If those Linux runs are invoked the way CLAUDE.md describes the debt
("a Linux/WSL run is still owed", i.e. a hand-run `pnpm gate:e2e`), then `CI` is UNSET,
`workers: undefined` applies on that box too, and the Linux runs will be exactly as untrustworthy as
the Windows ones — leaving the backlog undischargeable in practice. Against, recorded so the call
can be revisited: this is a HARNESS defect, not a product or on-air one, and it is **conditional on
invocation** — a self-hosted GitHub Actions runner sets `CI=true`, which gives `workers: 1` and
`retries: 1` and largely blunts this mechanism. If the Linux backlog is discharged through Actions
rather than by hand, the escalation argument does not apply and this should fall back to medium.
[[B-073]]'s bar applies to any future fix: N/N green is the agreed bar, not a proof of absence.

## [x] B-084 — a green CI tick can hide a failure: critical gate tasks CACHE-HIT (never execute) or get KILLED by a sibling, so the check passes without ever running to a real verdict ⟨priority: high⟩ — merged (#328, `7826a88`)

Sibling of [[B-075]]/[[B-076]], same lesson one level deeper: a gate that _looks_ green is
trusted as if it ran. Three independent holes let a task report success without producing a
real verdict — two are turbo **cache replays** (the task never executed; its old log is shown),
one is a turbo **sibling kill** (the task was executing but was cancelled before it finished).
All three were observed on `main`.

**Repro / evidence (each confirmed):**

1. **Audit cache-hit.** `tools/soak-runner/tests/bug-number-audit.test.ts` reads
   `docs/prd/{bugs,bugs-designer,bugs-runtime}.md`, but its task `@cg/soak-runner#test` did not
   declare `docs/prd/**` as a turbo input. A code PR that adds a bug heading (but not
   soak-runner's own `src`/`tests`) cache-HITS and replays the cached "pass". This is how the
   **B-080 duplicate merged** (see [b-number-registry.md](b-number-registry.md)): the audit is
   RED when actually run (`B-080 claimed by 2: bugs-designer.md + bugs-runtime.md`), yet it never
   ran on the PRs that introduced it. Proof: `turbo run @cg/soak-runner#test --dry=json` hashed
   **0** `docs/prd` files before the fix (hash `dc5a1b34ca62cd16`), **10** after
   (`175eee1d2adc2bb5`).
2. **E2E cache-hit.** The CI e2e job runs `pnpm test:e2e` (= `turbo run test:e2e`) with no
   `--force`, and `test:e2e` was a cacheable task, so on most PRs it replayed a stale
   `209 passed (5.5m)` log instead of executing — in one 12-run window it genuinely ran in only
   ~5. A replayed E2E log cannot catch a regression it never exercised (the [[B-078]]/#317/#319
   class). Proof: `resolvedTaskDefinition.cache` was `true` for `@cg/designer#test:e2e` and
   `@cg/runtime#test:e2e`.
3. **Sibling kill.** `turbo run <task>` defaults to `--continue=never`: the first suite to fail
   CANCELS every sibling still running. For the E2E gate this destroys the killed suite's
   verdict — turbo reports `Tasks: 0 successful` and names whichever test was in flight when it
   was cancelled. This is the real source of the **"shifting-set Designer reds"** attributed to
   [[B-078]] around #317: the Designer suite was being killed mid-run when the Runtime suite hit
   its genuine B-072 failure (note the `730ms` "far too fast to be a timeout" tell), so it
   reported a partial "interrupted" whose test name shifted run to run. **#317 is exonerated**
   for those reds; the one real failure was B-072, fixed by #319. Proof: an isolated 2-package
   turbo repo (fast-failing suite + slow suite) — `never` killed the slow suite mid-run
   (`Tasks: 0 successful, 2 total`); `dependencies-successful` let it finish
   (`Tasks: 1 successful, 2 total`) while still exiting non-zero and naming the real failure.

**Expected:** a green required check MEANS the gate actually executed to a real pass/fail.
**Actual:** a task can cache-hit (replay an old log) or be killed by a sibling, and the check is
green anyway. **Env:** CI/tooling (`turbo.json`, root `package.json` scripts). Not app-specific.

**Why it matters:** the required check is the only thing gating merge. A gate that can pass
without running is worse than no gate — it manufactures false confidence. Two real defects
already rode through it (the B-080 duplicate; the #317 misdiagnosis that reverted a sound PR).

**Fix (this branch, four commits):**

1. Add `B-080` to the audit's accepted-duplicates allowlist (owner call, mirrors `B-056`).
2. Declare `$TURBO_ROOT$/docs/prd/**` as an input of `@cg/soak-runner#test` so a bug-file change
   invalidates the cache and the audit re-runs.
3. Mark `test:e2e` `"cache": false` so it always executes (its build deps still cache); the e2e
   job keeps its `code == 'true'` guard, so this does not run on docs-only PRs.
4. Run `test`/`test:e2e`/`test:integration` with `--continue=dependencies-successful` so
   independent sibling suites each run to their own verdict; also declare `vite.config.*`,
   `index.html`, `public/**` as `build` inputs (Vite consumes them, so a change to any must
   rebuild the `dist/**` that E2E now always runs against).

**Known remaining gap (owner judgment — see PR body):** a PURE docs-only PR still skips the whole
`ci` job (P-008), so the audit does not run on a docs-only bug-file change; and `lint`/`typecheck`
declare narrower inputs than the files they actually read. Listed for an owner decision rather
than guessed.

## [~] B-111 — the `tools/template-fixtures` Persian lower-third renders its RTL text off-canvas: the fixture still said `fitMode: 'autosize'`, which D-060 later made real — its §F repair swept `@cg/starter-templates` but not this workspace ⟨priority: medium⟩ — fix authored in the filing PR (both text nodes → `fitMode: 'fixed'` + a pinning regression test); pending merge

**Repro:** build the fixture (`pnpm --filter @cg/template-fixtures build`), `PLAY 1-30 [HTML]` the
unpacked `persian-lower-third/index.html` in CasparCG, look at the lower third. Observed during
C-018 recon (`docs/recon/2026-07-28-casparcg-250-validation.md` on the recon branch, PR #425);
stills `b4-233-http-01-settled.png` (2.3.2) and `c018-anim-05.png` (2.5.0) in
`tools/caspar-amcp-probe/evidence/2026-07-28-c018-validation/`.
**Expected:** the two Persian texts right-align inside the bar — `align: 'start'` +
`direction: 'rtl'` in the authored box (x=140, w=1140) puts the text's right edge at x=1280.
**Actual:** each text run's RIGHT edge sits at x≈140 and the run extends LEFTWARD off-canvas; only
its last glyphs are visible, overlapping the accent bar.
**Env:** CasparCG 2.3.2 (CEF ~71) AND 2.5.0 (CEF 142), identical — deterministic CSS from the
shared runtime, engine-independent.

**Diagnosis — NOT a `@cg/template-runtime` bug; the runtime does exactly what its spec says.** The
fixture (authored 2026-05-23, M3.4) predates [[D-060]] (#223, merged 2026-06-29). Back then
`fitMode` was stored-but-unread — the box always came from `transform.size`, so `'autosize'` was a
harmless no-op and the text right-aligned in the fixed box. D-060 made autosize real: the box hugs
content, `transform.size` is ignored, and per the `designer-text-autosize` spec the box grows from
its reading-start anchor — for RTL the top-RIGHT corner pins at `position.x`
(`scene-builder.ts` D-060 §E: `right = resolutionWidth − position.x`, pinned by
`auto-size-text.test.ts`; the Designer gizmo reads the same semantics — `Gizmo.tsx`: "RTL pins the
RIGHT edge"). So since #223 the fixture's autosize texts pin their right edge at x=140 and grow
leftward — off-canvas. D-060 §F audited and repaired the shipped starter templates
(`@cg/starter-templates`, where no `autosize` remains) but `tools/template-fixtures/` was not in
that sweep — the same class of stale fixture, one workspace over.

**Why it matters:** this fixture is the manual CasparCG validation vehicle — C-018's hardware
evidence runs on it. Rendering wrong on both engines, it read as a cross-engine Persian/RTL
rendering defect and cost the recon a diagnosis cycle (the layer that shows the symptom is not the
layer with the bug). Persian/RTL is a core requirement, so a validation fixture that misrenders
Persian poisons exactly the evidence it exists to produce.

**Fix:** `fitMode: 'fixed'` on both text nodes (`name`, `role`) in
`tools/template-fixtures/persian-lower-third.scene.mjs` — the layout relies on the authored box
(right edge x=1280) and on `overflow: 'ellipsis'`, which only means anything against a fixed box.
Same repair D-060 §F applied to the starter templates. The sibling schema fixture
`packages/vcg-format/tests/fixtures.ts` also carries `autosize` but is pack/unpack-only (never
rendered), so it is left as-is.

**Regression test:** `tools/template-fixtures/tests/roundtrip.test.mjs` — "B-111 — the RTL texts
render as FIXED boxes": renders the fixture through the real runtime and asserts both texts get
`left: 140px` + `width: 1140px` with NO `right` pin (the autosize-RTL signature), plus
`direction: rtl` / `text-align: start`.

**Generalised by [[B-112]]** (appended 2026-07-28, nothing above rewritten): this entry is one of
three known instances of the same stale-`autosize` pattern, and B-112 tracks the pattern — the
repo-wide inventory and the open question of whether user-saved `.vcg` documents were migrated.

## [ ] B-112 — documents authored before D-060 carry a stale `fitMode: 'autosize'` that has since become real, so they render differently than they were authored — silently ⟨priority: medium⟩

**Repro:** take any document authored before **2026-06-29** that has a text element with
`fitMode: 'autosize'` and `direction: 'rtl'` — its author saw the box come from
`transform.size` — and render it through `@cg/template-runtime` on today's `main`.
**Expected:** the box is the authored box (`transform.size`), as it was when the document was
saved and as its author last saw it.
**Actual:** the box hugs its content and `transform.size` is ignored; for RTL the top-RIGHT
corner pins at `position.x` (`packages/template-runtime/src/scene-builder.ts:515`), so the run
grows leftward from there. Nothing warns, nothing fails — the document just renders differently
than it was authored.
**Env:** every build since [[D-060]] (#223, merged 2026-06-29). Engine-independent (deterministic
CSS from the shared runtime), so it reproduces identically in preview and on CasparCG.

**Diagnosis — one pattern, three known instances, which is why this is ONE item.** Before D-060
`fitMode` was **stored but never read**: the box always came from `transform.size`, so writing
`'autosize'` was a harmless no-op and authors had no way to tell they had written it. D-060 made
the field meaningful. Every document carrying `'autosize'` from before that date therefore has a
value its author never really chose, and it is now load-bearing. D-060 §F audited and repaired
`@cg/starter-templates`, but its task list named **only that workspace**:

1. `@cg/starter-templates` — found and repaired by D-060 §F itself.
2. `tools/template-fixtures/` — the same staleness, one workspace over, found months later by
   [[B-111]] when it corrupted the C-018 hardware evidence it was supposed to produce.
3. `packages/vcg-format/tests/fixtures.ts` — reported by the B-111 session as still carrying it.
   Left alone there **deliberately**: that fixture is pack/unpack only and is never rendered, so
   the stale value has no effect. Recorded because "no effect today" is a property of how the
   fixture is used, not of the value.

Three instances of one cause is the reason this is filed as a single item rather than as
individual defects: repairing them one at a time is what produced the gap between #1 and #2.

**Fix — first steps, in order:**

1. **A repo-wide inventory of `fitMode: 'autosize'`**, classified by whether each occurrence is
   ever RENDERED (a rendered occurrence is a defect; a pack/unpack-only one is a note). This is
   the step that turns "three known" into a complete list, and it must run before any repair —
   repairing the ones we happen to remember is exactly how instance #2 survived.
2. **OPEN QUESTION, deliberately NOT answered here: did D-060 ship a migration for existing
   `.vcg` documents, and if not, what is the exposure for templates users saved before
   2026-06-29?** The three instances above are all repo-internal, where we can simply edit the
   source. A user's saved document is not — nobody has audited that path. This is recorded as
   OPEN because answering it requires reading what D-060 actually shipped, and reasoning it out
   from the item text is precisely the kind of inference this repo does not accept as evidence.

**Notes:** If the answer to #2 turns out to be "no migration", that work is **design-first** when
scheduled — `@cg/shared-schema` moves first, per the repo's schema-first rule. Cross-refs
[[B-111]] (instance #2, with the full D-060 §E/§F mechanism written out) and [[D-060]] (the change
that made the field real — not a defect in D-060, which repaired what its own task list named).

<!-- Add new open bugs above this line using the format. Example:

## [ ] B-0NN — Export blocked dialog shows wrong error count
**Repro:**
1. Open a scene with 2 unbound required fields
2. Click Export
**Expected:** "Export blocked: 2 validation errors"
**Actual:** Shows "1 error"
**Env:** Chrome / Designer dev, reproduces on main
**Notes:** apps/designer/src/renderer/features/status/StatusBar.tsx

-->

## [ ] B-132 — a push to `dev` created NO GitHub Actions run at all, and nothing reported it ⟨priority: high — the landing gate is silently absent⟩

**Observed 2026-08-10.** The push of **`d32fa13`** to `dev` (at ~`18:05Z`) produced **no workflow run
whatsoever**. Not a failed run, not a cancelled one, not a `startup_failure` — **no run object
exists**, so there is nothing to read, nothing to re-run from, and nothing that goes red.

### The evidence, gathered rather than assumed

| Check                                             | Result                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `actions/workflows/pr.yml/runs?head_sha=d32fa13…` | `total_count: 0`                                                       |
| `commits/d32fa13…/check-runs`                     | `total_count: 0`                                                       |
| `commits/d32fa13…/check-suites`                   | 2 suites — **Vercel** and **Claude** only; **no GitHub Actions suite** |
| `actions/runs?per_page=3` (whole repo)            | newest is `bd88ede` at `17:35:49Z` — nothing after it, 45 min later    |
| `actions/permissions`                             | `{"enabled": true, "allowed_actions": "all"}`                          |
| `actions/workflows`                               | `PR` → `state=active`                                                  |
| githubstatus.com summary                          | Actions / API / Git / Webhooks all `operational`                       |

**The workflow file is NOT the cause, and this was checked rather than reasoned.** `d32fa13` DOES
modify `.github/workflows/pr.yml` (it adds [[P-030]]'s reuse guard), which is the obvious suspect —
but the file validates clean against the Actions schema (`@action-validator/cli`, exit 0), **and so
does the previous version**, so the validator is discriminating rather than merely permissive. An
invalid workflow also produces a run with `conclusion: startup_failure` rather than no run at all.

### Why it matters more than one missing run

🔴 **The landing gate can be ABSENT, and absence is invisible.** CLAUDE.md's model is: CC pushes to
`dev` → CI runs the authoritative Linux gate → the owner merges. A run that goes **red** stops that
flow correctly. A run that **never exists** looks, to anyone glancing at a branch, exactly like a
branch nobody has pushed to yet — and the [[P-029]] / [[P-027]] work has trained readers that a
missing `e2e` can be legitimate. **Nothing in the repo distinguishes "not owed" from "never ran".**

It also means a Linux `gate:e2e` debt can be **undischargeable without any signal**: the discharge
rule requires a completed green run for the specific commit, and here there is no run to cite.

### The leading hypothesis, and what would confirm it

**Account-level GitHub Actions minutes / spending limit for this private repo.** It fits every
observation: runs succeed up to a point in the day and then stop being created, the workflow stays
`active`, `actions/permissions` still reads `enabled`, and GitHub reports no incident. This repo has
**history here** — CLAUDE.md's own commit policy records that _"GitHub Actions billing is restored"_,
so this failure mode has bitten before.

⚠ **NOT CONFIRMED.** Confirming it needs `users/{user}/settings/billing/actions`, which requires the
`user` OAuth scope this session's `gh` does not hold; granting it is the owner's call, not a
diagnostic step to take unilaterally.

**To confirm:** open **Settings → Billing → Plans and usage** and read the Actions minutes and the
spending limit. If exhausted, that is the answer and the fix is the owner's.

### Acceptance

- The cause is established and recorded here, including a negative (if it is NOT billing, say what it
  was).
- WHEN a push to `dev` or `main` produces no run THEN that fact is **detectable** rather than silent.
  ⚠ **The obvious fix cannot live in the workflow** — a workflow that never starts cannot report that
  it never started. It needs something outside Actions, or a check at the next push / at merge time
  that the PREVIOUS head has a run.
- The commits pushed while runs were not being created are re-verified once they are:
  **`f384d16`** and **`d32fa13`** (the latter carries [[P-030]] and is `[~]`, its own CI verification
  outstanding). Both were pushed on a **full green local gate** (85/85, 0 cached), which is fast
  pre-push feedback and explicitly **not** the landing gate.
