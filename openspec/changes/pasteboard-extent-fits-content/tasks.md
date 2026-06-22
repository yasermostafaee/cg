# Tasks — Pasteboard extent grows to fit off-frame content (B-026)

## 1. Content bounds

- [x] 1.1 `renderer/features/canvas/content-bounds.ts` — `contentBounds(layers, currentFrame)`: the
      scene-coord AABB of all top-level elements, folding each element's 4 corners through
      `localToScene` at `effectiveTransformAt(el, currentFrame)` (current-frame transforms, Q2). A
      nested composition INSTANCE contributes only its OWN box — no recursion (Q3). Empty /
      on-frame-only → `null` (no growth).

## 2. Content-aware layout math

- [x] 2.1 `geometry.ts` — `pasteboardLayout(resolution, content?)`: per axis, grow ONLY past the 2×
      boundary, then a FULL margin of headroom (Q1 = B); within the 2× boundaries the extent + offset
      are BYTE-IDENTICAL to today; shrink back toward 2× but NEVER below it; clamp the total extent at
      `MAX_EXTENT_RATIO` (12×) per axis (Q4). `frameOffset` grows so left/up content is ≥ 0 in iframe
      coords. Default content (none) = the frame box (back-compat).
- [x] 2.2 `geometry.ts` — `MAX_EXTENT_RATIO` named constant; `SceneAabb` type; `offsetShiftScroll`
      helper (origin-shift scroll Δ = `scroll + Δoffset × zoom`).

## 3. Seam 1 — live `.cg-stage` inset (no reload/flash)

- [x] 3.1 `platform/preview.ts` `#buildHtml` — the `.cg-stage` `top`/`left` inset reads CSS variables
      `--cg-frame-y`/`--cg-frame-x` (the baked offset is only the load-time fallback; the variables
      live on `:root`, which `createRuntime` never recreates).
- [x] 3.2 `platform/preview.ts` — a shared `applyFrameOffset(o)` helper sets `--cg-frame-x/-y` on
      `:root`, called from BOTH the scene-replace and the scrub handlers, so the recreated `.cg-stage`
      picks up the grown offset live (scrub matters because the offset is current-frame derived — Q2).
- [x] 3.3 `CanvasArea.tsx` — fold `frameOffset` into the rAF-throttled `scene-replace` payload AND the
      `scrub` message; use the content-aware offset for the initial `preview.load`.

## 4. Seam 2 — origin-shift scroll compensation

- [x] 4.1 `CanvasArea.tsx` — a new `useLayoutEffect` keyed on `[frameOffset.x, frameOffset.y, sceneId]`
      that scrolls by `offsetShiftScroll(scroll, Δoffset, zoom)` to hold visible content stationary on
      left/up growth AND inward shrink. Independent of the zoom-anchor effect (disjoint keys);
      `prevOffsetRef` reset on `sceneId` so fit-on-open isn't fought.

## 5. Thread content-aware extent/offset through every consumer

- [x] 5.1 `CanvasArea.tsx` — `contentBox`/`layout` memoised up-top (before the effects/early-return);
      `extent` + `frameOffset` derived from it; a `frameOffsetRef` for the deps-limited load +
      scene-replace effects.
- [x] 5.2 `centerFrameInView` + the ruler `measure` use the content-aware offset; the stage + iframe
      inline size use the content-aware extent; `<CanvasOverlay frameOffset>` gets it (overlay tracks
      via its live rect). `fitToViewport` stays resolution-based (frame fit unchanged).
- [x] 5.3 Q5 — `frameOffset.x`/`.y` added to the `measure` effect dep array explicitly (re-measure on
      an offset shift, not only on scroll/zoom).

## 6. Tests

- [x] 6.1 Unit (`tests/content-bounds.test.ts`): corner-fold + current-frame transforms; rotation; a
      nested instance contributes only its own box; empty → null.
- [x] 6.2 Unit (`tests/pasteboard.test.ts`): within-2× content → IDENTICAL to the fixed 2× (B
      invariant); past left/up → grows with full-margin headroom + shifts the offset (content ≥ 0 in
      iframe coords); past right/bottom → grows extent not offset; NEVER shrinks below 2×; clamp caps
      at `MAX_EXTENT_RATIO`; `offsetShiftScroll` Δ math; the `.cg-stage` inset is a CSS var with the
      baked fallback.
- [x] 6.3 E2E (`tests/e2e/pasteboard-extent.spec.ts`): a shape parked FAR off each of the 4 sides stays
      rendered + selectable (extent grew); a within-50% off-frame shape does NOT grow (B containment);
      left growth is scroll-compensated (frame doesn't jump); far content dragged back returns the
      extent to the 2× baseline (never smaller); an absurd coordinate is CAPPED at the clamp.

## 7. Docs

- [x] 7.1 Canvas README — the content-aware pasteboard (grow-only-past-2×, full-margin headroom, the
      2× floor + `MAX_EXTENT_RATIO` clamp, the live CSS-var inset seam, the origin-shift scroll-comp).
- [x] 7.2 `design.md` §2/§6 — the nested-instance clip finding (instances render `overflow: hidden`, so
      bounding the instance box is exact — no off-frame gap).
- [x] 7.3 PRD: `docs/prd/bugs.md` B-026 `[~]` (flip to `[x]` on archive).

## 8. Gate

- [ ] 8.1 Full green gate for `@cg/designer` (`format:check` + typecheck + lint + test + build;
      uncached `--force` once before push).
- [ ] 8.2 `pnpm test:e2e` green (no regression + the new pasteboard-extent specs).
- [ ] 8.3 `pnpm openspec validate --all --strict` valid; `pnpm format:check` clean.
- [ ] 8.4 Conventional commit on `fix/pasteboard-extent-fits-content`; push + PR (NOT merged — manual
      grow/shrink/scroll re-test first).
