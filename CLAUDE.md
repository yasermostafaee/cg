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

## Key references

- Architecture decision: `docs/adrs/0007-electron-to-browser-migration.md`
- Roadmap: `docs/phases/phase-10-browser-migration.md`
- `.vcg` format: `packages/vcg-format/` (isomorphic pack/unpack/verify)
- Living specs: `openspec/specs/` · changes: `openspec/changes/`
- The OpenSpec `.claude/` slash commands are gitignored; regenerate with
  `pnpm openspec init --tools claude`.
