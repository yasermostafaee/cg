# Design — pin the scene row while scrolling layers

## Context

The timeline body has two columns that scroll together: the RIGHT lane body (`rightBody`) is a
native scroll container; the LEFT label column (`leftBody`, overflow hidden) mirrors it by an
imperative `transform: translateY(-rightBody.scrollTop)` on `leftBodyInner` (in `syncScroll`).
The transform is deliberate — mirroring `scrollTop` clamps near the bottom when the lanes show a
horizontal scrollbar (the right body's client height shrinks by the scrollbar thickness, so its
max scrollTop exceeds an overflow:hidden column's), drifting the labels above their lanes.

## Decisions

### RIGHT lane: `position: sticky`

`sceneLane` (first child of `rightBodyInner`, inside the native-scroll `rightBody`) becomes
`position: sticky; top: 0; z-index: 3` with a solid `background: TIMELINE_BG`. Sticky pins it
vertically against the scroll container while it still scrolls horizontally with the lanes (it
spans the zoomed width, which is correct). The solid bg + z-index keep the element lanes from
showing through as they scroll under it. The lane's absolutely-positioned children (active-range
bar, resize handle, out-point marker) still position against the (now sticky) lane.

### LEFT label: counter-transform, NOT sticky

`position: sticky` cannot pin against an ancestor `transform` (the transform makes
`leftBodyInner` the containing block and moves it), so the label is pinned by cancelling the
parent's offset: `sceneLabel` (kept as the first flow child of `leftBodyInner`) gets its own
`transform: translateY(+scrollTop)` set in `syncScroll` via `sceneLabelRef`, exactly negating
`leftBodyInner`'s `translateY(-scrollTop)`. Net translation is zero, so it stays at the top while
the element rows (no counter-transform) scroll under it. A solid background (`colors.panel`) +
z-index keep the rows from showing through.

This was chosen over the alternative (lift `sceneLabel` out of `leftBodyInner` into an
absolutely-positioned top row and offset the first element row down) because it is the smallest
change that keeps the synced-scroll model intact: the reorder drag still measures rows in
`leftBodyInner` (unchanged), and nothing switches to native `scrollTop` (which would reintroduce
the clamping bug).

### Alignment & invariants

Both scene rows keep the shared `SCENE_ROW` height, so left/right stay the same height and the
element rows below line up. `syncScroll` sets both transforms in one pass (on every
`rightBody` scroll and on the zoom layout effect), so the two columns never drift. The
reorder-indicator math (`leftBodyInner`-local Y) and the `clearSelection` onClick on both scene
rows are unchanged.

## Risks / trade-offs

- Making `sceneLane` a stacking context (sticky + z-index) means the body playhead / inactive-tail
  overlays no longer paint over the top ~22px scene row; the active-range bar (the scene row's main
  content) and the ruler's playhead remain visible, so this is acceptable.
- `willChange: transform` is set on both scene rows to keep the per-scroll transform cheap.
