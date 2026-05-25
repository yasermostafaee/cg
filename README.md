# cg — Broadcast CG Platform

[![PR](https://github.com/yasermostafaee/cg/actions/workflows/pr.yml/badge.svg)](https://github.com/yasermostafaee/cg/actions/workflows/pr.yml)

Two-product desktop platform for TV networks using CasparCG playout:

- **Designer** — visual editor for broadcast HTML graphics (logo bugs, lower thirds, tickers, breaking news, fullscreen).
- **Runtime** — playout controller driving CasparCG via AMCP + OSC, with primary/backup redundancy.

Windows-only, Electron, TypeScript, Persian/RTL as a core requirement.

## Status

Architecture complete (Phases 1–8); see [`docs/`](./docs).

- **M0 — Foundation:** done (tag `m0`).
- **M1 — De-Risking Spike:** harnesses prepared (tag `m1-prep`); spike execution
  pending a reachable CasparCG 2.3.x. See [`tools/spikes/`](./tools/spikes).

## Layout

```
apps/        # shippable Electron applications (designer, runtime)
packages/    # shared libraries (@cg/*)
tools/       # internal harnesses (amcp-mock, soak-runner, ...)
fixtures/    # canonical test data (templates, OSC traces, AMCP sessions)
docs/        # architecture phases + ADRs + user guides
```

See [`docs/phases/phase-7-folder-structure.md`](./docs/phases/phase-7-folder-structure.md) for the full breakdown.

## Quick start

One-time setup after a fresh clone or `git pull` on `main`:

```pwsh
pnpm install   # install / refresh node_modules
pnpm build     # build all @cg/* workspace packages so the Electron apps can import them
```

Run an app — each in its own PowerShell window:

```pwsh
pnpm --filter @cg/designer dev   # visual editor (port 5173)
pnpm --filter @cg/runtime  dev   # playout controller (port 5174)
```

Optional — give the Runtime a CasparCG mock so the OFFLINE pills go green:

```pwsh
pnpm --filter @cg/amcp-mock dev
```

Test / lint / typecheck the whole monorepo:

```pwsh
pnpm test
pnpm lint
pnpm typecheck
```

If a window won't close or a dev-server port stays bound, kill any stale
Electron / node processes belonging to this repo:

```pwsh
Get-Process -Name electron,node -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like '*claude projects\cg*' } |
  Stop-Process -Force
```

## Documentation

- Architecture — [`docs/phases/`](./docs/phases)
- Decisions — [`docs/adrs/`](./docs/adrs)
- Security — [`SECURITY.md`](./SECURITY.md)

## License

TBD.
