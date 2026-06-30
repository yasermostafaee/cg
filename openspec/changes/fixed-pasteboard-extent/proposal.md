# Fixed pasteboard extent — no grow-to-fit (B-027)

## Why

The grow-to-fit pasteboard (D-071 / B-026) resizes the dark area to contain off-frame
content, and on the LEFT/TOP that growth shifts the frame origin, scroll-compensated per
pointer-move. That host-side scroll-comp runs synchronously while the iframe `.cg-stage`
inset is applied asynchronously (rAF-throttled `scene-replace` + a full per-move runtime
rebuild), so the two don't land in the same paint and the WHOLE canvas jitters/drifts
during a far off-frame drag (B-027). The owner's decision: make the pasteboard a
**fixed** extent — drift-free by construction.

A fixed extent, though, leaves a **dead zone**: the iframe and the overlay are both sized
to the extent, so a shape dragged BEYOND it is clipped (invisible) AND its gizmo is clipped
(unselectable on the canvas), and zoom-out can't reach past the extent — recoverable only
via the layers panel. The owner's decision: don't manage the dead zone, ELIMINATE it by
**clamping** drags/nudges so a shape's full bounding box can never leave the pasteboard. The
extent margin per side is the **larger of an absolute minimum or one full frame** — `max(5000, W)` on
X, `max(3000, H)` on Y (was the interim 1× multiplier, and before that 7×5) — so shapes can't be parked
arbitrarily far yet the pasteboard stays usefully large even for a TINY frame (a plain 1× multiplier
made a 100×100 frame only a 300×300 pasteboard, freezing the cover-fit min-zoom at ~428%). The
pasteboard also gets a visible **edge marker** so the workable area is obvious.

## What Changes

- **Fixed extent (pure function of resolution).** `pasteboardLayout(resolution)` returns
  a constant extent: a margin per side of **`max(PASTEBOARD_MIN_X (5000), frameWidth)`** left/right
  and **`max(PASTEBOARD_MIN_Y (3000), frameHeight)`** top/bottom → total **`frame + 2·margin`** per
  axis, with the frame at the constant inset `(marginX, marginY)`. It no longer takes a content AABB
  and never grows, shrinks, or clamps. The absolute floor keeps a tiny frame's pasteboard large so the
  cover-fit min-zoom never locks (a 1× multiplier froze a 100×100 frame at ~428%).
- **Clamp drags + nudges to the pasteboard (eliminate the dead zone).** With a fixed
  extent, the iframe + overlay clip at the extent, so a shape dragged BEYOND it was
  invisible AND unselectable (a dead zone, recoverable only via the layers panel). The
  owner's decision: don't manage the dead zone, ELIMINATE it. A new pure
  `clampDeltaToPasteboard` + `pasteboardSceneBounds` (in `geometry.ts`) bound every move so
  the element's full bounding box — for a multi-selection, the whole group box (added to
  `collectGroupMoveTargets`) — stays inside the extent. Wired into `beginDrag` (single),
  `beginGroupDrag` (group), and `nudgeSelection` (arrow keys). The clamp only TIGHTENS, so
  a shape already outside (old/imported scene) is never yanked or pushed further out and can
  be dragged back in; a shape larger than the pasteboard on an axis is centered there.
- **Pasteboard edge marker (insurance/clarity).** The empty scroll-container surround
  (`s.outer`) is darkened to `#0e1018` — distinct from the `#161927` pasteboard — and the
  stage gets a subtle 1px `box-shadow` edge ring, so the workable area reads as a defined
  rectangle distinct from the surround.
- **Remove the grow-to-fit machinery (deletion):** `content-bounds.ts`
  (`contentBounds`), `geometry.ts` `offsetShiftScroll` + `SceneAabb` +
  `PASTEBOARD_MARGIN_RATIO` + `MAX_EXTENT_RATIO`, and in `CanvasArea` the `contentBox`
  memo, the per-move extent recompute, and **Seam 2** (the origin-shift scroll-comp
  `useLayoutEffect`). The offset is constant, so there is nothing to compensate.
- **Seam 1 unchanged but now idempotent.** The `.cg-stage` inset stays a `--cg-frame-x/-y`
  CSS var with the constant offset baked as the load-time fallback; the host still passes
  the offset on `scene-replace` / `scrub`, but since it is constant per resolution those
  are no-ops during a drag (they only actually change when the **resolution** changes —
  B-028, no reload). Baking-once would duplicate the margin constants into the iframe
  runtime, so the DRY pass-through is kept.
