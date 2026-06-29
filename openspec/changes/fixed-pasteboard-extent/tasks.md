# Tasks — fixed pasteboard extent (B-027)

## 1. Geometry — fixed extent

- [x] `geometry.ts`: rewrite `pasteboardLayout(resolution)` → fixed extent (7× width × 5×
      height; frame inset 3× width / 2× height); add `PASTEBOARD_MARGIN_X` (3) /
      `PASTEBOARD_MARGIN_Y` (2); drop the `content` arg + grow/shrink/clamp.
- [x] Remove `PASTEBOARD_MARGIN_RATIO`, `MAX_EXTENT_RATIO`, `SceneAabb`, `offsetShiftScroll`.

## 2. Remove dead grow-to-fit machinery

- [x] Delete `content-bounds.ts` (`contentBounds`) + `tests/content-bounds.test.ts`.
- [x] `CanvasArea.tsx`: drop the `contentBounds` / `offsetShiftScroll` imports, the
      `contentBox` memo, and the per-move extent recompute (layout keyed on resolution).
- [x] `CanvasArea.tsx`: remove Seam 2 — the origin-shift scroll-comp `useLayoutEffect`
      (`offsetShiftScroll`, `prevOffsetRef`, `offsetSceneRef`).

## 3. Seam 1 (frame inset) — constant, idempotent

- [x] Keep the `--cg-frame-x/-y` CSS-var inset (`preview.ts` unchanged); the host passes
      the constant offset on load + scene-replace, idempotent per drag (only changes on a
      resolution change — B-028). Stated the choice in the proposal.

## 4. Zoom-out reach

- [x] Lower `ZOOM_MIN` (0.1 → 0.05) so a full zoom-out shows the entire 7×5 pasteboard.

## 5. B-035 centering

- [x] Verify fit-on-open + fit-on-switch still center the frame with the now-CONSTANT
      offset (`frameCenterScroll` reads `frameOffset` — unchanged, simpler). No Seam-2
      interaction (it's gone).

## 6. Tests

- [x] Unit `pasteboard.test.ts`: fixed extent (7×/5×; inset 3×/2×), content-independent;
      drop grow/shrink/clamp/offsetShiftScroll.
- [x] E2E `pasteboard-extent.spec.ts`: extent FIXED (no grow on any side), frame does NOT
      drift on off-left/top park, a shape beyond the extent is not lost.
- [ ] E2E: B-035 fit-on-open / fit-on-switch still center (run the existing spec).
- [ ] Confirm no regression in `scene-size-vs-pasteboard.spec.ts` (resolution change
      recomputes the fixed extent + Fit re-fits).

## 7. Docs / PRD

- [x] Canvas feature `README.md` — rewrite the pasteboard section (fixed extent, no seams).
- [ ] PRD `bugs-designer.md`: B-027 → `[~]` with the fix evidence.

## 8. Gate

- [ ] `@cg/designer` typecheck + lint + test + build (uncached `turbo --force`), then E2E
      (`pnpm test:e2e`) — pasteboard / scene-size / fit / selection specs.
- [ ] `pnpm openspec validate fixed-pasteboard-extent --strict`.
