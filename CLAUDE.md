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
pnpm --filter @cg/designer dev          # Designer SPA → http://127.0.0.1:5173
pnpm --filter @cg/runtime  dev          # Runtime  SPA → http://127.0.0.1:5174
pnpm turbo run format:check typecheck lint test build   # full green gate (must stay green)
pnpm test:e2e                           # Playwright E2E via turbo (builds first — never run against a stale dist)
pnpm --filter @cg/<pkg> typecheck|lint|test|build   # one workspace
pnpm openspec <cmd>                     # OpenSpec CLI (new change / validate / archive)
```

## Green gate — definition of done

`format:check` + `typecheck` + `lint` + `test` + `build` for every touched
workspace. Formatting is part of the gate: if `format:check` fails, run the
format/write script and include the result in the same commit — never leave
formatting to CI. Before claiming the gate green ahead of a push, run the test
task **uncached at least once** (`turbo --force`) — a stale turbo cache has
produced a false green before.

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
   said "and archive".

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
