# Tasks — fixed pasteboard extent + clamp + edge marker (B-027)

## 1. Geometry — fixed extent (1×/1×) + clamp helpers

- [x] `geometry.ts`: `pasteboardLayout(resolution)` → fixed extent **3× width × 3× height**
      (frame inset 1× width / 1× height); `PASTEBOARD_MARGIN_X` / `PASTEBOARD_MARGIN_Y` = 1.
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

## 5. Zoom-out reach

- [x] `ZOOM_MIN` 0.1 — a full zoom-out shows the whole 3× pasteboard without a tiny dot.
      (The interim 0.05, sized for 7×5, is dropped.)

## 6. Colour-doc drift (code is source of truth: `#3d4253`)

- [x] Correct stale `#080a10` / `#a7a7a7` frame-backdrop refs to `#3d4253` (+ `#5b6075`
      checker) in the canvas README, `preview.ts` / `CanvasArea.css.ts` comments, and this
      spec delta.

## 7. B-035 centering

- [x] Verify fit-on-open + fit-on-switch still center the frame with the constant 1×/1×
      offset (`frameCenterScroll` reads `frameOffset`). No Seam-2 interaction (it's gone).

## 8. Tests

- [x] Unit `pasteboard.test.ts`: fixed 3×3 extent (inset 1×/1×), content-independent;
      `clampDeltaToPasteboard` — box stays inside (single + group); edge touches the bound,
      not crossing; pre-existing-outside tightens only; oversized centers.
- [x] E2E `pasteboard-extent.spec.ts`: extent FIXED (no grow), frame does NOT drift, drag
      past an edge STOPS at the pasteboard edge (left/top too), arrow-nudge stops at the edge.
- [x] E2E: B-035 fit-on-open / fit-on-switch still center (run the existing spec).
- [x] Confirm no regression in `scene-size-vs-pasteboard.spec.ts` (resolution change
      recomputes the 3×3 extent + Fit re-fits).

## 9. Docs / PRD

- [x] Canvas feature `README.md` — pasteboard section (1×/1×, clamp, edge marker, colours).
- [x] PRD `bugs-designer.md`: B-027 evidence (1×/1×, clamp, edge marker, colour docs).

## 10. Gate

- [x] `@cg/designer` typecheck + lint + test + build (uncached `turbo --force`) 14/14, then
      full E2E (`playwright test`) 158/158 — pasteboard / scene-size / fit / selection specs.
- [x] `pnpm openspec validate fixed-pasteboard-extent --strict`.
