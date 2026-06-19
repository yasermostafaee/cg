# Tasks — image-import loading indicator (D-067)

## 1. Shared mechanism

- [ ] `useImportPending` hook (`features/assets/`): a pending count + `track(promise)` that increments
      on start and decrements in `finally` (so it clears on resolve AND reject — no stuck spinner).
- [ ] `ImportingThumb` component (+ `.css.ts`): a spinner tile reusing `AssetThumb`'s cell/thumb frame,
      with a `layout: 'grid' | 'list'` prop and an `"Importing…"` caption; stable `data-role="importing-thumb"`.

## 2. Wire both panels

- [ ] `ProjectAssetsPanel`: track `importKind`'s import; render one `ImportingThumb` per pending import
      (layout = current view) ahead of the thumbnails; don't show the empty state while pending.
- [ ] `SharedLibraryPanel`: track `addImage`'s import; render the pending tile(s) in the grid; don't
      show the empty state while pending.

## 3. Tests

- [ ] Unit: `useImportPending` — pending goes 1 then 0 on resolve; 1 then 0 on reject.
- [ ] Component (jsdom): each panel shows `importing-thumb` while an import is pending; on resolve it is
      replaced by the real thumbnail (shared, via the imported event); on reject it is cleared.

## 4. Gate / docs

- [ ] Full green gate (uncached) for `@cg/designer` (+ any touched workspace).
- [ ] `openspec validate add-image-import-loading --strict`.
- [ ] File PRD D-067 (`[~]`) + a ROADMAP backlog line.
