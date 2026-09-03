# CLAUDE.md — working guide for this repo

Broadcast **CG platform**: two browser **React SPAs** — **Designer** (visual
editor that exports `.vcg` template packages) and **Runtime** (CasparCG
playout controller). Migrated off Electron. **No backend, file-based storage.**
Persian / RTL is a core requirement.

## Golden rules

1. **The `window.cg` bridge is the seam.** The renderer (`src/renderer`) talks
   to its "backend" ONLY through the typed bridge contract in
   `apps/<app>/src/shared/*-bridge.ts`. The browser implementation lives in
   `apps/<app>/src/platform/`. Never import `src/platform` or Node APIs from the
   renderer.
2. **No backend, no raw sockets.** Persistence is file-based behind
   `@cg/storage`. Browsers can't open TCP/UDP, so real CasparCG control needs a
   local bridge (see `caspar.md`); until then the Runtime uses a mock.
3. **Schema first.** Domain types are Zod schemas in `@cg/shared-schema`. If the
   data model changes, change the schema before the UI/runtime.
4. **Persian/RTL is non-negotiable.** Keep a shaping-capable font first; test
   mixed RTL/LTR.
5. **Strict TypeScript, no `any`.** Lint tiers forbid Node/Electron imports in
   browser code. Conventional commits. Tests via vitest.
6. **A predicate's NAME is part of its contract.** If the name states a condition
   ("link down", "reachable"), the implementation must test THAT condition — and
   REUSE the one canonical predicate (e.g. `@cg/caspar-client`'s `isLiveState`),
   never re-derive the state list locally. A second local copy is how a name comes
   to lie about what it tests. `degraded` is AMCP-up / OSC-silent — it is
   REACHABLE (see `B-100`).
7. **One boolean gating a destructive AND a constructive step is read ONCE.** When
   a single condition guards both a destructive action (an adopt-`CLEAR`) and the
   constructive step that repairs it (the pre-roll `CG ADD`), both must read the
   SAME evaluation. Two reads with an `await` between them is a CLEAR-then-nothing
   window — a black layer on air (see `B-100`).
8. **Probe the axis you intend to judge.** A monitoring channel's silence may NEVER
   be used as a liveness proxy for a channel it does not measure. OSC silence is
   evidence that confirmation is unavailable — nothing more; it cannot speak for the
   AMCP socket, so AMCP liveness is decided by sending an AMCP command and bounding
   the wait (`probeAmcpLiveness`), never by a quiet OSC port. Reading silence on one
   channel as death on another is what destroyed a working socket every ~13 s on
   every OSC-less install (see `B-101`, and `B-100` one layer up).
9. **When the deliverable is a STRING, the compiler cannot help you.** Changing user-facing
   wording obliges a tree-wide `git grep` for the OLD text — tests, docs, task lists and spec
   files — BEFORE the commit, because the only thing that fails on a stale copy is a suite that
   does not run locally. Session BM-2 changed one sentence in the Inspector, fixed the one unit
   test that reddened, and pushed a red `e2e`: `pnpm gate` does not run Playwright (`P-028`), so
   nothing local could catch it — **one grep would have**, and the same sweep also found a
   `tasks.md` still quoting the old sentence as shipped fact. The rule is the sweep, not "run the
   E2E": the E2E is slow and non-authoritative here, while the grep is cheap and total.

   ⚠ **`git grep`, NOT `grep -r` and NOT ripgrep — a sweep whose tool can go blind is not a
   sweep.** A file containing a **NUL byte** reads as BINARY to those two and is skipped **in
   silence**: no warning, no non-zero exit, just a match count that is quietly short. The sweep
   then looks clean, which is worse than not running it. Two such files sat in the tree until
   session BP found them — one in `@cg/shared-ipc`'s `channels/sources.ts` (the module that owns
   `SourceAssignments`, invisible during a session whose whole subject was that type) and four
   occurrences in the OSC probe — each a separator written as a literal byte instead of its
   escape. **`git grep` was not blind only because it samples the first 8000 bytes for binary
   detection and both NULs happened to sit past that**, which is precisely what kept the hole
   looking closed. Write separators as escapes, never as literal bytes; and if you have just
   written a file that talks about NUL bytes, scan it — `node -e "…readFileSync(p).indexOf(0)"` is
   the whole check, and BP wrote one into its own handoff that way.

