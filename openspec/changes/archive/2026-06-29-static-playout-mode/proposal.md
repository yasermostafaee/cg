# `static` playout mode for compositions with no out-point (D-114)

## Why

Without a lifecycle out-point there is no outro segment, so `manual` is misleading (its `stop()` plays
nothing visible) and `auto-out` / `loop-cycle` are impossible (they need a marker to fire the animated
exit from). A distinct `static` mode makes the model honest: a no-out-point composition plays its
intro, holds, and hard-cuts on `stop()` — no animated exit. This REVISES D-113: clearing the out-point
now reverts an out-point-dependent mode to `static`, not `manual`.

## What Changes

- **Schema (`@cg/shared-schema`)** — add `static` to `PlayoutModeSchema` (non-breaking, a 4th enum
  value). **`playoutOf` becomes the authority**: its signature widens from `Pick<Scene, 'playout'>` to
  `Pick<Scene, 'playout' | 'lifecycle'>`, and it RESOLVES a no-out-point composition (no `lifecycle`)
  to `mode: 'static'` on read — non-destructive (no migration, no schema-version bump), mirroring the
  existing legacy `content-driven` normalization. So "no out-point ⇒ static" holds everywhere a single
  resolver is read: the runtime controller (`effectivePlayoutFor` → `playoutOf(scope.source)`), the
  exporter metadata, and the inspector.
- **Runtime (`@cg/template-runtime`)** — `PlayoutController.onIntroEnd` gains a `static` branch: hold
  frozen until `stop()` (like `manual`), and `startOutro` plays an EMPTY outro for `static` (a clean
  cut, no outro path) — robust even if a stored `static` carried a stray out-point.
- **Designer state** — `setLifecycle(null)` (the single clear path, D-113) flips its revert target
  from `manual` to `static`, preserving the ONE-DIRECTIONAL invariant (re-adding an out-point does NOT
  auto-restore the prior mode).
- **Designer UI** — `PlayoutSection`: add the `static` label; with NO out-point the mode is `static`
  and `manual`/`auto-out`/`loop-cycle` are disabled; adding an out-point re-enables them and disables
  `static`; hold-source / hold-ms are hidden for `static` (no out-point-dependent exit).

## Capabilities

- `designer-playout-lifecycle` (MODIFIED): the playout-mode set gains `static`; the D-113 clear-revert
  invariant retargets to `static`.

## Impact

- `@cg/shared-schema` (`PlayoutModeSchema`, `playoutOf` signature + resolution), `@cg/template-runtime`
  (`playout-controller.ts`), `@cg/vcg-format` + `apps/designer` exporters/inspector/state (all
  `playoutOf` callers already pass a doc/comp/scope that carries `lifecycle`). preview == export (one
  resolver, one controller). No migration — existing no-out-point scenes simply resolve to `static`.
- Tests: schema round-trip + `playoutOf` resolution; controller (`static` cut-on-stop, no outro);
  store (clear ⇒ static, one-directional); a `.vcg` fixture (a no-out-point composition cuts on stop);
  the D-113 store + E2E retargeted to `static`.
