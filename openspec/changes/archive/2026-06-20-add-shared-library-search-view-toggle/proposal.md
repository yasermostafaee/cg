# Shared Library: search + grid/list view toggle (D-068)

## Why

D-040 mirrored the Project Assets panel only partially: the Shared Library panel has no filename
search and no grid/list view toggle, so a growing device library is harder to scan than the
per-project assets panel. This closes that parity gap by reusing the existing Project Assets controls
and idiom — not a new pattern.

## What Changes

- Add a filename **search** field to the Shared Library panel (case-insensitive substring filter;
  an empty query shows all), mirroring `ProjectAssetsPanel`.
- Add a **grid/list view toggle** that switches the thumbnail layout and persists the choice (its own
  `localStorage` key, default `grid`), mirroring `ProjectAssetsPanel`.
- Extend `SharedImageThumb` with a `layout: 'grid' | 'list'` prop (the same markup as `AssetThumb`'s
  grid/list layouts), preserving its click-to-select / active-ring / context-menu behaviour.
- Reuse the existing `GridIcon` / `ListIcon` and the `ProjectAssetsPanel` / `AssetThumb` styles.

## Capabilities

### Modified Capabilities

- `designer-shared-image-library` — the library UI gains a filename search + a persisted grid/list
  view toggle (a new requirement on the existing capability).

## Impact

- **Modified:** `apps/designer/src/renderer/features/sharedLibrary/SharedLibraryPanel.tsx` (search +
  view state + controls + `SharedImageThumb` layout); `apps/designer/src/renderer/features/assets/
ProjectAssetsPanel.tsx` exports `GridIcon` / `ListIcon` for reuse (no behaviour change).
- **No** schema / bridge / store / resolver change — UI only.
