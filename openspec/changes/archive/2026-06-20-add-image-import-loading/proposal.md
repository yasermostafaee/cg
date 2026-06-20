# Image-import loading indicator (D-067)

## Why

Importing an image — especially a large one — takes a perceptible moment (read bytes, sha256, decode,
write to the workspace, then list-refresh) with **no feedback today**: after the file dialog closes the
panel just sits unchanged until the thumbnail pops in. Both asset panels (Project Assets and Shared
Library) have this dead gap. Surface a lightweight loading state so the operator knows the import is
working.

## What Changes

- During an image import, the panel shows a loading tile (a spinner skeleton with an "Importing…"
  caption) in the asset grid/list, cleared when the import resolves (the real thumbnail takes over via
  the existing list refresh) **or** rejects (cancel / error — never a stuck spinner).
- Applies to **both** panels. They don't share an import path (separate bridge methods / stores /
  hooks), so the shared mechanism is: a tiny `useImportPending` hook (a pending count that wraps the
  `import()` await) + a shared `ImportingThumb` tile, used identically in both panels.
- No change to the import logic itself — only pending state is surfaced around the existing
  `window.cg.assets.import` / `window.cg.sharedImages.import` calls.

## Capabilities

### Modified Capabilities

- `designer-shared-image-library` — the shared library shows an import-loading indicator (new requirement).

### Added Capabilities

- `designer-project-assets` — **net-new**: the per-project Project Assets panel had no living capability
  (D-011 was never specced, like image-element behaviour before D-040), so its import-loading indicator
  is captured net-new here. (The task framed this as MODIFYING a per-project assets capability; there
  is none, so it is added.)

## Impact

- **New:** `apps/designer/src/renderer/features/assets/ImportingThumb.tsx` (+ `.css.ts`); a
  `useImportPending` hook.
- **Modified:** `ProjectAssetsPanel.tsx` and `SharedLibraryPanel.tsx` (pending state around the import
  call + render the tile; empty-state suppressed while an import is pending). UI only — no schema /
  store / bridge / resolver change.