10. 🔴 **A CONFIGURATION VERB IS NEVER A PLAYOUT VERB.** `UPDATE` puts values **IN
    FORCE**; only a **take** puts content **ON AIR**. A row that does not already own live
    layers must produce **no `PLAY`, no un-mute and no fill** — the change lands in STATE, and
    the next take seats it. `B-161`: the owner stopped several plates, swapped their inputs and
    pressed UPDATE alone, and the videos went to air with **no template above them** — measured
    at the wire as four `PLAY`s, four `MIXER VOLUME` and eight `MIXER FILL`/`CLIP` on a row that
    had never been taken. The complement of BM's _STAGED ≠ IN FORCE_.
    ⚠ **Gate at the ROW, never at the look or the visible hole.** A live row's UNION pre-seat
    — every look's inputs, including the looks not punched — is what makes a switch pure
    `MIXER FILL`; narrowing it puts a `PLAY` back inside a switch (`B-155` case 3). If a gate
    changes the pre-seat SET, it is the wrong gate.
    ⚠ **And "owns live layers" is NOT `isOnAirStatus` alone** — a REHEARSING row is
    deliberately not on air yet owns its plates on PVW, so the air question alone silently
    breaks rehearse. Use the ONE predicate that asks what the decision turns on
    (`#ownsLiveSeats`), and gate the one path the verbs share rather than making two paths
    agree.

## Where features go

| Feature kind                                    | Location                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI control / panel / tool (existing data)       | `apps/<app>/src/renderer/features/<feature>/` (+ `state/`, `hooks/`)                                                                                                                                                                                                                                                               |
| New backend capability (no schema change)       | method in `src/shared/*-bridge.ts` → impl in `src/platform/` → call from renderer (+ optional channel in `@cg/shared-ipc`)                                                                                                                                                                                                         |
| Data-model change (element/field/shape kind)    | `@cg/shared-schema` → renderer UI → `@cg/template-runtime` render                                                                                                                                                                                                                                                                  |
| How a scene renders (animation, element visual) | `@cg/template-runtime`                                                                                                                                                                                                                                                                                                             |
| `.vcg` package format / manifest / signing      | `@cg/shared-schema` (manifest) + `@cg/vcg-format`                                                                                                                                                                                                                                                                                  |
| Runtime/playout (intents, connections)          | `@cg/shared-ipc` channel + `apps/runtime/src/platform/MockRuntime.ts` + renderer (real logic → `@cg/caspar-client`)                                                                                                                                                                                                                |
| Shared tokens / theme                           | `@cg/ui` (tokens ONLY — components live app-local, see Design system)                                                                                                                                                                                                                                                              |
| Shared INTERACTION behaviour (no styles/markup) | `@cg/gesture` — headless hooks only (B-140's drag gesture). NOT a home for components: it exists so `@cg/ui` can stay tokens-only and components can stay app-local, and behaviour with neither styling nor markup is a third category rather than an exception to either rule. Anything that renders app chrome belongs app-local |
| Storage backend                                 | `@cg/storage`                                                                                                                                                                                                                                                                                                                      |

## Commands

```bash
pnpm install
pnpm build                              # turbo: build all @cg/* packages
pnpm --filter @cg/designer dev          # Designer SPA → port 4000, LAN-visible by default (P-041); HOST=127.0.0.1 restricts
pnpm --filter @cg/runtime  dev          # Runtime  SPA → port 5174, same; the page derives its bridge host from its own origin
pnpm gate                               # full green gate — turbo --force + format:check + openspec validate. NEVER append flags (see below)
pnpm test:e2e                           # Playwright E2E via turbo (builds first — never run against a stale dist)
pnpm --filter @cg/<pkg> typecheck|lint|test|build   # one workspace
pnpm openspec <cmd>                     # OpenSpec CLI (new change / validate / archive)
```

### The owner's shell is PowerShell (Windows)

- Never hand the owner a bash-only one-liner. `sed`, `awk`, `grep`, `cut`, `$(...)`,
  `|| true` and `2>/dev/null` are NOT available in their shell and have been pasted and
  failed more than once.
- Prefer git's own `--format` output over text-slicing
  (`git for-each-ref --format="%(refname:short)|%(upstream:track)"`), and
  PowerShell cmdlets (`Where-Object`, `ForEach-Object`, `Select-String`) when slicing is
  unavoidable.
- `<` is a RESERVED operator in PowerShell — never use it as a placeholder in a command handed
  to the owner. Use a named variable or an explicit list instead.
- This applies only to commands the OWNER runs by hand. Commands CC runs in its own tool
  environment are unaffected.

### PowerShell silently ALTERS arguments and file content, and does not necessarily error (`P-025`)

The rule above is about commands that FAIL. This one is about commands that appear to succeed and
quietly hand back something else. **Full evidence is in `P-025` (`docs/prd/platform.md`); it is not
restated here.** Four measured instances, one class:

- **`Measure-Object -Line` under-counts** — it reported **2203** lines for `DEBT.md` against a true
  **2707**, because blank lines are not counted. A session sized its work from the wrong number.
- **`Get-Content -Raw` / `Set-Content` corrupt non-ASCII** — one rewrite turned **35 em-dashes into
  mojibake** and injected a BOM. **Seven** files were still carrying a BOM on 2026-08-03; prettier
  does not strip one and no gate step fails on one, so they survived silently.
- **An unquoted `stash@{n}` is mangled** — PowerShell parses `@{` as a hashtable literal, so git
  never receives the argument that was typed.

**THE RULE: count and read with git's own plumbing** (`git cat-file -s`, `git grep -c ""`,
`git grep`) **or with proper edit tooling.** Never size a file with `Measure-Object -Line`, never
round-trip text through `Get-Content -Raw` / `Set-Content`, and always quote a `stash@{n}`.

