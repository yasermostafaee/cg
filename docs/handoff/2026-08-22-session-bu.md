# Session BU — `TURBO-BIN-01` + `E2E-PNG-01`: the cache key catches up with what the tasks read, and an E2E run stops dirtying the tree

> **Safe to pull.** Everything below is on `dev`; see §0. `pnpm gate` is green uncached (twice).
>
> **Letter:** `BU`. `BN`–`BS` have handoffs; **`BT` ran and left none at the time** — since
> written up as [`2026-08-22-session-bt.md`](2026-08-22-session-bt.md), reconstructed from the
> record by this session under `PATCH-BU-01` §4 (its work is `8e80fdf7` +
> `57e07795` + `4777b724`, and it is cited by `docs/recon/2026-08-22-b155-switch-flash-walk.md`),
> so `BT` is used and this is `BU`.
>
> **Unattended session** — the owner was away by both briefs' §0.2. Nothing waited on a decision;
> every choice below was the one the brief named, and the two places where a measurement pointed
> somewhere the brief had not are called out explicitly (§1.1, §1.4).

## 0. State

| Fact              | Value                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tip read at start | `4777b724` (session BT) — `HEAD == origin/dev`, `git pull` reported already up to date                                                                                             |
| Tree at start     | ONE modified file: `template-http-server.ts` — the standing never-stage LAN-host pin, named in both briefs' §5. Never staged, still unstaged.                                      |
| **Pushed**        | Two pushes: tip `4257ef19` (`TURBO-BIN-01`), then tip `4124885d` carrying `2bf31fa5` + `3e4f7832` + the handoff. Each verified by `git ls-remote origin dev`, not by an exit code. |
| **Owed e2e**      | ✅ `TURBO-BIN-01` DISCHARGED (§3); `E2E-PNG-01` still owed — see §3                                                                                                                |
| Commits           | 4, in the two-per-prompt shape both briefs required; no file from one prompt was ever staged with the other's                                                                      |

---

# `TURBO-BIN-01` — close the `bin/**` notch

## 1.1 The outcome: SPLIT, and the measurement is what split it

The brief said add `bin/**` to "the same turbo task `inputs` that just gained `tests/**`" — which
is `typecheck` **and** `lint` (`85e3c27e`) — and said to measure first and decline if nothing reads
it. Measuring gave a different answer for each half, so both outcomes happened, one per task:

| task        | reads `bin/`?                      | how that was measured                                                                                        | action       |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
| `lint`      | **YES — 9 files, 4 workspaces**    | ESLint's own `--format json`, per workspace, counting the reported `filePath`s that sit under `bin/`         | **ADDED**    |
| `typecheck` | **NO — 0 files, all 4 workspaces** | `tsc --noEmit -p <config> --listFiles`, with a `/src/` control on the same output to prove the grep was live | **DECLINED** |

The four `bin/`-bearing workspaces are `tools/amcp-mock` (1 file), `tools/caspar-amcp-probe` (6),
`tools/caspar-bridge` (1), `tools/soak-runner` (1). Each runs `eslint .`, and each
`eslint.config.mjs` names `bin/**/*.mjs` in its `node()` tier with no ignore over it.

For `typecheck` the `include` is `src/**/*` in all four; `caspar-bridge`'s
`tsconfig.typecheck.json` is `src` + `tests` + `vitest.config.ts`. **The zero is a reading, not a
dead grep** — the `/src/` control hit 12 / 8 / 22 / 3 times in those same four outputs.

## 1.2 🔴 The stale green, measured rather than argued

BS reported this notch as inference. It was reproduced as an observation:

