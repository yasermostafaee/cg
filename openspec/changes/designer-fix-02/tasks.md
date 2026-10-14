# Tasks — `designer-fix-02`

## 1. Refuse what cannot work (FULL)

- [x] 1.1 `B-148` groupless duplicate box composition refused at export, both copies named; `look-carrier.test.ts`
      pin changed. `live-source-repeated`, read from `platesSharingASource`; separate plates on one source
      refused alike; each copy marked.
- [x] 1.2 `B-128` separator picker images only; a saved font / video separator repaired on open, told once.
      On-air behaviour measured first (Chrome 155: a broken-image icon with a grey border in every gap);
      the repair is outside undo and leaves the project unsaved.
- [x] 1.3 `B-106` repeater `maxItems` in the row editor and at play. Located: no render path leaks; one
      reading (`repeaterRowLimit`) for both clamps and the editor; Add withheld at the limit, rows past
      it flagged.
- [x] 1.4 `B-249` per-composition export writes no dangling `entryCompositionId` (omitted, not rewritten;
      `pageListsOf` pinned to "a miss is not found").

## 2. Text fit and nested playout (FULL)

- [x] 2.1 `B-147` interim: Auto Squeeze shown as unavailable, one short reason; saved values kept. A `Tag`
      fact (golden rule 13); the toggles requirement in `designer-inspector` no longer lists it.
- [x] 2.2 `B-099` probe reported; fixed if frozen. PROBED FROZEN (nested clock host `flex` at frame ~30,
      marker 60); the gate now reads the scope's own element map. The probe is the regression test.
- [x] 2.3 `B-030` a timed auto-out child no longer strands a content-driven parent. Reproduced red; a
      settled child ends its share of the wait (ablation reddens it again).

## 3. Sequences (FULL)

- [x] 3.1 `B-103` every sequence's first item enters with its transition (`0ea672fa`).
- [x] 3.2 `B-105` "Hide-show" → **Cut**, pinned (`sequence-presets.test.ts`); old label swept.

## 4. Live Source authoring (FULL)

- [x] 4.1 `B-187` automatic `live-N` name per look, marked **auto** until confirmed or renamed. Schema
      `routeKeyAuto`; `nextAutoSourceId`; the Inspector's "auto" `Tag` + keep control; the `B-183`
      requirement RENAMED + MODIFIED; the e2e that pinned an unassigned drawn plate updated.

## 5. FAST

- [x] 5.1 `B-138` a missing video shows the "missing" picture as its still frame (its poster; measured
      in Chromium by pixel; ablation reddens the e2e).
- [x] 5.2 `D-156` Alt bypasses snapping in move, nudge, resize, rotate. Shift removed as a bypass (not
      aliased); `designer-canvas-view` restated; the pending `aspect-lock-live-source` delta corrected.
- [x] 5.3 `R-040` + `R-037` `<composition> — item N` headings, stub on collision, `<bdi>`. FULL lane in the
      event (`@cg/shared-schema` + `TemplateInfo` + GDD), split from the FAST batch and said so.

## 6. Verification

- [x] 6.1 Full gate; push; a Linux `e2e` that RAN, cited here. Pre-push gate 99/99; pushed
      `016e1408..4b06c4fa`. **https://github.com/yasermostafaee/cg/actions/runs/38599224954** — `ci` and
      `e2e` both RAN on `4b06c4fa`, `success`, proved from the job log: Designer 312 passed, 1 flaky
      (`video-dimensions.spec.ts:188`, not touched here — `barAlpha` 0 on attempt 1, green on retry),
      13 skipped; CG Control 343 passed, 2 skipped. Every new or changed spec passed first time:
      `live-source.spec.ts` (B-148, B-187), `sequence-composition-item-fields.spec.ts` (R-037),
      `video-missing-still.spec.ts` (B-138).