**Why it is worth its own rule:** every instance is discovered DOWNSTREAM, after a decision has
been made on the bad value. A wrong line count looks like a line count; a mojibake em-dash looks
like text; a mangled stash ref produces what reads as git's fault. Nothing errors at the moment the
damage is done.

## Green gate — definition of done

`format:check` + `typecheck` + `lint` + `test` + `build` for every touched
workspace. Formatting is part of the gate: if `format:check` fails, run the
format/write script and include the result in the same commit — never leave
formatting to CI. Before claiming the gate green ahead of a push, the test task must
have run **uncached at least once** — a stale turbo cache has produced a false green
before.

**Run it as plain `pnpm gate`; NEVER `pnpm gate --force`.** The `--force` is already
inside the script (`turbo … --force`), so `pnpm gate` IS the uncached run — it reports
`0 cached, 93 total`. `gate` is an `&&` chain and pnpm appends extra args to the LAST
command, so the flag lands on `openspec validate --all --strict --force` →
`error: unknown option '--force'`: a bogus red on an otherwise green gate. Same trap
for any `pnpm <script> <flag>` where the script chains commands.

**The gate's test fan-out is BOUNDED to the host — leave it bounded (B-098, P-034).** `gate`,
`test`, `test:integration`, **`test:e2e` and `gate:e2e`** no longer call `turbo` directly; they
route through `tools/gate-hook/src/bounded-turbo-cli.mjs`, which caps BOTH multipliers that used to
compound — turbo's task concurrency AND each task's own worker count (`vitest run`'s forks, and
Playwright's browser workers) — so the worst case `taskConcurrency × workersPerTask` stays ≤ cores
(12 cores → 4 × 2 = 8 workers; the run prints its own bound, one line per half). Unbounded, the
vitest defaults wanted ~64 workers on 8 cores and starved whichever timing-sensitive suite was
co-scheduled — the same `did not reach HEALTHY` contention red B-073 first met.

⭐ **`test:e2e` was the sibling the bound never reached, and it is why this list now names five
scripts rather than three (P-034).** It stayed a bare `turbo run` and therefore started both apps'
Playwright suites at full width at once — 6 + 6 = 12 browsers on 12 cores — and the tests it broke
were, every time, "did this ANIMATE within N milliseconds" assertions whose VICTIMS MOVED between
runs. **One rule, two spellings** is the shape to watch for: when you bound something, bound its
siblings in the same commit, and never let the list of covered scripts be a decision someone has to
remember. **Always run these tasks through their `pnpm` script (`pnpm gate` / `pnpm test` / `pnpm
test:e2e`); NEVER call `turbo run test` — or `turbo run` for any gate task — directly.** A direct `turbo` invocation skips `tools/gate-hook/src/bounded-turbo-cli.mjs` and so
drops the worker cap, reviving the B-098 `did not reach HEALTHY` load-flake class the bound
exists to prevent. Do NOT "simplify" a script back to a bare `turbo run test`
(it removes the cap), do NOT drop the `VITEST_*` `passThroughEnv` keys in `turbo.json` (strict
env mode then filters the caps out and the bound is a silent no-op), and do NOT answer a
contention red by raising a timeout — B-073 already did that and B-098 is that bound blown in
turn. The fix is the bound; a longer rope is not.

**When you widen what a task READS, widen that task's turbo `inputs` in the SAME COMMIT.** A
tsconfig `include`, a lint target, a newly-linted directory — the moment a task checks a file the
cache key does not hash, its green stops meaning anything, and it fails **silently and ONLY under
a cache HIT**, so neither `pnpm gate` (forced uncached) nor a cold CI runner can ever catch it.
Session BS is the measured instance: it flipped `tools/caspar-bridge`'s typecheck to include
`tests/**` while `typecheck` inputs still hashed `src/**` only, so a test-only edit could not
invalidate a cached typecheck (closed in `85e3c27e`). The notch BS named one further out was real
too: all four `bin/`-bearing workspaces run `eslint .`, which lints their `bin/**/*.mjs` (9 files),
and a planted `no-unused-vars` error in `tools/soak-runner/bin/cg-soak.mjs` came back `cache hit,
replaying logs` with `pnpm lint` exit 0 — until `bin/**` joined `lint` inputs. ⚠ STILL OPEN: `test`
inputs do not hash `bin/**` either, and `tools/caspar-bridge/tests/live-layers-default.test.ts`
SPAWNS `bin/caspar-bridge.mjs` as a child process.

**Never background a push.** The pre-push gate must run in the FOREGROUND, or a
second gate can start alongside it — two gates in one workspace collide over
vitest's shared coverage tmp dir and fail an innocent suite with a bare `ENOENT`
that reads exactly like a product regression (see `B-097` in `docs/prd/bugs.md`).

**One gate per host — enforced by a lock, not by discipline (P-013).** `pnpm gate`
and `pnpm gate:e2e` each acquire this host's exclusive gate slot (a host-wide advisory
lock under `os.tmpdir()`, via `tools/gate-hook/src/gate-lock-cli.mjs` → `proper-lockfile`)
before running, and hold it for the whole gate. A concurrent gate — the pre-push /
Stop-hook double-fire above, or a gate in any other checkout on this host — WAITS for the slot
(printing "waiting for host gate slot…") instead of racing it. The lock is a clean OUTER
layer over B-098's `bounded-turbo-cli` (host serialization vs. intra-gate fan-out — keep
both). It lives at the SINGLE `gate`/`gate:e2e` script chokepoint every entry point
(direct, pre-push, Stop hook) funnels through — do NOT re-implement it per caller (a
second copy is how the rule drifts, B-100/P-012), and do NOT "simplify" `gate` back to the
inline chain: `gate` = lock → `gate:run` (the real chain, still `0 cached, 93 total`),
`gate:e2e` = lock → `gate:e2e:run`. A broken lock DEGRADES to an unserialized run rather
than blocking the gate (it is the sole landing gate); only a 15-min-stuck slot errors out.

