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
- **Render** — already correct (`applyBaseStyles` sets `display: none` for `!visible`, covered by the
  existing `hide-clock-sequence` E2E); no change.

The gate is HARD: it overrides `drivesHold` and per-instance `holdOverrides`.

## Capabilities

- `designer-playout-lifecycle` (ADDED): a hidden content element is inert.

## Impact

- `packages/template-runtime/src/runtime.ts`, `packages/shared-schema/src/scene.ts`,
  `apps/designer/src/renderer/features/inspector/PlayoutSection.tsx`,
  `apps/designer/src/renderer/features/fields/PreviewScopeTiming.tsx`.
- Tests: runtime (a hidden infinite driver doesn't force the hold; a hidden finite driver doesn't
  gate it) + a designer E2E (hidden ticker dropped from the checklist + preview timing, warning
  cleared). No schema change, no version bump.