- **Dynamic cover-fit minimum zoom.** Because clamping keeps shapes inside the pasteboard,
  any empty surround at low zoom is wasted space. The minimum zoom is now DYNAMIC —
  `coverZoom(viewport, extent) = MAX(viewportW/extentW, viewportH/extentH)` — the cover-fit,
  so a full zoom-out always leaves the pasteboard COVERING the viewport (no surround; one
  axis may overflow and scroll). `clampZoom` binds every zoom path to it; it recomputes on
  viewport (ResizeObserver) / resolution change and clamps the current zoom UP if the floor
  rises. `ZOOM_HARD_MIN` (0.02) is just a degenerate-case safety net. Fit (frames the
  smaller frame) always lands above the floor, so it is never clamped down.
- **Docs:** correct stale frame-backdrop colour references (`#080a10` / `#a7a7a7`) to the
  actual `#3d4253` page (+ `#5b6075` checker) — code is the source of truth — in the canvas
  README, the `preview.ts` / `CanvasArea.css.ts` comments, and this spec delta.
- **Unchanged:** the clip-lift (off-frame shapes paint into the pasteboard and stay
  selectable up to the extent), the frame outline + region tones, on-frame editing, the
  B-035 deterministic fit + center (now even simpler — `frameOffset` is constant), and
  export / broadcast (frame offset `{0,0}` + the Phase-A off-frame filter).

## Capabilities

- **`designer-canvas-viewport`** (MODIFIED): the "off-frame pasteboard" requirement
  changes from a content-grown extent (grow / shrink / clamp / origin-shift
  scroll-comp) to a **fixed** extent (margin = `max(absolute-min, one-frame)` per side; constant
  function of resolution; no drift) with
  element moves **clamped** to it (no dead zone) and a visible pasteboard edge. The
  grow / shrink / clamp / left-top-scroll-comp scenarios are dropped; fixed-extent +
  no-drift + drag-clamp + nudge-clamp + group-bounded + pre-existing-outside-recoverable +
  edge-marker scenarios are added. The on-frame-unchanged, broadcast/export, and
  fit-the-frame scenarios are preserved.

## Impact

- `apps/designer/src/renderer/features/canvas/geometry.ts` — `pasteboardLayout` rewritten
  (fixed, margin = `max(min, frame)` per side); `PASTEBOARD_MIN_X` (5000) / `PASTEBOARD_MIN_Y`
  (3000) added; new `pasteboardSceneBounds` +
  `clampDeltaToPasteboard`; `PASTEBOARD_MARGIN_RATIO`, `MAX_EXTENT_RATIO`, `SceneAabb`,
  `offsetShiftScroll` removed.
- `apps/designer/src/renderer/features/canvas/group-move.ts` — `collectGroupMoveTargets`
  also returns the movable group's combined AABB (`box`) for the group/nudge clamp.
- `apps/designer/src/renderer/features/canvas/CanvasOverlay.tsx` — `beginDrag` +
  `beginGroupDrag` clamp the (snapped) move to the pasteboard.
- `apps/designer/src/renderer/state/slices/elements.ts` — `nudgeSelection` clamps too.
- `apps/designer/src/renderer/features/canvas/content-bounds.ts` — **deleted** (+ its test).
- `apps/designer/src/renderer/features/canvas/CanvasArea.tsx` — drop `contentBounds`/
  `offsetShiftScroll` imports + the `contentBox` memo + Seam 2; constant `frameOffset`;
  `ZOOM_MIN` 0.1.
- `apps/designer/src/renderer/features/canvas/CanvasArea.css.ts` — `s.outer` surround
  `#0e1018` (distinct from the pasteboard) + `s.stage` 1px `box-shadow` edge ring.
- `apps/designer/src/platform/preview.ts` — unchanged colour (`#3d4253`); stale `#a7a7a7`
  comment corrected.
- Tests: `pasteboard.test.ts` (fixed `max(min, frame)` extent + worked examples +
  `clampDeltaToPasteboard` cases),
  `pasteboard-extent.spec.ts` (no-grow, **no-drift**, **drag/nudge clamp**),
  `content-bounds.test.ts` removed; B-035 fit E2E intact.
- Docs: the canvas feature README; stale `#080a10` / `#a7a7a7` colour refs corrected to
  `#3d4253`.
