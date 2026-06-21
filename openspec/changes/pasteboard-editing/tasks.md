# Tasks — Editor pasteboard (D-071 Phase B)

## 1. Pasteboard surface + authoring clip

- [x] 1.1 `geometry.ts` `pasteboardExtent(doc)` — the stage size = the bounding box of the frame ∪
      all element boxes, grown right/bottom (+ `PASTEBOARD_MARGIN`) ONLY by off-frame content; an
      empty / on-frame doc returns the FRAME (so the stage centers + fits as before).
- [x] 1.2 `CanvasArea.tsx` — stage + iframe sized to `pasteboardExtent`; `CanvasArea.css.ts` — the
      stage is the dark pasteboard.
- [x] 1.3 `preview.ts` `#buildHtml(scene, broadcast, authoring)` — when `authoring`, lift `.cg-stage`
      overflow, keep the frame at (0,0) + outline, dark margin; a `device-width` viewport lets the
      iframe element's (changing) size drive the layout with no stretch. `channels/preview.ts` +
      `createDesignerBridge.ts` thread `authoring`; the canvas passes `authoring: true`.

## 2. Off-frame selection without on-frame regression

- [x] 2.1 The overlay pointer/hit-test layer covers the pasteboard (off-frame selectable/draggable);
      the frame stays at the surface origin so click→scene + on-frame hit-test are unchanged.
- [x] 2.2 Move the `canvas-surface` test hook to a FRAME-sized child so `canvas.boundingBox()` stays
      the frame — existing fraction-based tests (multi-select) are unaffected.

## 3. Tests

- [x] 3.1 Unit (`tests/pasteboard.test.ts`): `#buildHtml` `authoring:true` lifts the clip + is
      `device-width`; `authoring:false` (default) and the broadcast modal keep the clip;
      `pasteboardExtent` (empty→frame, off-frame grows right/bottom); `fitZoom` from the FRAME; the
      ruler scene→pixel mapping (scroll + zoom aware).
- [x] 3.2 E2E (`tests/e2e/pasteboard.spec.ts`): an off-frame shape is dropped from the broadcast
      preview + export but kept on the canvas, and the modal still blanks-until-play; the pasteboard
      lifts the clip so an off-frame shape renders + stays selected (gizmo tracks it), with on-frame
      drag unchanged; on open the frame is fit + CENTERED; the alignment guides span the full canvas.

## 4. Layout (fit + center, ruler, guides) — no regression

- [x] 4.1 `fitToViewport` fits the zoom from the FRAME bounds (not the extent), then
      `centerFrameInView` scrolls so the frame is CENTERED; project-open does the same.
- [x] 4.2 `rulerOrigin` places scene (0,0) at the frame top-left and tracks scroll + zoom.
- [x] 4.3 The alignment / snap guides render in `CanvasArea` over the scroll viewport (`inset:0`,
      `data-testid="snap-guides"`) so they span the FULL visible canvas, not the frame.

## 5. Docs

- [x] 5.1 Canvas README — the pasteboard (`pasteboardExtent` + `device-width` + centered fit +
      viewport-spanning guides) + the authoring-vs-broadcast clip model.
- [x] 5.2 PRD: keep D-071 `[~]` (Phase B in progress; flips to `[x]` when Phase B archives).

## 6. Gate

- [x] 6.1 Full green gate (turbo + unit) for `@cg/designer` + `@cg/shared-ipc` — 17/17 tasks
      (`--force`).
- [x] 6.2 `pnpm test:e2e` green — 66 passed (62 existing, no regression + 4 pasteboard specs).
- [x] 6.3 `pnpm openspec validate --all --strict` valid (24/24); `pnpm format:check` clean.
- [x] 6.4 Conventional commit on `feat/D-071b-pasteboard`; push + PR (NOT merged — manual layout
      re-test first).
