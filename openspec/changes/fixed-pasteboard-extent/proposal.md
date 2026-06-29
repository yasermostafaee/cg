# Fixed pasteboard extent — no grow-to-fit (B-027)

## Why

The grow-to-fit pasteboard (D-071 / B-026) resizes the dark area to contain off-frame
content, and on the LEFT/TOP that growth shifts the frame origin, scroll-compensated per
pointer-move. That host-side scroll-comp runs synchronously while the iframe `.cg-stage`
inset is applied asynchronously (rAF-throttled `scene-replace` + a full per-move runtime
rebuild), so the two don't land in the same paint and the WHOLE canvas jitters/drifts
during a far off-frame drag (B-027). The owner's decision: make the pasteboard a
**fixed** extent — drift-free by construction — and reach a far-parked shape by zooming
out / panning instead of auto-growing.

## What Changes

- **Fixed extent (pure function of resolution).** `pasteboardLayout(resolution)` returns
  a constant extent: margins of **3× the frame width** left + right and **2× the frame
  height** top + bottom → total **7× width × 5× height**, with the frame at the constant
  inset `(3× width, 2× height)`. It no longer takes a content AABB and never grows,
  shrinks, or clamps.
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
- **Min zoom lowered** (`ZOOM_MIN` 0.1 → 0.05) so a full zoom-out can show the entire
  fixed pasteboard (7× wide) and a shape parked anywhere within it is reachable. No
  auto-zoom; manual zoom-out only.
- **Unchanged:** the clip-lift (off-frame shapes paint into the pasteboard and stay
  selectable up to the extent), the frame outline + two-tone canvas, on-frame editing,
  the B-035 deterministic fit + center (now even simpler — `frameOffset` is constant),
  and export / broadcast (frame offset `{0,0}` + the Phase-A off-frame filter).

## Capabilities

- **`designer-canvas-viewport`** (MODIFIED): the "off-frame pasteboard" requirement
  changes from a content-grown extent (grow / shrink / clamp / origin-shift
  scroll-comp) to a **fixed** extent (constant function of resolution; no drift). The
  grow / shrink / clamp / left-top-scroll-comp scenarios are dropped; fixed-extent +
  no-drift + reachable-by-zoom-out scenarios are added. The two-tone, on-frame-unchanged,
  broadcast/export, and fit-the-frame scenarios are preserved.

## Impact

- `apps/designer/src/renderer/features/canvas/geometry.ts` — `pasteboardLayout` rewritten
  (fixed); `PASTEBOARD_MARGIN_X/Y` added; `PASTEBOARD_MARGIN_RATIO`, `MAX_EXTENT_RATIO`,
  `SceneAabb`, `offsetShiftScroll` removed.
- `apps/designer/src/renderer/features/canvas/content-bounds.ts` — **deleted** (+ its test).
- `apps/designer/src/renderer/features/canvas/CanvasArea.tsx` — drop `contentBounds`/
  `offsetShiftScroll` imports + the `contentBox` memo + Seam 2; constant `frameOffset`;
  `ZOOM_MIN` 0.05.
- `apps/designer/src/platform/preview.ts` — unchanged (constant offset → idempotent inset).
- Tests: `pasteboard.test.ts` (fixed extent, content-independent), `pasteboard-extent.spec.ts`
  (no-grow, **no-drift**, reachable), `content-bounds.test.ts` removed; B-035 fit E2E intact.
- Docs: the canvas feature README pasteboard section.