**The gate's FULL output is persisted, not its tail (P-040).** The same chokepoint tees
every byte the gate prints into `.gate-logs/gate-<stamp>-<pid>.log` (gitignored, newest
twenty kept) and names the file before the gate starts and again on failure. When a
pre-push gate fails naming no task — the first push of `96090c49` did — read that file, not
the terminal's tail. Logging is fail-open: a checkout that cannot write it still gates.

**Docs-only carve-out (archive).** An OpenSpec **archive** operation — folding a
merged change into `openspec/specs/` + the PRD status flip to `[x]` — touches only
`openspec/**` and `docs/**`, never source / tests / build. Its gate is therefore
ONLY `pnpm openspec validate --all --strict` + `pnpm format:check` (after the
`pnpm exec prettier --write "openspec/specs/**/*.md"` pass), NOT
`typecheck`/`lint`/`test`/`build` and NOT a `turbo --force` uncached run — those are
meaningless for a markdown-only fold. This applies ONLY to a pure archive/docs commit
where NO source/test/build file changed; any commit that touches code keeps the full
green gate above.

**The gate is enforced at turn end (P-009).** A committed Stop hook
(`.claude/hooks/gate-stop.mjs`) runs when your turn ends: docs-only diffs get the
carve-out above, every other diff gets `pnpm gate`. If it blocks you: the gate is RED —
fix the CODE per the repair rules it prints (never delete/skip/loosen a test to go green;
port-4321 Playwright failures are usually a stale process, see B-078). It blocks at most
twice per session, then defers to the human. Logic + tests: `tools/gate-hook/`.

