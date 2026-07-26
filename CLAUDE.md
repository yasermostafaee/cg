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
  (`git for-each-ref --format="%(refname:short)|%(upstream:track)|%(worktreepath)"`), and
  PowerShell cmdlets (`Where-Object`, `ForEach-Object`, `Select-String`) when slicing is
  unavoidable.
- `<` is a RESERVED operator in PowerShell — never use it as a placeholder in a command handed
  to the owner. Use a named variable or an explicit list instead.
- This applies only to commands the OWNER runs by hand. Commands CC runs in its own tool
  environment are unaffected.

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
Stop-hook double-fire above, or a gate in another worktree — WAITS for the slot
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

## Branching — one change per branch

- Start every change/task on its OWN branch off **up-to-date** `main`
  (`feat/…`, `fix/…`, `docs/…`, `chore/…`). One branch = one PR = one concern.
- Don't stack unrelated work on an existing feature branch — it mixes concerns
  and makes PRs hard to review/revert.
- Never reuse a merged branch; after a merge, work continues from a fresh branch
  off pulled `main`.

### Worktrees — `cg` is READ-ONLY

Three worktrees share one repo: `cg`, `cg-designer`, `cg-runtime`.

- **`cg` is READ-ONLY.** It stays on `main`, is never checked out to a branch, and
  is never committed from. Its job is a clean current view of merged `main` — which
  is exactly what the B-number audit and any "is this on main?" check need.
- **Docs work happens in the OWNING TRACK's worktree**, on a docs-only branch —
  Runtime docs in `cg-runtime`, Designer docs in `cg-designer`.
- **A track worktree is NEVER on `main`; its resting state is DETACHED at merged
  `main`.** git forbids one branch in two worktrees and `cg` holds `main`, so
  `git checkout main` in a track worktree fails BY DESIGN. Finding `cg-runtime` or
  `cg-designer` detached between tasks is CORRECT, not a fault to repair — the first
  act of any task is to branch off up-to-date `main` anyway. Committing ON a detached
  HEAD is what makes one dangerous; sitting on one is not.
- **The cost, stated so nobody reverts this without knowing it:** a track cannot
  hold a feature branch and a docs branch at once, so docs work waits for a commit
  or a stash. That serialization is WITHIN one track with one driver — manageable.
  The scheme it replaces put the serialization ACROSS two independent sessions,
  which is not.
- **Worktrees are ENUMERATED, never counted.** Tooling (Claude Code) creates
  additional worktrees UNDER `cg/.claude/worktrees/*` holding `claude/*` branches —
  nested inside the read-only worktree, so a scan of `cg`'s siblings misses them
  entirely. Three appeared in a single day on 2026-07-26. Always resolve the current
  set with `git worktree list --porcelain` before proposing any branch deletion.
  `.claude/*` is gitignored, so these never dirty `cg`'s status.
- **`refs/stash` is SHARED across all worktrees** (it lives in the common git dir),
  so `git stash list` shows the same stack everywhere. A stash created on one track
  is visible from the other and must NEVER be popped or applied from a worktree
  other than its origin — the diff would land on the wrong checkout. Rescue an
  unknown stash with `git tag <name> refs/stash`, which requires no checkout and no
  clean tree.

Why the old scheme could not hold: routing all docs/archive/housekeeping into `cg`
made it the ONE worktree two independent sessions were forced to share —
`cg-designer` and `cg-runtime` are naturally exclusive (different code, they never
meet). On 2026-07-19 a parallel session checked out its own branch in `cg` while an
archive sweep sat uncommitted there, and the checkout silently destroyed four
archives, two spec folds and every PRD flip. That is structural, not a discipline
lapse: "one worktree, one session" does not prevent it, because the scheme itself
manufactured the contention.

- **General form: uncommitted work is what a branch switch destroys silently.**
  Commit early and often rather than building one large uncommitted change.

### Merge status: ask the PR, never ancestry

This repo **squash-merges**, so a merged branch's own commits never enter `main`'s
history.

- `git log origin/main..<branch>` lists every one of them as unmerged, and the
  branch reads "N commits behind / M ahead" forever. **Ancestry is NOT a merge
  signal here.**
- Judge merge status by the PR (`gh pr list --head <branch> --state all`) or by the
  deliverable's presence on `main` (archived change dir, PRD item flipped, the code
  itself) — never by ancestry.
- **Ship in four explicit steps — never `gh pr merge --delete-branch` (see `P-011`).**
  `gh pr merge <n> --admin --squash` (NO `--delete-branch`), then
  `git push origin --delete <branch>`, then `git branch -D <branch>`, then
  `git -C ../cg pull --ff-only`. The deletion push costs ~3 s, because an
  all-deletions push skips the gate (`P-010`), and `-D` is required since a
  squash-merged branch never reads as merged to `-d`. **If step 2 reports that the
  remote ref does not exist, the deletion is SATISFIED, not failed** — the ref was
  already removed by another path (GitHub's merge-page delete button, an earlier
  manual delete). "Verify BOTH deletions" means both refs are ABSENT afterwards,
  never that both delete commands printed success. Observed shipping PR #409 with
  `delete_branch_on_merge` DISABLED, so this is not conditional on that setting
  (`P-017`).
