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

## Where features go

| Feature kind                                    | Location                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| UI control / panel / tool (existing data)       | `apps/<app>/src/renderer/features/<feature>/` (+ `state/`, `hooks/`)                                                       |
| New backend capability (no schema change)       | method in `src/shared/*-bridge.ts` → impl in `src/platform/` → call from renderer (+ optional channel in `@cg/shared-ipc`) |
| Data-model change (element/field/shape kind)    | `@cg/shared-schema` → renderer UI → `@cg/template-runtime` render                                                          |
| How a scene renders (animation, element visual) | `@cg/template-runtime`                                                                                                     |
| `.vcg` package format / manifest / signing      | `@cg/shared-schema` (manifest) + `@cg/vcg-format`                                                                          |
| Runtime/playout (intents, connections)          | `@cg/shared-ipc` channel + `apps/runtime/src/platform/MockRuntime.ts` + renderer (real logic → `@cg/caspar-client`)        |
| Shared tokens / theme                           | `@cg/ui` (tokens ONLY — components live app-local, see Design system)                                                      |
| Storage backend                                 | `@cg/storage`                                                                                                              |

## Commands

```bash
pnpm install
pnpm build                              # turbo: build all @cg/* packages
pnpm --filter @cg/designer dev          # Designer SPA → http://127.0.0.1:4000
pnpm --filter @cg/runtime  dev          # Runtime  SPA → http://127.0.0.1:5174
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
`0 cached, 82 total`. `gate` is an `&&` chain and pnpm appends extra args to the LAST
command, so the flag lands on `openspec validate --all --strict --force` →
`error: unknown option '--force'`: a bogus red on an otherwise green gate. Same trap
for any `pnpm <script> <flag>` where the script chains commands.

**The gate's test fan-out is BOUNDED to the host — leave it bounded (B-098).** `gate`,
`test` and `test:integration` no longer call `turbo` directly; they route through
`tools/gate-hook/src/bounded-turbo-cli.mjs`, which caps BOTH multipliers that used to
compound — turbo's task concurrency AND each `vitest run`'s fork count — so the worst case
`taskConcurrency × forksPerTask` stays ≤ cores (8 cores → 3 × 2 = 6 workers; the run prints
its own bound). Unbounded, those two defaults wanted ~64 workers on 8 cores and starved
whichever timing-sensitive suite was co-scheduled — the same `did not reach HEALTHY`
contention red B-073 first met. **Always run these tasks through their `pnpm` script (`pnpm
gate` / `pnpm test`); NEVER call `turbo run test` — or `turbo run` for any gate task —
directly.** A direct `turbo` invocation skips `tools/gate-hook/src/bounded-turbo-cli.mjs` and so
drops the worker cap, reviving the B-098 `did not reach HEALTHY` load-flake class the bound
exists to prevent. Do NOT "simplify" a script back to a bare `turbo run test`
(it removes the cap), do NOT drop the `VITEST_*` `passThroughEnv` keys in `turbo.json` (strict
env mode then filters the caps out and the bound is a silent no-op), and do NOT answer a
contention red by raising a timeout — B-073 already did that and B-098 is that bound blown in
turn. The fix is the bound; a longer rope is not.

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
inline chain: `gate` = lock → `gate:run` (the real chain, still `0 cached, 82 total`),
`gate:e2e` = lock → `gate:e2e:run`. A broken lock DEGRADES to an unserialized run rather
than blocking the gate (it is the sole landing gate); only a 15-min-stuck slot errors out.

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
carve-out above, code diffs get `pnpm gate`, UI/render diffs also get `pnpm gate:e2e`.
If it blocks you: the gate is RED — fix the CODE per the repair rules it prints (never
delete/skip/loosen a test to go green; port-4321 Playwright failures are usually a
stale process, see B-078). It blocks at most twice per session, then defers to the
human. A green Windows `gate:e2e` is non-authoritative — a Linux/WSL run is still owed.
Logic + tests: `tools/gate-hook/`.

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
  - a **CANCELLED** run does NOT discharge it. `.github/workflows/pr.yml` sets
    `cancel-in-progress: true`, so a newer push to `dev` kills the run behind it; a
    cancelled run is neither a pass nor a fail and proves nothing about either commit.
    Check the run's `conclusion` reads `success`, never merely that a run exists.
  - a green **Windows** run does NOT discharge it — that is the same rule as the bullet
    above, restated here because this is where someone will look for the exception.
  - a green run on a DIFFERENT commit does not discharge it unless that commit actually
    carries the change (a later `dev` HEAD that contains the change is fine; an earlier
    one is not).
  - **Write the run URL into the change's `tasks.md`, beside the ticked item**, so the
    evidence outlives the session that produced it. A ticked box with no URL is not a
    discharge — it is a claim, and the next reader cannot check it.
    CI runs the full Playwright suite on `ubuntu-latest` on every push to `dev`, so this is
    now ordinary practice rather than something to arrange.

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