**The hook does NOT run `pnpm gate:e2e` (P-028).** A UI/render diff is still CLASSIFIED
as owing a Linux E2E, and the hook prints a NON-BLOCKING reminder saying so — but it no
longer runs the suite. The local run cost ~224 s on top of the ~140 s `pnpm gate`, on
EVERY turn of a multi-turn UI task, for a signal that could never discharge the debt,
because a Windows pass is non-authoritative by the very rule that owes it. The
authoritative Linux `e2e` now comes from CI on every push to `dev`; nothing about the
discharge rule changed (see "E2E coverage"), only who runs the suite. `pnpm gate:e2e`
remains a manual command, and `CG_GATE_HOOK_E2E=1` puts the local run back inside the
hook for a turn when you want the fast signal.

## Feature workflow — PRD → OpenSpec → code

Feature requests and bugs live in **`docs/prd/`** (one file per category).
**When the user asks to implement a PRD item** (e.g. "do D-001", "take the next
high-priority designer item"), follow `docs/prd/README.md` exactly. In short:

1. Read the item in `docs/prd/<category>.md`.
2. `pnpm openspec new change <kebab-name>` and author the artifacts from the
   item's **What / Why / Acceptance** (each Acceptance bullet → a `#### Scenario`).
   Reuse/extend an existing living spec in `openspec/specs/` with
   `## MODIFIED Requirements` when the capability already exists.
3. `pnpm openspec validate <name> --strict`.
4. Implement per the "Where features go" map.
5. Full green gate (see definition above) for the affected workspaces;
   user-facing changes also add **and run** their E2E (see E2E coverage).
6. Conventional commit + push (verify per "Verify before claiming"). Mark the
   PRD item `[~]` and note the change dir.
7. Archive (`pnpm openspec archive <name> -y` → folds the spec into
   `openspec/specs/`, item → `[x]`) **when the user confirms** — unless they
   said "and archive". After archiving, run
   `pnpm exec prettier --write "openspec/specs/**/*.md"` (archive output isn't
   prettier-clean; markdown occasionally needs a second `--write` pass) and
   include it in the same commit, then `pnpm format:check` before push.
   Archiving is **docs-only**: its gate is just `pnpm openspec validate --all
--strict` + `pnpm format:check`, NOT the full green gate (see the docs-only
   carve-out above).

## Spec discipline — when a prompt changes a decision

A CLI prompt is ephemeral; the **spec is the memory**. Whenever a prompt changes
behavior or a prior decision (outside the initial PRD flow above):

1. **Implement it and chase every ripple** — update all affected code, **tests**,
   the exporter/metadata, and any other consumers of the changed behavior, not
   just the file the prompt names. A change that leaves stale tests or stale
   dependent code is **incomplete**.
2. **Update the active change's docs to match** — `proposal.md`,
   `specs/<capability>/spec.md`, `tasks.md`, and `design.md`. In `tasks.md`:
   re-check what you complete, and **uncheck + redo** any item the decision
   invalidates (e.g. a test asserting the old behavior). **Replace** superseded
   requirements/scenarios; never leave contradictory old text. The spec, not the
   prompt, is the source of truth.
3. **The change isn't done until the full green gate passes** (definition
   above). Then `pnpm openspec validate <change> --strict`, re-read the spec,
   and report which superseded text/tests you changed.
4. **On re-check, verify against the UPDATED spec only** — never revert to
   superseded behavior, even if `tasks.md` checkmarks were reset (e.g. by a
   re-drop). Keep the matching `docs/prd/*` item consistent.
5. When all tasks are checked **and** the gate is green, **remind me to
   archive**; do not archive automatically (workflow step 7).

## Branching — everything lands on `dev`

- **All work happens on `dev`.** There are no per-change feature branches: a task
  starts on `dev`, finishes on `dev`, and is pushed to `dev`.
- **One logical change per COMMIT** (conventional commits). The unit that used to be a
  branch is now a commit — don't roll unrelated concerns into one, or a revert takes
  innocent work with it.
- **Never commit to `main`.** `main` is written by exactly one thing: the owner's
  hand-merge of `dev`, at the end of a day, when the work is final.

### Repo layout — one folder, one branch

