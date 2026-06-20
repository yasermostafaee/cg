# Import: multi-select + prepend, on a pick→store seam (D-067 follow-up)

## Why

D-067 added an import loading indicator, but the import flow was still single-file and appended new
assets to the BOTTOM of the list. Two flow gaps remain: you can't import several files at once, and a
freshly imported file is hard to find (it lands at the end). Both live in the same pick→store seam, so
this folds them into one pass.

## What Changes

- **Split the bridge `import()` into `pick()` + `store()`** so the renderer drives picking: `pick(kind?)`
  opens a (multi-select) file dialog and returns the chosen `File[]` (empty if cancelled); `store(file)`
  imports one file. This also subsumes the D-067 "show the tile only after a real selection" behaviour —
  a cancelled picker returns `[]`, so no tile is ever shown.
- **Multi-select:** picking N files shows N loading tiles; each file is imported independently — one
  failing clears only its own tile and the rest still import — and the batch is prepended in selection
  order (newest batch on top).
- **Prepend:** a freshly imported asset appears at the TOP of the list (project + shared); the list is
  newest-first. The D-068 Shared Library search still filters correctly (order-preserving).

## Capabilities

### Modified Capabilities

- `designer-shared-image-library` — multi-file shared-library import with per-file tiles; fresh imports
  prepended (newest first).
- `designer-project-assets` — multi-file project-asset import (image + font) with per-file tiles; fresh
  imports prepended (newest first).

## Impact

- **Modified (UI):** `ProjectAssetsPanel` + `SharedLibraryPanel` (pick→store loop, per-file tiles),
  `useAssets` + `useSharedImages` (prepend + newest-first list), the `window.cg` bridge contract + impl
  (`pick`/`store` replace `import`; `pickFiles` multi-select helper). No `@cg/shared-ipc` change — `pick`
  / `store` are plain bridge methods (browser `File` objects in-process, like `url()`), not IPC channels.
- No schema / store-format change.