| step                                    | result                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm lint` (warm)                      | `24 cached, 24 total`, `>>> FULL TURBO`                                               |
| plant a real `no-unused-vars` in `bin/` | `pnpm --filter @cg/soak-runner exec eslint .` → **1 error**, exit 1                   |
| `pnpm lint` again — **BEFORE the fix**  | `@cg/soak-runner:lint: cache hit, replaying logs` · **exit 0** · FULL TURBO           |
| `pnpm lint` again — **AFTER the fix**   | `@cg/soak-runner:lint: cache miss, executing` · the error printed · **exit 1**        |
| touch all four `bin/` entry files       | **exactly 4 of 24** lint tasks miss — the glob resolves where it should, nowhere else |

⚠ **The first probe was a dud and said nothing, which is the part worth carrying forward.** It was
named `__turboInputProbe`; the base config sets `varsIgnorePattern: '^_'`, so ESLint was silent and
the run "passed". Had that silence been read as the answer, the conclusion would have been "`lint`
does not read `bin/` after all" — the exact opposite of the truth, reached by a control that could
not fail. The name lost its underscores before any conclusion rested on it. **A negative reading is
void until the instrument is shown live.**

## 1.3 What landed

- `db32fd14` — `turbo.json`: `lint` inputs gained `bin/**`.
- `4257ef19` — `CLAUDE.md`: one new paragraph beside `P-034`. **When you widen what a task READS,
  widen that task's turbo `inputs` in the SAME COMMIT** — because a config that checks more than
  the cache key knows about produces a green that means nothing, and it fails silently **only under
  a cache HIT**, so neither `pnpm gate` (forced uncached) nor a cold CI runner can ever catch it. It
  cites BS as the measured instance and does not restate `P-034` (that paragraph is about the worker
  BOUND; this one is about the cache KEY — neighbours only because both are ways a turbo run can
  lie).

## 1.4 🔴 A SECOND notch found, and deliberately LEFT OPEN

`test` inputs (`src/**`, `tests/**`, `scripts/**`, `vitest.config.*`, `package.json`) do not hash
`bin/**` either — and
[`tools/caspar-bridge/tests/live-layers-default.test.ts:96`](../../tools/caspar-bridge/tests/live-layers-default.test.ts)
**spawns `bin/caspar-bridge.mjs` as a child process**. That test's own header says why it exists:
deleting `liveLayersPath` from the CLI's options object "would leave every one of them green while
the station lost its ledger again". **The defect it guards lives in the file the cache key does not
hash**, so the test written to catch it cannot be invalidated by an edit to it.

It was NOT fixed: `TURBO-BIN-01` §5 names "any other turbo task" out of scope, and the brief's
deliverable was fully reachable without it. It is recorded in the new `CLAUDE.md` paragraph so the
next reader inherits a pointer rather than a rediscovery. **The fix is one line** — adding the
`bin` glob to the `test` task's `inputs` — **and it needs an owner's yes, not an investigation.**

---

# `E2E-PNG-01` — the `bb-step*.png` dirt wart

## 2.1 The writer, named

[`apps/designer/tests/e2e/looks.spec.ts`](../../apps/designer/tests/e2e/looks.spec.ts) — lines
**95, 116, 130, 134** as found, each a
`page.screenshot({ path: '../../docs/handoff/img/bb-step*.png' })` writing a TRACKED file.

## 2.2 No other tracked artefact is written by a test

Swept with `git grep` (golden rule 9 — not `grep -r`, not ripgrep) across every `tests/` tree for
`screenshot(`, `writeFileSync` / `writeFile(` / `createWriteStream`, and repo-relative `../../`
write targets:

- `pixel-paint.spec.ts:148,276`, `rehearse-canvas.spec.ts:107`, `rehearse-composite.spec.ts:167,185`
  capture to a **buffer** with no `path:` — they write no file.
- every `../../fixtures/b034` hit is a `readFileSync`.
- `apps/designer/tests/exporter-vcg-fonts.test.ts:362` is the one adjacent writer and is **already
  opt-in** (`D121_FIXTURE_OUT`, skipped when unset). It is the precedent this fix copies, not a
  second instance of the wart.

## 2.3 Filed as `P-037`, minted from the registry

`docs/prd/platform.md` + registered in `docs/prd/b-number-registry.md` (`2bf31fa5`). Highest `P-`
heading was `P-036` **by both tools** — the registry's documented `grep -rhoE` derivation and a
`git grep` cross-check both returned `036`; the `P-` duplicate audit printed nothing; the three
`P-037` hits are all forward-reference pointers, none a heading.

⚠ **Both tools were run on purpose, and the registry entry now says why.** The command that file
documents is `grep -rhoE`, but golden rule 9 forbids `grep -r` for tree sweeps because it skips a
NUL-bearing file **in silence**. For a NUMBER derivation a silent skip under-reports the highest
heading and mints a **colliding** number — the one failure that registry exists to prevent.
Agreement between the two removes the mode; where they ever disagree, `git grep` is the authority.

## 2.4 The fix (`3e4f7832`) — one test file, nothing else

`CG_HANDOFF_STILLS=1` opts a run into refreshing the committed stills; every other run writes the
same four screenshots to `apps/designer/test-results/handoff/`, already covered by `.gitignore:88`.
**The shot is always taken**, so the spec's coverage and its failure diagnostics are unchanged.
Nothing deleted, nothing newly gitignored, no product source touched.

## 2.5 🔴 PROVEN IN TWO ARMS

A "the tree is clean now" reading on its own cannot distinguish a fix from a screenshot that quietly
stopped being taken. So the opt-in arm is the positive control:

1. **opt-in** — `CG_HANDOFF_STILLS=1 pnpm --filter @cg/designer exec playwright test looks`:
   **1 passed**, and `git status` then showed **`bb-step3` and `bb-step4` MODIFIED**. The wart
   reproduces on demand, and the handoff doc can still be re-illustrated. Restored with
   `git checkout --`; hashes back to their `HEAD` values.
2. **default** — a full `pnpm test:e2e`: **269 passed, 12 skipped**, and:

```
$ git status --porcelain
 M apps/designer/tests/e2e/looks.spec.ts             <- the fix itself, not yet committed
 M tools/caspar-bridge/src/template-http-server.ts   <- the standing never-stage pin
```

**Nothing under `docs/handoff/img/`.** All four stills hash-identical to `HEAD`; all four
screenshots present in `apps/designer/test-results/handoff/`, which `git check-ignore -v` resolves
to `.gitignore:88`.

## 2.6 ⚠ MEASURED, and it sharpens the item

**Only TWO of the four images moved in the opt-in arm** — `bb-step5` and `bb-step5b` came back
byte-identical. The nondeterminism is **partial**, so the dirty set varied run to run. That is worse
than uniform dirt, not better: a reader could not form a stable expectation of what "normal" looked
like, and an unstable expectation is what a real change hides behind.

**Not covered by `typecheck`:** `apps/designer`'s tsconfig `include` is
`["src/**/*", "vite.config.ts"]`, so the edited file sits outside the compile guarantee (`P-033`,
still open). Coverage here is `lint` (which does lint `tests/` — 0 errors) and the run itself. Worth
knowing before assuming a green `typecheck` said anything about this diff.