ONE repo folder, checked out on `dev`. There are no `cg` / `cg-designer` / `cg-runtime`
sibling worktrees and no per-track split: every branch there is lives in this folder, so
"is this on `main`?" is answered right here.

- **Uncommitted work is what a branch switch destroys silently.** This is the one lesson
  worth carrying over from the retired worktree scheme, and it survives the change of
  model intact: commit early and often rather than building one large uncommitted change.
- **Worktrees are still ENUMERATED, never counted.** Tooling (Claude Code) can create its
  own worktrees under `.claude/worktrees/*`; `.claude/*` is gitignored, so they never
  dirty this folder's status and nothing announces them. Resolve the real set with
  `git worktree list --porcelain` before proposing any branch deletion.

### Is it on `main` yet? — ask the deliverable, not ancestry

`main` moves only when the owner merges `dev` into it by hand. Between merges `dev` reads
"N commits ahead of `main`" — that is the normal resting state, not a backlog signal, and
if the merge squashes, `dev`'s own commits never enter `main`'s history at all, so the
count does not reset on its own.

- Judge whether something is on `main` by the DELIVERABLE's presence there — the archived
  change dir, the PRD item flipped to `[x]`, the code itself — never by ancestry and never
  by a commit count.
- Never "correct" a `dev` that reads ahead of `main` by rebasing or resetting it. It is
  supposed to read that way.

### Commit & merge policy — CC pushes `dev`, the owner merges (P-014)

- **Every task ends with a commit and a push to `dev`.** No branch, no PR, no merge.
  Verify the push landed (see "Verify before claiming") — never report it otherwise.
- **CC NEVER merges into `main`, and never asks to.** The owner performs that merge by
  hand when the day's work is final.
- **The independent check is CI on `dev`, and it exists again.** GitHub Actions billing is
  restored and `pr.yml` now runs on every push to `dev`, so the flow is: CC pushes to
  `dev` → CI runs the authoritative Linux gate (`ci` + the full Playwright `e2e` job) →
  the owner merges `dev` into `main`. The local `pnpm gate` is FAST PRE-PUSH FEEDBACK, not
  the landing gate: it is the same host that gives a non-authoritative Windows `gate:e2e`
  and carries the B-098 load-flake class, so a green local gate is a reason to push, never
  a claim that the change is verified. CI is what verifies it; the owner's read at merge
  is the judgment layer on top.
- **CC PAUSES AND FLAGS — out loud, in its final report — when a commit falls in one of
  these three classes.** They are about RISK, not about PRs, so retiring the PR model does
  not retire them. CC still commits and pushes; what it must not do is let one of these
  land silently:
  1. **On-air / export / product source** — a bad change reaches broadcast output.
  2. **An owed hardware run or a Linux `gate:e2e`** — Windows is non-authoritative, so the
     debt is undischarged and must be named as still owed.
  3. **Shared config the next session must pick up** (root `package.json`, `turbo.json`,
     `pnpm-lock.yaml`, `CLAUDE.md`, the gate-hook) — say so, so the pull is not a surprise.
- **Do not read a pushed commit as verified until its run COMPLETES green** — see the
  discharge rule under "E2E coverage". A run cancelled by the next push is not a result.

## Verify before claiming

- Never report an external action (push, merged, archived, CI green) as DONE
  without verifying it: after a push, confirm the remote head — `git ls-remote
origin dev` matches local — and only claim CI green after seeing the check's
  real status.
- If a step fails or can't be verified, say exactly that — "committed on `dev`;
  the push was rejected, not pushed" — never invent or guess an identifier, and
  never describe an unverified step as done.
- **A write to GitHub via `gh` is confirmed by READING THE VALUE BACK, never by an exit
  code.** Observed 2026-07-27: `gh` aborted on a deprecated `projectCards` GraphQL field,
  exited WITHOUT applying the change, and printed only a deprecation notice — it looked
  like success and did nothing, twice. The lesson outlives the PR workflow that produced
  it: any `gh` mutation is claimed only after re-reading the mutated value.

## E2E coverage (Playwright)

- Any change that adds or alters **user-facing behavior** MUST add an E2E test
  mapping its OpenSpec `#### Scenario`s to Playwright steps, composed from the
  fixtures/page objects in `apps/designer/tests/e2e/` — and run it.
- Run via `pnpm test:e2e` (turbo builds first; the suite runs against the built
  `dist/`, so invoking Playwright directly against a stale build gives false
  results).
