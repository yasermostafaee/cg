# Pasteboard extent grows to fit off-frame content (D-071 follow-up · B-026)

## Why

D-071 Phase B (`pasteboard-editing`) shipped a **fixed** pasteboard extent:
`pasteboardLayout(resolution)` returns `frame + 50% margin` on every side — a pure function of the
resolution, ignoring where shapes are. The authoring iframe is sized to that extent and clips to its
own element box, so a shape parked **more than ~50% of the frame** beyond an edge leaves the iframe
and is **clipped (invisible)** and cannot be selected. That defeats the whole point of the pasteboard
(parking/staging shapes off-frame): an author can drag a shape out to stage it, lose sight of it past
the margin, and have no way to grab it back.

This change makes the extent **grow-to-fit**: the iframe (and stage) grow to contain off-frame
content so a parked shape always stays visible and selectable — while everyday off-frame drags within
the existing 2× margin behave **byte-identically** to today.

## What Changes

- **`contentBounds(layers, currentFrame)`** — a NEW pure helper (sibling of `off-frame.frameAabb`):
  the scene-coord AABB of every active-composition top-level element, folding each element's 4
  corners through `Scale·Rotate-about-anchor` (`localToScene`) at the **current-frame** transform
  (`effectiveTransformAt`) — the same boxes the overlay hit-tests and the runtime renders. A nested
  composition **instance** contributes only its **own box** (no recursion); empty / on-frame-only →
  `null` (no growth). (Q3, Q2.)

- **`pasteboardLayout(resolution, content?)`** becomes **content-aware** (Q1 = B). Per axis: keep the
  base 2× boundaries `[−margin, size+margin]`; **grow only when content crosses a 2× boundary**, and
  then give a **full margin** of headroom past the content. Within the 2× boundaries the extent and
  offset are **byte-identical** to today's fixed 2× (the B containment invariant). The extent
  **shrinks** back toward 2× as far content returns inward but **never** below 2×, and the total
  extent is **clamped** at `MAX_EXTENT_RATIO` (12×) the frame per axis so a stray far coordinate (bad
  import / fat-finger drag) can't blow the iframe up (Q4). `frame.{x,y}` (the frame's inset) grows so
  off-frame left/up content lands at positive iframe coords.

- **Seam 1 — live `.cg-stage` inset (no reload/flash).** The baked `.cg-stage { top/left }` becomes a
  CSS variable on `:root` (`--cg-frame-x/-y`) which `createRuntime` never recreates; the content-grown
  offset rides the live preview messages (the rAF-throttled `scene-replace` **and** the `scrub`
  message — the offset is current-frame derived, so it moves as the playhead animates a shape
  off-frame) and updates the variables via a shared `applyFrameOffset` helper, so a growing offset
  re-insets the frame **live** with no srcDoc rebuild.

- **Seam 2 — origin-shift scroll compensation.** A new `useLayoutEffect` keyed on `frameOffset` adds
  `Δoffset × zoom` to `scrollLeft/Top` so the visible content stays **stationary** when the offset
  shifts (left/up growth **and** inward shrink). It is independent of the zoom-anchor effect (disjoint
  keys: `frameOffset` vs `zoom`), and `prevOffsetRef` resets on `sceneId` so fit-on-open isn't fought.

- **Every extent/offset consumer becomes content-aware** — load offset, the `scene-replace` payload,
  `centerFrameInView`, the ruler `measure` (Q5: `frameOffset` added to its dep array explicitly), the
  stage + iframe inline size, and the overlay `frameOffset` prop. `fitToViewport` stays
  **resolution-based** — fit-on-open / ⛶ still fits the **FRAME**, never the grown extent.

- **Unchanged:** export + the broadcast modal use `frameOffset = {0,0}` and the Phase-A
  `dropFullyOffFrame` filter — content-aware extent is **authoring-canvas only** and does not touch
  export/playout. Nested composition instances render `overflow: hidden`, so bounding only the
  instance box is exact (no off-frame gap — see design.md §2).

## Impact

- Affected specs: **designer-canvas-viewport** (MODIFIED — the "off-frame pasteboard" requirement: the
  extent is no longer a fixed function of the resolution; it grows to contain off-frame content).
  Supersedes the "FIXED function of the resolution / dragging NEVER resizes the dark area" language
  added by `pasteboard-editing` (archive `pasteboard-editing` first, or both together).
- Affected code: `@cg/designer` only — new `renderer/features/canvas/content-bounds.ts`;
  `geometry.ts` (`pasteboardLayout` content arg, `MAX_EXTENT_RATIO`, `offsetShiftScroll`, `SceneAabb`);
  `CanvasArea.tsx` (content-aware extent/offset + the two new seams); `platform/preview.ts` (CSS-var
  inset + `scene-replace` `frameOffset`). No schema / exporter / packager / runtime / shared-ipc
  change (the `scene-replace` payload is an untyped `window.postMessage`).
- PRD: **B-026** in `docs/prd/bugs.md`.