---

## 3. Verification

- **`pnpm gate` green UNCACHED, twice** — `89 successful, 89 total` / **`0 cached, 89 total`**,
  exit 0, once per prompt. (The `0 cached` is what makes it an honest run. Note the total is **89**
  now, not the 82 `CLAUDE.md` quotes.) Run as plain `pnpm gate`, never `--force`.
- **Classifier run over each diff, not assumed:**
  - `TURBO-BIN-01` → `{ kind: 'code', needsE2e: true }` (`turbo.json` is outside the
    known-non-render set).
  - `E2E-PNG-01` → `{ kind: 'code', needsE2e: true }` (`looks.spec.ts`, `affectsRender: true`).
- ✅ **`TURBO-BIN-01`'s e2e debt DISCHARGED** —
  <https://github.com/yasermostafaee/cg/actions/runs/32584358199> — head `4257ef19` (the tip
  carrying both its commits), `completed` + **`success`**, and **`E2E (Playwright)` reported
  `completed :: success`, i.e. it RAN**, not skipped. Read from the run's job list, not from an exit
  code.
- ✅ **`E2E-PNG-01`'s e2e debt DISCHARGED** —
  <https://github.com/yasermostafaee/cg/actions/runs/32585878051> — head `4124885d`, `completed` +
  **`success`**, **`E2E (Playwright)` `completed :: success`, i.e. it RAN**. That tip is a later
  `dev` HEAD that CONTAINS `3e4f7832`, which is what the discharge rule allows; a green Windows
  `pnpm test:e2e` (269 passed / 12 skipped, run locally) does **not** discharge it and is recorded
  here only as the local signal it is.
