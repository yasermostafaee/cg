# ADR 0002 — Two separate Electron apps (Designer + Runtime)

- **Status:** Accepted
- **Date:** 2026-05-19
- **Supersedes:** —
- **Related:** ADR 0001 (monorepo)

## Context

The platform has two distinct products. Phase 1's analysis identified that
bundling them into a single Electron app is tempting (shared shell, one
installer) but architecturally wrong for broadcast software.

## Decision

Ship two independent Electron applications:

- `@cg/designer` — visual template editor.
- `@cg/runtime` — playout controller.

Each has its own:

- Electron main process and renderer.
- Installer artifact (NSIS for desk install; portable zip for air-gapped sites).
- Update channel and policy.
- Code-signing pipeline.
- Crash domain.

Shared code lives in `packages/*` and is consumed by both.

## Rationale

1. **Crash isolation.** A renderer crash in the Designer must not affect a live
   Runtime. Separate processes — and ideally separate machines — make this
   structural.
2. **Reliability budgets differ.** The Runtime is air-critical (24/7, never
   crash). The Designer is creative software (acceptable to slow down, recover
   from undo, etc.). Different budgets mean different engineering tradeoffs;
   one app forces the lowest common denominator.
3. **Update cadence differs.** The Runtime's auto-updater is gated by
   `on_air==false` for ≥ 5 minutes. The Designer has no such gate. Independent
   installers let these policies diverge cleanly.
4. **Footprint.** A rack-mounted playout box does not need the Designer's UI
   libraries, Konva/canvas tooling, font preview machinery, etc. Two installers
   keep each footprint minimal.
5. **Security profile.** The Designer reads arbitrary user-supplied assets
   (images, Lottie JSON, fonts) and runs templates in a preview iframe. The
   Runtime talks to CasparCG over plaintext TCP/UDP. The threat models diverge;
   defense-in-depth is easier when the apps are separate.
6. **Deployment topology.** Real stations install Designer on operator desks
   and Runtime on dedicated playout workstations. Two installers match reality.

## Consequences

- Two `electron-builder` configurations, two release pipelines, two sets of
  installer assets. Acceptable cost.
- Shared UI primitives must live in `@cg/shared-ui`, not be copy-pasted.
- Cross-app navigation (e.g., "open this `.vcg` in Designer from Runtime") is a
  cross-process gesture — implemented via OS file-open verbs, not IPC.
- Two apps in one monorepo (per ADR 0001) keep the development experience
  unified despite the artifact split.

## Alternatives considered

- **One app, two BrowserWindows.** Considered. Rejected because Electron's
  crash isolation between windows is partial; a runaway renderer can still
  starve the main process that drives both windows.
- **One app, two modes (route-switched).** Worst of all worlds — couples the
  reliability budgets and prevents installer divergence.
