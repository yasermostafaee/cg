# Tasks — Preview blank until Play (D-087)

## 1. Seam — `broadcast` flag

- [x] 1.1 Add `broadcast: z.boolean().optional()` to `PreviewLoadChannel`'s request
      (`@cg/shared-ipc` `channels/preview.ts`).
- [x] 1.2 `createDesignerBridge.ts`: pass it through — `preview.load(req.scene, req.broadcast)`.

## 2. Preview document — blank until play

- [x] 2.1 `Preview.load(scene, broadcast = false)` → `#buildHtml(scene, broadcast)`.
- [x] 2.2 `#buildHtml`: emit the `.cg-pending` CSS override ONLY when `!broadcast`.
- [x] 2.3 `#buildHtml`: inject a `REVEAL_ON_LOAD` constant (`= !broadcast`) and gate the
      boot-time `document.body.classList.remove('cg-pending')` in `applyScene` behind it, so
      a broadcast document keeps the runtime's native `cg-pending` until `play()`.

## 3. Callers

- [x] 3.1 `PreviewModal.tsx`: `window.cg.preview.load({ scene, broadcast: true })`.
- [x] 3.2 `CanvasArea.tsx`: unchanged (omits the flag → authoring reveal).

## 4. Tests

- [x] 4.1 Unit (`apps/designer/tests/preview-blank-until-play.test.ts`):
      `Preview.load(scene, true).html` omits the `.cg-pending` override and sets
      `REVEAL_ON_LOAD = false`; the default `Preview.load(scene).html` keeps the override and
      `REVEAL_ON_LOAD = true`.
- [x] 4.2 New E2E (`preview-blank-until-play.spec.ts`): the modal opens blank
      (`body.cg-pending`, the element hidden), Play paints it (`body` loses `cg-pending`, the
      text is visible), Stop re-blanks (`body.cg-pending`).
- [x] 4.3 Update preview E2E that asserted modal stage content before Play to play first:
      critical-flow, ticker (test 1), repeater (test 2), regressions (D-025), sequence (test
      4). Sidebar/form, `toHaveCSS`, `toHaveText` assertions stay as-is.

## 5. Gate

- [x] 5.1 `@cg/shared-ipc` + `@cg/designer` green gate (format:check, typecheck, lint, test,
      build) — 17/17 turbo tasks green, 497 designer unit tests pass (test ran uncached after
      the new file invalidated cache).
- [x] 5.2 `pnpm test:e2e` green — 58 passed.
- [x] 5.3 `pnpm openspec validate preview-blank-until-play --strict` — valid.
- [x] 5.4 Conventional commit on `feat/D-087`. (Do not push.)
