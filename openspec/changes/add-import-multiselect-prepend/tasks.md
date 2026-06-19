# Tasks — import multi-select + prepend (D-067 follow-up)

## 1. Bridge: split import → pick + store

- [x] `pickFiles(kind?)` helper — multi-select file input → `File[]` (`[]` if cancelled).
- [x] Contract + impl: replace `assets.import` / `sharedImages.import` with `pick(kind?) → File[]` and
      `store(file, kind?) → { asset | image }`. (Plain bridge methods; no IPC channel change.)

## 2. Panels: multi-file import with per-file tiles

- [x] `ProjectAssetsPanel.importKind` + `SharedLibraryPanel.addImage`: `pick()` → one tile per file →
      `store()` each independently. Import in reverse selection order so the prepend lands the batch
      selection-order at the top; a failed file clears only its tile (others still import); a cancelled
      pick (`[]`) shows nothing.

## 3. Prepend (newest first)

- [x] `useAssets` + `useSharedImages`: prepend on import, and reverse the initial (oldest→newest) list,
      so a freshly imported asset is at the TOP. D-068 search still filters (order-preserving).

## 4. Tests

- [x] `useImportPending` begin/end (idempotent).
- [x] Component (jsdom), both panels: cancel → no tile; multi-select → N tiles → all prepended in
      selection order; one-of-N failing clears its tile and the rest import; fresh import prepended above
      existing items; project font path also shows a tile.

## 5. Gate / docs

- [x] Full green gate (uncached) for `@cg/designer`.
- [x] `openspec validate add-import-multiselect-prepend --strict`.
