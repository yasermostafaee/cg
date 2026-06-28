# Design — resolve a content-less content-driven hold to timed (B-032 ext)

## Recon

- `playoutOf` (`scene.ts:284`) resolves a stored `holdSource` as-is (defaulting absent → `timed`); it
  is content-AGNOSTIC, so it cannot itself decide "no drivers".
- The runtime's `effectivePlayoutFor` (`runtime.ts`) = `playoutOf(scope.source)` + session overrides;
  `isCoordinator = mode !== 'manual' && holdSource === 'content-driven'`; a coordinator with no
  drivers gets a zero-length hold (`aggregateContentWait` → null) that ignores `holdMs`.
- The exporter's `buildPlayoutMetadata` (`playout-metadata.ts`) bakes `holdSource: content-driven`
  from `playoutOf`; the inlined runtime reads `scene.playout` directly, so both need the same fix.
- The inspector already computes `holdSourceEff = hasContent ? (holdSource ?? 'timed') : 'timed'` —
  so it SHOWS the holdMs control for a content-less comp, but the runtime/export disagreed: the bug.
- A content-less comp becomes content-driven only by set-then-delete (the Hold-source select is gated
  on `hasContent`), so there is no create-default to fix — the resolution boundary repairs it.

## Decision: resolve at the boundary, not deep in the coordinator

A single rule — `holdSource === 'content-driven' && no effective drivers ⇒ timed` — applied at every
place playout is finalized: the runtime's per-scope `effectivePlayoutFor`, the exporter's
`buildPlayoutMetadata`, and the inspector's `holdSourceEff`. This (a) fixes EXISTING scenes with no
re-authoring (the stored `content-driven` stays; it just resolves), (b) keeps export + on-air in
agreement (both resolve identically), and (c) avoids touching the coordinator/aggregation engine
(lower risk than the alternative of special-casing a null content wait inside the hold). No
delete-time store mutation is needed.

## Decision: "effective drivers" predicate (two mirrors of one rule)

`hasEffectiveHoldDrivers` = any `ticker` / `sequence` / countdown `clock` with `drivesHold !== false`
in the comp's OWN layers (recursing containers) OR reachable through a nested composition instance
(recursing, cycle-guarded). Two implementations of the IDENTICAL rule, because the data differs:

- **`@cg/shared-schema` `hasEffectiveHoldDrivers(root, compositions)`** — walks the SCENE tree. Used
  by the exporter and the inspector.
- **`@cg/template-runtime` `scopeHasEffectiveHoldDrivers(scope)`** — walks the already-built
  `FieldScope` (`scope.tickers/clocks/sequences/children`). Used by `effectivePlayoutFor`, because
  `LifecycleSource` (what the resolver gets) does not expose `layers`, but the FieldScope mirrors the
  same comp tree by construction, so the two agree.

Applied recursively (per scope), a content-less NESTED coordinator also resolves to timed → becomes a
non-coordinator → the parent does not wait on it, staying consistent with the static walk (which
finds no content). A comp whose only content is nested keeps real drivers → stays content-driven.

## Decision: D-112 forward-compat

The driver predicate is `drivesHold`-only on `main` (which lacks D-112's `holdOverrides`). Once D-112
lands, the per-instance overrides fold into the nested-driver test (an instance that excludes its only
driver should resolve that branch to no-driver). Noted in both helpers.

## Out of scope

- A delete-time store mutation (the resolution boundary makes it unnecessary).
- Showing the timed/content-driven SELECT for a content-less comp (it has no content to drive, so the
  choice is moot — the holdMs control already appears; the operator is not trapped).
- Any coordinator/aggregation engine change.
