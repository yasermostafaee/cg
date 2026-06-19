# Tasks — image-import loading indicator (D-067)

## 1. Shared mechanism

- [x] `useImportPending` hook (`features/assets/`): a pending count; `begin()` increments and returns an
      idempotent `end()` (decrement). Callers start it only once a file is selected and call `end()` in a
      `finally` (clears on success AND error; never shows on a cancelled picker).
- [x] `ImportingThumb` component (+ `.css.ts`): a spinner tile reusing `AssetThumb`'s cell/thumb frame,
      with a `layout: 'grid' | 'list'` prop and an `"Importing…"` caption; stable `data-role="importing-thumb"`.

## 2. Surface the "file picked" moment + wire both panels

- [x] Bridge: add an optional `onPicked?: () => void` to `assets.import` and `sharedImages.import`
      (contract + impl); the impl fires it right after a file is selected, before decode/store (cancel
      never reaches it).
- [x] `ProjectAssetsPanel`: `importKind` starts the tile in `onPicked` (`end = begin()`) and clears it in
      `finally` — for both the image and font add paths; render one tile per pending import; don't show
      the empty state while pending.
- [x] `SharedLibraryPanel`: same wiring around `addImage`.

## 3. Tests

- [x] Unit: `useImportPending` — pending goes 1 then 0 via `begin()`/`end()`; `end()` is idempotent.
- [x] Component (jsdom): cancel/select-nothing (onPicked not fired) → no tile; select a file → tile shows
      during import → replaced by the thumbnail on success; cleared on error. Cover the project **image**
      and **font** paths and the **shared-image** path.

## 4. Gate / docs

- [x] Full green gate (uncached) for `@cg/designer`.
- [x] `openspec validate add-image-import-loading --strict`.
- [x] PRD D-067 (`[~]`) + a ROADMAP backlog line.
