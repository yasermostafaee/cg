# A hidden content element is fully inert (B-034)

## Why

Hiding a content layer (a ticker / sequence, possibly `repeat: 'infinite'`) should make it fully
inert, but visibility was consulted NOWHERE in the hold-driver determination (confirmed). So a hidden
content element still drove the content-driven hold (a hidden infinite one froze the graphic), still
rendered, and still appeared in the preview timing controls.

## What Changes

- **Ancestor propagation (the case the leaf gate missed)** — a HIDDEN composition INSTANCE (or
  container) makes its ENTIRE subtree inert, so a VISIBLE infinite sequence inside a hidden instance no
  longer keeps the parent open. Every hold/listing walk SHORT-CIRCUITS at the hidden ancestor before
  collecting any descendant. Runtime: `FieldScopeChild`/`ScopeNode` carry the instance's `visible`;
  `aggregateContentWait`, `scopeHasEffectiveHoldDrivers`, and content-start skip hidden children.
  Schema/designer walks (`hasEffectiveHoldDrivers`, `hasContentElement`, `contentHoldElementsOf`,
  `nestedHoldGroupsOf`, `tickersOf`/`hasAnyContentIn`/`timingScopeList`, `findFiniteTicker`,
  `canStepScene`) gate container + composition recursion on `visible !== false`.
- **Runtime (`@cg/template-runtime`)** — `visible === false` excludes a content element from BOTH the
  scope's own hold drivers AND `contentDrivers` (so a parent `holdOverrides` can't force-include it),
  and from `scopeHasEffectiveHoldDrivers`. A hidden hold-eligible element therefore never drives a
  hold; a comp whose only content is hidden has no effective drivers ⇒ resolves to timed (B-032).
- **`@cg/shared-schema`** — `hasEffectiveHoldDrivers` applies the same `visible` gate (exporter +
  inspector resolution).
- **Designer (`PlayoutSection.tsx`, `PreviewScopeTiming.tsx`)** — the D-107/D-108/D-112 hold walks
  (`hasContentElement`, `contentHoldElementsOf`, `nestedHoldGroupsOf`) and the preview per-element
  timing walks (`tickersOf`, the content-source check) exclude `visible === false`.
- **Exporter (`apps/designer/src/platform/ExporterSingleFile.ts`)** — `findFiniteTicker` (the
  `ticker-finite-with-timed-hold` preflight) now skips `visible === false`, so a hidden ticker raises
  no operator-facing export diagnostic.
- **Transport (`apps/designer/src/renderer/features/fields/PreviewModal.tsx`)** — `canStepScene` now
  skips a hidden sequence, so a hidden sequence does not enable the preview Next control ("no effect of
  any kind from a hidden element").
- **Render** — already correct (`applyBaseStyles` sets `display: none` for `!visible`, covered by the
  existing `hide-clock-sequence` E2E); no change.

The gate is HARD: it overrides `drivesHold` and per-instance `holdOverrides`. It is applied where each
runtime content-driver is BUILT — so a hidden element is absent from the unfiltered `contentDrivers`
array that a parent override re-filters, and a force-include override cannot resurrect it.

A 7-agent adversarial audit (one refuter per surface + a real-`.vcg` inspection) confirmed every other
hold-participation path — runtime own + nested aggregation, B-032 timed resolution, exporter playout
metadata, and the Designer checklist / preview timing — already gates `visible !== false` BEFORE
`drivesHold`/`holdOverrides`; the exporter preflight above was the one residual leak it surfaced.

## Capabilities

- `designer-playout-lifecycle` (ADDED): a hidden content element is inert.

## Impact

- `packages/template-runtime/src/runtime.ts`, `packages/shared-schema/src/scene.ts`,
  `apps/designer/src/renderer/features/inspector/PlayoutSection.tsx`,
  `apps/designer/src/renderer/features/fields/PreviewScopeTiming.tsx`,
  `apps/designer/src/platform/ExporterSingleFile.ts`.
- `apps/designer/src/renderer/features/fields/PreviewModal.tsx` (`canStepScene`).
- **Fixture** — `fixtures/b034/hidden-content-inert.{scene.json,vcg}` (+ `.gen.mjs`): a REAL,
  schema-validated template with a content-driven parent instancing a child whose only content is a
  HIDDEN infinite ticker (with a per-instance `holdOverrides` force-include), plus a hidden finite
  ticker under a timed comp and a hidden sequence. The guards assert against THIS scene, not only
  inline constructed comps.
- Tests: runtime (a hidden infinite driver doesn't force the hold; a hidden finite driver doesn't gate
  it; a parent override cannot force-include a hidden nested driver; a hidden nested driver doesn't
  extend the parent hold) + runtime fixture (the real `.vcg` scene: force-included hidden crawl is
  inert, parent settles via timed; `hasEffectiveHoldDrivers` false, un-hiding flips it true) + a
  designer E2E (hidden own ticker dropped from the checklist + preview timing, warning cleared; a
  hidden NESTED driver dropped from the parent nested checklist, un-hiding restores it; a hidden
  sequence keeps the transport Next disabled) + an exporter unit test (a hidden finite ticker raises no
  preflight) + a designer fixture test (the `.vcg` round-trips; the real hidden finite ticker raises no
  preflight, un-hiding it does). No schema change, no version bump.
