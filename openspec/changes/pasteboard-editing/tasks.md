# Tasks — Editor pasteboard (D-071 Phase B)

## 1. Pasteboard surface + authoring clip

- [x] 1.1 `geometry.ts` `pasteboardLayout(resolution)` — a FIXED, SYMMETRIC stage: frame +
      `PASTEBOARD_MARGIN_RATIO` margin on all four sides; a pure function of the resolution (never
      content-driven, so dragging never resizes it). Returns the extent + the frame's inset `frame`.
- [x] 1.2 `CanvasArea.tsx` — stage + iframe sized to the extent; the frame inset by `layout.frame`;
      `CanvasArea.css.ts` — the surround (`s.outer`) is the lighter `#161927`, scrollbars hidden.
- [x] 1.3 `preview.ts` `#buildHtml(scene, broadcast, authoring, frameOffset)` — when `authoring`,
      lift `.cg-stage` overflow + outline + dark margin and INSET `.cg-stage` by `frameOffset` (so
      off-frame paints on every side); a `device-width` viewport drives the layout with no stretch.
      `channels/preview.ts` + `createDesignerBridge.ts` thread `authoring` + `frameOffset`; the canvas
      passes `authoring: true` + the computed offset.

## 2. Off-frame selection without on-frame regression

- [x] 2.1 The overlay pointer/hit-test LAYER covers the whole pasteboard (off-frame selectable on all
      sides). Inside it a FRAME-sized box, inset by `frameOffset × scale`, anchors the gizmos +
      `canvas-surface` and is the scene (0,0) origin for click→scene; off-frame gizmos paint as SVG
      overflow (the B-025 SVG stays real-sized, so the stroke still paints).
- [x] 2.2 `canvas-surface` (the frame box) keeps `canvas.boundingBox()` == the frame, so existing
      fraction-based tests (multi-select, tool placement) are unaffected.

## 3. Tests

- [x] 3.1 Unit (`tests/pasteboard.test.ts`): `#buildHtml` `authoring:true` lifts the clip + insets
      `.cg-stage` by the offset + the two-tone (`html, body` `#161927` surround + `.cg-stage`
      `background-color: #080a10` page) + is `device-width`; `authoring:false` (default) and the
      broadcast modal keep the clip; `pasteboardLayout` (symmetric margin all sides; pure function of
      the resolution); `fitZoom` from the FRAME; the ruler scene→pixel mapping (scroll + zoom aware);
      `zoomAnchorScroll` (the cursor-anchored zoom math preserves the scene point under the cursor).
- [x] 3.2 E2E (`tests/e2e/pasteboard.spec.ts`): an off-frame shape is dropped from the broadcast
      preview + export but kept on the canvas, and the modal still blanks-until-play; the pasteboard
      lifts the clip so an off-frame shape renders + stays selected (gizmo tracks it), with on-frame
      drag unchanged; a shape parked off the LEFT/TOP stays visible; the canvas is two-tone (`#161927`
      surround + `#080a10` page) and an on-frame shape over the page is NOT occluded (`elementFromPoint`
      at its centre belongs to the shape's subtree); on open the frame is fit + CENTERED; the
      Ctrl+wheel zoom is anchored at the cursor (the point under the pointer doesn't move); the
      alignment guides span the full canvas; the ruler stays pinned when zoomed + scrolled.

## 4. Layout (fit + center, ruler, guides, zoom, scrollbars) — no regression

- [x] 4.1 `fitToViewport` fits the zoom from the FRAME bounds, then `centerFrameInView` scrolls so
      the frame is CENTERED; project-open does the same. Scrollbars are HIDDEN (`s.outer`) so the
      overflowing pasteboard shows no default scrollbars (pan via hand tool / wheel).
- [x] 4.2 `zoomAt(factor, clientX, clientY)` keeps the scene point under the anchor pinned: Ctrl+wheel
      anchors on the CURSOR, the +/−/1× buttons on the viewport CENTRE (not the top-left corner). The
      scroll correction (`zoomAnchorScroll`) runs in a `useLayoutEffect` (post-zoom, PRE-paint) so the
      zoom is SMOOTH — no one-frame jump — and the fit/centre path (no anchor) is untouched.
- [x] 4.3 `rulerOrigin` (= `stageRect − outerRect + frame × zoom`, re-measured on scroll/zoom/resize)
      places scene (0,0) at the frame top-left and tracks scroll + zoom.
- [x] 4.4 The rulers + alignment/snap guides render in a NON-scrolling overlay (`s.overlay`) that is
      a SIBLING of the scroll container (`s.outer`), not a child — so on zoom+scroll they stay pinned
      to the visible viewport (an abs child of `overflow:auto` scrolls WITH the content). Guides span
      the FULL visible canvas (`inset:0`, `data-testid="snap-guides"`), not the frame.
- [x] 4.5 TWO-TONE by region: the SURROUND (`s.outer` + the iframe body) is the lighter `#161927`;
      the FRAME-SIZED page backdrop is the darker `#080a10` (`.cg-stage` `background-color`), painted
      BEHIND the checkerboard + shapes — so it can never occlude an on-frame shape.

## 5. Docs

- [x] 5.1 Canvas README — the pasteboard (`pasteboardLayout` symmetric/fixed + `frameOffset` +
      `device-width` + centered fit + hidden scrollbars + two-tone `#161927`/`#080a10` by region +
      zoom-to-cursor + viewport-spanning guides) + the authoring-vs-broadcast clip model.
- [x] 5.2 PRD: keep D-071 `[~]` (Phase B in progress; flips to `[x]` when Phase B archives).

## 6. Gate

- [x] 6.1 Full green gate (turbo + unit) for `@cg/designer` + `@cg/shared-ipc` — 17/17 tasks
      (`--force`).
- [x] 6.2 `pnpm test:e2e` green — 70 passed (62 existing, no regression + 8 pasteboard specs).
- [x] 6.3 `pnpm openspec validate --all --strict` valid (24/24); `pnpm format:check` clean.
- [x] 6.4 Conventional commit on `feat/D-071b-pasteboard`; push + PR (NOT merged — manual layout
      re-test first).
