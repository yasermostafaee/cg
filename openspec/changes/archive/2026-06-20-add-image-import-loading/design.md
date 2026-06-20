# Design — image-import loading indicator (D-067)

Lightweight UI feedback; the import logic is untouched.

## The import flow (verified — STEP 0)

Both panels have SEPARATE import paths with an identical shape:

- **Project Assets:** `importKind(kind)` → `window.cg.assets.import({sourcePath:'', kind})` → bridge
  `pickFile(kind)` → `AssetStore.importFile` (read → sha256 → write → persist → `imported.emit`) →
  `useAssets` appends + primes the blob URL → `AssetThumb` renders.
- **Shared Library:** `addImage()` → `window.cg.sharedImages.import()` → bridge `pickFile('image')` →
  `SharedImageStore.importFile` (read → sha256 → **decode dimensions** → write → persist →
  `imported.emit`) → `useSharedImages` appends + primes → `SharedImageThumb` renders.

The async gap is INSIDE `import()`, after the file is picked and during `importFile` (+ the list/URL
settle), where there is no feedback today. The panel `await`s `import()`, so it already owns the pending
window — no new event or bridge change is needed.

## Decisions

- **Shared mechanism, separate paths.** The two paths aren't literally shared, so the reuse is a small
  `useImportPending` hook (pending count; `track(p)` increments then decrements in `finally`) + a shared
  `ImportingThumb` tile — used identically in both panels.
- **Clear on resolve AND reject.** `finally` guarantees the indicator clears on cancel/error (the
  "no stuck spinner" requirement). The file-dialog wait is included in the pending window, but the panel
  sits behind the OS modal then, so the indicator is seen exactly where it matters (decode/store), and a
  cancel rejects → cleared. Showing it strictly post-pick would need a bridge "picked, now importing"
  signal — out of the lightweight scope.
- **Tile, not a bar.** A per-item spinner tile in the grid/list (reusing `AssetThumb`'s frame) matches
  "a skeleton/spinner on the in-progress item" and needs no layout surgery; a pending count supports
  concurrent imports (the project panel can import image or font).
- **Empty-state suppressed while pending** so the very first import shows the tile, not "No assets yet".

## Out of scope

- Real byte-level progress percentage (the bridge resolves atomically); per-file cancel; retry UI.
