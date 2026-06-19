# Design — Shared Library search + view toggle (D-068)

Pure UI parity with the Project Assets panel; no schema / store / bridge / resolver change.

## Reuse, don't invent

- **Icons** — `GridIcon` / `ListIcon` are exported from `ProjectAssetsPanel.tsx` and imported (the
  exact same toggle glyphs), rather than re-drawn.
- **Styles** — the existing `ProjectAssetsPanel.css` (`searchWrap` / `search` / `grid` / `list` /
  `iconButton`) and `AssetThumb.css` (`cell` / `cellList` / `thumb` / `thumbList` / `caption` /
  `captionList` / `metaType` / `metaSize`), already imported by `SharedLibraryPanel` as `ps` / `ts`.
- **Idiom** — a `query` substring filter via `useMemo`, and a `view` state initialised from
  `localStorage` and written on change — identical to `ProjectAssetsPanel`.

## Decisions

- **Separate `localStorage` key** `cg.designer.sharedLibraryView` (not the project-assets
  `cg.designer.assetsView`) so the two panels' view choices are independent.
- **`SharedImageThumb` keeps its own URL source** (`useSharedImageUrl`). It cannot be replaced by
  `AssetThumb`, which resolves ids against the PROJECT store (a shared id would resolve to `null`);
  only its layout markup mirrors `AssetThumb`.
- **Pure filter** — `filterImagesByFilename(images, query)` is extracted (exported) for a fast unit
  test; the panel calls it inside `useMemo`. Mirrors `ProjectAssetsPanel`'s inline filter behaviour.

## Out of scope

- Folders / tags / categories (D-066-adjacent), drag-drop placement (D-063), keyboard-Delete (D-065).
