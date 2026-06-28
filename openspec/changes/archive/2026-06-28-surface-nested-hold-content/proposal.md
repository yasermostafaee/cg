# Surface nested-composition content that drives the hold (D-108)

## Why

D-107 added the Playout "which content closes the graphic?" checklist, but it
lists only the ACTIVE composition's OWN content (recursing groups, NOT nested
composition instances). The runtime, however, honors `drivesHold` recursively
(D-104's content-tree wait), so content inside nested composition instances DOES
drive the parent's hold. An operator looking at the parent's checklist can't see
this and may wrongly assume nested content is ignored.

It cannot simply be added to the togglable checklist: `drivesHold` is a property
of the SHARED child composition element (a nested instance is a `compositionId`
reference; its layers are not copied in), so toggling it from the parent would
silently mutate every other instance of that child. The fix is a READ-ONLY,
drill-in indicator that closes the discoverability gap without that footgun.

## What Changes

- **Designer only** — extend the recursive content walk D-107 added in
  `PlayoutSection.tsx` (the one that already reaches grouped content) to ALSO find
  the active composition's immediate nested composition instances and, for each,
  count the hold-driving content (`ticker` / `sequence` / countdown `clock` with
  `drivesHold !== false`) reachable through it — recursing the referenced
  composition's groups and its own deeper nested instances, cycle-guarded.
- A READ-ONLY nested section in the checklist lists each such instance by name
  with its count. Rows have NO toggle and indicate the flag is edited in the
  child's own checklist. Activating a row drills in via the existing
  `setActiveComposition` store action. The section is hidden when no nested
  instance contributes hold-driving content.
- Only IMMEDIATE instances are listed; deeper nesting surfaces one level at a time
  as the operator drills in.

Presentation only — no `drivesHold` writes from the parent, no runtime change, no
schema change.

## Capabilities

- `designer-playout-lifecycle` (ADDED): the Playout checklist surfaces
  nested-composition hold-driving content read-only, with drill-in. Builds on the
  D-107 requirement (folded by the `selective-content-hold` archive).

## Impact

- `apps/designer/src/renderer/features/inspector/PlayoutSection.tsx` (a
  `nestedHoldGroupsOf` walk + a read-only nested section in `ContentHoldChecklist`,
  drilling in via `designerStore.setActiveComposition`).
- A designer E2E (`surface-nested-hold-content.spec.ts`).
- No schema / runtime / store-API change (reuses `setActiveComposition`).