- Browsers: CI uses the pinned bundled Chromium. Locally the Playwright CDN is
  geo-blocked (HTTP 403), so the config auto-falls-back to system Chrome when
  the bundled browser is absent — no `PW_CHANNEL` needed.
- **A Linux `gate:e2e` is owed whenever a change alters UI, layout, or rendering — not
  only when an E2E spec is edited. A green Windows `gate:e2e` is a useful signal but
  never discharges the debt.**
- **How that debt is DISCHARGED — one way only.** A Linux `gate:e2e` debt is discharged
  ONLY by a **COMPLETED, GREEN `e2e` job on GitHub Actions for the specific commit that
  carries the change**, cited by its **run URL**. Nothing else counts:
  - a **CANCELLED** run does NOT discharge it — it is neither a pass nor a fail and
    proves nothing about the commit. Check the run's `conclusion` reads `success`, never
    merely that a run exists. (Push runs are no longer cancelled by a newer push;
    `cancel-in-progress` is now PR-only, per `P-027`. A run can still be cancelled by
    hand, and a burst of pushes can still supersede a PENDING run.)
  - a green **Windows** run does NOT discharge it — that is the same rule as the bullet
    above, restated here because this is where someone will look for the exception.
  - a green run on a DIFFERENT commit does not discharge it unless that commit actually
    carries the change (a later `dev` HEAD that contains the change is fine; an earlier
    one is not).
  - a run whose `e2e` job was **SKIPPED** does not discharge it. CI skips `e2e` when the
    diff is classified as unable to affect rendering (`P-029`); that is a statement about
    the diff, not evidence about the suite.
  - **Write the run URL into the change's `tasks.md`, beside the ticked item**, so the
    evidence outlives the session that produced it. A ticked box with no URL is not a
    discharge — it is a claim, and the next reader cannot check it.

  CI runs the full Playwright suite on `ubuntu-latest` on every push to `dev` whose diff
  can affect what renders, so obtaining one is ordinary practice rather than something to
  arrange.

- **The daily merge to `main` is the COMPLETENESS BACKSTOP — a red run there is a red
  day.** Two holes are known, and neither is closed at the per-push level: (1) GitHub keeps
  only ONE pending run per concurrency group, so in a burst of pushes a middle commit's
  changes get no run of their own; and (2) a push whose changed set is classified as unable
  to affect rendering skips the `e2e` job entirely (`P-029`). Both are caught by the same
  thing: **a push to `main` is classified against the previous `main` tip**, so the owner's
  `dev` → `main` merge classifies the WHOLE span since the last merge and runs whatever
  that span needs. **Verified, not assumed** — `main` is an ancestor of `dev`, so the merge
  keeps the old `main` tip as the base, and running the classifier over a real `main..dev`
  span reproduced it (37 files ⇒ `kind=code needsE2e=true`, forced by one unrecognised
  path). Two consequences worth stating plainly: that run is the last line of defence for
  everything the day skipped, so **it is not a formality to skim past** — read it, and
  treat a failure as a failure of the whole day's work rather than of the merge commit
  alone; and a debt that no per-push run covered is only covered once that merge run
  completes green.

  ⭐ **MODIFIED by `P-030` — the merge run SKIPS its heavy jobs when, and only when, the
  tip's own run already discharged them in full.** `dev` → `main` is a `--ff-only` merge,
  so `main`'s new HEAD is the SAME COMMIT as `dev`'s tip — same SHA, same tree — and
  re-running ~15 metered runner-minutes against a tree nothing changed buys nothing.
  **The backstop itself is NOT weakened, and this is the distinction to hold on to:**
  the guard skips only on a **positive, complete match** — a prior run for that exact
  `head_sha` that is `completed` + `success` **AND in which the `ci` and `e2e` jobs both
  actually RAN**. A prior run that was green having **SKIPPED** `e2e` (the P-029 case, and
  precisely the hole this backstop exists to close) does **NOT** match, so the merge run
  does the work. Every uncertainty — API error, missing permission, unreadable jobs, a
  renamed job — resolves to running everything. **A merge run is never optional; it is
  only ever satisfied in advance**, and when it is, it says so in its summary with the
  prior run's URL, so a green merge run that did nothing can never be mistaken for one
  that passed.

  ⭐ **WHY reusing a green SHA is safe at all — classification gates WHETHER; the jobs
  themselves are WHOLE-TREE.** The natural alarm on reading that guard is: the prior run
  classified only **its own push's diff**, but the merge run's job is the whole
  `main..head` **span** — so an earlier commit in the span could be uncovered, and the
  guard would skip the very run that covers it. **That alarm is wrong, and the reason is
  written here because it will occur to the next reader too — who might otherwise "fix" a
  guard that is already correct.** Neither heavy job is diff-scoped: `ci` runs
  `pnpm format:check` / `typecheck` / `lint` / `test` / `build`, each a bare
  workspace-wide `turbo run <task>` with no `--filter` and no changed-file input, and
  `e2e` runs `pnpm test:e2e` — the entire Playwright suite. **The changed-path
  classification decides only WHETHER those jobs run, never WHAT they cover.** A green run
  that EXECUTED both therefore verifies the whole **tree** at that SHA, including the code
  of every earlier commit in the span. Reusing it does not narrow coverage; it declines to
  compute the same whole-tree answer twice.

  🔴 **The corollary — "both jobs actually RAN" is LOAD-BEARING, not belt-and-braces.**
  Whole-tree coverage is a property of jobs that **RAN**. A prior run that was green having
  **SKIPPED** `e2e` proves nothing whatsoever about the tree's render behaviour, which is
  exactly why that case must not be reused. **Do not let a later reader relax the condition
  to "a green run exists for this SHA"** — it reads as a harmless simplification and
  silently deletes the backstop. The same fact is what re-scored `B-132`: a dropped event
  costs a commit its own run, not the tree's eventual verification.

