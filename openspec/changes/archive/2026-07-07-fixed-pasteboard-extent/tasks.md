# Tasks — fixed pasteboard extent + clamp + edge marker (B-027)

## 1. Geometry — fixed extent (margin = max(absolute-min, one-frame)) + clamp helpers

- [x] `geometry.ts`: `pasteboardLayout(resolution)` → fixed extent **`frame + 2·margin`** per axis,
      margin = `max(PASTEBOARD_MIN_X (5000), W)` / `max(PASTEBOARD_MIN_Y (3000), H)` (frame inset =
      margin); replaces the interim 1× multiplier (`PASTEBOARD_MARGIN_X/Y`). The absolute floor stops
      a tiny frame's pasteboard from shrinking so far the cover-fit min-zoom locks (~428% at 100×100).
- [x] `geometry.ts`: add `pasteboardSceneBounds(resolution)` (scene-coord bounds) and
      `clampDeltaToPasteboard(delta, boxMin, boxMax, padMin, padMax)` — keep a box inside the
      extent; oversized → center; pre-existing-outside → tighten-only (never push further out).
- [x] Remove `PASTEBOARD_MARGIN_RATIO`, `MAX_EXTENT_RATIO`, `SceneAabb`, `offsetShiftScroll`.

## 2. Clamp drags + nudges (eliminate the dead zone)

- [x] `group-move.ts`: `collectGroupMoveTargets` also returns the movable group's combined
      AABB (`box`) for the group/nudge clamp.
- [x] `CanvasOverlay.tsx` `beginDrag` (single): clamp the snapped position so the element's
      full box stays inside (delta-based off the drag start).
- [x] `CanvasOverlay.tsx` `beginGroupDrag` (group): clamp the snapped group delta against the
      combined box so no member crosses an edge.
- [x] `elements.ts` `nudgeSelection` (arrow keys): clamp the nudge delta against the group box.

## 3. Remove dead grow-to-fit machinery

- [x] Delete `content-bounds.ts` (`contentBounds`) + `tests/content-bounds.test.ts`.
- [x] `CanvasArea.tsx`: drop the `contentBounds` / `offsetShiftScroll` imports, the
      `contentBox` memo, the per-move extent recompute, and Seam 2 (origin-shift scroll-comp).

## 4. Pasteboard edge marker (clarity/insurance)

- [x] `CanvasArea.css.ts`: `s.outer` surround `#0e1018` (distinct from the `#161927`
      pasteboard) + `s.stage` 1px `box-shadow` edge ring.

## 5. Zoom-out reach — dynamic cover-fit minimum

- [x] `geometry.ts`: `coverZoom(vw, vh, ew, eh)` = MAX of the axis ratios (cover, not contain),
      each axis target biased UP by `COVER_OVERSHOOT_PX` (2) so it OVER-covers by a hair instead
      of meeting the viewport exactly (which a sub-pixel scroll exposes as a trailing-edge sliver).
- [x] `CanvasArea.css.ts`: REMOVE the `s.outer` `0.5rem` padding — the cover-fit guarantees the
      pasteboard overflows the viewport, so padding only offset the stage into the content box and
      showed as a surround strip on the leading edge; without it all four edges hug the viewport.
- [x] `CanvasArea.tsx`: `dynamicZoomMin` (cover-fit, floored at `ZOOM_HARD_MIN` 0.02), bound
      into `clampZoom` so every zoom path (buttons / Ctrl+wheel / Fit) is clamped to it;
      recompute on viewport (ResizeObserver) + resolution change; clamp current zoom UP when
      the floor rises. So a full zoom-out always COVERS the viewport on all four edges — no surround.

## 6. Colour-doc drift (code is source of truth: `#3d4253`)

- [x] Correct stale `#080a10` / `#a7a7a7` frame-backdrop refs to `#3d4253` (+ `#5b6075`
      checker) in the canvas README, `preview.ts` / `CanvasArea.css.ts` comments, and this
      spec delta.

## 7. B-035 centering

- [x] Verify fit-on-open + fit-on-switch still center the frame with the constant
      `(marginX, marginY)` offset (`frameCenterScroll` reads `frameOffset`). No Seam-2 interaction.

## 8. Tests

- [x] Unit `pasteboard.test.ts`: fixed extent for ALL worked examples (100×100, 1280×720,
      1920×1080, 1080×1920, the 5000×3000 boundary, the 8000×3000 exceed), content-independent;
      a tiny 100×100 frame gives a small cover-fit min-zoom (the zoom-lock fix);
      `clampDeltaToPasteboard` — box stays inside (single + group); edge touches the bound,
      not crossing; pre-existing-outside tightens only; oversized centers.
- [x] Unit `coverZoom`: MAX of the axis ratios (each biased up by `COVER_OVERSHOOT_PX`); the
      pasteboard OVER-covers the viewport on both axes (the tight axis by exactly the hair, never
      under); 0 for a degenerate viewport/extent.
- [x] E2E `pasteboard-extent.spec.ts`: extent FIXED (no grow), frame does NOT drift, drag
      past an edge STOPS at the pasteboard edge (left/top too), arrow-nudge stops at the edge,
      at maximum zoom-out the pasteboard hugs ALL FOUR viewport edges (no surround sliver on any
      side, across multiple resolutions / aspect ratios), a TINY 100×100 resolution does NOT freeze
      zoom (small min-zoom + zoom in/out works), and the drag clamp holds at a smaller resolution
      too (not only the default).
- [x] E2E: B-035 fit-on-open / fit-on-switch still center (run the existing spec).
- [x] Confirm no regression in `scene-size-vs-pasteboard.spec.ts` (resolution change
      recomputes the `frame + 2·margin` extent + Fit re-fits).

## 9. Docs / PRD

- [x] Canvas feature `README.md` — pasteboard section (margin = max(min, frame), clamp, edge
      marker, colours).
- [x] PRD `bugs-designer.md`: B-027 evidence (margin = max(5000,W)/max(3000,H), zoom-lock fix,
      clamp, edge marker, colour docs).

## 10. Gate

- [x] `@cg/designer` typecheck + lint + test + build (uncached `turbo --force`) 14/14, then
      full E2E (`playwright test`) 159/159 — pasteboard / scene-size / fit / cover / selection.
- [x] `pnpm openspec validate fixed-pasteboard-extent --strict`.
