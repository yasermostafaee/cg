# cg — Broadcast CG Platform

[![PR](https://github.com/yasermostafaee/cg/actions/workflows/pr.yml/badge.svg)](https://github.com/yasermostafaee/cg/actions/workflows/pr.yml)

Two-product platform for TV networks using CasparCG playout:

- **Designer** — visual editor for broadcast HTML graphics (logo bugs, lower thirds, tickers, breaking news, fullscreen). Edits scenes, previews them live, and exports broadcast-safe `.vcg` packages.
- **Runtime** — playout controller for CasparCG (AMCP + OSC) with primary/backup redundancy.

TypeScript, React, Persian/RTL as a core requirement.

> **Now browser-based.** The platform is migrating from Electron to React
> apps that run in the browser — no desktop install, no backend, file-based
> storage. See [`docs/adrs/0007-electron-to-browser-migration.md`](./docs/adrs/0007-electron-to-browser-migration.md)
> and the migration roadmap in [`docs/phases/phase-10-browser-migration.md`](./docs/phases/phase-10-browser-migration.md).

## Status

Architecture complete (Phases 1–8); see [`docs/`](./docs). The Electron
desktop build (milestones M0–M12) is preserved in git history.

- **Designer — browser:** running. Project library, live preview, and `.vcg`
  export all work in the browser against file-based storage.
- **Runtime — browser:** shell running against an in-memory mock. The
  CasparCG control path needs a small local WebSocket↔TCP bridge (browsers
  can't open raw sockets) — that bridge is the next milestone.

## Layout

```
apps/        # browser React SPAs (designer, runtime) — Vite
  designer/
    src/renderer/   # React UI (reused from the Electron renderer)
    src/platform/   # in-process window.cg bridge (browser storage, no Electron)
  runtime/
    src/renderer/   # React UI
    src/platform/   # in-process window.cg bridge (mock playout core)
packages/    # shared libraries (@cg/*)
  shared-schema, shared-ipc, vcg-format, template-runtime, lottie-bridge,
  text-shaping, starter-templates, caspar-client (protocol logic),
  storage (browser file storage), ui (design tokens + theme), eslint-config
tools/       # internal harnesses (amcp-mock, soak-runner, template-fixtures)
fixtures/    # canonical test data (templates, OSC traces, AMCP sessions)
docs/        # architecture phases + ADRs + user guides
```

## Quick start

```bash
pnpm install   # install / refresh node_modules
pnpm build     # build all @cg/* workspace packages so the apps can import them
```

Run an app — each is a Vite dev server in the browser:

```bash
pnpm --filter @cg/designer dev   # visual editor  → http://127.0.0.1:4000
pnpm --filter @cg/runtime  dev   # playout controller → http://127.0.0.1:5174
```

> The Designer's persistent "open a real folder" mode uses the File System
> Access API (Chromium: Chrome/Edge/Brave). Other browsers fall back to OPFS
> (sandboxed real files). See the storage ADR for details.

Test / lint / typecheck the whole monorepo:

```bash
pnpm test
pnpm lint
pnpm typecheck
```

### Local gate (while CI minutes are exhausted)

GitHub Actions minutes are currently exhausted (billing quota; resets ~2026-08-01),
so CI **cannot run**. Until it's back, the merge gate is enforced **locally**:

```bash
pnpm gate       # FAST full gate: typecheck + lint + test + build (uncached) + format:check + openspec validate
pnpm gate:e2e   # SLOW: the Playwright E2E suite (~6 min) — run manually, see below
```

- **`pnpm gate` runs automatically on every `git push`** (husky `pre-push` hook) and
  **blocks the push if it fails** — nothing that fails the fast gate gets pushed.
  Emergency bypass: `git push --no-verify` (or `HUSKY=0 git push`). Use it only when
  you know why.
- **E2E is NOT in the pre-push hook** (too slow at ~6 min) and is **not** run by
  `pnpm gate`. You MUST run `pnpm gate:e2e` yourself for **any UI / layout / rendering
  change** — that's the "passes locally by 19px of luck, red on CI" class of bug the
  E2E suite exists to catch. Ideally run it in a **Linux-like environment (WSL/Docker)**:
  CI runs on Linux and local (Windows) font/geometry differs, so a Windows-only E2E pass
  is not authoritative.
- `--force` is deliberate: it defeats a stale turbo cache (which has produced a false
  green before), so the gate genuinely re-runs every task rather than replaying a
  cached log.

## Documentation

- Contributing / backlog — [`CLAUDE.md`](./CLAUDE.md), [`docs/prd/`](./docs/prd) (write features/bugs here; Claude turns each into an OpenSpec change)
- Browser migration — [`docs/adrs/0007-electron-to-browser-migration.md`](./docs/adrs/0007-electron-to-browser-migration.md), [`docs/phases/phase-10-browser-migration.md`](./docs/phases/phase-10-browser-migration.md)
- Architecture — [`docs/phases/`](./docs/phases)
- Decisions — [`docs/adrs/`](./docs/adrs)
- Security — [`SECURITY.md`](./SECURITY.md)

## License

TBD.
