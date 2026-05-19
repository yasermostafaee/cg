# cg — Broadcast CG Platform

Two-product desktop platform for TV networks using CasparCG playout:

- **Designer** — visual editor for broadcast HTML graphics (logo bugs, lower thirds, tickers, breaking news, fullscreen).
- **Runtime** — playout controller driving CasparCG via AMCP + OSC, with primary/backup redundancy.

Windows-only, Electron, TypeScript, Persian/RTL as a core requirement.

## Status

Pre-implementation. Architecture is complete (Phases 1–8); see [`docs/`](./docs).
Current milestone: **M0 — Foundation**.

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

```pwsh
pnpm install
pnpm build
pnpm test
pnpm lint
```

## Documentation

- Architecture — [`docs/phases/`](./docs/phases)
- Decisions — [`docs/adrs/`](./docs/adrs)
- Security — [`SECURITY.md`](./SECURITY.md)

## License

TBD.
