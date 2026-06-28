# A hidden content element is fully inert (B-034)

## Why

Hiding a content layer (a ticker / sequence, possibly `repeat: 'infinite'`) should make it fully
inert, but visibility was consulted NOWHERE in the hold-driver determination (confirmed). So a hidden
content element still drove the content-driven hold (a hidden infinite one froze the graphic), still
rendered, and still appeared in the preview timing controls.

## What Changes

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
- Tests: runtime (a hidden infinite driver doesn't force the hold; a hidden finite driver doesn't gate
  it; a parent override cannot force-include a hidden nested driver; a hidden nested driver doesn't
  extend the parent hold) + a designer E2E (hidden own ticker dropped from the checklist + preview
  timing, warning cleared; a hidden NESTED driver dropped from the parent nested checklist, un-hiding
  restores it) + an exporter unit test (a hidden finite ticker raises no preflight). No schema change,
  no version bump.
