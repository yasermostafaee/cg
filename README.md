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
- **Runtime — browser:** running. The CasparCG control path goes through a
  small local WebSocket↔TCP bridge (browsers can't open raw sockets) — see
  [The CasparCG bridge](#the-casparcg-bridge) for how to start it. With no
  bridge reachable the SPA still runs, against an in-memory mock.

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

### The CasparCG bridge

The Runtime SPA drives real CasparCG through a small local process (browsers
can't open raw TCP/UDP). Start it from the repo root, in its own terminal:

```bash
pnpm build                                    # REQUIRED after any source change — see below
node tools/caspar-bridge/bin/caspar-bridge.mjs
```

Then start the Runtime SPA (`pnpm --filter @cg/runtime dev`); it connects to
`ws://127.0.0.1:5280` on its own.

**It runs from `dist/`, not from `src/`.** The launcher imports the compiled
`tools/caspar-bridge/dist/index.js`, so editing a `.ts` file and restarting runs
the OLD code, silently and with no warning. `pnpm build` first, every time — and
build the whole workspace, not just the bridge, because most of the real logic
lives in `@cg/caspar-client` and `@cg/shared-ipc`.

At boot it prints what it bound and, on the second line, **the candidate-layer
bank in force and where that bank came from**:

```
[caspar-bridge] WS listening on ws://127.0.0.1:5280 → CasparCG via @cg/caspar-client
[caspar-bridge] candidate layers: channel 1, layers 70-99 (30 declared, 5 shown) - from built-in default (no file at C:\Users\you\.cg-runtime\bridge-fixed-layers.json)
```

#### What a new machine needs

**For the candidate layers, nothing.** A machine with no config comes up on
channel 1, layers 70–99, thirty rows declared with the top five (99, 98, 97, 96, 95) shown. `~/.cg-runtime/bridge-fixed-layers.json` records a _deviation_ from
that default — it does not supply it, and a machine that never deviates never
needs the file. **A machine that already has one keeps whatever it says**, which
is the one thing to check when standing up a machine that has been used before:
read the `candidate layers:` line above, and if the bank is not the one you want,
delete the file and restart. Nothing overwrites it for you.

**Nothing else, either, if CasparCG is on the same box** — the built-in
connection is a single server at `127.0.0.1:5250` (AMCP) / `6250` (OSC). If it
isn't, set it in the Runtime's SERVER CONNECTION dialog, which persists to
`~/.cg-runtime/bridge-connection.json`.

Two things are genuinely per-machine and no default can fix them:

- **The template library** (`~/.cg-runtime/bridge-templates`) — a new machine
  starts empty. Import the Designer's `.vcg` exports from the Runtime's Library.
  This is expected, not a regression.
- **The connection config** — host and ports differ per machine by definition.

If the station's playout system owns layers of its own, declare them
(`--reserved-layers 60-69`, or `~/.cg-runtime/bridge-reserved-layers.json` to
survive a restart). With no declaration, **nothing is reserved** — the bridge
never guesses which layers belong to someone else.

#### Flags

All optional; each is shown with what it defaults to.

| Flag                                       | Default                                     |
| ------------------------------------------ | ------------------------------------------- |
| `--host` / `--port`                        | `127.0.0.1` / `5280` (WebSocket bind)       |
| `--caspar-host`                            | `127.0.0.1`                                 |
| `--amcp-port` / `--osc-port`               | `5250` / `6250`                             |
| `--backup-host`                            | none — a backup is declared, never assumed  |
| `--backup-amcp-port` / `--backup-osc-port` | `5251` / `6251`                             |
| `--reserved-layers`                        | nothing reserved (`60-69` or `60-69,105`)   |
| `--persist-path`                           | `~/.cg-runtime/bridge-connection.json`      |
| `--fixed-layers-path`                      | `~/.cg-runtime/bridge-fixed-layers.json`    |
| `--reserved-layers-path`                   | `~/.cg-runtime/bridge-reserved-layers.json` |
| `--templates-dir`                          | `~/.cg-runtime/bridge-templates`            |

> **A flag is per-run; the file is what survives a restart.** `--caspar-host`,
> the `--amcp-*`/`--osc-*`/`--backup-*` ports and `--reserved-layers` all
> override the persisted file for that run **without writing to it** — close the
> terminal and the override is gone. To change a setting for good, change the
> file: the SERVER CONNECTION dialog's Apply writes the connection one, and the
> `*-path` flags above only move _where_ a file lives, they never supply a value.

#### Stopping it

**Ctrl+C** in its terminal — it handles SIGINT and shuts the CasparCG session
down cleanly.

> ⚠️ **Never `Stop-Process -Name node -Force` on Windows.** It kills every node
> process on the machine, which includes any running Claude Code session and
> VS Code / Cursor helpers. Target the bridge by its port instead:
>
> ```powershell
> $bridgePid = (Get-NetTCPConnection -LocalPort 5280 -State Listen).OwningProcess
> Stop-Process -Id $bridgePid
> ```
>
> (`$bridgePid`, not `$pid` — `$pid` is a read-only PowerShell automatic variable.)

#### Which build is running?

**You can't currently tell.** Nothing the bridge prints identifies the commit or
build time it came from, so a bridge started before a rebuild is
indistinguishable from one started after — which has twice led to working code
being judged broken. Until a build stamp lands, the only reliable procedure is
to stop it, `pnpm build`, and start it again.

Test / lint / typecheck the whole monorepo:

```bash
pnpm test
pnpm lint
pnpm typecheck
```

### CI is the authoritative gate; the local gate is pre-push feedback

**GitHub Actions is running again**, and `.github/workflows/pr.yml` triggers on every
push to `dev` (and to `main`) as well as on pull requests. CI is therefore the
**authoritative** gate: it runs lint / typecheck / test / build **and the full Playwright
suite on `ubuntu-latest`**, which is the only signal that settles pixel and layout
geometry. A Linux `gate:e2e` debt is discharged only by a COMPLETED, GREEN `e2e` job for
the commit carrying the change, cited by its run URL — a run cancelled by a newer push is
not a result (`cancel-in-progress: true`). See CLAUDE.md, "E2E coverage".

The local gate has NOT gone away, but its job is narrower: **fast feedback before you
push**, so obvious breakage never reaches CI. It is not the landing gate.

```bash
pnpm gate       # FAST full gate: typecheck + lint + test + build (uncached) + format:check + openspec validate
pnpm gate:e2e   # SLOW: the Playwright E2E suite (~6 min) — run manually, see below
```

- **`pnpm gate` runs automatically on every `git push`** (husky `pre-push` hook) and
  **blocks the push if it fails** — nothing that fails the fast gate gets pushed.
  Emergency bypass: `git push --no-verify` (or `HUSKY=0 git push`). Use it only when
  you know why.
- **E2E is NOT in the pre-push hook** (too slow at ~6 min) and is **not** run by
  `pnpm gate`. Running `pnpm gate:e2e` locally for a **UI / layout / rendering** change is
  still useful early warning for the "passes locally by 19px of luck, red on CI" class of
  bug — but a Windows pass is **not authoritative** and never discharges the Linux debt.
  The Linux run now comes from CI on every `dev` push; you no longer need WSL/Docker to
  obtain one.
- `--force` is deliberate: it defeats a stale turbo cache (which has produced a false
  green before), so the gate genuinely re-runs every task rather than replaying a
  cached log.

### The gate is self-enforcing for Claude Code sessions (P-009)

A committed **Stop hook** (`.claude/settings.json` → `.claude/hooks/gate-stop.mjs`)
runs when a Claude Code turn ends and refuses to let it end red:

- it classifies the turn's changed files (working tree ∪ the turn's commits vs the
  `origin/dev` merge-base — `origin/main`, then the working tree alone, are the
  fallbacks): **docs-only** → openspec validate strict + format:check
  (the CLAUDE.md carve-out); **anything else** → `pnpm gate`;
- **it does NOT run `pnpm gate:e2e`** (P-028). A **UI/render** diff (renderer sources,
  template-runtime, lottie-bridge, ui, single-file-export, `*.css.ts`, the E2E
  suites/configs) is still detected, and the hook prints a **non-blocking reminder**
  that a Linux `gate:e2e` is owed — but the suite runs on **CI**, on Linux, on every
  push to `dev`. A local Windows run cost ~224 s per turn and could never discharge the
  debt, so it bought time rather than evidence. Set **`CG_GATE_HOOK_E2E=1`** to opt the
  local run back into the hook for a turn;
- a red gate **blocks the turn** and feeds the failing tail back to the session with
  repair rules that forbid deleting/skipping/loosening tests — at most **twice per
  session**, then it stands down and asks for human eyes (full logs in
  `.gate-logs/`, gitignored).

Escape hatch (yours, not the model's): `{"disableAllHooks": true}` in
`.claude/settings.local.json`. The pure decision logic + its unit tests live in
[`tools/gate-hook/`](./tools/gate-hook).

## Documentation

- Contributing / backlog — [`CLAUDE.md`](./CLAUDE.md), [`docs/prd/`](./docs/prd) (write features/bugs here; Claude turns each into an OpenSpec change)
- Browser migration — [`docs/adrs/0007-electron-to-browser-migration.md`](./docs/adrs/0007-electron-to-browser-migration.md), [`docs/phases/phase-10-browser-migration.md`](./docs/phases/phase-10-browser-migration.md)
- Architecture — [`docs/phases/`](./docs/phases)
- Decisions — [`docs/adrs/`](./docs/adrs)
- Security — [`SECURITY.md`](./SECURITY.md)

## License

TBD.
