# Tasks — Shared Library search + view toggle (D-068)

## 1. Panel parity (reuse the ProjectAssets idiom)

- [ ] Export `GridIcon` / `ListIcon` from `ProjectAssetsPanel.tsx` (no behaviour change).
- [ ] `SharedLibraryPanel`: add a `query` state + search input (`ps.searchWrap` / `ps.search`); filter
      images by filename (case-insensitive substring; empty query shows all) via a pure
      `filterImagesByFilename` helper inside `useMemo`.
- [ ] `SharedLibraryPanel`: add a `libraryView` state (`'grid' | 'list'`, persisted to `localStorage`
      key `cg.designer.sharedLibraryView`, default `grid`) + a view-toggle `Control` in the header;
      render `ps.grid` / `ps.list`.
- [ ] `SharedImageThumb`: add a `layout: 'grid' | 'list'` prop mirroring `AssetThumb`'s grid/list
      markup (cell/cellList, thumb/thumbList, caption/captionList, metaType/metaSize for list),
      preserving click-to-select / active ring / context menu.

## 2. Tests

- [ ] Unit: `filterImagesByFilename` (case-insensitive substring; empty query = all).
- [ ] E2E: search filters the shared list by filename; the toggle switches grid↔list and the choice
      persists across a panel re-mount.

## 3. Gate / docs

- [ ] Full green gate (uncached) for `@cg/designer`; run the new E2E.
- [ ] `openspec validate add-shared-library-search-view-toggle --strict`.
- [ ] Mark D-068 `[~]` in `docs/prd/designer.md` with the change dir.