## Engine doc-sync

When a change alters an engine's **structure, contracts, or extension points**,
update that engine's doc **in the same change**: `docs/engines/overview.md` and
the deep-dives — `packages/template-runtime/README.md`,
`apps/designer/src/renderer/features/canvas/README.md`,
`apps/designer/src/renderer/features/timeline/README.md`,
`apps/designer/src/renderer/state/README.md`. Behavior stays in the OpenSpec
specs; engine docs cover "how it's built".

## Design system — interactive controls

- Components are styled with `renderer/theme.ts` + vanilla-extract (the app's
  real design system). `@cg/ui` is **tokens-only** — do NOT add components
  there or change the palette.
- ALL buttons and interactive controls use the shared primitives in
  `apps/designer/src/renderer/ui/` (`Button`/`Control`, shared `Select`), which
  bake in hover / active / focus-visible / disabled states for **every
  variant**, each tuned to that variant's colors. No raw `<button>`/`<select>`
  or ad-hoc control styling in the renderer — lint rules enforce this; new
  controls inherit the states by default.
- ALL icons go through the shared **`Icon`** component
  (`apps/designer/src/renderer/ui/Icon.tsx`, backed by `lucide-react`). Do NOT
  introduce new Unicode-glyph icons or new ad-hoc inline-`<svg>` icons in the
  renderer — new controls reuse `Icon` + a lucide name (the icon inherits
  `currentColor`, is `aria-hidden` by default, takes one `size`, and opts into RTL
  mirroring via `flipRtl`). Purpose-built custom SVG icons are allowed ONLY where
  lucide has no adequate equivalent, and should be the rare exception.
- **Keyboard shortcuts — match the PHYSICAL key, not the character.** A
  letter/digit shortcut handler MUST match on `e.code` (the physical key, e.g.
  `KeyC` / `KeyV` / `Digit0`), never the printable `e.key`, so the shortcut is
  independent of the keyboard layout/language (on a Persian layout the `c` key
  reports `e.key: 'ع'` but still `e.code: 'KeyC'`). Use the shared
  `comboKey(e, 'KeyC')` helper (`renderer/keyboard.ts`) for Ctrl/Cmd combos. Only
  match on `e.key` for keys whose value is already layout-stable — `Delete`,
  `Backspace`, `Arrow*`, `Enter`, `Escape`.

## Key references

- Roadmap (agreed sequence of upcoming work): `docs/ROADMAP.md`
- Architecture decision: `docs/adrs/0007-electron-to-browser-migration.md`
- Migration phases: `docs/phases/phase-10-browser-migration.md`
- Engine docs: `docs/engines/overview.md` (+ per-engine deep-dives listed under
  Engine doc-sync)
- `.vcg` format: `packages/vcg-format/` (isomorphic pack/unpack/verify)
- Living specs: `openspec/specs/` · changes: `openspec/changes/`
- The OpenSpec `.claude/` slash commands are gitignored; regenerate with
  `pnpm openspec init --tools claude`.
