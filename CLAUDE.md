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
| Shared tokens / theme                           | `@cg/ui`                                                                                                                   |
| Storage backend                                 | `@cg/storage`                                                                                                              |

## Commands

```bash
pnpm install
pnpm build                              # turbo: build all @cg/* packages
pnpm --filter @cg/designer dev          # Designer SPA → http://127.0.0.1:5173
pnpm --filter @cg/runtime  dev          # Runtime  SPA → http://127.0.0.1:5174
pnpm turbo run build typecheck lint test   # full workspace check (must stay green)
pnpm --filter @cg/<pkg> typecheck|lint|test|build   # one workspace
pnpm openspec <cmd>                     # OpenSpec CLI (new change / validate / archive)
```

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
5. Green gate: `typecheck` + `lint` + `test` + `build` for the affected workspaces.
6. Conventional commit + push. Mark the PRD item `[~]` and note the change dir.
7. Archive (`pnpm openspec archive <name> -y` → folds the spec into
   `openspec/specs/`, item → `[x]`) **when the user confirms** — unless they
   said "and archive".

## Spec discipline — when a prompt changes a decision

A CLI prompt is ephemeral; the **spec is the memory**. A decision that lives only
in a prompt is lost on the next session and a re-check will revert it. So whenever
a prompt changes behavior or a prior decision (outside the initial PRD flow above):

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
3. **The change isn't done until the full green gate passes** (`typecheck` +
   `lint` + `test` + `build` for every touched workspace) — this is the safety net
   that forces stale tests and type-coupled code to be fixed. Then
   `pnpm openspec validate <change> --strict`, re-read the spec, and report which
   superseded text/tests you changed.
4. **On re-check, verify against the UPDATED spec only** — never revert to
   superseded behavior, even if `tasks.md` checkmarks were reset (e.g. by a
   re-drop). Keep the matching `docs/prd/*` item consistent.
5. When all tasks are checked **and** the gate is green, **remind me to archive**;
   do not archive automatically (see workflow step 7).

## Key references

- Architecture decision: `docs/adrs/0007-electron-to-browser-migration.md`
- Roadmap: `docs/phases/phase-10-browser-migration.md`
- `.vcg` format: `packages/vcg-format/` (isomorphic pack/unpack/verify)
- Living specs: `openspec/specs/` · changes: `openspec/changes/`
- Human workflow reference (verify greps, optional prompt tail, archive command):
  `cg-spec-workflow.md`
- The OpenSpec `.claude/` slash commands are gitignored; regenerate with
  `pnpm openspec init --tools claude`.

## Design system — interactive controls (always)

- Components are styled with `renderer/theme.ts` + vanilla-extract (the app's real
  design system). `@cg/ui` is tokens-only — do NOT add components there or change
  the palette.
- ALL buttons / interactive controls use the shared **`Button`** (labelled) and
  **`Control`** (icon-only) from
  **`apps/designer/src/renderer/ui/`** (`Button.tsx`, `Control.tsx`, recipe in
  `Button.css.ts`). They bake in hover / active / focus-visible / disabled from
  theme.ts. Variants: `primary | secondary | ghost | danger | bare` (+ `selected`
  for toggles via `aria-pressed`). **Every** variant — including `bare` — has all
  four interaction states, each tuned to that variant's own colours (e.g. `danger`
  hovers/presses rose, not grey). `bare` = no chrome of its own (use it to wrap a
  bespoke surface — menu item, list row, the keyframe diamond — via `className`),
  but it still hovers/presses: a plain bare button gets a neutral fill, while a
  pressed toggle (`aria-pressed="true"`) keeps its active colour and is lightened on
  hover. Per-component classes must only EXTEND the resting look (padding, sizing,
  bespoke chrome) — never redefine `:hover`/`:active`/etc., which would strip the
  shared states.
- Do NOT use a raw `<button>` or ad-hoc per-element styling for interactive
  controls — new controls inherit the states by default.
- A lint rule (`no-restricted-syntax` in `apps/designer/eslint.config.mjs`) errors
  on a raw `<button>` JSX element anywhere in `src/renderer/**` except
  `src/renderer/ui/**`.
