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

## [~] B-003 — point frames style ⟨priority: high⟩ — focused fix

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

## [~] B-049 — flaky: `@cg/caspar-client` `transport.test.ts` peer-disconnect times out under full-suite load ⟨priority: low⟩

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

## [~] B-069 — docs housekeeping: B-056 is double-assigned across the bug files ⟨priority: low⟩ — reconciled on `fix/test-infra-batch` via [b-number-registry.md](b-number-registry.md)

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

## [ ] B-071 — turbo lint/build race: ESLint globs Vite's transient `vite.config.ts.timestamp-*.mjs` and dies with ENOENT ⟨priority: low⟩

**Repro:**

1. From a clean tree, run `pnpm turbo run typecheck lint test build` (or the narrower `pnpm turbo run lint build`).
2. Occasionally `@cg/designer#lint` fails with `ENOENT ... apps/designer/vite.config.ts.timestamp-*.mjs`.
3. Rerun the same command — it passes. Non-deterministic; timing-dependent.

**Expected:** lint is deterministic and passes. Run on its own (`pnpm --filter @cg/designer lint`) it is clean — 0 errors.
**Actual:** turbo runs `build` and `lint` **concurrently**. Vite writes a transient `apps/designer/vite.config.ts.timestamp-*.mjs` while loading its config during `build`, and deletes it immediately after. ESLint's glob can enumerate that file and then try to read it after it's already gone → `ENOENT` aborts the lint job. Nothing is wrong with the source; the failure is purely a filesystem race between two concurrent turbo tasks.
**Env:** Monorepo tooling (turbo + Vite + ESLint). Not app-specific and not browser-specific. Present on `main`; observed 2026-07-13 during [[B-068]]'s green gate.

**Notes — proposed fix direction (NOT implemented here):** add the transient pattern to `apps/designer`'s ESLint `ignores` (e.g. `vite.config.ts.timestamp-*.mjs`, or the broader `*.timestamp-*.mjs`), or otherwise stop lint from globbing build-time transients. This is a **tooling fix — no OpenSpec change** and no source/runtime behavior change; it touches `apps/designer`'s eslint config only. Deliberately filed rather than fixed inline, since it is unrelated to the change that surfaced it.

**Regression test:** a lint run over a tree that contains a stray `apps/designer/vite.config.ts.timestamp-x.mjs` must not fail — drop such a file in, run `pnpm --filter @cg/designer lint`, and expect 0 errors (today it reports the file / races on it).

## [~] B-073 — the recurring test-flakiness family: socket/timer integration reds under parallel CPU load + an E2E that silently tests a STALE build ⟨priority: high⟩ — fixed on `fix/test-infra-batch`

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

## [~] B-075 — nothing stops a duplicate B-number from being MERGED: the global-uniqueness rule was enforced only by remembering to run the audit ⟨priority: low⟩ — fixed on `fix/B-067-nested-fields`

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
