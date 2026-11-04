# Change: Reconcile the current Designer with the revised starter gallery

## Why

The owner requested the latest browser Designer and the latest gallery together. The isolated
gallery preview had retained an older shell while the owner's working checkout contained newer
authoring features. Refreshing that older bundle could not show the current product.

## What Changes

- Reconcile the owner's browser Designer, its required shared contracts and documentation with the
  reviewed gallery and lifecycle fixes in the isolated preview worktree.
- Preserve current Landing import, Preview workspace, Variables binding, Presets/Plates, contextual
  Inspector help, media timing/import and New Project contracts alongside the gallery corrections.
- Preserve the owner's original checkout and supplied projects; do not overwrite its uncommitted work.
- Resolve documentation conflicts without discarding accepted requirements, inventing completed
  work, or treating either source snapshot's prior tests as evidence for the merged result.
- Build and verify the integrated browser preview before refreshing the page for owner review.

## Capabilities

- Added integration acceptance under `designer-shell`; existing feature changes remain the source
  of truth for their detailed behavior.

## Impact

Browser Designer, required shared schemas/IPC/runtime/export helpers, matching tests and tracked
PRD/OpenSpec/engine documentation. This change does not adopt native/Tauri, installer/release or
CG Control-only work in progress. It does not authorize a deployment to an on-air station.

Prior local gate results, including the 103/103 pre-reconciliation run, describe the earlier tree
only. Merged-tree build, browser acceptance and final completed Linux E2E evidence remain owed.