- **The `--delete-branch` ban covers gh's INTERACTIVE prompt too, not just the flag.**
  Given no flag, `gh pr merge` still asks "Delete the branch locally?" — always answer
  **No**, or pass `--delete-branch=false` to suppress the prompt. Answering Yes fails
  identically with `fatal: 'main' is already used by worktree at .../cg`, because gh
  checks out the PR's base `main` before deleting and this layout can never allow that.
  The local ref is deleted by hand at step 3, once the worktree has moved to its next
  branch.
- **The fourth step is what keeps `cg` honest.** Nothing else advances it, so `cg`
  silently falls behind the `main` it is supposed to mirror — it was two commits
  stale when the refs sweep found it — and a stale `cg` breaks its one job: being
  the clean current view the B-number audit and every "is this on `main`?" check
  read from. `--ff-only` is the point: in a squash-merge repo it refuses loudly
  rather than manufacturing a merge commit, and a plain `pull` here has already
  produced a spurious conflict once.
- **Why `--delete-branch` cannot work in this layout:** gh deletes the LOCAL branch
  first and aborts before the remote deletion if that step fails — and here it always
  fails. On the branch, gh checks out the PR's base `main`, which `cg` holds
  (`'main' is already used by worktree at .../cg`); detached, gh cannot resolve a
  current branch and errors even earlier. Either way the merge LANDS and the PR
  closes, so the remote branch survives with nothing announcing it — silent
  accumulation (observed merging #382). `--repo` does skip gh's local half, but then
  leaks the LOCAL branch instead: the exact hazard the next bullet exists to prevent.
- **DELETE the local ref once its PR merges.** A stale merged branch is
  indistinguishable from in-flight work. `fix/runtime-ux-batch-2` — merged as #317
  on 2026-07-14 — still read "53 commits behind, 11 ahead" days later and cost a
  full session's planning for a rebase of already-shipped code. Worse, its tip
  commit is titled `revert(e2e): back out the B-078 budget bump` but touches only
  `docs/prd/bugs.md`: the branch still carries the RAISED Playwright budgets
  (`expect` 15s, test 60s, `webServer` 240s) that `main` has at 7s/30s/120s, so
  rebasing it would have resurrected work B-078 records as "tried and reverted, do
  not simply retry it".

### PR & merge policy — CC opens, owner merges (P-014)

- **Every task ends with a PR.** After the green gate + push, CC opens a PR with
  `gh pr create` (title + a body summarizing what changed and the evidence). If `gh`
  is unavailable, CC prints the manual compare URL and says the PR was not opened —
  it never claims a PR it did not create (see "Verify before claiming").
- **CC does NOT merge by default — it opens the PR and stops; the owner merges.**
  While GitHub Actions billing is out (~Aug) the local gate is the ONLY landing gate,
  and it has known gaps: the B-098 load-flake class, a Windows `gate:e2e` that is
  non-authoritative for pixel/a11y geometry, and reliance on owner-eyes for judgment.
  One local-gate pass is therefore not an INDEPENDENT check — a second human read at
  merge is the only independent gate there is, so the owner performs it.
- **CC merges ONLY when the owner authorizes it for that specific task**, and then via
  P-011's ship sequence exactly — `gh pr merge <n> --admin --squash` (NO
  `--delete-branch`; it always fails in this worktree layout and leaks a live remote
  branch — the structural reason is in "Merge status" above), then
  `git push origin --delete <branch>`, then `git branch -D <branch>`, then
  `git -C ../cg pull --ff-only` — **verifying BOTH deletions** and the `cg` fast-forward.
- **CC NEVER auto-merges — it pauses and flags even if told to merge — when the change:**
  touches on-air / export / product source (a bad merge reaches broadcast output); owes a
  hardware or a Linux `gate:e2e` run (Windows is non-authoritative); or is shared config
  another worktree must rebase onto (root `package.json`, `turbo.json`, `pnpm-lock.yaml`,
  CLAUDE.md, the gate-hook). The owner sequences shared-config merges so the other session
  is told to pull.
- **Docs-only PRs: auto-merge is NOT permitted either** (the owner may enable it later).
- **After remote CI returns (~Aug), the auto-merge-eligible class widens** — an independent
  check will exist, so this policy is revisited then.

## Verify before claiming

- Never report an external action (push, PR created, merged, archived, CI
  green) as DONE without verifying it: after a push, confirm the remote head
  (`git ls-remote origin <branch>` matches local); only cite a PR number/URL
  after actually creating or viewing it (`gh pr view <n>`); only claim CI green
  after seeing the check's real status.
- If a step fails or can't be verified (e.g. `gh` unavailable), say exactly
  that — "pushed branch X; PR not created, open it manually" — never invent or
  guess an identifier.

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
