# Pin the scene row while scrolling layers (D-078)

## Why

In the timeline layers panel the scene/root row scrolls away with the element rows. It should
stay pinned at the top as a fixed header (both its left label and its right lane), so the active
scene range and the scene controls remain visible while the operator scrolls through many layers.

## What Changes

- The scene row (the left `sceneLabel` and the right `sceneLane`) stays pinned at the top of the
  layers panel on BOTH columns while the element rows/lanes scroll under it; each layer's left
  label stays vertically aligned with its right lane at every scroll offset.
- RIGHT lane: `sceneLane` becomes `position: sticky; top: 0` with a solid background (TIMELINE_BG)
  and a z-index above the lanes. In the native scroll container (`rightBody`) sticky pins it
  vertically while it still scrolls horizontally with the lanes (it spans the zoomed width).
- LEFT label: the left column is NOT a native scroll container — `leftBodyInner` is offset by an
  imperative `transform: translateY(-rightBody.scrollTop)` (deliberate, to avoid the
  scrollbar-thickness clamping that mirroring `scrollTop` caused). `position: sticky` can't fight
  that transform, so `sceneLabel` counteracts it with its own `transform: translateY(+scrollTop)`
  (set in `syncScroll` via a ref) + a solid background + z-index, so it visually stays put while
  the element rows scroll under it. The synced-scroll model is preserved (no switch to native
  `scrollTop`).
- Both scene rows keep the same row height (`SCENE_ROW`), and the reorder-indicator math and the
  `clearSelection` onClick are unchanged.

## Impact

- Affected specs: **designer-animation-timeline** (ADDED — pinned scene row in the layers panel).
- Affected code: `@cg/designer` only — `renderer/features/timeline/TimelineDock.tsx` (a
  `sceneLabelRef` counter-transform in `syncScroll`, the lane's solid bg) and `TimelineDock.css.ts`
  (`sceneLabel` / `sceneLane` pin styles).
- **No** schema / `@cg/template-runtime` / exporter / `.vcg` / runtime change. The pin is layout
  only; alignment between the two columns is preserved at every scroll offset.
