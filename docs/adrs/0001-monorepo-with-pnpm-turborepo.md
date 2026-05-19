# ADR 0001 — Monorepo with pnpm + Turborepo

- **Status:** Accepted
- **Date:** 2026-05-19
- **Deciders:** Architecture series, Phases 1–8

## Context

The platform ships two Electron applications (Designer and Runtime) and a set of
shared libraries (schema, IPC contracts, UI primitives, CasparCG client, template
runtime, VCG format, etc. — see Phase 7). The two apps share the domain model and
several runtime components but have different update cadences, different security
profiles, and different installer artifacts.

Three repository shapes were considered:

1. **Multi-repo.** Each `apps/*` and each `packages/*` in its own git repo.
2. **Single app + libraries in one repo.** One Electron app with two modes, all
   libraries inline.
3. **Monorepo with two apps + shared packages.**

## Decision

Use option 3 — a monorepo containing:

- `apps/designer` and `apps/runtime` (two Electron apps, two installers).
- `packages/*` for shared, independently-versioned libraries (`@cg/*`).
- `tools/*` for internal harnesses (`amcp-mock`, `soak-runner`, etc.).

Tooling:

- **pnpm** for installs. Workspace protocol (`workspace:*`) for cross-package
  references; deterministic lockfile; disk-efficient store.
- **Turborepo** for task orchestration (build, lint, test, package). Local
  caching; remote caching deferred until team scale demands it.
- **changesets** for per-package version bumps. The two apps version in lockstep
  on major/minor; packages version independently.
- **TypeScript project references** for fast incremental builds and explicit
  dependency declarations between packages.

## Why not multi-repo

- Atomic refactors across the domain schema and consumers are routine (changing
  a Zod schema in `@cg/shared-schema` touches every app and package). Multi-repo
  turns these into orchestrated multi-PR dances.
- The apps must integration-test against the libraries they consume. Multi-repo
  forces a publish-and-bump loop for every change.
- Two engineers cannot reliably coordinate breaking changes across N repos.

## Why not one app, two modes

- Designer and Runtime have **incompatible reliability budgets.** The Runtime is
  air-critical; a Designer crash must not bring it down. Separate processes are
  necessary; separate apps make this explicit.
- Installer footprints diverge — Runtime typically lives on a rack workstation;
  Designer on an operator desk. Bundling them ships unwanted code to both.
- Update cadences differ — Runtime cannot auto-update during broadcast; Designer
  has no such constraint. Independent installers let policy diverge.

## Consequences

- Cross-app navigation is fast; refactors are atomic.
- One CI pipeline; one PR review surface.
- A single `pnpm install` provisions everything.
- ESLint rules (see ADR 0006 when written) enforce tier boundaries (renderer
  can't import Main-only code; apps can't import each other; the template
  runtime can't import Node).
- Lockfile churn is concentrated in one place; treat lockfile PRs with care.
- The repo will grow; expect 5–10 GB of `node_modules` once Electron is wired
  in. Plan disk accordingly (and do not host the working tree on a sync drive
  such as OneDrive — see README).

## Alternatives considered (briefly)

- **Nx** instead of Turborepo — heavier, opinionated about generators we don't
  need. Turborepo's smaller surface fits.
- **Lerna** — superseded by changesets + workspace tooling.
- **Bun** instead of pnpm — Bun + Electron native deps on Windows is not yet a
  smooth path; pnpm is safe.
