# Tasks — Editor pasteboard (D-071 Phase B)

## 1. Pasteboard surface + authoring clip

- [x] 1.1 `geometry.ts` `pasteboardPad(res)` — the right/bottom margin (scene px), one source of
      truth shared by the stage/iframe sizing and the preview authoring CSS.
- [x] 1.2 `CanvasArea.tsx` — stage + iframe sized to the frame + `pad` (right/bottom);
      `CanvasArea.css.ts` — the stage is the dark pasteboard.
- [x] 1.3 `preview.ts` `#buildHtml(scene, broadcast, authoring, pad)` — when `authoring`, lift
      `.cg-stage` overflow, keep the frame at (0,0) + outline, dark margin; widen the viewport by
      `pad`. `channels/preview.ts` + `createDesignerBridge.ts` thread `authoring` + `pad`; the
      canvas passes `authoring: true`.

## 2. Off-frame selection without on-frame regression

- [x] 2.1 The overlay pointer/hit-test layer covers the pasteboard (off-frame selectable/draggable);
      the frame stays at the surface origin so click→scene + on-frame hit-test are unchanged.
- [x] 2.2 Move the `canvas-surface` test hook to a FRAME-sized child so `canvas.boundingBox()` stays
      the frame — existing fraction-based tests (multi-select) are unaffected.

## 3. Tests

- [x] 3.1 Unit (`tests/pasteboard.test.ts`): `#buildHtml` `authoring:true` lifts the clip + widens
      the viewport; `authoring:false` (default) and the broadcast modal keep the clip; `pasteboardPad`.
- [x] 3.2 E2E (`tests/e2e/pasteboard.spec.ts`): an off-frame shape is dropped from the broadcast
      preview + export but kept on the canvas, and the modal still blanks-until-play; the pasteboard
      lifts the clip so an off-frame shape renders + stays selected (gizmo tracks it), with on-frame
      drag unchanged.

## 4. Docs

- [x] 4.1 Canvas README — the pasteboard + the authoring-vs-broadcast clip model.
- [x] 4.2 PRD: keep D-071 `[~]` (Phase B in progress; flips to `[x]` when Phase B archives).

## 5. Gate

- [x] 5.1 Full green gate (turbo + unit) for `@cg/designer` + `@cg/shared-ipc` — 17/17 tasks
      (`--force`); 512 unit tests pass (incl. the 4 new pasteboard tests).
- [x] 5.2 `pnpm test:e2e` green — 64 passed (62 existing, no regression + 2 new pasteboard specs).
- [x] 5.3 `pnpm openspec validate --all --strict` valid (24/24); `pnpm format:check` clean.
- [x] 5.4 Conventional commit on `feat/D-071b-pasteboard`; push + PR + watch CI + merge.