- **`2bf31fa5`, `3e4f7832` and `4124885d` went out in ONE push, so `3e4f7832` has no run of its
  own — and that is the MODEL, not a slip** (corrected by `PATCH-BU-01`; an earlier revision of
  this line called it one, and anyone who read that should unlearn it). The owner's model is **one
  logical change per COMMIT, accumulated locally, ONE push at the end.** Each push costs a
  pre-push gate wait and a metered CI run, and GitHub keeps only one pending run per concurrency
  group, so pushing per commit buys runs that are immediately superseded. **"A middle commit with
  no run of its own" is the known, accepted COST of that model** — affordable precisely because
  `ci` and `e2e` are **whole-tree, never diff-scoped**, so the run at the tip verifies the tree
  every earlier commit in the batch contributed to. The one exception is a fix that supersedes an
  ALREADY-PUSHED defect: that goes out promptly, because until it lands the pushed tip is wrong.
  Here the tip run's diff spanned `4257ef19..4124885d`, so `looks.spec.ts` was in the classified
  set and `e2e` RAN rather than skipping.
- ✅ **`CLAUDE.md` does NOT contradict this, checked rather than assumed.** Its merge-backstop
  paragraph names the one-pending-run behaviour as a **known hole that the backstop catches**, not
  as a rule against batching, and its `P-030` note states the whole-tree property outright: "a
  green run that EXECUTED both therefore verifies the whole tree at that SHA, including the code
  of every earlier commit in the span." There is no line to escalate and nothing was changed there.
  (Its hole (1) is also a different mechanism — a **burst of pushes superseding a PENDING run**.
  One push of three commits supersedes nothing.)
- All pushes verified with `git ls-remote origin dev` matching local `HEAD`.
- Files staged **individually** throughout; `git add <dir>` never used; `template-http-server.ts`
  never staged.

## 4. Flags for the owner

1. ⚠ **SHARED CONFIG — `turbo.json` AND `CLAUDE.md`.** Both moved this session; the next session
   inherits both on pull. This is `CLAUDE.md`'s flag-class 3.
2. 🔴 **The `test`-inputs notch (§1.4) is REAL and OPEN** — a test that spawns
   `bin/caspar-bridge.mjs` cannot be invalidated by an edit to it. Out of scope by the brief, one
   line to fix, needs a yes.
3. **Nothing on air, nothing exported, no hardware run owed.** No product source changed in either
   prompt: the diff is `turbo.json`, `CLAUDE.md`, two `docs/prd/` files and one E2E spec.
4. **No OpenSpec change was authored for `P-037`.** Both briefs prescribed their commit shape ("two
   commits: the filing, then the fix") and neither asked for one; the item is `[~]` with its proof
   recorded beside it. Say the word if you want the artifacts.

## 5. What a future session should pick up

1. **The `bin` glob in the `test` task's `inputs`** (§1.4) — the last notch in this chain.
2. **`P-033` is still open for `apps/designer`** — its typecheck is `src/**` only, which is why §2.6
   needs a caveat at all. `apps/runtime` and `tools/caspar-bridge` now give two patterns to copy
   from (vite-built and tsc-built).
3. **`E2E-PNG-01`'s run URL** — write it into §3 above when that push run completes.

## 6. Out of scope — named untouched

`B-155`, the FLASH and BT's `#withLiveSeatLock` · any turbo task other than `lint` · any workspace's
tsconfig · the committed `bb-step*.png` images (restored, never deleted) · `docs/handoff/img/`'s
gitignore status (unchanged — a doc links there) · any other slow or flaky E2E ·
`template-http-server.ts` (read only; still carrying its LAN-host pin, still unstaged) · any product
source, and anything on air.
